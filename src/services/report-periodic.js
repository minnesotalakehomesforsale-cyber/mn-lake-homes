'use strict';

// EM-09 — quarterly + six-month review. NOT a second reporting system: it reuses
// EM-08's reportData (window-parameterised) and candidateActions, and adds the
// longer-window sections. A report for a past window produces the same numbers as
// that window's weeklies because it's the same queries.

const pool = require('../database/pool');
const email = require('./email');
const { reportData } = require('./report-data');
const { candidateActions } = require('./report-rules');

const qN = async (sql, p = []) => { try { return (await pool.query(sql, p)).rows; } catch (_) { return []; } };
const q1 = async (sql, p = []) => { try { return (await pool.query(sql, p)).rows[0] || {}; } catch (_) { return {}; } };
const SPARK = '▁▂▃▄▅▆▇█';

function sparkline(series) {
    const vals = series.map(v => Number(v) || 0);
    if (!vals.length) return '';
    const max = Math.max(...vals, 1);
    return vals.map(v => SPARK[Math.min(SPARK.length - 1, Math.round((v / max) * (SPARK.length - 1)))]).join('');
}

// Weekly buckets of a count over the window, for the headline sparklines.
async function weeklySeries(table, dateCol, where, start, end) {
    const rows = await qN(
        `SELECT date_trunc('week', ${dateCol}) AS wk, COUNT(*)::int AS n
           FROM ${table} WHERE ${dateCol} >= $1 AND ${dateCol} < $2 ${where ? 'AND ' + where : ''}
          GROUP BY 1 ORDER BY 1`, [start, end]);
    return rows.map(r => r.n);
}

async function buildSections(kind, start, end, report) {
    const w = [start, end];
    const [byTraffic, byLeads, tiers, cohort, content, sessSeries, leadSeries] = await Promise.all([
        qN(`SELECT COALESCE(l.name, REPLACE(pv.path,'/lakes/','')) AS lake, pv.views
              FROM (SELECT path, COUNT(*)::int AS views FROM page_views
                     WHERE created_at >= $1 AND created_at < $2 AND path LIKE '/lakes/%' GROUP BY path) pv
              LEFT JOIN lakes l ON l.slug = REPLACE(pv.path,'/lakes/','')
             ORDER BY pv.views DESC LIMIT 10`, w),
        qN(`SELECT target_lake AS lake, COUNT(*)::int AS leads FROM leads
             WHERE created_at >= $1 AND created_at < $2 AND deleted_at IS NULL AND target_lake IS NOT NULL GROUP BY target_lake ORDER BY leads DESC LIMIT 10`, w),
        q1(`SELECT COUNT(*) FILTER (WHERE m.code='basic')::int AS standard,
                   COUNT(*) FILTER (WHERE m.code='mn_lake_specialist')::int AS prime,
                   COUNT(*) FILTER (WHERE m.code='top_agent')::int AS elite,
                   COUNT(*) FILTER (WHERE m.code='free' OR m.code IS NULL)::int AS free
              FROM agents a LEFT JOIN memberships m ON m.id = a.membership_id WHERE a.deleted_at IS NULL`),
        q1(`SELECT COUNT(*) FILTER (WHERE created_at >= $1 AND created_at < $2)::int AS joined,
                   COUNT(*) FILTER (WHERE lifecycle_state IN ('paying','free_live'))::int AS active,
                   COUNT(*) FILTER (WHERE lifecycle_state = 'churned')::int AS churned
              FROM agents WHERE deleted_at IS NULL`, w),
        q1(`SELECT (SELECT COUNT(*)::int FROM blog_posts WHERE is_published=TRUE AND deleted_at IS NULL) AS blog,
                   (SELECT COUNT(*)::int FROM lakes) AS lakes,
                   (SELECT COUNT(*)::int FROM lakes l WHERE COALESCE(array_length(regexp_split_to_array(btrim(COALESCE(l.intro_text,'')||' '||COALESCE(l.description,'')),'\\s+'),1),0) < 200) AS thin`),
        weeklySeries('page_views', 'created_at', null, start, end),
        weeklySeries('leads', 'created_at', 'deleted_at IS NULL', start, end),
    ]);

    // Reuse the weekly numbers table shape, at this window's resolution.
    const cur = report.numbers.current;
    const cell = 'padding:6px 8px;font-size:13px;border-bottom:1px solid #f2f5f8;font-variant-numeric:tabular-nums;';
    const ROWS = [['Sessions', 'sessions', sparkline(sessSeries)], ['Lake page views', 'lake_views', ''], ['Leads submitted', 'leads_submitted', sparkline(leadSeries)], ['Leads routed', 'leads_routed', ''], ['Leads unrouted', 'leads_unrouted', ''], ['Median time to contact', 'median_ttc_min', ''], ['New agents', 'new_agents', ''], ['Profiles published', 'profiles_published', ''], ['Paid conversions', 'paid_conversions', ''], ['Cancellations', 'cancellations', '']];
    const numbersTable = `<div style="overflow-x:auto;"><table role="presentation" width="100%" style="border-collapse:collapse;min-width:320px;">
        <tr><td style="${cell}color:#a0aec0;font-weight:700;">Metric</td><td style="${cell}text-align:right;color:#a0aec0;font-weight:700;">Total</td><td style="${cell}color:#a0aec0;font-weight:700;">Trend</td></tr>
        ${ROWS.map(([label, key, spark]) => `<tr><td style="${cell}color:#4a5568;">${label}</td><td style="${cell}text-align:right;font-weight:700;">${cur[key] == null ? '—' : cur[key]}</td><td style="${cell}color:#718096;letter-spacing:1px;">${spark || ''}</td></tr>`).join('')}
      </table></div>`;

    const tierLine = `Free ${tiers.free ?? '—'} · Standard ${tiers.standard ?? '—'} · Prime ${tiers.prime ?? '—'} · Elite ${tiers.elite ?? '—'} — MRR $${report.mrr ?? '—'}. (Upgrade/downgrade movement needs membership history — Wave 2.)`;
    const contentLine = `${content.blog ?? '—'} blog posts live · ${content.lakes ?? '—'} lake pages · ${content.thin ?? '—'} still under 200 words`;

    const sections = { numbersTable, sparkNote: 'trend = weekly buckets', topByTraffic: byTraffic, topByLeads: byLeads, tierLine, cohort, contentLine };

    if (kind === 'six_month') {
        // "What to stop doing" — from REAL thresholds, not a placeholder.
        const stop = [];
        // Lakes that take work (agent + content) but returned nothing (no leads) this window.
        const deadLakes = await qN(
            `SELECT l.name FROM lakes l
              WHERE EXISTS (SELECT 1 FROM agent_lakes al JOIN agents a ON a.id=al.agent_id WHERE al.lake_id=l.id AND a.is_published)
                AND COALESCE(array_length(regexp_split_to_array(btrim(COALESCE(l.intro_text,'')||' '||COALESCE(l.description,'')),'\\s+'),1),0) >= 200
                AND NOT EXISTS (SELECT 1 FROM leads le WHERE le.target_lake = l.name AND le.created_at >= $1 AND le.created_at < $2)
              ORDER BY l.name LIMIT 5`, w);
        for (const r of deadLakes) stop.push(`${r.name}: a built-out page with an agent that produced no leads in six months — stop investing until demand shows up.`);
        // Email templates with a bounce rate over 5% (a deliverability sink).
        const badEmail = await qN(
            `SELECT template_key, ROUND(100.0*COUNT(*) FILTER (WHERE status='bounced')/NULLIF(COUNT(*) FILTER (WHERE status IN ('sent','bounced')),0),1) AS bounce
               FROM email_log WHERE created_at >= $1 AND created_at < $2 AND template_key IS NOT NULL
              GROUP BY template_key HAVING COUNT(*) FILTER (WHERE status IN ('sent','bounced')) >= 20 AND
                       ROUND(100.0*COUNT(*) FILTER (WHERE status='bounced')/NULLIF(COUNT(*) FILTER (WHERE status IN ('sent','bounced')),0),1) > 5
              ORDER BY bounce DESC LIMIT 5`, w);
        for (const r of badEmail) stop.push(`Email "${r.template_key}" is bouncing ${r.bounce}% — fix the list or retire it.`);
        sections.stopDoing = stop;
        const ret = await q1(`SELECT COUNT(*) FILTER (WHERE lifecycle_state='paying')::int AS paying, COUNT(*) FILTER (WHERE lifecycle_state='churned')::int AS churned FROM agents WHERE deleted_at IS NULL`);
        sections.retentionLine = `${ret.paying ?? '—'} paying now · ${ret.churned ?? '—'} churned all-time. (Cohort/YoY retention deepens as history accrues.)`;
    }
    return sections;
}

async function runPeriodic(kind) {
    const days = kind === 'six_month' ? 182 : 90;
    const end = new Date();
    const start = new Date(end.getTime() - days * 864e5);
    const report = await reportData(start.toISOString(), end.toISOString(), days);
    const sections = await buildSections(kind, start.toISOString(), end.toISOString(), report);

    // Top 10 actions, grouped recruit/content/product/fix.
    const KIND_GROUP = { recruit: 'recruit', content: 'content', unrouted: 'fix', hygiene: 'product' };
    const all = (await candidateActions()).sort((a, b) => b.score - a.score).slice(0, 10);
    const actions = {};
    for (const a of all) { const g = KIND_GROUP[a.kind] || 'fix'; (actions[g] ||= []).push(a); }

    const label = kind === 'six_month' ? 'Six-month review' : 'Quarterly review';
    const open = report.whatRan.open_incidents || 0;
    const statusLine = `${label}: ${report.numbers.current.leads_submitted ?? 0} leads, ${report.numbers.current.new_agents ?? 0} new agents, MRR $${report.mrr ?? '—'}${open ? ` · ${open} open issue${open === 1 ? '' : 's'}` : ''}.`;
    const subject = `MN Lake Homes — ${label}`;

    await email.sendPeriodicReport({ kind, subject, statusLine, report, sections, actions });
    return { sent: true, kind };
}

// Which review is due (in the first days of the period), and its once-per-period
// guard key. Six-month supersedes quarterly in Jan/Jul (it contains everything the
// quarterly has plus more), so we never send both in the same month.
function periodicDue(now = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
    const y = parts.year, mo = parseInt(parts.month, 10), day = parseInt(parts.day, 10);
    if (day > 5) return null;                                  // only in the first days after a period boundary
    if (mo === 1) return { kind: 'six_month', key: `${y}-H2prev` };   // early Jan → H2 of last year
    if (mo === 7) return { kind: 'six_month', key: `${y}-H1` };       // early Jul → H1
    if (mo === 4) return { kind: 'quarterly', key: `${y}-Q1` };       // early Apr → Q1
    if (mo === 10) return { kind: 'quarterly', key: `${y}-Q3` };      // early Oct → Q3
    return null;
}

async function runPeriodicIfDue({ force = false, now = new Date() } = {}) {
    const due = force ? { kind: force === true ? 'quarterly' : force, key: 'forced' } : periodicDue(now);
    if (!due) return { sent: false, skipped: 'not_due' };
    if (!force) {
        try {
            const { rows } = await pool.query(`SELECT value #>> '{}' AS v FROM app_config WHERE key = 'periodic_report_sent'`);
            if (rows[0] && rows[0].v === due.key) return { sent: false, skipped: 'already_sent' };
        } catch (_) {}
    }
    const r = await runPeriodic(due.kind);
    // value is JSONB NOT NULL — wrap as to_jsonb or the insert throws (same guard bug the weekly had).
    if (!force) { try { await pool.query(`INSERT INTO app_config (key, value, description) VALUES ('periodic_report_sent', to_jsonb($1::text), 'EM-09 periodic report last-sent period key') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [due.key]); } catch (_) {} }
    return r;
}

module.exports = { runPeriodic, runPeriodicIfDue, periodicDue, buildSections };
