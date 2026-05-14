// One-time backfill: link every existing lead to a user account by email.
//
// Going forward, leads link to accounts automatically — by email at submit
// time, and via a signup-time backfill. But leads that were already in the
// database before that logic shipped still have user_id = NULL even when an
// account with the same email exists. This script claims those.
//
// Idempotent — safe to re-run (only touches rows where user_id IS NULL and
// a matching account exists). Run with:
//   node scripts/backfill-lead-user-links.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        // Preview: how many unlinked leads have a matching account?
        const preview = await pool.query(`
            SELECT COUNT(*) AS n
              FROM leads l
              JOIN users u ON LOWER(u.email) = LOWER(l.email)
             WHERE l.user_id IS NULL
               AND l.email IS NOT NULL
               AND l.deleted_at IS NULL
        `);
        const toLink = Number(preview.rows[0].n);
        console.log(`Unlinked leads with a matching account: ${toLink}`);

        if (toLink === 0) {
            console.log('Nothing to backfill. Done.');
            return;
        }

        const res = await pool.query(`
            UPDATE leads l
               SET user_id = u.id, updated_at = NOW()
              FROM users u
             WHERE LOWER(u.email) = LOWER(l.email)
               AND l.user_id IS NULL
               AND l.email IS NOT NULL
               AND l.deleted_at IS NULL
         RETURNING l.id
        `);
        console.log(`✓ Linked ${res.rowCount} lead(s) to existing accounts.`);

        // Report what's still unassigned (no account exists for that email).
        const orphans = await pool.query(`
            SELECT COUNT(*) AS n FROM leads
             WHERE user_id IS NULL AND deleted_at IS NULL
        `);
        console.log(`Still unassigned (no account with that email yet): ${orphans.rows[0].n}`);
        console.log('Done.');
    } catch (e) {
        console.error('FAILED:', e.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
