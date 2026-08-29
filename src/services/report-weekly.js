'use strict';

// EM-08 — assemble + send the Monday website report. Sends every week without
// exception (a missing Monday email is the signal the reporting system is down),
// self-guarded to once per week via an app_config marker. The scheduler checks
// a few times an hour; this fires on Monday 07:00 America/Chicago, or later in
// the week if that Monday was missed (an outage can't silently skip a week).

const pool = require('../database/pool');
const email = require('./email');
const { reportData } = require('./report-data');
const { topActions } = require('./report-rules');

// The date (YYYY-MM-DD, CT) of the Monday of the current Chicago week, and whether
// "now" is at/after that Monday 07:00 CT.
function chicagoWeekAnchor(now = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
    const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = WD[parts.weekday];
    const hour = parseInt(parts.hour, 10) % 24;
    // Monday's date = today minus (dow-1) days, in CT calendar terms.
    const today = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
    const monday = new Date(today.getTime() - ((dow + 6) % 7) * 864e5);
    const mondayKey = monday.toISOString().slice(0, 10);
    // Eligible once it's past Monday 07:00 for this week (covers a Monday outage:
    // still eligible Tue–Sun if not yet sent).
    const pastMonday7 = (dow === 1 && hour >= 7) || dow > 1 || dow === 0;
    return { mondayKey, pastMonday7, label: monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
}

async function alreadySent(mondayKey) {
    try {
        // value is JSONB; #>>'{}' extracts the stored string as text.
        const { rows } = await pool.query(`SELECT value #>> '{}' AS v FROM app_config WHERE key = 'weekly_report_sent'`);
        return rows[0] && rows[0].v === mondayKey;
    } catch (_) { return false; }
}
async function markSent(mondayKey) {
    try {
        // app_config.value is JSONB NOT NULL — a bare string is invalid JSON and
        // throws; to_jsonb makes it a valid JSON string. (This is why the guard
        // silently failed and the report re-sent every sweep.)
        await pool.query(
            `INSERT INTO app_config (key, value, description)
             VALUES ('weekly_report_sent', to_jsonb($1::text), 'EM-08 weekly report last-sent week key')
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [mondayKey]);
    } catch (e) { console.warn('[weekly-report] mark failed:', e.message); }
}

// Build + send for the 7 days ending now. `force` skips the once-a-week guard
// (for manual/test sends). Returns { sent, skipped }.
async function runWeeklyReport({ force = false } = {}) {
    const anchor = chicagoWeekAnchor();
    if (!force) {
        if (!anchor.pastMonday7) return { sent: false, skipped: 'before_monday_7' };
        if (await alreadySent(anchor.mondayKey)) return { sent: false, skipped: 'already_sent' };
    }

    const end = new Date();
    const start = new Date(end.getTime() - 7 * 864e5);
    const report = await reportData(start.toISOString(), end.toISOString(), 7);
    const actions = await topActions(3);

    // Incidents this week + still open, for the status line.
    let thisWeekIncidents = 0;
    try { thisWeekIncidents = (await pool.query(`SELECT COUNT(*)::int AS n FROM incidents WHERE created_at > NOW() - INTERVAL '7 days'`)).rows[0].n; } catch (_) {}
    const open = report.whatRan.open_incidents || 0;
    const emailsSent = (report.whatRan.emailsByTemplate || []).reduce((a, e) => a + (e.sent || 0), 0);

    // Dead-man's switch: the heartbeat-writing workers (email-health, p2-batch)
    // run continuously regardless of activity, so a week with NO fresh heartbeat
    // doesn't mean quiet — it means those workers are dead, and the report must
    // not say "normal" then. BUT those two are the alarm layer, and they can be
    // turned off on purpose (EMAIL_HEALTH_MONITOR_ENABLED / INCIDENT_ROUTER_ENABLED
    // = false). If BOTH are off, no heartbeat is *expected* — that's monitoring
    // disabled, not a dead worker, and we say so rather than over-claiming "down".
    const sweptRecently = (report.whatRan.sweeps || []).some(s => s.last_run_at && new Date(s.last_run_at) >= new Date(start));
    const alarmLayerOn = process.env.EMAIL_HEALTH_MONITOR_ENABLED !== 'false' || process.env.INCIDENT_ROUTER_ENABLED !== 'false';
    const statusLine = !sweptRecently
        ? (alarmLayerOn
            ? 'No sweeps ran this week — the background workers may be down, so this report can\'t confirm normal operation. Check the Email tab.'
            : 'Sweep monitoring is turned off (both alarm-layer flags are disabled), so this report can\'t confirm worker health this week.')
        : thisWeekIncidents > 0
            ? `${thisWeekIncidents} incident${thisWeekIncidents === 1 ? '' : 's'} this week, ${open} still open.`
            : `All systems normal — ${emailsSent} email${emailsSent === 1 ? '' : 's'} sent, no incidents.`;
    const subject = open > 0
        ? `MN Lake Homes — week of ${anchor.label} (${open} open issue${open === 1 ? '' : 's'})`
        : `MN Lake Homes — week of ${anchor.label}`;

    await email.sendWeeklyReport({ subject, statusLine, report, actions });
    if (!force) await markSent(anchor.mondayKey);
    return { sent: true, mondayKey: anchor.mondayKey };
}

module.exports = { runWeeklyReport, chicagoWeekAnchor };
