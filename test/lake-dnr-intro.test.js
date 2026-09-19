'use strict';

// lake-dnr-intro (LAKE15) — pure unit test, no DB. Verifies the fact floor and
// that generated copy states only real DNR facts, varying by what's present.

const { dnrIntro, hasFacts } = require('../src/services/lake-dnr-intro');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

// Fully-enriched lake.
const gull = { name: 'Gull Lake', state: 'MN', county: 'Cass', region: 'Brainerd / Baxter',
    surface_acres: 10010, max_depth_ft: 80, mean_depth_ft: 30, water_clarity_ft: 12,
    public_accesses: 4, fish_species: ['Walleye', 'Northern Pike', 'Largemouth Bass'] };
const g = dnrIntro(gull);
ok(g.includes('10,010-acre'), 'states real acreage (comma-formatted)');
ok(g.includes('Cass County'), 'names the county');
ok(g.includes('80 feet') && g.includes('deep'), 'states max depth + descriptor');
ok(g.includes('12 feet'), 'states water clarity');
ok(g.includes('Walleye') && g.includes('Northern Pike and Largemouth Bass'), 'lists fish naturally');
ok(g.includes('4 public accesses'), 'states public accesses (plural)');
ok(/Minnesota DNR\.?$/.test(g.trim()), 'attributes the DNR as the source');

// Floor: acreage + fish only (no depth) still qualifies.
ok(hasFacts({ surface_acres: 500, fish_species: ['Walleye'] }) === true, 'floor: acreage + fish qualifies');
ok(dnrIntro({ name: 'X', surface_acres: 500, fish_species: ['Walleye'] }).includes('Anglers fish X for Walleye'), 'depth-less lake still gets fish sentence, no depth claim');
ok(!dnrIntro({ name: 'X', surface_acres: 500, fish_species: ['Walleye'] }).includes('deepest'), 'never claims depth it does not have');

// Below floor → empty (stays noindex).
ok(hasFacts({ surface_acres: 500 }) === false, 'acreage alone is below the floor');
ok(hasFacts({ max_depth_ft: 40 }) === false, 'depth without acreage is below the floor');
ok(dnrIntro({ name: 'X', surface_acres: 500 }) === '', 'below floor → empty string');
ok(dnrIntro(null) === '', 'null lake → empty string');

// Clarity of 0 (no Secchi reading) is not stated.
ok(!dnrIntro({ name: 'Y', surface_acres: 300, max_depth_ft: 20, water_clarity_ft: 0 }).includes('clarity'), 'clarity 0 is omitted, not stated as 0 ft');

// Single access → singular grammar.
ok(dnrIntro({ name: 'Z', surface_acres: 300, max_depth_ft: 20, public_accesses: 1 }).includes('is 1 public access on'), 'singular access grammar');

if (failures) { console.error(`\nlake-dnr-intro: ${failures} FAIL`); process.exit(1); }
console.log('\nlake-dnr-intro: ALL PASSED');
