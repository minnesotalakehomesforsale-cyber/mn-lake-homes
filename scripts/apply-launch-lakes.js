#!/usr/bin/env node
/**
 * apply-launch-lakes.js — one-shot launch-day curation of the MN lakes
 * table. Sibling of apply-launch-towns.js. Run from Render shell:
 *
 *     node scripts/apply-launch-lakes.js
 *
 * Two passes:
 *
 *   1. UPSERTS each entry from src/data/launch-lakes.json by slug.
 *      - Already in the DB → status = 'published', refresh region +
 *        county if they were blank.
 *      - Missing → INSERT with name + slug + state=MN + region + county
 *        + lat/lng + status='published'.
 *
 *   2. Drops every other currently-published MN lake to status='draft'.
 *      Lakes that were already 'draft' or 'archived' stay as they were
 *      so we don't trample admin intent. NOTHING is deleted — content
 *      (intro, description, lifestyle/seasons editorial, gallery, hero
 *      image) stays intact, and re-publishing is one click.
 *
 * Idempotent.
 */

const pool = require('../src/database/pool');
const LAKES = require('../src/data/launch-lakes.json');

async function main() {
    console.log(`\n=== apply-launch-lakes: ${LAKES.length} curated MN lakes ===\n`);

    let inserted = 0, republished = 0;

    for (const l of LAKES) {
        const result = await pool.query(
            `INSERT INTO lakes (slug, name, state, region, county, latitude, longitude, status)
             VALUES ($1, $2, 'MN', $3, $4, $5, $6, 'published')
             ON CONFLICT (slug) DO UPDATE
                 SET name       = EXCLUDED.name,
                     region     = COALESCE(NULLIF(lakes.region, ''), EXCLUDED.region),
                     county     = COALESCE(NULLIF(lakes.county, ''), EXCLUDED.county),
                     latitude   = COALESCE(lakes.latitude,  EXCLUDED.latitude),
                     longitude  = COALESCE(lakes.longitude, EXCLUDED.longitude),
                     status     = 'published',
                     updated_at = NOW()
             RETURNING (xmax = 0) AS inserted`,
            [l.slug, l.name, l.region, l.county, l.lat, l.lng]
        );
        if (result.rows[0]?.inserted) {
            inserted++;
            console.log(`  + INSERT      ${l.name}  (T${l.tier} · ${l.region})`);
        } else {
            republished++;
            console.log(`  ✓ REPUBLISH   ${l.name}  (T${l.tier})`);
        }
    }

    const wantedSlugs = LAKES.map(l => l.slug);
    const drafted = await pool.query(
        `UPDATE lakes
            SET status = 'draft', updated_at = NOW()
          WHERE state = 'MN'
            AND status = 'published'
            AND slug <> ALL ($1::text[])
          RETURNING slug, name`,
        [wantedSlugs]
    );

    console.log(`\n── Pass 2: drafted ${drafted.rowCount} other MN lakes ──`);
    for (const r of drafted.rows) {
        console.log(`  - DRAFT       ${r.name}  (slug: ${r.slug})`);
    }

    console.log(`\n=== summary ===`);
    console.log(`  Inserted (new)        : ${inserted}`);
    console.log(`  Re-published (refreshed): ${republished}`);
    console.log(`  Drafted (sidelined)   : ${drafted.rowCount}`);
    console.log(`\n  Total PUBLISHED MN lakes now: ${inserted + republished}`);
    console.log(`\nDone. Re-run is safe (idempotent).\n`);

    await pool.end();
}

main().catch((err) => {
    console.error('apply-launch-lakes FAILED:', err);
    process.exit(1);
});
