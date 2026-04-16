const pool = require('../database/pool');
const path = require('path');
const fs   = require('fs');
const multer = require('multer');

// ─── Image upload config ─────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'assets', 'images');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        const safe = path.basename(file.originalname, ext).toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
        cb(null, `blog-${Date.now()}-${safe}${ext}`);
    }
});
const uploadMiddleware = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        if (/^image\//.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only image uploads are allowed.'));
    }
}).single('image');

// Slugify a title
function slugify(str) {
    return str.toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

// POST /api/blog/admin/upload-image — accept an image file, return its public URL
const uploadImage = (req, res) => {
    uploadMiddleware(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
        const publicUrl = `/assets/images/${req.file.filename}`;
        res.json({ url: publicUrl, filename: req.file.filename, size: req.file.size });
    });
};

// GET /api/blog — published posts only (public)
const getPublished = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT id, title, slug, excerpt, cover_image_url, tag, read_time_minutes, author_name, published_at, created_at
            FROM blog_posts
            WHERE is_published = true AND deleted_at IS NULL
            ORDER BY published_at DESC NULLS LAST, created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[blog.getPublished]', err.message);
        res.status(500).json({ error: 'Failed to fetch posts.' });
    }
};

// GET /api/blog/:slug — single published post (public)
const getBySlug = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM blog_posts WHERE slug = $1 AND is_published = true AND deleted_at IS NULL`,
            [req.params.slug]
        );
        if (!rows.length) return res.status(404).json({ error: 'Post not found.' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[blog.getBySlug]', err.message);
        res.status(500).json({ error: 'Failed to fetch post.' });
    }
};

// GET /api/blog/admin/all — all posts including drafts (admin)
const getAll = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT id, title, slug, excerpt, body, cover_image_url, tag, read_time_minutes, author_name,
                   is_published, published_at, created_at, updated_at
            FROM blog_posts
            WHERE deleted_at IS NULL
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('[blog.getAll]', err.message);
        res.status(500).json({ error: 'Failed to fetch posts.' });
    }
};

// POST /api/blog/admin — create new post
const createPost = async (req, res) => {
    let { title, excerpt, body, cover_image_url, tag, read_time_minutes, author_name, is_published } = req.body;
    title = (title || '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required.' });

    let slug = slugify(title);
    try {
        const existing = await pool.query('SELECT slug FROM blog_posts WHERE slug LIKE $1', [`${slug}%`]);
        if (existing.rows.length) slug = `${slug}-${existing.rows.length + 1}`;

        const published_at = is_published ? new Date() : null;
        const { rows } = await pool.query(`
            INSERT INTO blog_posts (title, slug, excerpt, body, cover_image_url, tag, read_time_minutes, author_name, is_published, published_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING *
        `, [title, slug, excerpt||null, body||null, cover_image_url||null, tag||'General', read_time_minutes||4, author_name||'MN Lake Homes Team', !!is_published, published_at]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[blog.createPost]', err.message);
        res.status(500).json({ error: 'Failed to create post.' });
    }
};

// PATCH /api/blog/admin/:id — update post (partial updates supported)
const updatePost = async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};

    try {
        const existing = await pool.query('SELECT * FROM blog_posts WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (!existing.rows.length) return res.status(404).json({ error: 'Post not found.' });
        const current = existing.rows[0];

        // Only update fields that were actually provided in the request body.
        // This prevents partial updates (like toggling publish) from wiping content.
        const fields = [];
        const vals = [];
        let i = 1;

        const allowed = ['title', 'excerpt', 'body', 'cover_image_url', 'tag', 'read_time_minutes', 'author_name'];
        for (const key of allowed) {
            if (key in body) {
                fields.push(`${key} = $${i++}`);
                vals.push(body[key] === '' ? null : body[key]);
            }
        }

        if ('is_published' in body) {
            const newPub = !!body.is_published;
            fields.push(`is_published = $${i++}`);
            vals.push(newPub);
            // Set published_at only when transitioning from unpublished → published
            if (newPub && !current.is_published) {
                fields.push(`published_at = $${i++}`);
                vals.push(new Date());
            }
        }

        if (!fields.length) return res.json(current);

        fields.push(`updated_at = NOW()`);
        vals.push(id);

        const { rows } = await pool.query(
            `UPDATE blog_posts SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
            vals
        );
        res.json(rows[0]);
    } catch (err) {
        console.error('[blog.updatePost]', err.message);
        res.status(500).json({ error: 'Failed to update post.' });
    }
};

// DELETE /api/blog/admin/:id — soft delete
const deletePost = async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            `UPDATE blog_posts SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
            [req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Post not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error('[blog.deletePost]', err.message);
        res.status(500).json({ error: 'Failed to delete post.' });
    }
};

module.exports = { getPublished, getBySlug, getAll, createPost, updatePost, deletePost, uploadImage };
