'use strict';

// GATEPAR — the lake-page robots gate (JS, in the /lakes/:slug route) and the
// sitemap predicate (SQL) MUST agree, or index != sitemap. Both derive from
// src/services/lake-visibility. This test runs one set of fixtures through BOTH
// paths — lakeIsIndexable() in JS and INDEXABLE_SQL on pg-mem — and asserts they
// classify every lake identically. If someone edits one rule and not the other,
// this fails.

const crypto = require('crypto');
const { newDb, DataType } = require('pg-mem');

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => crypto.randomUUID() });
// TRIM is native in real Postgres; pg-mem needs it registered (matches JS .trim()).
db.public.registerFunction({ name: 'trim', args: [DataType.text], returns: DataType.text, implementation: s => s == null ? null : String(s).trim() });
db.public.none(`CREATE TABLE lakes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT, status TEXT,
    intro_text TEXT, description TEXT, surface_acres INT, max_depth_ft INT, fish_species TEXT);`);
const memPool = new (db.adapters.createPg().Pool)();
const pool = require('../src/database/pool');
pool.query = (sql, params) => memPool.query(sql, params);

const { lakeIsIndexable, INDEXABLE_SQL } = require('../src/services/lake-visibility');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

// Fixtures covering every branch of the rule. expected = should be indexable.
const F = [
    { slug: 'editorial-intro',   intro_text: 'A lovely lake.', expected: true },
    { slug: 'editorial-desc',    description: 'Described.',     expected: true },
    { slug: 'facts-acres-depth', surface_acres: 500, max_depth_ft: 40, expected: true },
    { slug: 'facts-acres-fish',  surface_acres: 500, fish_species: '["Walleye"]', expected: true },
    { slug: 'facts-all',         surface_acres: 9400, max_depth_ft: 80, fish_species: '["Walleye","Pike"]', description: '', expected: true },
    { slug: 'acres-only',        surface_acres: 500, expected: false },
    { slug: 'depth-only',        max_depth_ft: 40, expected: false },
    { slug: 'fish-empty-array',  surface_acres: 500, fish_species: '[]', expected: false },  // empty [] is NOT fish
    { slug: 'acres-fishnull',    surface_acres: 500, fish_species: null, expected: false },
    { slug: 'bare',              expected: false },
    { slug: 'blank-strings',     intro_text: '', description: '', expected: false },
    { slug: 'whitespace-intro',  intro_text: '   ', expected: false },  // JS trims; SQL TRIMs — must agree
];

(async () => {
    for (const f of F) {
        await memPool.query(
            `INSERT INTO lakes (slug,status,intro_text,description,surface_acres,max_depth_ft,fish_species)
             VALUES ($1,'published',$2,$3,$4,$5,$6)`,
            [f.slug, f.intro_text ?? null, f.description ?? null, f.surface_acres ?? null, f.max_depth_ft ?? null, f.fish_species ?? null]);
    }

    // SQL side: which slugs the sitemap predicate considers indexable.
    const sqlRows = await memPool.query(`SELECT slug FROM lakes WHERE status = 'published' AND ${INDEXABLE_SQL}`);
    const sqlSet = new Set(sqlRows.rows.map(r => r.slug));

    for (const f of F) {
        const lake = { status: 'published', intro_text: f.intro_text ?? null, description: f.description ?? null,
            surface_acres: f.surface_acres ?? null, max_depth_ft: f.max_depth_ft ?? null, fish_species: f.fish_species ?? null };
        const js = lakeIsIndexable(lake);
        const sql = sqlSet.has(f.slug);
        // The core guarantee: JS gate == SQL sitemap predicate (index == sitemap),
        // and both match intent — for every fixture, no exceptions.
        ok(js === f.expected, `${f.slug}: JS classifies indexable=${f.expected}`);
        ok(js === sql, `${f.slug}: JS gate == SQL sitemap predicate (index == sitemap)`);
    }

    if (failures) { console.error(`\nlake-gate-parity: ${failures} FAIL`); process.exit(1); }
    console.log('\nlake-gate-parity: ALL PASSED');
})().catch(e => { console.error('test error:', e.message); process.exit(2); });
