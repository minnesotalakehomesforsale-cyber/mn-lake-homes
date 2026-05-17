// scripts/lakes/generate-lake-content.js
//
// One-shot content population: walks every lake + every town and writes
// region-aware editorial copy into lifestyle_text / seasons_text where
// those columns are NULL. Idempotent — re-running it is safe; rows that
// already have admin-curated copy are skipped.
//
// Run locally (uses .env.local):
//   node scripts/lakes/generate-lake-content.js
//
// Run on Render shell against prod:
//   node scripts/lakes/generate-lake-content.js
//
// Flags (positional argv):
//   --dry             show what would change without writing
//   --force           rewrite even when the column already has content
//                     (use with care — clobbers admin-curated copy)
//   --slug=<slug>     only operate on one lake or town
//
// The actual copy generation lives in src/services/lake-content-templates.js
// so the runtime fallback path (server.js) and this script produce the
// exact same output for any given row.

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const {
    lifestyleHtmlForLake, seasonsHtmlForLake,
    lifestyleHtmlForTown, seasonsHtmlForTown,
    pickLakeFlavor, pickTownFlavor,
} = require('../../src/services/lake-content-templates');

const args = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
const slugArg = (process.argv.slice(2).find(a => a.startsWith('--slug=')) || '').split('=')[1] || null;
const DRY   = args.has('--dry');
const FORCE = args.has('--force');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false,
});

// Convert paragraph-HTML back to the plain text we store in the column
// (paragraphs separated by blank lines). The runtime re-wraps with <p>
// tags on render; storing plain text means admin edits in the textarea
// work as expected.
function htmlToPlain(html) {
    return String(html || '')
        .replace(/<\/p>\s*<p>/g, '\n\n')
        .replace(/<p>/g, '')
        .replace(/<\/p>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

async function processLakes() {
    let where = `1 = 1`;
    const params = [];
    if (slugArg) { params.push(slugArg); where = `slug = $${params.length}`; }
    const { rows } = await pool.query(
        `SELECT id, slug, name, region, county, state, lifestyle_text, seasons_text
           FROM lakes
          WHERE ${where}
          ORDER BY name ASC`,
        params
    );

    let wrote = 0, skipped = 0;
    for (const lake of rows) {
        const flavor    = pickLakeFlavor(lake.region);
        const updates   = [];
        const vals      = [];
        let i           = 1;

        const needLifestyle = FORCE || !lake.lifestyle_text || !lake.lifestyle_text.trim();
        const needSeasons   = FORCE || !lake.seasons_text   || !lake.seasons_text.trim();

        if (needLifestyle) {
            updates.push(`lifestyle_text = $${i++}`);
            vals.push(htmlToPlain(lifestyleHtmlForLake(lake)));
        }
        if (needSeasons) {
            updates.push(`seasons_text = $${i++}`);
            vals.push(htmlToPlain(seasonsHtmlForLake(lake)));
        }

        if (!updates.length) {
            skipped++;
            console.log(`  · ${lake.name.padEnd(34)} [${flavor.padEnd(11)}]  already populated, skipping`);
            continue;
        }

        if (DRY) {
            console.log(`  ↻ ${lake.name.padEnd(34)} [${flavor.padEnd(11)}]  would write ${needLifestyle ? 'lifestyle ' : ''}${needSeasons ? 'seasons ' : ''}(DRY)`);
            wrote++;
            continue;
        }

        updates.push(`updated_at = NOW()`);
        vals.push(lake.id);
        await pool.query(
            `UPDATE lakes SET ${updates.join(', ')} WHERE id = $${i}`,
            vals
        );
        wrote++;
        console.log(`  ✓ ${lake.name.padEnd(34)} [${flavor.padEnd(11)}]  ${needLifestyle ? '+lifestyle ' : ''}${needSeasons ? '+seasons ' : ''}`);
    }
    return { wrote, skipped, total: rows.length };
}

async function processTowns() {
    let where = `1 = 1`;
    const params = [];
    if (slugArg) { params.push(slugArg); where = `slug = $${params.length}`; }
    const { rows } = await pool.query(
        `SELECT id, slug, name, region, state, lifestyle_text, seasons_text, active
           FROM tags
          WHERE ${where} AND active = TRUE
          ORDER BY name ASC`,
        params
    );

    let wrote = 0, skipped = 0;
    for (const tag of rows) {
        const flavor    = pickTownFlavor(tag.region);
        const updates   = [];
        const vals      = [];
        let i           = 1;

        const needLifestyle = FORCE || !tag.lifestyle_text || !tag.lifestyle_text.trim();
        const needSeasons   = FORCE || !tag.seasons_text   || !tag.seasons_text.trim();

        if (needLifestyle) {
            updates.push(`lifestyle_text = $${i++}`);
            vals.push(htmlToPlain(lifestyleHtmlForTown(tag)));
        }
        if (needSeasons) {
            updates.push(`seasons_text = $${i++}`);
            vals.push(htmlToPlain(seasonsHtmlForTown(tag)));
        }

        if (!updates.length) {
            skipped++;
            console.log(`  · ${tag.name.padEnd(34)} [${flavor.padEnd(11)}]  already populated, skipping`);
            continue;
        }

        if (DRY) {
            console.log(`  ↻ ${tag.name.padEnd(34)} [${flavor.padEnd(11)}]  would write ${needLifestyle ? 'lifestyle ' : ''}${needSeasons ? 'seasons ' : ''}(DRY)`);
            wrote++;
            continue;
        }

        updates.push(`updated_at = NOW()`);
        vals.push(tag.id);
        await pool.query(
            `UPDATE tags SET ${updates.join(', ')} WHERE id = $${i}`,
            vals
        );
        wrote++;
        console.log(`  ✓ ${tag.name.padEnd(34)} [${flavor.padEnd(11)}]  ${needLifestyle ? '+lifestyle ' : ''}${needSeasons ? '+seasons ' : ''}`);
    }
    return { wrote, skipped, total: rows.length };
}

(async () => {
    try {
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(' Lake + town editorial content population');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`  mode:  ${DRY ? 'DRY RUN (no writes)' : 'LIVE WRITE'}`);
        console.log(`  force: ${FORCE ? 'yes (will clobber existing content)' : 'no (skips rows with content)'}`);
        if (slugArg) console.log(`  slug:  ${slugArg}`);
        console.log('');

        console.log('Lakes:');
        const lakeResult = await processLakes();
        console.log(`  → ${lakeResult.wrote} written, ${lakeResult.skipped} skipped, ${lakeResult.total} total`);
        console.log('');

        console.log('Towns:');
        const townResult = await processTowns();
        console.log(`  → ${townResult.wrote} written, ${townResult.skipped} skipped, ${townResult.total} total`);
        console.log('');

        console.log('Done.');
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('FAILED:', err.message);
        console.error(err);
        await pool.end().catch(() => {});
        process.exit(1);
    }
})();
