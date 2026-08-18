// Regression test for the AL-03 lifecycle backfill logic (deriveState).
//
// deriveState() assigns exactly one lifecycle_state to an existing agent row,
// first-match-wins in priority order: paid tier -> churned (had a sub, now free)
// -> free_live (published) -> dormant_draft (draft >21d) -> draft. Paying is
// keyed off membership code != 'free' (agents has no subscription_status). If
// this priority drifts, the backfill mis-tags agents and every sweep that later
// filters on the column inherits the error — so lock it here.
//
// Framework-free: `node test/lifecycle.test.js`.
const path = require('path');
const { deriveState, STATES } = require(path.join(__dirname, '..', 'src/services/lifecycle.js'));

let failures = 0;
const check = (name, cond) => { console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${name}`); if (!cond) failures++; };

const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString();

const CASES = [
    // [label, row, expected]
    ['paid tier (Prime) → paying',               { code: 'mn_lake_specialist' }, 'paying'],
    ['paid tier beats everything',               { code: 'top_agent', is_published: true, stripe_subscription_id: 'sub_x' }, 'paying'],
    ['had a sub, now free → churned',            { code: 'free', stripe_subscription_id: 'sub_1' }, 'churned'],
    ['churned beats published',                  { code: 'free', stripe_subscription_id: 'sub_1', is_published: true }, 'churned'],
    ['free + published → free_live',             { code: 'free', is_published: true }, 'free_live'],
    ['draft >21d, never paid → dormant_draft',   { code: 'free', profile_status: 'draft', created_at: daysAgo(30) }, 'dormant_draft'],
    ['draft <21d → draft',                       { code: 'free', profile_status: 'draft', created_at: daysAgo(3) }, 'draft'],
    ['draft, no created_at → draft',             { code: 'free', profile_status: 'draft' }, 'draft'],
    ['empty row → draft',                        {}, 'draft'],
    ['null code treated as free → draft',        { code: null }, 'draft'],
];

console.log('AL-03 deriveState priority:\n');
for (const [label, row, expected] of CASES) {
    const got = deriveState(row);
    check(`${label} (got ${got})`, got === expected);
    check(`  ${label} — result is a valid state`, STATES.includes(got));
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
