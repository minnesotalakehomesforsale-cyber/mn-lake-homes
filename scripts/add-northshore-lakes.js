/**
 * add-northshore-lakes.js
 * The nearest-lake auto-fix put 6 NE-Minnesota town pages on a lake 40–67 mi
 * away because the catalog had no lake up there. This creates the RIGHT lakes
 * and re-links those towns:
 *
 *   Lake Superior   → Duluth, Two Harbors        (the North Shore)
 *   Island Lake     → Hermantown, Proctor, Cloquet  (Duluth-area reservoir)
 *   Grindstone Lake → Hinckley                    (clear east-central lake)
 *
 * Each new lake is published with a real description + a DISTINCT hero (picked
 * at runtime from a pool, skipping any image already used by another lake, so
 * no two lakes share a photo). Idempotent: skips a lake whose slug exists and
 * only swaps the wrong link for the right one.
 *
 * Run:  ALLOW_PUBLISH_WRITES=1 node scripts/add-northshore-lakes.js
 */

if (process.env.ALLOW_PUBLISH_WRITES !== '1') {
    console.error('\n⛔ Refuses to run without ALLOW_PUBLISH_WRITES=1 (creates + publishes lake pages).');
    console.error('   ALLOW_PUBLISH_WRITES=1 node scripts/add-northshore-lakes.js\n');
    process.exit(1);
}

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');

const NEW_LAKES = [
    {
        slug: 'lake-superior', name: 'Lake Superior', region: 'North Shore', county: 'St. Louis',
        latitude: 46.80, longitude: -91.90,
        intro_text: "Minnesota's North Shore — big water, historic lake homes, and cabins from the Duluth hillside up the shore to Two Harbors.",
        description: "Lake Superior is the largest freshwater lake in the world by surface area, and its Minnesota shore is one of the most sought-after settings in the state. From the Duluth hillside with its harbor views to the rocky points and agate beaches around Two Harbors, North Shore real estate ranges from historic in-town homes and craftsman bungalows to modern glass builds perched over the big water.\n\nThis is a four-season market: fall color along Highway 61, winter storm-watching, and long summer evenings on the water. Buyers here trade the warm-lake swimming of central Minnesota for something rarer — dramatic shoreline, cool-summer air, and the character of a working port city next door.",
        seo_title: 'Lake Superior Homes for Sale | Minnesota North Shore Real Estate',
        seo_description: "Lake Superior real estate on Minnesota's North Shore — Duluth to Two Harbors. Big-water views, historic lake homes, and North Shore cabins.",
        heroPool: ['mn-adirondack-rocky-shore.jpg', 'cr-lakeside-homes-boats.jpg'],
    },
    {
        slug: 'island-lake', name: 'Island Lake', region: 'Duluth Area', county: 'St. Louis',
        latitude: 47.02, longitude: -92.02,
        intro_text: "A large northwoods reservoir just north of Duluth — quiet water, cabins, and year-round lake homes minutes from Hermantown and Proctor.",
        description: "Island Lake is one of the largest lakes in the Duluth area — a reservoir on the Cloquet River wrapped in St. Louis County forest, yet only a short drive from Hermantown, Proctor, and the city itself. It's a favorite for boating, walleye and northern fishing, and the kind of quiet, tree-lined shoreline that defines northeastern Minnesota.\n\nThe housing mix runs from classic seasonal cabins to full year-round lake homes, drawing buyers who want real northwoods water without leaving the conveniences of the Duluth metro behind.",
        seo_title: 'Island Lake Homes for Sale | Duluth Area, Minnesota',
        seo_description: "Island Lake homes near Duluth, Minnesota — a large northwoods reservoir minutes from Hermantown and Proctor. Cabins and year-round lake homes.",
        heroPool: ['cr-cabin-woods-firepit.jpg', 'cr-log-cabin-autumn-woods.jpg'],
    },
    {
        slug: 'grindstone-lake', name: 'Grindstone Lake', region: 'East Central', county: 'Pine',
        latitude: 46.13, longitude: -92.85,
        intro_text: "A clear, deep, spring-fed lake near Hinckley — cabins and lake homes about ninety minutes north of the Twin Cities.",
        description: "Grindstone Lake is one of east-central Minnesota's clearest lakes — deep, spring-fed, and known for exceptional water clarity and its cisco and trout fishery near Hinckley and Sandstone. Clean shoreline and easy I-35 access make it a natural weekend lake for Twin Cities families, roughly ninety minutes from the metro.\n\nProperties range from tucked-in seasonal cabins to updated year-round homes, with the clear water and quiet setting the main draw for buyers looking north.",
        seo_title: 'Grindstone Lake Homes for Sale | Hinckley, Minnesota',
        seo_description: "Grindstone Lake real estate near Hinckley, Minnesota — a clear, spring-fed east-central lake. Cabins and lake homes ninety minutes from the metro.",
        heroPool: ['cr-lakefront-home-dock.jpg', 'cr-log-cabin-autumn-woods.jpg'],
    },
];

// [town slug, wrong lake NAME to unlink]
const REMOVE = [
    ['duluth', 'Big Sandy Lake'], ['hermantown', 'Big Sandy Lake'], ['proctor', 'Big Sandy Lake'],
    ['cloquet', 'Big Sandy Lake'], ['two-harbors', 'Burntside Lake'], ['hinckley', 'Mille Lacs Lake'],
];
// [town slug, correct lake slug]
const ADD = [
    ['duluth', 'lake-superior'], ['two-harbors', 'lake-superior'],
    ['hermantown', 'island-lake'], ['proctor', 'island-lake'], ['cloquet', 'island-lake'],
    ['hinckley', 'grindstone-lake'],
];

const lakeIdBySlug = {};

async function main() {
    // Heroes already in use by OTHER lakes and by ANY town — so we never assign
    // a duplicate (a lake sharing a photo with a town counts).
    const townHeroes = (await pool.query(`SELECT hero_image_url FROM tags WHERE hero_image_url IS NOT NULL`))
        .rows.map(r => r.hero_image_url);
    const lakeHeroRows = (await pool.query(`SELECT slug, hero_image_url FROM lakes WHERE hero_image_url IS NOT NULL`)).rows;

    console.log('\n──── Lakes ────');
    for (const L of NEW_LAKES) {
        const used = new Set([
            ...lakeHeroRows.filter(r => r.slug !== L.slug).map(r => r.hero_image_url),
            ...townHeroes,
        ]);
        const heroFile = L.heroPool.map(f => `/assets/images/${f}`).find(u => !used.has(u));
        if (!heroFile) { console.warn(`  ⚠️ ${L.name}: every candidate hero is taken — skipping`); continue; }

        const exists = await pool.query(`SELECT id, hero_image_url FROM lakes WHERE slug = $1`, [L.slug]);
        if (exists.rowCount) {
            lakeIdBySlug[L.slug] = exists.rows[0].id;
            if (exists.rows[0].hero_image_url !== heroFile) {
                // Reconcile — e.g. an earlier run gave it a photo a town also uses.
                await pool.query(`UPDATE lakes SET hero_image_url = $1, featured_image_url = $1 WHERE slug = $2`, [heroFile, L.slug]);
                const row = lakeHeroRows.find(r => r.slug === L.slug);
                if (row) row.hero_image_url = heroFile; else lakeHeroRows.push({ slug: L.slug, hero_image_url: heroFile });
                console.log(`  ↻ ${L.name} — hero → ${heroFile.split('/').pop()} (was a shared image)`);
            } else {
                console.log(`  • ${L.name} — already exists, hero OK`);
            }
            continue;
        }
        const ins = await pool.query(
            `INSERT INTO lakes (slug, name, state, region, county, latitude, longitude,
                                intro_text, description, hero_image_url, featured_image_url,
                                seo_title, seo_description, status)
             VALUES ($1,$2,'MN',$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,'published')
             RETURNING id`,
            [L.slug, L.name, L.region, L.county, L.latitude, L.longitude,
             L.intro_text, L.description, heroFile, L.seo_title, L.seo_description]
        );
        lakeIdBySlug[L.slug] = ins.rows[0].id;
        lakeHeroRows.push({ slug: L.slug, hero_image_url: heroFile });
        console.log(`  ✅ created ${L.name}  (hero ${heroFile.split('/').pop()})`);
    }

    console.log('\n──── Re-linking towns ────');
    let removed = 0;
    for (const [town, lakeName] of REMOVE) {
        const r = await pool.query(
            `DELETE FROM lake_tags
              WHERE tag_id  = (SELECT id FROM tags  WHERE slug = $1)
                AND lake_id = (SELECT id FROM lakes WHERE name = $2)`,
            [town, lakeName]
        );
        if (r.rowCount) { removed += r.rowCount; console.log(`  − ${town} ✂ ${lakeName}`); }
    }
    let added = 0, activated = 0;
    for (const [town, lakeSlug] of ADD) {
        const lakeId = lakeIdBySlug[lakeSlug]
            || (await pool.query(`SELECT id FROM lakes WHERE slug = $1`, [lakeSlug])).rows[0]?.id;
        if (!lakeId) { console.warn(`  ⚠️ ${lakeSlug} missing — can't link ${town}`); continue; }
        const ins = await pool.query(
            `INSERT INTO lake_tags (lake_id, tag_id)
             SELECT $1, t.id FROM tags t WHERE t.slug = $2
               AND NOT EXISTS (SELECT 1 FROM lake_tags lt WHERE lt.lake_id = $1 AND lt.tag_id = t.id)`,
            [lakeId, town]
        );
        if (ins.rowCount) { added++; console.log(`  + ${town} → ${lakeSlug}`); }
        const act = await pool.query(`UPDATE tags SET active = TRUE WHERE slug = $1 AND active = FALSE`, [town]);
        if (act.rowCount) activated++;
    }

    console.log(`\n✅ Done — removed ${removed} wrong link(s), added ${added} correct link(s), activated ${activated} town(s).`);
    console.log(`   Re-run:  node scripts/fix-pages.js   → should now show 0 pages need attention.\n`);
    await pool.end();
}

main().catch(err => { console.error('[add-northshore-lakes]', err); process.exit(1); });
