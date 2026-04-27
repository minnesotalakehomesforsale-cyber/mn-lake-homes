const pool = require('../database/pool');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const emailService = require('../services/email');
const hubspot = require('../services/hubspot');
const { logActivity } = require('../services/activity-log');

const setAuthCookie = (res, token) => {
    res.cookie('auth_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 86400000 // 24 hours
    });
};

/**
 * POST /api/auth/waitlist
 * Creates an active client account with a real password and auto-logs in.
 * Rejects duplicates by email OR phone.
 */
const waitlist = async (req, res) => {
    let { first_name, last_name, email, phone, password } = req.body || {};

    first_name = (first_name || '').trim();
    last_name  = (last_name  || '').trim();
    email      = (email      || '').trim().toLowerCase();
    phone      = (phone      || '').trim();
    password   = password || '';

    if (!first_name || !last_name || !email || !phone || !password) {
        return res.status(400).json({ error: 'First name, last name, email, phone, and password are all required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
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

        const passwordHash = await bcrypt.hash(password, 10);

        const userRes = await pool.query(
            `INSERT INTO users (first_name, last_name, full_name, email, phone, password_hash, role, account_status)
             VALUES ($1, $2, $3, $4, $5, $6, 'client', 'active')
             RETURNING id`,
            [first_name, last_name, `${first_name} ${last_name}`, email, phone, passwordHash]
        );
        const userId = userRes.rows[0].id;

        // Auto-login: issue JWT cookie so they land in their dashboard
        const token = jwt.sign({ userId, role: 'client' }, process.env.JWT_SECRET, { expiresIn: '24h' });
        setAuthCookie(res, token);

        // Fire-and-forget welcome email (doesn't block the response)
        try { emailService.sendWelcome({ email, first_name, full_name: `${first_name} ${last_name}` }); } catch (_) {}

        // Fire-and-forget HubSpot mirror — store the returned id so admins
        // can deep-link to the contact's HubSpot timeline later.
        (async () => {
            const r = await hubspot.syncContact({
                email, firstname: first_name, lastname: last_name, phone,
                user_type: 'client', signup_source: 'waitlist',
            });
            if (r?.id) {
                pool.query(`UPDATE users SET hs_contact_id = $1 WHERE id = $2`, [r.id, userId])
                    .catch(e => console.error('[hubspot] save id failed:', e.message));
            }
        })();

        logActivity({
            event_type: 'client.signup',
            event_scope: 'auth',
            actor: { type: 'client', id: userId, label: `${first_name} ${last_name}` },
            target: { type: 'user', id: userId, label: `${first_name} ${last_name}` },
            details: { email, phone },
            req,
        });

        res.status(201).json({ success: true, role: 'client', display_name: `${first_name} ${last_name}` });
    } catch (err) {
        console.error('[client signup]', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'An account with that email already exists.' });
        }
        res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
    }
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
                 SELECT uid::uuid, tid::uuid FROM (VALUES ${values}) AS v(uid, tid)
                 WHERE EXISTS (SELECT 1 FROM tags WHERE id = v.tid::uuid AND active = TRUE)
                 ON CONFLICT (user_id, tag_id) DO NOTHING`,
                [userId, ...tagIds]
            );
        }

        await client.query('COMMIT');

        const token = jwt.sign({ userId, role: 'agent' }, process.env.JWT_SECRET, { expiresIn: '24h' });
        setAuthCookie(res, token);

        // Fire-and-forget agent welcome email
        try { emailService.sendAgentWelcome({ email, display_name }); } catch (_) {}

        // Fire-and-forget HubSpot mirror for the new agent.
        (async () => {
            const r = await hubspot.syncContact({
                email,
                firstname: display_name.split(' ')[0],
                lastname:  display_name.split(' ').slice(1).join(' '),
                user_type: 'agent', signup_source: 'agent_register',
                company:   brokerage_name || undefined,
            });
            if (r?.id) {
                pool.query(`UPDATE users SET hs_contact_id = $1 WHERE id = $2`, [r.id, userId])
                    .catch(e => console.error('[hubspot] save id failed:', e.message));
            }
        })();

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
        setAuthCookie(res, token);

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

/**
 * GET /api/auth/me
 * Returns the full profile (first_name, last_name, email, phone) for the signed-in user.
 * Used by the client dashboard to prefill the account-settings form.
 */
const me = async (req, res) => {
    if (!req.user?.userId) return res.status(401).json({ error: 'Not authenticated.' });
    try {
        const r = await pool.query(
            `SELECT id, first_name, last_name, full_name, email, phone, role, account_status
               FROM users WHERE id = $1`,
            [req.user.userId]
        );
        if (!r.rows.length) return res.status(401).json({ error: 'Session user not found.' });
        res.json(r.rows[0]);
    } catch (err) {
        console.error('[me]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
};

/**
 * PATCH /api/auth/profile
 * Updates the signed-in user's first/last name, email, or phone.
 * Any omitted field is left alone. Rejects duplicate email/phone.
 */
const updateProfile = async (req, res) => {
    if (!req.user?.userId) return res.status(401).json({ error: 'Not authenticated.' });

    let { first_name, last_name, email, phone } = req.body || {};
    const patch = {};
    if (typeof first_name === 'string') patch.first_name = first_name.trim();
    if (typeof last_name  === 'string') patch.last_name  = last_name.trim();
    if (typeof email      === 'string') patch.email      = email.trim().toLowerCase();
    if (typeof phone      === 'string') patch.phone      = phone.trim();

    if (patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (patch.phone) {
        const digits = patch.phone.replace(/\D/g, '');
        if (digits.length < 10) return res.status(400).json({ error: 'Please enter a valid phone number.' });
    }

    try {
        if (patch.email || patch.phone) {
            const digits = patch.phone ? patch.phone.replace(/\D/g, '') : null;
            const dup = await pool.query(
                `SELECT id FROM users
                  WHERE id <> $1
                    AND ( ($2::text IS NOT NULL AND LOWER(email) = $2)
                       OR ($3::text IS NOT NULL AND REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') = $3) )
                  LIMIT 1`,
                [req.user.userId, patch.email || null, digits]
            );
            if (dup.rows.length) return res.status(409).json({ error: 'That email or phone is already in use.' });
        }

        const sets = [];
        const vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(patch)) {
            sets.push(`${k} = $${i++}`);
            vals.push(v);
        }
        if (patch.first_name !== undefined || patch.last_name !== undefined) {
            sets.push(`full_name = TRIM(COALESCE($${i++}, first_name) || ' ' || COALESCE($${i++}, last_name))`);
            vals.push(patch.first_name ?? null, patch.last_name ?? null);
        }
        if (!sets.length) return res.json({ success: true, unchanged: true });
        vals.push(req.user.userId);
        await pool.query(`UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i}`, vals);

        // Fire-and-forget HubSpot sync. If we already have an hs_contact_id,
        // patch by id; otherwise upsert by email so we don't lose the link.
        (async () => {
            const u = await pool.query(
                `SELECT email, first_name, last_name, phone, role, hs_contact_id FROM users WHERE id = $1`,
                [req.user.userId]
            );
            const row = u.rows[0];
            if (!row?.email) return;
            const props = {
                email: row.email, firstname: row.first_name, lastname: row.last_name,
                phone: row.phone, user_type: row.role || undefined,
            };
            if (row.hs_contact_id) {
                hubspot.updateContact(row.hs_contact_id, props);
            } else {
                const r = await hubspot.syncContact(props);
                if (r?.id) {
                    pool.query(`UPDATE users SET hs_contact_id = $1 WHERE id = $2`, [r.id, req.user.userId])
                        .catch(e => console.error('[hubspot] save id failed:', e.message));
                }
            }
        })();

        logActivity({
            event_type: 'user.profile.update',
            event_scope: 'auth',
            actor: { type: req.user.role || 'user', id: req.user.userId },
            details: { fields: Object.keys(patch) },
            req,
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[updateProfile]', err.message);
        res.status(500).json({ error: 'Could not update your profile.' });
    }
};

/**
 * POST /api/auth/password
 * Changes the signed-in user's password. Requires current_password match.
 */
const changePassword = async (req, res) => {
    if (!req.user?.userId) return res.status(401).json({ error: 'Not authenticated.' });
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Current and new password are both required.' });
    }
    if (new_password.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    try {
        const r = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.userId]);
        if (!r.rows.length) return res.status(401).json({ error: 'Session user not found.' });

        const ok = await bcrypt.compare(current_password, r.rows[0].password_hash);
        if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

        const newHash = await bcrypt.hash(new_password, 10);
        await pool.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [newHash, req.user.userId]);

        logActivity({
            event_type: 'user.password.change',
            event_scope: 'auth',
            actor: { type: req.user.role || 'user', id: req.user.userId },
            req,
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[changePassword]', err.message);
        res.status(500).json({ error: 'Could not change your password.' });
    }
};

module.exports = { register, login, logout, session, waitlist, me, updateProfile, changePassword };
