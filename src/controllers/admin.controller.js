const pool = require('../database/pool');
const bcrypt = require('bcrypt');
const { logActivity } = require('../services/activity-log');

/**
 * GET /api/admin
 * Returns all agents with user + membership data.
 * Supports query params: ?search=, ?status=, ?membership=, ?published=
 */
const getLedger = async (req, res) => {
    try {
        const { search, status, membership, published } = req.query;

        let conditions = [];
        let values = [];
        let i = 1;

        if (search) {
            conditions.push(`(a.display_name ILIKE $${i} OR u.email ILIKE $${i} OR a.brokerage_name ILIKE $${i})`);
            values.push(`%${search}%`);
            i++;
        }
        if (status && status !== 'all') {
            conditions.push(`a.profile_status = $${i}`);
            values.push(status);
            i++;
        }
        if (membership && membership !== 'all') {
            conditions.push(`m.code = $${i}`);
            values.push(membership);
            i++;
        }
        if (published !== undefined && published !== 'all') {
            conditions.push(`a.is_published = $${i}`);
            values.push(published === 'true');
            i++;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT a.*,
                   u.id as user_id_ref, u.email, u.full_name, u.first_name, u.last_name,
                   u.phone as user_phone, u.role as user_role, u.account_status as user_status,
                   u.created_at as user_created_at, u.last_login_at,
                   m.name as membership_name, m.code as membership_code, m.display_badge_label as membership_badge
            FROM agents a
            JOIN users u ON a.user_id = u.id
            JOIN memberships m ON a.membership_id = m.id
            ${where}
            ORDER BY a.created_at DESC
        `;

        const { rows } = await pool.query(query, values);
        res.json(rows);
    } catch (err) {
        console.error('[getLedger]', err.message);
        res.status(500).json({ error: 'Failed to fetch agent ledger.' });
    }
};

/**
 * GET /api/admin/:id
 * Returns full agent + user + membership record for admin detail view.
 */
const getAgentDetail = async (req, res) => {
    try {
        const query = `
            SELECT a.*,
                   u.id as user_id_ref, u.email, u.full_name, u.first_name, u.last_name,
                   u.phone as user_phone, u.role as user_role, u.account_status as user_status,
                   u.created_at as user_created_at, u.last_login_at,
                   m.name as membership_name, m.code as membership_code, m.display_badge_label as membership_badge
            FROM agents a
            JOIN users u ON a.user_id = u.id
            JOIN memberships m ON a.membership_id = m.id
            WHERE a.id = $1
        `;
        const { rows } = await pool.query(query, [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Agent not found.' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[getAgentDetail]', err.message);
        res.status(500).json({ error: 'Failed to fetch agent detail.' });
    }
};

/**
 * POST /api/admin
 * Admin creates a new user + agent record manually.
 */
const createAgent = async (req, res) => {
    let { first_name, last_name, email, password, brokerage_name, license_number, membership_code, profile_status, is_published } = req.body;

    email = (email || '').trim().toLowerCase();
    first_name = (first_name || '').trim();
    last_name = (last_name || '').trim();
    const display_name = `${first_name} ${last_name}`.trim();

    if (!email || !password || !first_name) {
        return res.status(400).json({ error: 'First name, email, and password are required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) throw new Error('An account with that email already exists.');

        const hashedPassword = await bcrypt.hash(password, 10);

        const userRes = await client.query(
            `INSERT INTO users (first_name, last_name, full_name, email, password_hash, role, account_status)
             VALUES ($1, $2, $3, $4, $5, 'agent', 'active') RETURNING id`,
            [first_name, last_name, display_name, email, hashedPassword]
        );
        const userId = userRes.rows[0].id;

        const memCode = membership_code || 'basic';
        const memRes = await client.query(`SELECT id FROM memberships WHERE code = $1 LIMIT 1`, [memCode]);
        if (memRes.rows.length === 0) throw new Error(`Membership '${memCode}' not found.`);
        const membershipId = memRes.rows[0].id;

        const slugBase = display_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
        // Ensure unique slug
        const slugCheck = await client.query(`SELECT slug FROM agents WHERE slug LIKE $1 ORDER BY slug`, [`${slugBase}%`]);
        const slug = slugCheck.rows.length === 0 ? slugBase : `${slugBase}-${slugCheck.rows.length}`;

        const finalStatus = profile_status || 'draft';
        const finalPublished = is_published === true || is_published === 'true';
        const publishedAt = finalPublished ? new Date().toISOString() : null;

        await client.query(
            `INSERT INTO agents (user_id, membership_id, slug, display_name, brokerage_name, license_number, profile_status, is_published, published_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [userId, membershipId, slug, display_name, brokerage_name || null, license_number || null, finalStatus, finalPublished, publishedAt]
        );

        await client.query('COMMIT');

        logActivity({
            event_type: 'agent.admin.create',
            event_scope: 'agent',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'agent', id: userId, label: display_name },
            details: { email, brokerage_name, license_number, membership_code: memCode, profile_status: finalStatus, is_published: finalPublished },
            req,
        });

        res.status(201).json({ success: true, message: `Agent '${display_name}' created successfully.` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[createAgent]', err.message);
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
};

/**
 * PATCH /api/admin/:id/profile
 * Admin edits agent profile fields directly.
 */
const updateAgentProfile = async (req, res) => {
    const { id } = req.params;
    const {
        display_name, brokerage_name, license_number, years_experience,
        phone_public, email_public, website_url,
        city, state, service_areas, specialties, bio,
        profile_photo_url, is_featured
    } = req.body;

    try {
        const cleanArray = (arr) => Array.isArray(arr) ? arr.map(a => a.trim()).filter(Boolean) : [];

        await pool.query(
            `UPDATE agents SET
                display_name = COALESCE($1, display_name),
                brokerage_name = COALESCE($2, brokerage_name),
                license_number = COALESCE($3, license_number),
                years_experience = COALESCE($4, years_experience),
                phone_public = COALESCE($5, phone_public),
                email_public = COALESCE($6, email_public),
                website_url = COALESCE($7, website_url),
                city = COALESCE($8, city),
                state = COALESCE($9, state),
                service_areas = COALESCE($10, service_areas),
                specialties = COALESCE($11, specialties),
                bio = COALESCE($12, bio),
                profile_photo_url = COALESCE($13, profile_photo_url),
                is_featured = COALESCE($14, is_featured),
                updated_at = NOW()
             WHERE id = $15`,
            [
                display_name || null,
                brokerage_name || null,
                license_number || null,
                years_experience || null,
                phone_public || null,
                email_public || null,
                website_url || null,
                city || null,
                state || null,
                service_areas !== undefined ? JSON.stringify(cleanArray(service_areas)) : null,
                specialties !== undefined ? JSON.stringify(cleanArray(specialties)) : null,
                bio || null,
                profile_photo_url || null,
                typeof is_featured === 'boolean' ? is_featured : null,
                id
            ]
        );

        logActivity({
            event_type: 'agent.admin.update',
            event_scope: 'agent',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'agent', id, label: display_name || undefined },
            details: Object.fromEntries(Object.entries({
                display_name, brokerage_name, license_number, years_experience,
                phone_public, email_public, website_url, city, state,
                service_areas, specialties, bio, profile_photo_url, is_featured
            }).filter(([, v]) => v !== undefined && v !== null && v !== '')),
            req,
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[updateAgentProfile]', err.message);
        res.status(500).json({ error: 'Failed to update agent profile.' });
    }
};

/**
 * PATCH /api/admin/:id/status
 * Admin changes agent profile status and optionally membership.
 */
const updateStatus = async (req, res) => {
    const { status, membership_code } = req.body;
    const { id } = req.params;

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            let membershipId = null;
            if (membership_code) {
                const memRes = await client.query('SELECT id FROM memberships WHERE code = $1', [membership_code]);
                if (memRes.rows.length > 0) membershipId = memRes.rows[0].id;
            }

            // Also accept membership_name for backwards compat with existing review page
            if (!membershipId && req.body.membership_name) {
                const memRes = await client.query('SELECT id FROM memberships WHERE name = $1', [req.body.membership_name]);
                if (memRes.rows.length > 0) membershipId = memRes.rows[0].id;
            }

            const isPublished = status === 'published';
            const publishedAt = isPublished ? new Date().toISOString() : null;

            const fields = [];
            const vals = [];
            let c = 1;

            if (status) {
                fields.push(`profile_status = $${c++}`); vals.push(status);
                fields.push(`is_published = $${c++}`); vals.push(isPublished);
                if (isPublished) { fields.push(`published_at = $${c++}`); vals.push(publishedAt); }
            }
            if (membershipId) { fields.push(`membership_id = $${c++}`); vals.push(membershipId); }
            fields.push(`updated_at = $${c++}`); vals.push(new Date().toISOString());

            vals.push(id);
            await client.query(`UPDATE agents SET ${fields.join(', ')} WHERE id = $${c}`, vals);
            await client.query('COMMIT');

            logActivity({
                event_type: status === 'published' ? 'agent.publish' : `agent.status.${status || 'update'}`,
                event_scope: 'agent',
                actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
                target: { type: 'agent', id },
                details: { status, membership_code, is_published: isPublished },
                req,
            });

            res.json({ success: true });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[updateStatus]', err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * PATCH /api/admin/:id/account-status
 * Admin suspends or reactivates the user account linked to an agent.
 */
const updateAccountStatus = async (req, res) => {
    const { account_status } = req.body;
    const { id } = req.params;

    const allowed = ['active', 'suspended', 'pending', 'archived'];
    if (!allowed.includes(account_status)) {
        return res.status(400).json({ error: `Invalid account_status. Must be one of: ${allowed.join(', ')}` });
    }

    try {
        // id here is the agent id — resolve the user_id
        const agentRes = await pool.query('SELECT user_id FROM agents WHERE id = $1', [id]);
        if (agentRes.rows.length === 0) return res.status(404).json({ error: 'Agent not found.' });

        await pool.query('UPDATE users SET account_status = $1, updated_at = NOW() WHERE id = $2', [
            account_status,
            agentRes.rows[0].user_id
        ]);

        // Suspending an account must also remove the agent from the public directory.
        // Reactivating sends them back to draft so admin must explicitly re-publish.
        if (account_status === 'suspended') {
            await pool.query(
                `UPDATE agents SET is_published = false, profile_status = 'suspended', updated_at = NOW() WHERE id = $1`,
                [id]
            );
        } else if (account_status === 'active') {
            await pool.query(
                `UPDATE agents SET profile_status = 'draft', updated_at = NOW() WHERE id = $1 AND profile_status = 'suspended'`,
                [id]
            );
        }

        logActivity({
            event_type: `agent.account.${account_status}`,
            event_scope: 'agent',
            severity: account_status === 'suspended' ? 'warning' : 'info',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'agent', id },
            details: { account_status },
            req,
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[updateAccountStatus]', err.message);
        res.status(500).json({ error: 'Failed to update account status.' });
    }
};

/**
 * GET /api/admin/users
 * Returns all user accounts (password hashes stripped).
 */
const getUsers = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.id, u.first_name, u.last_name, u.full_name, u.email, u.role,
                    u.account_status, u.last_login_at, u.created_at, u.updated_at,
                    (u.password_hash IS NOT NULL) AS has_password,
                    a.id as agent_id, a.display_name as agent_display_name,
                    a.profile_status, a.is_published
             FROM users u
             LEFT JOIN agents a ON a.user_id = u.id
             ORDER BY u.created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        console.error('[getUsers]', err.message);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
};

/**
 * GET /api/admin/users/:id
 * Returns a single user + linked agent record (password hash stripped).
 */
const getUserDetail = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.id, u.first_name, u.last_name, u.full_name, u.email, u.role,
                    u.account_status, u.last_login_at, u.created_at, u.updated_at,
                    (u.password_hash IS NOT NULL) AS has_password,
                    a.id as agent_id, a.display_name, a.brokerage_name, a.profile_status,
                    a.is_published, a.slug, m.name as membership_name, m.code as membership_code
             FROM users u
             LEFT JOIN agents a ON a.user_id = u.id
             LEFT JOIN memberships m ON a.membership_id = m.id
             WHERE u.id = $1`,
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[getUserDetail]', err.message);
        res.status(500).json({ error: 'Failed to fetch user detail.' });
    }
};

/**
 * PATCH /api/admin/users/:id
 * Update user's basic info (name, email, role).
 */
const updateUser = async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};

    try {
        const fields = [];
        const vals = [];
        let i = 1;

        if ('first_name' in body) { fields.push(`first_name = $${i++}`); vals.push(body.first_name || null); }
        if ('last_name'  in body) { fields.push(`last_name = $${i++}`);  vals.push(body.last_name || null);  }
        if ('full_name'  in body) { fields.push(`full_name = $${i++}`);  vals.push(body.full_name || null);  }
        if ('phone'      in body) { fields.push(`phone = $${i++}`);      vals.push(body.phone || null);      }
        if ('email'      in body) {
            const email = (body.email || '').trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email.' });
            const exists = await pool.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [email, id]);
            if (exists.rows.length) return res.status(409).json({ error: 'Email already in use.' });
            fields.push(`email = $${i++}`); vals.push(email);
        }
        if ('role' in body) {
            if (!['agent', 'admin', 'super_admin'].includes(body.role)) return res.status(400).json({ error: 'Invalid role.' });
            fields.push(`role = $${i++}`); vals.push(body.role);
        }

        if (!fields.length) return res.json({ success: true, noop: true });

        fields.push('updated_at = NOW()');
        vals.push(id);
        await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, vals);

        logActivity({
            event_type: 'user.update',
            event_scope: 'user',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'user', id, label: body.full_name || body.email || undefined },
            details: Object.fromEntries(Object.entries({
                first_name: body.first_name, last_name: body.last_name, full_name: body.full_name,
                phone: body.phone, email: body.email, role: body.role
            }).filter(([, v]) => v !== undefined)),
            req,
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[updateUser]', err.message);
        res.status(500).json({ error: 'Failed to update user.' });
    }
};

/**
 * PATCH /api/admin/users/:id/status
 * Update account_status on the user record directly (works for users with or without agent records).
 */
const updateUserStatus = async (req, res) => {
    const { id } = req.params;
    const { account_status } = req.body;
    if (!['active', 'suspended', 'archived', 'pending'].includes(account_status)) {
        return res.status(400).json({ error: 'Invalid status.' });
    }

    try {
        const { rowCount } = await pool.query(
            `UPDATE users SET account_status = $1, updated_at = NOW() WHERE id = $2`,
            [account_status, id]
        );
        if (!rowCount) return res.status(404).json({ error: 'User not found.' });

        logActivity({
            event_type: `user.status.${account_status}`,
            event_scope: 'user',
            severity: account_status === 'suspended' ? 'warning' : 'info',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'user', id },
            details: { account_status },
            req,
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[updateUserStatus]', err.message);
        res.status(500).json({ error: 'Failed to update status.' });
    }
};

/**
 * PATCH /api/admin/users/:id/password
 * Resets a user's password. Admin-only action.
 */
const resetUserPassword = async (req, res) => {
    const bcrypt = require('bcrypt');
    const email  = require('../services/email');
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    try {
        const hashed = await bcrypt.hash(new_password, 10);
        const { rows, rowCount } = await pool.query(
            `UPDATE users SET password_hash = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING email, first_name, full_name`,
            [hashed, id]
        );
        if (!rowCount) return res.status(404).json({ error: 'User not found.' });

        // Fire-and-forget reset notification with the new password
        email.sendPasswordReset(rows[0], new_password);

        logActivity({
            event_type: 'user.password.reset',
            event_scope: 'user',
            severity: 'warning',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'user', id, label: rows[0]?.email },
            req,
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[resetUserPassword]', err.message);
        res.status(500).json({ error: 'Failed to reset password.' });
    }
};

/**
 * DELETE /api/admin/users/:id
 * Permanently deletes a user. Cascading deletes remove the linked agent record.
 */
const deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        // Protect at least one super_admin from deletion — don't allow deleting the last one
        const check = await pool.query(`SELECT role FROM users WHERE id = $1`, [id]);
        if (!check.rows.length) return res.status(404).json({ error: 'User not found.' });
        if (check.rows[0].role === 'super_admin') {
            const adminCount = await pool.query(`SELECT COUNT(*) FROM users WHERE role = 'super_admin'`);
            if (parseInt(adminCount.rows[0].count) <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last super admin account.' });
            }
        }
        const info = await pool.query(`SELECT email, full_name FROM users WHERE id = $1`, [id]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [id]);

        logActivity({
            event_type: 'user.delete',
            event_scope: 'user',
            severity: 'warning',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'user', id, label: info.rows[0]?.full_name || info.rows[0]?.email },
            details: { email: info.rows[0]?.email },
            req,
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[deleteUser]', err.message);
        res.status(500).json({ error: 'Failed to delete user.' });
    }
};

// ─── LEADS ────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/metrics/agent-coverage
 * Returns one row per active tag with per-tier agent counts. Drives the
 * "Agent coverage" heat map in /pages/admin/metrics.html — lets admins
 * see at a glance where coverage is strong, thin, or missing.
 *
 * Only counts agents that are route-eligible (active user, published profile).
 */
const getAgentCoverage = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                t.id, t.slug, t.name, t.state, t.region, t.latitude, t.longitude,
                COUNT(a.id) FILTER (WHERE m.code = 'founder')::int  AS founders,
                COUNT(a.id) FILTER (WHERE m.code IN ('premium','top_agent'))::int AS premiums,
                COUNT(a.id) FILTER (WHERE m.code IN ('basic','mn_lake_specialist'))::int AS basics,
                COUNT(a.id)::int AS total
              FROM tags t
         LEFT JOIN user_tags ut ON ut.tag_id = t.id
         LEFT JOIN users u      ON u.id       = ut.user_id AND u.account_status = 'active'
         LEFT JOIN agents a     ON a.user_id  = u.id
                                AND a.profile_status = 'published'
                                AND a.is_published    = TRUE
         LEFT JOIN memberships m ON m.id = a.membership_id
             WHERE t.active = TRUE
          GROUP BY t.id
          ORDER BY t.state, t.name
        `);
        res.json(rows);
    } catch (err) {
        console.error('[getAgentCoverage]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
};

/**
 * GET /api/admin/leads/unassigned-count
 * Returns { count } of leads that still need assignment (no agent_id and no
 * assigned_user_id), excluding soft-deleted rows. Powers the admin nav red dot.
 */
const getUnassignedLeadCount = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS count
               FROM leads
              WHERE agent_id IS NULL
                AND assigned_user_id IS NULL
                AND deleted_at IS NULL`
        );
        res.json({ count: rows[0]?.count || 0 });
    } catch (err) {
        console.error('[getUnassignedLeadCount]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
};

const getLeadDetail = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT l.*, a.display_name as assigned_agent_name, u.full_name as assigned_user_name
            FROM leads l
            LEFT JOIN agents a ON l.agent_id = a.id
            LEFT JOIN users u ON l.assigned_user_id = u.id
            WHERE l.id = $1
        `, [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Lead not found.' });

        const notesRes = await pool.query(`
            SELECT n.id, n.note_body as content, n.created_at, u.full_name as author_name
            FROM lead_notes n
            JOIN users u ON n.user_id = u.id
            WHERE n.lead_id = $1 ORDER BY n.created_at DESC
        `, [req.params.id]);

        const lead = rows[0];
        lead.notes = notesRes.rows;
        res.json(lead);
    } catch (err) {
        console.error('[getLeadDetail]', err.message);
        res.status(500).json({ error: 'Failed to fetch lead.' });
    }
};

const updateLeadStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required.' });
        const result = await pool.query(
            `UPDATE leads SET lead_status = $1::lead_status_type, updated_at = NOW() WHERE id = $2 RETURNING id, lead_status`,
            [status, req.params.id]
        );
        if (!result.rowCount) return res.status(404).json({ error: 'Lead not found.' });

        logActivity({
            event_type: `lead.status.${req.body.status}`,
            event_scope: 'lead',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'lead', id: req.params.id },
            details: { status: req.body.status },
            req,
        });

        res.json({ success: true, lead: result.rows[0] });
    } catch (err) {
        console.error('[updateLeadStatus]', err.message, '| code:', err.code, '| detail:', err.detail);
        res.status(500).json({ error: `Failed to update lead status: ${err.message}` });
    }
};

const assignLead = async (req, res) => {
    try {
        const { agentId, userId } = req.body;
        const result = await pool.query(
            `UPDATE leads
             SET agent_id = $1, assigned_user_id = $2, lead_status = $3::lead_status_type, updated_at = NOW()
             WHERE id = $4
             RETURNING id, agent_id, assigned_user_id, lead_status`,
            [agentId || null, userId || null, agentId || userId ? 'assigned' : 'unassigned', req.params.id]
        );
        if (!result.rowCount) return res.status(404).json({ error: 'Lead not found.' });

        logActivity({
            event_type: 'lead.assign',
            event_scope: 'lead',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'lead', id: req.params.id },
            details: { agent_id: req.body.agentId || null, user_id: req.body.userId || null },
            req,
        });

        res.json({ success: true, lead: result.rows[0] });
    } catch (err) {
        console.error('[assignLead]', err.message, '| code:', err.code, '| detail:', err.detail, '| body:', req.body);
        res.status(500).json({ error: `Failed to assign lead: ${err.message}` });
    }
};

const addLeadNote = async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ error: 'Note body cannot be empty.' });

        // Attribute to the authed admin if available, otherwise any admin/super_admin user
        let userId = req.user?.userId || null;
        if (!userId) {
            const adm = await pool.query(
                `SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at ASC LIMIT 1`
            );
            userId = adm.rows[0]?.id || null;
        }
        if (!userId) return res.status(500).json({ error: 'No admin user on platform to attribute note.' });

        await pool.query(
            'INSERT INTO lead_notes (lead_id, user_id, note_body) VALUES ($1, $2, $3)',
            [req.params.id, userId, content.trim()]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[addLeadNote]', err.message);
        res.status(500).json({ error: 'Failed to add note.' });
    }
};

const getAgentLeads = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT l.id, l.full_name as name, l.first_name, l.email, l.phone,
                   l.message, l.lead_type as type, l.lead_source as source,
                   l.lead_status as status, l.budget_min, l.budget_max,
                   l.timeline_text, l.location_text, l.contact_preference,
                   l.source_page_title, l.created_at
            FROM leads l
            WHERE l.agent_id = $1
              AND l.deleted_at IS NULL
            ORDER BY l.created_at DESC
        `, [req.params.id]);
        res.json(rows);
    } catch (err) {
        console.error('[getAgentLeads]', err.message);
        res.status(500).json({ error: 'Failed to fetch agent leads.' });
    }
};

module.exports = {
    getLedger,
    getAgentDetail,
    createAgent,
    updateAgentProfile,
    updateStatus,
    updateAccountStatus,
    getUsers,
    getUserDetail,
    updateUser,
    updateUserStatus,
    resetUserPassword,
    deleteUser,
    getLeadDetail,
    updateLeadStatus,
    assignLead,
    addLeadNote,
    getAgentLeads,
    getUnassignedLeadCount,
    getAgentCoverage
};
