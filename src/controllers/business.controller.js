/**
 * business.controller.js — CRUD for the local-businesses catalog
 * (/api/businesses). One row represents a real-world business
 * (restaurant, marina, service provider, photographer, builder, boat
 * rental, etc.). Each business connects to one or more lakes via the
 * business_lakes join table — that's how businesses appear on the
 * public lake pages.
 *
 *   GET    /                     list (public for status=active;
 *                                     admin sees drafts via ?status=all)
 *   GET    /:slugOrId            single business
 *   POST   /                     create (admin) — auto-geocodes address
 *   PATCH  /:id                  update (admin)
 *   DELETE /:id                  soft-archive (admin)
 *   POST   /upload-image         Cloudinary image upload (admin)
 *
 *   GET    /:id/lakes            lakes this business is connected to
 *   PUT    /:id/lakes            replace lake connections (admin)
 */

const pool = require('../database/pool');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { geocodeAddress } = require('../services/geocoder');
const { logActivity } = require('../services/activity-log');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true,
});

const businessImageUpload = multer({
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
                folder: 'mnlakehomes/businesses',
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

// ─── helpers ────────────────────────────────────────────────────────────────
function slugify(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 160);
}

function isAdmin(req) {
    return req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');
}

function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Known types. The schema accepts any VARCHAR, but the admin UI picks
// from this list by default. Keeps options open while preventing the
// usual "Restaraunt" / "restaurant " drift from creeping in.
const KNOWN_TYPES = new Set([
    'restaurant', 'marina', 'service', 'photographer',
    'builder', 'boat_rental', 'outdoor_recreation', 'other',
]);

const BUSINESS_COLS = `
    id, slug, name, type, description, phone, email, website_url,
    instagram_url, facebook_url,
    address, city, state, zip, latitude, longitude, hours, price_range,
    featured_image_url, gallery, status,
    user_id, subscription_status, tier,
    created_at, updated_at
`;

// Keep in sync with the admin + submit UIs. 'pending' is the inbox:
// rows created via POST /submit land here and only show publicly once
// an admin flips them to 'active'.
const ALLOWED_STATUSES = ['pending', 'active', 'draft', 'archived'];

// ─── list ───────────────────────────────────────────────────────────────────
exports.list = async (req, res) => {
    try {
        const { type, status, city, search } = req.query;
        const where = [];
        const params = [];

        if (type) { params.push(type); where.push(`type = $${params.length}`); }
        if (city) { params.push(city); where.push(`lower(city) = lower($${params.length})`); }
        if (search) {
            params.push(`%${String(search).toLowerCase()}%`);
            where.push(`(lower(name) LIKE $${params.length} OR lower(city) LIKE $${params.length})`);
        }

        if (isAdmin(req)) {
            if (status && status !== 'all') {
                params.push(status);
                where.push(`status = $${params.length}`);
            }
        } else {
            // Public visibility rule: admin-managed rows (user_id IS NULL)
            // show on status='active' alone. Owner-managed rows additionally
            // require an active Stripe subscription — if the owner stops
            // paying, the listing auto-hides without any admin action.
            where.push(`status = 'active'`);
            where.push(`(user_id IS NULL OR subscription_status = 'active')`);
        }

        const sql = `
            SELECT b.${BUSINESS_COLS.split(',').map(c => c.trim()).join(', b.')},
                   COALESCE(bl.count, 0)::int AS lake_count
            FROM businesses b
            LEFT JOIN (
                SELECT business_id, COUNT(*) AS count FROM business_lakes GROUP BY business_id
            ) bl ON bl.business_id = b.id
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY b.type ASC, b.name ASC
            LIMIT 1000
        `;
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('[businesses.list]', err.message);
        res.status(500).json({ error: 'Failed to load businesses.' });
    }
};

// ─── get one ────────────────────────────────────────────────────────────────
exports.getOne = async (req, res) => {
    try {
        const key = req.params.slugOrId;
        const byUuid = UUID_RE.test(key);
        const { rows } = await pool.query(
            `SELECT ${BUSINESS_COLS} FROM businesses WHERE ${byUuid ? 'id' : 'slug'} = $1 LIMIT 1`,
            [key]
        );
        const b = rows[0];
        if (!b) return res.status(404).json({ error: 'Business not found.' });
        if (!isAdmin(req)) {
            const visible =
                b.status === 'active' &&
                (b.user_id == null || b.subscription_status === 'active');
            if (!visible) return res.status(404).json({ error: 'Business not found.' });
        }
        res.json(b);
    } catch (err) {
        console.error('[businesses.getOne]', err.message);
        res.status(500).json({ error: 'Failed to load business.' });
    }
};

// ─── create (admin) ─────────────────────────────────────────────────────────
exports.create = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });

        const b = req.body || {};
        const name  = String(b.name || '').trim().slice(0, 200);
        const type  = String(b.type || '').trim().toLowerCase().slice(0, 40);
        const state = String(b.state || 'MN').trim().slice(0, 2).toUpperCase();
        if (!name) return res.status(400).json({ error: 'name is required.' });
        if (!type) return res.status(400).json({ error: 'type is required.' });

        let slug = b.slug ? slugify(b.slug) : slugify(`${type}-${name}`);
        if (!slug) return res.status(400).json({ error: 'Could not derive a valid slug.' });

        // Auto-geocode from address+city if coords not provided.
        let lat = numOrNull(b.latitude);
        let lng = numOrNull(b.longitude);
        let geocoded = false;
        if ((lat == null || lng == null) && (b.address || b.city)) {
            const addr = [b.address, b.city, state, b.zip].filter(Boolean).join(', ');
            const g = await geocodeAddress(addr);
            if (g) { lat = g.lat; lng = g.lng; geocoded = true; }
        }

        const status = ALLOWED_STATUSES.includes(b.status) ? b.status : 'active';
        const gallery = Array.isArray(b.gallery) ? b.gallery : [];

        const { rows } = await pool.query(
            `INSERT INTO businesses
               (slug, name, type, description, phone, email, website_url,
                instagram_url, facebook_url,
                address, city, state, zip, latitude, longitude, hours,
                price_range, featured_image_url, gallery, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20)
             RETURNING ${BUSINESS_COLS}`,
            [
                slug, name, type,
                b.description || null,
                b.phone || null,
                b.email || null,
                b.website_url || null,
                b.instagram_url || null,
                b.facebook_url || null,
                b.address || null,
                b.city || null,
                state,
                b.zip || null,
                lat, lng,
                b.hours || null,
                b.price_range || null,
                b.featured_image_url || null,
                JSON.stringify(gallery),
                status,
            ]
        );
        const biz = rows[0];

        logActivity({
            event_type: 'business.create',
            event_scope: 'business',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'business', id: biz.id, label: `${biz.name} (${biz.type})` },
            details: { slug, type, geocoded, status },
            req,
        });

        res.status(201).json({ ...biz, _geocoded: geocoded });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'A business with that slug already exists.' });
        }
        console.error('[businesses.create]', err.message);
        res.status(500).json({ error: 'Failed to create business.' });
    }
};

// ─── patch (admin) ──────────────────────────────────────────────────────────
exports.patch = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });

        const b = req.body || {};
        const fields = [];
        const vals = [];
        let i = 1;
        const push = (col, val) => { fields.push(`${col} = $${i++}`); vals.push(val); };

        if ('name'        in b) push('name',        String(b.name).trim().slice(0, 200));
        if ('type'        in b) push('type',        String(b.type).trim().toLowerCase().slice(0, 40));
        if ('slug'        in b) {
            const s = slugify(b.slug);
            if (!s) return res.status(400).json({ error: 'Invalid slug.' });
            push('slug', s);
        }
        if ('description'        in b) push('description',        b.description || null);
        if ('phone'              in b) push('phone',              b.phone || null);
        if ('email'              in b) push('email',              b.email || null);
        if ('website_url'        in b) push('website_url',        b.website_url || null);
        if ('instagram_url'      in b) push('instagram_url',      b.instagram_url || null);
        if ('facebook_url'       in b) push('facebook_url',       b.facebook_url || null);
        if ('address'            in b) push('address',            b.address || null);
        if ('city'               in b) push('city',               b.city || null);
        if ('state'              in b) push('state',              String(b.state || 'MN').trim().slice(0, 2).toUpperCase());
        if ('zip'                in b) push('zip',                b.zip || null);
        if ('latitude'           in b) push('latitude',           numOrNull(b.latitude));
        if ('longitude'          in b) push('longitude',          numOrNull(b.longitude));
        if ('hours'              in b) push('hours',              b.hours || null);
        if ('price_range'        in b) push('price_range',        b.price_range || null);
        if ('featured_image_url' in b) push('featured_image_url', b.featured_image_url || null);
        if ('gallery'            in b) {
            const g = Array.isArray(b.gallery) ? b.gallery : [];
            fields.push(`gallery = $${i++}::jsonb`);
            vals.push(JSON.stringify(g));
        }
        if ('status'             in b) {
            if (!ALLOWED_STATUSES.includes(b.status)) {
                return res.status(400).json({ error: 'Invalid status.' });
            }
            push('status', b.status);
        }
        if ('tier'               in b) {
            // Admin can manually mark admin-seeded rows as premium/basic
            // since those don't flow through Stripe.
            if (b.tier !== null && !['premium', 'basic'].includes(b.tier)) {
                return res.status(400).json({ error: 'Invalid tier.' });
            }
            push('tier', b.tier);
        }

        if (!fields.length) return res.json({ success: true, noop: true });

        // Re-geocode on edit when the caller is changing an address field
        // but NOT explicitly setting coords. Matches the create() behavior
        // so a business created empty + later filled in via Edit ends up
        // with a map pin automatically. Skipped silently on geocode failure
        // so existing rows aren't blocked by transient Google API errors.
        const touchedAddress = ('address' in b) || ('city' in b) || ('state' in b) || ('zip' in b);
        const explicitCoords = ('latitude' in b) || ('longitude' in b);
        if (touchedAddress && !explicitCoords) {
            const current = (await pool.query(
                `SELECT address, city, state, zip, latitude, longitude FROM businesses WHERE id = $1`,
                [req.params.id]
            )).rows[0];
            if (current) {
                const merged = {
                    address: 'address' in b ? (b.address || null) : current.address,
                    city:    'city'    in b ? (b.city    || null) : current.city,
                    state:   'state'   in b ? (String(b.state || 'MN').trim().slice(0, 2).toUpperCase()) : current.state,
                    zip:     'zip'     in b ? (b.zip     || null) : current.zip,
                };
                if (merged.address || merged.city) {
                    const addr = [merged.address, merged.city, merged.state, merged.zip].filter(Boolean).join(', ');
                    const g = await geocodeAddress(addr).catch(() => null);
                    if (g) {
                        fields.push(`latitude  = $${i++}`); vals.push(g.lat);
                        fields.push(`longitude = $${i++}`); vals.push(g.lng);
                    }
                }
            }
        }

        fields.push(`updated_at = NOW()`);
        vals.push(req.params.id);
        const { rows, rowCount } = await pool.query(
            `UPDATE businesses SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${BUSINESS_COLS}`,
            vals
        );
        if (!rowCount) return res.status(404).json({ error: 'Business not found.' });
        const biz = rows[0];

        logActivity({
            event_type: 'business.update',
            event_scope: 'business',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'business', id: biz.id, label: `${biz.name} (${biz.type})` },
            details: { changed: Object.keys(b) },
            req,
        });
        res.json(biz);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'A business with that slug already exists.' });
        }
        console.error('[businesses.patch]', err.message);
        res.status(500).json({ error: 'Failed to update business.' });
    }
};

// ─── public self-submission ─────────────────────────────────────────────────
// Anyone can POST a business here; it lands as 'pending' and never appears
// publicly until an admin approves it. Geocoding still runs so the pin is
// map-ready the moment it's approved.
exports.submit = async (req, res) => {
    try {
        const b = req.body || {};
        const name  = String(b.name || '').trim().slice(0, 200);
        const type  = String(b.type || '').trim().toLowerCase().slice(0, 40);
        const state = String(b.state || 'MN').trim().slice(0, 2).toUpperCase();
        if (!name) return res.status(400).json({ error: 'Business name is required.' });
        if (!type) return res.status(400).json({ error: 'Business type is required.' });
        if (!KNOWN_TYPES.has(type)) {
            return res.status(400).json({ error: `Type must be one of: ${[...KNOWN_TYPES].join(', ')}.` });
        }

        // Slug uniqueness — if the derived slug collides, append a short
        // random suffix rather than 409'ing the submitter.
        let slug = slugify(`${type}-${name}`);
        if (!slug) return res.status(400).json({ error: 'Invalid business name.' });
        const exists = await pool.query('SELECT 1 FROM businesses WHERE slug = $1 LIMIT 1', [slug]);
        if (exists.rowCount) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

        let lat = numOrNull(b.latitude);
        let lng = numOrNull(b.longitude);
        if ((lat == null || lng == null) && (b.address || b.city)) {
            const addr = [b.address, b.city, state, b.zip].filter(Boolean).join(', ');
            const g = await geocodeAddress(addr).catch(() => null);
            if (g) { lat = g.lat; lng = g.lng; }
        }

        const { rows } = await pool.query(
            `INSERT INTO businesses
               (slug, name, type, description, phone, email, website_url,
                instagram_url, facebook_url,
                address, city, state, zip, latitude, longitude,
                featured_image_url, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending')
             RETURNING id, slug, name, status`,
            [
                slug, name, type,
                b.description || null,
                b.phone || null,
                b.email || null,
                b.website_url || null,
                b.instagram_url || null,
                b.facebook_url || null,
                b.address || null,
                b.city || null,
                state,
                b.zip || null,
                lat, lng,
                b.featured_image_url || null,
            ]
        );
        const biz = rows[0];
        logActivity({
            event_type: 'business.submit',
            event_scope: 'business',
            actor: { type: 'guest', label: b.email || 'anonymous submitter' },
            target: { type: 'business', id: biz.id, label: `${biz.name} (${type})` },
            details: { slug, type },
            req,
        });
        res.status(201).json({ success: true, id: biz.id, slug: biz.slug });
    } catch (err) {
        console.error('[businesses.submit]', err.message);
        res.status(500).json({ error: 'Could not submit your business. Please try again.' });
    }
};

// ─── archive ────────────────────────────────────────────────────────────────
exports.softDelete = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
        const { rowCount, rows } = await pool.query(
            `UPDATE businesses SET status = 'archived', updated_at = NOW()
             WHERE id = $1
             RETURNING id, name, type`,
            [req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Business not found.' });
        logActivity({
            event_type: 'business.archive',
            event_scope: 'business',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'business', id: rows[0].id, label: `${rows[0].name} (${rows[0].type})` },
            req,
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[businesses.softDelete]', err.message);
        res.status(500).json({ error: 'Failed to archive business.' });
    }
};

// ─── image upload ───────────────────────────────────────────────────────────
exports.uploadImage = (req, res) => {
    businessImageUpload(req, res, async (err) => {
        if (err) {
            console.error('[businesses.uploadImage multer]', err.message);
            return res.status(400).json({ error: err.message });
        }
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }
        try {
            const publicId = `biz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const result   = await uploadBufferToCloudinary(req.file.buffer, publicId);
            logActivity({
                event_type: 'business.image.upload',
                event_scope: 'business',
                actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
                details: { url: result.secure_url, size: req.file.size },
                req,
            });
            res.json({ url: result.secure_url, filename: req.file.originalname, size: req.file.size });
        } catch (cloudErr) {
            const msg = cloudErr && (cloudErr.message || cloudErr.error?.message || String(cloudErr));
            console.error('[businesses.uploadImage cloudinary]', msg, cloudErr);
            res.status(500).json({ error: `Upload failed: ${msg || 'unknown Cloudinary error'}` });
        }
    });
};

// ─── lakes connected to a business ──────────────────────────────────────────
exports.listLakes = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT l.id, l.slug, l.name, l.state, l.region, l.status
             FROM business_lakes bl
             JOIN lakes l ON l.id = bl.lake_id
             WHERE bl.business_id = $1
             ORDER BY l.name ASC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('[businesses.listLakes]', err.message);
        res.status(500).json({ error: 'Failed to load business lakes.' });
    }
};

exports.replaceLakes = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const businessId = req.params.id;
    const lakeIds = Array.isArray(req.body?.lakeIds) ? req.body.lakeIds.filter(Boolean) : null;
    if (!lakeIds) return res.status(400).json({ error: 'lakeIds array is required.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM business_lakes WHERE business_id = $1`, [businessId]);
        if (lakeIds.length) {
            const values = lakeIds.map((_, i) => `($1, $${i + 2})`).join(', ');
            await client.query(
                `INSERT INTO business_lakes (business_id, lake_id)
                 SELECT bid::uuid, lid::uuid FROM (VALUES ${values}) AS v(bid, lid)
                 WHERE EXISTS (SELECT 1 FROM lakes WHERE id = v.lid::uuid)
                 ON CONFLICT (business_id, lake_id) DO NOTHING`,
                [businessId, ...lakeIds]
            );
        }
        await client.query('COMMIT');

        logActivity({
            event_type: 'business.lakes.replace',
            event_scope: 'business',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'business', id: businessId },
            details: { count: lakeIds.length },
            req,
        });

        res.json({ success: true, count: lakeIds.length });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[businesses.replaceLakes]', err.message);
        res.status(500).json({ error: 'Failed to save business lakes.' });
    } finally {
        client.release();
    }
};

// ─── towns (geo tags) a business serves ────────────────────────────────────
// Primary geographic association for businesses post-pivot. Admin UI
// treats these as the "towns this business serves" picker, capped at 10
// to mirror the agent signup limit.
const BUSINESS_TAGS_MAX = 10;

exports.listTags = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT t.id, t.slug, t.name, t.state, t.region, t.latitude, t.longitude
             FROM business_tags bt
             JOIN tags t ON t.id = bt.tag_id
             WHERE bt.business_id = $1 AND t.active = TRUE
             ORDER BY t.name ASC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('[businesses.listTags]', err.message);
        res.status(500).json({ error: 'Failed to load business towns.' });
    }
};

exports.replaceTags = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const businessId = req.params.id;
    const tagIds = Array.isArray(req.body?.tagIds) ? req.body.tagIds.filter(Boolean) : null;
    if (!tagIds) return res.status(400).json({ error: 'tagIds array is required.' });
    if (tagIds.length > BUSINESS_TAGS_MAX) {
        return res.status(400).json({ error: `A business can serve at most ${BUSINESS_TAGS_MAX} towns.` });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM business_tags WHERE business_id = $1`, [businessId]);
        if (tagIds.length) {
            const values = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
            await client.query(
                `INSERT INTO business_tags (business_id, tag_id)
                 SELECT bid::uuid, tid::uuid FROM (VALUES ${values}) AS v(bid, tid)
                 WHERE EXISTS (SELECT 1 FROM tags WHERE id = v.tid::uuid AND active = TRUE)
                 ON CONFLICT (business_id, tag_id) DO NOTHING`,
                [businessId, ...tagIds]
            );
        }
        await client.query('COMMIT');

        logActivity({
            event_type: 'business.tags.replace',
            event_scope: 'business',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'business', id: businessId },
            details: { count: tagIds.length },
            req,
        });

        res.json({ success: true, count: tagIds.length });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[businesses.replaceTags]', err.message);
        res.status(500).json({ error: 'Failed to save business towns.' });
    } finally {
        client.release();
    }
};

exports.KNOWN_TYPES = KNOWN_TYPES;
exports.BUSINESS_TAGS_MAX = BUSINESS_TAGS_MAX;
