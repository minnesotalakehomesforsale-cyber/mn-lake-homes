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
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { logActivity } = require('../services/activity-log');
const hubspot = require('../services/hubspot');
const emailService = require('../services/email');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true,
});

const resourceImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/^image\//.test(file.mimetype)) cb(null, true);
        else cb(new Error('Please upload an image file.'));
    },
}).single('image');

function uploadBufferToCloudinary(buffer, publicId) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'mnlakehomes/resources',
                public_id: publicId,
                resource_type: 'image',
                overwrite: true,
                transformation: [
                    { width: 1600, height: 1600, crop: 'limit' },
                    { quality: 'auto:good' },
                ],
            },
            (err, result) => (err ? reject(err) : resolve(result))
        );
        stream.end(buffer);
    });
}

function slugify(s) {
    return String(s || '').trim().toLowerCase().normalize('NFKD')
        .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 120);
}

const ALLOWED_TYPES = ['guide', 'tool', 'calculator', 'report', 'checklist', 'template', 'pdf', 'video', 'other'];

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
        // The public list never exposes agent-only resources (those are served,
        // paid-gated, by getAgentResources). Admins can pass ?audience=all.
        if (!(isAdmin(req) && req.query.audience === 'all')) where.push(`audience = 'public'`);
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

// ─── GET /api/resources/agent — the paid-agent-only resource library ────────
// Requires an agent account on a PAID plan (free agents get 403 → the dashboard
// shows the locked/upgrade state). Returns audience='agents' resources.
exports.agentResources = async (req, res) => {
    try {
        const { rows: ag } = await pool.query(
            `SELECT COALESCE(m.code,'basic') AS tier
               FROM agents a LEFT JOIN memberships m ON m.id = a.membership_id
              WHERE a.user_id = $1 LIMIT 1`, [req.user.userId]);
        if (!ag.length) return res.status(403).json({ error: 'Agent profile required.', code: 'no_profile' });
        if (ag[0].tier === 'free') return res.status(403).json({ error: 'Upgrade to a paid plan to unlock the agent resource library.', code: 'upgrade_required' });

        const { rows } = await pool.query(`
            SELECT id, slug, title, description, category, resource_type, url, thumbnail_url, tags, featured
              FROM resources
             WHERE active = TRUE AND audience = 'agents'
             ORDER BY featured DESC, category ASC, created_at DESC
             LIMIT 200`);
        res.json({ rows });
    } catch (err) {
        console.error('[resources.agentResources]', err.message);
        res.status(500).json({ error: 'Failed to load agent resources.' });
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
                lifecyclestage: 'lead',
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

// ─── POST /api/resources — create (admin) ──────────────────────────────────
exports.create = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 300);
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    const category = String(b.category || '').trim().slice(0, 80);
    if (!category) return res.status(400).json({ error: 'Category is required.' });
    const resource_type = String(b.resource_type || 'guide').trim().toLowerCase().slice(0, 40);
    if (!ALLOWED_TYPES.includes(resource_type)) {
        return res.status(400).json({ error: `Type must be one of: ${ALLOWED_TYPES.join(', ')}.` });
    }
    let slug = b.slug ? slugify(b.slug) : slugify(title);
    if (!slug) return res.status(400).json({ error: 'Could not derive a valid slug.' });
    const url = (b.url && String(b.url).trim()) || '#';
    const tags = Array.isArray(b.tags) ? b.tags : [];

    try {
        const exists = await pool.query('SELECT 1 FROM resources WHERE slug = $1', [slug]);
        if (exists.rowCount) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

        const audience = b.audience === 'agents' ? 'agents' : 'public';
        const { rows } = await pool.query(
            `INSERT INTO resources
               (slug, title, description, category, resource_type, url, thumbnail_url,
                tags, featured, active, audience)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
             RETURNING *`,
            [slug, title, b.description || null, category, resource_type, url,
             b.thumbnail_url || null, JSON.stringify(tags),
             !!b.featured, b.active === false ? false : true, audience]
        );
        logActivity({
            event_type: 'resource.create',
            event_scope: 'resource',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'resource', id: rows[0].id, label: title },
            details: { slug, category, resource_type },
            req,
        });
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'A resource with that slug already exists.' });
        console.error('[resources.create]', err.message);
        res.status(500).json({ error: 'Failed to create resource.' });
    }
};

// ─── PATCH /api/resources/:id — update (admin) ─────────────────────────────
exports.patch = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const b = req.body || {};
    const sets = [];
    const vals = [];
    let i = 1;
    const push = (col, v) => { sets.push(`${col} = $${i++}`); vals.push(v); };

    if ('title' in b) {
        const v = String(b.title || '').trim().slice(0, 300);
        if (!v) return res.status(400).json({ error: 'Title cannot be empty.' });
        push('title', v);
    }
    if ('slug' in b) {
        const v = slugify(b.slug);
        if (!v) return res.status(400).json({ error: 'Invalid slug.' });
        push('slug', v);
    }
    if ('description'   in b) push('description',   b.description || null);
    if ('category'      in b) push('category',      String(b.category || '').trim().slice(0, 80) || null);
    if ('resource_type' in b) {
        const v = String(b.resource_type || '').trim().toLowerCase().slice(0, 40);
        if (v && !ALLOWED_TYPES.includes(v)) return res.status(400).json({ error: `Type must be one of: ${ALLOWED_TYPES.join(', ')}.` });
        push('resource_type', v || null);
    }
    if ('url'           in b) push('url',           (b.url && String(b.url).trim()) || '#');
    if ('thumbnail_url' in b) push('thumbnail_url', b.thumbnail_url || null);
    if ('tags'          in b) {
        const t = Array.isArray(b.tags) ? b.tags : [];
        sets.push(`tags = $${i++}::jsonb`); vals.push(JSON.stringify(t));
    }
    if ('featured'      in b) push('featured', !!b.featured);
    if ('active'        in b) push('active',   !!b.active);
    if ('audience'      in b) push('audience', b.audience === 'agents' ? 'agents' : 'public');

    if (!sets.length) return res.json({ success: true, noop: true });
    sets.push(`updated_at = NOW()`);
    vals.push(req.params.id);

    try {
        const { rows, rowCount } = await pool.query(
            `UPDATE resources SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
            vals
        );
        if (!rowCount) return res.status(404).json({ error: 'Resource not found.' });
        logActivity({
            event_type: 'resource.update',
            event_scope: 'resource',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'resource', id: rows[0].id, label: rows[0].title },
            details: { changed: Object.keys(b) },
            req,
        });
        res.json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'A resource with that slug already exists.' });
        console.error('[resources.patch]', err.message);
        res.status(500).json({ error: 'Failed to update resource.' });
    }
};

// ─── POST /api/resources/upload-image — Cloudinary thumbnail upload ────────
exports.uploadImage = (req, res) => {
    resourceImageUpload(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
        if (!req.file?.buffer) return res.status(400).json({ error: 'No file uploaded.' });
        try {
            const publicId = `resource-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const result   = await uploadBufferToCloudinary(req.file.buffer, publicId);
            logActivity({
                event_type: 'resource.image.upload',
                event_scope: 'resource',
                actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
                details: { url: result.secure_url, size: req.file.size },
                req,
            });
            res.json({ url: result.secure_url, filename: req.file.originalname, size: req.file.size });
        } catch (cloudErr) {
            const msg = cloudErr?.message || cloudErr?.error?.message || String(cloudErr);
            console.error('[resources.uploadImage]', msg);
            res.status(500).json({ error: `Upload failed: ${msg}` });
        }
    });
};

// ─── GET /api/resources/admin/:id/insights — counters + daily trend ────────
// Pulls from the leads table (resource_download leads created by
// captureDownload) so we get a real history without a separate
// downloads table. Counts + 30-day daily trend in one round-trip.
exports.insights = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const rsc = await pool.query(`SELECT id, slug, title FROM resources WHERE id = $1`, [req.params.id]);
        if (!rsc.rowCount) return res.status(404).json({ error: 'Resource not found.' });
        const r = rsc.rows[0];
        // captureDownload writes `message = 'Resource download: <title>'`
        // and `lead_source = 'resource_download'`. We match by exact title
        // suffix to be precise (multiple resources share the same source).
        const titleLike = `Resource download: ${r.title}%`;

        const [counts, daily, topRefs] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS d1,
                       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int   AS d7,
                       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int  AS d30
                  FROM leads
                 WHERE lead_source = 'resource_download'
                   AND message LIKE $1
                   AND deleted_at IS NULL
            `, [titleLike]),
            pool.query(`
                SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS total
                  FROM leads
                 WHERE lead_source = 'resource_download'
                   AND message LIKE $1
                   AND deleted_at IS NULL
                   AND created_at >= NOW() - INTERVAL '30 days'
              GROUP BY day
              ORDER BY day ASC
            `, [titleLike]),
            pool.query(`
                SELECT source_page_url AS path, COUNT(*)::int AS hits
                  FROM leads
                 WHERE lead_source = 'resource_download'
                   AND message LIKE $1
                   AND deleted_at IS NULL
                   AND source_page_url IS NOT NULL
              GROUP BY source_page_url
              ORDER BY hits DESC
                 LIMIT 6
            `, [titleLike]),
        ]);

        res.json({
            counts:  counts.rows[0]  || { total: 0, d1: 0, d7: 0, d30: 0 },
            daily:   daily.rows      || [],
            top_referrers: topRefs.rows || [],
        });
    } catch (err) {
        console.error('[resources.insights]', err.message);
        res.status(500).json({ error: 'Failed to load insights.' });
    }
};

// ─── GET /api/resources/admin/:id/downloads — per-resource lead list ──────
// Same source as insights, but returns the actual lead rows so the admin
// can see WHO downloaded it + when + contact info.
exports.downloads = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const rsc = await pool.query(`SELECT title FROM resources WHERE id = $1`, [req.params.id]);
        if (!rsc.rowCount) return res.status(404).json({ error: 'Resource not found.' });
        const titleLike = `Resource download: ${rsc.rows[0].title}%`;
        const { rows } = await pool.query(`
            SELECT id, full_name AS name, email, phone, lead_status AS status,
                   source_page_url, created_at, hs_contact_id
              FROM leads
             WHERE lead_source = 'resource_download'
               AND message LIKE $1
               AND deleted_at IS NULL
          ORDER BY created_at DESC
             LIMIT 200
        `, [titleLike]);
        res.json(rows);
    } catch (err) {
        console.error('[resources.downloads]', err.message);
        res.status(500).json({ error: 'Failed to load downloads.' });
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
