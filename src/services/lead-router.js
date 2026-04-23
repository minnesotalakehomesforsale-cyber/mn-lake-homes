/**
 * lead-router.js — Automated lead assignment.
 *
 * Given a lead's geocoded coordinates, pick the best agent to assign it to
 * and return their user_id + agent_id. Caller is responsible for updating
 * the lead row and any notifications.
 *
 * Algorithm (in priority order):
 *   1. Find tags within match radius, closest first.
 *   2. Walk tags nearest-to-farthest. For each tag:
 *        a. Fetch published agents attached to that tag, bucketed by tier.
 *        b. If a founder exists AND (tag.lead_routing_counter % 10) ∈ {0..6},
 *           assign to the founder. (7-in-10 = 70%.)
 *        c. Otherwise, pick the next tier with any agent (premium → basic),
 *           and assign to the one with the oldest last_routed_at
 *           (NULL first). That's our round-robin.
 *   3. Bump tag.lead_routing_counter and user.last_routed_at.
 *   4. Return { userId, agentId, tagId, tierCode } or null if no match.
 *
 * "Published" means agents.profile_status = 'published' AND is_published = TRUE,
 * user account_status = 'active'.
 */
const pool = require('../database/pool');

// Tier priority: lower number = higher priority. Matches memberships.sort_priority.
const TIER_RANK = { founder: 1, top_agent: 2, premium: 3, mn_lake_specialist: 4, basic: 5 };
// Every 10 leads in a tag: 7 go to founder, 3 round-robin to next tier.
const FOUNDER_SHARE_NUMERATOR = 7;
const FOUNDER_SHARE_DENOMINATOR = 10;

const EARTH_RADIUS_MILES = 3959;

async function getDefaultRadiusMiles() {
    try {
        const { rows } = await pool.query(
            `SELECT value FROM app_config WHERE key = 'match_radius_miles'`
        );
        const n = Number(rows[0]?.value);
        return Number.isFinite(n) && n > 0 ? n : 15;
    } catch (_) {
        return 15;
    }
}

/**
 * Returns tags within `radius` miles of (lat,lng), closest first.
 */
async function tagsNear(lat, lng, radius) {
    const sql = `
        SELECT id, slug, name, state, lead_routing_counter,
               ($1 * acos(LEAST(1.0, GREATEST(-1.0,
                   cos(radians($2)) * cos(radians(latitude))
                   * cos(radians(longitude) - radians($3))
                   + sin(radians($2)) * sin(radians(latitude))
               )))) AS distance_miles
        FROM tags
        WHERE active = TRUE
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND ($1 * acos(LEAST(1.0, GREATEST(-1.0,
                   cos(radians($2)) * cos(radians(latitude))
                   * cos(radians(longitude) - radians($3))
                   + sin(radians($2)) * sin(radians(latitude))
               )))) <= $4
        ORDER BY distance_miles ASC
    `;
    const { rows } = await pool.query(sql, [EARTH_RADIUS_MILES, lat, lng, radius]);
    return rows;
}

/**
 * Return all routing-eligible agents attached to a specific tag, bucketed by tier.
 * Only published + active accounts. Ordered by last_routed_at ASC (nulls first)
 * so the round-robin pick is always the first row in a given tier.
 */
async function agentsForTag(tagId) {
    const sql = `
        SELECT u.id               AS user_id,
               u.full_name,
               u.email,
               u.last_routed_at,
               a.id               AS agent_id,
               a.display_name,
               m.code             AS tier_code
        FROM user_tags ut
        JOIN users      u ON u.id = ut.user_id AND u.account_status = 'active'
        JOIN agents     a ON a.user_id = u.id
                          AND a.profile_status = 'published'
                          AND a.is_published   = TRUE
        JOIN memberships m ON m.id = a.membership_id
        WHERE ut.tag_id = $1
        ORDER BY u.last_routed_at ASC NULLS FIRST, u.id ASC
    `;
    const { rows } = await pool.query(sql, [tagId]);
    const buckets = {};
    for (const r of rows) {
        (buckets[r.tier_code] ||= []).push(r);
    }
    return buckets;
}

/**
 * Pick the winning agent for a given tag:
 *   - If founder exists AND counter is in the 70% window → founder.
 *   - Otherwise, walk tiers in priority order and round-robin the first non-empty.
 * Returns the agent row or null.
 */
function pickFromBuckets(buckets, counter) {
    const founder = buckets.founder?.[0];
    const inFounderWindow = (counter % FOUNDER_SHARE_DENOMINATOR) < FOUNDER_SHARE_NUMERATOR;
    if (founder && inFounderWindow) return founder;

    // Non-founder tiers ordered by TIER_RANK, skipping 'founder'.
    const tiers = Object.keys(buckets)
        .filter(c => c !== 'founder')
        .sort((a, b) => (TIER_RANK[a] ?? 99) - (TIER_RANK[b] ?? 99));
    for (const code of tiers) {
        const pool = buckets[code] || [];
        if (pool.length) return pool[0];
    }
    // If only a founder exists and it's not their turn, the founder still gets it.
    return founder || null;
}

/**
 * Main entry — given a lead location, picks an agent and records the
 * routing side-effects (counter + last_routed_at).
 *
 * Returns { userId, agentId, tagId, tierCode } on match, or null if no agent
 * was available in any tag within radius.
 */
async function routeLead({ lat, lng, radiusMiles } = {}) {
    if (lat == null || lng == null) return null;
    const radius = Number(radiusMiles) > 0
        ? Number(radiusMiles)
        : await getDefaultRadiusMiles();

    const tags = await tagsNear(lat, lng, radius);
    if (!tags.length) return null;

    for (const tag of tags) {
        const buckets = await agentsForTag(tag.id);
        if (!Object.keys(buckets).length) continue;

        const pick = pickFromBuckets(buckets, tag.lead_routing_counter || 0);
        if (!pick) continue;

        // Side-effects: bump the tag counter + the agent's last_routed_at.
        // Both in a single transaction so concurrent lead inserts don't double-pick.
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE tags SET lead_routing_counter = lead_routing_counter + 1 WHERE id = $1`,
                [tag.id]
            );
            await client.query(
                `UPDATE users SET last_routed_at = NOW() WHERE id = $1`,
                [pick.user_id]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        return {
            userId:   pick.user_id,
            agentId:  pick.agent_id,
            tagId:    tag.id,
            tagName:  tag.name,
            tierCode: pick.tier_code,
            fullName: pick.full_name,
            email:    pick.email,
            distanceMiles: tag.distance_miles,
        };
    }

    return null;
}

module.exports = { routeLead };
