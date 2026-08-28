'use strict';

// EM-08 — the weekly report assembler: status line, subject, once-a-week guard,
// and it SENDS on a zero-activity week (that's the point).

const pool = require('../src/database/pool');
let cfg = null, incidentsThisWeek = 0;
pool.query = async (sql, params = []) => {
    if (/COUNT\(\*\)::int AS n FROM incidents WHERE created_at/.test(sql)) return { rows: [{ n: incidentsThisWeek }] };
    if (/FROM app_config WHERE key = 'weekly_report_sent'/.test(sql)) return { rows: cfg ? [{ value: cfg }] : [] };
    if (/INSERT INTO app_config/.test(sql)) { cfg = params[0]; return { rows: [] }; }
    return { rows: [] };
};

// Stub the query layer + rules so the test is about the assembler, not the SQL.
const rd = require('../src/services/report-data');
let openIncidents = 0, emailsSent = 0, noSweeps = false;
rd.reportData = async () => ({
    numbers: { current: {}, previous: {}, avg: {} }, mrr: null, topLakes: [], leads: [], content: {},
    whatRan: { open_incidents: openIncidents, emailsByTemplate: emailsSent ? [{ template_key: 'x', sent: emailsSent }] : [],
               sweeps: noSweeps ? [] : [{ name: 'lead-sla', last_run_at: new Date().toISOString() }] },
});
const rr = require('../src/services/report-rules');
rr.topActions = async () => [];

const email = require('../src/services/email');
let sent = [];
email.sendWeeklyReport = async (o) => { sent.push(o); return {}; };

const { runWeeklyReport, chicagoWeekAnchor } = require('../src/services/report-weekly');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

(async () => {
    // Zero-activity week still sends, and says so plainly.
    incidentsThisWeek = 0; openIncidents = 0; emailsSent = 0; sent = []; cfg = null;
    let r = await runWeeklyReport({ force: true });
    ok(r.sent && sent.length === 1, 'sends even on a zero-activity week');
    ok(/All systems normal — 0 emails sent, no incidents/.test(sent[0].statusLine), 'zero-activity status line is honest');
    ok(/week of/.test(sent[0].subject) && !/open issue/.test(sent[0].subject), 'clean subject with no open incidents');

    // Dead-man's switch: a week with NO sweep run cannot say "normal".
    noSweeps = true; incidentsThisWeek = 0; openIncidents = 0; emailsSent = 0; sent = [];
    await runWeeklyReport({ force: true });
    ok(/No sweeps ran this week/.test(sent[0].statusLine) && !/All systems normal/.test(sent[0].statusLine), 'a week with no sweeps reports the workers may be down, not "All systems normal"');
    noSweeps = false;

    // A week with incidents flags it in the status line + subject.
    incidentsThisWeek = 2; openIncidents = 1; emailsSent = 40; sent = [];
    r = await runWeeklyReport({ force: true });
    ok(/2 incidents this week, 1 still open/.test(sent[0].statusLine), 'incident week status line');
    ok(/\(1 open issue\)/.test(sent[0].subject), 'subject flags open issues');

    // Once-a-week guard (non-force): first send marks, second is skipped.
    cfg = null; sent = [];
    const anchor = chicagoWeekAnchor();
    if (anchor.pastMonday7) {
        const a = await runWeeklyReport();
        const b = await runWeeklyReport();
        ok(a.sent === true && b.skipped === 'already_sent' && sent.length === 1, 'sends once per week, then guards');
    } else {
        const a = await runWeeklyReport();
        ok(a.skipped === 'before_monday_7', 'holds until Monday 07:00 CT when not forced');
    }

    ok(/^\d{4}-\d{2}-\d{2}$/.test(chicagoWeekAnchor(new Date('2026-08-26T12:00:00Z')).mondayKey), 'week anchor yields a Monday date key');

    if (failures) { console.error(`\nweekly-report: ${failures} FAIL`); process.exit(1); }
    console.log('\nweekly-report: ALL PASSED');
})();
