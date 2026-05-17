/**
 * lead-magnet.js — Resolve the right PDF "magnet" to attach to a lead's
 * confirmation email based on what kind of lead just came in.
 *
 * The mapping is env-driven so Marketing can swap which PDF a buyer / seller
 * receives without a code change. Each env var holds the resource slug —
 * the actual PDF URL + title comes from a join against the resources table.
 *
 *   LEAD_MAGNET_BUYER_SLUG     default 'first-time-lake-buyer-roadmap'
 *   LEAD_MAGNET_SELLER_SLUG    default 'minnesota-lake-home-seller-guide'
 *   LEAD_MAGNET_GENERAL_SLUG   default 'lake-region-comparison-guide'
 *
 * Returns null when no magnet is configured or the resource doesn't exist —
 * the email path branches cleanly when no magnet is found.
 */

const pool = require('../database/pool');

// Map a lead_type enum value to the env var key that controls its magnet.
function envKeyForType(leadType) {
    switch (leadType) {
        case 'buyer':                return 'LEAD_MAGNET_BUYER_SLUG';
        case 'seller':               return 'LEAD_MAGNET_SELLER_SLUG';
        case 'agent_inquiry':        return null; // agents don't get a magnet
        case 'general_contact':      return 'LEAD_MAGNET_GENERAL_SLUG';
        default:                     return 'LEAD_MAGNET_GENERAL_SLUG';
    }
}

const DEFAULT_SLUGS = {
    LEAD_MAGNET_BUYER_SLUG:   'first-time-lake-buyer-roadmap',
    LEAD_MAGNET_SELLER_SLUG:  'minnesota-lake-home-seller-guide',
    LEAD_MAGNET_GENERAL_SLUG: 'lake-region-comparison-guide',
};

/**
 * Resolve { title, url, slug } for the magnet matching this lead_type, or
 * null if no magnet is configured / the resource doesn't exist. Never
 * throws — magnet lookup failures must not block lead creation.
 */
async function getLeadMagnetForType(leadType) {
    try {
        const envKey = envKeyForType(leadType);
        if (!envKey) return null;
        const slug = (process.env[envKey] || DEFAULT_SLUGS[envKey] || '').trim();
        if (!slug) return null;

        const { rows } = await pool.query(
            `SELECT slug, title, url FROM resources WHERE slug = $1 LIMIT 1`,
            [slug]
        );
        if (!rows.length) {
            console.warn(`[lead-magnet] no resource with slug "${slug}" for lead_type=${leadType}`);
            return null;
        }
        return { slug: rows[0].slug, title: rows[0].title, url: rows[0].url };
    } catch (err) {
        console.warn('[lead-magnet] lookup failed:', err.message);
        return null;
    }
}

module.exports = { getLeadMagnetForType };
