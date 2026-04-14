/**
 * PHASE 8: PUBLIC ENDPOINT CONTROLLER (SCAFFOLD)
 * 
 * Drives the public-facing agent directory and individual agent profiles.
 * This endpoint has NO authentication requirements but enforces strict visibility logic natively.
 */

// const db = require('../db');

// GET /api/public/agents
exports.getPublicAgents = async (req, res) => {
    try {
        /*
        // STAGE 1: Hyper-Strict Privacy Lock
        // Pull ONLY explicitly published profiles and strip out system metadata
        const query = `
            SELECT 
                a.slug, a.display_name, a.brokerage_name, a.city, a.state, 
                a.service_areas, a.specialties, a.profile_photo_url, a.is_featured, a.is_verified,
                m.name as membership_badge, m.display_badge_label, m.sort_priority
            FROM agents a
            JOIN memberships m ON a.membership_id = m.id
            WHERE a.profile_status = 'published' AND a.is_published = true AND a.account_status = 'active'
            ORDER BY a.is_featured DESC, m.sort_priority ASC, a.display_name ASC;
        `;

        const { rows } = await db.query(query);
        */

        // STAGE 2: Data return (Mock Array simulating the payload)
        const mockPublicAgents = [
            { slug: "jessica-smith", display_name: "Jessica Smith", brokerage_name: "Sotheby's", city: "Wayzata", state: "MN", service_areas: ["Lake Minnetonka", "Orono"], specialties: ["Luxury Shoreline", "Acreage"], membership_badge: "MN Lake Specialist", is_featured: true, photo_url: null },
            { slug: "david-chen", display_name: "David Chen", brokerage_name: "Lakeshore Realty Group", city: "Brainerd", state: "MN", service_areas: ["Gull Lake", "Nisswa"], specialties: ["New Construction", "Relocation"], membership_badge: "Top Agent", is_featured: false, photo_url: null }
        ];

        return res.status(200).json({ agents: mockPublicAgents });
    } catch (err) {
        // Obfuscate 500 errors to prevent system information leakage natively
        console.error("Agent Directory Build Error:", err);
        return res.status(500).json({ error: "Failed to load directory resources." });
    }
};

// GET /api/public/agents/:slug
exports.getPublicAgentProfile = async (req, res) => {
    try {
        const { slug } = req.params;

        /*
        // Explicitly demand the profile is fully published before returning PII
        const query = `
            SELECT 
                a.slug, a.display_name, a.brokerage_name, a.city, a.state, 
                a.service_areas, a.specialties, a.bio, a.years_experience, a.license_number,
                a.phone_public, a.email_public, a.website_url, 
                a.facebook_url, a.instagram_url, a.linkedin_url, a.youtube_url,
                a.profile_photo_url, a.cover_photo_url,
                m.name as membership_badge, m.display_badge_label
            FROM agents a
            JOIN memberships m ON a.membership_id = m.id
            WHERE a.slug = $1 AND a.profile_status = 'published' AND a.is_published = true
        `;

        const { rows } = await db.query(query, [slug]);

        if(rows.length === 0) {
            // Defend against identifying if a slug fundamentally exists but has been 'suspended'
            return res.status(404).json({ error: "Agent Profile not found or is no longer available." });
        }
        
        return res.status(200).json({ profile: rows[0] });
        */

        return res.status(200).json({ message: "Simulated explicit slug extraction loop." });

    } catch (err) {
        console.error("Single Agent Extraction Error:", err);
        return res.status(500).json({ error: "Failed to load agent profile." });
    }
};
