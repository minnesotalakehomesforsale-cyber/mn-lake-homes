// Regression test for hero-image reuse across town + lake pages.
//
// The bug this guards: src/data/town-content.js is re-applied to the tags table
// on EVERY boot (seedTownContent). At one point 43 towns drew from only 17
// images — mn-purple-sunset-marina was on 6 towns at once — so the /towns grid
// showed the same photo on card after card. The one-time dedupeSharedHeroes()
// pass couldn't help, because seedTownContent re-writes the duplicates after it
// runs. The only durable fix is: no two towns share a hero in the source data.
//
// This asserts, framework-free (`node test/unique-heroes.test.js`):
//   1. every town in town-content.js has a hero_image_url
//   2. no two towns share one
//   3. no two seed lakes share one (lakes-seed.js)
//   4. every referenced image actually exists in assets/images
//
// Adding a town/lake that reuses an existing photo — or points at a missing
// file — turns this red before it can ship.
const fs = require('fs');
const path = require('path');
const PROJECT = path.join(__dirname, '..');

let failures = 0;
const check = (name, cond) => { console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${name}`); if (!cond) failures++; };

const towns = require(path.join(PROJECT, 'src/data/town-content.js'));
const lakesRaw = require(path.join(PROJECT, 'src/database/lakes-seed.js'));
const lakes = Array.isArray(lakesRaw) ? lakesRaw : (lakesRaw.lakes || lakesRaw.default || []);

// Report duplicates within one dataset: returns "img [a, b]" lines for any hero
// used by 2+ rows.
function dupes(rows, label) {
    const by = {};
    rows.forEach(r => {
        const h = (r.hero_image_url || '').trim();
        if (h) (by[h] = by[h] || []).push(r.slug || r.name);
    });
    return Object.entries(by).filter(([, v]) => v.length > 1)
        .map(([img, v]) => `${label}: ${v.length}× ${img} [${v.join(', ')}]`);
}

// ── Towns ──────────────────────────────────────────────────────────────────
const townMissingHero = towns.filter(t => !(t.hero_image_url || '').trim()).map(t => t.slug);
check(`every town has a hero (${towns.length} towns)`, townMissingHero.length === 0);
if (townMissingHero.length) console.log('   missing hero:', townMissingHero.join(', '));

const townDupes = dupes(towns, 'town');
check('no two towns share a hero', townDupes.length === 0);
townDupes.forEach(d => console.log('   ' + d));

// ── Seed lakes ───────────────────────────────────────────────────────────────
if (lakes.length) {
    const lakeDupes = dupes(lakes, 'lake');
    check(`no two seed lakes share a hero (${lakes.length} lakes)`, lakeDupes.length === 0);
    lakeDupes.forEach(d => console.log('   ' + d));
} else {
    console.log('⚠  could not introspect lakes-seed export shape — skipping lake dup check');
}

// ── Every referenced image exists on disk ────────────────────────────────────
const refs = [...towns, ...lakes]
    .map(r => (r.hero_image_url || '').trim())
    .filter(Boolean);
const missingFiles = [...new Set(refs)].filter(url => {
    const rel = url.replace(/^\//, '');           // /assets/images/x.jpg -> assets/images/x.jpg
    return !fs.existsSync(path.join(PROJECT, rel));
});
check('every referenced hero file exists in assets/images', missingFiles.length === 0);
missingFiles.forEach(f => console.log('   MISSING FILE:', f));

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
