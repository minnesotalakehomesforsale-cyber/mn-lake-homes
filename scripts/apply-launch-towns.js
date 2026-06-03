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

// Shared source of truth — the same JSON the admin "Apply launch towns"
// button hits via POST /api/admin/tags/apply-launch. Keep the list there;
// re-running this script picks up any edits.
const TOWNS = require('../src/data/launch-towns.json');

// (Old hardcoded TOWNS array removed — see src/data/launch-towns.json.)

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
