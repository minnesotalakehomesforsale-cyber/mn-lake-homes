'use strict';

// EM-17 — the ladder governor (pure decision logic) + reply-token round-trip.

process.env.UNSUB_SECRET = 'ladder-test-secret';

const { nextLadderAction } = require('../src/services/ladder-governor');
const { ladderReplyAddress, parseReplyToken } = require('../src/services/ladder-reply');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

const NOW = new Date('2026-08-28T00:00:00Z').getTime();
const daysAgo = d => new Date(NOW - d * 864e5).toISOString();
const base = { ladder_rung: 0, ladder_status: 'active', last_rung_sent_at: null, last_rung_resent: false, last_response_at: null, last_contribution_at: null };
const act = (a, pub) => nextLadderAction(a, pub, NOW);

// Rung 1 timing.
ok(act(base, daysAgo(3)).action === 'wait', 'no rung before day 5');
ok(act(base, daysAgo(6)).action === 'send' && act(base, daysAgo(6)).rung === 1, 'rung 1 sends at day 5+');

// THE acceptance: ignore rung 1 → never rung 2.
const ignored = { ...base, ladder_rung: 1, last_rung_sent_at: daysAgo(10), last_response_at: null };
ok(act(ignored, daysAgo(15)).action === 'wait', 'no response to rung 1 → wait (not rung 2), within 30d');
const ignored30 = { ...ignored, last_rung_sent_at: daysAgo(31) };
const r = act(ignored30, daysAgo(36));
ok(r.action === 'resend' && r.rung === 1, 'no response after 30d → RE-SEND rung 1 (never rung 2)');
const ignoredResent = { ...ignored30, last_rung_resent: true };
ok(act(ignoredResent, daysAgo(36)).action === 'stop', 'still no response after the re-send → stop permanently');

// The other acceptance: reply to rung 1 → rung 2 no sooner than 7 days later.
const replied = { ...base, ladder_rung: 1, last_rung_sent_at: daysAgo(6), last_response_at: daysAgo(5) };
ok(act(replied, daysAgo(6)).action === 'wait', 'replied to rung 1 but <7 days since it was sent → wait');
const replied7 = { ...base, ladder_rung: 1, last_rung_sent_at: daysAgo(8), last_response_at: daysAgo(7) };
const r2 = act(replied7, daysAgo(13));
ok(r2.action === 'send' && r2.rung === 2, 'replied + ≥7 days + day-12 reached → rung 2');

// Skip while still publishing a recent contribution.
const contributing = { ...replied7, last_contribution_at: daysAgo(3) };
ok(act(contributing, daysAgo(13)).action === 'wait', 'recent contribution → do not stack a new ask');

// Rung 2 → rung 4 (skips 3); ladder completes after 4.
const afterR2 = { ...base, ladder_rung: 2, last_rung_sent_at: daysAgo(8), last_response_at: daysAgo(7) };
ok(act(afterR2, daysAgo(22)).rung === 4, 'rung 2 answered → rung 4 (3 is out of scope)');
const afterR4 = { ...base, ladder_rung: 4, last_rung_sent_at: daysAgo(8), last_response_at: daysAgo(7) };
ok(act(afterR4, daysAgo(40)).action === 'wait' && act(afterR4, daysAgo(40)).reason === 'ladder_complete', 'ladder completes after rung 4');

// stopped stays stopped.
ok(act({ ...base, ladder_status: 'stopped' }, daysAgo(100)).reason === 'stopped', 'a stopped ladder never sends');

// Reply-token round-trip + tamper rejection.
const addr = ladderReplyAddress('agent-123', 2);
ok(/replies\+[^@]+@/.test(addr), 'reply address is plus-addressed');
const parsed = parseReplyToken(`Someone <${addr}>`);
ok(parsed && parsed.agentId === 'agent-123' && parsed.rung === 2, 'reply token round-trips agentId + rung');
ok(parseReplyToken(addr.replace(/\.[a-f0-9]{16}@/, '.0000000000000000@')) === null, 'a tampered signature is rejected');

if (failures) { console.error(`\nladder: ${failures} FAIL`); process.exit(1); }
console.log('\nladder: ALL PASSED');
