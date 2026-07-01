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
 * Nearest published lake within `radius` miles of (lat,lng), or null.
 */
async function lakeNear(lat, lng, radius) {
    const dist = `(${EARTH_RADIUS_MILES} * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2))
        + sin(radians($1)) * sin(radians(latitude))))))`;
    const { rows } = await pool.query(
        `SELECT id, slug, name, lead_routing_counter, ${dist} AS distance_miles
           FROM lakes
          WHERE status = 'published' AND latitude IS NOT NULL AND longitude IS NOT NULL
            AND ${dist} <= $3
          ORDER BY distance_miles ASC LIMIT 1`,
        [lat, lng, radius]
    );
    return rows[0] || null;
}

async function getLakeById(lakeId) {
    const { rows } = await pool.query(
        `SELECT id, slug, name, lead_routing_counter FROM lakes WHERE id = $1 LIMIT 1`,
        [lakeId]
    );
    return rows[0] || null;
}

/**
 * Routing-eligible agents linked to a lake (agent_lakes), bucketed by tier.
 * The lake's founding agent (agent_lakes.is_founder) is bucketed as 'founder'
 * regardless of their global membership tier, so the 70/30 split applies to
 * whoever holds the lake's founding spot.
 */
async function agentsForLake(lakeId) {
    const sql = `
        SELECT u.id AS user_id, u.full_name, u.email, u.last_routed_at,
               a.id AS agent_id, a.display_name,
               CASE WHEN al.is_founder THEN 'founder' ELSE m.code END AS tier_code
        FROM agent_lakes al
        JOIN agents a ON a.id = al.agent_id
                     AND a.profile_status = 'published' AND a.is_published = TRUE
        JOIN users  u ON u.id = a.user_id AND u.account_status = 'active'
        JOIN memberships m ON m.id = a.membership_id
        WHERE al.lake_id = $1
        ORDER BY u.last_routed_at ASC NULLS FIRST, u.id ASC
    `;
    const { rows } = await pool.query(sql, [lakeId]);
    const buckets = {};
    for (const r of rows) (buckets[r.tier_code] ||= []).push(r);
    return buckets;
}

/**
 * Main entry — given a lead location and/or lake, picks an agent and records
 * the routing side-effects (counter + last_routed_at).
 *
 * Lake-level founder routing runs FIRST: if the lead is tied to a lake (either
 * an explicit `lakeId` from the lake page, or the nearest lake to its
 * coordinates) and that lake has agents, the lake's founder gets 70% of its
 * leads and the rest round-robin — the founder override you seat lake by lake.
 * Falls back to the town/tag router when there's no lake match.
 *
 * Returns { userId, agentId, lakeId|tagId, tierCode } on match, or null.
 */
async function routeLead({ lat, lng, radiusMiles, lakeId } = {}) {
    const radius = Number(radiusMiles) > 0
        ? Number(radiusMiles)
        : await getDefaultRadiusMiles();

    // ── 1. Lake-level routing (founder override, lake by lake) ──
    let lake = null;
    if (lakeId) lake = await getLakeById(lakeId);
    else if (lat != null && lng != null) lake = await lakeNear(lat, lng, radius);
    if (lake) {
        const buckets = await agentsForLake(lake.id);
        if (Object.keys(buckets).length) {
            const pick = pickFromBuckets(buckets, lake.lead_routing_counter || 0);
            if (pick) {
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    await client.query(`UPDATE lakes SET lead_routing_counter = lead_routing_counter + 1 WHERE id = $1`, [lake.id]);
                    await client.query(`UPDATE users SET last_routed_at = NOW() WHERE id = $1`, [pick.user_id]);
                    await client.query('COMMIT');
                } catch (err) {
                    await client.query('ROLLBACK');
                    throw err;
                } finally {
                    client.release();
                }
                return {
                    userId: pick.user_id,
                    agentId: pick.agent_id,
                    lakeId: lake.id,
                    lakeName: lake.name,
                    tierCode: pick.tier_code,
                    fullName: pick.full_name,
                    email: pick.email,
                    distanceMiles: lake.distance_miles ?? null,
                };
            }
        }
    }

    // ── 2. Town/tag routing (needs coordinates) ──
    if (lat == null || lng == null) return null;

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
