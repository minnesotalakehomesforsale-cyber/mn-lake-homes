'use strict';

// county-pages — the SEO county-hub data engine. Runs the real module SQL on
// pg-mem: aggregates published lakes by county, applies the fact floor, and
// resolves a county by slug with its lakes + linked towns.

const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => crypto.randomUUID() });
db.public.none(`
  CREATE TABLE lakes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, name TEXT, state TEXT, region TEXT,
    county TEXT, status TEXT, hero_image_url TEXT, surface_acres INT, max_depth_ft INT, dow_number TEXT,
    intro_text TEXT, description TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
  CREATE TABLE tags (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, name TEXT, active BOOLEAN DEFAULT TRUE);
  CREATE TABLE lake_tags (lake_id UUID, tag_id UUID);
`);
const memPool = new (db.adapters.createPg().Pool)();
const pool = require('../src/database/pool');
pool.query = (sql, params) => memPool.query(sql, params);

const cp = require('../src/services/county-pages');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

(async () => {
    // Crow Wing: 2 published lakes (Gull, Pelican) → indexable. Cass: 1 published → below floor.
    // Also a draft lake (excluded) and an out-of-state lake (excluded).
    const mk = (slug, name, county, status, hero, acres, state = 'MN') =>
        memPool.query(`INSERT INTO lakes (slug,name,county,status,hero_image_url,surface_acres,state,intro_text) VALUES ($1,$2,$3,$4,$5,$6,$7,'x')`,
            [slug, name, county, status, hero, acres, state]);
    await mk('gull-lake', 'Gull Lake', 'Crow Wing', 'published', 'h.jpg', 9400);
    await mk('pelican-lake', 'Pelican Lake', 'Crow Wing', 'published', '', 8000);
    await mk('draft-lake', 'Draft Lake', 'Crow Wing', 'draft', 'h.jpg', 500);   // excluded (draft)
    await mk('cass-lake', 'Cass Lake', 'Cass', 'published', 'h.jpg', 15000);
    await mk('border-lake', 'Border Lake', 'Douglas WI', 'published', 'h.jpg', 100, 'WI'); // excluded (not MN)

    // A town linked to a Crow Wing lake.
    const gull = (await memPool.query(`SELECT id FROM lakes WHERE slug='gull-lake'`)).rows[0].id;
    await memPool.query(`INSERT INTO tags (id, slug, name) VALUES (gen_random_uuid(),'brainerd','Brainerd')`);
    const bt = (await memPool.query(`SELECT id FROM tags WHERE slug='brainerd'`)).rows[0].id;
    await memPool.query(`INSERT INTO lake_tags (lake_id, tag_id) VALUES ($1,$2)`, [gull, bt]);

    // ── listCounties ──
    const list = await cp.listCounties();
    const cw = list.find(c => c.slug === 'crow-wing');
    const cass = list.find(c => c.slug === 'cass');
    ok(cw && cw.lake_count === 2 && cw.indexable === true, 'Crow Wing: 2 published lakes → indexable');
    ok(cass && cass.lake_count === 1 && cass.indexable === false, 'Cass: 1 lake → below fact floor (noindex)');
    ok(!list.find(c => /douglas/.test(c.slug || '')), 'out-of-state (WI) county excluded');
    ok(!list.some(c => c.lake_count > 2), 'draft lake not counted (Crow Wing stays 2, not 3)');

    // ── countyData ──
    const d = await cp.countyData('crow-wing');
    ok(d && d.county === 'Crow Wing' && d.lakeCount === 2, 'countyData returns the county + its 2 lakes');
    ok(d.lakes[0].slug === 'gull-lake', 'lakes ordered: hero + larger surface first (Gull leads)');
    ok(d.towns.length === 1 && d.towns[0].slug === 'brainerd', 'linked towns surfaced for cross-linking');
    ok(/Crow Wing County, MN/.test(d.seoTitle) && /2 lakes/i.test(d.seoDescription), 'SEO title + description built from live counts');
    ok(d.indexable === true, 'indexable flag set from the fact floor');
    ok((await cp.countyData('nowhere')) === null, 'unknown county slug → null');

    // ── slug helper ──
    ok(cp.countySlug('Otter Tail') === 'otter-tail' && cp.countySlug('St. Louis') === 'st-louis', 'countySlug normalizes names');
    ok(cp.countySlug('Crow Wing County') === 'crow-wing', 'countySlug drops a trailing "County"');

    if (failures) { console.error(`\ncounty-pages: ${failures} FAIL`); process.exit(1); }
    console.log('\ncounty-pages: ALL PASSED');
})().catch(e => { console.error('test error:', e.message); process.exit(2); });
