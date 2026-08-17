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

            // DEV-10: if this publish approved a self-claimed profile, fire the
            // "profile published" HubSpot event (best-effort, no-op otherwise).
            if (isPublished) { try { require('./claim.controller').firePublishedEvent('agent', id); } catch (_) {} }

            // In-app notification centre (#11) — tell the agent their profile is live.
            if (isPublished) {
                try {
                    require('../services/agent-notify').notifyAgent(id, {
                        type: 'profile',
                        title: '🎉 Your profile is live!',
                        body: "Buyers can now find you on your lake pages. Share your Featured Agent graphic to spread the word.",
                        link: '',
                    });
                } catch (_) {}
                // B3: publishing a paying/comped agent auto-claims held leads on their lakes.
                try { require('./lead.controller').releaseHeldLeads(id); } catch (_) {}
            }

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
                    u.hs_contact_id, u.admin_tab_permissions,
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
        email.sendAdminPasswordReset(rows[0], new_password);

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

// ─── SYSTEM HEALTH (powers the sidebar System badge) ────────────────────────
// Counts error + warning rows in the activity log over the last 24 hours
// so something failing (HubSpot sync, Stripe webhook, image upload, etc.)
// surfaces in the sidebar without the admin having to open the log first.
const getSystemAlertsCount = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS count
               FROM activity_log
              WHERE severity IN ('error', 'warning')
                AND created_at >= NOW() - INTERVAL '24 hours'`
        );
        res.json({ count: rows[0].count });
    } catch (_) {
        // Activity log table may not exist yet on a brand-new deploy.
        res.json({ count: 0 });
    }
};

// ─── ADMIN PERMISSIONS (per-employee sidebar access) ────────────────────────
const { ADMIN_TABS, ADMIN_TAB_KEYS } = require('../services/admin-tabs');

/**
 * GET /api/admin/admin-tabs — canonical list of admin sidebar tabs.
 * Used by the per-admin permission picker on user-review.html. Adding a
 * tab to src/services/admin-tabs.js makes it appear here automatically.
 */
const listAdminTabs = (req, res) => {
    res.json(ADMIN_TABS);
};

/**
 * PATCH /api/admin/users/:id/permissions
 * Body: { allowed_tabs: string[] | null }
 *   - null      → full access (sees every tab; default for existing admins).
 *   - []        → no tabs (effectively locked out of the admin UI).
 *   - [keys]    → only those tabs render in their sidebar.
 *
 * Restricted to super_admin so an employee can't loosen their own perms.
 * Always a no-op on super_admin targets — the owner role is non-editable.
 */
const setUserPermissions = async (req, res) => {
    // Only the platform owner can grant/revoke tabs.
    if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only the owner can change permissions.' });
    }
    const { id } = req.params;
    let { allowed_tabs } = req.body || {};

    // Validate the payload: null OR array of known keys.
    if (allowed_tabs !== null && !Array.isArray(allowed_tabs)) {
        return res.status(400).json({ error: 'allowed_tabs must be null or an array of tab keys.' });
    }
    let value = null;
    if (Array.isArray(allowed_tabs)) {
        const unknown = allowed_tabs.filter(k => !ADMIN_TAB_KEYS.has(String(k)));
        if (unknown.length) return res.status(400).json({ error: `Unknown tab keys: ${unknown.join(', ')}` });
        // Dedupe + sort for stable storage.
        value = [...new Set(allowed_tabs.map(String))].sort();
    }

    try {
        const target = await pool.query(`SELECT id, role, email FROM users WHERE id = $1`, [id]);
        if (!target.rowCount) return res.status(404).json({ error: 'User not found.' });
        const u = target.rows[0];
        if (u.role === 'super_admin') {
            return res.status(400).json({ error: 'The owner role cannot be restricted.' });
        }
        if (u.role !== 'admin') {
            return res.status(400).json({ error: 'Permissions only apply to admin users.' });
        }

        await pool.query(
            `UPDATE users SET admin_tab_permissions = $1::jsonb, updated_at = NOW() WHERE id = $2`,
            [value === null ? null : JSON.stringify(value), id]
        );

        logActivity({
            event_type: 'admin.permissions.update',
            event_scope: 'admin',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'owner' },
            target: { type: 'user', id, label: u.email },
            details: { allowed_tabs: value },
            req,
        });

        res.json({ success: true, allowed_tabs: value });
    } catch (err) {
        console.error('[setUserPermissions]', err.message);
        res.status(500).json({ error: 'Failed to update permissions.' });
    }
};

/**
 * POST /api/admin/users — create a new admin user (employee).
 * Body: { first_name, last_name, email, password, allowed_tabs? }
 * Super-admin only. The new user lands with role='admin' and the chosen
 * tab set. allowed_tabs omitted → full access by default.
 */
const createAdminUser = async (req, res) => {
    if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only the owner can create admin users.' });
    }
    const bcrypt = require('bcrypt');
    let { first_name, last_name, email, password, allowed_tabs } = req.body || {};
    first_name = (first_name || '').trim();
    last_name  = (last_name  || '').trim();
    email      = (email      || '').trim().toLowerCase();
    if (!email || !password || !first_name) {
        return res.status(400).json({ error: 'First name, email, and password are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email.' });
    }
    if (String(password).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // Validate permissions if provided.
    let perms = null;
    if (Array.isArray(allowed_tabs)) {
        const unknown = allowed_tabs.filter(k => !ADMIN_TAB_KEYS.has(String(k)));
        if (unknown.length) return res.status(400).json({ error: `Unknown tab keys: ${unknown.join(', ')}` });
        perms = [...new Set(allowed_tabs.map(String))].sort();
    }

    try {
        const dup = await pool.query(`SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`, [email]);
        if (dup.rowCount) return res.status(409).json({ error: 'A user with that email already exists.' });

        const hash = await bcrypt.hash(String(password), 10);
        const full = `${first_name} ${last_name}`.trim();
        const { rows } = await pool.query(
            `INSERT INTO users (first_name, last_name, full_name, email, password_hash,
                                role, account_status, admin_tab_permissions, password_changed_at)
             VALUES ($1, $2, $3, $4, $5, 'admin', 'active', $6::jsonb, NOW())
             RETURNING id, email, role`,
            [first_name, last_name, full, email, hash, perms === null ? null : JSON.stringify(perms)]
        );

        logActivity({
            event_type: 'admin.user.create',
            event_scope: 'admin',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'owner' },
            target: { type: 'user', id: rows[0].id, label: email },
            details: { allowed_tabs: perms },
            req,
        });

        res.status(201).json({ success: true, user: rows[0] });
    } catch (err) {
        console.error('[createAdminUser]', err.message);
        res.status(500).json({ error: 'Failed to create admin user.' });
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
                COUNT(a.id) FILTER (WHERE m.code = 'founder')::int            AS founders,
                COUNT(a.id) FILTER (WHERE m.code = 'top_agent')::int          AS elite,
                COUNT(a.id) FILTER (WHERE m.code = 'mn_lake_specialist')::int AS prime,
                COUNT(a.id) FILTER (WHERE m.code = 'basic')::int             AS basic,
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
 * GET /api/admin/metrics/business-coverage
 * Per-area (tag) count of LIVE directory businesses, bucketed by tier
 * (premium / basic / free) with the list of categories present — the business
 * mirror of getAgentCoverage. "Live" = active AND (admin-managed OR paying OR
 * comped). Drives the Business Coverage grid + gap detection.
 */
const getBusinessCoverage = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                t.id, t.slug, t.name, t.state, t.region, t.latitude, t.longitude,
                COUNT(b.id) FILTER (WHERE COALESCE(NULLIF(b.tier,''),'free') = 'premium')::int AS premium,
                COUNT(b.id) FILTER (WHERE COALESCE(NULLIF(b.tier,''),'free') = 'basic')::int   AS basic,
                COUNT(b.id) FILTER (WHERE COALESCE(NULLIF(b.tier,''),'free') = 'free')::int    AS free,
                COUNT(b.id)::int AS total,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT b.type), NULL) AS types
              FROM tags t
         LEFT JOIN business_tags bt ON bt.tag_id = t.id
         LEFT JOIN businesses b ON b.id = bt.business_id
                                AND b.status = 'active'
                                AND (b.user_id IS NULL OR b.subscription_status = 'active' OR b.tier_comped)
             WHERE t.active = TRUE
          GROUP BY t.id
          ORDER BY t.state, t.name
        `);
        res.json(rows);
    } catch (err) {
        console.error('[getBusinessCoverage]', err.message);
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
            `SELECT COUNT(*)::int AS count,
                    -- T148: unrouted (no lake yet) counted SEPARATELY from held
                    -- (known lake, no agent). A rising 'unrouted' points at the
                    -- form's lake picker, not vague buyers.
                    COUNT(*) FILTER (WHERE unrouted_no_lake = TRUE)::int AS unrouted,
                    COUNT(*) FILTER (WHERE held_no_agent = TRUE)::int    AS held
               FROM leads
              WHERE agent_id IS NULL
                AND assigned_user_id IS NULL
                AND deleted_at IS NULL
                AND lead_status NOT IN ('closed', 'archived')`
        );
        res.json({ count: rows[0]?.count || 0, unrouted: rows[0]?.unrouted || 0, held: rows[0]?.held || 0 });
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
            // $1/$2/$4 are explicitly cast to uuid: the ids are also used inside
            // the CASE WHEN $1 IS NOT NULL expressions, and Postgres can't infer
            // a parameter's type from an assignment target when the same param is
            // reused in a bare IS NULL test — it errors "could not determine data
            // type of parameter $1". Casting anchors the type.
            `UPDATE leads
             SET agent_id = $1::uuid, assigned_user_id = $2::uuid, lead_status = $3::lead_status_type,
                 -- Stamp the SLA clock + first-routed time on assign (not on clear).
                 -- routed_at is the manual-claim latency signal for T021.
                 assigned_at = CASE WHEN $1::uuid IS NOT NULL OR $2::uuid IS NOT NULL THEN NOW() ELSE assigned_at END,
                 routed_at   = CASE WHEN $1::uuid IS NOT NULL OR $2::uuid IS NOT NULL THEN COALESCE(routed_at, NOW()) ELSE routed_at END,
                 pipeline_status = CASE WHEN $1::uuid IS NOT NULL OR $2::uuid IS NOT NULL THEN 'routed' ELSE pipeline_status END,
                 updated_at = NOW()
             WHERE id = $4::uuid
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

        // Notify the newly-assigned agent by email (fire-and-forget). Skip
        // when the admin is CLEARING the assignment (both ids null) or
        // when we can't resolve a user_id to email. The auto-router has
        // its own email path (sendMatchedAgentNotification); this is the
        // manual-assign equivalent.
        if (agentId || userId) {
            (async () => {
                try {
                    const emailSvc = require('../services/email');
                    // Resolve agent user → email + first name. agentId points
                    // to the agents table row; assigned_user_id is the user.
                    const agentRes = await pool.query(
                        `SELECT u.email, u.first_name, COALESCE(a.display_name, u.full_name) AS display_name
                           FROM users u
                           LEFT JOIN agents a ON a.user_id = u.id
                          WHERE u.id = $1 OR a.id = $2
                          LIMIT 1`,
                        [userId || null, agentId || null]
                    );
                    const agent = agentRes.rows[0];
                    if (!agent?.email) return;

                    const leadRes = await pool.query(
                        `SELECT id, full_name, email, phone, message AS notes,
                                lead_type AS type, location_text AS address
                           FROM leads
                          WHERE id = $1
                          LIMIT 1`,
                        [req.params.id]
                    );
                    const lead = leadRes.rows[0];
                    if (!lead) return;

                    emailSvc.sendAgentLeadAssigned({
                        to: agent.email,
                        agentFirstName: agent.first_name || (agent.display_name || '').split(' ')[0] || 'there',
                        lead: {
                            id:      lead.id,
                            name:    lead.full_name,
                            email:   lead.email,
                            phone:   lead.phone,
                            notes:   lead.notes,
                            type:    lead.type,
                            address: lead.address,
                        },
                        assignedBy: req.user?.display_name || 'the MN Lake Homes team',
                    });
                } catch (err) {
                    console.error('[assignLead] notify failed:', err.message);
                }
            })();
        }

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

// ─── T141: manual release of a held lead to a free-tier agent (§4.3b) ────────
// A hand-placed SALES TOOL, admin-only, no rule engine. See
// src/services/manual-release.js for the guardrails.

// GET /api/admin/leads/:id/manual-release/candidates
// Free-tier (non-paying, non-comped), published agents the admin may hand this
// held lead to — soft-sorted so agents already on the lead's lake surface first
// (a usability hint, NOT eligibility logic; the admin may pick any of them).
// Each carries manual_assignment_count + at_cap so the picker can disable agents
// at the lifetime cap.
const getManualReleaseCandidates = async (req, res) => {
    try {
        const { MANUAL_ASSIGNMENT_CAP } = require('../services/manual-release');
        const leadR = await pool.query(
            `SELECT id, lead_grade, held_no_agent, lake_id, target_lake, landing_page_lake
               FROM leads WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
        const lead = leadR.rows[0];
        if (!lead) return res.status(404).json({ error: 'Lead not found.' });

        // Free-tier published agents + whether they cover the lead's lake (direct
        // agent_lakes OR a shared geo tag). on_lead_lake drives the soft sort only.
        const { rows } = await pool.query(
            `SELECT a.id, COALESCE(a.display_name, u.full_name) AS name, u.email,
                    a.manual_assignment_count,
                    (a.manual_assignment_count >= $2) AS at_cap,
                    EXISTS (
                        SELECT 1 FROM agent_lakes al WHERE al.agent_id = a.id AND al.lake_id = $1
                        UNION ALL
                        SELECT 1 FROM user_tags ut JOIN lake_tags lt ON lt.tag_id = ut.tag_id
                         WHERE ut.user_id = a.user_id AND lt.lake_id = $1
                    ) AS on_lead_lake
               FROM agents a
               JOIN users u ON u.id = a.user_id
               LEFT JOIN memberships m ON m.id = a.membership_id
              WHERE a.is_published = TRUE AND a.deleted_at IS NULL
                AND COALESCE(m.code,'free') = 'free' AND a.tier_comped = FALSE
              ORDER BY on_lead_lake DESC, a.manual_assignment_count ASC, name ASC`,
            [lead.lake_id, MANUAL_ASSIGNMENT_CAP]);

        res.json({
            lead: { id: lead.id, grade: lead.lead_grade, held: !!lead.held_no_agent },
            cap: MANUAL_ASSIGNMENT_CAP,
            candidates: rows,
        });
    } catch (err) {
        console.error('[getManualReleaseCandidates]', err.message);
        res.status(500).json({ error: 'Failed to load candidate agents.' });
    }
};

// POST /api/admin/leads/:id/manual-release  { agentId, reason }
// Hand-places a held grade-A/B lead with a free-tier agent as a PENDING offer:
// the agent gets a signed accept link (24h SLA) and the lead is told nothing yet.
// Transactional + guarded so the lifetime cap can't be exceeded under races.
const manualReleaseLead = async (req, res) => {
    const leadId = req.params.id;
    const agentId = (req.body?.agentId || '').trim();
    const reason = (req.body?.reason || '').trim();
    const { canManuallyRelease, MANUAL_ASSIGNMENT_CAP, ACCEPT_SLA_HOURS, acceptToken } = require('../services/manual-release');
    const email = require('../services/email');

    if (!agentId) return res.status(400).json({ error: 'Pick a free-tier agent to hand this lead to.' });
    if (!reason)  return res.status(400).json({ error: 'A short reason is required — say why this agent, this lead.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock the lead + agent rows for the duration so two admins can't both
        // place (or blow the cap) concurrently.
        const leadR = await client.query(
            `SELECT id, full_name, first_name, email, lead_type, lead_grade, held_no_agent,
                    target_lake, lake_id
               FROM leads WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [leadId]);
        const lead = leadR.rows[0];
        if (!lead) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Lead not found.' }); }

        const agR = await client.query(
            `SELECT a.id, a.user_id, a.is_published, a.tier_comped, a.manual_assignment_count,
                    COALESCE(a.display_name, u.full_name) AS name, u.email AS agent_email,
                    COALESCE(m.code,'free') AS mcode
               FROM agents a JOIN users u ON u.id = a.user_id
               LEFT JOIN memberships m ON m.id = a.membership_id
              WHERE a.id = $1 FOR UPDATE OF a`, [agentId]);
        const ag = agR.rows[0];
        if (!ag) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Agent not found.' }); }

        const agentIsFreeTier = ag.is_published && !ag.tier_comped && ag.mcode === 'free';
        const gate = canManuallyRelease({
            leadGrade: lead.lead_grade,
            held: !!lead.held_no_agent,
            agentIsFreeTier,
            agentCount: ag.manual_assignment_count,
        });
        if (!gate.ok) {
            await client.query('ROLLBACK');
            const msg = {
                grade_not_eligible: 'Only grade A or B held leads can be hand-placed. Grade C is never eligible.',
                not_held:           'This lead isn\'t in the held queue — it already has (or had) an agent.',
                agent_not_free_tier:'That agent isn\'t free-tier — this tool is only for non-paying agents.',
                agent_at_cap:       `That agent has already reached the lifetime cap of ${MANUAL_ASSIGNMENT_CAP}.`,
            }[gate.reason] || 'This lead can\'t be hand-placed.';
            return res.status(409).json({ error: msg, reason: gate.reason });
        }

        // Reserve the slot (increment now; the 24h sweep frees it if unaccepted).
        await client.query(
            `UPDATE agents SET manual_assignment_count = manual_assignment_count + 1, updated_at = NOW()
              WHERE id = $1`, [agentId]);

        // Place the offer (pending acceptance). held_no_agent flag → FALSE so the
        // auto-release / self-claim can't grab it out from under the offer, but
        // lead_status stays as-is; the pending state is (assigned_manually AND
        // accepted_at IS NULL). No lead-facing message here — that waits for accept.
        await client.query(
            `UPDATE leads
                SET assigned_manually = TRUE, assigned_by = $2, manual_assignment_reason = $3,
                    manual_assigned_at = NOW(), accepted_at = NULL,
                    agent_id = $4, assigned_user_id = $5, held_no_agent = FALSE,
                    updated_at = NOW()
              WHERE id = $1`,
            [leadId, req.user?.userId || null, reason, agentId, ag.user_id]);

        await client.query('COMMIT');

        // Offer email with the signed accept link (the only acceptance surface).
        const base = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
        const acceptUrl = `${base}/leads/accept?l=${encodeURIComponent(leadId)}&a=${encodeURIComponent(agentId)}&t=${acceptToken(leadId, agentId)}`;
        try {
            email.sendManualLeadOffer({
                to: ag.agent_email,
                agentFirstName: (ag.name || '').split(' ')[0] || 'there',
                lead: { lakeName: lead.target_lake, type: lead.lead_type, intent: null, priceBand: null },
                acceptUrl, expiresHours: ACCEPT_SLA_HOURS,
            });
        } catch (e) { console.warn('[manualReleaseLead] offer email failed:', e.message); }
        // NOTE: no in-app/portal notification here on purpose. Pre-acceptance the
        // offer must stay OFF every agent surface — the signed email link is the
        // only channel. The portal notification comes AFTER acceptance, when the
        // lead is a normal assigned lead (see the accept route).

        logActivity({
            event_type: 'lead.manual_release', event_scope: 'lead', severity: 'notice',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'lead', id: leadId, label: lead.full_name || lead.email },
            details: { agent_id: agentId, agent: ag.name, grade: lead.lead_grade, reason, sla_hours: ACCEPT_SLA_HOURS },
            req,
        });

        res.json({ success: true, status: 'pending', agent: { id: agentId, name: ag.name }, expires_hours: ACCEPT_SLA_HOURS });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('[manualReleaseLead]', err.message);
        res.status(500).json({ error: 'Failed to hand-place the lead.' });
    } finally {
        client.release();
    }
};

// T148: POST /api/admin/leads/:id/set-lake  { lakeId | lakeSlug | lakeName }
// Promote an unrouted-no-lake lead into normal routing by naming its lake.
// Resolves the lake, clears unrouted_no_lake, then routes to a covering agent —
// or drops it into the held queue if no paying agent covers it yet.
const setLeadLake = async (req, res) => {
    const leadId = req.params.id;
    const { lakeId, lakeSlug, lakeName } = req.body || {};
    try {
        let lake = null;
        if (lakeId)        lake = (await pool.query(`SELECT id, slug, name FROM lakes WHERE id = $1::uuid LIMIT 1`, [lakeId])).rows[0];
        else if (lakeSlug) lake = (await pool.query(`SELECT id, slug, name FROM lakes WHERE slug = $1 LIMIT 1`, [lakeSlug])).rows[0];
        else if (lakeName) lake = (await pool.query(`SELECT id, slug, name FROM lakes WHERE lower(name) = lower($1) LIMIT 1`, [lakeName])).rows[0];
        if (!lake) return res.status(400).json({ error: 'Pick a lake that exists in our database to route this lead.' });

        // Set the lake + clear the unrouted flag (routing keys off lake_id).
        await pool.query(
            `UPDATE leads SET lake_id = $1, unrouted_no_lake = FALSE, updated_at = NOW() WHERE id = $2::uuid`,
            [lake.id, leadId]);
        logActivity({
            event_type: 'lead.lake_set', event_scope: 'lead', severity: 'notice',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'lead', id: leadId }, details: { lake_id: lake.id, lake: lake.name }, req,
        });

        // Route now that we know the lake.
        const { routeLead } = require('../services/lead-router');
        const pick = await routeLead({ lakeId: lake.id }).catch(() => null);
        if (pick) {
            await pool.query(
                `UPDATE leads SET agent_id = $1, assigned_user_id = $2, lead_status = 'contacted',
                        pipeline_status = 'routed', assigned_at = NOW(), routed_at = COALESCE(routed_at, NOW()), updated_at = NOW()
                  WHERE id = $3::uuid`, [pick.agentId, pick.userId, leadId]);
            try {
                require('../services/email').sendMatchedAgentNotification({
                    to: pick.email, agentFirstName: (pick.fullName || '').split(' ')[0] || 'there',
                    lead: { id: leadId, name: null, type: null }, matchedAreas: [lake.name].filter(Boolean),
                });
            } catch (_) {}
            try { require('../services/agent-notify').notifyAgent(pick.agentId, { type: 'lead', title: `A lead just routed to you on ${lake.name}`, body: 'Respond fast to win it.', link: '?view=leads' }); } catch (_) {}
            return res.json({ success: true, routed: true, held: false, agent: pick.fullName, lake: lake.name });
        }
        // No covering agent → held (we now know the lake, just can't serve it).
        await pool.query(
            `UPDATE leads SET held_no_agent = TRUE, held_at = COALESCE(held_at, NOW()), lead_status = 'held_no_agent', updated_at = NOW()
              WHERE id = $1::uuid`, [leadId]);
        return res.json({ success: true, routed: false, held: true, lake: lake.name });
    } catch (e) {
        console.error('[setLeadLake]', e.message);
        res.status(500).json({ error: 'Failed to set the lake.' });
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
 * POST /api/admin/users/:id/impersonate
 * Admin-only. Same as impersonateAgent but for a regular user account, so an
 * admin can view the site logged in as that user. Token is returned in the
 * body (per-tab), never a cookie — the admin's own session is untouched.
 */
const impersonateUser = async (req, res) => {
    const jwt = require('jsonwebtoken');
    const { id } = req.params;
    try {
        const { rows } = await pool.query(
            `SELECT id, role, account_status, email,
                    EXTRACT(EPOCH FROM password_changed_at)::bigint AS pwd_iat
               FROM users WHERE id = $1 LIMIT 1`, [id]);
        if (!rows.length) return res.status(404).json({ error: 'User not found.' });
        const user = rows[0];
        if (user.account_status !== 'active') {
            return res.status(403).json({ error: "This user's account is not active." });
        }
        const token = jwt.sign(
            { userId: user.id, role: user.role, pwd_iat: user.pwd_iat || null },
            process.env.JWT_SECRET,
            { expiresIn: '8h' });
        logActivity({
            event_type: 'admin.impersonate', event_scope: 'auth', severity: 'warning',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.role || 'admin' },
            target: { type: 'user', id: user.id, label: user.email }, req,
        });
        res.json({ success: true, token, redirect: '/pages/user/dashboard.html' });
    } catch (err) {
        console.error('[impersonateUser]', err.message);
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
                `SELECT a.stripe_subscription_id, a.stripe_customer_id, a.paid_membership_code, a.tier_comped,
                        m.code AS effective_code, m.name AS effective_name
                   FROM agents a LEFT JOIN memberships m ON m.id = a.membership_id
                  WHERE a.id = $1 LIMIT 1`, [id])).rows[0]
            : (await pool.query(
                `SELECT stripe_subscription_id, stripe_customer_id, tier AS effective_tier, paid_tier, tier_comped, subscription_status
                   FROM businesses WHERE id = $1 LIMIT 1`, [id])).rows[0];

        if (!row) return res.status(404).json({ error: 'Not found.' });

        // Deep-links straight into the Stripe dashboard (test vs live inferred
        // from the secret-key prefix) so staff can jump to the real account.
        const liveMode = key ? key.startsWith('sk_live_') : true;
        const dashBase = `https://dashboard.stripe.com/${liveMode ? '' : 'test/'}`;
        const links = {
            customer:     row.stripe_customer_id     ? `${dashBase}customers/${row.stripe_customer_id}`         : null,
            subscription: row.stripe_subscription_id ? `${dashBase}subscriptions/${row.stripe_subscription_id}` : null,
        };

        const out = {
            configured: !!stripe,
            kind,
            comped: !!row.tier_comped,
            effective: kind === 'agent' ? { code: row.effective_code, name: row.effective_name } : { tier: row.effective_tier },
            paid:      kind === 'agent' ? { code: row.paid_membership_code } : { tier: row.paid_tier, status: row.subscription_status },
            subscription: null,
            links,
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

// ─── BILLING ALERTS REPORT + RESUME ─────────────────────────────────────────
// Live Stripe reads are the source of truth. These power the Financials →
// "Billing Alerts" tab and the one-click Resume in an agent's profile.
const _PLAN_LABELS = { basic: 'Standard ($9)', mn_lake_specialist: 'Prime ($39)', top_agent: 'Elite ($149)' };
const _PROBLEM_STATUSES = new Set(['canceled', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired']);

function _billingBase(r) {
    return {
        agent_id: r.agent_id,
        name: r.full_name || '—',
        email: r.email || null,
        tier: _PLAN_LABELS[r.paid_membership_code] || r.paid_membership_code || '—',
        comped: !!r.tier_comped,
        profile_status: r.profile_status,
        is_published: r.is_published,
    };
}

/**
 * GET /api/admin/billing/report
 * Scans every agent with a Stripe subscription on file and returns only the
 * ones in a problem state — canceled, cancels-at-period-end, past_due,
 * unpaid, incomplete(_expired). Resumable ones (cancel-at-period-end, not yet
 * lapsed) are flagged and sorted first because that window is time-sensitive.
 */
const getBillingStatusReport = async (req, res) => {
    let stripe = null;
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) { try { stripe = require('stripe')(key); } catch (_) { stripe = null; } }

    // Businesses store subscription_status locally, so we can report their
    // state (and a summary) with zero Stripe calls — even when Stripe isn't
    // configured. This answers "who's past due?" instantly (T109).
    let businesses = [], summary = { businesses: {}, agents: {} };
    try {
        const bz = await pool.query(
            `SELECT b.id AS business_id, b.name, b.slug, b.tier, b.paid_tier, b.subscription_status,
                    b.tier_comped, u.email
               FROM businesses b LEFT JOIN users u ON u.id = b.user_id
              WHERE b.stripe_subscription_id IS NOT NULL`);
        businesses = bz.rows.filter(r => ['past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired'].includes(r.subscription_status));
        summary.businesses = bz.rows.reduce((m, r) => { const k = r.subscription_status || 'unknown'; m[k] = (m[k] || 0) + 1; return m; }, {});
        const ag = await pool.query(
            `SELECT COUNT(*) FILTER (WHERE stripe_subscription_id IS NOT NULL)::int AS with_sub,
                    COUNT(*) FILTER (WHERE tier_comped)::int AS comped,
                    COUNT(*) FILTER (WHERE paid_membership_code IS NOT NULL AND paid_membership_code <> 'basic')::int AS paid
               FROM agents`);
        summary.agents = ag.rows[0] || {};
    } catch (e) { console.warn('[billing report: businesses]', e.message); }

    if (!stripe) return res.json({ configured: false, count: businesses.length, agents: [], businesses, summary });

    try {
        const { rows } = await pool.query(
            `SELECT a.id AS agent_id, a.stripe_subscription_id, a.paid_membership_code,
                    a.profile_status, a.is_published, a.tier_comped,
                    u.full_name, u.email
               FROM agents a JOIN users u ON u.id = a.user_id
              WHERE a.stripe_subscription_id IS NOT NULL
              ORDER BY a.updated_at DESC
              LIMIT 500`);

        const out = [];
        const CHUNK = 5;   // modest concurrency to stay under Stripe rate limits
        for (let i = 0; i < rows.length; i += CHUNK) {
            const slice = rows.slice(i, i + CHUNK);
            const results = await Promise.all(slice.map(r =>
                stripe.subscriptions.retrieve(r.stripe_subscription_id, { expand: ['items.data.price'] })
                    .then(s => ({ r, s }))
                    .catch(e => ({ r, err: e.message }))));
            for (const { r, s, err } of results) {
                if (err) { out.push({ ..._billingBase(r), status: 'lookup_error', error: err }); continue; }
                const isProblem = _PROBLEM_STATUSES.has(s.status) || s.cancel_at_period_end;
                if (!isProblem) continue;
                const price = s.items?.data?.[0]?.price;
                out.push({
                    ..._billingBase(r),
                    status: s.status,
                    cancel_at_period_end: !!s.cancel_at_period_end,
                    canceled_at:        s.canceled_at        ? new Date(s.canceled_at * 1000).toISOString()        : null,
                    current_period_end: s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null,
                    amount:             price?.unit_amount != null ? price.unit_amount / 100 : null,
                    interval:           price?.recurring?.interval || null,
                    resumable:          !!s.cancel_at_period_end && s.status !== 'canceled',
                });
            }
        }
        out.sort((a, b) =>
            (Number(b.resumable) - Number(a.resumable)) ||
            String(b.canceled_at || '').localeCompare(String(a.canceled_at || '')));
        res.json({ configured: true, count: out.length + businesses.length, agents: out, businesses, summary });
    } catch (err) {
        console.error('[getBillingStatusReport]', err.message);
        res.status(500).json({ error: 'Failed to build billing report.' });
    }
};

/**
 * GET /api/admin/subscriptions — A4 subscription-state dashboard.
 * Every subscription (agent + business) with state, tier, lake, amount, next
 * billing date, and a monthly-normalized MRR contribution. MRR = sum of
 * monthly-equivalent amounts for billable states (active/trialing/past_due) —
 * this is what reconciles against Stripe for the same period.
 */
const getSubscriptionRoster = async (req, res) => {
    let stripe = null;
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) { try { stripe = require('stripe')(key); } catch (_) { stripe = null; } }
    if (!stripe) return res.json({ configured: false, rows: [], totals: { mrr: 0, byState: {} } });

    const MRR_STATES = new Set(['active', 'trialing', 'past_due']);
    const monthly = (amount, interval) => amount == null ? 0 : (interval === 'year' ? amount / 12 : interval === 'week' ? amount * 4.345 : amount);

    try {
        const agents = await pool.query(
            `SELECT a.id, a.stripe_subscription_id AS sub, a.paid_membership_code AS tier, a.tier_comped,
                    u.full_name AS name, u.email,
                    (SELECT l.name FROM agent_lakes al JOIN lakes l ON l.id = al.lake_id
                      WHERE al.agent_id = a.id ORDER BY al.is_founder DESC NULLS LAST LIMIT 1) AS lake
               FROM agents a JOIN users u ON u.id = a.user_id
              WHERE a.stripe_subscription_id IS NOT NULL`);
        const bizs = await pool.query(
            `SELECT b.id, b.stripe_subscription_id AS sub, b.tier, b.tier_comped, b.name, u.email,
                    (SELECT l.name FROM business_lakes bl JOIN lakes l ON l.id = bl.lake_id
                      WHERE bl.business_id = b.id LIMIT 1) AS lake
               FROM businesses b LEFT JOIN users u ON u.id = b.user_id
              WHERE b.stripe_subscription_id IS NOT NULL`);
        const all = [
            ...agents.rows.map(r => ({ ...r, kind: 'agent' })),
            ...bizs.rows.map(r => ({ ...r, kind: 'business' })),
        ];

        const rows = [];
        const CHUNK = 5;
        for (let i = 0; i < all.length; i += CHUNK) {
            const slice = all.slice(i, i + CHUNK);
            const results = await Promise.all(slice.map(r =>
                stripe.subscriptions.retrieve(r.sub, { expand: ['items.data.price'] })
                    .then(s => ({ r, s })).catch(e => ({ r, err: e.message }))));
            for (const { r, s, err } of results) {
                if (err) { rows.push({ kind: r.kind, name: r.name, email: r.email, tier: r.tier, lake: r.lake, state: 'lookup_error', amount: null, mrr: 0 }); continue; }
                const price = s.items?.data?.[0]?.price;
                const amount = price?.unit_amount != null ? price.unit_amount / 100 : null;
                const interval = price?.recurring?.interval || null;
                const state = s.cancel_at_period_end && s.status !== 'canceled' ? 'canceling' : s.status;
                const mrr = MRR_STATES.has(s.status) ? monthly(amount, interval) : 0;
                rows.push({
                    kind: r.kind, name: r.name || '—', email: r.email || null,
                    tier: r.tier || null, comped: !!r.tier_comped, lake: r.lake || null,
                    state, amount, interval,
                    current_period_end: s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null,
                    mrr: Math.round(mrr * 100) / 100,
                });
            }
        }

        // Free agents (published, no active sub, not comped-paying) — count them
        // so the dashboard shows the whole funnel, not just payers.
        const freeAgents = await pool.query(
            `SELECT COUNT(*)::int AS n FROM agents
              WHERE stripe_subscription_id IS NULL AND is_published = true`);

        const byState = rows.reduce((m, r) => { m[r.state] = (m[r.state] || 0) + 1; return m; }, {});
        byState.free = freeAgents.rows[0].n;
        const mrrTotal = Math.round(rows.reduce((s, r) => s + (r.mrr || 0), 0) * 100) / 100;
        rows.sort((a, b) => (b.mrr - a.mrr) || String(a.state).localeCompare(String(b.state)));
        res.json({ configured: true, rows, totals: { mrr: mrrTotal, byState, count: rows.length } });
    } catch (err) {
        console.error('[getSubscriptionRoster]', err.message);
        res.status(500).json({ error: 'Failed to build subscription roster.' });
    }
};

/**
 * POST /api/admin/billing/agent/:id/resume
 * Reverses a "cancel at period end" on an agent's Stripe subscription and, if
 * the cancel had auto-unpublished them, restores them to published. Only works
 * while the subscription is still live — a fully 'canceled' one can't be
 * resumed and must be recreated.
 */
const resumeAgentSubscription = async (req, res) => {
    let stripe = null;
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) { try { stripe = require('stripe')(key); } catch (_) { stripe = null; } }
    if (!stripe) return res.status(400).json({ error: 'Stripe is not configured.' });

    try {
        const { rows } = await pool.query(
            `SELECT id, stripe_subscription_id, profile_status FROM agents WHERE id = $1 LIMIT 1`, [req.params.id]);
        const a = rows[0];
        if (!a) return res.status(404).json({ error: 'Agent not found.' });
        if (!a.stripe_subscription_id) return res.status(400).json({ error: 'No Stripe subscription on file for this agent.' });

        const sub = await stripe.subscriptions.retrieve(a.stripe_subscription_id);
        if (sub.status === 'canceled') {
            return res.status(409).json({ error: 'This subscription is fully canceled and cannot be resumed. It must be recreated — the agent re-subscribes, or you start a new subscription on their existing Stripe customer.' });
        }
        if (!sub.cancel_at_period_end) {
            return res.json({ ok: true, already_active: true, status: sub.status, message: 'Subscription is already set to continue — nothing to resume.' });
        }

        const updated = await stripe.subscriptions.update(a.stripe_subscription_id, { cancel_at_period_end: false });

        // If the cancel had bumped a non-comped agent to pending_review, undo that.
        let republished = false;
        if (a.profile_status === 'pending_review') {
            await pool.query(
                `UPDATE agents SET profile_status = 'published', is_published = true, updated_at = NOW() WHERE id = $1`, [a.id]);
            republished = true;
        }

        // Kill any pending "sorry you left / reactivate" win-back emails — this
        // cancel was a mistake, so the agent should never get churn outreach.
        let winbackCleared = 0;
        try {
            const wb = await pool.query(
                `UPDATE win_back_queue SET canceled = TRUE WHERE agent_id = $1 AND sent_at IS NULL`, [a.id]);
            winbackCleared = wb.rowCount || 0;
        } catch (_) { /* table may not exist in older envs — non-fatal */ }

        logActivity({
            event_type: 'agent.subscription.resumed',
            event_scope: 'billing',
            severity: 'info',
            actor: { type: req.user?.role || 'admin', id: req.user?.userId, label: req.user?.email || 'admin' },
            target: { type: 'agent', id: a.id, label: 'agent' },
            details: { subscription_id: a.stripe_subscription_id, republished, winbackCleared },
            req,
        });

        res.json({ ok: true, status: updated.status, republished, winbackCleared });
    } catch (err) {
        console.error('[resumeAgentSubscription]', err.message);
        res.status(500).json({ error: 'Could not resume the subscription: ' + err.message });
    }
};

// ─── AGENT BILLING EMAILS ────────────────────────────────────────────────────
// Admin-triggered billing notices to an agent (e.g. a failed-payment grace
// notice). Sent to the agent's account email via the shared email service.
const AGENT_BILLING_EMAIL_TYPES = {
    payment_failed_grace: { subject: 'Your MN Lake Homes payment didn’t go through — action needed' },
};

function buildGraceEmailHtml({ first, graceStr, dashUrl }) {
    return `<div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:540px;margin:0 auto;color:#1a202c;">
        <h2 style="margin:0 0 0.75rem;font-size:1.35rem;">Hi ${first},</h2>
        <p style="color:#4a5568;line-height:1.6;">We noticed your most recent <strong>MN Lake Homes</strong> membership payment didn't go through.</p>
        <p style="color:#4a5568;line-height:1.6;">Good news — your profile is <strong>still live</strong>. We've extended a grace period through <strong>${graceStr}</strong> so you don't lose your placement or lead access while you sort it out.</p>
        <p style="color:#4a5568;line-height:1.6;">To keep everything active, please update your payment method before <strong>${graceStr}</strong>. If it isn't resolved by then, your account will lose its access and drop out of the lead rotation.</p>
        <p style="text-align:center;margin:1.6rem 0;"><a href="${dashUrl}" style="background:#1d6df2;color:#fff;text-decoration:none;font-weight:700;padding:0.85rem 1.7rem;border-radius:10px;display:inline-block;">Update my payment →</a></p>
        <p style="color:#718096;font-size:0.9rem;line-height:1.6;">Already fixed it? You can ignore this note. Questions or think this is a mistake? Just reply to this email and we'll help.</p>
        <p style="color:#4a5568;line-height:1.6;margin-top:1.25rem;">— The MN Lake Homes team</p>
    </div>`;
}

/**
 * POST /api/admin/billing/agent/:id/email   { type, grace_until }
 * Sends a billing email to the agent's account email. Reports precisely when
 * email transport isn't configured so the admin knows it didn't actually send.
 */
const sendAgentBillingEmail = async (req, res) => {
    const { type, grace_until } = req.body || {};
    if (!AGENT_BILLING_EMAIL_TYPES[type]) return res.status(400).json({ error: 'Unknown email type.' });
    try {
        const { rows } = await pool.query(
            `SELECT u.email, u.full_name, a.display_name
               FROM agents a JOIN users u ON u.id = a.user_id WHERE a.id = $1 LIMIT 1`, [req.params.id]);
        const a = rows[0];
        if (!a) return res.status(404).json({ error: 'Agent not found.' });
        if (!a.email) return res.status(400).json({ error: 'This agent has no email on file.' });

        const first = (String(a.display_name || a.full_name || 'there').trim().split(/\s+/)[0]) || 'there';
        let graceStr = 'the date on your account';
        if (grace_until) {
            const d = new Date(grace_until + 'T00:00:00');
            if (!isNaN(d.getTime())) graceStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        }
        const dashUrl = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '') + '/pages/agent/dashboard.html';
        const html = buildGraceEmailHtml({ first, graceStr, dashUrl });

        const emailService = require('../services/email');
        const result = await emailService.sendEmail({ to: a.email, subject: AGENT_BILLING_EMAIL_TYPES[type].subject, html, category: 'billing' });

        if (result && result.error) return res.status(502).json({ error: 'Email service error: ' + result.error, to: a.email });
        if (result && result.skipped) {
            return res.status(503).json({
                error: 'Email NOT sent — no email transport is configured on the server. Add RESEND_API_KEY (or GMAIL_USER + GMAIL_APP_PASSWORD) in Render, then try again.',
                to: a.email, not_configured: true,
            });
        }
        logActivity({
            event_type: 'agent.billing_email.sent', event_scope: 'billing', severity: 'info',
            actor: { type: req.user?.role || 'admin', id: req.user?.userId, label: req.user?.email || 'admin' },
            target: { type: 'agent', id: req.params.id, label: 'agent' },
            details: { type, grace_until: grace_until || null, to: a.email }, req,
        });
        res.json({ ok: true, to: a.email });
    } catch (err) {
        console.error('[sendAgentBillingEmail]', err.message);
        res.status(500).json({ error: 'Could not send the email.' });
    }
};

/**
 * GET /api/admin/seo-audit — which lakes & towns are lacking SEO, computed
 * server-side (where the DB is reachable). Buckets: INVISIBLE (404s Google:
 * no hero image / not published / no linked lake) and THIN (renders but weak).
 */
const getSeoAudit = async (req, res) => {
    const MIN_DESC = 300;
    try {
        const lakes = (await pool.query(`
            SELECT slug, name, status,
                (COALESCE(hero_image_url,'') <> '')                                  AS has_hero,
                COALESCE(LENGTH(description),0)                                      AS desc_len,
                (COALESCE(seo_description,'') <> '')                                 AS has_seo_desc,
                (max_depth_ft IS NOT NULL OR surface_acres IS NOT NULL
                   OR water_clarity_ft IS NOT NULL OR shoreline_miles IS NOT NULL)   AS has_data
            FROM lakes ORDER BY name`)).rows;

        const towns = (await pool.query(`
            SELECT t.slug, t.name, t.active, COALESCE(t.state,'MN') AS state,
                (COALESCE(t.hero_image_url,'') <> '')          AS has_hero,
                COALESCE(LENGTH(t.description),0)              AS desc_len,
                (COALESCE(t.seo_description,'') <> '')          AS has_seo_desc,
                -- "content" = someone curated this tag as a real page (hero, body,
                -- intro, or meta set). A tag with none of these is a bare geo-tag
                -- used only for lead routing — it is NOT a broken page.
                (COALESCE(t.hero_image_url,'') <> '' OR COALESCE(t.description,'') <> ''
                   OR COALESCE(t.seo_description,'') <> '' OR COALESCE(t.intro_text,'') <> '') AS has_content,
                EXISTS (SELECT 1 FROM lake_tags lt JOIN lakes l ON l.id = lt.lake_id
                         WHERE lt.tag_id = t.id AND l.status = 'published') AS has_linked_lake
            FROM tags t ORDER BY t.name`)).rows;

        const lakeInvisible = lakes.filter(l => l.status !== 'published' || !l.has_hero)
            .map(l => ({ name: l.name, slug: l.slug, reason: l.status !== 'published' ? 'status=' + l.status : 'no hero image' }));
        // "Thin" = published + rendering but missing a custom meta description
        // (the real, rankable gap). The `description` COLUMN is intentionally NOT
        // counted — lake/town pages render lifestyle/seasons copy, not it, so an
        // empty `description` is a false signal. Lake data (depth/acres) is an
        // enrichment, surfaced as a note but not counted as thin.
        const lakeThin = lakes.filter(l => l.status === 'published' && l.has_hero && !l.has_seo_desc)
            .map(l => ({ name: l.name, slug: l.slug, issues: ['no meta description'] }));

        // Only MN towns that were CURATED (have content) are meant to be lake-town
        // pages. Bare geo-tags are routing-only (intentional), and out-of-state
        // cities are not MN lake markets — neither belongs in the alarm bucket.
        const isMN = t => t.state === 'MN';
        const townPages   = towns.filter(t => t.has_content && isMN(t));
        const townLive    = townPages.filter(t => t.active && t.has_hero && t.has_linked_lake);
        const townNeedsAttention = townPages
            .filter(t => !(t.active && t.has_hero && t.has_linked_lake))
            .map(t => ({ name: t.name, slug: t.slug, reason: !t.active ? 'curated but inactive' : !t.has_hero ? 'no hero image' : 'no published lake linked' }));
        const townThin = townLive.filter(t => !t.has_seo_desc)
            .map(t => ({ name: t.name, slug: t.slug, issues: ['no meta description'] }));
        const townGeoOnly    = towns.filter(t => !t.has_content).length;                 // routing tags, intentional
        const townOutOfState = towns.filter(t => t.has_content && !isMN(t)).length;       // ND/WI cities — not MN markets

        res.json({
            lakes: { total: lakes.length, invisible: lakeInvisible, thin: lakeThin,
                     solid: lakes.length - lakeInvisible.length - lakeThin.length },
            towns: {
                total: towns.length,
                live: townLive.length,
                needs_attention: townNeedsAttention,   // curated MN pages that aren't rendering — the real to-do
                thin: townThin,                         // live but missing a meta description
                geo_only: townGeoOnly,                  // bare routing tags — intentionally not pages
                out_of_state: townOutOfState,           // ND/WI cities with content — not MN markets, leave hidden
            },
        });
    } catch (err) {
        console.error('[getSeoAudit]', err.message);
        res.status(500).json({ error: 'Failed to run SEO audit: ' + err.message });
    }
};

/**
 * GET /api/admin/lead-reconciliation?from=&to=  (T017)
 * Ties out the lead pipeline for a date range: how many were submitted, reached
 * HubSpot, and got routed to an agent — so any gap (a leak) is visible. Dates are
 * ISO (YYYY-MM-DD); defaults to the last 30 days.
 */
const getLeadReconciliation = async (req, res) => {
    try {
        const to   = req.query.to   ? new Date(req.query.to + 'T23:59:59') : new Date();
        const from = req.query.from ? new Date(req.query.from + 'T00:00:00') : new Date(to.getTime() - 30 * 86400000);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) return res.status(400).json({ error: 'Invalid from/to date.' });

        const { rows } = await pool.query(`
            SELECT
              COUNT(*) FILTER (WHERE NOT COALESCE(is_partial,false))                                 AS submitted,
              COUNT(*) FILTER (WHERE NOT COALESCE(is_partial,false) AND COALESCE(email,'') <> '')     AS with_email,
              COUNT(*) FILTER (WHERE hs_contact_id IS NOT NULL)                                       AS reached_hubspot,
              COUNT(*) FILTER (WHERE assigned_user_id IS NOT NULL)                                    AS routed,
              COUNT(*) FILTER (WHERE NOT COALESCE(is_partial,false) AND assigned_user_id IS NULL)     AS unrouted,
              COUNT(*) FILTER (WHERE pipeline_status = 'failed')                                       AS failed,
              COUNT(*) FILTER (WHERE COALESCE(is_partial,false))                                       AS partial_abandoned
            FROM leads
            WHERE created_at >= $1 AND created_at <= $2`,
            [from.toISOString(), to.toISOString()]);

        const r = rows[0] || {};
        const n = k => parseInt(r[k], 10) || 0;
        const submitted = n('submitted'), withEmail = n('with_email'), reachedHs = n('reached_hubspot'), routed = n('routed');

        res.json({
            from: from.toISOString().slice(0, 10),
            to:   to.toISOString().slice(0, 10),
            counts: {
                submitted, with_email: withEmail, reached_hubspot: reachedHs,
                routed, unrouted: n('unrouted'), failed: n('failed'),
                partial_abandoned: n('partial_abandoned'),
            },
            gaps: {
                // Leads with an email that never got a HubSpot contact id = a sync leak.
                hubspot_leak: Math.max(0, withEmail - reachedHs),
                // Submitted but no agent assigned = a routing gap (may be legitimately
                // awaiting manual assignment; investigate if persistent).
                routing_gap: n('unrouted'),
            },
        });
    } catch (err) {
        console.error('[getLeadReconciliation]', err.message);
        res.status(500).json({ error: 'Failed to reconcile: ' + err.message });
    }
};

/**
 * GET /api/admin/routing-sla?days=7 — routing latency (T021).
 * median + p95 time-to-first-agent, plus the >30-min manual gap and anything
 * still unrouted. Powers the SLA tile on the reconciliation page.
 */
const getRoutingSla = async (req, res) => {
    try {
        const { computeRoutingSla } = require('../services/routing-sla');
        const data = await computeRoutingSla({ days: Number(req.query.days) || 7 });
        res.json(data);
    } catch (err) {
        console.error('[getRoutingSla]', err.message);
        res.status(500).json({ error: 'Failed to compute routing SLA: ' + err.message });
    }
};

/**
 * GET /api/admin/lead-density  (?format=csv) — DEV-06.
 * One row per published lake: leads 30d/90d/all, buyer/seller split, top price
 * band, whether a paying agent covers it, median time-to-claim, unclaimed leads.
 * Pre-aggregated in a single query. A lead is attributed to a lake by its
 * first-touch landing_page_lake, falling back to its resolved lake_id.
 */
const getLeadDensity = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            WITH lead_lake AS (
                SELECT ld.id, ld.lead_type, ld.created_at, ld.routed_at, ld.assigned_user_id, ld.price_band, ld.lead_grade,
                       COALESCE(NULLIF(ld.landing_page_lake, ''), lk.slug) AS lake_slug
                  FROM leads ld
                  LEFT JOIN lakes lk ON lk.id = ld.lake_id
                 -- B1: Unqualified leads are excluded from every count here.
                 WHERE ld.deleted_at IS NULL AND COALESCE(ld.lead_grade, '') <> 'Unqualified'
            ),
            -- Paying agent per lake. "Paying" = membership tier (via membership_id
            -- -> memberships.code) is not free, OR the seat is comped. Association
            -- mirrors the public lake page: direct agent_lakes OR a shared geo tag
            -- (user_tags <-> lake_tags). Few agents, so the cross-check is cheap.
            paying AS (
                SELECT l.id AS lake_id, MIN(COALESCE(a.display_name, u.full_name)) AS agent_name
                  FROM lakes l
                  JOIN agents a ON a.is_published = TRUE AND a.deleted_at IS NULL
                  JOIN users u ON u.id = a.user_id
                  LEFT JOIN memberships m ON m.id = a.membership_id
                 WHERE ((COALESCE(m.code, 'free') <> 'free') OR a.tier_comped = TRUE)
                   AND (
                        EXISTS (SELECT 1 FROM agent_lakes al WHERE al.agent_id = a.id AND al.lake_id = l.id)
                     OR EXISTS (SELECT 1 FROM user_tags ut JOIN lake_tags lt ON lt.tag_id = ut.tag_id
                                 WHERE ut.user_id = a.user_id AND lt.lake_id = l.id)
                   )
                 GROUP BY l.id
            )
            SELECT l.id, l.name, l.slug, l.market_tier,
                   COUNT(ll.id) FILTER (WHERE ll.created_at >= NOW() - INTERVAL '30 days')::int AS leads_30d,
                   COUNT(ll.id) FILTER (WHERE ll.created_at >= NOW() - INTERVAL '90 days')::int AS leads_90d,
                   COUNT(ll.id)::int AS leads_all,
                   -- A/B = the number promised to agents; C is shown separately, never folded in.
                   COUNT(ll.id) FILTER (WHERE ll.lead_grade IN ('A','B') AND ll.created_at >= NOW() - INTERVAL '90 days')::int AS qualified_90d,
                   COUNT(ll.id) FILTER (WHERE ll.lead_grade = 'C' AND ll.created_at >= NOW() - INTERVAL '90 days')::int AS grade_c_90d,
                   COUNT(ll.id) FILTER (WHERE ll.lead_type = 'buyer')::int  AS buyers,
                   COUNT(ll.id) FILTER (WHERE ll.lead_type = 'seller')::int AS sellers,
                   COUNT(ll.id) FILTER (WHERE ll.assigned_user_id IS NULL)::int AS unclaimed,
                   ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ll.routed_at - ll.created_at)))
                         FILTER (WHERE ll.routed_at IS NOT NULL AND ll.routed_at >= ll.created_at))::int AS median_ttc_sec,
                   mode() WITHIN GROUP (ORDER BY ll.price_band) FILTER (WHERE ll.price_band IS NOT NULL) AS top_price_band,
                   (pay.lake_id IS NOT NULL) AS has_paying_agent,
                   pay.agent_name
              FROM lakes l
              LEFT JOIN lead_lake ll ON ll.lake_slug = l.slug
              LEFT JOIN paying pay ON pay.lake_id = l.id
             WHERE l.status = 'published'
             GROUP BY l.id, l.name, l.slug, l.market_tier, pay.lake_id, pay.agent_name
             ORDER BY leads_90d DESC, leads_all DESC, l.name ASC
        `);

        // Top-line totals — Unqualified excluded everywhere; grades broken out.
        // Unqualified/grade_c reported for transparency but never folded into the
        // qualified number an agent is quoted.
        const totals = await pool.query(`
            SELECT COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days' AND COALESCE(lead_grade,'') <> 'Unqualified')::int AS t30,
                   COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days' AND COALESCE(lead_grade,'') <> 'Unqualified')::int AS t90,
                   COUNT(*) FILTER (WHERE COALESCE(lead_grade,'') <> 'Unqualified')::int AS tall,
                   COUNT(*) FILTER (WHERE lead_grade IN ('A','B') AND created_at >= NOW() - INTERVAL '90 days')::int AS qualified_90d,
                   COUNT(*) FILTER (WHERE lead_grade = 'C' AND created_at >= NOW() - INTERVAL '90 days')::int AS grade_c_90d,
                   COUNT(*) FILTER (WHERE lead_grade = 'Unqualified' AND created_at >= NOW() - INTERVAL '90 days')::int AS unqualified_90d
              FROM leads WHERE deleted_at IS NULL`);
        // B3: an open-opportunity lake has >=1 QUALIFIED (A/B) lead in 90d and no paying agent.
        const openOpportunity = rows.filter(r => r.qualified_90d >= 1 && !r.has_paying_agent).length;
        const attributed90 = rows.reduce((s, r) => s + r.leads_90d, 0);
        const t = totals.rows[0];
        const summary = {
            total_30d: t.t30, total_90d: t.t90, total_all: t.tall,
            qualified_90d: t.qualified_90d,   // A + B — the promised number
            grade_c_90d: t.grade_c_90d,       // shown separately, never quoted
            unqualified_90d: t.unqualified_90d, // excluded from every count above
            attributed_90d: attributed90,
            // Leads in the last 90d not tied to any lake (no landing_page_lake and
            // no resolved lake_id) — e.g. general contact / agent-inquiry leads.
            unattributed_90d: Math.max(0, t.t90 - attributed90),
            open_opportunity_lakes: openOpportunity,
            lakes: rows.length,
        };

        if ((req.query.format || '').toLowerCase() === 'csv') {
            const cols = ['name', 'slug', 'market_tier', 'leads_30d', 'leads_90d', 'leads_all', 'buyers', 'sellers', 'unclaimed', 'median_ttc_sec', 'top_price_band', 'has_paying_agent', 'agent_name'];
            const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
            const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => esc(r[c])).join(','))).join('\n');
            res.set('Content-Type', 'text/csv; charset=utf-8');
            res.set('Content-Disposition', 'attachment; filename="lead-density.csv"');
            return res.send(csv);
        }
        res.json({ summary, rows });
    } catch (err) {
        console.error('[getLeadDensity]', err.message);
        res.status(500).json({ error: 'Failed to compute lead density: ' + err.message });
    }
};

/**
 * POST /api/admin/hubspot/ensure-schema — B1/B4/T025.
 * Idempotently creates the 4 lead-qualification contact properties, the
 * Agent Acquisition deal pipeline (8 stages), and its deal properties in
 * HubSpot. Safe to re-run. Owner-only (it mutates the CRM schema).
 */
const ensureHubspotSchema = async (req, res) => {
    try {
        const hubspot = require('../services/hubspot');
        const report = await hubspot.ensureSchema();
        res.json({ ok: true, report });
    } catch (err) {
        console.error('[ensureHubspotSchema]', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
};

/**
 * GET /api/admin/:id/emails — every email the app has sent to this agent's
 * account address (welcome, lead notices, billing, etc.), newest first.
 */
const getAgentEmailHistory = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.email FROM agents a JOIN users u ON u.id = a.user_id WHERE a.id = $1 LIMIT 1`, [req.params.id]);
        const email = rows[0]?.email;
        if (!email) return res.json({ email: null, emails: [] });
        const logs = await pool.query(
            `SELECT subject, category, status, detail, created_at
               FROM email_log WHERE LOWER(to_email) = LOWER($1)
              ORDER BY created_at DESC LIMIT 200`, [email]);
        res.json({ email, emails: logs.rows });
    } catch (err) {
        console.error('[getAgentEmailHistory]', err.message);
        res.status(500).json({ error: 'Failed to load email history.' });
    }
};

// ─── Tag launch presets ──────────────────────────────────────────────────────
// One-shot bulk active flip on the tags table. Currently supports the
// 'top-20-mn-cities' preset — activates the 20 largest MN cities by 2020
// census population and deactivates every other MN tag. Both spelling
// variants (Saint vs. St.) are matched case-insensitively. Lakes outside
// MN and lake/county tags are left untouched.
const TAG_PRESETS = {
    'top-20-mn-cities': {
        state: 'MN',
        names: [
            'Minneapolis', 'Saint Paul', 'St. Paul', 'St Paul',
            'Rochester', 'Duluth', 'Bloomington', 'Brooklyn Park', 'Plymouth',
            'Maple Grove', 'Woodbury', 'Saint Cloud', 'St. Cloud', 'St Cloud',
            'Eagan', 'Eden Prairie', 'Coon Rapids', 'Burnsville', 'Blaine',
            'Lakeville', 'Minnetonka', 'Apple Valley', 'Edina',
            'Saint Louis Park', 'St. Louis Park', 'St Louis Park',
        ],
    },
};

// Normalize on the SQL side too — lowercase, strip dots, collapse whitespace.
// Lets the IN clause match "St. Paul" / "St Paul" / "Saint Paul" as one row.
const normalizeForMatch = (s) => String(s || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

const applyTagLaunchPreset = async (req, res) => {
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only.' });
    }
    const presetKey = String(req.body?.preset || '');
    const preset = TAG_PRESETS[presetKey];
    if (!preset) return res.status(400).json({ error: `Unknown preset "${presetKey}".` });

    const wantedNorm = [...new Set(preset.names.map(normalizeForMatch))];

    try {
        // Single statement — activate matching names, deactivate every
        // other tag in the same state. Normalizes both sides so spelling
        // variants collide. Returns rows so we can count what flipped.
        const { rows } = await pool.query(
            `WITH wanted AS (SELECT UNNEST($2::text[]) AS n),
             flips AS (
                 UPDATE tags
                    SET active = (
                        SELECT EXISTS (
                            SELECT 1 FROM wanted w
                             WHERE w.n = regexp_replace(regexp_replace(lower(tags.name), '\\.', '', 'g'), '\\s+', ' ', 'g')
                        )
                    ),
                    updated_at = NOW()
                  WHERE tags.state = $1
                  RETURNING id, active
             )
             SELECT
                 SUM(CASE WHEN active     THEN 1 ELSE 0 END)::int AS activated,
                 SUM(CASE WHEN NOT active THEN 1 ELSE 0 END)::int AS deactivated
             FROM flips`,
            [preset.state, wantedNorm]
        );
        const activated   = rows[0]?.activated   || 0;
        const deactivated = rows[0]?.deactivated || 0;

        logActivity({
            event_type: 'tag.launch_preset.apply',
            event_scope: 'system',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            details: { preset: presetKey, activated, deactivated },
            req,
        });

        res.json({ success: true, preset: presetKey, activated, deactivated });
    } catch (err) {
        console.error('[applyTagLaunchPreset]', err.message);
        res.status(500).json({ error: 'Failed to apply preset.' });
    }
};

// ─── Lake launch seed ────────────────────────────────────────────────────────
// Bulk-inserts a curated list of "top 25 MN lakes not already in the DB"
// from src/data/top-25-mn-lakes.json. Each lake is processed independently:
//   - INSERT … ON CONFLICT (slug) DO NOTHING so re-running is safe (no dupes).
//   - If lat/lng are omitted, geocodes from "<name>, MN" via the existing
//     geocoder service (same pattern lake.controller.create uses).
//   - After insert, attaches the lake to any town tags whose name matches
//     one of the lake's tag_towns list (case-insensitive, normalized). Tags
//     that don't exist yet are simply skipped — the admin can wire them
//     later from the Connected tab in entity-edit.
// Returns counts for inserted / skipped / tagged so the caller can render
// "X added, Y already existed, Z tag links made" in a toast.
const { geocodeAddress } = require('../services/geocoder');
const fs = require('fs');
const path = require('path');

const normalizeTagName = (s) => String(s || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

async function applyLakeLaunchSeed(req, res) {
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only.' });
    }

    let lakes;
    try {
        const file = path.join(__dirname, '..', 'data', 'top-25-mn-lakes.json');
        lakes = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        console.error('[applyLakeLaunchSeed] load failed:', err.message);
        return res.status(500).json({ error: 'Failed to load lake seed file.' });
    }

    let inserted = 0, skipped = 0, geocoded = 0, tagLinks = 0;
    const insertedSlugs = [];

    for (const lake of lakes) {
        try {
            let lat = lake.latitude, lng = lake.longitude;
            if (lat == null || lng == null) {
                const g = await geocodeAddress(`${lake.name}, ${lake.state || 'MN'}`).catch(() => null);
                if (g) { lat = g.lat; lng = g.lng; geocoded++; }
            }

            // INSERT … ON CONFLICT skips the row if the slug already exists,
            // but still returns rowCount = 0 so we can distinguish first-time
            // inserts from re-runs.
            const { rows } = await pool.query(
                `INSERT INTO lakes
                   (slug, name, state, region, county, latitude, longitude,
                    intro_text, seo_title, seo_description, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'published')
                 ON CONFLICT (slug) DO NOTHING
                 RETURNING id, slug, name`,
                [
                    lake.slug, lake.name, lake.state || 'MN',
                    lake.region || null, lake.county || null,
                    lat, lng,
                    lake.intro_text || null,
                    lake.seo_title || null,
                    lake.seo_description || null,
                ]
            );

            if (!rows.length) { skipped++; continue; }
            inserted++;
            insertedSlugs.push(rows[0].slug);

            // Best-effort tag linking — match the lake's tag_towns list
            // against existing town tags by normalized name. Existing tags
            // get linked; missing ones are silently dropped so an admin can
            // add them later via the Connected tab.
            const wantTowns = Array.isArray(lake.tag_towns) ? lake.tag_towns : [];
            for (const town of wantTowns) {
                const norm = normalizeTagName(town);
                if (!norm) continue;
                const tagRes = await pool.query(
                    `SELECT id FROM tags
                      WHERE state = $1
                        AND regexp_replace(regexp_replace(lower(name), '\\.', '', 'g'), '\\s+', ' ', 'g') = $2
                        AND active = TRUE
                      LIMIT 1`,
                    [lake.state || 'MN', norm]
                );
                if (!tagRes.rowCount) continue;
                const linkRes = await pool.query(
                    `INSERT INTO lake_tags (lake_id, tag_id)
                     VALUES ($1, $2)
                     ON CONFLICT (lake_id, tag_id) DO NOTHING
                     RETURNING id`,
                    [rows[0].id, tagRes.rows[0].id]
                );
                if (linkRes.rowCount) tagLinks++;
            }
        } catch (err) {
            console.error(`[applyLakeLaunchSeed] ${lake.slug} failed:`, err.message);
            // Move on — one bad row shouldn't take down the whole seed.
        }
    }

    logActivity({
        event_type: 'lake.launch_seed.apply',
        event_scope: 'system',
        actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
        details: { inserted, skipped, geocoded, tag_links: tagLinks, total: lakes.length, slugs: insertedSlugs },
        req,
    });

    res.json({ success: true, total: lakes.length, inserted, skipped, geocoded, tag_links: tagLinks, slugs: insertedSlugs });
}

// ─── ADMIN INVITES (comped agent / business with credentialed email) ────────
// Used when an admin wants to onboard a partner without making them sign
// up + pay. Generates a strong-but-typeable temp password, creates the
// user account fully comped (tier_comped = TRUE), and emails the login
// URL + credentials + a "finish your profile" walkthrough.
const emailService = require('../services/email');

const VALID_AGENT_TIERS = new Set(['basic', 'mn_lake_specialist', 'top_agent', 'premium', 'founder']);
const VALID_BUSINESS_TIERS = new Set(['basic', 'premium']);
const VALID_BUSINESS_TYPES = new Set([
    'restaurant', 'marina', 'service', 'photographer',
    'builder', 'boat_rental', 'outdoor_recreation', 'other',
]);

const TIER_LABEL = {
    basic: 'Basic',
    mn_lake_specialist: 'MN Lake Specialist',
    top_agent: 'Top Agent',
    premium: 'Premium',
    founder: 'Founder',
};

// Mixed-case + digits, 12 chars, no easily-confused glyphs (no O/0, l/1).
function generateTempPassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    const buf = require('crypto').randomBytes(12);
    for (let i = 0; i < 12; i++) out += alphabet[buf[i] % alphabet.length];
    return out;
}

function slugifyName(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

/**
 * POST /api/admin/invite-agent
 * Body: { first_name, last_name, email, brokerage_name?, license_number?, comp_tier }
 * Creates a comped agent account, sends them a credentials email, and
 * returns the temp password so the admin can re-share if the email failed.
 */
const inviteAgent = async (req, res) => {
    let { first_name, last_name, email, brokerage_name, license_number, comp_tier } = req.body || {};
    first_name = String(first_name || '').trim();
    last_name  = String(last_name  || '').trim();
    email      = String(email      || '').trim().toLowerCase();
    comp_tier  = String(comp_tier || 'mn_lake_specialist').trim();

    if (!first_name || !email) return res.status(400).json({ error: 'First name and email are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format.' });
    if (!VALID_AGENT_TIERS.has(comp_tier)) return res.status(400).json({ error: `Unknown comp tier "${comp_tier}".` });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const dup = await client.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
        if (dup.rowCount) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'A user with that email already exists.' });
        }

        const tempPassword = generateTempPassword();
        const hash = await bcrypt.hash(tempPassword, 10);
        const display_name = `${first_name} ${last_name}`.trim();

        const userRes = await client.query(
            `INSERT INTO users (first_name, last_name, full_name, email, password_hash,
                                role, account_status, password_changed_at)
             VALUES ($1, $2, $3, $4, $5, 'agent', 'active', NOW())
             RETURNING id`,
            [first_name, last_name, display_name, email, hash]
        );
        const userId = userRes.rows[0].id;

        const memRes = await client.query(`SELECT id FROM memberships WHERE code = $1 LIMIT 1`, [comp_tier]);
        if (!memRes.rowCount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Membership tier "${comp_tier}" not found in the DB.` });
        }
        const membershipId = memRes.rows[0].id;

        // Unique slug — append numeric suffix on collision.
        let slug = slugifyName(display_name) || `agent-${userId.slice(0, 8)}`;
        const slugCheck = await client.query(`SELECT slug FROM agents WHERE slug LIKE $1`, [`${slug}%`]);
        if (slugCheck.rowCount) slug = `${slug}-${slugCheck.rowCount}`;

        await client.query(
            `INSERT INTO agents (user_id, membership_id, slug, display_name, brokerage_name,
                                 license_number, profile_status, is_published, tier_comped)
             VALUES ($1, $2, $3, $4, $5, $6, 'draft', false, TRUE)`,
            [userId, membershipId, slug, display_name,
             brokerage_name?.trim() || null, license_number?.trim() || null]
        );

        await client.query('COMMIT');

        // Await the send so we can report whether it ACTUALLY went out.
        let inviteEmail;
        try {
            inviteEmail = await emailService.sendAgentInvite({
                to: email,
                first_name,
                tier_label: TIER_LABEL[comp_tier] || comp_tier,
                tempPassword,
            });
        } catch (err) {
            inviteEmail = { error: err.message };
            console.error('[inviteAgent] email failed:', err.message);
        }
        const emailSent  = !!(inviteEmail && inviteEmail.data);
        const emailError = (inviteEmail && inviteEmail.error)
            || (inviteEmail && inviteEmail.skipped ? 'No email transport configured on the server (set GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY, in Render).' : null);
        if (!emailSent) console.warn('[inviteAgent] invite email NOT sent to', email, '—', emailError || 'unknown reason');

        logActivity({
            event_type: 'agent.invite.send',
            event_scope: 'agents',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'user', id: userId, label: email },
            details: { comp_tier, brokerage_name: brokerage_name || null },
            req,
        });

        res.status(201).json({
            success: true,
            user_id: userId,
            email,
            comp_tier,
            tempPassword,     // returned so admin can copy/paste if email fails
            login_url: `${(process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '')}/pages/public/agent-login.html`,
            email_sent: emailSent,
            email_error: emailError,
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[inviteAgent]', err.message);
        res.status(500).json({ error: 'Failed to invite agent.' });
    } finally {
        client.release();
    }
};

/**
 * POST /api/admin/invite-business
 * Body: { first_name, last_name, email, business_name, business_type, comp_tier }
 * Creates a comped business listing + owner account, sends the credentials
 * email, and returns the temp password.
 */
const inviteBusiness = async (req, res) => {
    let { first_name, last_name, email, business_name, business_type, comp_tier } = req.body || {};
    first_name    = String(first_name    || '').trim();
    last_name     = String(last_name     || '').trim();
    email         = String(email         || '').trim().toLowerCase();
    business_name = String(business_name || '').trim().slice(0, 200);
    business_type = String(business_type || '').trim().toLowerCase().slice(0, 40);
    comp_tier     = String(comp_tier || 'basic').trim();

    if (!first_name || !email)   return res.status(400).json({ error: 'First name and email are required.' });
    if (!business_name)          return res.status(400).json({ error: 'Business name is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format.' });
    if (!VALID_BUSINESS_TYPES.has(business_type))  return res.status(400).json({ error: `Unknown business type "${business_type}".` });
    if (!VALID_BUSINESS_TIERS.has(comp_tier))      return res.status(400).json({ error: `Unknown comp tier "${comp_tier}".` });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const dup = await client.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
        if (dup.rowCount) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'A user with that email already exists.' });
        }

        const tempPassword = generateTempPassword();
        const hash = await bcrypt.hash(tempPassword, 10);
        const display_name = `${first_name} ${last_name}`.trim() || business_name;

        const userRes = await client.query(
            `INSERT INTO users (first_name, last_name, full_name, email, password_hash,
                                role, account_status, password_changed_at)
             VALUES ($1, $2, $3, $4, $5, 'business_owner', 'active', NOW())
             RETURNING id`,
            [first_name, last_name, display_name, email, hash]
        );
        const userId = userRes.rows[0].id;

        // Unique slug — append short random suffix on collision.
        let slug = slugifyName(`${business_type}-${business_name}`) || `business-${userId.slice(0, 8)}`;
        const slugCheck = await client.query(`SELECT 1 FROM businesses WHERE slug = $1`, [slug]);
        if (slugCheck.rowCount) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

        // Invited businesses land in 'pending' (NOT public) so the owner can
        // log in and finish their profile first — same as a self-signup. Admin
        // flips status → 'active' to publish once it looks good. They're still
        // comped: subscription_status = 'active' + tier_comped = TRUE so the
        // Stripe webhook can't downgrade them (no real subscription), and the
        // public filter (status='active' AND (subscription_status='active' OR
        // tier_comped)) shows them the moment they're approved.
        await client.query(
            `INSERT INTO businesses
               (user_id, slug, name, type, state, status,
                subscription_status, tier, tier_comped)
             VALUES ($1, $2, $3, $4, 'MN', 'pending',
                     'active', $5, TRUE)`,
            [userId, slug, business_name, business_type, comp_tier]
        );

        await client.query('COMMIT');

        // Await the send and capture whether it ACTUALLY went out, so the admin
        // is never falsely told "invite sent" when the transport silently drops it.
        let inviteEmail;
        try {
            inviteEmail = await emailService.sendBusinessInvite({
                to: email,
                first_name,
                business_name,
                tier_label: TIER_LABEL[comp_tier] || comp_tier,
                tempPassword,
            });
        } catch (err) {
            inviteEmail = { error: err.message };
            console.error('[inviteBusiness] email failed:', err.message);
        }
        const emailSent  = !!(inviteEmail && inviteEmail.data);
        const emailError = (inviteEmail && inviteEmail.error)
            || (inviteEmail && inviteEmail.skipped ? 'No email transport configured on the server (set GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY, in Render).' : null);
        if (!emailSent) console.warn('[inviteBusiness] invite email NOT sent to', email, '—', emailError || 'unknown reason');

        logActivity({
            event_type: 'business.invite.send',
            event_scope: 'business',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'user', id: userId, label: email },
            details: { comp_tier, business_name, business_type, slug },
            req,
        });

        res.status(201).json({
            success: true,
            user_id: userId,
            email,
            comp_tier,
            business_slug: slug,
            tempPassword,
            login_url: `${(process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '')}/pages/public/business-login.html`,
            email_sent: emailSent,
            email_error: emailError,
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[inviteBusiness]', err.message);
        res.status(500).json({ error: 'Failed to invite business.' });
    } finally {
        client.release();
    }
};

// ─── PAYMENT HISTORY (Stripe invoices mirrored locally + to HubSpot) ────────
// Three lookup shapes — by user_id (the canonical key in the payments
// table), by agent_id (used by agent-review.html which holds the agent
// PK, not the user_id), and by business_id (used by entity-edit.html for
// businesses). All return the same shape so the UI can stay simple.
//
// Source-of-truth strategy: the local `payments` table is a cache for
// HubSpot mirror status (the hs_note_id we wrote when the invoice landed
// via webhook). It is NOT the source of truth for "which invoices exist"
// — Stripe is. Webhook delivery is unreliable (ordering races, secret
// rotations, prior-incident outages) and we've been bitten by orphans
// where Stripe has invoices that the local table never captured.
//
// So this function fetches the live Stripe invoice list for the customer
// and merges it with the local table. Every invoice Stripe knows about
// shows up; the hs_note_id column comes from the local row if one exists.
// Result: the Payments tab is always accurate even when the webhook missed.
function stripeFromEnv() {
    try {
        const key = process.env.STRIPE_SECRET_KEY;
        return key ? require('stripe')(key) : null;
    } catch (_) { return null; }
}

async function fetchStripeInvoicesForCustomer(customerId) {
    const stripe = stripeFromEnv();
    if (!stripe || !customerId) return [];
    try {
        // Pull recent invoices in one round trip. 24 covers two years of
        // monthly billing — plenty for the admin Payments tab. If we ever
        // need more, the auto-paginator does the right thing.
        const out = [];
        for await (const inv of stripe.invoices.list({ customer: customerId, limit: 24 })) {
            out.push(inv);
            if (out.length >= 100) break;
        }
        return out;
    } catch (err) {
        console.error('[loadPaymentsForUser] Stripe invoices.list failed:', err.message);
        return [];
    }
}

function mapStripeStatusToLocal(s) {
    // Stripe statuses: draft, open, paid, uncollectible, void.
    // Local statuses: paid, failed, refunded. Map to a 1-liner the UI
    // already renders cleanly.
    if (s === 'paid') return 'paid';
    if (s === 'uncollectible' || s === 'open') return 'failed';
    if (s === 'void') return 'refunded';
    return s || 'unknown';
}

function stripeInvoiceToRow(inv) {
    const line = inv.lines?.data?.[0];
    return {
        id: null, // synthetic — no local row yet
        amount_cents: inv.status === 'paid' ? (inv.amount_paid || 0) : (inv.amount_due || 0),
        currency: (inv.currency || 'usd').toLowerCase(),
        status: mapStripeStatusToLocal(inv.status),
        description: line?.description || inv.description || inv.billing_reason || null,
        invoice_url: inv.hosted_invoice_url || null,
        invoice_pdf: inv.invoice_pdf || null,
        period_start: line?.period?.start ? new Date(line.period.start * 1000).toISOString() : null,
        period_end:   line?.period?.end   ? new Date(line.period.end   * 1000).toISOString() : null,
        stripe_invoice_id: inv.id,
        hs_note_id: null, // unknown until we cross-reference local rows
        created_at: inv.created ? new Date(inv.created * 1000).toISOString() : null,
    };
}

async function loadPaymentsForUser(userId) {
    if (!userId) return { payments: [], hs_contact_url: null };

    // Pull local payments + the user's HubSpot id + the user's Stripe
    // customer id from whichever table owns them (agents takes precedence
    // since the same user_id could in theory exist in both).
    const [paymentsRes, userRes, agentRes, bizRes] = await Promise.all([
        pool.query(
            `SELECT id, amount_cents, currency, status, description,
                    invoice_url, invoice_pdf, period_start, period_end,
                    stripe_invoice_id, hs_note_id, created_at
               FROM payments
              WHERE user_id = $1
           ORDER BY created_at DESC`,
            [userId]
        ),
        pool.query(`SELECT hs_contact_id FROM users WHERE id = $1`, [userId]),
        pool.query(`SELECT stripe_customer_id FROM agents     WHERE user_id = $1 LIMIT 1`, [userId]),
        pool.query(`SELECT stripe_customer_id FROM businesses WHERE user_id = $1 LIMIT 1`, [userId]),
    ]);
    const localRows = paymentsRes.rows;
    const customerId = agentRes.rows[0]?.stripe_customer_id || bizRes.rows[0]?.stripe_customer_id || null;

    // Fetch live Stripe invoices and merge by stripe_invoice_id. Local
    // row wins for hs_note_id and the local primary key; Stripe wins for
    // everything else so amount/status/period reflect Stripe truth.
    const stripeInvoices = await fetchStripeInvoicesForCustomer(customerId);
    const localByInvoice = new Map(localRows.filter(r => r.stripe_invoice_id).map(r => [r.stripe_invoice_id, r]));
    const merged = [];
    for (const inv of stripeInvoices) {
        const row = stripeInvoiceToRow(inv);
        const local = localByInvoice.get(inv.id);
        if (local) {
            row.id         = local.id;
            row.hs_note_id = local.hs_note_id;
        }
        merged.push(row);
    }
    // Bring in any local rows Stripe didn't return (extremely rare —
    // would mean an invoice was deleted in Stripe but kept locally).
    for (const local of localRows) {
        if (!local.stripe_invoice_id || !stripeInvoices.find(i => i.id === local.stripe_invoice_id)) {
            merged.push(local);
        }
    }
    // Sort newest first by created_at (string ISO compares correctly).
    merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    return {
        payments: merged,
        hs_contact_url: hubspot.getPortalContactUrl(userRes.rows[0]?.hs_contact_id),
        hs_synced: !!userRes.rows[0]?.hs_contact_id,
    };
}

const getPaymentsForUser = async (req, res) => {
    try {
        const data = await loadPaymentsForUser(req.params.id);
        res.json(data);
    } catch (err) {
        console.error('[getPaymentsForUser]', err.message);
        res.status(500).json({ error: 'Failed to load payments.' });
    }
};

const getPaymentsForAgent = async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT user_id FROM agents WHERE id = $1 LIMIT 1`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Agent not found.' });
        const data = await loadPaymentsForUser(rows[0].user_id);
        res.json(data);
    } catch (err) {
        console.error('[getPaymentsForAgent]', err.message);
        res.status(500).json({ error: 'Failed to load payments.' });
    }
};

const getPaymentsForBusiness = async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT user_id FROM businesses WHERE id = $1 LIMIT 1`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Business not found.' });
        const data = await loadPaymentsForUser(rows[0].user_id);
        res.json(data);
    } catch (err) {
        console.error('[getPaymentsForBusiness]', err.message);
        res.status(500).json({ error: 'Failed to load payments.' });
    }
};

// ─── REVENUE SNAPSHOT (Stripe) ─────────────────────────────────────────────
// Live MRR from active subscriptions + this-month gross/fees/net from Stripe
// balance transactions. Degrades to { configured:false } when there's no
// STRIPE_SECRET_KEY so the dashboard can show a "connect Stripe" state instead
// of erroring. Read-only; never mutates anything in Stripe.
const getRevenue = async (req, res) => {
    const stripe = stripeFromEnv();
    if (!stripe) return res.json({ configured: false });
    try {
        const now = new Date();
        const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);

        // Active subscriptions → normalized monthly recurring revenue.
        let mrrCents = 0, activeCount = 0, newThisMonth = 0;
        const tiers = {};
        let seen = 0;
        for await (const sub of stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.items.data.price'] })) {
            activeCount++;
            if (sub.created >= monthStart) newThisMonth++;
            for (const it of (sub.items?.data || [])) {
                const price = it.price || {};
                const qty = it.quantity || 1;
                let amt = (price.unit_amount || 0) * qty;
                const interval = price.recurring?.interval;
                if (interval === 'year') amt = Math.round(amt / 12);
                else if (interval === 'week') amt = Math.round((amt * 52) / 12);
                else if (interval === 'day') amt = Math.round((amt * 365) / 12);
                mrrCents += amt;
                const label = price.nickname || (price.id || 'plan');
                tiers[label] = (tiers[label] || 0) + amt;
            }
            if (++seen >= 1000) break;
        }

        // This month's money movement (gross, Stripe fees, net) — net is the
        // closest thing to "profit" Stripe can tell us (revenue minus its fees).
        let grossCents = 0, feeCents = 0, netCents = 0, txCount = 0;
        for await (const tx of stripe.balanceTransactions.list({ created: { gte: monthStart }, limit: 100 })) {
            if (['charge', 'payment', 'refund', 'payment_refund'].includes(tx.type)) {
                grossCents += tx.amount;   // refunds are negative
                feeCents += tx.fee;
                netCents += tx.net;
                txCount++;
            }
            if (txCount >= 5000) break;
        }

        res.json({
            configured: true,
            currency: 'usd',
            mrr_cents: mrrCents,
            arr_cents: mrrCents * 12,
            active_subscriptions: activeCount,
            new_subscriptions_this_month: newThisMonth,
            tiers,
            month: {
                label: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
                gross_cents: grossCents,
                fee_cents: feeCents,
                net_cents: netCents,
                transactions: txCount,
            },
        });
    } catch (err) {
        console.error('[getRevenue]', err.message);
        res.status(502).json({ configured: true, error: err.message });
    }
};

// ─── LAUNCH TOWNS (one-time-button equivalent of the seed script) ──────────
// Same logic as scripts/apply-launch-towns.js, exposed as an admin endpoint
// so the user can run it once from the Towns toolbar without needing the
// Render shell. Pulls the curated list from src/data/launch-towns.json so
// the script + the button stay in lockstep. After launch, the button is
// expected to be removed; the script can stay as a re-runnable backup.
async function applyLaunchTowns(req, res) {
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only.' });
    }
    let towns;
    try {
        towns = require('../data/launch-towns.json');
    } catch (err) {
        return res.status(500).json({ error: 'Could not load launch-towns.json.' });
    }

    let inserted = 0, reactivated = 0;
    const insertedNames = [], reactivatedNames = [], deactivatedNames = [];

    try {
        for (const t of towns) {
            const result = await pool.query(
                `INSERT INTO tags (slug, name, state, region, latitude, longitude, active)
                 VALUES ($1, $2, 'MN', $3, $4, $5, TRUE)
                 ON CONFLICT (slug) DO UPDATE
                     SET name       = EXCLUDED.name,
                         region     = COALESCE(NULLIF(tags.region, ''), EXCLUDED.region),
                         latitude   = COALESCE(tags.latitude,  EXCLUDED.latitude),
                         longitude  = COALESCE(tags.longitude, EXCLUDED.longitude),
                         active     = TRUE,
                         updated_at = NOW()
                 RETURNING (xmax = 0) AS inserted`,
                [t.slug, t.name, t.region, t.lat, t.lng]
            );
            if (result.rows[0]?.inserted) {
                inserted++;
                insertedNames.push(t.name);
            } else {
                reactivated++;
                reactivatedNames.push(t.name);
            }
        }

        const wantedSlugs = towns.map(t => t.slug);
        const deactivated = await pool.query(
            `UPDATE tags
                SET active = FALSE, updated_at = NOW()
              WHERE state = 'MN'
                AND active = TRUE
                AND slug <> ALL ($1::text[])
              RETURNING name`,
            [wantedSlugs]
        );
        for (const r of deactivated.rows) deactivatedNames.push(r.name);

        logActivity({
            event_type: 'tag.launch_towns.apply',
            event_scope: 'system',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            details: { inserted, reactivated, deactivated: deactivated.rowCount, total: towns.length },
            req,
        });

        res.json({
            success: true,
            total: towns.length,
            inserted,
            reactivated,
            deactivated: deactivated.rowCount,
            inserted_names: insertedNames,
            reactivated_names: reactivatedNames,
            deactivated_names: deactivatedNames,
        });
    } catch (err) {
        console.error('[applyLaunchTowns]', err.message);
        res.status(500).json({ error: 'Failed to apply launch towns.' });
    }
}

// ─── LAUNCH LAKES (curated 53 — sibling of applyLaunchTowns) ──────────────
// UPSERTs each entry from src/data/launch-lakes.json with status='published'.
// Every other MN lake that's currently 'published' gets bumped to 'draft'
// so the public site shows only the curated set. NOTHING is deleted; all
// content (intro, description, lifestyle/seasons, gallery, hero image)
// stays intact, and re-publishing is one click. Drafts that already
// existed and archived lakes are left alone to preserve admin intent.
async function applyLaunchLakes(req, res) {
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only.' });
    }
    let lakes;
    try {
        lakes = require('../data/launch-lakes.json');
    } catch (err) {
        return res.status(500).json({ error: 'Could not load launch-lakes.json.' });
    }

    let inserted = 0, republished = 0;
    const insertedNames = [], republishedNames = [], draftedNames = [];

    try {
        for (const l of lakes) {
            const result = await pool.query(
                `INSERT INTO lakes (slug, name, state, region, county, latitude, longitude, status)
                 VALUES ($1, $2, 'MN', $3, $4, $5, $6, 'published')
                 ON CONFLICT (slug) DO UPDATE
                     SET name       = EXCLUDED.name,
                         region     = COALESCE(NULLIF(lakes.region, ''), EXCLUDED.region),
                         county     = COALESCE(NULLIF(lakes.county, ''), EXCLUDED.county),
                         latitude   = COALESCE(lakes.latitude,  EXCLUDED.latitude),
                         longitude  = COALESCE(lakes.longitude, EXCLUDED.longitude),
                         status     = 'published',
                         updated_at = NOW()
                 RETURNING (xmax = 0) AS inserted`,
                [l.slug, l.name, l.region, l.county, l.lat, l.lng]
            );
            if (result.rows[0]?.inserted) {
                inserted++;
                insertedNames.push(l.name);
            } else {
                republished++;
                republishedNames.push(l.name);
            }
        }

        // Drop every OTHER currently-published MN lake to 'draft'. Lakes
        // that are already 'draft' or 'archived' stay where they are so we
        // don't trample previous admin intent.
        const wantedSlugs = lakes.map(l => l.slug);
        const drafted = await pool.query(
            `UPDATE lakes
                SET status = 'draft', updated_at = NOW()
              WHERE state = 'MN'
                AND status = 'published'
                AND slug <> ALL ($1::text[])
              RETURNING name`,
            [wantedSlugs]
        );
        for (const r of drafted.rows) draftedNames.push(r.name);

        logActivity({
            event_type: 'lake.launch_lakes.apply',
            event_scope: 'system',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            details: { inserted, republished, drafted: drafted.rowCount, total: lakes.length },
            req,
        });

        res.json({
            success: true,
            total: lakes.length,
            inserted,
            republished,
            drafted: drafted.rowCount,
            inserted_names: insertedNames,
            republished_names: republishedNames,
            drafted_names: draftedNames,
        });
    } catch (err) {
        console.error('[applyLaunchLakes]', err.message);
        res.status(500).json({ error: 'Failed to apply launch lakes.' });
    }
}

/**
 * GET /api/admin/routing-diagnostics
 * Everything that determines whether an incoming lead actually gets routed:
 *  - geocoder configured? (address→coords, required for town routing)
 *  - published+active agents, and how many are routable (have service-area
 *    tags via user_tags OR a lake link via agent_lakes)
 *  - which published agents are UNROUTABLE (no areas/lakes) — they'll get 0 leads
 *  - service-area coverage: geo-tags with ≥1 eligible agent vs zero-coverage
 *  - lakes with agents linked
 *  - recent outcomes: assigned vs unassigned (30d) + open unassigned leads
 * Rolls up to an overall red/yellow/green so the dashboard can show it at a glance.
 */
const getRoutingDiagnostics = async (req, res) => {
    try {
        const geocoderKeyVar = process.env.GOOGLE_SERVER_KEY ? 'GOOGLE_SERVER_KEY'
            : (process.env.GOOGLE_PLACES_API_KEY ? 'GOOGLE_PLACES_API_KEY' : null);
        const PUB = `a.profile_status='published' AND a.is_published = TRUE AND u.account_status='active' AND a.deleted_at IS NULL`;

        const [agents, coverage, lakes, outcomes, unassigned, unroutable, zeroTags] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::int AS published_active,
                       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_tags ut WHERE ut.user_id = a.user_id))::int AS with_areas,
                       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM agent_lakes al WHERE al.agent_id = a.id))::int AS with_lakes,
                       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_tags ut WHERE ut.user_id = a.user_id)
                                           OR  EXISTS (SELECT 1 FROM agent_lakes al WHERE al.agent_id = a.id))::int AS routable
                FROM agents a JOIN users u ON u.id = a.user_id WHERE ${PUB}`),
            pool.query(`
                SELECT COUNT(*)::int AS geo_tags,
                       COUNT(*) FILTER (WHERE EXISTS (
                           SELECT 1 FROM user_tags ut JOIN agents a ON a.user_id = ut.user_id JOIN users u ON u.id = a.user_id
                           WHERE ut.tag_id = t.id AND ${PUB}))::int AS tags_with_agents
                FROM tags t WHERE t.active = TRUE AND t.latitude IS NOT NULL AND t.longitude IS NOT NULL`),
            pool.query(`SELECT COUNT(DISTINCT al.lake_id)::int AS n
                        FROM agent_lakes al JOIN agents a ON a.id = al.agent_id JOIN users u ON u.id = a.user_id WHERE ${PUB}`),
            pool.query(`SELECT COUNT(*) FILTER (WHERE event_type='lead.route_assigned')::int AS assigned,
                               COUNT(*) FILTER (WHERE event_type='lead.route_unassigned')::int AS unassigned
                        FROM activity_log WHERE created_at > NOW() - INTERVAL '30 days'`),
            pool.query(`SELECT COUNT(*)::int AS n FROM leads WHERE assigned_user_id IS NULL AND agent_id IS NULL AND deleted_at IS NULL`),
            pool.query(`SELECT a.display_name, u.email FROM agents a JOIN users u ON u.id = a.user_id
                        WHERE ${PUB}
                          AND NOT EXISTS (SELECT 1 FROM user_tags ut WHERE ut.user_id = a.user_id)
                          AND NOT EXISTS (SELECT 1 FROM agent_lakes al WHERE al.agent_id = a.id)
                        ORDER BY a.display_name LIMIT 50`),
            pool.query(`SELECT t.name FROM tags t
                        WHERE t.active = TRUE AND t.latitude IS NOT NULL AND t.longitude IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM user_tags ut JOIN agents a ON a.user_id = ut.user_id JOIN users u ON u.id = a.user_id
                                          WHERE ut.tag_id = t.id AND ${PUB})
                        ORDER BY t.name LIMIT 200`),
        ]);

        const ag = agents.rows[0], cov = coverage.rows[0];
        const geocoderOk = !!geocoderKeyVar;
        // Overall status: red if geocoder off OR no routable agents; yellow if
        // some published agents are unroutable or some areas have zero coverage.
        let status = 'green';
        if (!geocoderOk || ag.routable === 0) status = 'red';
        else if (unroutable.rows.length > 0 || (cov.geo_tags - cov.tags_with_agents) > 0) status = 'yellow';

        res.json({
            status,
            geocoder: { configured: geocoderOk, keyVar: geocoderKeyVar },
            agents: {
                publishedActive: ag.published_active,
                withAreas: ag.with_areas,
                withLakes: ag.with_lakes,
                routable: ag.routable,
                unroutable: unroutable.rows.length,
                unroutableList: unroutable.rows,
            },
            coverage: {
                geoTags: cov.geo_tags,
                tagsWithAgents: cov.tags_with_agents,
                zeroCoverage: cov.geo_tags - cov.tags_with_agents,
                zeroCoverageSample: zeroTags.rows.map(r => r.name).slice(0, 40),
                lakesWithAgents: lakes.rows[0].n,
            },
            outcomes: {
                assigned30d: outcomes.rows[0].assigned,
                unassigned30d: outcomes.rows[0].unassigned,
                openUnassignedLeads: unassigned.rows[0].n,
            },
        });
    } catch (err) {
        console.error('[routing-diagnostics]', err.message);
        res.status(500).json({ error: 'Failed to build routing diagnostics.' });
    }
};

// Lazy OpenAI client (same key the assistant uses). Null if unconfigured.
let _mktOpenAI = null;
function getMktOpenAI() {
    if (_mktOpenAI) return _mktOpenAI;
    if (!process.env.OPENAI_API_KEY) return null;
    try { const { OpenAI } = require('openai'); _mktOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); return _mktOpenAI; }
    catch (_) { return null; }
}

/**
 * GET /api/admin/marketing/agent-insights
 * Computes coverage deficits against the per-area goals (1 Founder, 2 Elite,
 * 5 Prime, 10 Basic), then asks the model for a prioritized recruiting/
 * marketing-to-agents plan. Degrades to the computed stats if OpenAI is off.
 */
// Read/write the persisted insights payload so the tabs load instantly and only
// re-run the (slow) AI generation when the admin clicks Refresh.
async function readInsightsCache(kind) {
    try {
        const { rows } = await pool.query(
            'SELECT payload, generated_at FROM marketing_insights_cache WHERE kind = $1', [kind]);
        if (!rows.length) return null;
        return { ...rows[0].payload, generatedAt: rows[0].generated_at, cached: true };
    } catch (_) { return null; }
}
async function writeInsightsCache(kind, payload) {
    try {
        await pool.query(
            `INSERT INTO marketing_insights_cache (kind, payload, generated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (kind) DO UPDATE SET payload = EXCLUDED.payload, generated_at = NOW()`,
            [kind, payload]);
    } catch (e) { console.error('[insights-cache write]', e.message); }
}

const getAgentMarketingInsights = async (req, res) => {
    try {
        // Serve the saved snapshot unless the admin asked for a fresh run.
        const force = req.query.refresh === '1' || req.query.refresh === 'true';
        if (!force) {
            const cached = await readInsightsCache('agent');
            if (cached) return res.json(cached);
        }
        const { rows } = await pool.query(`
            SELECT t.name, t.state, t.region, t.latitude, t.longitude,
                   COUNT(a.id) FILTER (WHERE m.code = 'founder')::int            AS founders,
                   COUNT(a.id) FILTER (WHERE m.code = 'top_agent')::int          AS elite,
                   COUNT(a.id) FILTER (WHERE m.code = 'mn_lake_specialist')::int AS prime,
                   COUNT(a.id) FILTER (WHERE m.code = 'basic')::int             AS basic,
                   COUNT(a.id)::int AS total
              FROM tags t
         LEFT JOIN user_tags ut ON ut.tag_id = t.id
         LEFT JOIN users u      ON u.id = ut.user_id AND u.account_status = 'active'
         LEFT JOIN agents a     ON a.user_id = u.id AND a.profile_status = 'published' AND a.is_published = TRUE
         LEFT JOIN memberships m ON m.id = a.membership_id
             WHERE t.active = TRUE
          GROUP BY t.id`);

        const GOAL = { founder: 1, elite: 2, prime: 5, basic: 10 };
        const areas = rows.map(t => {
            const def = {
                founder: Math.max(0, GOAL.founder - t.founders),
                elite:   Math.max(0, GOAL.elite   - t.elite),
                prime:   Math.max(0, GOAL.prime   - t.prime),
                basic:   Math.max(0, GOAL.basic   - t.basic),
            };
            return { name: t.name, state: t.state, region: t.region || '—',
                     have: { founder: t.founders, elite: t.elite, prime: t.prime, basic: t.basic },
                     total: t.total, def, need: def.founder + def.elite + def.prime + def.basic,
                     noGeo: t.latitude == null || t.longitude == null };
        });

        const byRegion = {};
        areas.forEach(a => { const k = `${a.state} · ${a.region}`; (byRegion[k] ||= { region: k, deficit: 0, areas: 0, gaps: 0, needFounder: 0 });
            byRegion[k].deficit += a.need; byRegion[k].areas++; if (a.total === 0) byRegion[k].gaps++; if (a.have.founder < 1) byRegion[k].needFounder++; });

        const stats = {
            totalAreas: areas.length,
            gaps: areas.filter(a => a.total === 0).length,
            belowGoal: areas.filter(a => a.need > 0).length,
            needFounder: areas.filter(a => a.have.founder < 1).length,
            noCoordinates: areas.filter(a => a.noGeo).length,
            totalDeficit: {
                founder: areas.reduce((s, a) => s + a.def.founder, 0),
                elite:   areas.reduce((s, a) => s + a.def.elite, 0),
                prime:   areas.reduce((s, a) => s + a.def.prime, 0),
                basic:   areas.reduce((s, a) => s + a.def.basic, 0),
            },
            topRegionsByDeficit: Object.values(byRegion).sort((a, b) => b.deficit - a.deficit).slice(0, 8),
            worstAreas: [...areas].sort((a, b) => b.need - a.need).slice(0, 15)
                .map(a => ({ area: `${a.name}, ${a.state}`, region: a.region, have: a.have, need: a.def })),
        };

        const client = getMktOpenAI();
        let recommendations = null;
        if (client) {
            const sys = 'You are a concise growth strategist for a Minnesota lake-real-estate AGENT network. You advise the platform owner on recruiting and marketing TO real-estate agents (not consumers). Output clean HTML only — use <h4>, <p>, <ul><li>. No markdown, no code fences, no preamble.' + require('../services/fair-housing').FAIR_HOUSING_GUARDRAIL;
            const user = `Per service-area staffing goals: 1 Founder (the lake owner / exclusive spot), 2 Elite, 5 Prime, 10 Basic agents. Below is the CURRENT coverage vs goal as JSON (deficits = how many more of each tier are needed). Produce a prioritized action plan: (1) the top regions/areas to target first and why, (2) which TIER to push in each and the pitch angle for that tier, (3) 3–5 concrete recruiting tactics for a small MN lake-real-estate brand. Keep it tight and specific to the data.\n\nDATA:\n${JSON.stringify(stats)}`;
            try {
                const completion = await client.chat.completions.create({
                    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
                    temperature: 0.5, max_tokens: 1200,
                });
                recommendations = completion.choices[0]?.message?.content?.trim() || null;
            } catch (e) { console.error('[agent-insights AI]', e.message); }
        }

        const payload = { generatedAt: new Date().toISOString(), aiConfigured: !!client, stats, recommendations };
        await writeInsightsCache('agent', payload);
        res.json({ ...payload, cached: false });
    } catch (err) {
        console.error('[getAgentMarketingInsights]', err.message);
        res.status(500).json({ error: 'Failed to build agent marketing insights.' });
    }
};

// GET /api/admin/marketing/business-insights
// The business mirror of getAgentMarketingInsights: per-area business coverage
// vs the directory goal (1 Featured Partner + 3 Local Spotlights per area, plus
// the core types every lake area should have), then the SAME AI writes a
// prioritized recruiting plan — just aimed at signing local businesses.
const BIZ_CORE_TYPES = ['marina', 'outdoor_recreation', 'restaurant', 'boat_rental'];
const BIZ_TYPE_LABEL = { marina: 'Marina', outdoor_recreation: 'Resort/Outdoor', restaurant: 'Restaurant', boat_rental: 'Boat rental', builder: 'Builder', photographer: 'Photographer', service: 'Service', other: 'Other' };

const getBusinessMarketingInsights = async (req, res) => {
    try {
        const force = req.query.refresh === '1' || req.query.refresh === 'true';
        if (!force) {
            const cached = await readInsightsCache('business');
            if (cached) return res.json(cached);
        }
        const { rows } = await pool.query(`
            SELECT t.name, t.state, t.region, t.latitude, t.longitude,
                   COUNT(b.id) FILTER (WHERE COALESCE(NULLIF(b.tier,''),'free') = 'premium')::int AS premium,
                   COUNT(b.id) FILTER (WHERE COALESCE(NULLIF(b.tier,''),'free') = 'basic')::int   AS basic,
                   COUNT(b.id) FILTER (WHERE COALESCE(NULLIF(b.tier,''),'free') = 'free')::int    AS free,
                   COUNT(b.id)::int AS total,
                   ARRAY_REMOVE(ARRAY_AGG(DISTINCT b.type), NULL) AS types
              FROM tags t
         LEFT JOIN business_tags bt ON bt.tag_id = t.id
         LEFT JOIN businesses b ON b.id = bt.business_id
                                AND b.status = 'active'
                                AND (b.user_id IS NULL OR b.subscription_status = 'active' OR b.tier_comped)
             WHERE t.active = TRUE
          GROUP BY t.id`);

        const GOAL = { premium: 1, basic: 3 };
        const areas = rows.map(t => {
            const types = Array.isArray(t.types) ? t.types : [];
            const missingCore = BIZ_CORE_TYPES.filter(ct => !types.includes(ct));
            const def = { premium: Math.max(0, GOAL.premium - t.premium), basic: Math.max(0, GOAL.basic - t.basic) };
            return { name: t.name, state: t.state, region: t.region || '—',
                     have: { premium: t.premium, basic: t.basic, free: t.free }, total: t.total,
                     types, missingCore, def, need: def.premium + def.basic,
                     noGeo: t.latitude == null || t.longitude == null };
        });

        const byRegion = {};
        areas.forEach(a => { const k = `${a.state} · ${a.region}`; (byRegion[k] ||= { region: k, deficit: 0, areas: 0, gaps: 0, missingCore: 0 });
            byRegion[k].deficit += a.need; byRegion[k].areas++; if (a.total === 0) byRegion[k].gaps++; byRegion[k].missingCore += a.missingCore.length; });

        const stats = {
            totalAreas: areas.length,
            gaps: areas.filter(a => a.total === 0).length,
            belowGoal: areas.filter(a => a.need > 0).length,
            noCoordinates: areas.filter(a => a.noGeo).length,
            totalDeficit: { premium: areas.reduce((s, a) => s + a.def.premium, 0), basic: areas.reduce((s, a) => s + a.def.basic, 0) },
            missingCoreByType: BIZ_CORE_TYPES.map(ct => ({ type: BIZ_TYPE_LABEL[ct], areasMissing: areas.filter(a => a.missingCore.includes(ct)).length })),
            topRegionsByDeficit: Object.values(byRegion).sort((a, b) => b.deficit - a.deficit).slice(0, 8),
            worstAreas: [...areas].sort((a, b) => b.need - a.need || b.missingCore.length - a.missingCore.length).slice(0, 15)
                .map(a => ({ area: `${a.name}, ${a.state}`, region: a.region, have: a.have, need: a.def, missing: a.missingCore.map(t => BIZ_TYPE_LABEL[t]) })),
        };

        const client = getMktOpenAI();
        let recommendations = null;
        if (client) {
            const sys = 'You are a concise growth strategist for a Minnesota lake-area LOCAL BUSINESS DIRECTORY (marinas, resorts, restaurants, boat rentals, dock builders, photographers). You advise the platform owner on recruiting local businesses to buy paid directory listings (Featured Partner $79/mo, Local Spotlight $29/mo), organized by service area. Output clean HTML only — use <h4>, <p>, <ul><li>. No markdown, no code fences, no preamble.' + require('../services/fair-housing').FAIR_HOUSING_GUARDRAIL;
            const user = `Per service-area goal: 1 Featured Partner (Premium) + 3 Local Spotlights (Standard), and every area should ideally cover the core types: Marina, Resort/Outdoor, Restaurant, Boat rental. Below is CURRENT coverage vs goal as JSON (deficits = how many more paid listings needed; missing = core business types absent). Produce a prioritized action plan: (1) the top regions/areas to target first and why, (2) which business TYPES to recruit in each area to fill the missing core types, (3) 3–5 concrete outreach tactics to sign local lake businesses to a paid listing — the pitch angle is reaching buyers and vacationers who land on that lake's page. Keep it tight and specific to the data.\n\nDATA:\n${JSON.stringify(stats)}`;
            try {
                const completion = await client.chat.completions.create({
                    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
                    temperature: 0.5, max_tokens: 1200,
                });
                recommendations = completion.choices[0]?.message?.content?.trim() || null;
            } catch (e) { console.error('[business-insights AI]', e.message); }
        }

        const payload = { generatedAt: new Date().toISOString(), aiConfigured: !!client, stats, recommendations };
        await writeInsightsCache('business', payload);
        res.json({ ...payload, cached: false });
    } catch (err) {
        console.error('[getBusinessMarketingInsights]', err.message);
        res.status(500).json({ error: 'Failed to build business marketing insights.' });
    }
};

module.exports = {
    getRoutingDiagnostics,
    getAgentMarketingInsights,
    getBusinessMarketingInsights,
    getLedger,
    getAgentDetail,
    getSubscriberBilling,
    getBillingStatusReport,
    getSubscriptionRoster,
    resumeAgentSubscription,
    sendAgentBillingEmail,
    getAgentEmailHistory,
    getSeoAudit,
    getLeadReconciliation,
    getRoutingSla,
    getLeadDensity,
    ensureHubspotSchema,
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
    impersonateUser,
    deleteUser,
    syncUserToHubspot,
    getLeadDetail,
    updateLeadStatus,
    assignLead,
    addLeadNote,
    deleteLead,
    getManualReleaseCandidates,
    manualReleaseLead,
    setLeadLake,
    deleteAgent,
    getAgentLeads,
    getAgentNotes,
    addAgentNote,
    deleteAgentNote,
    getUnassignedLeadCount,
    getAgentCoverage,
    getBusinessCoverage,
    getSystemAlertsCount,
    listAdminTabs,
    setUserPermissions,
    createAdminUser,
    applyTagLaunchPreset,
    applyLakeLaunchSeed,
    inviteAgent,
    inviteBusiness,
    getPaymentsForUser,
    getPaymentsForAgent,
    getPaymentsForBusiness,
    getRevenue,
    applyLaunchTowns,
    applyLaunchLakes,
};
