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
        const { rows } = await pool.query(`SELECT value FROM app_config WHERE key = 'weekly_report_sent'`);
        return rows[0] && String(rows[0].value) === mondayKey;
    } catch (_) { return false; }
}
async function markSent(mondayKey) {
    try {
        await pool.query(
            `INSERT INTO app_config (key, value) VALUES ('weekly_report_sent', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [mondayKey]);
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

    // Dead-man's switch: sweeps run daily regardless of activity, so a week with
    // NO sweep run doesn't mean quiet — it means the workers are dead, and the
    // report must not say "normal" then. The heartbeat P2 should already have
    // fired; this makes the reassuring-while-broken state unreachable anyway.
    const sweptRecently = (report.whatRan.sweeps || []).some(s => s.last_run_at && new Date(s.last_run_at) >= new Date(start));
    const statusLine = !sweptRecently
        ? 'No sweeps ran this week — the background workers may be down, so this report can\'t confirm normal operation. Check the Email tab.'
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
