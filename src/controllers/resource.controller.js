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
