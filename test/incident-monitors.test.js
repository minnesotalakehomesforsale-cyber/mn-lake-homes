'use strict';

// EM-06 — the timer-based condition monitors: site-health consecutive-failure,
// zero-leads dormancy, heartbeat staleness, and the failure-rate thresholds.

const pool = require('../src/database/pool');

// Programmable responses per query shape.
let S = {};
pool.query = async (sql) => {
    if (/SELECT 1/.test(sql) && !/heartbeats|incidents|leads/.test(sql)) {
        if (S.dbDown) throw new Error('db down');
        return { rows: [{ '?column?': 1 }] };
    }
    if (/FROM heartbeats/.test(sql)) return { rows: S.heartbeat ? [{ last_run_at: S.heartbeat }] : [] };
    if (/stripe_h/.test(sql)) return { rows: [{ stripe_h: S.stripeH || 0, db_10m: S.db10 || 0 }] };
    if (/FROM leads/.test(sql) || /recent/.test(sql)) return { rows: [{ recent: S.recent ?? 0, month: S.month ?? 0 }] };
    return { rows: [] };   // raise/resolve upserts
};

const incidents = require('../src/services/incidents');
let raised = [], resolved = [];
incidents.raise = async (o) => { raised.push(o); return { ok: true }; };
incidents.resolve = async (k) => { resolved.push(k); return true; };

const mon = require('../src/services/incident-monitors');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };
const raisedKey = k => raised.find(r => r.key === k);

(async () => {
    // Site-health: 3 consecutive failures → one P1, not before.
    mon._resetSiteHealth(); S = { dbDown: true }; raised = []; resolved = [];
    await mon.checkSiteHealth(); await mon.checkSiteHealth();
    ok(!raisedKey('site_health'), 'site-health does not alarm on 1–2 failures');
    await mon.checkSiteHealth();
    ok(raisedKey('site_health')?.severity === 'P1', '3 consecutive failures → P1');
    // Recovery resolves + resets the counter.
    S = { dbDown: false }; raised = []; resolved = [];
    await mon.checkSiteHealth();
    ok(resolved.includes('site_health'), 'site-health resolves on recovery');

    // Zero-leads-48h: DORMANT while the 4-week average is ~0.
    S = { recent: 0, month: 0 }; raised = []; resolved = [];
    await mon.checkZeroLeads48h();
    ok(!raisedKey('zero_leads_48h'), 'zero-leads stays dormant when the 4-week average is 0');
    // Arms once there is a baseline and 48h is empty.
    S = { recent: 0, month: 20 }; raised = [];
    await mon.checkZeroLeads48h();
    ok(raisedKey('zero_leads_48h')?.severity === 'P1', 'zero-leads fires when avg>0 and 48h is empty');
    // Quiet again when leads are flowing.
    S = { recent: 3, month: 20 }; raised = []; resolved = [];
    await mon.checkZeroLeads48h();
    ok(resolved.includes('zero_leads_48h'), 'zero-leads resolves when leads are flowing');

    // Heartbeats: a stale sweep → P2; a fresh one resolves; a never-run one is silent.
    S = { heartbeat: new Date(Date.now() - 90 * 60000).toISOString() }; raised = []; resolved = [];
    await mon.checkHeartbeats();
    ok(raised.some(r => /^missed_sweep:/.test(r.key) && r.severity === 'P2'), 'a stale sweep raises a P2');
    S = { heartbeat: new Date().toISOString() }; raised = []; resolved = [];
    await mon.checkHeartbeats();
    ok(resolved.some(k => /^missed_sweep:/.test(k)), 'a fresh heartbeat resolves the missed-sweep incident');
    S = { heartbeat: null }; raised = [];
    await mon.checkHeartbeats();
    ok(!raised.some(r => /^missed_sweep:/.test(r.key)), 'a never-run sweep (fresh deploy) does not alarm');

    // Failure rates: Stripe 3+/h and DB 5+/10min → P1; below threshold resolves.
    S = { stripeH: 3, db10: 5 }; raised = []; resolved = [];
    await mon.checkFailureRates();
    ok(raisedKey('stripe_webhook_failing')?.severity === 'P1', 'Stripe 3+/hour → P1');
    ok(raisedKey('db_errors')?.severity === 'P1', 'DB 5+/10min → P1');
    S = { stripeH: 1, db10: 2 }; raised = []; resolved = [];
    await mon.checkFailureRates();
    ok(resolved.includes('stripe_webhook_failing') && resolved.includes('db_errors'), 'failure rates resolve below threshold');

    if (failures) { console.error(`\nincident-monitors: ${failures} FAIL`); process.exit(1); }
    console.log('\nincident-monitors: ALL PASSED');
})();
