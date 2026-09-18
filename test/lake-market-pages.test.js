'use strict';

// lake-market-pages (SEOP02) — "Homes for Sale on [Lake]". Real SQL on pg-mem:
// lists a lake's active listings, applies the fact floor (>= 1 listing = index),
// and builds SEO copy. A lake with no inventory is reachable but noindex.

const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => crypto.randomUUID() });
db.public.none(`
  CREATE TABLE lakes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, name TEXT, state TEXT, region TEXT, county TEXT,
    hero_image_url TEXT, intro_text TEXT, status TEXT);
  CREATE TABLE listings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, lake_id UUID, title TEXT, address TEXT, city TEXT,
    state TEXT, price INT, beds INT, baths NUMERIC, sqft INT, waterfront_feet INT, featured_image_url TEXT, status TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
`);
const memPool = new (db.adapters.createPg().Pool)();
const pool = require('../src/database/pool');
pool.query = (sql, params) => memPool.query(sql, params);
delete process.env.LISTINGS_PUBLIC;   // default = public

const mp = require('../src/services/lake-market-pages');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

(async () => {
    const gull = crypto.randomUUID(), quiet = crypto.randomUUID();
    await memPool.query(`INSERT INTO lakes (id,slug,name,state,status) VALUES ($1,'gull-lake','Gull Lake','MN','published'),($2,'quiet-lake','Quiet Lake','MN','published')`, [gull, quiet]);
    await memPool.query(`INSERT INTO lakes (id,slug,name,state,status) VALUES (gen_random_uuid(),'draft-lake','Draft Lake','MN','draft')`);
    // Two active listings on Gull, plus a sold one (excluded). None on Quiet.
    await memPool.query(`INSERT INTO listings (slug,lake_id,title,city,state,price,beds,baths,sqft,status) VALUES
        ('123-shore',$1,'123 Shore Dr','Nisswa','MN',1250000,4,3,2800,'active'),
        ('456-bay',$1,'456 Bay Rd','Nisswa','MN',890000,3,2,2100,'active'),
        ('789-old',$1,'789 Old Sold','Nisswa','MN',700000,3,2,1800,'sold')`, [gull]);

    // Gull: 2 active listings → indexable, cards + SEO reflect the count.
    const g = await mp.homesForSale('gull-lake');
    ok(g && g.count === 2 && g.indexable === true, 'lake with 2 active listings → count 2, indexable');
    ok(g.listings[0].price === 1250000, 'listings ordered by price desc (priciest first)');
    ok(/Homes for Sale on Gull Lake/.test(g.h1) && /2 Listings/.test(g.seoTitle), 'H1 + SEO title reflect real inventory');
    ok(g.canonicalPath === '/lakes/gull-lake/homes-for-sale', 'canonical path nests under the lake');

    // Quiet: 0 listings → reachable but noindex, alert-style copy.
    const q = await mp.homesForSale('quiet-lake');
    ok(q && q.count === 0 && q.indexable === false, 'lake with no listings → count 0, noindex (below fact floor)');
    ok(/Get alerted/.test(q.seoDescription), 'empty page uses alert-capture copy, not a thin "0 homes" claim');

    // Unpublished / unknown lake.
    ok((await mp.homesForSale('draft-lake')) === null, 'unpublished lake → null (404)');
    ok((await mp.homesForSale('nope')) === null, 'unknown lake → null');

    // Sitemap source: only lakes with active listings.
    const wl = await mp.lakesWithActiveListings();
    ok(wl.length === 1 && wl[0].slug === 'gull-lake' && wl[0].n === 2, 'lakesWithActiveListings returns only Gull (2 listings)');

    if (failures) { console.error(`\nlake-market-pages: ${failures} FAIL`); process.exit(1); }
    console.log('\nlake-market-pages: ALL PASSED');
})().catch(e => { console.error('test error:', e.message); process.exit(2); });
