// routing-sla.js — T021: leads reach the right agent fast, and we can prove it.
//
// Latency per lead = routed_at - created_at (routed_at is stamped ONCE, the first
// time a lead reaches an agent, so it survives SLA re-routing). computeRoutingSla
// returns median + p95 + max over a window plus the manual/stuck tail (>30 min)
// and anything still unrouted. runWeeklySlaReport emits the number once a week
// (Slack incoming-webhook if SLACK_WEBHOOK_URL is set, else the owner email),
// self-guarding via an app_config marker so restarts can't double-send.
const pool = require('../database/pool');

const TARGET_P95_SECONDS = Number(process.env.ROUTING_SLA_TARGET_SECONDS) || 30;
const SLOW_SECONDS = 30 * 60;  // 30 min — the "manual gap" threshold

function fmtDur(sec) {
    sec = Math.round(Number(sec) || 0);
    if (sec < 1) return '<1s';
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
    return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

async function computeRoutingSla({ days = 7 } = {}) {
    const d = Math.max(1, Math.min(365, Number(days) || 7));
    const agg = await pool.query(
        `WITH routed AS (
            SELECT EXTRACT(EPOCH FROM (routed_at - created_at)) AS latency
              FROM leads
             WHERE routed_at IS NOT NULL
               AND routed_at >= NOW() - ($1 || ' days')::interval
               AND routed_at >= created_at
               AND deleted_at IS NULL
         )
         SELECT COUNT(*)::int AS routed_count,
                COALESCE(percentile_cont(0.5)  WITHIN GROUP (ORDER BY latency), 0) AS median_seconds,
                COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency), 0) AS p95_seconds,
                COALESCE(MAX(latency), 0) AS max_seconds,
                COUNT(*) FILTER (WHERE latency <= $2)::int AS auto_count,
                COUNT(*) FILTER (WHERE latency >  $3)::int AS slow_count
           FROM routed`,
        [d, TARGET_P95_SECONDS, SLOW_SECONDS]);

    // Leads created in-window, older than the slow threshold, that never routed.
    const unrouted = await pool.query(
        `SELECT COUNT(*)::int AS n
           FROM leads
          WHERE routed_at IS NULL
            AND created_at >= NOW() - ($1 || ' days')::interval
            AND created_at <  NOW() - INTERVAL '30 minutes'
            AND deleted_at IS NULL`, [d]);

    // A few slowest routed leads for the "investigate these" list.
    const slowest = await pool.query(
        `SELECT id, full_name, lead_type,
                ROUND(EXTRACT(EPOCH FROM (routed_at - created_at)))::int AS latency_seconds
           FROM leads
          WHERE routed_at IS NOT NULL
            AND routed_at >= NOW() - ($1 || ' days')::interval
            AND routed_at >= created_at
            AND deleted_at IS NULL
          ORDER BY latency_seconds DESC
          LIMIT 5`, [d]);

    const r = agg.rows[0];
    const median = Math.round(r.median_seconds);
    const p95 = Math.round(r.p95_seconds);
    return {
        days: d,
        target_p95_seconds: TARGET_P95_SECONDS,
        routed_count: r.routed_count,
        median_seconds: median,
        p95_seconds: p95,
        max_seconds: Math.round(r.max_seconds),
        median_human: fmtDur(median),
        p95_human: fmtDur(p95),
        max_human: fmtDur(r.max_seconds),
        auto_count: r.auto_count,                    // routed within target (near-instant)
        slow_count: r.slow_count,                    // took > 30 min (manual gap)
        unrouted_count: unrouted.rows[0].n,          // still no agent after 30 min
        within_target: r.routed_count > 0 && p95 < TARGET_P95_SECONDS,
        slowest: slowest.rows.map(x => ({
            id: x.id, name: x.full_name, type: x.lead_type,
            latency_seconds: x.latency_seconds, latency_human: fmtDur(x.latency_seconds),
        })),
    };
}

// ── Weekly report ────────────────────────────────────────────────────────────
async function sendReport(subject, text) {
    const hook = process.env.SLACK_WEBHOOK_URL;
    if (hook) {
        try {
            const res = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
            if (res.ok) return;
            console.warn('[routing-sla] slack non-200:', res.status);
        } catch (e) { console.warn('[routing-sla] slack failed:', e.message); }
    }
    try {
        const emailService = require('./email');
        const to = process.env.ADMIN_EMAIL || process.env.LEAD_NOTIFY_EMAIL;
        if (to) await emailService.sendEmail({
            to, subject,
            html: `<pre style="font:14px/1.6 ui-monospace,monospace;white-space:pre-wrap">${String(text).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</pre>`,
            category: 'ops',
        });
    } catch (e) { console.warn('[routing-sla] email failed:', e.message); }
}

async function runWeeklySlaReport() {
    if (process.env.ROUTING_SLA_REPORT_ENABLED === 'false') return { skipped: 'disabled' };
    try {
        // ISO-week key from the DB (avoids JS date math / week-boundary bugs).
        const wk = await pool.query(`SELECT to_char(NOW(), 'IYYY-"W"IW') AS week`);
        const weekKey = wk.rows[0].week;

        // First run ever → set the marker silently so we don't backfill a report.
        const existing = await pool.query(`SELECT value FROM app_config WHERE key = 'routing_sla_report_week'`);
        if (!existing.rowCount) {
            await pool.query(
                `INSERT INTO app_config (key, value, description)
                 VALUES ('routing_sla_report_week', to_jsonb($1::text), 'Last ISO week the routing SLA report was sent')
                 ON CONFLICT (key) DO NOTHING`, [weekKey]);
            return { skipped: 'initialized' };
        }
        const cur = typeof existing.rows[0].value === 'string' ? JSON.parse(existing.rows[0].value) : existing.rows[0].value;
        if (cur === weekKey) return { skipped: 'already-sent' };
        // Claim the week atomically before sending (guards double-send on restart).
        const claim = await pool.query(
            `UPDATE app_config SET value = to_jsonb($1::text)
              WHERE key = 'routing_sla_report_week' AND value <> to_jsonb($1::text) RETURNING key`, [weekKey]);
        if (!claim.rowCount) return { skipped: 'race' };

        const s = await computeRoutingSla({ days: 7 });
        const status = s.routed_count === 0 ? ':grey_question: no leads routed'
            : s.within_target ? ':white_check_mark: within target'
            : ':warning: OVER target';
        const lines = [
            `📊 Weekly lead routing SLA — last 7 days`,
            ``,
            `Routed: ${s.routed_count} lead(s)`,
            `Median: ${s.median_human}   ·   p95: ${s.p95_human}   (target p95 < ${fmtDur(s.target_p95_seconds)})`,
            `Status: ${status}`,
            `Slowest single route: ${s.max_human}`,
        ];
        if (s.slow_count) lines.push(`⚠️ ${s.slow_count} lead(s) took over 30 min to reach an agent (manual gap).`);
        if (s.unrouted_count) lines.push(`⚠️ ${s.unrouted_count} lead(s) still have no agent after 30 min.`);
        if (s.slowest.length && (s.slow_count || !s.within_target)) {
            lines.push('', 'Slowest routes:');
            s.slowest.forEach(x => lines.push(`  • ${x.name || x.id} (${x.type || 'lead'}): ${x.latency_human}`));
        }
        await sendReport(`Weekly routing SLA — p95 ${s.p95_human} (${s.within_target ? 'OK' : 'over target'})`, lines.join('\n'));
        return { sent: true, ...s };
    } catch (e) { console.warn('[routing-sla] weekly report failed:', e.message); return { error: e.message }; }
}

module.exports = { computeRoutingSla, runWeeklySlaReport, TARGET_P95_SECONDS };
