'use strict';

// Directory-claim identity gate (Feature A3). An imported agent profile carries a
// license number from public records; the claimer must match it (+ last name)
// before we send the claim link. Agents with no license on file stay email-only.

const { _identity: id } = require('../src/controllers/claim.controller');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

const rec = { name: 'Lara Burnside', license_number: 'MN-40123456' };

// License normalization: case, dashes and spaces don't matter.
ok(id.normLicense('mn 40 12 34 56') === 'MN40123456', 'normLicense strips case/spaces/dashes');
ok(id.identityMatches(rec, '40123456MN', 'Lara Burnside') === false, 'reordered characters do NOT match (not a substring game)');
ok(id.identityMatches(rec, 'mn-40123456', 'Lara Burnside') === true, 'correct license (any formatting) + matching last name → pass');
ok(id.identityMatches(rec, 'MN40123456', 'lara BURNSIDE') === true, 'case-insensitive name match → pass');
ok(id.identityMatches(rec, 'MN40123456', 'Larry Burnside') === true, 'different first name, same last name → pass (license is the strong key)');
ok(id.identityMatches(rec, 'MN40123456', 'Lara Johnson') === false, 'right license but wrong last name → fail');
ok(id.identityMatches(rec, 'MN-99999999', 'Lara Burnside') === false, 'wrong license → fail');
ok(id.identityMatches(rec, '', 'Lara Burnside') === false, 'empty license → fail');

// No license on record → email-only legacy path (identity gate is a no-op pass).
ok(id.identityMatches({ name: 'Old Selfclaim', license_number: null }, '', '') === true, 'no license on file → email-only path (pass through)');
ok(id.identityMatches({ name: 'Old Selfclaim', license_number: '' }, 'anything', 'whoever') === true, 'blank license on file → email-only path');

// Name with a middle name / suffix: last token is what matters.
ok(id.identityMatches({ name: 'Lara M. Burnside', license_number: 'X1' }, 'x1', 'Lara Burnside') === true, 'record middle initial ignored, last token matches');

if (failures) { console.error(`\nclaim-identity: ${failures} FAIL`); process.exit(1); }
console.log('\nclaim-identity: ALL PASSED');
