/**
 * fix-pages.js — take the SEO audit's "need fixing" pages live.
 *
 * The flagged pages are curated MN town pages that have a hero + content but no
 * PUBLISHED lake linked (so they can't go live). This pairs each with its
 * geographically NEAREST published lake (haversine on lat/long), which is an
 * objective rule — no guessing at images or hand-picked lakes.
 *
 * DEFAULT = dry run: lists every flagged page and the proposed town → lake
 * pairing WITH the distance, so you can eyeball anything that looks off before
 * anything changes. Also publishes-ready lakes that just need a hero are noted.
 *
 * With --apply (and ALLOW_PUBLISH_WRITES=1) it, for each flagged town:
 *   • links the nearest published lake (if none is linked yet), and
 *   • sets the town active = TRUE
 * and publishes any lake that already has a hero but isn't published.
 *
 * Run:
 *   node scripts/fix-pages.js                                   # dry run — show the plan
 *   ALLOW_PUBLISH_WRITES=1 node scripts/fix-pages.js --apply    # do it
 */

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');

const APPLY = process.argv.includes('--apply');
if (APPLY && process.env.ALLOW_PUBLISH_WRITES !== '1') {
    console.error('\n⛔ --apply needs ALLOW_PUBLISH_WRITES=1 (it links lakes + activates public pages).');
    console.error('   ALLOW_PUBLISH_WRITES=1 node scripts/fix-pages.js --apply\n');
    process.exit(1);
}

const B = (v) => (v ? 'yes' : 'NO ');
function milesBetween(aLat, aLng, bLat, bLng) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 3958.8;
    const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

async function main() {
    const lakes = (await pool.query(`
        SELECT id, name, slug, status, latitude, longitude,
               (COALESCE(hero_image_url,'') <> '') AS has_hero
        FROM lakes ORDER BY name`)).rows;

    const towns = (await pool.query(`
        SELECT t.id, t.slug, t.name, t.active, COALESCE(t.state,'MN') AS state,
            t.latitude, t.longitude,
            (COALESCE(t.hero_image_url,'') <> '') AS has_hero,
            (COALESCE(t.hero_image_url,'') <> '' OR COALESCE(t.description,'') <> ''
               OR COALESCE(t.seo_description,'') <> '' OR COALESCE(t.intro_text,'') <> '') AS has_content,
            EXISTS (SELECT 1 FROM lake_tags lt JOIN lakes l ON l.id = lt.lake_id
                     WHERE lt.tag_id = t.id AND l.status = 'published') AS has_linked_lake
        FROM tags t ORDER BY t.name`)).rows;

    const isMN = (t) => t.state === 'MN';
    const lakeInvisible = lakes.filter(l => l.status !== 'published' || !l.has_hero);
    const lakesToPublish = lakeInvisible.filter(l => l.has_hero && l.status !== 'published');
    const townAttn = towns.filter(t => t.has_content && isMN(t) && !(t.active && t.has_hero && t.has_linked_lake));

    console.log(`\n════════ PAGES NEED ATTENTION — ${lakeInvisible.length + townAttn.length} total ════════`);
    console.log(`\nLAKES (${lakeInvisible.length})`);
    lakeInvisible.forEach(l => console.log(`  • ${l.name.padEnd(26)} status=${l.status} hero=${B(l.has_hero)}`));
    console.log(`\nCURATED MN TOWNS (${townAttn.length})  [active | hero | published-lake-linked]`);
    townAttn.forEach(t => console.log(`  • ${t.name.padEnd(22)} active=${B(t.active)} hero=${B(t.has_hero)} lake=${B(t.has_linked_lake)}`));

    // Nearest published lake for each flagged town.
    const pubLakes = lakes.filter(l => l.status === 'published' && l.latitude != null && l.longitude != null);
    const pairings = [];
    const noCoords = [];
    for (const t of townAttn) {
        if (t.latitude == null || t.longitude == null) { noCoords.push(t); continue; }
        let best = null, bestMi = Infinity;
        for (const l of pubLakes) {
            const mi = milesBetween(Number(t.latitude), Number(t.longitude), Number(l.latitude), Number(l.longitude));
            if (mi < bestMi) { bestMi = mi; best = l; }
        }
        pairings.push({ town: t, lake: best, miles: bestMi });
    }

    console.log(`\n──── PROPOSED: link nearest published lake + activate  (${pairings.length}) ────`);
    pairings
        .sort((a, b) => a.miles - b.miles)
        .forEach(p => {
            const flag = p.miles > 25 ? '  ⚠️ far — check this one' : '';
            console.log(`  ${p.town.name.padEnd(22)} → ${(p.lake ? p.lake.name : '(no published lake!)').padEnd(22)} ${p.miles.toFixed(1)} mi${flag}`);
        });
    if (noCoords.length) {
        console.log(`\n  ${noCoords.length} town(s) have NO coordinates — can't auto-pair, need a manual link:`);
        noCoords.forEach(t => console.log(`      - ${t.name} (/towns/${t.slug})`));
    }
    if (lakesToPublish.length) {
        console.log(`\n  ${lakesToPublish.length} lake(s) have a hero but aren't published → will publish:`);
        lakesToPublish.forEach(l => console.log(`      - ${l.name}`));
    }

    if (!APPLY) {
        console.log(`\nDRY RUN — nothing changed. To apply:`);
        console.log(`   ALLOW_PUBLISH_WRITES=1 node scripts/fix-pages.js --apply\n`);
        await pool.end();
        return;
    }

    // ── Apply ────────────────────────────────────────────────────────────────
    console.log(`\n──── APPLYING ────`);
    let linked = 0, activated = 0, published = 0;
    for (const { town, lake } of pairings) {
        if (lake) {
            const ins = await pool.query(
                `INSERT INTO lake_tags (lake_id, tag_id)
                 SELECT $1, $2
                 WHERE NOT EXISTS (SELECT 1 FROM lake_tags WHERE lake_id = $1 AND tag_id = $2)`,
                [lake.id, town.id]
            );
            if (ins.rowCount) linked++;
        }
        const upd = await pool.query(`UPDATE tags SET active = TRUE WHERE id = $1 AND active = FALSE`, [town.id]);
        if (upd.rowCount) activated++;
    }
    for (const l of lakesToPublish) {
        await pool.query(`UPDATE lakes SET status = 'published' WHERE id = $1`, [l.id]);
        published++;
    }
    console.log(`  ✅ linked ${linked} lake(s), activated ${activated} town(s), published ${published} lake(s).`);
    console.log(`  Re-run the dry run to confirm 0 pages need attention.\n`);
    await pool.end();
}

main().catch(err => { console.error('[fix-pages]', err); process.exit(1); });
