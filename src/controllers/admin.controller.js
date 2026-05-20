const pool = require('../database/pool');
const bcrypt = require('bcrypt');
const { logActivity } = require('../services/activity-log');
const hubspot = require('../services/hubspot');

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
                   u.hs_contact_id,
                   m.name as membership_name, m.code as membership_code, m.display_badge_label as membership_badge
            FROM agents a
            JOIN users u ON a.user_id = u.id
            JOIN memberships m ON a.membership_id = m.id
            WHERE a.id = $1
        `;
        const { rows } = await pool.query(query, [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Agent not found.' });
        const out = rows[0];
        out.hs_contact_url = hubspot.getPortalContactUrl(out.hs_contact_id);
        res.json(out);
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

        // Fire-and-forget HubSpot mirror for the new agent.
        (async () => {
            const r = await hubspot.syncContact({
                email, firstname: first_name, lastname: last_name,
                user_type: 'agent', signup_source: 'admin_created',
                company: brokerage_name || undefined,
            });
            if (r?.id) {
                pool.query(`UPDATE users SET hs_contact_id = $1 WHERE id = $2`, [r.id, userId])
                    .catch(e => console.error('[hubspot] save id failed:', e.message));
            }
        })();

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

        // Fire-and-forget HubSpot sync. Pull the underlying user row to
        // patch by hs_contact_id (or upsert if it's still null).
        (async () => {
            const u = await pool.query(
                `SELECT u.id AS user_id, u.email, u.first_name, u.last_name, u.phone,
                        u.role, u.hs_contact_id, a.brokerage_name, a.city, a.state
                   FROM agents a JOIN users u ON u.id = a.user_id
                  WHERE a.id = $1`,
                [id]
            );
            const row = u.rows[0];
            if (!row?.email) return;
            const props = {
                email: row.email, firstname: row.first_name, lastname: row.last_name,
                phone: row.phone, user_type: row.role || 'agent',
                company: row.brokerage_name || undefined,
                city: row.city || undefined, state: row.state || undefined,
            };
            if (row.hs_contact_id) {
                hubspot.updateContact(row.hs_contact_id, props);
            } else {
                const r = await hubspot.syncContact(props);
                if (r?.id) {
                    pool.query(`UPDATE users SET hs_contact_id = $1 WHERE id = $2`, [r.id, row.user_id])
                        .catch(e => console.error('[hubspot] save id failed:', e.message));
                }
            }
        })();

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
            // Comp flag: when an admin sets the membership here, mark it
            // comped so the Stripe webhook stops overwriting membership_id
            // on renewal/upgrade. Accepts an explicit tier_comped boolean;
            // defaults to true whenever a membership_code is supplied
            // manually (the admin is deliberately pinning the tier).
            if ('tier_comped' in req.body) {
                fields.push(`tier_comped = $${c++}`); vals.push(!!req.body.tier_comped);
            } else if (membershipId) {
                fields.push(`tier_comped = $${c++}`); vals.push(true);
            }
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
                    u.hs_contact_id,
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
        const out = rows[0];
        out.hs_contact_url = hubspot.getPortalContactUrl(out.hs_contact_id);
        res.json(out);
    } catch (err) {
        console.error('[getUserDetail]', err.message);
        res.status(500).json({ error: 'Failed to fetch user detail.' });
    }
};

/**
 * GET /api/admin/users/:id/inquiries
 * Every form submission tied to this user — both regular leads (matched
 * by user_id, or by email when user_id wasn't backfilled yet) and any
 * cash-offer leads (no user_id column, matched by email). Each row is
 * tagged with `kind` so the admin UI knows where clicking it should go
 * (`/admin/lead-review.html?id=...` vs `/admin/cash-offers.html?id=...`).
 */
const getUserInquiries = async (req, res) => {
    try {
        const u = await pool.query(
            'SELECT id, LOWER(email) AS email FROM users WHERE id = $1',
            [req.params.id]
        );
        if (u.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
        const userId = u.rows[0].id;
        const email  = u.rows[0].email;

        const [leads, cashOffers] = await Promise.all([
            pool.query(
                `SELECT 'lead'::text         AS kind,
                        l.id, l.created_at, l.full_name, l.email, l.phone,
                        l.lead_type           AS type,
                        l.lead_source         AS source,
                        l.lead_status         AS status,
                        l.property_address    AS address,
                        l.message
                   FROM leads l
                  WHERE l.user_id = $1
                     OR (l.user_id IS NULL AND LOWER(l.email) = $2)
                  ORDER BY l.created_at DESC`,
                [userId, email]
            ),
            pool.query(
                `SELECT 'cash_offer'::text   AS kind,
                        c.id, c.created_at, c.full_name, c.email, c.phone,
                        'cash_offer'::text    AS type,
                        'cash_offer'::text    AS source,
                        c.status              AS status,
                        c.address_raw         AS address,
                        NULL::text            AS message,
                        c.offer_amount, c.archived_at
                   FROM cash_offer_leads c
                  WHERE LOWER(c.email) = $1
                  ORDER BY c.created_at DESC`,
                [email]
            ),
        ]);

        const merged = [...leads.rows, ...cashOffers.rows]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json({ rows: merged, total: merged.length });
    } catch (err) {
        console.error('[getUserInquiries]', err.message);
        res.status(500).json({ error: 'Failed to fetch inquiries.' });
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

        // Fire-and-forget HubSpot sync — admin-edited fields propagate to
        // HubSpot so marketing always sees current data.
        (async () => {
            const u = await pool.query(
                `SELECT email, first_name, last_name, phone, role, hs_contact_id FROM users WHERE id = $1`,
                [id]
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
                    pool.query(`UPDATE users SET hs_contact_id = $1 WHERE id = $2`, [r.id, id])
                        .catch(e => console.error('[hubspot] save id failed:', e.message));
                }
            }
        })();

        res.json({ success: true });
    } catch (err) {
        console.error('[updateUser]', err.message);
        res.status(500).json({ error: 'Failed to update user.' });
    }
};

/**
 * POST /api/admin/users/:id/hubspot-sync
 * Manually trigger a HubSpot sync for a single user. Used by the admin
 * "Sync to HubSpot now" button to populate hs_contact_id on records that
 * predate the integration. Awaited (not fire-and-forget) so the UI can
 * show success/failure inline.
 */
const syncUserToHubspot = async (req, res) => {
    const { id } = req.params;
    try {
        const u = await pool.query(
            `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.hs_contact_id,
                    a.brokerage_name, a.city, a.state
               FROM users u
               LEFT JOIN agents a ON a.user_id = u.id
              WHERE u.id = $1`,
            [id]
        );
        const row = u.rows[0];
        if (!row)        return res.status(404).json({ error: 'User not found.' });
        if (!row.email)  return res.status(400).json({ error: 'User has no email — cannot sync.' });
        if (!hubspot.isConfigured()) {
            return res.status(503).json({ error: 'HubSpot is not configured on this server.' });
        }

        const props = {
            email: row.email, firstname: row.first_name, lastname: row.last_name,
            phone: row.phone, user_type: row.role || undefined,
            company: row.brokerage_name || undefined,
            city: row.city || undefined, state: row.state || undefined,
        };

        let result;
        if (row.hs_contact_id) {
            result = await hubspot.updateContact(row.hs_contact_id, props);
        } else {
            result = await hubspot.syncContact(props);
            if (result?.id) {
                await pool.query(`UPDATE users SET hs_contact_id = $1 WHERE id = $2`, [result.id, id]);
            }
        }

        if (!result?.id) return res.status(502).json({ error: 'HubSpot sync failed — see server logs.' });

        logActivity({
            event_type: 'user.hubspot.sync',
            event_scope: 'user',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'user', id, label: row.email },
            details: { hs_contact_id: result.id },
            req,
        });

        res.json({
            success: true,
            hs_contact_id: result.id,
            hs_contact_url: hubspot.getPortalContactUrl(result.id),
        });
    } catch (err) {
        console.error('[syncUserToHubspot]', err.message);
        res.status(500).json({ error: 'Failed to sync to HubSpot.' });
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
 * Returns { count } of leads that still need attention — no agent_id and no
 * assigned_user_id AND not closed/archived. Powers the admin nav red dot,
 * which should only fire for items that actually need admin action. A
 * lead that's been closed (or archived) but never assigned doesn't count
 * — it was deflected, ignored, or auto-deduplicated and is done.
 */
const getUnassignedLeadCount = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS count
               FROM leads
              WHERE agent_id IS NULL
                AND assigned_user_id IS NULL
                AND deleted_at IS NULL
                AND lead_status NOT IN ('closed', 'archived')`
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
            SELECT n.id, n.note_body as content, n.created_at,
                   u.full_name as author_name, u.role as author_role
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

// DELETE /api/admin/leads/:id — hard delete. Removes the lead row entirely;
// the ON DELETE CASCADE foreign keys clean up lead_notes, lead_tags, and
// lead_assignments automatically. Once gone it's gone everywhere — admin,
// agent, and the submitter's dashboard all read the same row.
const deleteLead = async (req, res) => {
    const { id } = req.params;
    try {
        const info = await pool.query(
            `SELECT full_name, email, lead_type FROM leads WHERE id = $1`,
            [id]
        );
        if (!info.rows.length) return res.status(404).json({ error: 'Lead not found.' });

        await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);

        logActivity({
            event_type: 'lead.delete',
            event_scope: 'lead',
            severity: 'warning',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'lead', id, label: info.rows[0]?.full_name || info.rows[0]?.email },
            details: { email: info.rows[0]?.email, lead_type: info.rows[0]?.lead_type },
            req,
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[deleteLead]', err.message);
        res.status(500).json({ error: 'Failed to delete lead.' });
    }
};

// DELETE /api/admin/:id — hard delete an agent. :id is the agents.id.
// Removes the agent profile AND the underlying user account so they're
// gone everywhere — directory, lake pages, login. agents.user_id is
// ON DELETE RESTRICT, so the agents row must go before the users row;
// done in a transaction. CASCADE FKs clean up agent_lakes, user_tags,
// lead_notes; leads they were assigned to fall back to unassigned
// (leads.agent_id / assigned_user_id are ON DELETE SET NULL).
const deleteAgent = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        const info = await client.query(
            `SELECT a.user_id, a.display_name, u.email, u.role
               FROM agents a JOIN users u ON u.id = a.user_id
              WHERE a.id = $1`,
            [id]
        );
        if (!info.rows.length) {
            client.release();
            return res.status(404).json({ error: 'Agent not found.' });
        }
        const { user_id, display_name, email, role } = info.rows[0];
        if (role === 'super_admin') {
            client.release();
            return res.status(400).json({ error: 'Cannot delete a super admin account.' });
        }

        await client.query('BEGIN');
        await client.query('DELETE FROM agents WHERE id = $1', [id]);
        await client.query('DELETE FROM users WHERE id = $1', [user_id]);
        await client.query('COMMIT');

        logActivity({
            event_type: 'agent.delete',
            event_scope: 'agent',
            severity: 'warning',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'agent', id, label: display_name || email },
            details: { email, user_id },
            req,
        });

        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[deleteAgent]', err.message);
        res.status(500).json({ error: 'Failed to delete agent.' });
    } finally {
        client.release();
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

// ─── AGENT NOTES (internal CRM notes on an agent, mirrored to HubSpot) ────────
// Resolve the agent record (:id) to its user + HubSpot contact id, used by
// every note handler below.
async function resolveAgentUser(agentId) {
    const { rows } = await pool.query(
        `SELECT u.id AS user_id, u.hs_contact_id,
                COALESCE(a.display_name, u.full_name, u.email) AS name
           FROM agents a JOIN users u ON u.id = a.user_id
          WHERE a.id = $1 LIMIT 1`,
        [agentId]
    );
    return rows[0] || null;
}

/** GET /api/admin/:id/notes — list notes for an agent, newest first. */
const getAgentNotes = async (req, res) => {
    try {
        const agent = await resolveAgentUser(req.params.id);
        if (!agent) return res.status(404).json({ error: 'Agent not found.' });
        const { rows } = await pool.query(
            `SELECT n.id, n.body, n.hs_note_id, n.created_at,
                    COALESCE(au.full_name, au.email, 'Admin') AS author
               FROM agent_notes n
               LEFT JOIN users au ON au.id = n.author_user_id
              WHERE n.agent_user_id = $1
           ORDER BY n.created_at DESC`,
            [agent.user_id]
        );
        res.json({
            notes: rows,
            hs_contact_url: hubspot.getPortalContactUrl(agent.hs_contact_id),
            hs_synced: !!agent.hs_contact_id,
        });
    } catch (err) {
        console.error('[getAgentNotes]', err.message);
        res.status(500).json({ error: 'Failed to load notes.' });
    }
};

/** POST /api/admin/:id/notes — add a note + mirror it to HubSpot. */
const addAgentNote = async (req, res) => {
    try {
        const body = (req.body?.body || '').trim();
        if (!body) return res.status(400).json({ error: 'Note cannot be empty.' });

        const agent = await resolveAgentUser(req.params.id);
        if (!agent) return res.status(404).json({ error: 'Agent not found.' });

        // Attribute to the authed admin, else the oldest admin (mirrors lead notes).
        let authorId = req.user?.userId || null;
        if (!authorId) {
            const adm = await pool.query(
                `SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at ASC LIMIT 1`
            );
            authorId = adm.rows[0]?.id || null;
        }

        const { rows } = await pool.query(
            `INSERT INTO agent_notes (agent_user_id, author_user_id, body)
             VALUES ($1, $2, $3)
             RETURNING id, body, hs_note_id, created_at`,
            [agent.user_id, authorId, body.slice(0, 6000)]
        );
        const note = rows[0];

        logActivity({
            event_type: 'agent.note.add',
            event_scope: 'agents',
            actor: { type: 'admin', id: authorId, label: req.user?.display_name || 'admin' },
            target: { type: 'user', id: agent.user_id, label: agent.name },
            req,
        });

        // Mirror to HubSpot (fire-and-forget). On success, store the note id.
        hubspot.createContactNote(agent.hs_contact_id, `[Admin note] ${body}`)
            .then(r => {
                if (r?.id) pool.query(`UPDATE agent_notes SET hs_note_id = $1 WHERE id = $2`, [r.id, note.id]);
            })
            .catch(() => {});

        res.status(201).json({ success: true, note });
    } catch (err) {
        console.error('[addAgentNote]', err.message);
        res.status(500).json({ error: 'Failed to add note.' });
    }
};

/** DELETE /api/admin/:id/notes/:noteId — remove a note (local only). */
const deleteAgentNote = async (req, res) => {
    try {
        const agent = await resolveAgentUser(req.params.id);
        if (!agent) return res.status(404).json({ error: 'Agent not found.' });
        const { rowCount } = await pool.query(
            `DELETE FROM agent_notes WHERE id = $1 AND agent_user_id = $2`,
            [req.params.noteId, agent.user_id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Note not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error('[deleteAgentNote]', err.message);
        res.status(500).json({ error: 'Failed to delete note.' });
    }
};

/**
 * POST /api/admin/:id/impersonate
 * Admin-only. Mints a short-lived session token for the agent behind :id
 * so an admin can view the live site as that agent. Returns the token in
 * the JSON body (NOT a cookie) — the agent dashboard stores it per-tab in
 * sessionStorage, so the admin's own cookie session is left untouched.
 * Protected at the route by verifyToken + requireRole.
 */
const impersonateAgent = async (req, res) => {
    const jwt = require('jsonwebtoken');
    const { id } = req.params;
    try {
        const { rows } = await pool.query(
            `SELECT u.id, u.role, u.account_status, u.email,
                    EXTRACT(EPOCH FROM u.password_changed_at)::bigint AS pwd_iat
             FROM agents a JOIN users u ON u.id = a.user_id
             WHERE a.id = $1`,
            [id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Agent not found.' });
        const user = rows[0];
        if (user.account_status !== 'active') {
            return res.status(403).json({ error: "This agent's account is not active — reactivate it before logging in as them." });
        }

        // Short-lived token returned in the body — NOT set as a cookie.
        // The agent dashboard stores it per-tab in sessionStorage so the
        // admin's own cookie session is never touched.
        const token = jwt.sign(
            { userId: user.id, role: user.role, pwd_iat: user.pwd_iat || null },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        logActivity({
            event_type: 'admin.impersonate',
            event_scope: 'auth',
            severity: 'warning',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.role || 'admin' },
            target: { type: 'user', id: user.id, label: user.email },
            req,
        });

        res.json({ success: true, token, redirect: '/pages/agent/dashboard.html' });
    } catch (err) {
        console.error('[impersonateAgent]', err.message);
        res.status(500).json({ error: 'Could not start impersonation session.' });
    }
};

/**
 * GET /api/admin/billing/:kind/:id   (kind = 'agent' | 'business')
 * Returns the live Stripe billing reality for one subscriber so the
 * admin can see what they're ACTUALLY paying, alongside the stored
 * paid_tier / effective tier. Degrades gracefully when Stripe isn't
 * configured or there's no subscription on file — returns
 * { configured, subscription: null } instead of erroring.
 */
const getSubscriberBilling = async (req, res) => {
    const { kind, id } = req.params;
    if (!['agent', 'business'].includes(kind)) {
        return res.status(400).json({ error: "kind must be 'agent' or 'business'." });
    }
    let stripe = null;
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) { try { stripe = require('stripe')(key); } catch (_) { stripe = null; } }

    try {
        // Pull the stored row (effective + paid tier + the subscription id).
        const row = kind === 'agent'
            ? (await pool.query(
                `SELECT a.stripe_subscription_id, a.paid_membership_code, a.tier_comped,
                        m.code AS effective_code, m.name AS effective_name
                   FROM agents a LEFT JOIN memberships m ON m.id = a.membership_id
                  WHERE a.id = $1 LIMIT 1`, [id])).rows[0]
            : (await pool.query(
                `SELECT stripe_subscription_id, tier AS effective_tier, paid_tier, tier_comped, subscription_status
                   FROM businesses WHERE id = $1 LIMIT 1`, [id])).rows[0];

        if (!row) return res.status(404).json({ error: 'Not found.' });

        const out = {
            configured: !!stripe,
            kind,
            comped: !!row.tier_comped,
            effective: kind === 'agent' ? { code: row.effective_code, name: row.effective_name } : { tier: row.effective_tier },
            paid:      kind === 'agent' ? { code: row.paid_membership_code } : { tier: row.paid_tier, status: row.subscription_status },
            subscription: null,
        };

        // Live Stripe lookup for the dollar amount + renewal date.
        if (stripe && row.stripe_subscription_id) {
            try {
                const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, { expand: ['items.data.price'] });
                const price = sub.items?.data?.[0]?.price;
                out.subscription = {
                    status:             sub.status,
                    cancel_at_period_end: sub.cancel_at_period_end,
                    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
                    amount:             price?.unit_amount != null ? price.unit_amount / 100 : null,
                    currency:           price?.currency || 'usd',
                    interval:           price?.recurring?.interval || null,
                };
            } catch (e) {
                out.subscription_error = e.message;
            }
        }
        res.json(out);
    } catch (err) {
        console.error('[getSubscriberBilling]', err.message);
        res.status(500).json({ error: 'Failed to load billing.' });
    }
};

module.exports = {
    getLedger,
    getAgentDetail,
    getSubscriberBilling,
    createAgent,
    updateAgentProfile,
    updateStatus,
    updateAccountStatus,
    getUsers,
    getUserDetail,
    getUserInquiries,
    updateUser,
    updateUserStatus,
    resetUserPassword,
    impersonateAgent,
    deleteUser,
    syncUserToHubspot,
    getLeadDetail,
    updateLeadStatus,
    assignLead,
    addLeadNote,
    deleteLead,
    deleteAgent,
    getAgentLeads,
    getAgentNotes,
    addAgentNote,
    deleteAgentNote,
    getUnassignedLeadCount,
    getAgentCoverage
};
