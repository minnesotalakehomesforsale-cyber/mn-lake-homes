// One-off DNR enrichment backfill (SEOP07 — the data unlock).
//
// Pulls authoritative per-lake facts (depth, acreage, water clarity, fish
// species, public accesses) from the MN DNR LakeFinder survey API onto every
// lake that has a DOW number. These facts are what make each lake page unique
// (kills thin/duplicate-content SEO risk) AND what powers the data-gated page
// engines: "Best [Fish] Lakes" (/fishing/*), depth/clarity stats, and future
// lake comparisons. Until this runs against prod, those pages sit correctly
// held back behind their fact floors.
//
// Throttled to ~1 req/sec (a good citizen of state infrastructure); a few
// hundred lakes take a few minutes. Idempotent and re-runnable: by default it
// only touches lakes whose DNR data is missing or older than --stale-days.
//
// Run against PROD (from your machine, pointing at the Render DATABASE_URL):
//   DATABASE_URL="<render-postgres-url>" node scripts/backfill-dnr.js --dry-run
//   DATABASE_URL="<render-postgres-url>" node scripts/backfill-dnr.js
//   DATABASE_URL="<render-postgres-url>" node scripts/backfill-dnr.js --force
//
// Flags:
//   --dry-run          report DOW coverage only; touch nothing
//   --force            re-pull even lakes with fresh DNR data
//   --stale-days=N     refresh window in days (default 30)
//
// NOTE: enrichment only reaches lakes that already have a dow_number. The
// coverage report below tells you how many published lakes still lack one —
// that gap, if large, is the next thing to close (DOW resolution), not this.

require('dotenv').config({ path: process.env.DOTENV_PATH || '.env.local' });

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Point it at the target database, e.g.:\n' +
        '  DATABASE_URL="<render-postgres-url>" node scripts/backfill-dnr.js --dry-run');
    process.exit(1);
}

const pool = require('../src/database/pool');
const { enrichAllLakes } = require('../src/services/dnr-lakefinder');

const args = process.argv.slice(2);
const has = f => args.includes(f);
const dryRun = has('--dry-run');
const force = has('--force');
const staleArg = args.find(a => a.startsWith('--stale-days='));
const staleDays = staleArg ? Math.max(0, parseInt(staleArg.split('=')[1], 10) || 30) : 30;

// Show which host we're about to touch (masked) so a prod run is deliberate.
function maskedHost() {
    try { const u = new URL(process.env.DATABASE_URL); return `${u.hostname}/${u.pathname.replace(/^\//, '')}`; }
    catch { return '(unparseable DATABASE_URL)'; }
}

(async () => {
    console.log(`\nDNR backfill → ${maskedHost()}`);
    console.log(`mode: ${dryRun ? 'DRY RUN (no writes)' : (force ? 'FORCE (re-pull all)' : `refresh (stale > ${staleDays}d)`)}\n`);

    // Coverage report — the real diagnostic. Reveals whether the bottleneck is
    // "enrichment hasn't run" or "lakes don't have DOW numbers yet".
    const { rows: [cov] } = await pool.query(`
        SELECT
            COUNT(*)::int                                                               AS total,
            COUNT(*) FILTER (WHERE status = 'published')::int                           AS published,
            COUNT(*) FILTER (WHERE dow_number IS NOT NULL AND dow_number <> '')::int     AS with_dow,
            COUNT(*) FILTER (WHERE (dow_number IS NULL OR dow_number = '')
                               AND status = 'published')::int                           AS published_no_dow,
            COUNT(*) FILTER (WHERE dnr_data_at IS NOT NULL)::int                         AS already_enriched,
            COUNT(*) FILTER (WHERE fish_species IS NOT NULL)::int                        AS have_fish
          FROM lakes`);

    console.log('Coverage:');
    console.log(`  lakes total ............. ${cov.total}`);
    console.log(`  published ............... ${cov.published}`);
    console.log(`  with a DOW number ....... ${cov.with_dow}   (enrichable)`);
    console.log(`  published, NO DOW ....... ${cov.published_no_dow}   (needs DOW resolution first)`);
    console.log(`  already enriched ........ ${cov.already_enriched}`);
    console.log(`  have fish species ....... ${cov.have_fish}\n`);

    if (cov.with_dow === 0) {
        console.log('No lakes have a DOW number, so there is nothing to enrich yet.');
        console.log('Next unlock is DOW resolution (map lake name+county → DNR DOW), not this script.\n');
        await pool.end().catch(() => {});
        process.exit(0);
    }

    if (dryRun) {
        console.log('Dry run — stopping before any writes. Re-run without --dry-run to enrich.\n');
        await pool.end().catch(() => {});
        process.exit(0);
    }

    console.log(`Enriching (~1 req/sec, this can take a few minutes)…\n`);
    const t0 = Date.now();
    const r = await enrichAllLakes({ force, staleDays });
    const secs = Math.round((Date.now() - t0) / 1000);

    console.log(`\nDone in ${secs}s:`);
    console.log(`  candidates .............. ${r.candidates}`);
    console.log(`  enriched (got data) ..... ${r.enriched}`);
    console.log(`  empty (no survey) ....... ${r.empty}`);
    console.log(`  failed .................. ${r.failed}`);
    console.log(`\nLake pages, /fishing/*, and depth/clarity stats will now reflect the new data.\n`);

    await pool.end().catch(() => {});
    process.exit(0);
})().catch(async e => {
    console.error('\nBackfill FAILED:', e.message);
    await pool.end().catch(() => {});
    process.exit(1);
});
