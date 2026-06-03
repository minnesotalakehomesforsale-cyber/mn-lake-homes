#!/usr/bin/env node
/**
 * apply-launch-towns.js — one-shot launch-day curation of the MN towns
 * table. Run from Render shell after the next deploy:
 *
 *     node scripts/apply-launch-towns.js
 *
 * What it does, in two passes:
 *
 *   1. UPSERTS the 29 launch towns below. Each one is matched by slug.
 *      - Already in the DB → flip active = TRUE, refresh region (so a
 *        previously-archived town comes back live with its proper region).
 *      - Missing → INSERT with name + slug + state=MN + region + lat/lng.
 *
 *   2. DEACTIVATES every other MN tag (active = FALSE) so only the
 *      curated 29 appear on the public site. NOTHING IS DELETED — the
 *      rows stay in the DB, all their content stays intact, and a single
 *      click in the admin Towns view (or a re-run of this script with a
 *      different list) reactivates them. The admin UI labels inactive
 *      tags as "Archived"; that's just terminology — the data is safe.
 *
 * Idempotent: re-running is a no-op if the DB already matches the list.
 *
 * Tier sourcing notes (see request):
 *   T1 = destination lake markets (Brainerd, Alexandria, Detroit Lakes, etc.)
 *   T2 = strong lake + population + demand (Willmar, Forest Lake, etc.)
 *   T3 = metro/regional lake demand (Lakeville, Chanhassen, Mound, etc.)
 */

const pool = require('../src/database/pool');

// Each entry: { name, slug, region, lat, lng }. lat/lng filled in so we
// don't lean on the live geocoder API quota for launch-day batch insert;
// existing rows keep their stored coords (COALESCE in the UPSERT).
const TOWNS = [
    // ── Tier 1 — destination lake markets ─────────────────────────────
    { name: 'Brainerd',        slug: 'brainerd',        region: 'Brainerd Lakes',     lat: 46.3580, lng: -94.2008 },
    { name: 'Baxter',          slug: 'baxter',          region: 'Brainerd Lakes',     lat: 46.3438, lng: -94.2879 },
    { name: 'Alexandria',      slug: 'alexandria',      region: 'Alexandria Lakes',   lat: 45.8852, lng: -95.3775 },
    { name: 'Detroit Lakes',   slug: 'detroit-lakes',   region: 'Lakes Country',      lat: 46.8169, lng: -95.8453 },
    { name: 'Bemidji',         slug: 'bemidji',         region: 'Northern MN',        lat: 47.4737, lng: -94.8803 },
    { name: 'Fergus Falls',    slug: 'fergus-falls',    region: 'Lakes Country',      lat: 46.2830, lng: -96.0779 },
    { name: 'Grand Rapids',    slug: 'grand-rapids',    region: 'Northern Lakes',     lat: 47.2372, lng: -93.5302 },

    // ── Tier 2 — strong lake + population + demand ────────────────────
    { name: 'Willmar',         slug: 'willmar',         region: 'West Central MN',    lat: 45.1219, lng: -95.0436 },
    { name: 'Spicer',          slug: 'spicer',          region: 'West Central MN',    lat: 45.2330, lng: -94.9436 },
    { name: 'New London',      slug: 'new-london',      region: 'West Central MN',    lat: 45.3019, lng: -94.9441 },
    { name: 'Forest Lake',     slug: 'forest-lake',     region: 'Twin Cities Metro',  lat: 45.2789, lng: -92.9853 },
    { name: 'White Bear Lake', slug: 'white-bear-lake', region: 'Twin Cities Metro',  lat: 45.0846, lng: -92.9994 },
    { name: 'Prior Lake',      slug: 'prior-lake',      region: 'Twin Cities Metro',  lat: 44.7133, lng: -93.4225 },
    { name: 'Waconia',         slug: 'waconia',         region: 'Twin Cities Metro',  lat: 44.8508, lng: -93.7869 },
    { name: 'Fairmont',        slug: 'fairmont',        region: 'Southern MN',        lat: 43.6519, lng: -94.4611 },
    { name: 'Albert Lea',      slug: 'albert-lea',      region: 'Southern MN',        lat: 43.6481, lng: -93.3683 },
    { name: 'Buffalo',         slug: 'buffalo',         region: 'Twin Cities Metro',  lat: 45.1719, lng: -93.8744 },

    // ── Tier 3 — metro/regional lake demand ──────────────────────────
    { name: 'Chisago City',    slug: 'chisago-city',    region: 'Twin Cities Metro',  lat: 45.3736, lng: -92.8869 },
    { name: 'Lindstrom',       slug: 'lindstrom',       region: 'Twin Cities Metro',  lat: 45.3886, lng: -92.8466 },
    { name: 'Lakeville',       slug: 'lakeville',       region: 'Twin Cities Metro',  lat: 44.6497, lng: -93.2428 },
    { name: 'Chanhassen',      slug: 'chanhassen',      region: 'Twin Cities Metro',  lat: 44.8622, lng: -93.5300 },
    { name: 'Mound',           slug: 'mound',           region: 'Twin Cities Metro',  lat: 44.9361, lng: -93.6661 },
    { name: 'Lino Lakes',      slug: 'lino-lakes',      region: 'Twin Cities Metro',  lat: 45.1608, lng: -93.0860 },
    { name: 'Big Lake',        slug: 'big-lake',        region: 'Central Lakes',      lat: 45.3325, lng: -93.7458 },
    { name: 'Hutchinson',      slug: 'hutchinson',      region: 'Central Lakes',      lat: 44.8881, lng: -94.3697 },
    { name: 'Faribault',       slug: 'faribault',       region: 'Southern MN',        lat: 44.2950, lng: -93.2688 },
    { name: 'Shoreview',       slug: 'shoreview',       region: 'Twin Cities Metro',  lat: 45.0791, lng: -93.1469 },
    { name: 'Monticello',      slug: 'monticello',      region: 'Twin Cities Metro',  lat: 45.3055, lng: -93.7944 },
    { name: 'Worthington',     slug: 'worthington',     region: 'Southwest MN',       lat: 43.6197, lng: -95.5961 },
];

async function main() {
    console.log(`\n=== apply-launch-towns: ${TOWNS.length} curated MN towns ===\n`);

    let inserted = 0, reactivated = 0, unchanged = 0;

    for (const t of TOWNS) {
        // The (xmax = 0) trick: in Postgres, xmax = 0 on a row means it
        // was freshly INSERTed (not UPDATEd from an existing row). That
        // lets a single UPSERT distinguish new rows from re-activations.
        const result = await pool.query(
            `INSERT INTO tags (slug, name, state, region, latitude, longitude, active)
             VALUES ($1, $2, 'MN', $3, $4, $5, TRUE)
             ON CONFLICT (slug) DO UPDATE
                 SET name       = EXCLUDED.name,
                     region     = COALESCE(NULLIF(tags.region, ''), EXCLUDED.region),
                     latitude   = COALESCE(tags.latitude,  EXCLUDED.latitude),
                     longitude = COALESCE(tags.longitude, EXCLUDED.longitude),
                     active     = TRUE,
                     updated_at = NOW()
             RETURNING (xmax = 0) AS inserted, active`,
            [t.slug, t.name, t.region, t.lat, t.lng]
        );
        const row = result.rows[0];
        if (row.inserted) {
            inserted++;
            console.log(`  + INSERT    ${t.name}  (${t.region})`);
        } else {
            reactivated++;
            console.log(`  ✓ UPSERT    ${t.name}  (set active=TRUE, refreshed)`);
        }
    }

    // Pass 2 — every other MN tag that's currently active goes inactive.
    // Slugs are an exact match against the curated list above.
    const wantedSlugs = TOWNS.map(t => t.slug);
    const deactivated = await pool.query(
        `UPDATE tags
            SET active = FALSE, updated_at = NOW()
          WHERE state = 'MN'
            AND active = TRUE
            AND slug <> ALL ($1::text[])
          RETURNING slug, name`,
        [wantedSlugs]
    );

    console.log(`\n── Pass 2: deactivated ${deactivated.rowCount} other MN tags ──`);
    for (const r of deactivated.rows) {
        console.log(`  - DEACTIVATE  ${r.name}  (slug: ${r.slug})`);
    }

    console.log(`\n=== summary ===`);
    console.log(`  Inserted (new)         : ${inserted}`);
    console.log(`  Re-activated / refreshed: ${reactivated}`);
    console.log(`  Deactivated (sidelined): ${deactivated.rowCount}`);
    console.log(`\n  Total ACTIVE MN tags now: ${inserted + reactivated}`);
    console.log(`\nDone. Re-run is safe (idempotent).\n`);

    await pool.end();
}

main().catch((err) => {
    console.error('apply-launch-towns FAILED:', err);
    process.exit(1);
});
