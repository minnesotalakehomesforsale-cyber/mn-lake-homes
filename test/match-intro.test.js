'use strict';

// EM-24 — the shared match-intro call site fires EXACTLY ONCE per routed lead,
// no matter how many routing paths touch it (auto-route, manual accept, admin
// assign all call the same function). The claim is atomic on match_intro_at.

const pool = require('../src/database/pool');

const leads = { 'lead-1': { email: 'buyer@x.com', first_name: 'Sam', target_lake: 'Gull Lake', match_intro_at: null } };
pool.query = async (sql, params = []) => {
    if (/UPDATE leads SET match_intro_at = NOW\(\)/.test(sql)) {
        const l = leads[params[0]];
        if (l && !l.match_intro_at) { l.match_intro_at = new Date().toISOString(); return { rowCount: 1, rows: [{ email: l.email, first_name: l.first_name, target_lake: l.target_lake }] }; }
        return { rowCount: 0, rows: [] };
    }
    if (/FROM agents a WHERE a\.id/.test(sql)) return { rows: [{ user_id: 'u1', display_name: 'Dana Smith', brokerage_name: 'Northland', phone_public: '218-555-0100', email_public: 'dana@x.com', bio: 'bio', city: 'Nisswa', years_experience: 12, specialties: '["waterfront"]' }] };
    if (/FROM lakes l/.test(sql)) return { rows: [{ name: 'Round Lake' }] };
    return { rows: [] };
};

const email = require('../src/services/email');
let sent = [];
email.sendLeadAgentMatched = async (o) => { sent.push(o); return {}; };

const { sendMatchIntro } = require('../src/services/match-intro');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

(async () => {
    // First routing path sends the intro.
    let r = await sendMatchIntro({ leadId: 'lead-1', agentId: 'agent-1' });
    ok(r.sent === true && sent.length === 1, 'first routing path sends exactly one intro');
    ok(sent[0].to === 'buyer@x.com' && sent[0].agent_full_name === 'Dana Smith' && sent[0].lake_name === 'Gull Lake', 'the intro carries the buyer + agent + lake');

    // A second path (e.g. admin assign after auto-route) must NOT double-send.
    r = await sendMatchIntro({ leadId: 'lead-1', agentId: 'agent-1' });
    ok(r.skipped === true && r.reason === 'already_sent' && sent.length === 1, 'a second routing path does not double-send (exactly one intro per lead)');

    // Missing ids / no email → skip cleanly.
    ok((await sendMatchIntro({ leadId: null, agentId: 'a' })).skipped === true, 'missing ids skip cleanly');

    if (failures) { console.error(`\nmatch-intro: ${failures} FAIL`); process.exit(1); }
    console.log('\nmatch-intro: ALL PASSED');
})();
