'use strict';

// EM-04 — send-health monitor: the four conditions + the sweep's alert dedupe.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const assert = require('assert');
const pool = require('../src/database/pool');

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failures++; console.error('  ✗ ' + msg); } };

// Scenario-driven pool stub. Each test sets `S` then calls checkSendHealth().
let S = {};
pool.query = async (sql) => {
    if (/ORDER BY created_at DESC LIMIT 50/.test(sql)) return { rows: S.last50 || [] };
    if (/INTERVAL '24 hours'/.test(sql)) return { rows: [{ sent: S.sent24 ?? 0, total: S.total24 ?? 0 }] };
    if (/GROUP BY template_key HAVING/.test(sql)) return { rows: S.tmplFails || [] };
    if (/template_key = 'email_health_alert'/.test(sql)) return { rows: S.alertedRecently ? [{ x: 1 }] : [] };
    return { rows: [] };
};

// Stub the incident router so the sweep records instead of emailing/DB-writing.
const incidents = require('../src/services/incidents');
let raised = [], resolved = [];
incidents.raise = async (o) => { raised.push(o); return { ok: true }; };
incidents.resolve = async (k) => { resolved.push(k); return true; };

const { checkSendHealth, runSendHealthSweep } = require('../src/services/email-health');

function setTransport({ resend, gmail, from }) {
    delete process.env.RESEND_API_KEY; delete process.env.GMAIL_USER; delete process.env.GMAIL_APP_PASSWORD; delete process.env.EMAIL_FROM;
    if (resend) process.env.RESEND_API_KEY = 'test';
    if (gmail) { process.env.GMAIL_USER = 'u@x.com'; process.env.GMAIL_APP_PASSWORD = 'p'; }
    if (from) process.env.EMAIL_FROM = from;
}
const codes = h => h.triggered.map(c => c.code);

(async () => {
    // Healthy — real transport, all sent, traffic present, no template fails.
    setTransport({ resend: true, from: 'MN Lake Homes <hello@real.com>' });
    S = { last50: Array(50).fill({ status: 'sent' }), sent24: 40, total24: 42, tmplFails: [] };
    let h = await checkSendHealth();
    ok(h.healthy && h.triggered.length === 0, 'healthy scenario trips nothing');

    // Condition 1a — no transport.
    setTransport({});
    S = { last50: [{ status: 'sent' }], sent24: 1, total24: 1, tmplFails: [] };
    h = await checkSendHealth();
    ok(codes(h).includes('transport_none'), 'no transport → transport_none');

    // Condition 1b — Resend sandbox sender.
    setTransport({ resend: true });   // no EMAIL_FROM → sandbox
    S = { last50: [{ status: 'sent' }], sent24: 1, total24: 1, tmplFails: [] };
    h = await checkSendHealth();
    ok(codes(h).includes('transport_sandbox'), 'sandbox sender → transport_sandbox');

    // Condition 1c — auth errors in recent sends.
    setTransport({ resend: true, from: 'MN <a@real.com>' });
    S = { last50: [{ status: 'error', detail: 'Unauthorized: invalid API key' }, { status: 'sent' }], sent24: 1, total24: 2, tmplFails: [] };
    h = await checkSendHealth();
    ok(codes(h).includes('transport_auth'), 'auth-error detail → transport_auth');

    // Condition 2 — bounce rate > 20%.
    setTransport({ resend: true, from: 'MN <a@real.com>' });
    S = { last50: [...Array(6).fill({ status: 'bounced' }), ...Array(14).fill({ status: 'sent' })], sent24: 14, total24: 20, tmplFails: [] };
    h = await checkSendHealth();
    ok(codes(h).includes('bounce_rate'), 'bounce 6/20 = 30% → bounce_rate');

    // Condition 3 — zero sends in 24h with other traffic.
    setTransport({ resend: true, from: 'MN <a@real.com>' });
    S = { last50: [{ status: 'error', detail: 'timeout' }], sent24: 0, total24: 7, tmplFails: [] };
    h = await checkSendHealth();
    ok(codes(h).includes('no_sends'), 'zero sends + traffic → no_sends');

    // ...but zero sends with zero traffic is NOT an alarm (quiet night).
    S = { last50: [], sent24: 0, total24: 0, tmplFails: [] };
    h = await checkSendHealth();
    ok(!codes(h).includes('no_sends'), 'zero sends + zero traffic → no false alarm');

    // Condition 4 — a template failing >= 5 in an hour.
    setTransport({ resend: true, from: 'MN <a@real.com>' });
    S = { last50: [{ status: 'sent' }], sent24: 1, total24: 1, tmplFails: [{ template_key: 'lead_agent_matched', fails: 6 }] };
    h = await checkSendHealth();
    ok(codes(h).includes('template_failing'), 'template 6 fails/h → template_failing');

    // Sweep routes each tripped condition to the incident router as a P1, and
    // auto-resolves the ones that aren't firing (dedupe/throttle live in the router).
    setTransport({});   // transport_none = unhealthy
    S = { last50: [{ status: 'sent' }], sent24: 1, total24: 1, tmplFails: [] };
    raised = []; resolved = [];
    let r = await runSendHealthSweep();
    ok(r.healthy === false && raised.some(x => x.key === 'email_health:transport_none' && x.severity === 'P1'), 'sweep raises a P1 for the tripped condition');
    ok(resolved.includes('email_health:no_sends') && resolved.includes('email_health:bounce_rate'), 'sweep auto-resolves conditions that are not firing');

    // Healthy sweep raises nothing and resolves every condition.
    setTransport({ resend: true, from: 'MN <a@real.com>' });
    S = { last50: Array(10).fill({ status: 'sent' }), sent24: 10, total24: 10, tmplFails: [] };
    raised = []; resolved = [];
    r = await runSendHealthSweep();
    ok(r.healthy === true && raised.length === 0, 'healthy sweep raises no incident');
    ok(resolved.includes('email_health:transport_none'), 'healthy sweep resolves prior conditions');

    if (failures) { console.error(`\nEM-04 test: ${failures} FAIL`); process.exit(1); }
    console.log('\nEM-04 test: ALL PASSED');
})();
