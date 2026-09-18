'use strict';

// notifyAgentOfLead — the in-portal companion to the agent's new-lead email.
// Verifies the notification is written as a 'lead' type with a claim deep-link,
// and that it fails safe (no row, no throw) on bad input.

const pool = require('../src/database/pool');
let inserts = [];
pool.query = async (sql, params = []) => {
    if (/INSERT INTO agent_notifications/.test(sql)) {
        inserts.push({ agent_id: params[0], type: params[1], title: params[2], body: params[3], link: params[4] });
        return { rows: [{ id: 'notif-' + inserts.length }] };
    }
    return { rows: [] };
};

const { notifyAgentOfLead } = require('../src/services/agent-notify');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

(async () => {
    // Auto-route match on a named lake.
    inserts = [];
    const id = await notifyAgentOfLead('agent-1', { lead: { id: 'lead-9', target_lake: 'Gull Lake', first_name: 'Bret', lead_type: 'buyer' }, kind: 'matched' });
    ok(id === 'notif-1', 'returns the created notification id');
    const n = inserts[0];
    ok(n && n.type === 'lead', 'written as a lead-type notification');
    ok(/Gull Lake/.test(n.title), 'title names the lake');
    ok(/lead=lead-9/.test(n.link) && /claim=1/.test(n.link), 'link deep-links to the lead with the claim action open');
    ok(/Bret/.test(n.body) && /buyer/.test(n.body), 'body carries the buyer name + lead type');

    // Timed offer wording is claim-forward.
    inserts = [];
    await notifyAgentOfLead('agent-1', { lead: { id: 'lead-9', target_lake: 'Bald Eagle' }, kind: 'offer' });
    ok(/claim it/i.test(inserts[0].title) && /before it moves/i.test(inserts[0].body), 'offer kind reads "claim it before it moves to the next agent"');

    // No lake → still a valid alert (no broken "on ").
    inserts = [];
    await notifyAgentOfLead('agent-1', { lead: { id: 'lead-9' }, kind: 'matched' });
    ok(inserts.length === 1 && !/ on \b/.test(inserts[0].title) && /New lead/.test(inserts[0].title), 'no lake → clean "New lead" title, no dangling "on"');

    // Fail-safe: no lead id → no row, no throw.
    inserts = [];
    const none = await notifyAgentOfLead('agent-1', { lead: {}, kind: 'matched' });
    ok(none === null && inserts.length === 0, 'missing lead id → no notification, returns null');
    const none2 = await notifyAgentOfLead(null, { lead: { id: 'x' } });
    ok(none2 === null, 'missing agent id → returns null');

    if (failures) { console.error(`\nagent-notify-lead: ${failures} FAIL`); process.exit(1); }
    console.log('\nagent-notify-lead: ALL PASSED');
})().catch(e => { console.error('test error:', e.message); process.exit(2); });
