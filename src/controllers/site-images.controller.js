/**
 * site-images.controller.js — admin CRUD for the site-wide image catalog.
 *
 * Routes (mounted under /api/admin/site-images in admin.routes.js):
 *
 *   GET    /api/admin/site-images         list every discovered image
 *   PATCH  /api/admin/site-images/:id     set override_url (null = reset)
 *   POST   /api/admin/site-images/upload  Cloudinary upload, returns { url }
 *   POST   /api/admin/site-images/rescan  trigger a re-scan on demand
 *
 * The discovery service (site-images-scan.js) populates the table on
 * server boot, so this controller is for inspection + replacement only.
 */

const pool = require('../database/pool');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { logActivity } = require('../services/activity-log');
const { scanAndSync } = require('../services/site-images-scan');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true,
});

const siteImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/^image\//.test(file.mimetype)) cb(null, true);
        else cb(new Error('Please upload an image file.'));
    },
}).single('image');

function uploadBufferToCloudinary(buffer, publicId) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'mnlakehomes/site-images',
                public_id: publicId,
                resource_type: 'image',
                overwrite: true,
                transformation: [
                    { width: 2400, height: 2400, crop: 'limit' },
                    { quality: 'auto:good' },
                ],
            },
            (err, result) => (err ? reject(err) : resolve(result))
        );
        stream.end(buffer);
    });
}

// ─── GET /api/admin/site-images ─────────────────────────────────────────────
// Returns every row, sorted so overridden ones bubble to the top of each
// page group. The admin UI does its own grouping by page_paths.
exports.list = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, original_src, override_url, page_paths,
                    description, first_seen_at, last_seen_at, updated_at,
                    (override_url IS NOT NULL AND override_url <> '') AS has_override
               FROM site_images
              ORDER BY page_paths[1] ASC NULLS LAST, original_src ASC`
        );
        res.json(rows);
    } catch (err) {
        console.error('[site-images.list]', err.message);
        res.status(500).json({ error: 'Failed to load site images.' });
    }
};

// ─── PATCH /api/admin/site-images/:id ────────────────────────────────────────
// Body: { override_url: string | null, description?: string }
// Empty / null override_url resets to the original (the public endpoint
// stops including this row in the override map).
exports.patch = async (req, res) => {
    const { id } = req.params;
    const b = req.body || {};
    const sets = [];
    const vals = [];
    let i = 1;

    if ('override_url' in b) {
        const v = (b.override_url && String(b.override_url).trim()) || null;
        sets.push(`override_url = $${i++}`); vals.push(v);
    }
    if ('description' in b) {
        const v = (b.description && String(b.description).trim().slice(0, 500)) || null;
        sets.push(`description = $${i++}`); vals.push(v);
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update.' });
    sets.push(`updated_at = NOW()`);
    vals.push(id);

    try {
        const { rows, rowCount } = await pool.query(
            `UPDATE site_images SET ${sets.join(', ')} WHERE id = $${i}
             RETURNING id, original_src, override_url, page_paths, description, updated_at`,
            vals
        );
        if (!rowCount) return res.status(404).json({ error: 'Image not found.' });
        logActivity({
            event_type: 'site_image.override',
            event_scope: 'site_images',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'site_image', id: rows[0].id, label: rows[0].original_src },
            details: { override_url: rows[0].override_url || null },
            req,
        });
        res.json(rows[0]);
    } catch (err) {
        console.error('[site-images.patch]', err.message);
        res.status(500).json({ error: 'Failed to update site image.' });
    }
};

// ─── POST /api/admin/site-images/upload ─────────────────────────────────────
// Multipart; field 'image'. Returns { url }. Caller then PATCHes a
// site_images row with override_url=that url to make the swap live.
exports.upload = (req, res) => {
    siteImageUpload(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file?.buffer) return res.status(400).json({ error: 'No file uploaded.' });
        try {
            const publicId = `site-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const result   = await uploadBufferToCloudinary(req.file.buffer, publicId);
            logActivity({
                event_type: 'site_image.upload',
                event_scope: 'site_images',
                actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
                details: { url: result.secure_url, size: req.file.size },
                req,
            });
            res.json({ url: result.secure_url, filename: req.file.originalname, size: req.file.size });
        } catch (cloudErr) {
            const msg = cloudErr?.message || cloudErr?.error?.message || String(cloudErr);
            console.error('[site-images.upload]', msg);
            res.status(500).json({ error: `Upload failed: ${msg}` });
        }
    });
};

// ─── POST /api/admin/site-images/rescan ─────────────────────────────────────
// On-demand re-scan of the HTML/CSS files. Useful after a deploy adds
// new pages or after editing existing pages — admin clicks Rescan and
// any new images show up in the list immediately.
exports.rescan = async (req, res) => {
    try {
        const summary = await scanAndSync(pool);
        logActivity({
            event_type: 'site_image.rescan',
            event_scope: 'site_images',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            details: summary,
            req,
        });
        res.json({ success: true, ...summary });
    } catch (err) {
        console.error('[site-images.rescan]', err.message);
        res.status(500).json({ error: 'Rescan failed.' });
    }
};
