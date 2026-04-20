const pool = require('../database/pool');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const email = require('../services/email');
const { logActivity } = require('../services/activity-log');

/**
 * POST /api/auth/waitlist
 * Public-facing "create account" endpoint for the beta waitlist.
 * Creates a non-loggable draft user (role: 'client', status: 'pending').
 * Rejects duplicates by email OR phone.
 */
const waitlist = async (req, res) => {
    let { first_name, last_name, email, phone } = req.body || {};

    first_name = (first_name || '').trim();
    last_name  = (last_name  || '').trim();
    email      = (email      || '').trim().toLowerCase();
    phone      = (phone      || '').trim();

    if (!first_name || !last_name || !email || !phone) {
        return res.status(400).json({ error: 'First name, last name, email, and phone are all required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
        return res.status(400).json({ error: 'Please enter a valid phone number.' });
    }

    try {
        const dup = await pool.query(
            `SELECT email, phone FROM users
              WHERE LOWER(email) = $1
                 OR REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') = $2
              LIMIT 1`,
            [email, digits]
        );
        if (dup.rows.length > 0) {
            const existing = dup.rows[0];
            const hitEmail = existing.email && existing.email.toLowerCase() === email;
            return res.status(409).json({
                error: hitEmail
                    ? 'An account with that email already exists.'
                    : 'An account with that phone number already exists.'
            });
        }

        // Unusable password hash — waitlist accounts cannot sign in during beta.
        const unusable = await bcrypt.hash(`waitlist:${Date.now()}:${Math.random()}`, 10);

        await pool.query(
            `INSERT INTO users (first_name, last_name, full_name, email, phone, password_hash, role, account_status)
             VALUES ($1, $2, $3, $4, $5, $6, 'client', 'pending')`,
            [first_name, last_name, `${first_name} ${last_name}`, email, phone, unusable]
        );

        // Fire-and-forget welcome email
        email.sendWelcome({ email, first_name, full_name: `${first_name} ${last_name}` });

        logActivity({
            event_type: 'waitlist.signup',
            event_scope: 'auth',
            actor: { type: 'public', label: email },
            target: { type: 'user', label: `${first_name} ${last_name}` },
            details: { email, phone },
            req,
        });

        res.status(201).json({ success: true });
    } catch (err) {
        console.error('[waitlist]', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'An account with that email already exists.' });
        }
        res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
    }
};

const setCookie = (res, token) => {
    res.cookie('auth_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 86400000 // 24 hours
    });
};

/**
 * POST /api/auth/register
 * Creates a new user + linked agent record.
 */
const register = async (req, res) => {
    let { email, password, display_name, license_number, brokerage_name, service_area_tag_ids } = req.body;

    email = (email || '').trim().toLowerCase();
    display_name = (display_name || '').trim();
    password = (password || '');

    if (!email || !password || !display_name) {
        return res.status(400).json({ error: 'Email, password, and display name are required.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format.' });
    }

    // Normalize incoming service-area tag ids: array of UUIDs, capped by
    // the admin-tunable app_config.signup_max_service_areas (default 10).
    // Admins editing an agent from pages/admin/agent-review.html go
    // through /api/tags/users/:userId which has no cap.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let signupCap = 10;
    try {
        const capRes = await pool.query(
            `SELECT value FROM app_config WHERE key = 'signup_max_service_areas'`
        );
        const n = Number(capRes.rows[0]?.value);
        if (Number.isFinite(n) && n > 0) signupCap = Math.floor(n);
    } catch (_) { /* keep default */ }
    const tagIds = Array.isArray(service_area_tag_ids)
        ? service_area_tag_ids.filter(id => typeof id === 'string' && UUID_RE.test(id)).slice(0, signupCap)
        : [];

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userExists = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) throw new Error('An account with that email already exists.');

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create User record
        const userRes = await client.query(
            `INSERT INTO users (first_name, last_name, full_name, email, password_hash, role, account_status)
             VALUES ($1, $2, $3, $4, $5, 'agent', 'active') RETURNING id`,
            [
                display_name.split(' ')[0],
                display_name.split(' ').slice(1).join(' ') || '',
                display_name,
                email,
                hashedPassword
            ]
        );
        const userId = userRes.rows[0].id;

        // Resolve basic membership
        const memRes = await client.query(`SELECT id FROM memberships WHERE code = 'basic' LIMIT 1`);
        const basicId = memRes.rows[0]?.id;

        // Create Agent record
        const slugStr = display_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
        await client.query(
            `INSERT INTO agents (user_id, membership_id, slug, display_name, license_number, brokerage_name, profile_status, is_published)
             VALUES ($1, $2, $3, $4, $5, $6, 'draft', false)`,
            [userId, basicId, slugStr, display_name, license_number || null, brokerage_name || null]
        );

        // Attach initial service-area tags. Silently skips any id that
        // doesn't match an active tag in the catalog.
        if (tagIds.length) {
            const values = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
            await client.query(
                `INSERT INTO user_tags (user_id, tag_id)
                 SELECT uid, tid FROM (VALUES ${values}) AS v(uid, tid)
                 WHERE EXISTS (SELECT 1 FROM tags WHERE id = v.tid::uuid AND active = TRUE)
                 ON CONFLICT (user_id, tag_id) DO NOTHING`,
                [userId, ...tagIds]
            );
        }

        await client.query('COMMIT');

        const token = jwt.sign({ userId, role: 'agent' }, process.env.JWT_SECRET, { expiresIn: '24h' });
        setCookie(res, token);

        // Fire-and-forget agent welcome email
        email.sendAgentWelcome({ email, display_name });

        logActivity({
            event_type: 'agent.register',
            event_scope: 'agent',
            actor: { type: 'agent', id: userId, label: display_name },
            target: { type: 'agent', id: userId, label: display_name },
            details: { email, brokerage_name, license_number },
            req,
        });

        res.status(201).json({ success: true, role: 'agent', display_name });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[register]', err.message);
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
};

/**
 * POST /api/auth/login
 * Authenticates a user, issues HttpOnly JWT cookie.
 * Returns role, display_name, and email so the frontend can build the header.
 */
const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const userRes = await pool.query(
            `SELECT u.id, u.password_hash, u.role, u.account_status, u.full_name, u.email,
                    a.display_name, a.slug
             FROM users u
             LEFT JOIN agents a ON a.user_id = u.id
             WHERE u.email = $1`,
            [email.trim().toLowerCase()]
        );

        if (userRes.rows.length === 0) {
            logActivity({
                event_type: 'auth.login.failed',
                event_scope: 'auth',
                severity: 'warning',
                actor: { type: 'public', label: email.trim().toLowerCase() },
                details: { reason: 'unknown_email' },
                req,
            });
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = userRes.rows[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            logActivity({
                event_type: 'auth.login.failed',
                event_scope: 'auth',
                severity: 'warning',
                actor: { type: user.role, id: user.id, label: user.full_name || user.email },
                details: { reason: 'bad_password' },
                req,
            });
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        if (user.account_status === 'suspended') {
            logActivity({
                event_type: 'auth.login.blocked',
                event_scope: 'auth',
                severity: 'warning',
                actor: { type: user.role, id: user.id, label: user.full_name || user.email },
                details: { reason: 'suspended' },
                req,
            });
            return res.status(403).json({ error: 'This account has been suspended. Contact support.' });
        }

        if (user.account_status !== 'active') {
            return res.status(403).json({ error: 'Account is not active. Contact support.' });
        }

        // Update last_login_at
        await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

        const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
        setCookie(res, token);

        logActivity({
            event_type: 'auth.login',
            event_scope: 'auth',
            actor: { type: user.role, id: user.id, label: user.display_name || user.full_name || user.email },
            details: { role: user.role },
            req,
        });

        res.json({
            success: true,
            role: user.role,
            display_name: user.display_name || user.full_name,
            email: user.email,
            slug: user.slug || null
        });

    } catch (err) {
        console.error('[login]', err.message);
        res.status(500).json({ error: 'Server error during authentication.' });
    }
};

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
const logout = (req, res) => {
    if (req.user?.userId) {
        logActivity({
            event_type: 'auth.logout',
            event_scope: 'auth',
            actor: { type: req.user.role || 'user', id: req.user.userId },
            req,
        });
    }
    res.clearCookie('auth_session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.json({ success: true });
};

/**
 * GET /api/auth/session
 * Returns current session info if authenticated. Used by frontend for auth-aware UI.
 */
const session = async (req, res) => {
    try {
        const userRes = await pool.query(
            `SELECT u.id, u.role, u.full_name, u.email, u.account_status,
                    a.display_name, a.slug
             FROM users u
             LEFT JOIN agents a ON a.user_id = u.id
             WHERE u.id = $1`,
            [req.user.userId]
        );

        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: 'Session user not found.' });
        }

        const user = userRes.rows[0];

        if (user.account_status === 'suspended') {
            return res.status(403).json({ error: 'Account suspended.' });
        }

        res.json({
            userId: user.id,
            role: user.role,
            display_name: user.display_name || user.full_name,
            email: user.email,
            slug: user.slug || null
        });
    } catch (err) {
        console.error('[session]', err.message);
        res.status(500).json({ error: 'Server error fetching session.' });
    }
};

module.exports = { register, login, logout, session, waitlist };
