/**
 * tag-matcher.js — Proximity match query for lead routing.
 *
 * Given a point (lat, lng) and a radius (miles), returns:
 *   matchedTags  — tags whose centroid is within radius of the point
 *   matchedUsers — distinct users tagged with any of those tags
 *
 * Uses Haversine in raw SQL (no PostGIS dependency — keeps Neon setup
 * simple; ~200 tags × small user set is trivial at this scale). When
 * we outgrow this, swap to PostGIS via a single migration (see
 * docs/geo-tags.md §4 for the PostGIS variant).
 */

const pool = require('../database/pool');

const EARTH_RADIUS_MILES = 3959;

/**
 * Read the configured default radius from app_config. Falls back to 15
 * if the row is missing or malformed.
 */
async function getDefaultRadiusMiles() {
    try {
        const { rows } = await pool.query(
            `SELECT value FROM app_config WHERE key = 'match_radius_miles'`
        );
        const raw = rows[0]?.value;
        const n = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(n) && n > 0 ? n : 15;
    } catch (_) {
        return 15;
    }
}

/**
 * matchTagsAndUsers({ lat, lng, radiusMiles })
 *   → { tags: [{ id, slug, name, state, region, distance_miles }],
 *       users: [{ id, email, full_name, role, matched_tag_ids, min_distance_miles }] }
 *
 * Results are sorted by distance (tags) and min matched distance (users).
 */
async function matchTagsAndUsers({ lat, lng, radiusMiles }) {
    if (lat == null || lng == null) {
        return { tags: [], users: [] };
    }
    const radius = Number(radiusMiles) > 0
        ? Number(radiusMiles)
        : await getDefaultRadiusMiles();

    // 1. Tags within the radius (ordered by distance ASC).
    const tagsSql = `
        SELECT
            id, slug, name, state, region, latitude, longitude,
            ($1 * acos(
                LEAST(1.0, GREATEST(-1.0,
                    cos(radians($2)) * cos(radians(latitude))
                    * cos(radians(longitude) - radians($3))
                    + sin(radians($2)) * sin(radians(latitude))
                ))
            )) AS distance_miles
        FROM tags
        WHERE active = TRUE
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND ($1 * acos(
                LEAST(1.0, GREATEST(-1.0,
                    cos(radians($2)) * cos(radians(latitude))
                    * cos(radians(longitude) - radians($3))
                    + sin(radians($2)) * sin(radians(latitude))
                ))
            )) <= $4
        ORDER BY distance_miles ASC
    `;
    const { rows: tags } = await pool.query(tagsSql, [EARTH_RADIUS_MILES, lat, lng, radius]);

    if (!tags.length) return { tags: [], users: [] };

    const tagIds = tags.map(t => t.id);

    // 2. Users attached to any matched tag. Group the per-user set of
    // matched tag ids + carry the min distance as a routing hint.
    const usersSql = `
        SELECT u.id, u.email, u.full_name, u.role,
               array_agg(DISTINCT ut.tag_id) AS matched_tag_ids,
               MIN(d.dist) AS min_distance_miles
        FROM user_tags ut
        JOIN users u ON u.id = ut.user_id
        JOIN LATERAL (
            SELECT ($1 * acos(
                LEAST(1.0, GREATEST(-1.0,
                    cos(radians($2)) * cos(radians(t.latitude))
                    * cos(radians(t.longitude) - radians($3))
                    + sin(radians($2)) * sin(radians(t.latitude))
                ))
            )) AS dist
            FROM tags t WHERE t.id = ut.tag_id
        ) d ON TRUE
        WHERE ut.tag_id = ANY($4::uuid[])
        GROUP BY u.id, u.email, u.full_name, u.role
        ORDER BY min_distance_miles ASC
    `;
    const { rows: users } = await pool.query(usersSql, [EARTH_RADIUS_MILES, lat, lng, tagIds]);

    return { tags, users };
}

module.exports = {
    matchTagsAndUsers,
    getDefaultRadiusMiles,
};
