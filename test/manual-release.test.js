// Regression test for T141 manual-release guardrails (src/services/manual-release.js).
// The endpoint enforces these too, but a hand-placed sales tool with a hard cap
// and a "grade C is never eligible" rule deserves the invariants pinned in
// isolation. Framework-free: `node test/manual-release.test.js` (npm run test:manual).
const path = require('path');
const {
    MANUAL_ASSIGNMENT_CAP, ACCEPT_SLA_HOURS,
    canManuallyRelease, atCap, acceptToken, verifyAcceptToken, isOfferExpired,
} = require(path.join(__dirname, '..', 'src/services/manual-release.js'));

let failures = 0;
const check = (name, cond) => { console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${name}`); if (!cond) failures++; };
const ok = (o) => o.ok === true;
const why = (o) => o.reason;

console.log(`cap=${MANUAL_ASSIGNMENT_CAP}, sla=${ACCEPT_SLA_HOURS}h\n`);

// ---- eligibility guardrails ----
console.log('Eligibility:');
const base = { leadGrade: 'A', held: true, agentIsFreeTier: true, agentCount: 0 };
check('grade A, held, free, 0 → eligible', ok(canManuallyRelease(base)));
check('grade B, held, free, 1 → eligible', ok(canManuallyRelease({ ...base, leadGrade: 'B', agentCount: 1 })));
check('grade C → never eligible', why(canManuallyRelease({ ...base, leadGrade: 'C' })) === 'grade_not_eligible');
check('grade Unqualified → not eligible', why(canManuallyRelease({ ...base, leadGrade: 'Unqualified' })) === 'grade_not_eligible');
check('not held → not eligible', why(canManuallyRelease({ ...base, held: false })) === 'not_held');
check('paying agent → not eligible', why(canManuallyRelease({ ...base, agentIsFreeTier: false })) === 'agent_not_free_tier');
check('agent at cap (2) → not eligible', why(canManuallyRelease({ ...base, agentCount: 2 })) === 'agent_at_cap');
check('agent over cap (3) → not eligible', why(canManuallyRelease({ ...base, agentCount: 3 })) === 'agent_at_cap');

// ---- cap boundary ----
console.log('\nCap boundary:');
check('atCap(0) false', atCap(0) === false);
check('atCap(1) false', atCap(1) === false);
check('atCap(2) true', atCap(2) === true);

// ---- signed accept token ----
console.log('\nAccept token:');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const tok = acceptToken('lead-1', 'agent-1');
check('valid token verifies', verifyAcceptToken('lead-1', 'agent-1', tok) === true);
const flipped = tok.slice(0, -1) + (tok.slice(-1) === 'a' ? 'b' : 'a'); // guaranteed different last char
check('tampered token rejected', verifyAcceptToken('lead-1', 'agent-1', flipped) === false);
check('wrong lead rejected', verifyAcceptToken('lead-2', 'agent-1', tok) === false);
check('wrong agent rejected', verifyAcceptToken('lead-1', 'agent-2', tok) === false);
check('empty token rejected', verifyAcceptToken('lead-1', 'agent-1', '') === false);

// ---- 24h acceptance SLA ----
console.log('\nAcceptance SLA:');
const now = Date.parse('2026-01-02T00:00:00Z');
check('offered 1h ago → not expired', isOfferExpired('2026-01-01T23:00:00Z', now) === false);
check('offered exactly 24h ago → not expired (boundary)', isOfferExpired('2026-01-01T00:00:00Z', now) === false);
check('offered 25h ago → expired', isOfferExpired('2026-01-01T00:00:00.000Z', now + 3600 * 1000) === true);
check('null offer time → not expired', isOfferExpired(null, now) === false);

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
