'use strict';

// EM-15 — the tokenised button actions behind the agent nudges.

const pool = require('../src/database/pool');
let marks = 0;
pool.query = async (sql) => {
    if (/UPDATE leads[\s\S]*first_contact_at = COALESCE/.test(sql)) { marks++; return { rowCount: 1, rows: [] }; }
    return { rows: [] };
};

// Stub the reroute so pass_back doesn't need the full router.
const reroute = require('../src/services/reroute-lead');
let rerouted = [];
reroute.rerouteLead = async (o) => { rerouted.push(o); return { rerouted: true, agentId: 'a2' }; };

const dispatch = require('../src/services/action-dispatch');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

(async () => {
    const d = await dispatch.describe({ action: 'mark_contacted' });
    ok(d.confirmLabel && /contact/i.test(d.title), 'mark_contacted describes a confirm page');

    const m = await dispatch.perform({ action: 'mark_contacted', lead_id: 'L1' });
    ok(marks === 1 && /contacted/i.test(m.message), 'mark_contacted stamps first_contact_at and confirms');

    const pb = await dispatch.perform({ action: 'pass_back', lead_id: 'L1', agent_id: 'a1' });
    ok(rerouted.length === 1 && rerouted[0].leadId === 'L1' && /rerouted/i.test(pb.message), 'pass_back reroutes the lead');

    const unknown = await dispatch.perform({ action: 'nope' });
    ok(/no longer available/i.test(unknown.message), 'an unknown action degrades gracefully');

    if (failures) { console.error(`\nlead-actions: ${failures} FAIL`); process.exit(1); }
    console.log('\nlead-actions: ALL PASSED');
})();
