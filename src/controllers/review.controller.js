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
const OK_MSG = { success: true, status: 'pending', message: 'Thanks! Your review will appear once it\'s approved.' };

exports.submit = async (req, res) => {
    try {
        const b = req.body || {};
        // Honeypot — a hidden field real users never see. Bots fill it. Pretend
        // success so the bot doesn't learn it was blocked, but store nothing.
        if (String(b.website || b.hp_url || '').trim()) return res.status(201).json(OK_MSG);

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

        // Content heuristic — reviews stuffed with links are almost always spam.
        const linkCount = ((bodyText || '') + ' ' + (title || '')).match(/https?:\/\//gi)?.length || 0;
        if (linkCount > 3) return res.status(400).json({ error: 'Your review looks like spam. Please remove links and try again.' });

        // Confirm the subject actually exists (and isn't deleted) so reviews
        // can't be attached to arbitrary UUIDs.
        const table = SUBJECTS[subjectType];
        const exists = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`, [subjectId]);
        if (!exists.rowCount) return res.status(404).json({ error: 'That profile no longer exists.' });

        // Rate limit by IP: cap total per hour, and stop one IP review-bombing
        // a single subject. Best-effort (skips cleanly if IP can't be read).
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                   || req.socket?.remoteAddress || '';
        if (ip) {
            const hourly = await pool.query(
                `SELECT COUNT(*)::int AS c FROM reviews WHERE author_ip = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
                [ip]
            );
            if (hourly.rows[0].c >= 5) {
                return res.status(429).json({ error: 'You have submitted several reviews recently — please try again later.' });
            }
            const perSubject = await pool.query(
                `SELECT COUNT(*)::int AS c FROM reviews
                  WHERE author_ip = $1 AND subject_type = $2 AND subject_id = $3
                    AND created_at > NOW() - INTERVAL '24 hours'`,
                [ip, subjectType, subjectId]
            );
            if (perSubject.rows[0].c >= 2) {
                return res.status(429).json({ error: 'You have already reviewed this recently. Thank you!' });
            }
        }

        const { rows } = await pool.query(
            `INSERT INTO reviews (subject_type, subject_id, author_name, author_email, rating, title, body, source, author_ip)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'onsite', $8)
             RETURNING id`,
            [subjectType, subjectId, authorName, authorEmail, rating, title, bodyText, ip || null]
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
            `SELECT id, author_name, rating, title, body, verified, created_at
               FROM reviews
              WHERE subject_type = $1 AND subject_id = $2 AND status = 'approved'
              ORDER BY verified DESC, created_at DESC
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

// ── Token-gated verified reviews (from a closed deal) ───────────────────────
// GET /api/reviews/request/:token — details for the review page.
exports.getRequest = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT rr.token, rr.buyer_name, rr.used_at, rr.agent_id,
                    a.display_name AS agent_name, a.slug AS agent_slug, a.profile_photo_url
               FROM review_requests rr JOIN agents a ON a.id = rr.agent_id
              WHERE rr.token = $1 LIMIT 1`, [req.params.token]);
        if (!rows.length) return res.status(404).json({ error: 'This review link is invalid.' });
        const r = rows[0];
        res.json({
            agent_id: r.agent_id, agent_name: r.agent_name, agent_slug: r.agent_slug,
            agent_photo: r.profile_photo_url, buyer_name: r.buyer_name,
            used: !!r.used_at,
        });
    } catch (e) { console.error('[reviews.getRequest]', e.message); res.status(500).json({ error: 'Could not load.' }); }
};

// POST /api/reviews/request/:token — submit a verified review (auto-approved,
// since the token proves it's a real buyer of that agent). One use per token.
exports.submitVerified = async (req, res) => {
    try {
        const b = req.body || {};
        const rating = Number(b.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Please pick a 1–5 star rating.' });
        const title = String(b.title || '').trim().slice(0, 160) || null;
        const bodyText = String(b.body || '').trim().slice(0, 4000) || null;

        const rr = await pool.query(
            `SELECT rr.id, rr.used_at, rr.agent_id, rr.buyer_name, rr.buyer_email
               FROM review_requests rr WHERE rr.token = $1 LIMIT 1`, [req.params.token]);
        if (!rr.rowCount) return res.status(404).json({ error: 'This review link is invalid.' });
        const request = rr.rows[0];
        if (request.used_at) return res.status(409).json({ error: 'This review has already been submitted. Thank you!' });

        const authorName = String(b.author_name || request.buyer_name || 'Verified buyer').trim().slice(0, 120);
        const ins = await pool.query(
            `INSERT INTO reviews (subject_type, subject_id, author_name, author_email, rating, title, body, status, source, verified, approved_at)
             VALUES ('agent', $1, $2, $3, $4, $5, $6, 'approved', 'verified_close', TRUE, NOW())
             RETURNING id`,
            [request.agent_id, authorName, request.buyer_email, rating, title, bodyText]);
        await pool.query(`UPDATE review_requests SET used_at = NOW() WHERE id = $1`, [request.id]);

        logActivity({ event_type: 'review.verified.submitted', event_scope: 'agent',
            actor: { type: 'visitor', label: authorName },
            target: { type: 'agent', id: request.agent_id },
            details: { rating, review_id: ins.rows[0].id }, req });
        res.status(201).json({ success: true });
    } catch (e) { console.error('[reviews.submitVerified]', e.message); res.status(500).json({ error: 'Could not submit your review.' }); }
};

exports.aggregateForSubject = aggregateForSubject;
