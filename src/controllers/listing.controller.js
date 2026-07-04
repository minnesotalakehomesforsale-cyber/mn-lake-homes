// listing.controller.js — manually-managed property listings (no MLS feed).
// Powers the live "N homes for sale on <lake>" count + grid on lake pages,
// the /listings/:slug detail page (RealEstateListing JSON-LD), and admin CRUD.

const pool = require('../database/pool');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { logActivity } = require('../services/activity-log');
const { geocodeAddress } = require('../services/geocoder');
// Lazy require to avoid a circular load at module-init (search ctrl is standalone
// here, but keep the pattern defensive).
const savedSearch = require('./search.controller');

// Fill lat/lng from the address (city/state help disambiguate) when an agent
// gives an address but no coordinates — powers the Properties map. Best-effort:
// a geocode miss just leaves the listing off the map, never blocks the save.
async function geocodeInto(v) {
    if (!v.address || v.latitude != null) return;
    try {
        const geo = await geocodeAddress([v.address, v.city, v.state].filter(Boolean).join(', '));
        if (geo) { v.latitude = geo.lat; v.longitude = geo.lng; }
    } catch (_) { /* leave uncoordinated */ }
}

const isAdmin = (req) => req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');

// Visibility is per-listing: only status='active' listings are ever public
// (the public queries already filter on it), and new listings default to
// 'draft' so nothing shows until an admin clicks "Add to site". LISTINGS_PUBLIC
// stays as a global kill-switch — set it to 'false' to force-hide the entire
// feature regardless of per-listing status; otherwise it's on.
const LISTINGS_PUBLIC = process.env.LISTINGS_PUBLIC !== 'false';
exports.LISTINGS_PUBLIC = LISTINGS_PUBLIC;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true,
});

const listingUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (req, file, cb) => (/^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error('Please upload an image file.'))),
}).array('images', 20);

function bufferToCloudinary(buffer) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'mnlakehomes/listings',
                resource_type: 'image',
                transformation: [{ width: 2000, height: 2000, crop: 'limit' }, { quality: 'auto:good' }],
            },
            (err, result) => (err ? reject(err) : resolve(result))
        );
        stream.end(buffer);
    });
}

// POST /api/listings/admin/upload — multipart 'images' (1..20). Returns { urls }.
exports.uploadImages = (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({ error: 'Image uploads are not configured (Cloudinary env missing).' });
    listingUpload(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
        if (!req.files || !req.files.length) return res.status(400).json({ error: 'No image provided.' });
        try {
            const urls = [];
            for (const f of req.files) {
                const r = await bufferToCloudinary(f.buffer);
                urls.push(r.secure_url);
            }
            res.json({ urls });
        } catch (e) {
            console.error('[listings.uploadImages]', e.message);
            res.status(500).json({ error: 'Image upload failed.' });
        }
    });
};

const PUBLIC_COLS = `id, slug, lake_id, agent_id, title, address, city, state, zip,
    price, beds, baths, sqft, lot_acres, waterfront_feet, description,
    featured_image_url, gallery, mls_number, external_url, latitude, longitude,
    property_type, year_built, stories, garage_spaces, parking, heating, cooling,
    basement, flooring, appliances, exterior, roof, listing_view, waterfront,
    water_body, fireplace, hoa_fee, annual_tax, original_price, open_house_at,
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
    if (!LISTINGS_PUBLIC || !lakeId) return 0;
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM listings WHERE lake_id = $1 AND status = 'active'`,
        [lakeId]
    );
    return rows[0].c;
}

// GET /api/listings  (public) — active listings, optional ?lake_id= filter.
exports.listPublic = async (req, res) => {
    if (!LISTINGS_PUBLIC) return res.json([]);   // hidden from the public site
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
    if (!LISTINGS_PUBLIC) return res.status(404).json({ error: 'Not found.' });
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

// GET /api/listings/admin/:id — full row (any status) for the edit form.
exports.getAdmin = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const { rows } = await pool.query(`SELECT ${PUBLIC_COLS} FROM listings WHERE id = $1 LIMIT 1`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Listing not found.' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[listings.getAdmin]', err.message);
        res.status(500).json({ error: 'Could not load listing.' });
    }
};

const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
// Tri-state: '' / null / undefined → unknown (won't render). 'yes'/true → true, else false.
const boolOrNull = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    if (v === true || v === 'true' || v === 'yes' || v === 'Yes' || v === '1' || v === 1) return true;
    return false;
};
const strOrNull = (v, max) => (String(v ?? '').trim().slice(0, max) || null);

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
        // ── Zillow-style detail fields (all optional; blanks stay null) ──
        property_type:      strOrNull(b.property_type, 48),
        year_built:         numOrNull(b.year_built),
        stories:            numOrNull(b.stories),
        garage_spaces:      numOrNull(b.garage_spaces),
        parking:            strOrNull(b.parking, 80),
        heating:            strOrNull(b.heating, 80),
        cooling:            strOrNull(b.cooling, 80),
        basement:           strOrNull(b.basement, 80),
        flooring:           strOrNull(b.flooring, 120),
        appliances:         strOrNull(b.appliances, 2000),
        exterior:           strOrNull(b.exterior, 120),
        roof:               strOrNull(b.roof, 80),
        listing_view:       strOrNull(b.listing_view, 120),
        waterfront:         boolOrNull(b.waterfront),
        water_body:         strOrNull(b.water_body, 120),
        fireplace:          boolOrNull(b.fireplace),
        hoa_fee:            numOrNull(b.hoa_fee),
        annual_tax:         numOrNull(b.annual_tax),
        open_house_at:      (String(b.open_house_at ?? '').trim() || null),
    };
}

exports.create = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const v = bodyToCols(req.body || {});
        if (!v.title) return res.status(400).json({ error: 'Title is required.' });
        v.original_price = v.price;                                            // baseline for price-drop detection
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
        const b = req.body || {};
        const v = bodyToCols(b);
        if ('title' in b && !v.title) return res.status(400).json({ error: 'Title is required.' });
        // Partial update: only write columns the request actually sent, so an
        // admin edit form that omits the newer detail fields never wipes them.
        const cols = Object.keys(v).filter(k => b[k] !== undefined);
        if (!cols.length) return res.status(400).json({ error: 'Nothing to update.' });
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

// PATCH /api/listings/admin/:id/status — quick "Add to site" / "Remove from
// site" toggle. active = live on the public site; draft = hidden.
exports.setStatus = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const status = String(req.body?.status || '').trim();
    if (!['active', 'pending', 'sold', 'draft'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
    }
    try {
        const { rows } = await pool.query(
            `UPDATE listings SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status`,
            [status, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Listing not found.' });
        logActivity({
            event_type: status === 'active' ? 'listing.published' : 'listing.unpublished',
            event_scope: 'listing',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.email || 'admin' },
            target: { type: 'listing', id: rows[0].id }, req,
        });
        res.json({ success: true, status: rows[0].status });
    } catch (err) {
        console.error('[listings.setStatus]', err.message);
        res.status(500).json({ error: 'Could not update status.' });
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

// ─── Bulk import / MLS feed sync ────────────────────────────────────────────
// Upsert a batch of listings in OUR field shape. Keyed on mls_number when
// present (so re-imports update in place instead of duplicating); otherwise a
// fresh slugged INSERT. Returns { created, updated, skipped }.
async function upsertMany(items) {
    let created = 0, updated = 0, skipped = 0;
    for (const raw of items) {
        try {
            const v = bodyToCols(raw);
            if (!v.title) { skipped++; continue; }
            const cols = Object.keys(v);
            let existing = null;
            if (v.mls_number) {
                existing = (await pool.query(`SELECT id FROM listings WHERE mls_number = $1 LIMIT 1`, [v.mls_number])).rows[0] || null;
            }
            if (existing) {
                const set = cols.map((k, i) => `${k} = $${i + 2}`).join(', ');
                await pool.query(`UPDATE listings SET ${set}, updated_at = NOW() WHERE id = $1`, [existing.id, ...cols.map(k => v[k])]);
                updated++;
            } else {
                const slug = await uniqueSlug(slugify(raw.slug || v.title));
                const ph = cols.map((_, i) => `$${i + 2}`).join(', ');
                await pool.query(`INSERT INTO listings (slug, ${cols.join(', ')}) VALUES ($1, ${ph})`, [slug, ...cols.map(k => v[k])]);
                created++;
            }
        } catch (e) {
            console.error('[listings.upsertMany] row skipped:', e.message);
            skipped++;
        }
    }
    return { created, updated, skipped };
}

// POST /api/listings/admin/import  { listings: [ {our field shape}, ... ] }
// ─── AGENT-OWNED LISTINGS (agents post their own properties) ────────────────
// Instant-live: an agent's property publishes immediately (status 'active');
// admin can deactivate/delete later. Every op is scoped to the caller's own
// agent row, so one agent can never touch another agent's listings.
async function agentIdFor(req) {
    if (!req.user?.userId) return null;
    const { rows } = await pool.query(`SELECT id FROM agents WHERE user_id = $1 LIMIT 1`, [req.user.userId]);
    return rows[0]?.id || null;
}

exports.listMine = async (req, res) => {
    try {
        const agentId = await agentIdFor(req);
        if (!agentId) return res.status(403).json({ error: 'Create your agent profile first.' });
        const { rows } = await pool.query(
            `SELECT ${PUBLIC_COLS.split(',').map(c => 'l.' + c.trim()).join(', ')},
                    (SELECT COUNT(*)::int FROM leads ld WHERE ld.listing_id = l.id AND ld.deleted_at IS NULL) AS inquiry_count
               FROM listings l WHERE l.agent_id = $1 ORDER BY l.created_at DESC`, [agentId]);
        res.json(rows);
    } catch (err) { console.error('[listings.listMine]', err.message); res.status(500).json({ error: 'Could not load your properties.' }); }
};

exports.createMine = async (req, res) => {
    try {
        const agentId = await agentIdFor(req);
        if (!agentId) return res.status(403).json({ error: 'Create your agent profile first.' });
        const v = bodyToCols(req.body || {});
        if (!v.title) return res.status(400).json({ error: 'A title is required.' });
        v.agent_id = agentId;                                                  // force ownership
        if (!['active', 'draft'].includes(v.status)) v.status = 'active';      // instant-live
        v.original_price = v.price;                                            // remember first price → detect drops
        await geocodeInto(v);                                                  // address → lat/lng for the map
        const slug = await uniqueSlug(slugify(v.title));
        const cols = Object.keys(v);
        const placeholders = cols.map((_, i) => `$${i + 2}`).join(', ');
        const { rows } = await pool.query(
            `INSERT INTO listings (slug, ${cols.join(', ')}) VALUES ($1, ${placeholders}) RETURNING id, slug`,
            [slug, ...cols.map(k => v[k])]);
        logActivity({ event_type: 'listing.agent_created', event_scope: 'listing',
            actor: { type: 'agent', id: req.user?.userId, label: req.user?.email || 'agent' },
            target: { type: 'listing', id: rows[0].id, label: v.title }, req });
        if (v.status === 'active') savedSearch.notifyListing(rows[0].id, 'new');   // alert matching buyers
        res.status(201).json({ success: true, id: rows[0].id, slug: rows[0].slug });
    } catch (err) { console.error('[listings.createMine]', err.message); res.status(500).json({ error: 'Could not create the property.' }); }
};

exports.updateMine = async (req, res) => {
    try {
        const agentId = await agentIdFor(req);
        if (!agentId) return res.status(403).json({ error: 'Create your agent profile first.' });
        const owns = await pool.query(`SELECT price, status FROM listings WHERE id = $1 AND agent_id = $2`, [req.params.id, agentId]);
        if (!owns.rowCount) return res.status(404).json({ error: 'Property not found.' });
        const prevPrice = owns.rows[0].price;
        const v = bodyToCols(req.body || {});
        if (!v.title) return res.status(400).json({ error: 'A title is required.' });
        delete v.agent_id;                                                     // never reassign owner
        if (!['active', 'draft'].includes(v.status)) v.status = 'active';
        // Re-geocode when the address changed (agent edits move the pin).
        v.latitude = null; v.longitude = null; await geocodeInto(v);
        const cols = Object.keys(v);
        const set = cols.map((k, i) => `${k} = $${i + 2}`).join(', ');
        await pool.query(
            `UPDATE listings SET ${set}, updated_at = NOW() WHERE id = $1 AND agent_id = $${cols.length + 2}`,
            [req.params.id, ...cols.map(k => v[k]), agentId]);
        // Alert saved-search subscribers when the price actually drops.
        if (v.status === 'active' && v.price != null && prevPrice != null && Number(v.price) < Number(prevPrice)) {
            savedSearch.notifyListing(req.params.id, 'price_drop');
        }
        res.json({ success: true });
    } catch (err) { console.error('[listings.updateMine]', err.message); res.status(500).json({ error: 'Could not update the property.' }); }
};

exports.setStatusMine = async (req, res) => {
    try {
        const agentId = await agentIdFor(req);
        if (!agentId) return res.status(403).json({ error: 'Create your agent profile first.' });
        const status = req.body?.status === 'active' ? 'active' : 'draft';    // active | inactive(draft)
        const { rowCount } = await pool.query(
            `UPDATE listings SET status = $1, updated_at = NOW() WHERE id = $2 AND agent_id = $3`,
            [status, req.params.id, agentId]);
        if (!rowCount) return res.status(404).json({ error: 'Property not found.' });
        res.json({ success: true, status });
    } catch (err) { console.error('[listings.setStatusMine]', err.message); res.status(500).json({ error: 'Could not update status.' }); }
};

exports.removeMine = async (req, res) => {
    try {
        const agentId = await agentIdFor(req);
        if (!agentId) return res.status(403).json({ error: 'Create your agent profile first.' });
        const { rowCount } = await pool.query(`DELETE FROM listings WHERE id = $1 AND agent_id = $2`, [req.params.id, agentId]);
        if (!rowCount) return res.status(404).json({ error: 'Property not found.' });
        res.json({ success: true });
    } catch (err) { console.error('[listings.removeMine]', err.message); res.status(500).json({ error: 'Could not delete the property.' }); }
};

// Agent image upload — same as uploadImages but without the admin gate (the
// route enforces an authenticated agent).
exports.uploadMine = (req, res) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({ error: 'Image uploads are not configured (Cloudinary env missing).' });
    listingUpload(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
        if (!req.files || !req.files.length) return res.status(400).json({ error: 'No image provided.' });
        try {
            const urls = [];
            for (const f of req.files) { const r = await bufferToCloudinary(f.buffer); urls.push(r.secure_url); }
            res.json({ urls });
        } catch (e) { console.error('[listings.uploadMine]', e.message); res.status(500).json({ error: 'Image upload failed.' }); }
    });
};

// ─── SAVED / LIKED LISTINGS (any signed-in user) ────────────────────────────
exports.toggleSave = async (req, res) => {
    try {
        const uid = req.user?.userId;
        if (!uid) return res.status(401).json({ error: 'Please sign in to save properties.' });
        const listingId = req.params.id;
        const exists = await pool.query(`SELECT 1 FROM saved_listings WHERE user_id = $1 AND listing_id = $2`, [uid, listingId]);
        if (exists.rowCount) {
            await pool.query(`DELETE FROM saved_listings WHERE user_id = $1 AND listing_id = $2`, [uid, listingId]);
            return res.json({ saved: false });
        }
        const l = await pool.query(`SELECT 1 FROM listings WHERE id = $1`, [listingId]);
        if (!l.rowCount) return res.status(404).json({ error: 'Property not found.' });
        await pool.query(`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [uid, listingId]);
        res.json({ saved: true });
    } catch (err) { console.error('[listings.toggleSave]', err.message); res.status(500).json({ error: 'Could not update your saved list.' }); }
};

exports.listSaved = async (req, res) => {
    try {
        const uid = req.user?.userId;
        if (!uid) return res.status(401).json({ error: 'Please sign in.' });
        const { rows } = await pool.query(
            `SELECT l.id, l.slug, l.title, l.description, l.featured_image_url, l.external_url,
                    l.price, l.city, l.state, l.status, s.created_at AS saved_at,
                    a.display_name AS agent_name, a.slug AS agent_slug
               FROM saved_listings s
               JOIN listings l ON l.id = s.listing_id
          LEFT JOIN agents   a ON a.id = l.agent_id
              WHERE s.user_id = $1
           ORDER BY s.created_at DESC`, [uid]);
        res.json(rows);
    } catch (err) { console.error('[listings.listSaved]', err.message); res.status(500).json({ error: 'Could not load your saved properties.' }); }
};

// GET /api/listings/saved/ids — just the ids the user saved (for the ♥ state).
exports.savedIds = async (req, res) => {
    try {
        const uid = req.user?.userId;
        if (!uid) return res.json({ ids: [] });
        const { rows } = await pool.query(`SELECT listing_id FROM saved_listings WHERE user_id = $1`, [uid]);
        res.json({ ids: rows.map(r => r.listing_id) });
    } catch (_) { res.json({ ids: [] }); }
};

// GET /api/listings/map — active, geocoded listings for the Properties map.
exports.mapListings = async (req, res) => {
    if (!LISTINGS_PUBLIC) return res.json([]);
    try {
        const { rows } = await pool.query(
            `SELECT l.id, l.slug, l.title, l.price, l.original_price, l.city, l.featured_image_url,
                    l.latitude, l.longitude, l.beds, l.baths, l.property_type,
                    l.created_at, l.open_house_at,
                    a.display_name AS agent_name,
                    COALESCE(m.sort_priority, 999) AS tier_rank,
                    (a.is_featured OR COALESCE(m.sort_priority, 999) <= 100) AS featured
               FROM listings l
          LEFT JOIN agents a      ON a.id = l.agent_id
          LEFT JOIN memberships m ON m.id = a.membership_id
              WHERE l.status = 'active' AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL
              ORDER BY featured DESC, tier_rank ASC, l.created_at DESC`);
        res.json(rows);
    } catch (e) { console.error('[listings.mapListings]', e.message); res.status(500).json({ error: 'Failed to load map listings.' }); }
};

// ─── ADMIN visibility: an agent's listings / a user's saved properties ──────
exports.listForAgent = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const { rows } = await pool.query(
            `SELECT id, slug, title, price, city, status, featured_image_url, external_url, created_at
               FROM listings WHERE agent_id = $1 ORDER BY created_at DESC`, [req.params.agentId]);
        res.json(rows);
    } catch (e) { console.error('[listings.listForAgent]', e.message); res.status(500).json({ error: 'Failed to load listings.' }); }
};

exports.savedForUser = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const { rows } = await pool.query(
            `SELECT l.id, l.slug, l.title, l.price, l.city, l.featured_image_url, l.status,
                    s.created_at AS saved_at, a.display_name AS agent_name
               FROM saved_listings s
               JOIN listings l ON l.id = s.listing_id
          LEFT JOIN agents   a ON a.id = l.agent_id
              WHERE s.user_id = $1
           ORDER BY s.created_at DESC`, [req.params.userId]);
        res.json(rows);
    } catch (e) { console.error('[listings.savedForUser]', e.message); res.status(500).json({ error: 'Failed to load saved properties.' }); }
};

exports.importBatch = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const items = Array.isArray(req.body?.listings) ? req.body.listings : null;
    if (!items) return res.status(400).json({ error: 'Body must be { listings: [ ... ] }.' });
    if (items.length > 2000) return res.status(400).json({ error: 'Max 2000 listings per import.' });
    try {
        const result = await upsertMany(items);
        logActivity({
            event_type: 'listing.import', event_scope: 'listing',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.email || 'admin' },
            target: { type: 'listing' }, details: { ...result, total: items.length }, req,
        });
        res.json({ success: true, total: items.length, ...result });
    } catch (err) {
        console.error('[listings.importBatch]', err.message);
        res.status(500).json({ error: 'Import failed.' });
    }
};

// Map a RESO Web API record (the common MLS standard) → our field shape.
function mapResoRecord(r) {
    const media = Array.isArray(r.Media) ? r.Media.map(m => m && m.MediaURL).filter(Boolean) : [];
    const active = r.StandardStatus === 'Active' || r.MlsStatus === 'Active';
    return {
        mls_number:      r.ListingKey || r.ListingId || r.ListingKeyNumeric || null,
        title:           r.UnparsedAddress || [r.City, r.StateOrProvince].filter(Boolean).join(', ') || 'Lake Property',
        address:         r.UnparsedAddress || null,
        city:            r.City || null,
        state:           r.StateOrProvince || 'MN',
        zip:             r.PostalCode || null,
        price:           r.ListPrice ?? null,
        beds:            r.BedroomsTotal ?? null,
        baths:           r.BathroomsTotalInteger ?? r.BathroomsTotalDecimal ?? null,
        sqft:            r.LivingArea ?? r.AboveGradeFinishedArea ?? null,
        lot_acres:       r.LotSizeAcres ?? null,
        waterfront_feet: r.WaterfrontFeet ?? null,
        description:     r.PublicRemarks || null,
        featured_image_url: media[0] || null,
        gallery:         media.slice(1),
        latitude:        r.Latitude ?? null,
        longitude:       r.Longitude ?? null,
        external_url:    r.ListingURL || null,
        status:          active ? 'active' : 'pending',
    };
}

// POST /api/listings/admin/sync-feed — pull from a configured RESO Web API /
// JSON feed and upsert. Ready for real credentials: set MLS_FEED_URL (+ optional
// MLS_FEED_TOKEN bearer). Until then it returns a clear "not configured" note.
exports.syncFeed = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const url = process.env.MLS_FEED_URL;
    if (!url) {
        return res.status(503).json({
            error: 'No MLS feed configured.',
            howto: 'Set MLS_FEED_URL to your RESO Web API query (or a JSON feed URL) and, if needed, MLS_FEED_TOKEN for the bearer token. Then click Sync again. The importer maps standard RESO fields (ListingKey, ListPrice, BedroomsTotal, LivingArea, UnparsedAddress, Media, etc.) automatically.',
            configured: false,
        });
    }
    try {
        const headers = { Accept: 'application/json' };
        if (process.env.MLS_FEED_TOKEN) headers.Authorization = `Bearer ${process.env.MLS_FEED_TOKEN}`;
        const r = await fetch(url, { headers });
        if (!r.ok) return res.status(502).json({ error: `Feed responded ${r.status}.` });
        const data = await r.json();
        const records = Array.isArray(data) ? data : (Array.isArray(data.value) ? data.value : []);
        if (!records.length) return res.json({ success: true, total: 0, created: 0, updated: 0, skipped: 0, note: 'Feed returned no records.' });
        const mapped = records.map(mapResoRecord).filter(x => x.title);
        const result = await upsertMany(mapped);
        logActivity({
            event_type: 'listing.feed_sync', event_scope: 'listing',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.email || 'admin' },
            target: { type: 'listing' }, details: { ...result, total: records.length }, req,
        });
        res.json({ success: true, total: records.length, ...result });
    } catch (err) {
        console.error('[listings.syncFeed]', err.message);
        res.status(500).json({ error: `Feed sync failed: ${err.message}` });
    }
};

exports.activeCountForLake = activeCountForLake;
