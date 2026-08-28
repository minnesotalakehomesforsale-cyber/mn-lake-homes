'use strict';

// EM-06 end-to-end: the send-health monitor lost its own cooldown, so its alerts
// now depend entirely on the incident router. Prove the whole path with the REAL
// router + REAL monitor (only pool + the P1 email are stubbed): a forced transport
// failure produces exactly one P1 with the right body; a second sweep within the
// hour stays quiet; clearing the fault auto-resolves; and it can alert again.

const pool = require('../src/database/pool');

// In-memory incidents table (same shape the router expects).
let idSeq = 1, store = [];
const findOpen = key => store.find(r => r.incident_key === key && r.status === 'open');
pool.query = async (sql, params = []) => {
    if (/INSERT INTO incidents/.test(sql)) {
        const [key, severity, title, detail, effect, checkFirst, adminLink] = params;
        let r = findOpen(key);
        if (r) { r.occurrences++; r.last_seen_at = new Date().toISOString(); r.title = title; r.detail = detail; r.effect = effect; r.check_first = checkFirst; r.admin_link = adminLink; }
        else { r = { id: idSeq++, incident_key: key, severity, title, detail, effect, check_first: checkFirst, admin_link: adminLink, status: 'open', occurrences: 1, notify_count: 0, first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), last_notified_at: null, resolved_at: null }; store.push(r); }
        return { rows: [{ ...r }] };
    }
    if (/UPDATE incidents SET notify_count = notify_count \+ 1, last_notified_at = NOW\(\) WHERE id = \$1/.test(sql)) {
        const r = store.find(x => x.id === params[0]); if (r) { r.notify_count++; r.last_notified_at = new Date().toISOString(); } return { rowCount: 1 };
    }
    if (/UPDATE incidents SET status = 'resolved'/.test(sql)) {
        const r = findOpen(params[0]); if (r) { r.status = 'resolved'; r.resolved_at = new Date().toISOString(); } return { rowCount: r ? 1 : 0 };
    }
    // email_log reads used by checkSendHealth — quiet log so only transport drives it.
    if (/INTERVAL '24 hours'/.test(sql)) return { rows: [{ sent: 0, total: 0 }] };
    return { rows: [] };   // last-50 sample + template-fail groups
};

// Capture P1 emails; the digest isn't used here.
const email = require('../src/services/email');
let p1 = [];
email.sendIncidentAlert = async o => { p1.push(o); return {}; };

const { runSendHealthSweep } = require('../src/services/email-health');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

function forceTransportDown() { delete process.env.RESEND_API_KEY; delete process.env.GMAIL_USER; delete process.env.GMAIL_APP_PASSWORD; delete process.env.EMAIL_FROM; }
function forceTransportUp() { process.env.RESEND_API_KEY = 'test'; process.env.EMAIL_FROM = 'MN <a@real.com>'; }

(async () => {
    // Fault → exactly one P1 with the right body.
    forceTransportDown();
    p1 = [];
    await runSendHealthSweep();
    ok(p1.length === 1, 'forced transport failure produces exactly one P1');
    ok(/Email —/.test(p1[0].title) && /reaching people/.test(p1[0].effect || ''), 'P1 body states what broke + the user-visible effect');
    ok(!!findOpen('email_health:transport_none'), 'the incident is open');

    // Second sweep within the hour → no second email (router dedupe, no cooldown here).
    await runSendHealthSweep();
    ok(p1.length === 1, 'a second sweep within the hour does not re-email');

    // Clear the fault → auto-resolve with nobody touching it.
    forceTransportUp();
    p1 = [];
    await runSendHealthSweep();
    ok(!findOpen('email_health:transport_none'), 'clearing the condition auto-resolves the incident');
    ok(p1.length === 0, 'a healthy sweep emails nothing');

    // Fault returns → alerts again (resolution re-armed the alert).
    forceTransportDown();
    await runSendHealthSweep();
    ok(p1.length === 1, 'the fault returning alerts again after auto-resolve');

    if (failures) { console.error(`\nincident-health-e2e: ${failures} FAIL`); process.exit(1); }
    console.log('\nincident-health-e2e: ALL PASSED');
})();
