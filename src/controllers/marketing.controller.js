/**
 * marketing.controller.js — backs the admin Marketing tab + public newsletter signup.
 *
 * Endpoints:
 *   PUBLIC (mounted under /api/marketing in routes/marketing.routes.js):
 *     POST   /marketing/subscribe                public newsletter signup
 *
 *   ADMIN (mounted under /api/admin in admin.routes.js):
 *     GET    /marketing/posts                    list all post ideas
 *     POST   /marketing/posts                    create a new post idea
 *     PATCH  /marketing/posts/:id                update title/desc/date/etc
 *     DELETE /marketing/posts/:id                hard delete
 *     GET    /marketing/newsletter/subscribers   unified mailing list
 *                                                (unique emails from users + leads)
 *     GET    /marketing/overview                 dashboard counters + week strip
 */

const pool = require('../database/pool');
const hubspot = require('../services/hubspot');
const { logActivity } = require('../services/activity-log');

const VALID_STATUS = ['idea', 'in_progress', 'scheduled', 'posted', 'cancelled'];

// ─── Public: newsletter signup ──────────────────────────────────────────────
// Writes the email to the leads table so it shows up in the admin Marketing →
// Newsletter mailing list (which UNIONs users + leads by email) and pushes
// it to HubSpot. Idempotent — a repeat subscribe is a no-op on the DB side
// and a PATCH on the HubSpot side. Public; no auth.
exports.subscribeNewsletter = async (req, res) => {
    let { email, source } = req.body || {};
    email = (email || '').trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // 'commonrealtor' | 'mnlakehomes' — used in lead_source so admin can
    // segment subscribers by site of origin.
    const site = source === 'commonrealtor' ? 'commonrealtor' : 'mnlakehomes';
    const leadSource = `newsletter_${site}`;

    try {
        // Skip writing a new row if we already have a lead with this email
        // and the same newsletter source — keeps the leads table clean if
        // someone hammers the subscribe button.
        const dupe = await pool.query(
            `SELECT id FROM leads
              WHERE LOWER(email) = $1 AND lead_source = $2
                AND deleted_at IS NULL
              LIMIT 1`,
            [email, leadSource]
        );

        let leadId = dupe.rows[0]?.id;
        if (!leadId) {
            // Link to existing user account by email so the lead appears in
            // their dashboard, same rule as the main lead form.
            const u = await pool.query(
                'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1',
                [email]
            );
            const userId = u.rows[0]?.id || null;

            const ins = await pool.query(
                `INSERT INTO leads
                   (full_name, first_name, email, lead_type, lead_source, lead_status, user_id, message)
                 VALUES ($1, $2, $3, 'general_contact', $4, 'new', $5, $6)
                 RETURNING id`,
                [email, email.split('@')[0], email, leadSource, userId, 'Newsletter signup.']
            );
            leadId = ins.rows[0].id;
        }

        logActivity({
            event_type: 'newsletter.subscribe',
            event_scope: 'lead',
            actor: { type: 'public', label: email },
            target: { type: 'lead', id: leadId, label: email },
            details: { source: site },
            req,
        });

        // Fire-and-forget HubSpot mirror.
        (async () => {
            const r = await hubspot.syncContact({
                email,
                lifecyclestage: 'subscriber',
                user_type:      'subscriber',
                signup_source:  leadSource,
            });
            if (r?.id && leadId) {
                pool.query(`UPDATE leads SET hs_contact_id = $1 WHERE id = $2`, [r.id, leadId])
                    .catch(e => console.error('[hubspot] save id failed:', e.message));
            }
        })();

        res.status(201).json({ success: true });
    } catch (err) {
        console.error('[marketing.subscribeNewsletter]', err.message);
        res.status(500).json({ error: 'Could not save your subscription. Please try again.' });
    }
};

// ─── Posts (social media / content ideas) ───────────────────────────────────

exports.listPosts = async (req, res) => {
    try {
        // DATE columns get deserialized by `pg` as full JS Date objects
        // → JSON-stringified as ISO timestamps like "2026-05-17T00:00:00.000Z",
        // which breaks the frontend (date inputs need "YYYY-MM-DD" and
        // string equality with today's date stops matching). Cast to text
        // here so the wire format is always plain calendar dates.
        const { rows } = await pool.query(
            `SELECT id, title, description, due_date::text AS due_date,
                    channel, status, created_at, updated_at
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
             RETURNING id, title, description, due_date::text AS due_date,
                       channel, status, created_at, updated_at`,
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
             RETURNING id, title, description, due_date::text AS due_date,
                       channel, status, created_at, updated_at`,
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

// ─── Day-0 launch baselines ─────────────────────────────────────────────────
// One snapshot = a frozen JSON blob of "how big is the platform right now"
// across every table that matters. Admin clicks the button on the dashboard
// once on launch day to lock in the day-0 numbers; later snapshots ("day-30",
// "post-press-release", etc.) let the launch team measure deltas without
// guessing what the day-0 numbers were.

const BASELINE_COUNT_QUERIES = [
    ['users',                  `SELECT COUNT(*)::int AS c FROM users  WHERE deleted_at IS NULL`],
    ['users_clients',          `SELECT COUNT(*)::int AS c FROM users  WHERE deleted_at IS NULL AND role = 'client'`],
    ['users_agents',           `SELECT COUNT(*)::int AS c FROM users  WHERE deleted_at IS NULL AND role = 'agent'`],
    ['users_business_owners',  `SELECT COUNT(*)::int AS c FROM users  WHERE deleted_at IS NULL AND role = 'business_owner'`],
    ['agents_published',       `SELECT COUNT(*)::int AS c FROM agents WHERE is_published = TRUE AND deleted_at IS NULL`],
    ['agents_pending',         `SELECT COUNT(*)::int AS c FROM agents WHERE profile_status = 'pending_review' AND deleted_at IS NULL`],
    ['leads_total',            `SELECT COUNT(*)::int AS c FROM leads  WHERE deleted_at IS NULL`],
    ['leads_unassigned',       `SELECT COUNT(*)::int AS c FROM leads  WHERE deleted_at IS NULL AND assigned_user_id IS NULL`],
    ['cash_offer_leads_total', `SELECT COUNT(*)::int AS c FROM cash_offer_leads WHERE archived_at IS NULL`],
    ['contact_inquiries',      `SELECT COUNT(*)::int AS c FROM contact_inquiries WHERE deleted_at IS NULL`],
    ['businesses_active',      `SELECT COUNT(*)::int AS c FROM businesses WHERE status = 'active'`],
    ['businesses_pending',     `SELECT COUNT(*)::int AS c FROM businesses WHERE status = 'pending'`],
    ['blog_posts_total',       `SELECT COUNT(*)::int AS c FROM blog_posts WHERE deleted_at IS NULL`],
    ['blog_posts_published',   `SELECT COUNT(*)::int AS c FROM blog_posts WHERE deleted_at IS NULL AND is_published = TRUE`],
    ['lakes_total',            `SELECT COUNT(*)::int AS c FROM lakes`],
    ['tags_total',             `SELECT COUNT(*)::int AS c FROM tags WHERE active = TRUE`],
    ['resources_total',        `SELECT COUNT(*)::int AS c FROM resources`],
    ['page_views_total',       `SELECT COUNT(*)::int AS c FROM page_views`],
    ['hubspot_synced_users',   `SELECT COUNT(*)::int AS c FROM users  WHERE hs_contact_id IS NOT NULL`],
    ['hubspot_synced_leads',   `SELECT COUNT(*)::int AS c FROM leads  WHERE hs_contact_id IS NOT NULL`],
];

exports.snapshotBaseline = async (req, res) => {
    const label = String(req.body?.label || 'day_0_launch').trim().slice(0, 80) || 'day_0_launch';
    const note  = req.body?.note ? String(req.body.note).slice(0, 2000) : null;

    const counters = {};
    for (const [k, sql] of BASELINE_COUNT_QUERIES) {
        try {
            const { rows } = await pool.query(sql);
            counters[k] = rows[0]?.c ?? null;
        } catch (err) {
            // A missing table or column shouldn't sink the whole snapshot.
            // Mark the counter null and continue — admin still gets every
            // other counter recorded for the launch baseline.
            counters[k] = null;
            counters[`_error_${k}`] = err.message;
        }
    }
    counters._env = process.env.NODE_ENV || 'local';
    counters._commit = process.env.RENDER_GIT_COMMIT || null;

    try {
        const { rows } = await pool.query(
            `INSERT INTO analytics_baselines (label, note, counters, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING id, label, note, counters, created_at`,
            [label, note, counters, req.user?.userId || null]
        );
        logActivity({
            event_type: 'analytics.baseline.snapshot',
            event_scope: 'analytics',
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.display_name || 'admin' },
            target: { type: 'analytics_baseline', id: rows[0].id, label },
            req,
        });
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[marketing.snapshotBaseline]', err.message);
        res.status(500).json({ error: 'Failed to save baseline.' });
    }
};

// ─── Conversion events (server-side mirror of GA4 / HubSpot events) ────────
// Powers the admin dashboard + metrics tab. Returns rollup counters PLUS
// a recent feed in one round-trip so the admin pages stay snappy.
exports.listConversions = async (req, res) => {
    try {
        const [counts, byForm, recent, daily] = await Promise.all([
            pool.query(`
                SELECT
                    event_name,
                    COUNT(*)::int                                                                              AS total,
                    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int                    AS d1,
                    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int                      AS d7,
                    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int                     AS d30
                  FROM conversion_events
              GROUP BY event_name
              ORDER BY total DESC
            `),
            pool.query(`
                SELECT
                    COALESCE(form_name, 'unknown') AS form_name,
                    event_name,
                    COUNT(*)::int                                                                              AS total,
                    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int                      AS d7,
                    MAX(created_at)                                                                            AS last_seen
                  FROM conversion_events
              GROUP BY form_name, event_name
              ORDER BY d7 DESC, total DESC
                 LIMIT 25
            `),
            pool.query(`
                SELECT event_name, form_name, params, path, referrer, created_at
                  FROM conversion_events
              ORDER BY created_at DESC
                 LIMIT 50
            `),
            pool.query(`
                SELECT date_trunc('day', created_at)::date AS day,
                       COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE event_name = 'generate_lead')::int AS leads,
                       COUNT(*) FILTER (WHERE event_name = 'sign_up')::int       AS signups
                  FROM conversion_events
                 WHERE created_at >= NOW() - INTERVAL '30 days'
              GROUP BY day
              ORDER BY day ASC
            `),
        ]);

        res.json({
            by_event:  counts.rows,
            by_form:   byForm.rows,
            recent:    recent.rows,
            daily:     daily.rows,
        });
    } catch (err) {
        console.error('[marketing.listConversions]', err.message);
        res.status(500).json({ error: 'Failed to load conversions.' });
    }
};

exports.listBaselines = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, label, note, counters, created_at
               FROM analytics_baselines
              ORDER BY created_at DESC
              LIMIT 50`
        );
        res.json(rows);
    } catch (err) {
        console.error('[marketing.listBaselines]', err.message);
        res.status(500).json({ error: 'Failed to load baselines.' });
    }
};

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
                SELECT id, title, description, due_date::text AS due_date,
                       channel, status
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
