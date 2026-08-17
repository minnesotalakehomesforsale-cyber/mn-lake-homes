// Regression test for town visibility (src/services/town-visibility.js).
//
// A town is public — listed in the sitemap, shown on the /towns grid, served
// index,follow — when it is active + hero + (state=MN OR a published lake is
// linked). Three surfaces decide this: the sitemap query and the /towns grid
// query use eligibleSql(); the /towns/:slug route uses isTownEligible() for its
// robots meta. If those drift apart you get orphaned indexables (200 +
// index,follow but unlisted) — which is what took 24 town pages out of sync.
//
// This test runs eligibleSql() on a real SQL engine (pg-mem) and isTownEligible()
// in JS over the SAME truth table and asserts they agree row-for-row, plus the
// robots string each case should carry. Framework-free: `node
// test/town-visibility.test.js` (or `npm run test:towns`).
const path = require('path');
const { newDb } = require('pg-mem');
const { eligibleSql, isTownEligible, townRobots, ROBOTS_INDEX, ROBOTS_NOINDEX } =
    require(path.join(__dirname, '..', 'src/services/town-visibility.js'));

let failures = 0;
const check = (name, cond) => { console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${name}`); if (!cond) failures++; };

// Truth table: [slug, state, linkedLake|null]. linkedLake = { status } or null.
const CASES = [
    { slug: 'aitkin',       state: 'MN', lake: { status: 'published' }, eligible: true  }, // MN + lake
    { slug: 'lakeville',    state: 'MN', lake: null,                    eligible: true  }, // MN, no lake  ← the gap towns
    { slug: 'mn-lowercase', state: 'mn', lake: null,                    eligible: true  }, // case-insensitive
    { slug: 'fargo',        state: 'ND', lake: null,                    eligible: false }, // out-of-state, no lake
    { slug: 'superior',     state: 'WI', lake: null,                    eligible: false }, // out-of-state, no lake
    { slug: 'border-lake',  state: 'ND', lake: { status: 'published' }, eligible: true  }, // ND but a treated lake
    { slug: 'nd-draft',     state: 'ND', lake: { status: 'draft' },     eligible: false }, // linked lake not published
    { slug: 'stateless',    state: null, lake: null,                    eligible: false }, // no state, no lake
];

(async () => {
    // ---- Part 1: eligibleSql() on a real SQL engine ----
    const db = newDb();
    db.public.none(`CREATE TABLE tags   (id int primary key, slug text, state text, active boolean, hero_image_url text);`);
    db.public.none(`CREATE TABLE lakes  (id int primary key, status text);`);
    db.public.none(`CREATE TABLE lake_tags (tag_id int, lake_id int);`);
    let lakeId = 100;
    CASES.forEach((c, i) => {
        db.public.none(`INSERT INTO tags (id, slug, state, active, hero_image_url) VALUES (${i + 1}, '${c.slug}', ${c.state === null ? 'NULL' : `'${c.state}'`}, true, 'hero.jpg')`);
        if (c.lake) {
            const lid = ++lakeId;
            db.public.none(`INSERT INTO lakes (id, status) VALUES (${lid}, '${c.lake.status}')`);
            db.public.none(`INSERT INTO lake_tags (tag_id, lake_id) VALUES (${i + 1}, ${lid})`);
        }
    });
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    const rows = (await pool.query(
        `SELECT t.slug FROM tags t
          WHERE t.active = TRUE AND COALESCE(t.hero_image_url,'') <> ''
            AND ${eligibleSql('t')} ORDER BY t.slug`)).rows;
    const sqlEligible = new Set(rows.map(r => r.slug));

    console.log('SQL predicate (eligibleSql) vs expected:');
    for (const c of CASES) {
        check(`${c.slug} (${c.state || 'no-state'}, ${c.lake ? c.lake.status + ' lake' : 'no lake'}) → ${c.eligible ? 'listed' : 'unlisted'}`,
            sqlEligible.has(c.slug) === c.eligible);
    }

    // ---- Part 2: JS predicate agrees with SQL, and robots follows ----
    console.log('\nJS predicate (isTownEligible) agrees with SQL + robots:');
    for (const c of CASES) {
        const js = isTownEligible({ state: c.state, hasPublishedLake: !!(c.lake && c.lake.status === 'published') });
        check(`${c.slug}: JS === SQL === expected`, js === c.eligible && js === sqlEligible.has(c.slug));
        const robots = townRobots(js);
        check(`${c.slug}: robots is ${c.eligible ? 'index,follow' : 'noindex'}`,
            robots === (c.eligible ? ROBOTS_INDEX : ROBOTS_NOINDEX));
    }

    console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('test error:', e); process.exit(2); });
