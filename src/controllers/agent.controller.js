const pool = require('../database/pool');
const multer = require('multer');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const hubspot = require('../services/hubspot');
const emailService = require('../services/email');
const { logActivity } = require('../services/activity-log');

// When an agent marks a lead Won, email the buyer a token link to leave a
// verified review. One request per lead (ON CONFLICT guards re-marking).
async function triggerReviewRequest(lead) {
    if (!lead || !lead.email || !lead.agent_id) return;
    try {
        const token = crypto.randomBytes(24).toString('hex');
        const { rows } = await pool.query(
            `INSERT INTO review_requests (token, lead_id, agent_id, buyer_name, buyer_email)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (lead_id) DO NOTHING RETURNING token`,
            [token, lead.id, lead.agent_id, lead.full_name || null, lead.email]);
        if (!rows.length) return;   // already requested
        const ag = await pool.query(`SELECT display_name FROM agents WHERE id = $1`, [lead.agent_id]);
        const agentName = ag.rows[0]?.display_name || 'your agent';
        const base = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
        const first = (lead.full_name || '').split(' ')[0] || 'there';
        emailService.sendEmail({
            category: 'marketing',
            to: lead.email,
            subject: `How was your experience with ${agentName}?`,
            html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a202c;">
                <h2 style="margin:0 0 0.6rem;">Congrats on your lake home, ${escapeHtmlA(first)}! 🎉</h2>
                <p style="color:#4a5568;line-height:1.6;">You recently worked with <b>${escapeHtmlA(agentName)}</b> through MN Lake Homes. A quick, honest review helps other lake buyers find a great agent — it takes 30 seconds.</p>
                <p style="text-align:center;margin:1.4rem 0;"><a href="${base}/review/${token}" style="background:#1d6df2;color:#fff;text-decoration:none;font-weight:700;padding:0.8rem 1.6rem;border-radius:10px;display:inline-block;">Leave a review →</a></p>
                <p style="font-size:0.75rem;color:#a0aec0;">Your review will show a "Verified purchase" badge.</p>
            </div>`,
        });
        logActivity({ event_type: 'review.request.sent', event_scope: 'review',
            actor: { type: 'system', label: 'review-request' },
            target: { type: 'lead', id: lead.id }, details: { agent_id: lead.agent_id } });
    } catch (e) { console.warn('[triggerReviewRequest]', e.message); }
}
function escapeHtmlA(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ── Response-time badge (derived from lead SLA data) ────────────────────────
// Median time from lead assignment → the agent working it, over the last 120
// days. Surfaced on public profiles/cards as social proof + gentle pressure.
const RESP_SQL = `
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l.agent_ack_at - l.assigned_at)))
       FROM leads l
      WHERE l.agent_id = a.id AND l.agent_ack_at IS NOT NULL AND l.assigned_at IS NOT NULL
        AND l.agent_ack_at >= l.assigned_at AND l.assigned_at > NOW() - INTERVAL '120 days') AS resp_seconds,
    (SELECT COUNT(*) FROM leads l
      WHERE l.agent_id = a.id AND l.agent_ack_at IS NOT NULL AND l.assigned_at IS NOT NULL
        AND l.assigned_at > NOW() - INTERVAL '120 days')::int AS resp_sample`;

function withResponseBadge(row) {
    const sample = Number(row.resp_sample) || 0;
    const s = row.resp_seconds == null ? null : Number(row.resp_seconds);
    delete row.resp_seconds; delete row.resp_sample;
    if (sample < 3 || s == null) { row.response_label = null; row.response_fast = false; return row; }
    let label;
    if (s <= 3600) label = 'Responds within an hour';
    else if (s <= 4 * 3600) label = `Responds in ~${Math.round(s / 3600)} hours`;
    else if (s <= 12 * 3600) label = 'Responds within hours';
    else if (s <= 36 * 3600) label = 'Responds same day';
    else label = 'Responds within a day';
    row.response_label = label;
    row.response_fast = s <= 4 * 3600;
    return row;
}

// ─── Cloudinary-backed agent profile photo upload ────────────────────────────
// Files persist across deploys, served from Cloudinary CDN, auto-optimized.
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true,
});

// Buffer the upload in memory, then stream it to Cloudinary ourselves.
// More reliable than multer-storage-cloudinary (that package hasn't been
// updated for multer v2 compatibility).
const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
    fileFilter: (req, file, cb) => {
        if (/^image\//.test(file.mimetype)) cb(null, true);
        else cb(new Error('Please upload an image file.'));
    },
}).single('photo');

function uploadBufferToCloudinary(buffer, publicId) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'mnlakehomes/agents',
                public_id: publicId,
                resource_type: 'image',
                overwrite: true,
                transformation: [
                    { width: 1200, height: 1200, crop: 'limit' },
                    { quality: 'auto:good' },
                ],
            },
            (err, result) => (err ? reject(err) : resolve(result))
        );
        stream.end(buffer);
    });
}

// POST /api/agents/upload-photo
const uploadPhoto = (req, res) => {
    photoUpload(req, res, async (err) => {
        if (err) {
            console.error('[uploadPhoto multer]', err.message);
            return res.status(400).json({ error: err.message });
        }
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        try {
            const publicId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const result   = await uploadBufferToCloudinary(req.file.buffer, publicId);

            logActivity({
                event_type: 'agent.photo.upload',
                event_scope: 'agent',
                actor: { type: req.user?.role || 'agent', id: req.user?.userId },
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
            console.error('[uploadPhoto cloudinary]', msg, cloudErr);
            // Surface the actual Cloudinary error in the response so production issues
            // (e.g. missing env vars) are diagnosable without tailing server logs.
            res.status(500).json({
                error: `Upload failed: ${msg || 'unknown Cloudinary error'}`,
                cloudinary_configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
            });
        }
    });
};

/**
 * GET /api/agents/public
 * Returns published agents for the public directory.
 */
const getPublicAgents = async (req, res) => {
    try {
        // Subquery pulls the active geo-tag slugs + names for each agent
        // via their user's user_tags rows. Used by the directory page to
        // filter agents by service area.
        const query = `
            SELECT a.id, a.slug, a.display_name, a.brokerage_name, a.city, a.bio,
                   a.service_areas, a.specialties, a.is_featured,
                   a.phone_public, a.email_public, a.profile_photo_url,
                   m.display_badge_label as membership_badge,
                   m.code as membership_code, m.sort_priority,
                   ${RESP_SQL},
                   COALESCE((
                       SELECT json_agg(json_build_object('slug', t.slug, 'name', t.name, 'state', t.state) ORDER BY t.name)
                       FROM user_tags ut
                       JOIN tags t ON t.id = ut.tag_id
                       WHERE ut.user_id = a.user_id AND t.active = TRUE
                   ), '[]'::json) AS geo_tags
            FROM agents a
            JOIN memberships m ON a.membership_id = m.id
            WHERE a.profile_status = 'published' AND a.is_published = true
            -- Plan tier first (lower sort_priority = higher plan), then the
            -- manual featured boost, then name. Higher-paying agents rank first.
            ORDER BY m.sort_priority ASC NULLS LAST, a.is_featured DESC, a.display_name ASC
        `;
        const { rows } = await pool.query(query);
        const topId = await require('../services/leaderboard').getTopPerformerId().catch(() => null);
        res.json(rows.map(r => { const o = withResponseBadge(r); o.top_performer = (topId && o.id === topId); return o; }));
    } catch (err) {
        console.error('[getPublicAgents]', err.message);
        res.status(500).json({ error: 'Failed to load agent directory.' });
    }
};

/**
 * GET /api/agents/public/:slug
 * Returns a single published agent by slug.
 */
const getAgentBySlug = async (req, res) => {
    const { slug } = req.params;
    try {
        const query = `
            SELECT a.id, a.slug, a.display_name, a.brokerage_name, a.city, a.state,
                   a.service_areas, a.specialties, a.is_featured, a.license_number, a.bio,
                   a.years_experience, a.phone_public, a.email_public, a.website_url,
                   a.facebook_url, a.instagram_url, a.linkedin_url, a.profile_photo_url, a.faq,
                   m.display_badge_label as membership_badge, m.name as membership_name,
                   ${RESP_SQL}
            FROM agents a
            JOIN memberships m ON a.membership_id = m.id
            WHERE a.slug = $1 AND a.profile_status = 'published' AND a.is_published = true
        `;
        const { rows } = await pool.query(query, [slug]);
        if (rows.length === 0) return res.status(404).json({ error: 'Agent not found.' });
        const topId = await require('../services/leaderboard').getTopPerformerId().catch(() => null);
        const out = withResponseBadge(rows[0]);
        out.top_performer = (topId && out.id === topId);
        res.json(out);
    } catch (err) {
        console.error('[getAgentBySlug]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
};

/**
 * GET /api/agents/me
 * Returns the current agent's full profile. Protected by verifyToken + requireRole('agent').
 */
const getMyProfile = async (req, res) => {
    try {
        const query = `
            SELECT a.*, u.email as account_email, u.phone as account_phone, u.full_name as account_full_name,
                   u.account_status, m.name as membership_name, m.display_badge_label as membership_badge
            FROM agents a
            JOIN users u ON a.user_id = u.id
            JOIN memberships m ON a.membership_id = m.id
            WHERE a.user_id = $1
        `;
        const { rows } = await pool.query(query, [req.user.userId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Agent profile not found for this account.' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[getMyProfile]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
};

/**
 * PATCH /api/agents/me
 * Saves agent profile as draft. Agents cannot change their own status or membership.
 */
const saveDraft = async (req, res) => {
    let {
        display_name, brokerage_name, phone_public, email_public, website_url,
        license_number, years_experience, city, service_areas, specialties, bio,
        profile_photo_url, faq
    } = req.body;

    try {
        const cleanArray = (arr) =>
            Array.isArray(arr)
                ? arr.map(a => a.trim()).filter(a => a.length > 0)
                : typeof arr === 'string'
                ? arr.split(',').map(a => a.trim()).filter(a => a.length > 0)
                : [];

        const finalAreas = cleanArray(service_areas);
        const finalSpecs = cleanArray(specialties);
        // FAQ: only persist when the client sent it; sanitize to known keys.
        const { cleanAgentFaq } = require('../services/agent-faq');
        const faqJson = (faq !== undefined) ? JSON.stringify(cleanAgentFaq(faq)) : null;

        await pool.query(
            `UPDATE agents SET
                display_name = COALESCE(NULLIF($1,''), display_name),
                brokerage_name = COALESCE(NULLIF($2,''), brokerage_name),
                phone_public = COALESCE(NULLIF($3,''), phone_public),
                email_public = COALESCE(NULLIF($4,''), email_public),
                website_url = COALESCE(NULLIF($5,''), website_url),
                license_number = COALESCE(NULLIF($6,''), license_number),
                years_experience = COALESCE($7, years_experience),
                city = COALESCE(NULLIF($8,''), city),
                service_areas = COALESCE($9, service_areas),
                specialties = COALESCE($10, specialties),
                bio = COALESCE(NULLIF($11,''), bio),
                profile_photo_url = COALESCE(NULLIF($12,''), profile_photo_url),
                faq = COALESCE($13::jsonb, faq),
                updated_at = NOW()
             WHERE user_id = $14`,
            [
                display_name?.trim() || null,
                brokerage_name?.trim() || null,
                phone_public?.trim() || null,
                email_public?.trim() || null,
                website_url?.trim() || null,
                license_number?.trim() || null,
                years_experience ? parseInt(years_experience) : null,
                city?.trim() || null,
                finalAreas.length > 0 ? JSON.stringify(finalAreas) : null,
                finalSpecs.length > 0 ? JSON.stringify(finalSpecs) : null,
                bio?.trim() || null,
                profile_photo_url?.trim() || null,
                faqJson,
                req.user.userId
            ]
        );

        const { rows } = await pool.query(`SELECT * FROM agents WHERE user_id = $1`, [req.user.userId]);

        logActivity({
            event_type: 'agent.profile.update',
            event_scope: 'agent',
            actor: { type: 'agent', id: req.user.userId, label: rows[0]?.display_name },
            target: { type: 'agent', id: rows[0]?.id, label: rows[0]?.display_name },
            details: Object.fromEntries(Object.entries({
                display_name, brokerage_name, phone_public, email_public, website_url,
                license_number, years_experience, city, bio, profile_photo_url,
            }).filter(([, v]) => v !== undefined && v !== null && v !== '')),
            req,
        });

        // Fire-and-forget HubSpot mirror. Initial agent signup created the
        // contact; this keeps brokerage / phone / public email in sync so
        // outbound sequences from HubSpot stay current. Uses updateContact
        // when we already have an hs_contact_id, otherwise upserts by email.
        (async () => {
            const u = await pool.query(
                `SELECT u.email, u.hs_contact_id, a.display_name, a.brokerage_name,
                        a.phone_public, a.city
                   FROM users u
              LEFT JOIN agents a ON a.user_id = u.id
                  WHERE u.id = $1`,
                [req.user.userId]
            );
            const row = u.rows[0];
            if (!row?.email) return;
            const [first, ...rest] = String(row.display_name || '').split(' ');
            const props = {
                email:     row.email,
                firstname: first || undefined,
                lastname:  rest.join(' ') || undefined,
                phone:     row.phone_public || undefined,
                company:   row.brokerage_name || undefined,
                city:      row.city || undefined,
            };
            if (row.hs_contact_id) {
                hubspot.updateContact(row.hs_contact_id, props);
            } else {
                const r = await hubspot.syncContact(props);
                if (r?.id) {
                    pool.query(`UPDATE users SET hs_contact_id = $1 WHERE id = $2`, [r.id, req.user.userId])
                        .catch(e => console.error('[hubspot] save id failed:', e.message));
                }
            }
        })();

        res.json({ success: true, profile: rows[0] });
    } catch (err) {
        console.error('[saveDraft]', err.message);
        res.status(500).json({ error: 'Failed to save draft.' });
    }
};

/**
 * POST /api/agents/me/submit
 * Submits the agent profile for admin review. Validates required fields first.
 * Agents cannot publish themselves — this only sets status to 'pending_review'.
 */
const submitForReview = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT display_name, brokerage_name, phone_public, city, bio, service_areas, specialties
             FROM agents WHERE user_id = $1`,
            [req.user.userId]
        );

        if (rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });

        const agent = rows[0];
        const areas = Array.isArray(agent.service_areas)
            ? agent.service_areas
            : JSON.parse(agent.service_areas || '[]');
        const specs = Array.isArray(agent.specialties)
            ? agent.specialties
            : JSON.parse(agent.specialties || '[]');

        const missing = [];
        if (!agent.display_name) missing.push('Display Name');
        if (!agent.brokerage_name) missing.push('Brokerage Name');
        if (!agent.phone_public) missing.push('Phone');
        if (!agent.city) missing.push('Primary City');
        if (!agent.bio || agent.bio.trim().length < 20) missing.push('Bio (minimum 20 characters)');
        if (areas.length === 0) missing.push('Service Areas');
        if (specs.length === 0) missing.push('Specialties');

        if (missing.length > 0) {
            return res.status(400).json({
                error: `Profile is incomplete. Please fill in: ${missing.join(', ')}`
            });
        }

        await pool.query(
            `UPDATE agents SET profile_status = 'pending_review', updated_at = NOW() WHERE user_id = $1`,
            [req.user.userId]
        );

        res.json({ success: true, message: 'Profile submitted for review. An admin will review it shortly.' });
    } catch (err) {
        console.error('[submitForReview]', err.message);
        res.status(500).json({ error: 'Failed to submit for review.' });
    }
};

/**
 * GET /api/agents/me/leads
 * Returns all leads assigned to the currently logged-in agent.
 */
const getMyLeads = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { getSlaHours } = require('../services/lead-sla');
        const slaHours = await getSlaHours();
        const { rows } = await pool.query(`
            SELECT l.id, l.full_name as name, l.first_name, l.email, l.phone,
                   l.message, l.lead_type as type, l.lead_source as source,
                   l.lead_status as status, l.budget_min, l.budget_max,
                   l.timeline_text, l.location_text, l.contact_preference,
                   l.source_page_title, l.created_at,
                   l.listing_id, li.title AS listing_title, li.slug AS listing_slug,
                   l.assigned_at, l.agent_ack_at, l.sla_reassign_count,
                   l.outcome, l.outcome_price, l.outcome_note,
                   l.lead_score, l.lead_tier, l.is_waterfront, l.waterfront_feet,
                   l.property_address
            FROM leads l
            JOIN agents a ON l.agent_id = a.id
            JOIN users u ON a.user_id = u.id
            LEFT JOIN listings li ON li.id = l.listing_id
            WHERE u.id = $1
              AND l.deleted_at IS NULL
            ORDER BY l.created_at DESC
        `, [userId]);
        res.json(rows.map(r => ({ ...r, sla_hours: slaHours })));
    } catch (err) {
        console.error('[getMyLeads]', err.message);
        res.status(500).json({ error: 'Failed to fetch leads.' });
    }
};

/**
 * PATCH /api/agents/me/leads/:id/status
 * Lets an agent move one of THEIR OWN assigned leads through the
 * pipeline. Scoped via the agents→users join so an agent can never
 * touch a lead that isn't theirs. Agents can't delete (admin-only) —
 * the most they can do is mark it 'closed', which hides it from their
 * active inbox. Writes the same leads.lead_status column the admin
 * reads, so the change shows up on both sides immediately.
 */
const AGENT_ALLOWED_STATUSES = ['new', 'contacted', 'in_progress', 'closed'];

const updateMyLeadStatus = async (req, res) => {
    const userId = req.user.userId;
    const { id }  = req.params;
    const status  = (req.body?.status || '').trim();

    if (!AGENT_ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Allowed: ${AGENT_ALLOWED_STATUSES.join(', ')}.` });
    }
    try {
        const { rows, rowCount } = await pool.query(`
            UPDATE leads l
               SET lead_status = $1, updated_at = NOW(),
                   agent_ack_at = COALESCE(l.agent_ack_at, NOW())
              FROM agents a
             WHERE l.id = $2
               AND l.agent_id = a.id
               AND a.user_id = $3
               AND l.deleted_at IS NULL
            RETURNING l.id, l.full_name AS name, l.lead_status AS status
        `, [status, id, userId]);

        if (!rowCount) return res.status(404).json({ error: 'Lead not found or not assigned to you.' });

        logActivity({
            event_type: 'lead.status.change',
            event_scope: 'lead',
            actor: { type: 'agent', id: userId },
            target: { type: 'lead', id: rows[0].id, label: rows[0].name },
            details: { new_status: status, by: 'agent' },
            req,
        });
        res.json({ success: true, id: rows[0].id, status: rows[0].status });
    } catch (err) {
        console.error('[updateMyLeadStatus]', err.message);
        res.status(500).json({ error: 'Failed to update lead status.' });
    }
};

// ── Agent ROI (proof-of-value) ──────────────────────────────────────────────
// Assumptions are deliberately conservative and env-overridable so the number
// reads as credible pipeline, not hype.
const ROI_AVG_SALE   = Number(process.env.AGENT_ROI_AVG_SALE_USD)  || 475000;   // typical MN lake home
const ROI_COMMISSION = Number(process.env.AGENT_ROI_COMMISSION_PCT) || 2.5;      // % buyer-side
const ROI_CLOSE_RATE = Number(process.env.AGENT_ROI_CLOSE_RATE)     || 0.08;     // deals per lead
const ROI_PLAN_PRICE = { founder: 249, top_agent: 149, premium: 149, mn_lake_specialist: 39, basic: 9 };

const getMyRoi = async (req, res) => {
    try {
        const userId = req.user.userId;
        const ar = await pool.query(
            `SELECT a.id AS agent_id, m.code AS plan_code, m.display_badge_label AS plan_label
               FROM agents a LEFT JOIN memberships m ON m.id = a.membership_id
              WHERE a.user_id = $1 LIMIT 1`, [userId]);
        if (!ar.rowCount) return res.status(403).json({ error: 'No agent profile yet.' });
        const agentId = ar.rows[0].agent_id;
        const planCode = ar.rows[0].plan_code || 'basic';
        const planPrice = ROI_PLAN_PRICE[planCode] ?? 9;

        const lq = await pool.query(`
            SELECT COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS leads_month,
                   COUNT(*)::int AS leads_total,
                   COUNT(*) FILTER (WHERE listing_id IS NOT NULL AND created_at >= date_trunc('month', now()))::int AS showings_month,
                   COUNT(*) FILTER (WHERE agent_ack_at IS NOT NULL AND created_at >= date_trunc('month', now()))::int AS worked_month,
                   COUNT(*) FILTER (WHERE outcome = 'won')::int AS won_total,
                   COALESCE(SUM(outcome_price) FILTER (WHERE outcome = 'won'), 0)::bigint AS won_volume
              FROM leads WHERE agent_id = $1 AND deleted_at IS NULL`, [agentId]);
        const listq = await pool.query(`
            SELECT AVG(price)::int AS avg_price,
                   COUNT(*) FILTER (WHERE status = 'active')::int AS active_listings,
                   (SELECT COUNT(*)::int FROM leads le
                      WHERE le.listing_id IN (SELECT id FROM listings WHERE agent_id = $1)
                        AND le.deleted_at IS NULL) AS listing_inquiries
              FROM listings WHERE agent_id = $1 AND price IS NOT NULL`, [agentId]);

        const s = lq.rows[0], lst = listq.rows[0];
        const avgSale = lst.avg_price || ROI_AVG_SALE;
        const perClosed = Math.round(avgSale * (ROI_COMMISSION / 100));
        const perLead = Math.round(perClosed * ROI_CLOSE_RATE);
        const monthValue = s.leads_month * perLead;

        res.json({
            plan_code: planCode, plan_label: ar.rows[0].plan_label, plan_price: planPrice,
            leads_month: s.leads_month, leads_total: s.leads_total,
            showings_month: s.showings_month, worked_month: s.worked_month,
            active_listings: lst.active_listings || 0, listing_inquiries: lst.listing_inquiries || 0,
            avg_sale: avgSale, commission_pct: ROI_COMMISSION, close_rate: ROI_CLOSE_RATE,
            per_closed_commission: perClosed, expected_per_lead: perLead,
            month_value: monthValue,
            roi_multiple: planPrice ? +(monthValue / planPrice).toFixed(1) : null,
            won_total: s.won_total || 0,
            won_volume: Number(s.won_volume || 0),
            won_gci: Math.round(Number(s.won_volume || 0) * (ROI_COMMISSION / 100)),
        });
    } catch (e) { console.error('[getMyRoi]', e.message); res.status(500).json({ error: 'Failed to load ROI.' }); }
};

// GET /api/agents/admin/at-risk — churn-risk list for the admin cockpit.
const getAtRiskAgents = async (req, res) => {
    if (!['admin', 'super_admin'].includes(req.user?.role)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const { findAtRisk } = require('../services/churn');
        const list = await findAtRisk();
        res.json(list.map(a => ({ agent_id: a.agent_id, name: a.display_name, email: a.email, reason: a.reason, ghosting: a.ghosting, dormant: a.dormant })));
    } catch (e) { console.error('[getAtRiskAgents]', e.message); res.status(500).json({ error: 'Failed to load at-risk agents.' }); }
};

// GET /api/agents/me/leaderboard — this month's ranking + the caller's spot.
const getMyLeaderboard = async (req, res) => {
    try {
        const { computeLeaderboard } = require('../services/leaderboard');
        const ranked = await computeLeaderboard();
        const meRow = await pool.query(`SELECT id FROM agents WHERE user_id = $1 LIMIT 1`, [req.user.userId]);
        const myAgentId = meRow.rows[0]?.id || null;
        const mine = ranked.find(r => r.agent_id === myAgentId) || null;
        const top = ranked.slice(0, 5).map(r => ({
            rank: r.rank, agent_id: r.agent_id, name: r.display_name,
            wins: r.wins, worked: r.worked, leads: r.leads, score: r.score,
            is_me: r.agent_id === myAgentId,
        }));
        res.json({
            total: ranked.length,
            top,
            me: mine ? { rank: mine.rank, wins: mine.wins, worked: mine.worked, leads: mine.leads, score: mine.score } : null,
        });
    } catch (e) { console.error('[getMyLeaderboard]', e.message); res.status(500).json({ error: 'Failed to load leaderboard.' }); }
};

// PATCH /api/agents/me/leads/:id/outcome — mark a lead won/lost (+ sale price).
// Closing a lead as won/lost also acks it and moves it to 'closed'.
const setMyLeadOutcome = async (req, res) => {
    const userId = req.user.userId;
    const { id } = req.params;
    const outcome = (req.body?.outcome || '').trim().toLowerCase();
    if (!['won', 'lost', 'none'].includes(outcome)) {
        return res.status(400).json({ error: 'Outcome must be won, lost, or none.' });
    }
    const price = outcome === 'won' ? (Number(req.body?.price) || null) : null;
    const note = (req.body?.note || '').toString().trim().slice(0, 2000) || null;
    try {
        const { rows, rowCount } = await pool.query(`
            UPDATE leads l
               SET outcome       = $1,
                   outcome_price = $2,
                   outcome_note  = $3,
                   outcome_at    = CASE WHEN $1 = 'none' THEN NULL ELSE NOW() END,
                   lead_status   = CASE WHEN $1 = 'none' THEN 'in_progress' ELSE 'closed' END,
                   agent_ack_at  = COALESCE(l.agent_ack_at, NOW()),
                   updated_at    = NOW()
              FROM agents a
             WHERE l.id = $4 AND l.agent_id = a.id AND a.user_id = $5 AND l.deleted_at IS NULL
            RETURNING l.id, l.outcome, l.outcome_price, l.lead_status AS status,
                      l.email, l.full_name, l.agent_id`,
            [outcome === 'none' ? null : outcome, price, note, id, userId]);
        if (!rowCount) return res.status(404).json({ error: 'Lead not found or not assigned to you.' });
        logActivity({
            event_type: 'lead.outcome', event_scope: 'lead',
            actor: { type: 'agent', id: userId },
            target: { type: 'lead', id: rows[0].id },
            details: { outcome: rows[0].outcome, price: rows[0].outcome_price }, req,
        });
        // Won → ask the buyer for a verified review (fire-and-forget).
        if (rows[0].outcome === 'won') triggerReviewRequest(rows[0]);
        const { email, full_name, agent_id, ...safe } = rows[0];
        res.json({ success: true, ...safe });
    } catch (err) {
        console.error('[setMyLeadOutcome]', err.message);
        res.status(500).json({ error: 'Failed to record outcome.' });
    }
};

/**
 * GET  /api/agents/me/leads/:id/notes   list MY notes on one of my leads
 * POST /api/agents/me/leads/:id/notes   add a note to one of my leads
 *
 * Notes live in the shared lead_notes table. An agent's own notes
 * surface on the admin Lead Review page (so the team sees everything,
 * tagged by author) — but the reverse is NOT true: an agent only ever
 * sees notes THEY personally authored (n.user_id = me). This keeps
 * notes private per-agent, so:
 *   - reassigning a lead A→B never exposes A's notes to B, and
 *   - candid internal admin notes never leak to the agent.
 * Both endpoints verify the lead is currently assigned to the caller.
 */
async function agentOwnsLead(leadId, userId) {
    const r = await pool.query(
        `SELECT 1 FROM leads l JOIN agents a ON l.agent_id = a.id
          WHERE l.id = $1 AND a.user_id = $2 AND l.deleted_at IS NULL`,
        [leadId, userId]
    );
    return r.rowCount > 0;
}

const getMyLeadNotes = async (req, res) => {
    const userId = req.user.userId;
    const { id }  = req.params;
    try {
        if (!(await agentOwnsLead(id, userId))) {
            return res.status(404).json({ error: 'Lead not found or not assigned to you.' });
        }
        // Own notes only — never other agents' or internal admin notes.
        const { rows } = await pool.query(`
            SELECT n.id, n.note_body AS content, n.created_at,
                   u.full_name AS author_name, u.role AS author_role
              FROM lead_notes n
              JOIN users u ON n.user_id = u.id
             WHERE n.lead_id = $1 AND n.user_id = $2
             ORDER BY n.created_at DESC
        `, [id, userId]);
        res.json(rows);
    } catch (err) {
        console.error('[getMyLeadNotes]', err.message);
        res.status(500).json({ error: 'Failed to load notes.' });
    }
};

const addMyLeadNote = async (req, res) => {
    const userId  = req.user.userId;
    const { id }  = req.params;
    const content = (req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Note cannot be empty.' });
    try {
        if (!(await agentOwnsLead(id, userId))) {
            return res.status(404).json({ error: 'Lead not found or not assigned to you.' });
        }
        const { rows } = await pool.query(
            `INSERT INTO lead_notes (lead_id, user_id, note_body) VALUES ($1, $2, $3)
             RETURNING id, note_body AS content, created_at`,
            [id, userId, content.slice(0, 4000)]
        );
        // Adding a note counts as working the lead → satisfies the response SLA.
        pool.query(`UPDATE leads SET agent_ack_at = COALESCE(agent_ack_at, NOW()) WHERE id = $1`, [id])
            .catch(() => {});
        logActivity({
            event_type: 'lead.note.add',
            event_scope: 'lead',
            actor: { type: 'agent', id: userId },
            target: { type: 'lead', id },
            details: { by: 'agent' },
            req,
        });
        res.status(201).json({ success: true, note: rows[0] });
    } catch (err) {
        console.error('[addMyLeadNote]', err.message);
        res.status(500).json({ error: 'Failed to add note.' });
    }
};

// Legacy alias for old PATCH /me route used by some admin call paths
const updateMyProfile = saveDraft;

// GET /api/agents/faq-questions — the fixed FAQ questions agents answer.
const getFaqQuestions = (req, res) => {
    const { AGENT_FAQS } = require('../services/agent-faq');
    res.json(AGENT_FAQS);
};

// ─── Agent <-> blog post links (co-branded posts / agent spotlights) ─────────
const _isAdmin = (req) => req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');

// GET /api/agents/public/:slug/blog-posts
// Published featured posts for an agent — powers the "Related articles"
// section on the public profile. Public: published only.
const listBlogPostsForAgent = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT bp.id, bp.slug, bp.title, bp.excerpt, bp.cover_image_url,
                    bp.tag, bp.read_time_minutes, bp.author_name,
                    bp.published_at, bp.created_at
             FROM blog_post_agents bpa
             JOIN agents a       ON a.id = bpa.agent_id
             JOIN blog_posts bp  ON bp.id = bpa.blog_post_id
             WHERE a.slug = $1
               AND bp.deleted_at IS NULL
               AND bp.is_published = TRUE
             ORDER BY bp.published_at DESC NULLS LAST, bp.created_at DESC
             LIMIT 12`,
            [req.params.slug]
        );
        res.json(rows);
    } catch (err) {
        console.error('[listBlogPostsForAgent]', err.message);
        res.status(500).json({ error: 'Failed to load agent blog posts.' });
    }
};

// GET /api/agents/by-blog-post/:postId — agents featured in a post.
// Used by the blog admin editor to prefill the "Agents" picker.
const listAgentsForBlogPost = async (req, res) => {
    if (!_isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const { rows } = await pool.query(
            `SELECT a.id, a.slug, a.display_name, a.profile_photo_url
             FROM blog_post_agents bpa
             JOIN agents a ON a.id = bpa.agent_id
             WHERE bpa.blog_post_id = $1
             ORDER BY a.display_name ASC`,
            [req.params.postId]
        );
        res.json(rows);
    } catch (err) {
        console.error('[listAgentsForBlogPost]', err.message);
        res.status(500).json({ error: 'Failed to load agents for this post.' });
    }
};

// PUT /api/agents/by-blog-post/:postId — replace the post's featured agents.
const replaceAgentsForBlogPost = async (req, res) => {
    if (!_isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
    const postId = req.params.postId;
    const agentIds = Array.isArray(req.body?.agentIds) ? req.body.agentIds.filter(Boolean) : null;
    if (!agentIds) return res.status(400).json({ error: 'agentIds array is required.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM blog_post_agents WHERE blog_post_id = $1`, [postId]);
        if (agentIds.length) {
            const values = agentIds.map((_, i) => `($1, $${i + 2})`).join(', ');
            await client.query(
                `INSERT INTO blog_post_agents (blog_post_id, agent_id)
                 SELECT pid::uuid, aid::uuid FROM (VALUES ${values}) AS v(pid, aid)
                 WHERE EXISTS (SELECT 1 FROM agents WHERE id = v.aid::uuid)
                 ON CONFLICT (blog_post_id, agent_id) DO NOTHING`,
                [postId, ...agentIds]
            );
        }
        await client.query('COMMIT');

        logActivity({
            event_type: 'blog_post.agents.replace',
            event_scope: 'blog_post',
            actor: { type: 'user', id: req.user?.userId, label: req.user?.email || req.user?.role },
            target: { type: 'blog_post', id: postId },
            details: { count: agentIds.length },
            req,
        });

        res.json({ success: true, count: agentIds.length });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[replaceAgentsForBlogPost]', err.message);
        res.status(500).json({ error: 'Failed to save agents for this post.' });
    } finally {
        client.release();
    }
};

// GET /api/agents/me/upgrade-status — drives the dashboard's context-aware
// upgrade nudge. Tells us the agent's tier, whether they already hold a founder
// seat, and which lakes in THEIR service areas have NO founder yet (so a paying
// non-founder can be pushed to claim one). Free agents get pushed to pay first.
const getUpgradeStatus = async (req, res) => {
    try {
        const userId = req.user.userId;
        const ar = await pool.query(
            `SELECT a.id AS agent_id, COALESCE(m.code,'basic') AS tier
               FROM agents a LEFT JOIN memberships m ON m.id = a.membership_id
              WHERE a.user_id = $1 LIMIT 1`, [userId]);
        if (!ar.rowCount) return res.status(403).json({ error: 'No agent profile yet.' });
        const { agent_id, tier } = ar.rows[0];
        const isPaid = tier !== 'free';

        const isFounder = (await pool.query(
            `SELECT EXISTS (SELECT 1 FROM agent_lakes al WHERE al.agent_id = $1 AND al.is_founder) AS f`,
            [agent_id])).rows[0].f;

        // Lakes in the agent's service areas (their tags) with no founder seated.
        let claimable = [];
        try {
            claimable = (await pool.query(`
                SELECT DISTINCT l.slug, l.name, l.region,
                       GREATEST(249, LEAST(5000, COALESCE(l.founder_seat_price, l.founder_seat_ai_value, 249)))::int AS price
                  FROM lakes l
                  JOIN lake_tags lt ON lt.lake_id = l.id
                  JOIN user_tags ut ON ut.tag_id = lt.tag_id AND ut.user_id = $1
                 WHERE l.status = 'published'
                   AND NOT EXISTS (SELECT 1 FROM agent_lakes al WHERE al.lake_id = l.id AND al.is_founder)
                 ORDER BY price DESC
                 LIMIT 8`, [userId])).rows;
        } catch (_) { claimable = []; }

        // Recommend the next step: free → upgrade to paid; paid non-founder with
        // an open lake → claim founder; otherwise nothing to nudge.
        let recommend = 'none';
        if (!isPaid) recommend = 'upgrade_paid';
        else if (!isFounder && claimable.length) recommend = 'claim_founder';

        res.json({ tier, is_paid: isPaid, is_founder: isFounder, claimable_lakes: claimable, recommend });
    } catch (err) {
        console.error('[getUpgradeStatus]', err.message);
        res.status(500).json({ error: 'Failed to load upgrade status.' });
    }
};

// GET /api/agents/me/referrals — the agent's referral code, share link, and the
// agents they've brought in. "Refer an agent, get a month free" — each signed-up
// referral is one earned reward (applied by the team as a Stripe credit/coupon).
const getMyReferrals = async (req, res) => {
    try {
        const me = await pool.query(
            `SELECT id, referral_code FROM agents WHERE user_id = $1 LIMIT 1`, [req.user.userId]);
        if (!me.rows.length) return res.status(404).json({ error: 'Agent profile not found.' });
        const { id, referral_code } = me.rows[0];

        const { rows: referrals } = await pool.query(
            `SELECT r.status, r.reward_granted, r.created_at,
                    COALESCE(a.display_name, r.referred_email, 'New agent') AS name,
                    a.profile_status
               FROM agent_referrals r
               LEFT JOIN agents a ON a.id = r.referred_agent_id
              WHERE r.referrer_agent_id = $1
              ORDER BY r.created_at DESC`, [id]);

        const site = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
        res.json({
            code: referral_code,
            link: `${site}/join?ref=${encodeURIComponent(referral_code || '')}`,
            total: referrals.length,
            rewards_earned: referrals.length,          // 1 free month per signed-up referral
            rewards_applied: referrals.filter(r => r.reward_granted).length,
            referrals,
        });
    } catch (err) {
        console.error('[getMyReferrals]', err.message);
        res.status(500).json({ error: 'Failed to load referrals.' });
    }
};

module.exports = {
    getPublicAgents,
    getAgentBySlug,
    getMyProfile,
    saveDraft,
    submitForReview,
    updateMyProfile,
    getMyLeads,
    getMyRoi,
    getUpgradeStatus,
    getMyReferrals,
    getMyLeaderboard,
    getAtRiskAgents,
    setMyLeadOutcome,
    updateMyLeadStatus,
    getMyLeadNotes,
    addMyLeadNote,
    uploadPhoto,
    getFaqQuestions,
    listBlogPostsForAgent,
    listAgentsForBlogPost,
    replaceAgentsForBlogPost
};
