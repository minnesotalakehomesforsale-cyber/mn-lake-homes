'use strict';

// Block E — the ladder sweep acts on the governor: sends the right rung, sets
// state, and excludes an agent with no lake (never a broken [Lake Name]).

const pool = require('../src/database/pool');

let agentRow, lakeRow, updates = [];
pool.query = async (sql, params = []) => {
    if (/FROM agents a JOIN users u/.test(sql)) return { rows: agentRow ? [agentRow] : [] };
    if (/FROM lakes l/.test(sql)) return { rows: lakeRow ? [lakeRow] : [] };
    if (/UPDATE agents SET/.test(sql)) { updates.push({ sql, params }); return { rowCount: 1, rows: [] }; }
    return { rows: [] };
};

const email = require('../src/services/email');
let sends = [];
email.sendLadderPhotos = async (o) => { sends.push(['photos', o]); return {}; };
email.sendLadderQuestion = async (o) => { sends.push(['question', o]); return {}; };
email.sendLadderFeatured = async (o) => { sends.push(['featured', o]); return {}; };

const { runLadderSweep } = require('../src/services/ladder-sweep');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };
const daysAgo = d => new Date(Date.now() - d * 864e5).toISOString();

(async () => {
    // Fresh published agent (day 6), has a lake → rung 1 sent + state advanced.
    agentRow = { id: 'ag1', user_id: 'u1', email: 'a@x.com', first_name: 'Dana', ladder_rung: 0, ladder_status: 'active', last_rung_sent_at: null, last_rung_resent: false, last_response_at: null, last_contribution_at: null, published_at: daysAgo(6) };
    lakeRow = { name: 'Gull Lake', slug: 'gull-lake' };
    sends = []; updates = [];
    await runLadderSweep();
    ok(sends.length === 1 && sends[0][0] === 'photos', 'sends rung 1 (photos) to a day-6 agent');
    ok(sends[0][1].replyTo && /replies\+/.test(sends[0][1].replyTo), 'the send carries a plus-addressed Reply-To');
    ok(updates.some(u => /ladder_rung = \$2/.test(u.sql) && u.params[1] === 1), 'advances ladder state to rung 1');

    // Same agent, but no lake resolvable → skipped, no send, no state change.
    lakeRow = null; sends = []; updates = [];
    await runLadderSweep();
    ok(sends.length === 0 && updates.length === 0, 'agent with no lake is skipped (no broken [Lake Name])');

    // Ignored rung 1, 31 days on → re-send the SAME rung (not rung 2).
    agentRow = { ...agentRow, ladder_rung: 1, ladder_status: 'paused', last_rung_sent_at: daysAgo(31), last_rung_resent: false, published_at: daysAgo(37) };
    lakeRow = { name: 'Gull Lake', slug: 'gull-lake' }; sends = []; updates = [];
    await runLadderSweep();
    ok(sends.length === 1 && sends[0][0] === 'photos', 're-sends rung 1 after 30d of no response (never rung 2)');
    ok(updates.some(u => /last_rung_resent = TRUE/.test(u.sql)), 'marks the one re-send used');

    // Re-sent already, still silent 30d later → stop.
    agentRow = { ...agentRow, last_rung_resent: true, last_rung_sent_at: daysAgo(31) };
    sends = []; updates = [];
    await runLadderSweep();
    ok(sends.length === 0 && updates.some(u => /ladder_status = 'stopped'/.test(u.sql)), 'stops the ladder after the re-send goes unanswered');

    if (failures) { console.error(`\nladder-sweep: ${failures} FAIL`); process.exit(1); }
    console.log('\nladder-sweep: ALL PASSED');
})();
