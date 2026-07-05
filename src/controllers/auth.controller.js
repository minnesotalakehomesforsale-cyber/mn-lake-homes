const pool = require('../database/pool');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const emailService = require('../services/email');
const hubspot = require('../services/hubspot');
const phoneSvc = require('../services/phone');
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

    // Normalize phone to dedup-safe digit form (strips +1 / formatting /
    // country-code variation). The raw `phone` stays as the user typed
    // it for display; `phone_normalized` is what we compare on.
    const phoneNorm = phoneSvc.normalize(phone);
    if (!phoneSvc.isValid(phone)) {
        return res.status(400).json({ error: 'Please enter a valid phone number.' });
    }

    try {
        const dup = await pool.query(
            `SELECT email, phone, phone_normalized FROM users
              WHERE LOWER(email) = $1
                 OR (phone_normalized IS NOT NULL AND phone_normalized = $2)
              LIMIT 1`,
            [email, phoneNorm]
        );
        if (dup.rows.length > 0) {
            const existing = dup.rows[0];
            const hitEmail = existing.email && existing.email.toLowerCase() === email;
            return res.status(409).json({
                error: hitEmail
                    ? 'An account with that email already exists. Log in or reset your password.'
                    : 'That phone number is already in use.'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const userRes = await pool.query(
            `INSERT INTO users (first_name, last_name, full_name, email, phone, phone_normalized, password_hash, role, account_status, password_changed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'client', 'active', NOW())
             RETURNING id`,
            [first_name, last_name, `${first_name} ${last_name}`, email, phone, phoneNorm, passwordHash]
        );
        const userId = userRes.rows[0].id;

        // Backfill: claim every lead previously submitted with this email
        // while there was no account. Those become visible on the new
        // dashboard immediately. Fire-and-forget — never block signup.
        pool.query(
            `UPDATE leads SET user_id = $1, updated_at = NOW()
              WHERE LOWER(email) = $2 AND user_id IS NULL`,
            [userId, email]
        ).then(r => {
            if (r.rowCount) console.log(`[signup] linked ${r.rowCount} prior lead(s) to ${email}`);
        }).catch(e => console.error('[signup] lead backfill failed:', e.message));

        // Auto-login: issue JWT cookie so they land in their dashboard
        const pwd_iat = Math.floor(Date.now() / 1000);
        const token = jwt.sign({ userId, role: 'client', pwd_iat }, process.env.JWT_SECRET, { expiresIn: '24h' });
        setAuthCookie(res, token);

        // Fire-and-forget welcome email (doesn't block the response)
        try { emailService.sendWelcome({ email, first_name, full_name: `${first_name} ${last_name}` }); } catch (_) {}

        // Fire-and-forget HubSpot mirror — store the returned id so admins
        // can deep-link to the contact's HubSpot timeline later.
        (async () => {
            const r = await hubspot.syncContact({
                email, firstname: first_name, lastname: last_name, phone,
                lifecyclestage: 'lead',
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
    let { email, password, display_name, phone, license_number, brokerage_name, service_area_tag_ids, ref } = req.body;
    const refCode = (ref || '').toString().trim().toUpperCase().slice(0, 16) || null;

    email = (email || '').trim().toLowerCase();
    display_name = (display_name || '').trim();
    password = (password || '');
    phone = (phone || '').trim();

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

    const phoneNorm = phoneSvc.normalize(phone);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Case-insensitive email check + phone dedup (case-insensitive
        // already since email is pre-lowercased; phone uses the
        // normalized column).
        const dup = await client.query(
            `SELECT email FROM users
              WHERE LOWER(email) = $1
                 OR (phone_normalized IS NOT NULL AND $2::text IS NOT NULL AND phone_normalized = $2)
              LIMIT 1`,
            [email, phoneNorm]
        );
        if (dup.rows.length > 0) {
            const hitEmail = dup.rows[0].email && dup.rows[0].email.toLowerCase() === email;
            throw new Error(hitEmail
                ? 'An account with that email already exists. Log in or reset your password.'
                : 'That phone number is already in use.');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create User record
        const userRes = await client.query(
            `INSERT INTO users (first_name, last_name, full_name, email, phone, phone_normalized, password_hash, role, account_status, password_changed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'agent', 'active', NOW()) RETURNING id`,
            [
                display_name.split(' ')[0],
                display_name.split(' ').slice(1).join(' ') || '',
                display_name,
                email,
                phone || null,
                phoneNorm,
                hashedPassword
            ]
        );
        const userId = userRes.rows[0].id;

        // New agents start on the FREE tier — a public profile, but no leads,
        // no featured placement, and no listings until they upgrade.
        const memRes = await client.query(`SELECT id FROM memberships WHERE code = 'free' LIMIT 1`);
        const startingMembershipId = memRes.rows[0]?.id;

        // Create Agent record. Seed phone_public + email_public from the
        // account fields so the public profile doesn't start with empty
        // contact info — the agent's join.html form already collected
        // phone, and email is always set. They can override either on
        // the dashboard if they want a different number publicly listed.
        const slugStr = display_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
        // Assign this agent their own referral code up front (deterministic from
        // the new user id so it's stable). refCode is the code they SIGNED UP under.
        const myRefCode = 'REF' + require('crypto').createHash('md5').update(userId + 'mlh-ref').digest('hex').slice(0, 6).toUpperCase();
        const agentRes = await client.query(
            `INSERT INTO agents (user_id, membership_id, slug, display_name, license_number, brokerage_name, phone_public, email_public, profile_status, is_published, referral_code, referred_by_code)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', false, $9, $10) RETURNING id`,
            [userId, startingMembershipId, slugStr, display_name, license_number || null, brokerage_name || null, phone || null, email || null, myRefCode, refCode]
        );
        const newAgentId = agentRes.rows[0].id;

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

        // Record the referral (post-commit, fire-and-forget so a hiccup here can
        // never fail the signup) if they came in on a valid, different agent's code.
        if (refCode) {
            pool.query(
                `INSERT INTO agent_referrals (referrer_agent_id, referred_agent_id, referred_email, code, status)
                 SELECT a.id, $2, $3, $1, 'signed_up' FROM agents a
                  WHERE a.referral_code = $1 AND a.id <> $2
                 ON CONFLICT (referred_agent_id) WHERE referred_agent_id IS NOT NULL DO NOTHING`,
                [refCode, newAgentId, email]
            ).then(r => { if (r.rowCount) console.log(`[register] referral recorded via ${refCode}`); })
             .catch(e => console.error('[register] referral record failed:', e.message));
        }

        // Backfill: claim any leads previously submitted with this email
        // before the account existed. Fire-and-forget on the pool (the
        // transaction is already committed).
        pool.query(
            `UPDATE leads SET user_id = $1, updated_at = NOW()
              WHERE LOWER(email) = $2 AND user_id IS NULL`,
            [userId, email]
        ).then(r => {
            if (r.rowCount) console.log(`[register] linked ${r.rowCount} prior lead(s) to ${email}`);
        }).catch(e => console.error('[register] lead backfill failed:', e.message));

        const pwd_iat = Math.floor(Date.now() / 1000);
        const token = jwt.sign({ userId, role: 'agent', pwd_iat }, process.env.JWT_SECRET, { expiresIn: '24h' });
        setAuthCookie(res, token);

        // Fire-and-forget agent welcome email + admin notification
        try { emailService.sendAgentWelcome({ email, display_name }); } catch (_) {}
        try {
            emailService.sendAgentAdminNotification({
                display_name,
                email,
                phone:          phone || null,
                brokerage_name: brokerage_name || null,
                license_number: license_number || null,
            });
        } catch (_) {}

        // Fire-and-forget HubSpot mirror for the new agent.
        (async () => {
            const r = await hubspot.syncContact({
                email,
                firstname: display_name.split(' ')[0],
                lastname:  display_name.split(' ').slice(1).join(' '),
                phone:     phone || undefined,
                lifecyclestage: 'lead',
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
                    EXTRACT(EPOCH FROM u.password_changed_at)::bigint AS pwd_iat,
                    a.display_name, a.slug
             FROM users u
             LEFT JOIN agents a ON a.user_id = u.id
             WHERE LOWER(u.email) = $1`,
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

        const token = jwt.sign(
            { userId: user.id, role: user.role, pwd_iat: user.pwd_iat || null },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
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
                    u.admin_tab_permissions,
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

        // allowed_tabs: null means full access (super_admin always; admin
        // when no specific permissions have been set). An array means
        // restricted — the sidebar filters its NAV to those keys.
        let allowed_tabs = null;
        if (user.role === 'admin' && Array.isArray(user.admin_tab_permissions)) {
            allowed_tabs = user.admin_tab_permissions;
        }

        res.json({
            userId: user.id,
            role: user.role,
            display_name: user.display_name || user.full_name,
            email: user.email,
            slug: user.slug || null,
            allowed_tabs,
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
    if (patch.phone && !phoneSvc.isValid(patch.phone)) {
        return res.status(400).json({ error: 'Please enter a valid phone number.' });
    }
    if (patch.phone) patch.phone_normalized = phoneSvc.normalize(patch.phone);

    try {
        if (patch.email || patch.phone_normalized) {
            const dup = await pool.query(
                `SELECT id FROM users
                  WHERE id <> $1
                    AND ( ($2::text IS NOT NULL AND LOWER(email) = $2)
                       OR ($3::text IS NOT NULL AND phone_normalized = $3) )
                  LIMIT 1`,
                [req.user.userId, patch.email || null, patch.phone_normalized || null]
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
        // Stamp password_changed_at = NOW() so every JWT issued before
        // this moment is rejected by verifyToken on its next call.
        await pool.query(
            `UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2`,
            [newHash, req.user.userId]
        );

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

// ─── Password reset ────────────────────────────────────────────────────────
// Two endpoints, anti-enumeration baked in:
//
//   POST /api/auth/forgot-password    public; always returns the same
//                                     "check your email" response so an
//                                     attacker can't learn which emails
//                                     are registered. Side effect (if
//                                     the email matches a user): generate
//                                     a random token, save SHA-256(token)
//                                     to password_reset_tokens, and email
//                                     the user a reset URL with the raw
//                                     token. Rate-limited per email +
//                                     per IP via the same table.
//
//   POST /api/auth/reset-password     public; takes { token, new_password }.
//                                     Validates token (single-use, not
//                                     expired), updates password_hash +
//                                     password_changed_at (invalidating
//                                     every prior session), marks the
//                                     token used_at.
//
// Tokens live 1 hour. We store SHA-256(token), not the raw token, so a
// DB leak doesn't expose live reset links. Anti-enumeration matters
// because forgot-password is the easiest way to enumerate accounts on
// most real-estate platforms — "unknown email" responses leak data.

const RESET_TOKEN_TTL_MIN     = 60;    // 1 hour
const RESET_MAX_PER_EMAIL_1HR = 5;     // throttle per account
const RESET_MAX_PER_IP_1HR    = 15;    // throttle per IP (abuse defense)

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

const forgotPassword = async (req, res) => {
    let { email } = req.body || {};
    email = (email || '').trim().toLowerCase();

    // The response is intentionally identical for "unknown email" and
    // "email sent" — so we always return 200 with the same body.
    const genericResp = { success: true, message: "If that email is on file, we've sent a reset link." };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.json(genericResp);
    }

    const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();

    try {
        // Per-IP throttle (counts attempts to ANY email from this IP in the
        // last hour). Defends against enumeration sweeps.
        if (ip) {
            const ipR = await pool.query(
                `SELECT COUNT(*)::int AS c FROM password_reset_tokens
                  WHERE ip = $1 AND created_at >= NOW() - INTERVAL '1 hour'`,
                [ip]
            );
            if ((ipR.rows[0]?.c || 0) >= RESET_MAX_PER_IP_1HR) {
                // Still 200 + generic body — don't tell the attacker
                // they're being throttled.
                return res.json(genericResp);
            }
        }

        // Find the user. If no match, fall through and respond generically
        // — don't reveal whether the email exists.
        const u = await pool.query(
            `SELECT id, email, first_name FROM users
              WHERE LOWER(email) = $1 AND deleted_at IS NULL AND account_status <> 'suspended'
              LIMIT 1`,
            [email]
        );
        if (!u.rows.length) return res.json(genericResp);
        const user = u.rows[0];

        // Per-email throttle — max N active tokens in the last hour.
        const emR = await pool.query(
            `SELECT COUNT(*)::int AS c FROM password_reset_tokens
              WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'`,
            [user.id]
        );
        if ((emR.rows[0]?.c || 0) >= RESET_MAX_PER_EMAIL_1HR) {
            return res.json(genericResp);
        }

        // Mint a 32-byte URL-safe token. Store only the SHA-256 hash.
        const rawToken = crypto.randomBytes(32).toString('base64url');
        const tokenHash = sha256(rawToken);
        await pool.query(
            `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip, ua)
             VALUES ($1, $2, NOW() + INTERVAL '${RESET_TOKEN_TTL_MIN} minutes', $3, $4)`,
            [user.id, tokenHash, ip || null, (req.headers['user-agent'] || '').slice(0, 500)]
        );

        const siteBase = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
        const resetUrl = `${siteBase}/pages/public/reset-password.html?token=${encodeURIComponent(rawToken)}`;

        // Fire-and-forget email. Always returns the generic response even
        // if the email queue glitches — we don't want network errors to
        // be a side-channel.
        try {
            emailService.sendPasswordReset({
                to: user.email,
                first_name: user.first_name,
                resetUrl,
                expiresInMin: RESET_TOKEN_TTL_MIN,
            });
        } catch (e) {
            console.error('[forgot-password] email failed:', e.message);
        }

        logActivity({
            event_type: 'auth.password.reset.requested',
            event_scope: 'auth',
            actor: { type: 'user', id: user.id, label: user.email },
            req,
        });

        res.json(genericResp);
    } catch (err) {
        console.error('[forgot-password]', err.message);
        // Still return the generic response on errors to keep the
        // anti-enumeration guarantee.
        res.json(genericResp);
    }
};

const resetPassword = async (req, res) => {
    const { token, new_password } = req.body || {};
    if (!token || !new_password) {
        return res.status(400).json({ error: 'Token and new password are required.' });
    }
    if (String(new_password).length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const tokenHash = sha256(String(token));
    try {
        // Look up the token. Must be unused and unexpired.
        const r = await pool.query(
            `SELECT t.id, t.user_id, t.used_at, t.expires_at, u.email
               FROM password_reset_tokens t
               JOIN users u ON u.id = t.user_id
              WHERE t.token_hash = $1
              LIMIT 1`,
            [tokenHash]
        );
        if (!r.rows.length) {
            return res.status(400).json({ error: 'This reset link is invalid or has already been used.' });
        }
        const row = r.rows[0];
        if (row.used_at) {
            return res.status(400).json({ error: 'This reset link has already been used. Request a new one.' });
        }
        if (new Date(row.expires_at) < new Date()) {
            return res.status(400).json({ error: 'This reset link has expired. Request a new one.' });
        }

        const newHash = await bcrypt.hash(new_password, 10);

        // Transaction: update password + mark token used in one shot, so
        // a token can't be reused if the password update fails.
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2`,
                [newHash, row.user_id]
            );
            await client.query(
                `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
                [row.id]
            );
            // Belt + suspenders: invalidate every OTHER unused token for
            // this user so a leaked second link can't be used.
            await client.query(
                `UPDATE password_reset_tokens SET used_at = NOW()
                  WHERE user_id = $1 AND used_at IS NULL AND id <> $2`,
                [row.user_id, row.id]
            );
            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK').catch(() => {});
            throw txErr;
        } finally {
            client.release();
        }

        logActivity({
            event_type: 'auth.password.reset.completed',
            event_scope: 'auth',
            actor: { type: 'user', id: row.user_id, label: row.email },
            req,
        });

        res.json({ success: true, message: 'Password updated. You can now log in.' });
    } catch (err) {
        console.error('[reset-password]', err.message);
        res.status(500).json({ error: 'Could not reset your password. Please try again.' });
    }
};

module.exports = { register, login, logout, session, waitlist, me, updateProfile, changePassword, forgotPassword, resetPassword };
