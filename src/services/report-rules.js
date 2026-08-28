'use strict';

// EM-08 — "three things to do this week". A small rules engine scores candidate
// actions by REVENUE PROXIMITY and prints the top N. Never padded: if only two
// rules fire, you get two; if none, an honest "nothing urgent this week".
//
// Order (score): unrouted leads (100) → traffic with no agent (90) → conversion
// problems (70) → content gaps (50) → agent hygiene (25–30). Two rules need data
// we don't collect yet (Search Console impressions; form-start funnel) — they're
// omitted honestly rather than faked, and noted for when that data lands.

const pool = require('../database/pool');
const qN = async (sql, p = []) => { try { return (await pool.query(sql, p)).rows; } catch (_) { return []; } };
const q1 = async (sql, p = []) => { try { return (await pool.query(sql, p)).rows[0] || {}; } catch (_) { return {}; } };

async function candidateActions() {
    const actions = [];

    // 1 — unrouted leads in the last 7 days (the most revenue-proximate signal).
    const unrouted = await qN(
        `SELECT DISTINCT target_lake FROM leads
          WHERE (held_no_agent = TRUE OR (routed_at IS NULL AND agent_id IS NULL))
            AND created_at > NOW() - INTERVAL '7 days' AND deleted_at IS NULL AND target_lake IS NOT NULL
          LIMIT 6`);
    if (unrouted.length) {
        const lakes = unrouted.map(r => r.target_lake);
        actions.push({ score: 100, kind: 'unrouted', text: `You had ${lakes.length} lead${lakes.length === 1 ? '' : 's'} on lakes with no agent — ${lakes.join(', ')}`, link: '/pages/admin/leads.html' });
    }

    // 2 — lake with 50+ views in 30 days and no agent to send them to.
    const recruit = await qN(
        `SELECT l.name, v.views FROM lakes l
           JOIN (SELECT REPLACE(path, '/lakes/', '') AS slug, COUNT(*)::int AS views
                   FROM page_views WHERE created_at > NOW() - INTERVAL '30 days' AND path LIKE '/lakes/%'
                  GROUP BY path HAVING COUNT(*) >= 50) v ON v.slug = l.slug
          WHERE NOT EXISTS (SELECT 1 FROM agent_lakes al JOIN agents a ON a.id = al.agent_id WHERE al.lake_id = l.id AND a.is_published)
            AND NOT EXISTS (SELECT 1 FROM lake_tags lt JOIN user_tags ut ON ut.tag_id = lt.tag_id
                            JOIN agents a ON a.user_id = ut.user_id
                            WHERE lt.lake_id = l.id AND a.is_published AND a.profile_status = 'published')
          ORDER BY v.views DESC LIMIT 3`);
    for (const r of recruit) actions.push({ score: 90, kind: 'recruit', text: `Recruit an agent on ${r.name} — ${r.views} views last month, nobody to send them to`, link: '/pages/admin/agents.html' });

    // 5 — lake page with an agent but under 200 words (most likely to convert if fixed).
    const thin = await qN(
        `SELECT l.name FROM lakes l
          WHERE EXISTS (SELECT 1 FROM agent_lakes al JOIN agents a ON a.id = al.agent_id WHERE al.lake_id = l.id AND a.is_published)
            AND COALESCE(array_length(regexp_split_to_array(btrim(COALESCE(l.intro_text,'') || ' ' || COALESCE(l.description,'')), '\\s+'), 1), 0) < 200
          ORDER BY l.name LIMIT 3`);
    for (const r of thin) actions.push({ score: 50, kind: 'content', text: `${r.name} has an agent and almost no content — it's the page most likely to convert if you fix it`, link: '/pages/admin/lakes-towns.html' });

    // 6 — agents sitting on a draft profile for 14+ days.
    const draft = await q1(
        `SELECT COUNT(*)::int AS n FROM agents
          WHERE profile_status = 'draft' AND is_published = FALSE
            AND created_at < NOW() - INTERVAL '14 days' AND deleted_at IS NULL`);
    if (draft.n > 0) actions.push({ score: 30, kind: 'hygiene', text: `${draft.n} agent${draft.n === 1 ? ' has' : 's have'} sat on a draft profile for two weeks`, link: '/pages/admin/agents.html' });

    // 7 — an agent flagged slow twice (feeds routing weight already; surface it).
    const slow = await qN(
        `SELECT COALESCE(display_name, 'An agent') AS name FROM agents
          WHERE response_strikes >= 2 AND deleted_at IS NULL ORDER BY response_strikes DESC LIMIT 3`);
    for (const r of slow) actions.push({ score: 25, kind: 'hygiene', text: `${r.name} has been slow twice — consider reducing routing weight`, link: '/pages/admin/agents.html' });

    return actions;
}

// Top N by revenue proximity (default 3 for the weekly; EM-09 asks for 10).
async function topActions(n = 3) {
    const a = await candidateActions();
    a.sort((x, y) => y.score - x.score);
    return a.slice(0, n);
}

module.exports = { topActions, candidateActions };
