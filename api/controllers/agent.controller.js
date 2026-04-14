/**
 * PHASE 5: AGENT PROFILE CONTROLLER (SCAFFOLD)
 * 
 * This controller handles fetching, saving drafts, and submitting agent profiles
 * exactly corresponding to the Phase 2 PostgreSQL Schema.
 */

// const db = require('../db'); // Replace with actual DB connection

// GET /api/agents/me
exports.getProfile = async (req, res) => {
    try {
        // req.user corresponds to the JWT payload generated in Phase 3
        const userId = req.user.userId;

        /*
        const { rows } = await db.query(
            `SELECT a.*, m.name as membership_name, m.display_badge_label
             FROM agents a
             JOIN memberships m ON a.membership_id = m.id
             WHERE a.user_id = $1`,
            [userId]
        );
        const profile = rows[0];
        */
        const profile = null; // Mock payload

        if (!profile) return res.status(404).json({ error: 'Agent profile not found' });

        return res.status(200).json({ profile });
    } catch (error) {
        console.error('Error fetching profile:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// PATCH /api/agents/me
exports.saveDraft = async (req, res) => {
    try {
        const userId = req.user.userId;
        const body = req.body;

        // 1. Explicit Whitelisting (Reject admin variables)
        const allowedUpdates = {
            display_name: body.display_name?.trim(),
            brokerage_name: body.brokerage_name?.trim(),
            license_number: body.license_number?.trim(),
            phone_public: body.phone_public?.trim(),
            email_public: body.email_public?.toLowerCase().trim(),
            website_url: body.website_url?.trim(),
            city: body.city?.trim(),
            state: body.state?.trim() || 'Minnesota',
            service_areas: Array.isArray(body.service_areas) ? JSON.stringify(body.service_areas) : null,
            specialties: Array.isArray(body.specialties) ? JSON.stringify(body.specialties) : null,
            bio: body.bio?.trim(),
            years_experience: body.years_experience ? parseInt(body.years_experience) : null,
            facebook_url: body.facebook_url?.trim(),
            instagram_url: body.instagram_url?.trim(),
            linkedin_url: body.linkedin_url?.trim(),
            youtube_url: body.youtube_url?.trim()
        };

        // Clear out entirely undefined inputs mapping
        const keys = Object.keys(allowedUpdates).filter(k => allowedUpdates[k] !== undefined);
        if (keys.length === 0) return res.status(400).json({ error: 'No valid fields provided for update' });

        /*
        // 2. Build Dynamic SQL PATCH Query
        const setString = keys.map((k, index) => `${k} = $${index + 1}`).join(', ');
        const values = keys.map(k => allowedUpdates[k]);
        
        // Push userId constraint precisely at the end
        values.push(userId);
        
        await db.query(
            `UPDATE agents SET ${setString}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${values.length}`,
            values
        );
        */

        return res.status(200).json({ message: 'Draft saved successfully' });
    } catch (error) {
        console.error('Error saving draft:', error);
        return res.status(500).json({ error: 'Internal server error while saving draft' });
    }
};

// POST /api/agents/me/submit
exports.submitForReview = async (req, res) => {
    try {
        const userId = req.user.userId;

        // 1. Fetch current row state
        /*
        const { rows } = await db.query('SELECT * FROM agents WHERE user_id = $1', [userId]);
        const agent = rows[0];
        */
        const agent = {}; // Mock Payload

        // 2. Mandatory Validation Check before changing State
        const missingFields = [];
        if (!agent.display_name) missingFields.push('display_name');
        if (!agent.brokerage_name) missingFields.push('brokerage_name');
        if (!agent.city) missingFields.push('city');
        if (!agent.bio) missingFields.push('bio');
        if (!agent.phone_public && !agent.email_public) missingFields.push('contact_method (phone or email)');
        if (!agent.service_areas || agent.service_areas.length === 0) missingFields.push('service_areas');
        if (!agent.specialties || agent.specialties.length === 0) missingFields.push('specialties');

        if (missingFields.length > 0) {
            return res.status(400).json({ 
                error: 'Cannot submit profile. Required fields are missing.', 
                missing: missingFields 
            });
        }

        // 3. Prevent submission spam if already published or pending
        if (agent.profile_status === 'published') {
            return res.status(400).json({ error: 'Profile is already live.' });
        }
        if (agent.profile_status === 'pending_review') {
            return res.status(400).json({ error: 'Profile is already under review.' });
        }

        // --- BEGIN TRANSACTION ---
        // await db.query("BEGIN");

        /*
        // 4. Update status explicitly. is_published remains safely FALSE.
        await db.query(
            `UPDATE agents 
             SET profile_status = 'pending_review', updated_at = CURRENT_TIMESTAMP 
             WHERE user_id = $1`,
            [userId]
        );
        */

        /*
        // 5. Fire Activity Log Event
        await db.query(
            `INSERT INTO activity_log (actor_user_id, entity_type, entity_id, action, action_label)
             VALUES ($1, 'agent', $2, 'submitted_for_review', 'Agent submitted profile for administrative approval')`,
            [userId, agent.id]
        );
        */

        // await db.query("COMMIT");
        // --- END TRANSACTION ---

        return res.status(200).json({ message: 'Profile officially submitted for review' });

    } catch (error) {
        // await db.query("ROLLBACK");
        console.error('Error submitting profile:', error);
        return res.status(500).json({ error: 'Internal server error while submitting' });
    }
};
