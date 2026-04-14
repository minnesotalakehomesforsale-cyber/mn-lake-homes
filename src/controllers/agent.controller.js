const pool = require('../database/pool');

const getPublicAgents = async (req, res) => {
    try {
        // Only return published agents joined with membership data
        const query = `
            SELECT a.slug, a.display_name, a.brokerage_name, a.city, a.service_areas, 
                   a.specialties, a.is_featured, m.display_badge_label as membership_badge
            FROM agents a
            JOIN memberships m ON a.membership_id = m.id
            WHERE a.profile_status = 'published' AND a.is_published = true
            ORDER BY a.is_featured DESC, a.display_name ASC
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Database query failed' });
    }
};

const getAgentBySlug = async (req, res) => {
    const { slug } = req.params;
    try {
        const query = `
            SELECT a.id, a.slug, a.display_name, a.brokerage_name, a.city, a.service_areas, 
                   a.specialties, a.is_featured, a.license_number, a.bio, m.display_badge_label as membership_badge
            FROM agents a
            JOIN memberships m ON a.membership_id = m.id
            WHERE a.slug = $1 AND a.profile_status = 'published' AND a.is_published = true
        `;
        const { rows } = await pool.query(query, [slug]);
        if (rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// PROTECTED ROUTE (Requires verifyToken filter)
const getMyProfile = async (req, res) => {
    try {
        const query = `
            SELECT a.*, u.email as account_email 
            FROM agents a
            JOIN users u ON a.user_id = u.id
            WHERE a.user_id = $1
        `;
        const { rows } = await pool.query(query, [req.user.userId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Profile not mapped' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// PROTECTED ROUTE (Requires verifyToken filter)
const updateMyProfile = async (req, res) => {
    let { city, service_areas, specialties, bio } = req.body;
    try {
        // Enforce array normalization (Test 5.5) cleanly
        const cleanArray = (arr) => Array.isArray(arr) ? arr.map(a => a.trim()).filter(a => a.length > 0) : [];
        const finalAreas = cleanArray(service_areas);
        const finalSpecs = cleanArray(specialties);
        
        city = (city || '').trim();
        bio = (bio || '').trim();

        // Enforce 100% fill rate for review (Test 5.3 & 5.4). If fields missing, we downgrade gracefully to "draft" state instead of breaking.
        let statusToSet = 'pending_review';
        if (!city || !bio || finalAreas.length === 0 || finalSpecs.length === 0) {
            statusToSet = 'draft';
        }

        const query = `
            UPDATE agents 
            SET city = $1, service_areas = $2, specialties = $3, bio = $4, profile_status = $5
            WHERE user_id = $6
            RETURNING *
        `;
        const { rows } = await pool.query(query, [
            city, 
            JSON.stringify(finalAreas), 
            JSON.stringify(finalSpecs), 
            bio, 
            statusToSet,
            req.user.userId
        ]);
        
        if (statusToSet === 'draft') {
            return res.status(400).json({ error: 'Missing Required Fields. Save completed as Draft.', profile: rows[0] });
        }
        res.json({ success: true, profile: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

module.exports = { getPublicAgents, getAgentBySlug, getMyProfile, updateMyProfile };
