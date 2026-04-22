/**
 * tag-all-agents-everywhere.js — links every agent in the DB to every
 * active geo tag so they surface on every lake + town page.
 *
 *   # against prod
 *   DATABASE_URL=postgres://… node scripts/tag-all-agents-everywhere.js
 *
 *   # against local
 *   node scripts/tag-all-agents-everywhere.js
 *
 * Idempotent: clears existing user_tags per agent, then re-inserts a
 * full set. Safe to re-run whenever new tags are added.
 */

if (!process.env.DATABASE_URL) {
    require('dotenv').config({ path: '.env.local' });
}
const pool = require('../src/database/pool');
console.log('→ Connecting to:', (process.env.DATABASE_URL || '').replace(/:[^:@]+@/, ':****@'));

(async () => {
    try {
        // Every agent user — regardless of membership tier. Also includes
        // business_owner/admin rows filtered out so we don't touch them.
        const { rows: agents } = await pool.query(
            `SELECT u.id, u.email, u.full_name
             FROM users u
             WHERE u.role = 'agent' AND u.account_status = 'active'`
        );
        if (!agents.length) {
            console.log('No active agents found. Nothing to tag.');
            await pool.end();
            return;
        }

        const { rows: tags } = await pool.query(
            'SELECT id, name FROM tags WHERE active = TRUE'
        );
        if (!tags.length) {
            console.log('No active tags found. Nothing to link to.');
            await pool.end();
            return;
        }
        console.log(`Tagging ${agents.length} agent(s) to ${tags.length} geo tag(s)…\n`);

        for (const a of agents) {
            // Start fresh — matches the David Chen pattern in seed-agents.
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
        console.log('\nDone. Every agent should now appear on every lake + town page.');
        await pool.end();
    } catch (err) {
        console.error('Failed:', err.message);
        process.exit(1);
    }
})();
