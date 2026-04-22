/**
 * lake.controller.js — CRUD for the lakes catalog (/api/lakes).
 *
 * Each lake drives its own public hub page at /lakes/<slug>. Admin
 * endpoints mirror the tag controller's pattern (slugify, numeric
 * coercion, auto-geocoding when coordinates are blank, activity log).
 *
 *   GET    /                     list (public for status=published;
 *                                admin sees drafts via ?status=all)
 *   GET    /:slugOrId            single lake (by slug or UUID); public
 *                                for published, admin for drafts
 *   POST   /                     create (admin) — auto-geocodes
 *   PATCH  /:id                  update (admin)
 *   DELETE /:id                  soft-archive (admin, sets status=archived)
 *
 *   GET    /:id/agents           agents connected to this lake
 *   PUT    /:id/agents           replace the connected-agent set (admin)
 */

const pool = require('../database/pool');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { geocodeAddress } = require('../services/geocoder');
const { logActivity } = require('../services/activity-log');

// Cloudinary is configured once (cloud_name / api_key / api_secret in
// .env). We mirror the agent-photo pattern: buffer to memory, stream up
// to Cloudinary, store the returned secure_url on the lake row.
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true,
});

const lakeImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — hero images can be larger
    fileFilter: (req, file, cb) => {
        if (/^image\//.test(file.mimetype)) cb(null, true);
        else cb(new Error('Please upload an image file.'));
    },
}).single('image');

function uploadBufferToCloudinary(buffer, publicId) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'mnlakehomes/lakes',
                public_id: publicId,
                resource_type: 'image',
                overwrite: true,
                transformation: [
                    { width: 2000, height: 2000, crop: 'limit' },
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
        .slice(0, 120);
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

const LAKE_COLS = `
    id, slug, name, state, region, county,
    latitude, longitude,
    intro_text, description,
    hero_image_url, featured_image_url,
    seo_title, seo_description,
    status, created_at, updated_at
`;

// ─── list ──────────────────────────────────────────────────────────────────
exports.list = async (req, res) => {
    try {
        const { state, region, county, search, status } = req.query;
        const where = [];
        const params = [];

        if (state)  { params.push(state);  where.push(`state = $${params.length}`); }
        if (region) { params.push(region); where.push(`region = $${params.length}`); }
        if (county) { params.push(county); where.push(`county = $${params.length}`); }
        if (search) {
            params.push(`%${String(search).toLowerCase()}%`);
            where.push(`lower(name) LIKE $${params.length}`);
        }

        // Status filter: public callers can only see 'published'. Admins
        // may pass ?status=all to see drafts + archived, or a specific
        // status value.
        if (isAdmin(req)) {
            if (status && status !== 'all') {
                params.push(status);
                where.push(`status = $${params.length}`);
            }
        } else {
            where.push(`status = 'published'`);
        }

        // Join counts for the admin table view (linked agents + businesses).
        const sql = `
            SELECT
                ${LAKE_COLS.split(',').map(c => `l.${c.trim()}`).join(', ')},
                COALESCE(al.count, 0)::int AS agent_count,
                COALESCE(bl.count, 0)::int AS business_count
            FROM lakes l
            LEFT JOIN (
                SELECT lake_id, COUNT(*) AS count FROM agent_lakes GROUP BY lake_id
            ) al ON al.lake_id = l.id
            LEFT JOIN (
                SELECT lake_id, COUNT(*) AS count FROM business_lakes GROUP BY lake_id
            ) bl ON bl.lake_id = l.id
            ${where.length ? `WHERE ${where.map(w => w.replace(/\b(state|region|county|status|lower\(name\))\b/g, 'l.$1')).join(' AND ')}` : ''}
            ORDER BY l.state ASC, l.region ASC NULLS LAST, l.name ASC
            LIMIT 500
        `;
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('[lakes.list]', err.message);
        res.status(500).json({ error: 'Failed to load lakes.' });
    }
};

// ─── get one ───────────────────────────────────────────────────────────────
exports.getOne = async (req, res) => {
    try {
        const key = req.params.slugOrId;
        const byUuid = UUID_RE.test(key);
        const { rows } = await pool.query(
            `SELECT ${LAKE_COLS} FROM lakes WHERE ${byUuid ? 'id' : 'slug'} = $1 LIMIT 1`,
            [key]
        );
        const lake = rows[0];
        if (!lake) return res.status(404).json({ error: 'Lake not found.' });
        if (lake.status !== 'published' && !isAdmin(req)) {
            return res.status(404).json({ error: 'Lake not found.' });
        }
        res.json(lake);
    } catch (err) {
        console.error('[lakes.getOne]', err.message);
        res.status(500).json({ error: 'Failed to load lake.' });
    }
};

// ─── create (admin) ────────────────────────────────────────────────────────
exports.create = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });

        const b = req.body || {};
        const name  = String(b.name  || '').trim().slice(0, 200);
        const state = String(b.state || 'MN').trim().slice(0, 2).toUpperCase();
        if (!name) return res.status(400).json({ error: 'name is required.' });

        let slug = b.slug ? slugify(b.slug) : slugify(name);
        if (!slug) return res.status(400).json({ error: 'Could not derive a valid slug from name.' });

        let lat = numOrNull(b.latitude);
        let lng = numOrNull(b.longitude);
        let geocoded = false;
        if (lat == null || lng == null) {
            const g = await geocodeAddress(`${name}, ${state}`);
            if (g) { lat = g.lat; lng = g.lng; geocoded = true; }
        }

        const status = ['draft', 'published', 'archived'].includes(b.status) ? b.status : 'draft';

        const { rows } = await pool.query(
            `INSERT INTO lakes
               (slug, name, state, region, county, latitude, longitude,
                intro_text, description, hero_image_url, featured_image_url,
                seo_title, seo_description, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING ${LAKE_COLS}`,
            [
                slug, name, state,
                b.region || null,
                b.county || null,
                lat, lng,
                b.intro_text || null,
                b.description || null,
                b.hero_image_url || null,
                b.featured_image_url || null,
                b.seo_title || null,
                b.seo_description || null,
                status,
            ]
        );
        const lake = rows[0];

        logActivity({
            event_type: 'lake.create',
            event_scope: 'lake',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'lake', id: lake.id, label: `${lake.name}, ${lake.state}` },
            details: { slug, geocoded, lat, lng, status },
            req,
        });

        res.status(201).json({ ...lake, _geocoded: geocoded });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'A lake with that slug already exists.' });
        }
        console.error('[lakes.create]', err.message);
        res.status(500).json({ error: 'Failed to create lake.' });
    }
};

// ─── patch (admin) ─────────────────────────────────────────────────────────
exports.patch = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });

        const b = req.body || {};
        const fields = [];
        const vals = [];
        let i = 1;
        const push = (col, val) => { fields.push(`${col} = $${i++}`); vals.push(val); };

        if ('name'  in b) push('name',  String(b.name).trim().slice(0, 200));
        if ('state' in b) push('state', String(b.state).trim().slice(0, 2).toUpperCase());
        if ('slug'  in b) {
            const s = slugify(b.slug);
            if (!s) return res.status(400).json({ error: 'Invalid slug.' });
            push('slug', s);
        }
        if ('region'             in b) push('region',             b.region ? String(b.region).trim().slice(0, 100) : null);
        if ('county'             in b) push('county',             b.county ? String(b.county).trim().slice(0, 100) : null);
        if ('latitude'           in b) push('latitude',           numOrNull(b.latitude));
        if ('longitude'          in b) push('longitude',          numOrNull(b.longitude));
        if ('intro_text'         in b) push('intro_text',         b.intro_text || null);
        if ('description'        in b) push('description',        b.description || null);
        if ('hero_image_url'     in b) push('hero_image_url',     b.hero_image_url || null);
        if ('featured_image_url' in b) push('featured_image_url', b.featured_image_url || null);
        if ('seo_title'          in b) push('seo_title',          b.seo_title || null);
        if ('seo_description'    in b) push('seo_description',    b.seo_description || null);
        if ('status' in b) {
            if (!['draft', 'published', 'archived'].includes(b.status)) {
                return res.status(400).json({ error: 'Invalid status.' });
            }
            push('status', b.status);
        }

        if (!fields.length) return res.json({ success: true, noop: true });

        fields.push(`updated_at = NOW()`);
        vals.push(req.params.id);
        const { rows, rowCount } = await pool.query(
            `UPDATE lakes SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${LAKE_COLS}`,
            vals
        );
        if (!rowCount) return res.status(404).json({ error: 'Lake not found.' });
        const lake = rows[0];

        logActivity({
            event_type: 'lake.update',
            event_scope: 'lake',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'lake', id: lake.id, label: `${lake.name}, ${lake.state}` },
            details: { changed: Object.keys(b) },
            req,
        });
        res.json(lake);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'A lake with that slug already exists.' });
        }
        console.error('[lakes.patch]', err.message);
        res.status(500).json({ error: 'Failed to update lake.' });
    }
};

// ─── archive (admin soft-delete) ────────────────────────────────────────────
exports.softDelete = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
        const { rowCount, rows } = await pool.query(
            `UPDATE lakes SET status = 'archived', updated_at = NOW()
             WHERE id = $1
             RETURNING id, name, state`,
            [req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Lake not found.' });
        logActivity({
            event_type: 'lake.archive',
            event_scope: 'lake',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'lake', id: rows[0].id, label: `${rows[0].name}, ${rows[0].state}` },
            req,
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[lakes.softDelete]', err.message);
        res.status(500).json({ error: 'Failed to archive lake.' });
    }
};

// ─── agents on a lake ───────────────────────────────────────────────────────
// Returns any agent who either:
//   (a) is tagged (via user_tags) with any geo-tag this lake is tied to
//       via lake_tags — the "it's all about the geo tags" path, so an
//       agent who tags themselves with a town automatically appears on
//       every lake inside that town, AND
//   (b) is directly linked via agent_lakes — admin override for
//       featuring specific agents per lake.
// Results are deduped and ordered by lake-featured first, then agent-
// featured, then name.
exports.listAgents = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT DISTINCT ON (a.id)
                    a.id, a.slug, a.user_id,
                    a.display_name, a.brokerage_name,
                    a.phone_public, a.email_public,
                    a.profile_photo_url, a.bio, a.city,
                    a.is_featured AS agent_is_featured,
                    a.is_published,
                    u.full_name, u.email,
                    COALESCE(al.is_featured, FALSE) AS lake_is_featured
             FROM agents a
             JOIN users u ON u.id = a.user_id
             LEFT JOIN agent_lakes al ON al.agent_id = a.id AND al.lake_id = $1
             WHERE (
                 al.lake_id IS NOT NULL
                 OR EXISTS (
                     SELECT 1 FROM lake_tags lt
                     JOIN user_tags ut ON ut.tag_id = lt.tag_id
                     WHERE lt.lake_id = $1 AND ut.user_id = a.user_id
                 )
             )
               AND a.is_published = TRUE
               AND a.profile_status = 'published'
               AND a.deleted_at IS NULL
             ORDER BY a.id, lake_is_featured DESC, a.is_featured DESC, a.display_name ASC`,
            [req.params.id]
        );
        // Re-sort after DISTINCT ON (which forces a.id leading order).
        rows.sort((x, y) => {
            if (x.lake_is_featured !== y.lake_is_featured) return y.lake_is_featured ? 1 : -1;
            if (x.agent_is_featured !== y.agent_is_featured) return y.agent_is_featured ? 1 : -1;
            return (x.display_name || '').localeCompare(y.display_name || '');
        });
        res.json(rows);
    } catch (err) {
        console.error('[lakes.listAgents]', err.message);
        res.status(500).json({ error: 'Failed to load lake agents.' });
    }
};

// ─── image upload (admin) ───────────────────────────────────────────────────
// POST /api/lakes/upload-image — returns { url, filename, size }. The
// caller is expected to PATCH the lake row with hero_image_url or
// featured_image_url afterward (matches the agent upload pattern).
exports.uploadImage = (req, res) => {
    lakeImageUpload(req, res, async (err) => {
        if (err) {
            console.error('[lakes.uploadImage multer]', err.message);
            return res.status(400).json({ error: err.message });
        }
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }
        try {
            const publicId = `lake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const result   = await uploadBufferToCloudinary(req.file.buffer, publicId);

            logActivity({
                event_type: 'lake.image.upload',
                event_scope: 'lake',
                actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
                details: {
                    url: result.secure_url,
                    public_id: result.public_id,
                    size: req.file.size,
                    mimetype: req.file.mimetype,
                },
                req,
            });

            res.json({
                url: result.secure_url,
                filename: req.file.originalname,
                size: req.file.size,
            });
        } catch (cloudErr) {
            const msg = cloudErr && (cloudErr.message || cloudErr.error?.message || String(cloudErr));
            console.error('[lakes.uploadImage cloudinary]', msg, cloudErr);
            res.status(500).json({
                error: `Upload failed: ${msg || 'unknown Cloudinary error'}`,
                cloudinary_configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
            });
        }
    });
};

// ─── blog posts connected to a lake ─────────────────────────────────────────
// Public: returns *published* posts attached to this lake, ordered by
// published_at DESC. The /lakes/:slug hub page calls this to render its
// "From the blog" section.
// Admin callers (valid token + admin role) get drafts too.
exports.listBlogPosts = async (req, res) => {
    try {
        const adminCaller = isAdmin(req);
        const where = ['bpl.lake_id = $1', 'bp.deleted_at IS NULL'];
        if (!adminCaller) where.push('bp.is_published = TRUE');

        const { rows } = await pool.query(
            `SELECT bp.id, bp.slug, bp.title, bp.excerpt, bp.cover_image_url,
                    bp.tag, bp.read_time_minutes, bp.author_name,
                    bp.is_published, bp.published_at, bp.created_at
             FROM blog_post_lakes bpl
             JOIN blog_posts bp ON bp.id = bpl.blog_post_id
             WHERE ${where.join(' AND ')}
             ORDER BY bp.published_at DESC NULLS LAST, bp.created_at DESC
             LIMIT 50`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('[lakes.listBlogPosts]', err.message);
        res.status(500).json({ error: 'Failed to load lake blog posts.' });
    }
};

exports.replaceBlogPosts = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const lakeId = req.params.id;
    const blogPostIds = Array.isArray(req.body?.blogPostIds) ? req.body.blogPostIds.filter(Boolean) : null;
    if (!blogPostIds) return res.status(400).json({ error: 'blogPostIds array is required.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM blog_post_lakes WHERE lake_id = $1`, [lakeId]);
        if (blogPostIds.length) {
            const values = blogPostIds.map((_, i) => `($${i + 2}, $1)`).join(', ');
            await client.query(
                `INSERT INTO blog_post_lakes (blog_post_id, lake_id)
                 SELECT pid::uuid, lid::uuid FROM (VALUES ${values}) AS v(pid, lid)
                 WHERE EXISTS (SELECT 1 FROM blog_posts WHERE id = v.pid::uuid)
                 ON CONFLICT (blog_post_id, lake_id) DO NOTHING`,
                [lakeId, ...blogPostIds]
            );
        }
        await client.query('COMMIT');

        logActivity({
            event_type: 'lake.blog_posts.replace',
            event_scope: 'lake',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'lake', id: lakeId },
            details: { count: blogPostIds.length },
            req,
        });

        res.json({ success: true, count: blogPostIds.length });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[lakes.replaceBlogPosts]', err.message);
        res.status(500).json({ error: 'Failed to save lake blog posts.' });
    } finally {
        client.release();
    }
};

// ─── the reverse direction: lakes connected to a blog post ─────────────────
// Used by the blog admin editor's "Lakes this post covers" tab to prefill
// the multi-select when opening an existing post.
exports.listLakesForBlogPost = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT l.id, l.slug, l.name, l.state, l.region
             FROM blog_post_lakes bpl
             JOIN lakes l ON l.id = bpl.lake_id
             WHERE bpl.blog_post_id = $1
             ORDER BY l.name ASC`,
            [req.params.postId]
        );
        res.json(rows);
    } catch (err) {
        console.error('[lakes.listLakesForBlogPost]', err.message);
        res.status(500).json({ error: 'Failed to load lakes for this post.' });
    }
};

exports.replaceLakesForBlogPost = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const postId = req.params.postId;
    const lakeIds = Array.isArray(req.body?.lakeIds) ? req.body.lakeIds.filter(Boolean) : null;
    if (!lakeIds) return res.status(400).json({ error: 'lakeIds array is required.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM blog_post_lakes WHERE blog_post_id = $1`, [postId]);
        if (lakeIds.length) {
            const values = lakeIds.map((_, i) => `($1, $${i + 2})`).join(', ');
            await client.query(
                `INSERT INTO blog_post_lakes (blog_post_id, lake_id)
                 SELECT pid::uuid, lid::uuid FROM (VALUES ${values}) AS v(pid, lid)
                 WHERE EXISTS (SELECT 1 FROM lakes WHERE id = v.lid::uuid)
                 ON CONFLICT (blog_post_id, lake_id) DO NOTHING`,
                [postId, ...lakeIds]
            );
        }
        await client.query('COMMIT');

        logActivity({
            event_type: 'blog_post.lakes.replace',
            event_scope: 'blog_post',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'blog_post', id: postId },
            details: { count: lakeIds.length },
            req,
        });

        res.json({ success: true, count: lakeIds.length });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[lakes.replaceLakesForBlogPost]', err.message);
        res.status(500).json({ error: 'Failed to save lakes for this post.' });
    } finally {
        client.release();
    }
};

// ─── businesses connected to a lake ─────────────────────────────────────────
// Public callers only see active businesses; admins see drafts and
// archived too. Optional ?type=restaurant filter to power the per-type
// tabs on the admin lake-detail page and the matching public sections.
exports.listBusinesses = async (req, res) => {
    try {
        const adminCaller = isAdmin(req);
        const where = ['bl.lake_id = $1'];
        const params = [req.params.id];

        if (req.query.type) {
            params.push(String(req.query.type).toLowerCase().slice(0, 40));
            where.push(`b.type = $${params.length}`);
        }
        if (!adminCaller) {
            // Public visibility mirrors /api/businesses: active status +
            // (admin-managed OR active subscription). Keeps unpaid owner
            // rows out of the lake page even when they're still linked.
            where.push(`b.status = 'active'`);
            where.push(`(b.user_id IS NULL OR b.subscription_status = 'active')`);
        }

        const { rows } = await pool.query(
            `SELECT b.id, b.slug, b.name, b.type, b.description, b.phone, b.email,
                    b.website_url, b.address, b.city, b.state, b.zip,
                    b.latitude, b.longitude, b.hours, b.price_range,
                    b.featured_image_url, b.status, b.tier,
                    bl.is_featured
             FROM business_lakes bl
             JOIN businesses b ON b.id = bl.business_id
             WHERE ${where.join(' AND ')}
             ORDER BY (b.tier = 'premium') DESC, bl.is_featured DESC, b.name ASC`,
            params
        );
        res.json(rows);
    } catch (err) {
        console.error('[lakes.listBusinesses]', err.message);
        res.status(500).json({ error: 'Failed to load lake businesses.' });
    }
};

// Replace the business set connected to a lake. If req.query.type is
// set, only business_lakes rows whose business has that type are
// replaced — keeps the 4 per-type tabs (Restaurants / Marinas / ...)
// independent of each other. Without ?type, the full set is replaced.
exports.replaceBusinesses = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const lakeId = req.params.id;
    const scopeType = req.query.type ? String(req.query.type).toLowerCase().slice(0, 40) : null;
    const businessIds = Array.isArray(req.body?.businessIds) ? req.body.businessIds.filter(Boolean) : null;
    if (!businessIds) return res.status(400).json({ error: 'businessIds array is required.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (scopeType) {
            // Only delete rows that belong to businesses of this type.
            await client.query(
                `DELETE FROM business_lakes bl
                 USING businesses b
                 WHERE bl.business_id = b.id
                   AND bl.lake_id = $1
                   AND b.type = $2`,
                [lakeId, scopeType]
            );
        } else {
            await client.query(`DELETE FROM business_lakes WHERE lake_id = $1`, [lakeId]);
        }
        if (businessIds.length) {
            const values = businessIds.map((_, i) => `($${i + 2}, $1)`).join(', ');
            await client.query(
                `INSERT INTO business_lakes (business_id, lake_id)
                 SELECT bid::uuid, lid::uuid FROM (VALUES ${values}) AS v(bid, lid)
                 WHERE EXISTS (SELECT 1 FROM businesses WHERE id = v.bid::uuid${scopeType ? ` AND type = '${scopeType.replace(/'/g, "''")}'` : ''})
                 ON CONFLICT (business_id, lake_id) DO NOTHING`,
                [lakeId, ...businessIds]
            );
        }
        await client.query('COMMIT');

        logActivity({
            event_type: 'lake.businesses.replace',
            event_scope: 'lake',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'lake', id: lakeId },
            details: { count: businessIds.length, type: scopeType },
            req,
        });

        res.json({ success: true, count: businessIds.length, type: scopeType });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[lakes.replaceBusinesses]', err.message);
        res.status(500).json({ error: 'Failed to save lake businesses.' });
    } finally {
        client.release();
    }
};

// ─── nearby towns (tags) on a lake ──────────────────────────────────────────
// Returns the existing geo tags (cities/towns) linked to a lake.
// Public-readable — the tag catalog is public and lake pages render
// "Nearby towns" links directly from it.
exports.listTags = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT t.id, t.slug, t.name, t.state, t.region, t.latitude, t.longitude
             FROM lake_tags lt
             JOIN tags t ON t.id = lt.tag_id
             WHERE lt.lake_id = $1 AND t.active = TRUE
             ORDER BY t.name ASC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('[lakes.listTags]', err.message);
        res.status(500).json({ error: 'Failed to load lake tags.' });
    }
};

exports.replaceTags = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const lakeId = req.params.id;
    const tagIds = Array.isArray(req.body?.tagIds) ? req.body.tagIds.filter(Boolean) : null;
    if (!tagIds) return res.status(400).json({ error: 'tagIds array is required.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM lake_tags WHERE lake_id = $1`, [lakeId]);
        if (tagIds.length) {
            const values = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
            await client.query(
                `INSERT INTO lake_tags (lake_id, tag_id)
                 SELECT lid::uuid, tid::uuid FROM (VALUES ${values}) AS v(lid, tid)
                 WHERE EXISTS (SELECT 1 FROM tags WHERE id = v.tid::uuid)
                 ON CONFLICT (lake_id, tag_id) DO NOTHING`,
                [lakeId, ...tagIds]
            );
        }
        await client.query('COMMIT');

        logActivity({
            event_type: 'lake.tags.replace',
            event_scope: 'lake',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'lake', id: lakeId },
            details: { count: tagIds.length },
            req,
        });

        res.json({ success: true, count: tagIds.length });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[lakes.replaceTags]', err.message);
        res.status(500).json({ error: 'Failed to save lake tags.' });
    } finally {
        client.release();
    }
};

exports.replaceAgents = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const lakeId = req.params.id;
    const agentIds = Array.isArray(req.body?.agentIds) ? req.body.agentIds.filter(Boolean) : null;
    if (!agentIds) return res.status(400).json({ error: 'agentIds array is required.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM agent_lakes WHERE lake_id = $1`, [lakeId]);
        if (agentIds.length) {
            const values = agentIds.map((_, i) => `($${i + 2}, $1)`).join(', ');
            await client.query(
                `INSERT INTO agent_lakes (agent_id, lake_id)
                 SELECT aid::uuid, lid::uuid FROM (VALUES ${values}) AS v(aid, lid)
                 WHERE EXISTS (SELECT 1 FROM agents WHERE id = v.aid::uuid)
                 ON CONFLICT (agent_id, lake_id) DO NOTHING`,
                [lakeId, ...agentIds]
            );
        }
        await client.query('COMMIT');

        logActivity({
            event_type: 'lake.agents.replace',
            event_scope: 'lake',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'lake', id: lakeId },
            details: { count: agentIds.length },
            req,
        });

        res.json({ success: true, count: agentIds.length });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[lakes.replaceAgents]', err.message);
        res.status(500).json({ error: 'Failed to save lake agents.' });
    } finally {
        client.release();
    }
};
