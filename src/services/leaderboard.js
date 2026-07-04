// leaderboard.js — monthly agent performance ranking.
// Score rewards exactly the behaviors the marketplace needs: closing deals,
// working leads, and responding fast. Used for the private dashboard
// leaderboard and the public "Top Performer" badge (top agent this month).
const pool = require('../database/pool');

function scoreOf(r) {
    const fast = (r.resp_seconds != null && Number(r.resp_seconds) <= 4 * 3600) ? 3 : 0;
    return r.wins * 10 + r.worked * 2 + r.leads * 1 + fast;
}

async function computeLeaderboard() {
    const { rows } = await pool.query(`
        SELECT a.id AS agent_id, a.display_name, a.slug, a.profile_photo_url,
               COUNT(l.*) FILTER (WHERE l.created_at >= date_trunc('month', now()))::int AS leads,
               COUNT(l.*) FILTER (WHERE l.outcome = 'won' AND l.outcome_at >= date_trunc('month', now()))::int AS wins,
               COUNT(l.*) FILTER (WHERE l.agent_ack_at IS NOT NULL AND l.created_at >= date_trunc('month', now()))::int AS worked,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l.agent_ack_at - l.assigned_at)))
                   FILTER (WHERE l.agent_ack_at IS NOT NULL AND l.assigned_at IS NOT NULL
                               AND l.created_at >= date_trunc('month', now())) AS resp_seconds
          FROM agents a
          LEFT JOIN leads l ON l.agent_id = a.id AND l.deleted_at IS NULL
         WHERE a.profile_status = 'published' AND a.is_published = TRUE
         GROUP BY a.id`);
    return rows
        .map(r => ({ ...r, score: scoreOf(r) }))
        .sort((a, b) => b.score - a.score || b.wins - a.wins || b.worked - a.worked)
        .map((r, i) => ({ ...r, rank: i + 1 }));
}

// Cached top-performer id (the #1 with any real activity). Refreshed every
// 15 min so the public badge doesn't run the ranking on every profile hit.
let _topId = null, _topAt = 0;
async function getTopPerformerId() {
    if (Date.now() - _topAt < 15 * 60 * 1000) return _topId;
    try {
        const ranked = await computeLeaderboard();
        const leader = ranked[0];
        _topId = (leader && leader.score > 0) ? leader.agent_id : null;
        _topAt = Date.now();
    } catch (_) { /* keep last value */ }
    return _topId;
}

module.exports = { computeLeaderboard, getTopPerformerId };
