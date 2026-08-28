'use strict';

// EM-06 — incident router: severity tiers, dedupe on key, hourly P2 batch,
// auto-resolve, and the "mute after 5 P1 emails until resolved" rule.

const pool = require('../src/database/pool');

// In-memory stand-in for the incidents table.
let idSeq = 1;
let store = [];
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
        const r = store.find(x => x.id === params[0]); if (r) { r.notify_count++; r.last_notified_at = new Date().toISOString(); } return { rowCount: r ? 1 : 0 };
    }
    if (/UPDATE incidents SET status = 'resolved'/.test(sql)) {
        const r = findOpen(params[0]); if (r) { r.status = 'resolved'; r.resolved_at = new Date().toISOString(); } return { rowCount: r ? 1 : 0 };
    }
    if (/SELECT \* FROM incidents/.test(sql) && /severity = 'P2'/.test(sql)) {
        const rows = store.filter(r => r.status === 'open' && r.severity === 'P2'
            && (!r.last_notified_at || new Date(r.last_seen_at) > new Date(r.last_notified_at)));
        return { rows: rows.map(r => ({ ...r })) };
    }
    if (/UPDATE incidents SET notify_count = notify_count \+ 1, last_notified_at = NOW\(\) WHERE id = ANY/.test(sql)) {
        const ids = params[0]; for (const r of store) if (ids.includes(r.id)) { r.notify_count++; r.last_notified_at = new Date().toISOString(); } return { rowCount: ids.length };
    }
    return { rows: [] };
};

// Capture the two incident emails instead of sending.
const email = require('../src/services/email');
let p1 = [], p2 = [];
email.sendIncidentAlert = async o => { p1.push(o); return {}; };
email.sendIncidentDigest = async o => { p2.push(o); return {}; };

const incidents = require('../src/services/incidents');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

(async () => {
    // P1 — first raise emails; a second raise within the hour dedupes.
    await incidents.raise({ key: 'k:a', severity: 'P1', title: 'Lead form 5xx', effect: 'Leads are lost', checkFirst: 'logs' });
    ok(p1.length === 1, 'P1 first raise emails once');
    await incidents.raise({ key: 'k:a', severity: 'P1', title: 'Lead form 5xx' });
    ok(p1.length === 1, 'P1 second raise within the hour does not re-email');
    ok(findOpen('k:a').occurrences === 2, 'repeat raise increments occurrences (dedupe on key)');

    // Resolve, then raise again → a fresh open incident emails again.
    await incidents.resolve('k:a');
    ok(!findOpen('k:a'), 'resolve closes the open incident');
    await incidents.raise({ key: 'k:a', severity: 'P1', title: 'Lead form 5xx again' });
    ok(p1.length === 2, 'a new incident after resolve emails again');

    // P2 — raise never emails; the hourly batch sends exactly one digest.
    p2 = [];
    for (let i = 0; i < 20; i++) await incidents.raise({ key: 'k:b', severity: 'P2', title: 'No agent on Gull Lake' });
    ok(p2.length === 0, 'P2 raise never emails immediately');
    let r = await incidents.runP2Batch();
    ok(p2.length === 1 && r.count === 1, 'P2 batch sends exactly one digest');
    ok(p2[0].incidents[0].occurrences === 20, '20 firings → one digest row listing 20 occurrences');
    await incidents.runP2Batch();
    ok(p2.length === 1, 'a second batch with nothing new sends no email');

    // P3 — recorded, never emailed, never in the P2 batch.
    p1 = []; p2 = [];
    await incidents.raise({ key: 'k:c', severity: 'P3', title: 'New agent signup' });
    await incidents.runP2Batch();
    ok(p1.length === 0 && p2.length === 0, 'P3 produces zero immediate emails');

    // Mute after 5 emails until resolved.
    p1 = [];
    const inc = { id: idSeq++, incident_key: 'k:d', severity: 'P1', title: 'DB errors', status: 'open', occurrences: 9, notify_count: 4, last_notified_at: new Date(Date.now() - 2 * 3600e3).toISOString(), last_seen_at: new Date().toISOString() };
    store.push(inc);
    await incidents.raise({ key: 'k:d', severity: 'P1', title: 'DB errors' });          // 5th email — flagged
    ok(p1.length === 1 && p1[0].repeated === true, '5th P1 email is flagged as repeated');
    inc.last_notified_at = new Date(Date.now() - 2 * 3600e3).toISOString();               // eligible by time
    await incidents.raise({ key: 'k:d', severity: 'P1', title: 'DB errors' });            // notify_count now 5 → muted
    ok(p1.length === 1, 'after 5 emails the P1 goes quiet until resolved');

    if (failures) { console.error(`\nincidents: ${failures} FAIL`); process.exit(1); }
    console.log('\nincidents: ALL PASSED');
})();
