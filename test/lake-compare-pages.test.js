'use strict';

// lake-compare-pages (SEOP03) — lake-vs-lake comparisons on pg-mem. Verifies the
// fact floor (both lakes need acreage + depth AND the same region), the curated
// consecutive-by-size pairing, and canonical (order-independent) pair slugs.

const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => crypto.randomUUID() });
db.public.none(`CREATE TABLE lakes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, name TEXT, region TEXT, county TEXT,
    hero_image_url TEXT, surface_acres INT, max_depth_ft INT, mean_depth_ft INT, water_clarity_ft NUMERIC,
    shoreline_miles NUMERIC, public_accesses INT, fish_species TEXT, status TEXT);`);
const memPool = new (db.adapters.createPg().Pool)();
const pool = require('../src/database/pool');
pool.query = (sql, params) => memPool.query(sql, params);

const cp = require('../src/services/lake-compare-pages');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };
const add = (slug, name, region, acres, depth, fish, status = 'published') =>
    memPool.query(`INSERT INTO lakes (slug,name,region,surface_acres,max_depth_ft,fish_species,status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [slug, name, region, acres, depth, fish ? JSON.stringify(fish) : null, status]);

(async () => {
    // Brainerd region: 3 fact-complete lakes → 2 consecutive pairs (by size).
    await add('gull-lake', 'Gull Lake', 'Brainerd / Baxter', 9400, 80, ['Walleye', 'Northern Pike']);
    await add('whitefish', 'Whitefish Chain', 'Brainerd / Baxter', 8000, 130, ['Muskellunge']);
    await add('pelican', 'Pelican Lake', 'Brainerd / Baxter', 4800, 104, ['Walleye']);
    // A lake missing depth → NOT fact-complete → excluded from pairs.
    await add('nofact', 'No Fact Lake', 'Brainerd / Baxter', 3000, null, null);
    // Different region + a draft → never paired across the boundary.
    await add('carlos', 'Lake Carlos', 'Alexandria', 2600, 46, ['Walleye']);
    await add('draft-lk', 'Draft Lake', 'Brainerd / Baxter', 5000, 40, null, 'draft');

    const pairs = await cp.listComparisons();
    const slugs = pairs.map(p => p.slug).sort();
    ok(pairs.length === 2, 'Brainerd region yields 2 consecutive-by-size pairs (3 fact-complete lakes)');
    ok(slugs.includes('gull-lake-vs-whitefish'), 'top pair: Gull (9400) vs Whitefish (8000)');
    ok(slugs.includes('pelican-vs-whitefish'), 'next pair: Whitefish (8000) vs Pelican (4800)');
    ok(!pairs.some(p => p.a === 'nofact' || p.b === 'nofact'), 'lake missing depth is excluded (fact floor)');
    ok(!pairs.some(p => p.a === 'carlos' || p.b === 'carlos'), 'no cross-region pairing (Alexandria stays out)');

    const d = await cp.comparePage('gull-lake-vs-whitefish');
    ok(d && d.indexable === true, 'fact-complete same-region pair → indexable');
    ok(d.canonicalPath === '/compare/gull-lake-vs-whitefish', 'canonical path is the sorted pair');
    ok(d.biggerName === 'Gull Lake' && d.deeperName === 'Whitefish Chain', 'derives bigger + deeper lake correctly');
    ok(d.metrics.find(m => m.label === 'Max depth').a === '80 ft', 'metric row formats depth');

    // Reverse order resolves to the same data but flags non-canonical (→ redirect).
    const rev = await cp.comparePage('whitefish-vs-gull-lake');
    ok(rev && rev.isCanonical === false && rev.canonicalSlug === 'gull-lake-vs-whitefish', 'reverse order → non-canonical, points at sorted slug');

    // Cross-region pair resolves but is NOT indexable.
    const x = await cp.comparePage(cp.pairSlug('gull-lake', 'carlos'));
    ok(x && x.indexable === false, 'cross-region pair is not indexable');

    ok((await cp.comparePage('gull-lake-vs-nowhere')) === null, 'unknown lake in pair → null');
    ok((await cp.comparePage('just-one-slug')) === null, 'malformed pair slug → null');

    if (failures) { console.error(`\nlake-compare-pages: ${failures} FAIL`); process.exit(1); }
    console.log('\nlake-compare-pages: ALL PASSED');
})().catch(e => { console.error('test error:', e.message); process.exit(2); });
