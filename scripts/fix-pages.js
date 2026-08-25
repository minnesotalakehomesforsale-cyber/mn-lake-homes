/**
 * fix-pages.js — inspect (and optionally safely fix) the lakes/towns the SEO
 * audit flags as "need fixing" (invisible lakes + curated MN towns not live).
 *
 * Mirrors GET /api/admin/seo-audit exactly, then for each flagged page prints
 * its real state (active / has_hero / has_linked_lake / status) so we know the
 * SPECIFIC reason — not just the summarized one.
 *
 * DEFAULT = read-only dry run: lists everything, changes nothing.
 *
 * With --apply (and ALLOW_PUBLISH_WRITES=1) it performs ONLY the unambiguous,
 * reversible fixes:
 *   • curated MN town that already has a hero + a published lake linked, but is
 *     inactive  → set active = TRUE  (make it live)
 *   • lake that already has a hero but isn't published → status = 'published'
 * It NEVER invents a hero image or guesses a lake link — those need a specific
 * asset/lake, so it reports them for a human (missing hero / missing lake link).
 *
 * Run:
 *   node scripts/fix-pages.js                 # dry run — just show me the 25
 *   ALLOW_PUBLISH_WRITES=1 node scripts/fix-pages.js --apply   # do the safe fixes
 */

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');

const APPLY = process.argv.includes('--apply');
if (APPLY && process.env.ALLOW_PUBLISH_WRITES !== '1') {
    console.error('\n⛔ --apply needs ALLOW_PUBLISH_WRITES=1 (it publishes/activates public pages).');
    console.error('   ALLOW_PUBLISH_WRITES=1 node scripts/fix-pages.js --apply\n');
    process.exit(1);
}

const B = (v) => (v ? 'yes' : 'NO ');

async function main() {
    const lakes = (await pool.query(`
        SELECT slug, name, status, (COALESCE(hero_image_url,'') <> '') AS has_hero
        FROM lakes ORDER BY name`)).rows;

    const towns = (await pool.query(`
        SELECT t.slug, t.name, t.active, COALESCE(t.state,'MN') AS state,
            (COALESCE(t.hero_image_url,'') <> '') AS has_hero,
            (COALESCE(t.hero_image_url,'') <> '' OR COALESCE(t.description,'') <> ''
               OR COALESCE(t.seo_description,'') <> '' OR COALESCE(t.intro_text,'') <> '') AS has_content,
            EXISTS (SELECT 1 FROM lake_tags lt JOIN lakes l ON l.id = lt.lake_id
                     WHERE lt.tag_id = t.id AND l.status = 'published') AS has_linked_lake
        FROM tags t ORDER BY t.name`)).rows;

    const isMN = (t) => t.state === 'MN';
    const lakeInvisible = lakes.filter(l => l.status !== 'published' || !l.has_hero);
    const townAttn = towns.filter(t => t.has_content && isMN(t) && !(t.active && t.has_hero && t.has_linked_lake));

    console.log(`\n════════ PAGES NEED ATTENTION — ${lakeInvisible.length + townAttn.length} total ════════`);

    // ── Lakes ────────────────────────────────────────────────────────────────
    console.log(`\nLAKES (${lakeInvisible.length})  [status | hero]`);
    const lakesToPublish = [];
    const lakesNeedHero = [];
    for (const l of lakeInvisible) {
        console.log(`  • ${l.name.padEnd(28)} status=${String(l.status).padEnd(10)} hero=${B(l.has_hero)}   /lakes/${l.slug}`);
        if (!l.has_hero) lakesNeedHero.push(l);
        else if (l.status !== 'published') lakesToPublish.push(l);
    }

    // ── Towns ────────────────────────────────────────────────────────────────
    console.log(`\nCURATED MN TOWNS (${townAttn.length})  [active | hero | published-lake-linked]`);
    const townsToActivate = [];
    const townsNeedHero = [];
    const townsNeedLake = [];
    for (const t of townAttn) {
        console.log(`  • ${t.name.padEnd(28)} active=${B(t.active)} hero=${B(t.has_hero)} lake=${B(t.has_linked_lake)}   /towns/${t.slug}`);
        if (!t.has_hero)               townsNeedHero.push(t);
        else if (!t.has_linked_lake)   townsNeedLake.push(t);
        else if (!t.active)            townsToActivate.push(t);   // complete except the flag
    }

    // ── Plan ─────────────────────────────────────────────────────────────────
    console.log(`\n──── ${APPLY ? 'APPLYING' : 'DRY RUN — would fix'} the safe cases ────`);
    console.log(`  publish ${lakesToPublish.length} lake(s) that already have a hero`);
    console.log(`  activate ${townsToActivate.length} town(s) that already have a hero + linked lake`);

    if (APPLY) {
        for (const l of lakesToPublish) {
            await pool.query(`UPDATE lakes SET status = 'published' WHERE slug = $1`, [l.slug]);
            console.log(`  ✅ published lake ${l.slug}`);
        }
        for (const t of townsToActivate) {
            await pool.query(`UPDATE tags SET active = TRUE WHERE slug = $1`, [t.slug]);
            console.log(`  ✅ activated town ${t.slug}`);
        }
    }

    // ── What lakes (if any) are already linked to the flagged towns ──────────
    // If a town already has a lake linked but it's draft, the fix is to PUBLISH
    // that lake. If nothing is linked, we need to link one.
    const slugs = townAttn.map(t => t.slug);
    if (slugs.length) {
        const linked = (await pool.query(`
            SELECT t.slug AS town, l.name AS lake, l.slug AS lake_slug, l.status,
                   (COALESCE(l.hero_image_url,'') <> '') AS has_hero
            FROM tags t
            JOIN lake_tags lt ON lt.tag_id = t.id
            JOIN lakes l ON l.id = lt.lake_id
            WHERE t.slug = ANY($1)
            ORDER BY t.slug, l.name`, [slugs])).rows;
        const byTown = {};
        linked.forEach(r => { (byTown[r.town] ||= []).push(r); });
        console.log(`\n──── LAKES ALREADY LINKED TO EACH FLAGGED TOWN ────`);
        for (const t of townAttn) {
            const ls = byTown[t.slug] || [];
            const desc = ls.length
                ? ls.map(l => `${l.lake} [${l.status}${l.has_hero ? '' : ', NO hero'}]`).join(', ')
                : '(none linked)';
            console.log(`  • ${t.name.padEnd(22)} → ${desc}`);
        }
    }

    // ── Catalog of every lake, by status (what's available to link/publish) ──
    const byStatus = {};
    lakes.forEach(l => { (byStatus[l.status] ||= []).push(l.name); });
    console.log(`\n──── LAKE CATALOG (${lakes.length} total) ────`);
    for (const [st, names] of Object.entries(byStatus)) {
        console.log(`  ${st} (${names.length}): ${names.join(', ')}`);
    }

    // ── Needs a human (real content, no guessing) ────────────────────────────
    console.log(`\n──── NEEDS A SPECIFIC ASSET (not auto-fixable) ────`);
    console.log(`  ${lakesNeedHero.length} lake(s) need a hero image:`);
    lakesNeedHero.forEach(l => console.log(`      - ${l.name}  (/lakes/${l.slug})`));
    console.log(`  ${townsNeedHero.length} town(s) need a hero image:`);
    townsNeedHero.forEach(t => console.log(`      - ${t.name}  (/towns/${t.slug})`));
    console.log(`  ${townsNeedLake.length} town(s) need a published lake linked:`);
    townsNeedLake.forEach(t => console.log(`      - ${t.name}  (/towns/${t.slug})`));
    console.log('');

    await pool.end();
}

main().catch(err => { console.error('[fix-pages]', err); process.exit(1); });
