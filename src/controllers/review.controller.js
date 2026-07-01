// review.controller.js — customer reviews for agents + businesses.
// Public submissions land 'pending'; an admin approves before they show
// publicly and before they count toward the AggregateRating JSON-LD. We
// never fabricate ratings — the schema only ever reflects approved rows.

const pool = require('../database/pool');
const { logActivity } = require('../services/activity-log');

const SUBJECTS = { agent: 'agents', business: 'businesses' };
const isAdmin = (req) => req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');

// Reusable aggregate — imported by the SSR routes so a page can embed
// AggregateRating without a round trip. Returns { count, average } over
// APPROVED reviews only; count 0 means "omit the schema entirely".
async function aggregateForSubject(subjectType, subjectId) {
    if (!SUBJECTS[subjectType] || !subjectId) return { count: 0, average: 0 };
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count, COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS average
           FROM reviews
          WHERE subject_type = $1 AND subject_id = $2 AND status = 'approved'`,
        [subjectType, subjectId]
    );
    return { count: rows[0].count, average: Number(rows[0].average) };
}

// POST /api/reviews — public submit. Body: { subject_type, subject_id,
// author_name, author_email?, rating, title?, body? }
exports.submit = async (req, res) => {
    try {
        const b = req.body || {};
        const subjectType = String(b.subject_type || '').trim();
        const subjectId   = String(b.subject_id || '').trim();
        const authorName  = String(b.author_name || '').trim().slice(0, 120);
        const authorEmail = String(b.author_email || '').trim().slice(0, 255) || null;
        const rating      = Number(b.rating);
        const title       = String(b.title || '').trim().slice(0, 160) || null;
        const bodyText    = String(b.body || '').trim().slice(0, 4000) || null;

        if (!SUBJECTS[subjectType]) return res.status(400).json({ error: 'Invalid subject type.' });
        if (!subjectId)             return res.status(400).json({ error: 'Missing subject.' });
        if (!authorName)            return res.status(400).json({ error: 'Your name is required.' });
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5.' });
        }

        // Confirm the subject actually exists (and isn't deleted) so reviews
        // can't be attached to arbitrary UUIDs.
        const table = SUBJECTS[subjectType];
        const exists = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`, [subjectId]);
        if (!exists.rowCount) return res.status(404).json({ error: 'That profile no longer exists.' });

        const { rows } = await pool.query(
            `INSERT INTO reviews (subject_type, subject_id, author_name, author_email, rating, title, body, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'onsite')
             RETURNING id`,
            [subjectType, subjectId, authorName, authorEmail, rating, title, bodyText]
        );

        logActivity({
            event_type: 'review.submitted',
            event_scope: subjectType,
            actor: { type: 'visitor', label: authorName },
            target: { type: subjectType, id: subjectId },
            details: { rating, review_id: rows[0].id },
            req,
        });

        res.status(201).json({ success: true, status: 'pending', message: 'Thanks! Your review will appear once it\'s approved.' });
    } catch (err) {
        console.error('[reviews.submit]', err.message);
        res.status(500).json({ error: 'Could not submit your review.' });
    }
};

// GET /api/reviews?subject_type=&subject_id= — public: approved only, plus
// the aggregate. Powers the reviews section on profile pages.
exports.listForSubject = async (req, res) => {
    try {
        const subjectType = String(req.query.subject_type || '').trim();
        const subjectId   = String(req.query.subject_id || '').trim();
        if (!SUBJECTS[subjectType] || !subjectId) return res.status(400).json({ error: 'subject_type and subject_id are required.' });

        const { rows } = await pool.query(
            `SELECT id, author_name, rating, title, body, created_at
               FROM reviews
              WHERE subject_type = $1 AND subject_id = $2 AND status = 'approved'
              ORDER BY created_at DESC
              LIMIT 100`,
            [subjectType, subjectId]
        );
        const aggregate = await aggregateForSubject(subjectType, subjectId);
        res.json({ aggregate, reviews: rows });
    } catch (err) {
        console.error('[reviews.listForSubject]', err.message);
        res.status(500).json({ error: 'Could not load reviews.' });
    }
};

// GET /api/reviews/admin?status= — admin moderation list (enriched with the
// subject's display name).
exports.listAdmin = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
        const where = status ? `WHERE r.status = $1` : '';
        const params = status ? [status] : [];
        const { rows } = await pool.query(
            `SELECT r.*,
                    COALESCE(a.display_name, b.name) AS subject_name,
                    COALESCE(a.slug, b.slug)         AS subject_slug
               FROM reviews r
               LEFT JOIN agents a     ON r.subject_type = 'agent'    AND a.id = r.subject_id
               LEFT JOIN businesses b ON r.subject_type = 'business' AND b.id = r.subject_id
               ${where}
              ORDER BY r.created_at DESC
              LIMIT 500`,
            params
        );
        res.json(rows);
    } catch (err) {
        console.error('[reviews.listAdmin]', err.message);
        res.status(500).json({ error: 'Could not load reviews.' });
    }
};

// PATCH /api/reviews/admin/:id — { status: 'approved' | 'rejected' | 'pending' }
exports.moderate = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const status = String(req.body?.status || '').trim();
        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ error: 'status must be approved, rejected, or pending.' });
        }
        const { rows } = await pool.query(
            `UPDATE reviews
                SET status = $1,
                    approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE NULL END
              WHERE id = $2
              RETURNING id, subject_type, subject_id, status`,
            [status, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Review not found.' });

        logActivity({
            event_type: `review.${status}`,
            event_scope: rows[0].subject_type,
            actor: { type: 'admin', id: req.user?.userId, label: req.user?.email || 'admin' },
            target: { type: 'review', id: rows[0].id },
            req,
        });
        res.json({ success: true, status });
    } catch (err) {
        console.error('[reviews.moderate]', err.message);
        res.status(500).json({ error: 'Could not update the review.' });
    }
};

// DELETE /api/reviews/admin/:id — hard delete (spam removal).
exports.remove = async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const { rowCount } = await pool.query(`DELETE FROM reviews WHERE id = $1`, [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Review not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error('[reviews.remove]', err.message);
        res.status(500).json({ error: 'Could not delete the review.' });
    }
};

exports.aggregateForSubject = aggregateForSubject;
