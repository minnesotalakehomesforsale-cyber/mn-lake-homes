const pool = require('../database/pool');
const bcrypt = require('bcrypt');

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
        city, state, service_areas, specialties, bio
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
                updated_at = NOW()
             WHERE id = $13`,
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
                id
            ]
        );
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

        res.json({ success: true });
    } catch (err) {
        console.error('[updateAccountStatus]', err.message);
        res.status(500).json({ error: 'Failed to update account status.' });
    }
};

/**
 * GET /api/admin/users
 * Returns all user accounts.
 */
const getUsers = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.*, a.id as agent_id, a.display_name as agent_display_name, a.profile_status, a.is_published
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
 * Returns a single user + linked agent record.
 */
const getUserDetail = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.*, a.id as agent_id, a.display_name, a.brokerage_name, a.profile_status,
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

// ─── LEADS ────────────────────────────────────────────────────────────────────

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
        await pool.query('UPDATE leads SET lead_status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update lead status.' });
    }
};

const assignLead = async (req, res) => {
    try {
        const { agentId, userId } = req.body;
        await pool.query(
            'UPDATE leads SET agent_id = $1, assigned_user_id = $2, lead_status = $3, updated_at = NOW() WHERE id = $4',
            [agentId || null, userId || null, 'assigned', req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to assign lead.' });
    }
};

const addLeadNote = async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ error: 'Note body cannot be empty.' });

        await pool.query(
            'INSERT INTO lead_notes (lead_id, user_id, note_body) VALUES ($1, $2, $3)',
            [req.params.id, req.user.userId, content.trim()]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[addLeadNote]', err.message);
        res.status(500).json({ error: 'Failed to add note.' });
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
    getLeadDetail,
    updateLeadStatus,
    assignLead,
    addLeadNote
};
