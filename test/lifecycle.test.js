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
    ['billed (paid_membership_code) → paying',       { paid_membership_code: 'mn_lake_specialist' }, 'paying'],
    ['comped (tier_comped) → paying',                { tier_comped: true }, 'paying'],  // comp is intentional
    ['paid beats everything',                        { paid_membership_code: 'top_agent', is_published: true, has_paid: true }, 'paying'],
    ['paid before, now free → churned',              { has_paid: true }, 'churned'],
    ['churned beats published',                      { has_paid: true, is_published: true }, 'churned'],
    ['abandoned checkout (no payment) is NOT churned', { is_published: true /* sub id but no paid row */ }, 'free_live'],
    ['never paid, unpublished draft → draft',        { profile_status: 'draft', created_at: daysAgo(3) }, 'draft'],
    ['free + published → free_live',                 { is_published: true }, 'free_live'],
    ['draft >21d, never paid → dormant_draft',       { profile_status: 'draft', created_at: daysAgo(30) }, 'dormant_draft'],
    ['draft, no created_at → draft',                 { profile_status: 'draft' }, 'draft'],
    ['empty row → draft',                            {}, 'draft'],
];

console.log('AL-03 deriveState priority:\n');
for (const [label, row, expected] of CASES) {
    const got = deriveState(row);
    check(`${label} (got ${got})`, got === expected);
    check(`  ${label} — result is a valid state`, STATES.includes(got));
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
