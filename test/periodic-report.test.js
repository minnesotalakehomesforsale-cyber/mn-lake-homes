'use strict';

// EM-09 — quarterly + six-month reuse the weekly query layer over a longer window,
// add the extra sections, and are due-gated once per period. Six-month supersedes
// quarterly in Jan/Jul.

const pool = require('../src/database/pool');
let cfg = null;
pool.query = async (sql, params = []) => {
    if (/FROM app_config WHERE key = 'periodic_report_sent'/.test(sql)) return { rows: cfg ? [{ v: cfg }] : [] };
    if (/INSERT INTO app_config/.test(sql)) { cfg = params[0]; return { rows: [] }; }
    return { rows: [] };
};

// Same query layer as the weekly, stubbed.
const rd = require('../src/services/report-data');
rd.reportData = async (start, end, periodDays) => ({
    _periodDays: periodDays,
    numbers: { current: { leads_submitted: 12, new_agents: 3, sessions: 1400 }, previous: {}, avg: {} },
    mrr: 250, topLakes: [], leads: [], content: {}, whatRan: { open_incidents: 0, emailsByTemplate: [], sweeps: [] },
});
const rr = require('../src/services/report-rules');
rr.candidateActions = async () => ([
    { score: 100, kind: 'unrouted', text: 'unrouted lead on Gull', link: '/x' },
    { score: 90, kind: 'recruit', text: 'recruit on Bald Eagle', link: '/x' },
    { score: 30, kind: 'hygiene', text: 'draft profiles', link: '/x' },
]);

const email = require('../src/services/email');
let sent = [];
email.sendPeriodicReport = async (o) => { sent.push(o); return {}; };

const { runPeriodic, periodicDue, runPeriodicIfDue } = require('../src/services/report-periodic');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

(async () => {
    // Quarterly uses a 90-day window; actions grouped.
    sent = [];
    await runPeriodic('quarterly');
    ok(sent.length === 1 && sent[0].kind === 'quarterly', 'quarterly sends');
    ok(sent[0].report._periodDays === 90, 'quarterly runs the SAME query layer over a 90-day window');
    ok(sent[0].actions.recruit && sent[0].actions.fix, 'actions grouped into recruit/content/product/fix');

    // Six-month uses 182 days and adds the stop-doing + retention sections.
    sent = [];
    await runPeriodic('six_month');
    ok(sent[0].report._periodDays === 182, 'six-month runs a 182-day window');
    ok(sent[0].sections.stopDoing !== undefined && sent[0].sections.retentionLine !== undefined, 'six-month adds stop-doing + retention');

    // Due gating: six-month in Jan/Jul, quarterly in Apr/Oct, nothing mid-quarter.
    ok(periodicDue(new Date('2026-07-02T12:00:00Z')).kind === 'six_month', 'early July → six-month');
    ok(periodicDue(new Date('2026-10-02T12:00:00Z')).kind === 'quarterly', 'early Oct → quarterly');
    ok(periodicDue(new Date('2026-08-15T12:00:00Z')) === null, 'mid-quarter → nothing due');

    // Once-per-period guard.
    cfg = null; sent = [];
    const a = await runPeriodicIfDue({ now: new Date('2026-10-02T12:00:00Z') });
    const b = await runPeriodicIfDue({ now: new Date('2026-10-03T12:00:00Z') });
    ok(a.sent === true && b.skipped === 'already_sent' && sent.length === 1, 'sends once per period, then guards');

    if (failures) { console.error(`\nperiodic-report: ${failures} FAIL`); process.exit(1); }
    console.log('\nperiodic-report: ALL PASSED');
})();
