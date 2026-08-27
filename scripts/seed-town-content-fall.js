/**
 * seed-town-content-fall.js
 * Fills real intro_text + description + SEO on the 22 curated MN town pages that
 * were rendering `noindex` because they had NO written content. A town indexes
 * only when it has intro_text OR description, so this both makes them rankable
 * and gives them genuine, locally-specific copy.
 *
 * Reads the four town-content-fall-2026-part{A..D}.js data files (22 towns) and
 * UPDATEs the matching tags rows. Only touches towns that exist; reports any
 * slug not found. Idempotent — safe to re-run.
 *
 * Run:  ALLOW_PUBLISH_WRITES=1 node scripts/seed-town-content-fall.js
 */

if (process.env.ALLOW_PUBLISH_WRITES !== '1') {
    console.error('\n⛔ Refuses to run without ALLOW_PUBLISH_WRITES=1 (writes public town-page copy).');
    console.error('   ALLOW_PUBLISH_WRITES=1 node scripts/seed-town-content-fall.js\n');
    process.exit(1);
}

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');

let towns = [];
for (const part of ['A', 'B', 'C', 'D']) {
    try { towns = towns.concat(require(`../src/data/town-content-fall-2026-part${part}.js`)); }
    catch (e) { console.warn(`  ⚠️ could not load part${part}: ${e.message}`); }
}

async function seed() {
    if (!towns.length) { console.error('No town content loaded — nothing to do.'); process.exit(1); }
    const client = await pool.connect();
    let updated = 0, notFound = [];
    try {
        for (const t of towns) {
            const r = await client.query(
                `UPDATE tags
                    SET intro_text      = $2,
                        description     = $3,
                        seo_title       = $4,
                        seo_description = $5,
                        updated_at      = NOW()
                  WHERE slug = $1`,
                [t.slug, t.intro_text || null, t.description || null, t.seo_title || null, t.seo_description || null]
            );
            if (r.rowCount) {
                const wc = (t.description || '').split(/\s+/).filter(Boolean).length;
                console.log(`  ✓ ${t.slug.padEnd(18)} (${wc} words)`);
                updated++;
            } else {
                notFound.push(t.slug);
            }
        }
        console.log(`\n✅ Town copy seeded — ${updated} town(s) updated (now indexable).`);
        if (notFound.length) console.log(`   ⚠️ slug not found (skipped): ${notFound.join(', ')}`);
        console.log(`   Re-run  node scripts/fix-pages.js  → these towns should drop out of "need attention",`);
        console.log(`   and each /towns/<slug> should now render index,follow.\n`);
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(err => { console.error('[seed-town-content-fall]', err.message); process.exit(1); });
