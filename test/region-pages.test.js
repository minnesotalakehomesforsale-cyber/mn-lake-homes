'use strict';

// region-pages (SEOP06) — "Lakes Area" hubs. Real SQL on pg-mem: groups published
// lakes by region, applies the fact floor, resolves by slug with lakes + towns.

const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => crypto.randomUUID() });
db.public.none(`
  CREATE TABLE lakes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, name TEXT, region TEXT, county TEXT,
    status TEXT, hero_image_url TEXT, surface_acres INT, max_depth_ft INT, intro_text TEXT, description TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
  CREATE TABLE tags (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, name TEXT, active BOOLEAN DEFAULT TRUE);
  CREATE TABLE lake_tags (lake_id UUID, tag_id UUID);
`);
const memPool = new (db.adapters.createPg().Pool)();
const pool = require('../src/database/pool');
pool.query = (sql, params) => memPool.query(sql, params);

const rp = require('../src/services/region-pages');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };
const add = (slug, name, region, status, hero, acres) =>
    memPool.query(`INSERT INTO lakes (slug,name,region,county,status,hero_image_url,surface_acres,intro_text) VALUES ($1,$2,$3,'Crow Wing',$4,$5,$6,'x')`,
        [slug, name, region, status, hero, acres]);

(async () => {
    await add('gull-lake', 'Gull Lake', 'Brainerd / Baxter', 'published', 'h.jpg', 9400);
    await add('whitefish', 'Whitefish Chain', 'Brainerd / Baxter', 'published', '', 8000);
    await add('draft-lake', 'Draft Lake', 'Brainerd / Baxter', 'draft', 'h.jpg', 500);   // excluded
    await add('carlos', 'Lake Carlos', 'Alexandria', 'published', 'h.jpg', 2600);          // single-lake area

    const gull = (await memPool.query(`SELECT id FROM lakes WHERE slug='gull-lake'`)).rows[0].id;
    await memPool.query(`INSERT INTO tags (id,slug,name) VALUES (gen_random_uuid(),'nisswa','Nisswa')`);
    const nid = (await memPool.query(`SELECT id FROM tags WHERE slug='nisswa'`)).rows[0].id;
    await memPool.query(`INSERT INTO lake_tags (lake_id,tag_id) VALUES ($1,$2)`, [gull, nid]);

    const list = await rp.listAreas();
    const brd = list.find(a => a.slug === 'brainerd-baxter');
    const alex = list.find(a => a.slug === 'alexandria');
    ok(brd && brd.lake_count === 2 && brd.indexable === true, 'Brainerd / Baxter: 2 published lakes → indexable');
    ok(alex && alex.lake_count === 1 && alex.indexable === false, 'Alexandria: 1 lake → below fact floor');
    ok(brd.slug === 'brainerd-baxter', 'region slug normalizes "Brainerd / Baxter" → brainerd-baxter');

    const d = await rp.areaData('brainerd-baxter');
    ok(d && d.region === 'Brainerd / Baxter' && d.lakeCount === 2, 'areaData returns the area + its 2 lakes');
    ok(d.lakes[0].slug === 'gull-lake', 'lakes ordered: hero + larger first');
    ok(d.towns.length === 1 && d.towns[0].slug === 'nisswa', 'linked towns surfaced');
    ok(d.canonicalPath === '/areas/brainerd-baxter' && /Brainerd \/ Baxter Lakes Area/.test(d.seoTitle), 'canonical + area-focused SEO title');
    ok((await rp.areaData('nowhere')) === null, 'unknown area → null');

    if (failures) { console.error(`\nregion-pages: ${failures} FAIL`); process.exit(1); }
    console.log('\nregion-pages: ALL PASSED');
})().catch(e => { console.error('test error:', e.message); process.exit(2); });
