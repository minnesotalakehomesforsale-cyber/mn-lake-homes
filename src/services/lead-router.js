/**
 * lead-router.js — Automated lead assignment.
 *
 * Given a lead's geocoded coordinates, pick the best agent to assign it to
 * and return their user_id + agent_id. Caller is responsible for updating
 * the lead row and any notifications.
 *
 * Algorithm (in priority order):
 *   1. LAKE routing (founder = exclusive lake owner). Only when the lead
 *      EXPLICITLY names a lake (buyer picked it on the lake page/filter, or a
 *      seller picked it). If that lake has a seated founder, the founder gets
 *      100% of the lake's leads; with no founder, its other lake-linked agents
 *      go to the weighted lottery below. We never infer "on the lake" from an
 *      address (see below).
 *   2. TOWN/tag routing (fallback). Find tags within match radius, closest
 *      first; walk nearest-to-farthest and, at the first tag with any
 *      published agent, run a WEIGHTED LOTTERY: each agent gets balls by tier
 *      (Founder 12 · Elite 8 · Prime 3 · Basic 1, admin-tunable) and one ball
 *      is drawn at random. Higher tiers get better odds; lower tiers still win
 *      sometimes; same-tier agents share evenly. A founder carries founder
 *      weight in each of their service-area tags too (their lake stays 100%).
 *   3. Bump the lake/tag lead_routing_counter and the winner's last_routed_at.
 *   4. Return { userId, agentId, lakeId|tagId, tierCode } or null if no match.
 *
 * "Published" means agents.profile_status = 'published' AND is_published = TRUE,
 * user account_status = 'active'.
 */
const pool = require('../database/pool');

// Lottery weights ("balls") by tier. Higher tier = more balls = better odds,
// but every tier keeps a real shot and same-tier agents share evenly. A lead
// is drawn at random from the pooled balls of all eligible agents in a tag.
//   Founder 12 · Elite (top_agent) 8 · Prime (mn_lake_specialist) 3 · Basic 1.
// A founder gets founder-weight in each of their geo-tags AND 100% of their
// own lake. Unknown/legacy codes fall back to 1 ball so nobody is excluded.
// Overridable at runtime via app_config key 'tier_lottery_balls' (JSON), so
// the weights can be tuned from the admin without a redeploy.
const DEFAULT_TIER_BALLS = { founder: 12, top_agent: 8, premium: 8, mn_lake_specialist: 3, basic: 1 };
const DEFAULT_BALLS = 1;

// Read the tier weights, merging any admin overrides over the defaults. Any
// bad/missing config silently falls back to DEFAULT_TIER_BALLS.
async function getTierBalls() {
    try {
        const { rows } = await pool.query(
            `SELECT value FROM app_config WHERE key = 'tier_lottery_balls'`
        );
        const raw = rows[0]?.value;
        if (!raw) return DEFAULT_TIER_BALLS;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const merged = { ...DEFAULT_TIER_BALLS };
        for (const [code, n] of Object.entries(parsed || {})) {
            const w = Number(n);
            if (Number.isFinite(w) && w >= 0) merged[code] = w;
        }
        return merged;
    } catch (_) {
        return DEFAULT_TIER_BALLS;
    }
}

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
 * Only published + active accounts. An agent who holds a founder seat on ANY
 * lake is bucketed as 'founder' here (top lottery weight) across every one of
 * their service-area tags — that's the town-side half of the founder benefit;
 * the other half is 100% of their own lake. Everyone else is bucketed by their
 * membership tier code. Ordered by last_routed_at ASC (nulls first).
 */
async function agentsForTag(tagId) {
    const sql = `
        SELECT u.id               AS user_id,
               u.full_name,
               u.email,
               u.last_routed_at,
               a.id               AS agent_id,
               a.display_name,
               CASE WHEN EXISTS (
                   SELECT 1 FROM agent_lakes al
                    WHERE al.agent_id = a.id AND al.is_founder
               ) THEN 'founder' ELSE m.code END AS tier_code
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
 * Weighted-lottery pick from tier-bucketed agents. Every eligible agent gets
 * `weights[tier]` balls (default Founder 12, Elite 8, Prime 3, Basic 1); we
 * pool all the balls and draw one at random. So a higher tier has better odds
 * than a lower one, and two agents in the same tier have equal odds — with 20
 * basic agents each holding one ball, it plays out like a fair rotation.
 *
 * A founder who competes in a town tag (via their own service areas) is
 * bucketed as 'founder' by agentsForTag, so they carry founder weight here too.
 * Lake-level founder exclusivity (100%) is handled by the caller beforehand.
 * Returns the winning agent row, or null.
 */
function pickFromBuckets(buckets, weights = DEFAULT_TIER_BALLS) {
    const balls = [];
    for (const [code, agents] of Object.entries(buckets)) {
        const weight = weights[code] ?? DEFAULT_BALLS;
        for (const agent of (agents || [])) {
            for (let i = 0; i < weight; i++) balls.push(agent);
        }
    }
    if (!balls.length) return null;
    return balls[Math.floor(Math.random() * balls.length)];
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
 * regardless of their global membership tier, so the exclusive-founder rule
 * applies to whoever holds the lake's founding spot.
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
 * Lake-level founder routing runs FIRST: only when the lead EXPLICITLY names a
 * lake (`lakeId`, resolved from a buyer's lake pick or a seller's lake choice)
 * and that lake has agents. A seated founder gets 100% of that lake's leads;
 * with no founder, its other lake-linked agents go to the weighted lottery. We
 * never guess the lake from coordinates. Falls back to town/tag when no lake.
 *
 * Returns { userId, agentId, lakeId|tagId, tierCode } on match, or null.
 */
// Drop excluded users from tier buckets (used by SLA re-routing so a lead never
// bounces back to an agent who already had — and sat on — it).
function stripExcluded(buckets, excludeSet) {
    if (!excludeSet || !excludeSet.size) return buckets;
    const out = {};
    for (const [code, agents] of Object.entries(buckets)) {
        const kept = (agents || []).filter(a => !excludeSet.has(a.user_id));
        if (kept.length) out[code] = kept;
    }
    return out;
}

async function routeLead({ lat, lng, radiusMiles, lakeId, excludeUserIds = [] } = {}) {
    const radius = Number(radiusMiles) > 0
        ? Number(radiusMiles)
        : await getDefaultRadiusMiles();
    const weights = await getTierBalls();
    const exclude = new Set((excludeUserIds || []).filter(Boolean).map(String));

    // ── 1. Lake-level routing (founder = exclusive lake owner) ──
    // EXPLICIT lake only: the lead must actually name the lake (buyer picks it
    // on the lake page/filter, or a seller picks it in the "which lake" step).
    // We do NOT guess "on the lake" from a nearby address — proximity to a
    // lake's center can't distinguish a lakefront home from one blocks away,
    // so address-only leads fall through to town routing below (where the
    // founder still competes normally via their own service-area tags).
    let lake = null;
    if (lakeId) lake = await getLakeById(lakeId);
    if (lake) {
        const buckets = stripExcluded(await agentsForLake(lake.id), exclude);
        if (Object.keys(buckets).length) {
            // The seated founder is EXCLUSIVE — 100% of their lake's leads.
            // With no founder seated, the lake's other agents go to the lottery.
            const founder = buckets.founder && buckets.founder[0];
            const pick = founder || pickFromBuckets(buckets, weights);
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
        const buckets = stripExcluded(await agentsForTag(tag.id), exclude);
        if (!Object.keys(buckets).length) continue;

        const pick = pickFromBuckets(buckets, weights);
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
