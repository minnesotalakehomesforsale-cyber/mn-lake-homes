/**
 * resource.controller.js — Public + admin endpoints for the resources
 * catalog (guides, tools, calculators, market reports, checklists,
 * templates). The public page reads from this for its grid; the admin
 * page does a broader read that includes inactive rows.
 *
 * Write endpoints are stubbed but role-gated — left in place for the
 * admin CRUD UI we'll build once the read flow is validated. For v1
 * the admin page is read-only.
 */

const pool = require('../database/pool');
const { logActivity } = require('../services/activity-log');
const hubspot = require('../services/hubspot');
const emailService = require('../services/email');

// ─── helpers ────────────────────────────────────────────────────────────────
function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function isAdmin(req) {
    return req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');
}

// ─── GET /api/resources ─────────────────────────────────────────────────────
// Public. Filters: ?category=Guides&search=lake&featured=true&limit=24&offset=0
exports.list = async (req, res) => {
    try {
        const category = (req.query.category || '').trim();
        const search   = (req.query.search   || '').trim();
        const featured = req.query.featured === 'true';

        // Admin may include inactive; public callers only see active.
        const includeInactive = isAdmin(req) && req.query.active === 'all';

        const where = [];
        const params = [];
        if (!includeInactive) where.push(`active = TRUE`);
        if (category) { params.push(category); where.push(`category = $${params.length}`); }
        if (featured) where.push(`featured = TRUE`);
        if (search) {
            params.push(`%${search.toLowerCase()}%`);
            where.push(`(lower(title) LIKE $${params.length} OR lower(coalesce(description, '')) LIKE $${params.length})`);
        }

        // Sensible caps. At true hundreds-of-thousands scale the client
        // will paginate via limit/offset or cursor; the index on
        // (active, created_at DESC) keeps this cheap.
        const limit  = Math.min(100, Math.max(1, Math.floor(numOrNull(req.query.limit)  || 24)));
        const offset = Math.max(0,       Math.floor(numOrNull(req.query.offset) || 0));

        const sql = `
            SELECT id, slug, title, description, category, resource_type,
                   url, thumbnail_url, tags, featured, active,
                   created_at, updated_at
            FROM resources
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY featured DESC, created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
        const { rows } = await pool.query(sql, params);

        // Inexpensive total count so the UI can show "Showing X of Y".
        // Counts the same filter set without the limit.
        const countSql = `SELECT COUNT(*)::int AS count FROM resources ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
        const countRes = await pool.query(countSql, params);

        res.json({ rows, total: countRes.rows[0]?.count ?? rows.length, limit, offset });
    } catch (err) {
        console.error('[resources.list]', err.message);
        res.status(500).json({ error: 'Failed to load resources.' });
    }
};

// ─── GET /api/resources/categories ──────────────────────────────────────────
// Public. Returns { category, count } for all active rows — lets the UI
// build filter pills without a second round trip per category.
exports.categories = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT category, COUNT(*)::int AS count
             FROM resources
             WHERE active = TRUE
             GROUP BY category
             ORDER BY category ASC`
        );
        res.json(rows);
    } catch (err) {
        console.error('[resources.categories]', err.message);
        res.status(500).json({ error: 'Failed to load categories.' });
    }
};

// ─── GET /api/resources/:slug ───────────────────────────────────────────────
exports.detail = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM resources WHERE slug = $1 AND active = TRUE`,
            [req.params.slug]
        );
        if (!rows.length) return res.status(404).json({ error: 'Resource not found.' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[resources.detail]', err.message);
        res.status(500).json({ error: 'Failed to load resource.' });
    }
};

// ─── POST /api/resources/:slug/download ─────────────────────────────────────
// Email-gated download capture. The visitor gives an email (+ optional
// name/phone); we record them as a lead (source: 'resource_download'),
// mirror to HubSpot, email them the download link, and return the URL so
// the front end can also hand it over immediately. No account required.
exports.captureDownload = async (req, res) => {
    let { name, email, phone } = req.body || {};
    name  = (name  || '').trim();
    email = (email || '').trim().toLowerCase();
    phone = (phone || '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'A valid email is required.' });
    }

    try {
        const { rows } = await pool.query(
            `SELECT id, slug, title, url FROM resources WHERE slug = $1 AND active = TRUE`,
            [req.params.slug]
        );
        if (!rows.length) return res.status(404).json({ error: 'Resource not found.' });
        const resource = rows[0];

        const fullName  = name || email.split('@')[0];
        const firstName = fullName.split(' ')[0] || 'there';
        const lastName  = fullName.split(' ').slice(1).join(' ') || null;

        // Link the lead to an existing account by email, same rule as the
        // main lead form — if no account exists it stays unassigned and
        // gets backfilled if they sign up later.
        let userId = null;
        const u = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
        if (u.rows.length) userId = u.rows[0].id;

        const { rows: leadRows } = await pool.query(
            `INSERT INTO leads (full_name, first_name, email, phone, message,
                                lead_type, lead_source, lead_status, user_id)
             VALUES ($1, $2, $3, $4, $5, 'general_contact', 'resource_download', 'new', $6)
             RETURNING id`,
            [fullName, firstName, email, phone || null,
             `Resource download: ${resource.title}`, userId]
        );
        const leadId = leadRows[0]?.id;

        logActivity({
            event_type: 'resource.download',
            event_scope: 'resource',
            actor: { type: 'public', label: email },
            target: { type: 'resource', id: resource.id, label: resource.title },
            details: { lead_id: leadId, slug: resource.slug, email, phone },
            req,
        });

        // Fire-and-forget: HubSpot mirror.
        (async () => {
            const r = await hubspot.syncContact({
                email, firstname: firstName, lastname: lastName || undefined,
                phone: phone || undefined,
                user_type: 'lead', signup_source: `resource:${resource.slug}`,
            });
            if (r?.id && leadId) {
                pool.query(`UPDATE leads SET hs_contact_id = $1 WHERE id = $2`, [r.id, leadId])
                    .catch(e => console.error('[resource download] hs id save failed:', e.message));
            }
        })().catch(e => console.error('[resource download] hubspot sync failed:', e.message));

        // Fire-and-forget: email the download link.
        const siteBase = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
        const downloadUrl = `${siteBase}${resource.url}`;
        try {
            emailService.sendCustom({
                to: email,
                subject: `Your download: ${resource.title}`,
                html: emailService.layout({
                    title: 'Here’s your download',
                    preheader: `${resource.title} from MN Lake Homes`,
                    body: `<p>Hi ${firstName},</p>
                           <p>Thanks for grabbing <strong>${resource.title}</strong>. Your copy is ready — the button below opens the PDF.</p>
                           <p>Save it, print it, share it. And when you're ready to talk through a specific lake or property, a local specialist is one form away.</p>`,
                    ctaText: 'Download the PDF',
                    ctaUrl: downloadUrl,
                }),
            });
        } catch (e) {
            console.error('[resource download] email failed:', e.message);
        }

        res.json({ success: true, url: resource.url, title: resource.title });
    } catch (err) {
        console.error('[resources.captureDownload]', err.message);
        res.status(500).json({ error: 'Could not process your download. Please try again.' });
    }
};

// DELETE /api/resources/:id — hard delete (admin only). Nothing else
// references the resources table, so a plain DELETE fully removes it
// from the catalog and every public grid at once.
exports.remove = async (req, res) => {
    try {
        const role = req.user?.role;
        if (role !== 'admin' && role !== 'super_admin') {
            return res.status(403).json({ error: 'Admin only.' });
        }
        const { rowCount, rows } = await pool.query(
            `DELETE FROM resources WHERE id = $1 RETURNING id, title`,
            [req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Resource not found.' });
        logActivity({
            event_type: 'resource.delete',
            event_scope: 'resource',
            severity: 'warning',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'resource', id: rows[0].id, label: rows[0].title },
            req,
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[resources.remove]', err.message);
        res.status(500).json({ error: 'Failed to delete resource.' });
    }
};
