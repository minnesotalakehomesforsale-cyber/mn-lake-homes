'use strict';

// lake-ranking-pages — Minnesota lake leaderboards on pg-mem. Verifies ranking
// order, rank numbering, the fact floor (>= 5 lakes with the metric), exclusion
// of 0/null metric values, and value formatting.

const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => crypto.randomUUID() });
db.public.none(`CREATE TABLE lakes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, name TEXT, county TEXT, region TEXT,
    hero_image_url TEXT, surface_acres INT, max_depth_ft INT, water_clarity_ft NUMERIC, fish_species TEXT, status TEXT);`);
const memPool = new (db.adapters.createPg().Pool)();
const pool = require('../src/database/pool');
pool.query = (sql, params) => memPool.query(sql, params);

const rp = require('../src/services/lake-ranking-pages');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };
const add = (slug, name, acres, depth, clarity, status = 'published') =>
    memPool.query(`INSERT INTO lakes (slug,name,county,region,surface_acres,max_depth_ft,water_clarity_ft,fish_species,status)
                   VALUES ($1,$2,'Cass','Brainerd Lakes',$3,$4,$5,'["Walleye"]',$6)`,
        [slug, name, acres, depth, clarity, status]);

(async () => {
    // 6 published lakes with depth (indexable). Clarity only on 3 (below floor).
    await add('vermilion',   'Lake Vermilion',   39272, 76,  12);
    await add('mille-lacs',  'Mille Lacs',       132000, 42, null);
    await add('leech',       'Leech Lake',       103444, 56, 0);      // clarity 0 excluded
    await add('gull',        'Gull Lake',        10010, 80,  10);
    await add('whitefish',   'Whitefish Chain',  8000,  130, null);
    await add('bemidji',     'Lake Bemidji',     7000,  76,  8);
    await add('draft-deep',  'Draft Deep',       5000,  200, 20, 'draft');  // excluded (draft)

    // Deepest: 6 published lakes with depth → indexable, Whitefish (130) first.
    const d = await rp.rankingPage('deepest');
    ok(d && d.count === 6 && d.indexable === true, 'deepest: 6 published lakes with depth → indexable');
    ok(d.lakes[0].name === 'Whitefish Chain' && d.lakes[0].rank === 1, 'deepest: Whitefish (130 ft) ranked #1');
    ok(d.lakes[0].value === '130' && d.lakes[0].unit === 'ft', 'deepest: value + unit correct');
    ok(!d.lakes.some(l => l.name === 'Draft Deep'), 'deepest: draft lake excluded despite 200 ft');
    ok(d.lakes.map(l => l.rank).join(',') === '1,2,3,4,5,6', 'ranks are 1..n in order');
    ok(/Deepest Lakes in Minnesota/.test(d.h1) && d.canonicalPath === '/rankings/deepest', 'deepest: H1 + canonical');

    // Largest: Mille Lacs (132000) first, comma-formatted value.
    const lg = await rp.rankingPage('largest');
    ok(lg.lakes[0].name === 'Mille Lacs' && lg.lakes[0].value === '132,000', 'largest: Mille Lacs #1 with comma-formatted acres');

    // Clearest: only 3 lakes have clarity > 0 (Vermilion 12, Gull 10, Bemidji 8) → below floor.
    const cl = await rp.rankingPage('clearest');
    ok(cl.count === 3 && cl.indexable === false, 'clearest: 3 lakes with clarity → below fact floor (noindex)');
    ok(cl.lakes[0].name === 'Lake Vermilion' && !cl.lakes.some(l => l.name === 'Leech Lake'), 'clearest: ranked by clarity, 0-clarity Leech excluded');

    // Unknown slug.
    ok((await rp.rankingPage('warmest')) === null, 'unknown ranking slug → null');

    // listRankings reflects indexability.
    const list = await rp.listRankings();
    const byslug = Object.fromEntries(list.map(r => [r.slug, r]));
    ok(byslug.deepest.indexable === true && byslug.largest.indexable === true, 'listRankings: deepest + largest indexable');
    ok(byslug.clearest.indexable === false, 'listRankings: clearest below floor');

    if (failures) { console.error(`\nlake-ranking-pages: ${failures} FAIL`); process.exit(1); }
    console.log('\nlake-ranking-pages: ALL PASSED');
})().catch(e => { console.error('test error:', e.message); process.exit(2); });
