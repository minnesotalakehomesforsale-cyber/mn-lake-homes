'use strict';

// SEOCI harness — boots the real Express app (server.js, now require-safe) against
// pg-mem on an ephemeral port and crawls the programmatic-SEO surfaces, asserting
// the four A+ properties that can't be unit-tested:
//   #2 no orphans      — every indexable URL in the sitemap returns 200 + index
//   #3 no-JS floor     — the answer (H1 + listed items) is in the SSR HTML
//   #4 near-dup ceiling — distinct hub pages are < 80% similar
//   #6 asset integrity — CSS/JS/favicon the pages reference resolve 200
// (SEOCI #1 gate-parity and #5 schema-integrity are separate unit tests.)

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:x@localhost:5432/x';

const http = require('http');
const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');

// ── pg-mem: schema + functions the routes/sitemap touch ──────────────────────
const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => crypto.randomUUID() });
db.public.registerFunction({ name: 'trim', args: [DataType.text], returns: DataType.text, implementation: s => s == null ? null : String(s).trim() });
db.public.none(`
  CREATE TABLE lakes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, name TEXT, status TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(), intro_text TEXT, description TEXT, surface_acres INT, max_depth_ft INT,
    mean_depth_ft INT, water_clarity_ft NUMERIC, shoreline_miles NUMERIC, public_accesses INT, fish_species TEXT,
    hero_image_url TEXT, county TEXT, region TEXT, dow_number TEXT, state TEXT DEFAULT 'MN');
  CREATE TABLE tags (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, name TEXT, active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(), intro_text TEXT, description TEXT, state TEXT, hero_image_url TEXT);
  CREATE TABLE lake_tags (tag_id UUID, lake_id UUID);
  CREATE TABLE businesses (slug TEXT, updated_at TIMESTAMPTZ DEFAULT NOW(), status TEXT, user_id UUID, subscription_status TEXT, tier_comped BOOLEAN DEFAULT FALSE);
  CREATE TABLE agents (slug TEXT, updated_at TIMESTAMPTZ DEFAULT NOW(), profile_status TEXT, is_published BOOLEAN DEFAULT FALSE, deleted_at TIMESTAMPTZ, bio TEXT);
  CREATE TABLE blog_posts (slug TEXT, updated_at TIMESTAMPTZ DEFAULT NOW(), published_at TIMESTAMPTZ, is_published BOOLEAN DEFAULT FALSE, deleted_at TIMESTAMPTZ);
  CREATE TABLE listings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, updated_at TIMESTAMPTZ DEFAULT NOW(), status TEXT, lake_id UUID, price INT);
`);
const memPool = new (db.adapters.createPg().Pool)();

// Seed lakes: Cass/Brainerd (3 fact-complete, all walleye) + Hennepin/Metro (2).
const L = [
    ['gull-lake', 'Gull Lake', 'Cass', 'Brainerd Lakes', 9400, 80, ['Walleye', 'Northern Pike']],
    ['whitefish', 'Whitefish Chain', 'Cass', 'Brainerd Lakes', 8000, 130, ['Walleye', 'Muskellunge']],
    ['pelican', 'Pelican Lake', 'Cass', 'Brainerd Lakes', 4800, 100, ['Walleye']],
    ['minnetonka', 'Lake Minnetonka', 'Hennepin', 'Twin Cities Metro', 14000, 100, ['Walleye', 'Largemouth Bass']],
    ['harriet', 'Lake Harriet', 'Hennepin', 'Twin Cities Metro', 350, 30, ['Largemouth Bass']],
];

(async () => {
    for (const [slug, name, county, region, acres, depth, fish] of L) {
        await memPool.query(
            `INSERT INTO lakes (slug,name,status,county,region,surface_acres,max_depth_ft,mean_depth_ft,water_clarity_ft,public_accesses,fish_species,hero_image_url)
             VALUES ($1,$2,'published',$3,$4,$5,$6,$7,8,3,$8,'h.jpg')`,
            [slug, name, county, region, acres, depth, Math.round(depth / 3), JSON.stringify(fish)]);
    }
    // One town linked to Gull so county/area "towns" sections have data.
    await memPool.query(`INSERT INTO tags (slug,name,active,intro_text,state,hero_image_url) VALUES ('nisswa','Nisswa',TRUE,'A resort town.','MN','h.jpg')`);
    const gid = (await memPool.query(`SELECT id FROM lakes WHERE slug='gull-lake'`)).rows[0].id;
    const nid = (await memPool.query(`SELECT id FROM tags WHERE slug='nisswa'`)).rows[0].id;
    await memPool.query(`INSERT INTO lake_tags (tag_id,lake_id) VALUES ($1,$2)`, [nid, gid]);

    // Patch the shared pool BEFORE requiring the app so every module sees pg-mem.
    const pool = require('../src/database/pool');
    pool.query = (sql, params) => memPool.query(sql, params);

    const { app } = require('../src/server');
    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async p => { const r = await fetch(base + p); return { status: r.status, robots: (r.headers.get('x-robots-tag') || ''), body: await r.text() }; };
    const robotsMeta = html => (html.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || '';
    const strip = html => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

    let failures = 0;
    const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

    try {
        // ── #3 No-JS content floor ──────────────────────────────────────────
        const wae = await get('/fishing/walleye');
        ok(wae.status === 200, '#3 /fishing/walleye renders 200');
        ok(/<h1>[^<]*Walleye/i.test(wae.body), '#3 H1 is in the SSR HTML (no JS needed)');
        ok(strip(wae.body).includes('gull lake') && strip(wae.body).includes('pelican'), '#3 lake list is server-rendered, not JS-injected');
        ok(robotsMeta(wae.body).startsWith('index'), '#3 indexable robots meta');

        // ── #6 Asset integrity ──────────────────────────────────────────────
        const refs = [...new Set([...wae.body.matchAll(/(?:href|src)="(\/[^"]+\.(?:css|js|svg))"/g)].map(m => m[1]))];
        ok(refs.length > 0, `#6 page references ${refs.length} static assets`);
        for (const ref of refs) {
            const a = await get(ref);
            ok(a.status === 200, `#6 asset resolves 200: ${ref}`);
        }

        // ── #2 No orphans: every indexable sitemap URL returns 200 + index ──
        const sm = await get('/sitemap.xml');
        ok(sm.status === 200, '#2 sitemap.xml renders 200');
        const locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/^https?:\/\/[^/]+/, ''));
        const programmatic = locs.filter(u => /^\/(counties|areas|fishing|compare)\//.test(u));
        ok(programmatic.length >= 5, `#2 sitemap lists ${programmatic.length} programmatic hub URLs`);
        let orphanFail = 0;
        for (const u of programmatic) {
            const r = await get(u);
            if (r.status !== 200 || !robotsMeta(r.body).startsWith('index')) { orphanFail++; console.error(`      orphan/!index: ${u} (status ${r.status}, robots "${robotsMeta(r.body)}")`); }
        }
        ok(orphanFail === 0, `#2 all ${programmatic.length} sitemap hub URLs return 200 + index (no orphans)`);

        // Hub index pages link their children (crawl path exists, not just sitemap).
        const fishIdx = await get('/fishing');
        ok(fishIdx.body.includes('/fishing/walleye'), '#2 /fishing index links to /fishing/walleye (crawlable)');
        const cmpIdx = await get('/compare');
        ok(/\/compare\/[a-z]/.test(cmpIdx.body), '#2 /compare index links to comparison pages');

        // ── #4 Near-duplicate ceiling: distinct hubs < 80% similar ──────────
        const a = strip((await get('/fishing/walleye')).body);
        const b = strip((await get('/counties/cass')).body);
        const shingles = s => { const w = s.split(' '); const set = new Set(); for (let i = 0; i + 3 <= w.length; i++) set.add(w.slice(i, i + 3).join(' ')); return set; };
        const A = shingles(a), B = shingles(b);
        let inter = 0; for (const s of A) if (B.has(s)) inter++;
        const jaccard = inter / (A.size + B.size - inter || 1);
        ok(jaccard < 0.8, `#4 /fishing/walleye vs /counties/cass similarity ${(jaccard * 100).toFixed(0)}% < 80%`);

        if (failures) { console.error(`\nseo-crawl-harness: ${failures} FAIL`); process.exitCode = 1; }
        else console.log('\nseo-crawl-harness: ALL PASSED');
    } finally {
        server.close();
    }
    // Explicit exit — the app may hold open handles (pool) even without booting workers.
    setTimeout(() => process.exit(process.exitCode || 0), 100);
})().catch(e => { console.error('harness error:', e.stack || e.message); process.exit(2); });
