/**
 * seed-prod-links.js — tags every agent to every active geo tag, and
 * links every active business to every active lake. Run this once
 * against production so the Featured Agents + Businesses sections on
 * lake/town pages actually have data to show.
 *
 *   # against prod
 *   DATABASE_URL=postgres://prod_url node scripts/seed-prod-links.js
 *
 *   # against local
 *   node scripts/seed-prod-links.js
 *
 * Idempotent: clears + re-inserts per entity, so safe to re-run whenever
 * new tags/lakes/agents/businesses are added.
 */

if (!process.env.DATABASE_URL) {
    require('dotenv').config({ path: '.env.local' });
}
const pool = require('../src/database/pool');
console.log('→ Connecting to:', (process.env.DATABASE_URL || '').replace(/:[^:@]+@/, ':****@'));

(async () => {
    try {
        // ── 1. Agents → all geo tags ────────────────────────────────
        const { rows: agents } = await pool.query(
            `SELECT u.id, u.email, u.full_name
             FROM users u
             WHERE u.role = 'agent' AND u.account_status = 'active'`
        );
        const { rows: tags } = await pool.query(
            'SELECT id FROM tags WHERE active = TRUE'
        );
        if (agents.length && tags.length) {
            console.log(`\nTagging ${agents.length} agent(s) to ${tags.length} geo tag(s)…`);
            for (const a of agents) {
                await pool.query('DELETE FROM user_tags WHERE user_id = $1', [a.id]);
                for (const t of tags) {
                    await pool.query(
                        `INSERT INTO user_tags (user_id, tag_id) VALUES ($1, $2)
                         ON CONFLICT DO NOTHING`,
                        [a.id, t.id]
                    );
                }
                console.log(`  ✓ ${a.full_name || a.email} → ${tags.length} tags`);
            }
        } else {
            console.log('\nSkip: no active agents or geo tags.');
        }

        // ── 2. Businesses → all lakes ───────────────────────────────
        const { rows: businesses } = await pool.query(
            `SELECT id, name FROM businesses WHERE status = 'active'`
        );
        const { rows: lakes } = await pool.query(
            `SELECT id FROM lakes WHERE status = 'published'`
        );
        if (businesses.length && lakes.length) {
            console.log(`\nLinking ${businesses.length} business(es) to ${lakes.length} lake(s)…`);
            for (const b of businesses) {
                await pool.query('DELETE FROM business_lakes WHERE business_id = $1', [b.id]);
                for (const l of lakes) {
                    await pool.query(
                        `INSERT INTO business_lakes (business_id, lake_id) VALUES ($1, $2)
                         ON CONFLICT DO NOTHING`,
                        [b.id, l.id]
                    );
                }
                console.log(`  ✓ ${b.name} → ${lakes.length} lakes`);
            }
        } else {
            console.log('\nSkip: no active businesses or published lakes.');
        }

        console.log('\nDone. Featured Agents + Businesses sections should render on every lake + town page now.');
        await pool.end();
    } catch (err) {
        console.error('Failed:', err.message);
        process.exit(1);
    }
})();
