const pool = require('../database/pool');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const hubspot = require('../services/hubspot');
const { logActivity } = require('../services/activity-log');

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
        res.json(rows);
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
                   a.facebook_url, a.instagram_url, a.linkedin_url, a.profile_photo_url,
                   m.display_badge_label as membership_badge, m.name as membership_name
            FROM agents a
            JOIN memberships m ON a.membership_id = m.id
            WHERE a.slug = $1 AND a.profile_status = 'published' AND a.is_published = true
        `;
        const { rows } = await pool.query(query, [slug]);
        if (rows.length === 0) return res.status(404).json({ error: 'Agent not found.' });
        res.json(rows[0]);
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
        profile_photo_url
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
                updated_at = NOW()
             WHERE user_id = $13`,
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
        const { rows } = await pool.query(`
            SELECT l.id, l.full_name as name, l.first_name, l.email, l.phone,
                   l.message, l.lead_type as type, l.lead_source as source,
                   l.lead_status as status, l.budget_min, l.budget_max,
                   l.timeline_text, l.location_text, l.contact_preference,
                   l.source_page_title, l.created_at
            FROM leads l
            JOIN agents a ON l.agent_id = a.id
            JOIN users u ON a.user_id = u.id
            WHERE u.id = $1
              AND l.deleted_at IS NULL
            ORDER BY l.created_at DESC
        `, [userId]);
        res.json(rows);
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
               SET lead_status = $1, updated_at = NOW()
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

module.exports = {
    getPublicAgents,
    getAgentBySlug,
    getMyProfile,
    saveDraft,
    submitForReview,
    updateMyProfile,
    getMyLeads,
    updateMyLeadStatus,
    getMyLeadNotes,
    addMyLeadNote,
    uploadPhoto,
    listBlogPostsForAgent,
    listAgentsForBlogPost,
    replaceAgentsForBlogPost
};
