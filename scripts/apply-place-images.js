#!/usr/bin/env node
/**
 * apply-place-images.js — write the self-hosted Wikimedia photo paths +
 * their credits into the live DB. Sister of download-place-images.js;
 * run that one first (or trust that the next deploy serves the same
 * files this script names).
 *
 *     node scripts/apply-place-images.js
 *
 * For each entry in src/data/place-images.json:
 *
 *   - lakes  : UPDATE lakes SET hero_image_url = featured_image_url =
 *              '/assets/images/lakes/<slug>.jpg' + credit_{name,url,license}
 *              WHERE slug = <slug>.
 *   - towns  : UPDATE tags SET hero_image_url = '/assets/images/towns/<slug>.jpg'
 *              + credit_{name,url,license} WHERE slug = <slug>.
 *
 * Idempotent. Re-run any time you've changed a URL or credit. Skips
 * rows that don't exist (logs a warning rather than failing the run —
 * a launch town might not be seeded yet on a fresh DB).
 */

const pool = require('../src/database/pool');
const DATA = require('../src/data/place-images.json');

async function bumpLakes() {
    console.log(`\n── lakes (${DATA.lakes.length}) ──`);
    let updated = 0, missing = 0;
    for (const it of DATA.lakes) {
        const url = `/assets/images/lakes/${it.slug}.jpg`;
        const r = await pool.query(
            `UPDATE lakes
                SET hero_image_url         = $1,
                    featured_image_url     = $1,
                    hero_image_credit_name = $2,
                    hero_image_credit_url  = $3,
                    hero_image_license     = $4,
                    updated_at             = NOW()
              WHERE slug = $5`,
            [url, it.credit_name, it.credit_url, it.license, it.slug]
        );
        if (r.rowCount) {
            updated++;
            console.log(`  ✓ ${it.slug}  → ${url}  (${it.credit_name}, ${it.license})`);
        } else {
            missing++;
            console.log(`  - ${it.slug}  not in DB — skipped`);
        }
    }
    return { updated, missing };
}

async function bumpTowns() {
    console.log(`\n── towns (${DATA.towns.length}) ──`);
    let updated = 0, missing = 0;
    for (const it of DATA.towns) {
        const url = `/assets/images/towns/${it.slug}.jpg`;
        const r = await pool.query(
            `UPDATE tags
                SET hero_image_url         = $1,
                    hero_image_credit_name = $2,
                    hero_image_credit_url  = $3,
                    hero_image_license     = $4,
                    updated_at             = NOW()
              WHERE slug = $5`,
            [url, it.credit_name, it.credit_url, it.license, it.slug]
        );
        if (r.rowCount) {
            updated++;
            console.log(`  ✓ ${it.slug}  → ${url}  (${it.credit_name}, ${it.license})`);
        } else {
            missing++;
            console.log(`  - ${it.slug}  not in DB — skipped`);
        }
    }
    return { updated, missing };
}

async function main() {
    console.log('=== apply-place-images ===');
    const l = await bumpLakes();
    const t = await bumpTowns();
    console.log(`\n── summary ──`);
    console.log(`  lakes : ${l.updated} updated, ${l.missing} not-in-DB`);
    console.log(`  towns : ${t.updated} updated, ${t.missing} not-in-DB`);
    console.log(`\nDone. Re-run is safe.\n`);
    await pool.end();
}

main().catch((err) => {
    console.error('apply-place-images FAILED:', err);
    process.exit(1);
});
