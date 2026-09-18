'use strict';

// lake-fish-pages (SEOP04) — "Best [Fish] Lakes in MN". Runs the real module on
// pg-mem: matches published lakes by DNR fish_species (JS-filtered), ranks by
// size, applies the fact floor (>= 3 lakes), and lists only indexable species.

const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => crypto.randomUUID() });
db.public.none(`CREATE TABLE lakes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, name TEXT, region TEXT, county TEXT,
    surface_acres INT, max_depth_ft INT, hero_image_url TEXT, fish_species TEXT, status TEXT);`);
const memPool = new (db.adapters.createPg().Pool)();
const pool = require('../src/database/pool');
pool.query = (sql, params) => memPool.query(sql, params);

const fp = require('../src/services/lake-fish-pages');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };
const add = (slug, name, acres, fish, status = 'published') =>
    memPool.query(`INSERT INTO lakes (slug,name,surface_acres,fish_species,status) VALUES ($1,$2,$3,$4,$5)`,
        [slug, name, acres, JSON.stringify(fish), status]);

(async () => {
    // 4 walleye lakes (one is a draft → excluded), 2 bass-only lakes.
    await add('mille-lacs', 'Mille Lacs', 132000, ['Walleye', 'Northern Pike']);
    await add('leech', 'Leech Lake', 111000, ['Walleye', 'Muskellunge']);
    await add('winnie', 'Lake Winnie', 56000, ['Walleye', 'Yellow Perch']);
    await add('gull', 'Gull Lake', 9400, ['Walleye', 'Largemouth Bass']);
    await add('draft-wae', 'Draft Walleye', 5000, ['Walleye'], 'draft');   // excluded
    await add('bass-a', 'Bass Pond A', 300, ['Largemouth Bass']);
    await add('bass-b', 'Bass Pond B', 200, ['Smallmouth Bass']);

    // Walleye: 4 published lakes → indexable, ranked by size (Mille Lacs first).
    const w = await fp.fishPage('walleye');
    ok(w && w.count === 4 && w.indexable === true, 'walleye: 4 published lakes → indexable');
    ok(w.lakes[0].slug === 'mille-lacs' && w.lakes[3].slug === 'gull', 'lakes ranked by surface acres (biggest first)');
    ok(/Best Walleye Lakes in Minnesota/.test(w.h1) && /4 Top Lakes/.test(w.seoTitle), 'H1 + SEO title reflect the count');
    ok(w.canonicalPath === '/fishing/walleye', 'canonical /fishing/walleye');

    // Bass: Gull (Largemouth) + bass-a + bass-b = 3 → indexable at the floor.
    const b = await fp.fishPage('bass');
    ok(b.count === 3 && b.indexable === true, 'bass matches both largemouth + smallmouth (3 lakes, at the floor)');

    // Muskie: only Leech = 1 → below the fact floor → noindex.
    const m = await fp.fishPage('muskie');
    ok(m.count === 1 && m.indexable === false, 'muskie: 1 lake → below fact floor (noindex)');

    // Unknown fish slug.
    ok((await fp.fishPage('shark')) === null, 'unknown fish slug → null');

    // listFish returns only indexable species (walleye + bass), not muskie/perch.
    const list = await fp.listFish();
    const slugs = list.map(f => f.slug);
    ok(slugs.includes('walleye') && slugs.includes('bass'), 'listFish includes walleye + bass');
    ok(!slugs.includes('muskie') && !slugs.includes('perch'), 'listFish excludes below-floor species');

    if (failures) { console.error(`\nlake-fish-pages: ${failures} FAIL`); process.exit(1); }
    console.log('\nlake-fish-pages: ALL PASSED');
})().catch(e => { console.error('test error:', e.message); process.exit(2); });
