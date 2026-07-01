// listing.controller.js — manually-managed property listings (no MLS feed).
// Powers the live "N homes for sale on <lake>" count + grid on lake pages,
// the /listings/:slug detail page (RealEstateListing JSON-LD), and admin CRUD.

const pool = require('../database/pool');
const { logActivity } = require('../services/activity-log');

const isAdmin = (req) => req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');

const PUBLIC_COLS = `id, slug, lake_id, agent_id, title, address, city, state, zip,
    price, beds, baths, sqft, lot_acres, waterfront_feet, description,
    featured_image_url, gallery, mls_number, external_url, latitude, longitude,
    status, created_at, updated_at`;

function slugify(s) {
    return String(s || '').toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180);
}

async function uniqueSlug(base) {
    let slug = base || `listing-${Date.now()}`;
    const hit = await pool.query(`SELECT 1 FROM listings WHERE slug = $1`, [slug]);
    if (hit.rowCount) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    return slug;
}

// Reusable — imported by the SSR lake route for the live count.
async function activeCountForLake(lakeId) {
    if (!lakeId) return 0;
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM listings WHERE lake_id = $1 AND status = 'active'`,
        [lakeId]
    );
    return rows[0].c;
}

// GET /api/listings  (public) — active listings, optional ?lake_id= filter.
exports.listPublic = async (req, res) => {
    try {
        const lakeId = String(req.query.lake_id || '').trim() || null;
        const limit  = Math.min(parseInt(req.query.limit, 10) || 24, 60);
        const where  = ["status = 'active'"];
        const params = [];
        if (lakeId) { params.push(lakeId); where.push(`lake_id = $${params.length}`); }
        params.push(limit);
        const { rows } = await pool.query(
            `SELECT ${PUBLIC_COLS} FROM listings
              WHERE ${where.join(' AND ')}
              ORDER BY created_at DESC
              LIMIT $${params.length}`,
            params
        );
        res.json(rows);
    } catch (err) {
        console.error('[listings.listPublic]', err.message);
        res.status(500).json({ error: 'Could not load listings.' });
    }
};

// GET /api/listings/slug/:slug (public) — single active listing as JSON.
exports.getBySlug = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT ${PUBLIC_COLS} FROM listings WHERE slug = $1 AND status = 'active' LIMIT 1`,
            [req.params.slug]
        );
        if (!rows.length) return res.status(404).json({ error: 'Listing not found.' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[listings.getBySlug]', err.message);
        res.status(500).json({ error: 'Could not load listing.' });
    }
};

// ─── ADMIN ──────────────────────────────────────────────────────────────────
exports.listAdmin = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const { rows } = await pool.query(
            `SELECT l.${'id, slug, lake_id, title, city, state, price, beds, baths, sqft, status, featured_image_url, created_at'},
                    lk.name AS lake_name
               FROM listings l
               LEFT JOIN lakes lk ON lk.id = l.lake_id
              ORDER BY l.created_at DESC
              LIMIT 500`
        );
        res.json(rows);
    } catch (err) {
        console.error('[listings.listAdmin]', err.message);
        res.status(500).json({ error: 'Could not load listings.' });
    }
};

const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

function bodyToCols(b) {
    return {
        lake_id:            b.lake_id || null,
        agent_id:           b.agent_id || null,
        title:              String(b.title || '').trim().slice(0, 200),
        address:            String(b.address || '').trim().slice(0, 255) || null,
        city:               String(b.city || '').trim().slice(0, 120) || null,
        state:              String(b.state || 'MN').trim().slice(0, 8) || 'MN',
        zip:                String(b.zip || '').trim().slice(0, 20) || null,
        price:              numOrNull(b.price),
        beds:               numOrNull(b.beds),
        baths:              numOrNull(b.baths),
        sqft:               numOrNull(b.sqft),
        lot_acres:          numOrNull(b.lot_acres),
        waterfront_feet:    numOrNull(b.waterfront_feet),
        description:        String(b.description || '').trim().slice(0, 8000) || null,
        featured_image_url: String(b.featured_image_url || '').trim() || null,
        gallery:            Array.isArray(b.gallery) ? JSON.stringify(b.gallery) : '[]',
        mls_number:         String(b.mls_number || '').trim().slice(0, 40) || null,
        external_url:       String(b.external_url || '').trim() || null,
        latitude:           numOrNull(b.latitude),
        longitude:          numOrNull(b.longitude),
        status:             ['active', 'pending', 'sold', 'draft'].includes(b.status) ? b.status : 'active',
    };
}

exports.create = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const v = bodyToCols(req.body || {});
        if (!v.title) return res.status(400).json({ error: 'Title is required.' });
        const slug = await uniqueSlug(slugify(req.body.slug || v.title));
        const cols = Object.keys(v);
        const placeholders = cols.map((_, i) => `$${i + 2}`).join(', ');
        const { rows } = await pool.query(
            `INSERT INTO listings (slug, ${cols.join(', ')})
             VALUES ($1, ${placeholders}) RETURNING id, slug`,
            [slug, ...cols.map(k => v[k])]
        );
        logActivity({
            event_type: 'listing.created', event_scope: 'listing',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.email || 'admin' },
            target: { type: 'listing', id: rows[0].id, label: v.title }, req,
        });
        res.status(201).json({ success: true, id: rows[0].id, slug: rows[0].slug });
    } catch (err) {
        console.error('[listings.create]', err.message);
        res.status(500).json({ error: 'Could not create the listing.' });
    }
};

exports.update = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const v = bodyToCols(req.body || {});
        if (!v.title) return res.status(400).json({ error: 'Title is required.' });
        const cols = Object.keys(v);
        const set = cols.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const { rows } = await pool.query(
            `UPDATE listings SET ${set}, updated_at = NOW() WHERE id = $1 RETURNING id, slug`,
            [req.params.id, ...cols.map(k => v[k])]
        );
        if (!rows.length) return res.status(404).json({ error: 'Listing not found.' });
        logActivity({
            event_type: 'listing.updated', event_scope: 'listing',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.email || 'admin' },
            target: { type: 'listing', id: rows[0].id }, req,
        });
        res.json({ success: true, id: rows[0].id, slug: rows[0].slug });
    } catch (err) {
        console.error('[listings.update]', err.message);
        res.status(500).json({ error: 'Could not update the listing.' });
    }
};

exports.remove = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const { rowCount } = await pool.query(`DELETE FROM listings WHERE id = $1`, [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Listing not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error('[listings.remove]', err.message);
        res.status(500).json({ error: 'Could not delete the listing.' });
    }
};

exports.activeCountForLake = activeCountForLake;
