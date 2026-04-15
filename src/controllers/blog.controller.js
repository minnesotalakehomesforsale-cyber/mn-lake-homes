const pool = require('../database/pool');

// Slugify a title
function slugify(str) {
    return str.toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

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
        const { rows } = await pool.query(`
            SELECT * FROM blog_posts WHERE slug = $1 AND is_published = true AND deleted_at IS NULL
        `, [req.params.slug]);
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
            SELECT id, title, slug, excerpt, cover_image_url, tag, read_time_minutes, author_name,
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
        // Ensure slug is unique
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

// PATCH /api/blog/admin/:id — update post
const updatePost = async (req, res) => {
    const { id } = req.params;
    let { title, excerpt, body, cover_image_url, tag, read_time_minutes, author_name, is_published } = req.body;

    try {
        // Check if publishing for the first time
        const existing = await pool.query('SELECT is_published, published_at FROM blog_posts WHERE id = $1', [id]);
        if (!existing.rows.length) return res.status(404).json({ error: 'Post not found.' });

        const wasPublished = existing.rows[0].is_published;
        const prevPublishedAt = existing.rows[0].published_at;
        const newPublishedAt = is_published && !wasPublished ? new Date() : prevPublishedAt;

        const { rows } = await pool.query(`
            UPDATE blog_posts SET
                title            = COALESCE(NULLIF($1,''), title),
                excerpt          = $2,
                body             = $3,
                cover_image_url  = $4,
                tag              = COALESCE(NULLIF($5,''), tag),
                read_time_minutes= COALESCE($6, read_time_minutes),
                author_name      = COALESCE(NULLIF($7,''), author_name),
                is_published     = $8,
                published_at     = $9,
                updated_at       = NOW()
            WHERE id = $10
            RETURNING *
        `, [title||'', excerpt||null, body||null, cover_image_url||null, tag||'', read_time_minutes||null, author_name||'', !!is_published, newPublishedAt, id]);

        if (!rows.length) return res.status(404).json({ error: 'Post not found.' });
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

module.exports = { getPublished, getBySlug, getAll, createPost, updatePost, deletePost };
