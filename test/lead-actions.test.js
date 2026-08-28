'use strict';

// EM-15 — the tokenised button actions behind the agent nudges.

const pool = require('../src/database/pool');
let marks = 0, strikes = 0;
let contactLogged = false;    // simulate whether the lead has first_contact_at
let feedbackClaimed = null;   // simulate "first answer wins": null until claimed
pool.query = async (sql, params = []) => {
    if (/UPDATE leads[\s\S]*first_contact_at = COALESCE/.test(sql)) { marks++; return { rowCount: 1, rows: [] }; }
    if (/UPDATE leads SET buyer_feedback = \$2/.test(sql)) {
        if (feedbackClaimed) return { rowCount: 0, rows: [] };
        feedbackClaimed = params[1]; return { rowCount: 1, rows: [{ id: params[0] }] };
    }
    if (/UPDATE agents SET response_strikes/.test(sql)) {
        // Two-signal rule: strike only if no contact was logged (EXISTS ... first_contact_at IS NULL).
        if (/first_contact_at IS NULL/.test(sql) && contactLogged) return { rowCount: 0, rows: [] };
        strikes++; return { rowCount: 1, rows: [] };
    }
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

    // EM-16 feedback: first answer wins; "not yet" (no contact logged) strikes + reroutes.
    rerouted = []; contactLogged = false;
    const notYet = await dispatch.perform({ action: 'feedback_not_yet', lead_id: 'L2', agent_id: 'a1' });
    ok(feedbackClaimed === 'not_yet' && strikes === 1 && rerouted.length === 1, '"not yet" with no logged contact: records, strikes, reroutes');
    ok(/different agent|find you someone/i.test(notYet.message), '"not yet" tells the buyer they\'re being rematched');
    // A second answer on the same (already-answered) lead is a no-op.
    const late = await dispatch.perform({ action: 'feedback_connected', lead_id: 'L2' });
    ok(/already recorded/i.test(late.message), 'a second feedback answer is ignored (first answer wins)');

    // Two-signal rule: "not yet" but contact WAS logged → reroute, but NO strike.
    feedbackClaimed = null; strikes = 0; rerouted = []; contactLogged = true;
    await dispatch.perform({ action: 'feedback_not_yet', lead_id: 'L3', agent_id: 'a1' });
    ok(strikes === 0 && rerouted.length === 1, '"not yet" WITH logged contact reroutes but does NOT strike (self-report needs a second signal)');

    if (failures) { console.error(`\nlead-actions: ${failures} FAIL`); process.exit(1); }
    console.log('\nlead-actions: ALL PASSED');
})();
