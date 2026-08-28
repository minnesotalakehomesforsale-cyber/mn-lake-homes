'use strict';

// EM-08/09 — the report query layer, parameterised by window so the weekly,
// quarterly and six-month reports all run off the SAME queries (EM-09 just passes
// a longer window). Every number here traces to one re-runnable query. Anything
// we can't compute yet returns null and renders as "—" rather than a guess.

const pool = require('../database/pool');

const q1 = async (sql, params = []) => {
    try { const { rows } = await pool.query(sql, params); return rows[0] || {}; }
    catch (_) { return {}; }
};
const qN = async (sql, params = []) => {
    try { const { rows } = await pool.query(sql, params); return rows; }
    catch (_) { return []; }
};
const num = v => (v == null ? null : Number(v));

// The windowed numbers for one [start, end) range.
async function collectWindow(start, end) {
    const w = [start, end];
    const [pv, ld, ag, biz, pay, cancels] = await Promise.all([
        q1(`SELECT COUNT(DISTINCT session_id)::int AS sessions,
                   COUNT(*) FILTER (WHERE path LIKE '/lakes/%')::int AS lake_views
              FROM page_views WHERE created_at >= $1 AND created_at < $2`, w),
        q1(`SELECT COUNT(*)::int AS submitted,
                   COUNT(*) FILTER (WHERE routed_at IS NOT NULL)::int AS routed,
                   COUNT(*) FILTER (WHERE held_no_agent = TRUE OR (routed_at IS NULL AND agent_id IS NULL))::int AS unrouted,
                   ROUND(percentile_cont(0.5) WITHIN GROUP (
                       ORDER BY EXTRACT(EPOCH FROM (first_contact_at - routed_at))/60.0)
                       FILTER (WHERE first_contact_at IS NOT NULL AND routed_at IS NOT NULL))::int AS median_ttc_min
              FROM leads WHERE created_at >= $1 AND created_at < $2 AND deleted_at IS NULL`, w),
        q1(`SELECT COUNT(*)::int AS new_agents,
                   COUNT(*) FILTER (WHERE published_at >= $1 AND published_at < $2)::int AS published
              FROM agents WHERE deleted_at IS NULL AND (created_at >= $1 AND created_at < $2 OR (published_at >= $1 AND published_at < $2))`, w),
        q1(`SELECT COUNT(*)::int AS new_businesses FROM businesses WHERE created_at >= $1 AND created_at < $2`, w),
        q1(`SELECT COUNT(*)::int AS paid FROM payments WHERE created_at >= $1 AND created_at < $2 AND (status IS NULL OR status IN ('succeeded','paid','active'))`, w),
        q1(`SELECT COUNT(*)::int AS cancellations FROM incidents WHERE severity='P3' AND incident_key LIKE 'subscription_cancelled%' AND created_at >= $1 AND created_at < $2`, w),
    ]);
    return {
        sessions: num(pv.sessions), lake_views: num(pv.lake_views),
        leads_submitted: num(ld.submitted), leads_routed: num(ld.routed), leads_unrouted: num(ld.unrouted),
        completion_rate: null,   // needs form-start funnel tracking (not wired) → "—"
        median_ttc_min: num(ld.median_ttc_min),
        new_agents: num(ag.new_agents), profiles_published: num(ag.published),
        new_businesses: num(biz.new_businesses), paid_conversions: num(pay.paid),
        cancellations: num(cancels.cancellations),
    };
}

// Assemble a full report for [start, end), with last-period + 4-period-average
// comparison columns and the narrative sections. `periodDays` sizes the compare
// windows (7 for weekly, 90 for quarterly, …).
async function reportData(start, end, periodDays = 7) {
    const ms = periodDays * 864e5;
    const prevStart = new Date(new Date(start).getTime() - ms);
    const avgStart = new Date(new Date(start).getTime() - 4 * ms);

    const [current, previous, avgWindow, topLakes, leads, content, whatRan, mrr] = await Promise.all([
        collectWindow(start, end),
        collectWindow(prevStart, start),
        collectWindow(avgStart, start),                    // 4 periods → divide by 4 for the avg
        qN(`SELECT REPLACE(path, '/lakes/', '') AS lake, COUNT(*)::int AS views
              FROM page_views WHERE created_at >= $1 AND created_at < $2 AND path LIKE '/lakes/%'
              GROUP BY path ORDER BY views DESC LIMIT 5`, [start, end]),
        qN(`SELECT l.target_lake AS lake, l.source_page_url AS source, l.first_contact_at, l.routed_at,
                   l.accepted_at, COALESCE(a.display_name, u.full_name) AS agent
              FROM leads l LEFT JOIN agents a ON a.id = l.agent_id LEFT JOIN users u ON u.id = a.user_id
             WHERE l.created_at >= $1 AND l.created_at < $2 AND l.deleted_at IS NULL
             ORDER BY l.created_at DESC LIMIT 20`, [start, end]),
        q1(`SELECT (SELECT COUNT(*)::int FROM blog_posts WHERE is_published = TRUE AND deleted_at IS NULL) AS blog_live,
                   (SELECT COUNT(*)::int FROM blog_posts WHERE is_published = TRUE AND published_at >= $1 AND published_at < $2) AS pages_published,
                   (SELECT COUNT(*)::int FROM agents WHERE last_response_at >= $1 AND last_response_at < $2) AS agent_replies`, [start, end]),
        q1(`SELECT (SELECT COUNT(*)::int FROM incidents WHERE status='open') AS open_incidents,
                   (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status='bounced') / NULLIF(COUNT(*) FILTER (WHERE status IN ('sent','bounced')),0),1)
                      FROM email_log WHERE created_at >= $1 AND created_at < $2) AS bounce_rate`, [start, end]),
        q1(`SELECT agent_mrr, business_mrr FROM mrr_snapshots ORDER BY month DESC LIMIT 1`),
    ]);

    const emailsByTemplate = await qN(
        `SELECT template_key, COUNT(*) FILTER (WHERE status='sent')::int AS sent
           FROM email_log WHERE created_at >= $1 AND created_at < $2 AND template_key IS NOT NULL
          GROUP BY template_key ORDER BY sent DESC`, [start, end]);
    const sweeps = await qN(`SELECT name, last_run_at FROM heartbeats ORDER BY name`);

    // 4-week average = the 4-period total divided by 4, per numeric field.
    const avg = {}; for (const k of Object.keys(current)) avg[k] = avgWindow[k] == null ? null : Math.round(avgWindow[k] / 4);

    const mrrTotal = (mrr && (Number(mrr.agent_mrr || 0) + Number(mrr.business_mrr || 0))) || null;
    return {
        window: { start, end, periodDays },
        numbers: { current, previous, avg },
        mrr: mrrTotal,
        topLakes, leads,
        content: { ...content, lake_pages_thin: null },   // thin-page count comes from the rules engine's lakes query
        whatRan: { ...whatRan, emailsByTemplate, sweeps },
    };
}

module.exports = { reportData, collectWindow };
