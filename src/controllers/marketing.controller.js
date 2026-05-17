/**
 * marketing.controller.js — backs the admin Marketing tab.
 *
 * Endpoints (all admin-only, mounted under /api/admin in admin.routes.js):
 *   GET    /marketing/posts                    list all post ideas
 *   POST   /marketing/posts                    create a new post idea
 *   PATCH  /marketing/posts/:id                update title/desc/date/etc
 *   DELETE /marketing/posts/:id                hard delete
 *   GET    /marketing/newsletter/subscribers   unified mailing list
 *                                              (unique emails from users + leads)
 *   GET    /marketing/overview                 dashboard counters + week strip
 */

const pool = require('../database/pool');
const { logActivity } = require('../services/activity-log');

const VALID_STATUS = ['idea', 'in_progress', 'scheduled', 'posted', 'cancelled'];

// ─── Posts (social media / content ideas) ───────────────────────────────────

exports.listPosts = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, title, description, due_date, channel, status,
                    created_at, updated_at
               FROM marketing_posts
              ORDER BY
                  (due_date IS NULL),       -- dated first, undated last
                  due_date ASC,
                  created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        console.error('[marketing.listPosts]', err.message);
        res.status(500).json({ error: 'Failed to load posts.' });
    }
};

exports.createPost = async (req, res) => {
    let { title, description, due_date, channel, status } = req.body || {};
    title = (title || '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    if (title.length > 300) title = title.slice(0, 300);
    if (status && !VALID_STATUS.includes(status)) status = 'idea';

    try {
        const { rows } = await pool.query(
            `INSERT INTO marketing_posts (title, description, due_date, channel, status)
             VALUES ($1, $2, $3, $4, COALESCE($5, 'idea'))
             RETURNING id, title, description, due_date, channel, status, created_at, updated_at`,
            [title, description || null, due_date || null, channel || null, status || null]
        );
        logActivity({
            event_type: 'marketing.post.create',
            event_scope: 'marketing',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'marketing_post', id: rows[0].id, label: title },
            req,
        });
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[marketing.createPost]', err.message);
        res.status(500).json({ error: 'Failed to create post.' });
    }
};

exports.updatePost = async (req, res) => {
    const { id } = req.params;
    const sets = [];
    const vals = [];
    let i = 1;
    const allow = { title: 'title', description: 'description', due_date: 'due_date', channel: 'channel', status: 'status' };
    for (const [k, col] of Object.entries(allow)) {
        if (k in (req.body || {})) {
            let v = req.body[k];
            if (k === 'title') {
                v = (v || '').trim();
                if (!v) return res.status(400).json({ error: 'Title cannot be empty.' });
                v = v.slice(0, 300);
            }
            if (k === 'status' && v && !VALID_STATUS.includes(v)) {
                return res.status(400).json({ error: `Invalid status. Allowed: ${VALID_STATUS.join(', ')}.` });
            }
            if (v === '') v = null;
            vals.push(v);
            sets.push(`${col} = $${i++}`);
        }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update.' });
    sets.push('updated_at = NOW()');
    vals.push(id);

    try {
        const { rows, rowCount } = await pool.query(
            `UPDATE marketing_posts SET ${sets.join(', ')} WHERE id = $${i}
             RETURNING id, title, description, due_date, channel, status, created_at, updated_at`,
            vals
        );
        if (!rowCount) return res.status(404).json({ error: 'Post not found.' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[marketing.updatePost]', err.message);
        res.status(500).json({ error: 'Failed to update post.' });
    }
};

exports.deletePost = async (req, res) => {
    try {
        const { rowCount, rows } = await pool.query(
            `DELETE FROM marketing_posts WHERE id = $1 RETURNING id, title`,
            [req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Post not found.' });
        logActivity({
            event_type: 'marketing.post.delete',
            event_scope: 'marketing',
            severity: 'warning',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'marketing_post', id: rows[0].id, label: rows[0].title },
            req,
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[marketing.deletePost]', err.message);
        res.status(500).json({ error: 'Failed to delete post.' });
    }
};

// ─── Newsletter subscribers (unified mailing list) ──────────────────────────
// Returns every unique email we've captured — both registered users and
// anonymous leads — with `source` indicating where it came from
// ('account', 'lead', or 'both') and a `signed_up_at` timestamp from
// the earliest record.

exports.listSubscribers = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            WITH all_emails AS (
                SELECT LOWER(email) AS email_lc,
                       COALESCE(full_name, first_name || ' ' || last_name) AS name,
                       phone,
                       role::text AS role,
                       'account'::text AS source,
                       created_at
                  FROM users
                 WHERE email IS NOT NULL AND email <> ''
                UNION ALL
                SELECT LOWER(email),
                       full_name,
                       phone,
                       lead_source::text,
                       'lead'::text,
                       created_at
                  FROM leads
                 WHERE email IS NOT NULL AND email <> ''
            )
            SELECT email_lc                       AS email,
                   MAX(name)                      AS name,
                   MAX(phone)                     AS phone,
                   MIN(created_at)                AS signed_up_at,
                   MAX(created_at)                AS last_activity_at,
                   bool_or(source = 'account')    AS has_account,
                   COUNT(*) FILTER (WHERE source = 'lead')::int AS lead_count,
                   array_agg(DISTINCT role) FILTER (WHERE source = 'lead') AS lead_sources
              FROM all_emails
          GROUP BY email_lc
          ORDER BY MAX(created_at) DESC
        `);

        // Decorate each row with a normalized "source" label for the UI.
        const decorated = rows.map(r => ({
            email: r.email,
            name: r.name,
            phone: r.phone,
            signed_up_at: r.signed_up_at,
            last_activity_at: r.last_activity_at,
            has_account: !!r.has_account,
            lead_count: r.lead_count || 0,
            source: r.has_account && r.lead_count > 0 ? 'both'
                  : r.has_account                     ? 'account'
                  :                                     'lead',
            lead_sources: r.lead_sources || [],
        }));

        // Headline stats so the UI can render counters without a second roundtrip.
        const now      = new Date();
        const since7   = new Date(now); since7.setDate(now.getDate() - 7);
        const since30  = new Date(now); since30.setDate(now.getDate() - 30);
        const stats = {
            total:        decorated.length,
            with_account: decorated.filter(d => d.has_account).length,
            lead_only:    decorated.filter(d => !d.has_account).length,
            new_7d:       decorated.filter(d => new Date(d.signed_up_at) >= since7).length,
            new_30d:      decorated.filter(d => new Date(d.signed_up_at) >= since30).length,
        };

        res.json({ rows: decorated, stats });
    } catch (err) {
        console.error('[marketing.listSubscribers]', err.message);
        res.status(500).json({ error: 'Failed to load mailing list.' });
    }
};

// ─── Marketing dashboard overview ───────────────────────────────────────────
// Counts + a 7-day strip of upcoming due posts for the dashboard tab.

exports.overview = async (req, res) => {
    try {
        const [postCounts, weekPosts, mailingCount, blogCount] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*)::int                                                 AS total,
                    COUNT(*) FILTER (WHERE status = 'idea')::int                  AS ideas,
                    COUNT(*) FILTER (WHERE status = 'scheduled')::int             AS scheduled,
                    COUNT(*) FILTER (WHERE status = 'posted')::int                AS posted,
                    COUNT(*) FILTER (
                        WHERE due_date IS NOT NULL
                          AND due_date < CURRENT_DATE
                          AND status NOT IN ('posted', 'cancelled')
                    )::int                                                         AS overdue
                  FROM marketing_posts
            `),
            pool.query(`
                SELECT id, title, description, due_date, channel, status
                  FROM marketing_posts
                 WHERE due_date IS NOT NULL
                   AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '6 days'
                   AND status <> 'cancelled'
                 ORDER BY due_date ASC, created_at DESC
            `),
            pool.query(`
                SELECT COUNT(DISTINCT LOWER(e)) AS c
                  FROM (
                    SELECT email AS e FROM users  WHERE email IS NOT NULL AND email <> ''
                    UNION ALL
                    SELECT email      FROM leads  WHERE email IS NOT NULL AND email <> ''
                  ) AS all_e
            `),
            pool.query(`SELECT COUNT(*)::int AS total,
                               COUNT(*) FILTER (WHERE is_published)::int AS published
                          FROM blog_posts WHERE deleted_at IS NULL`),
        ]);

        res.json({
            posts:       postCounts.rows[0],
            week:        weekPosts.rows,
            subscribers: Number(mailingCount.rows[0]?.c || 0),
            blog:        blogCount.rows[0],
        });
    } catch (err) {
        console.error('[marketing.overview]', err.message);
        res.status(500).json({ error: 'Failed to load overview.' });
    }
};
