const pool = require('../database/pool');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { logActivity } = require('../services/activity-log');

// ─── Cloudinary-backed agent profile photo upload ────────────────────────────
// Files persist across deploys, served from Cloudinary CDN, auto-optimized.
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true,
});

const cloudStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
        folder: 'mnlakehomes/agents',
        resource_type: 'image',
        // Cloudinary auto-picks a format; f_auto + q_auto on delivery handles WebP/AVIF
        format: undefined,
        public_id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        transformation: [
            { width: 1200, height: 1200, crop: 'limit' },  // cap source dims
            { quality: 'auto:good' },
        ],
    }),
});

const photoUpload = multer({
    storage: cloudStorage,
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
    fileFilter: (req, file, cb) => {
        if (/^image\//.test(file.mimetype)) cb(null, true);
        else cb(new Error('Please upload an image file.'));
    },
}).single('photo');

// POST /api/agents/upload-photo
const uploadPhoto = (req, res) => {
    photoUpload(req, res, (err) => {
        if (err) {
            console.error('[uploadPhoto]', err.message);
            return res.status(400).json({ error: err.message });
        }
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        // multer-storage-cloudinary puts the CDN URL on req.file.path
        const url = req.file.path;

        logActivity({
            event_type: 'agent.photo.upload',
            event_scope: 'agent',
            actor: { type: req.user?.role || 'agent', id: req.user?.userId },
            details: {
                url,
                public_id: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype,
            },
            req,
        });

        res.json({
            url,
            filename: req.file.originalname,
            size: req.file.size,
        });
    });
};

/**
 * GET /api/agents/public
 * Returns published agents for the public directory.
 */
const getPublicAgents = async (req, res) => {
    try {
        const query = `
            SELECT a.id, a.slug, a.display_name, a.brokerage_name, a.city, a.bio,
                   a.service_areas, a.specialties, a.is_featured,
                   a.phone_public, a.email_public, a.profile_photo_url,
                   m.display_badge_label as membership_badge
            FROM agents a
            JOIN memberships m ON a.membership_id = m.id
            WHERE a.profile_status = 'published' AND a.is_published = true
            ORDER BY a.is_featured DESC, a.display_name ASC
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
            SELECT a.*, u.email as account_email, u.full_name as account_full_name,
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

// Legacy alias for old PATCH /me route used by some admin call paths
const updateMyProfile = saveDraft;

module.exports = {
    getPublicAgents,
    getAgentBySlug,
    getMyProfile,
    saveDraft,
    submitForReview,
    updateMyProfile,
    getMyLeads,
    uploadPhoto
};
