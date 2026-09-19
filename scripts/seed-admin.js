/**
 * seed-admin.js
 * Run this script ONCE to create the first super_admin user in the database.
 *
 * Usage (from project root):
 *   NODE_ENV=staging node scripts/seed-admin.js
 *
 * Or on Render Shell:
 *   node scripts/seed-admin.js
 *
 * Set the credentials by passing env vars or edit the defaults below.
 */

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.local';
require('dotenv').config({ path: envFile });

const pool = require('../src/database/pool');
const bcrypt = require('bcrypt');

const ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL    || 'admin@mnlakehomes.com';
// SEC-04: no default admin password. Silently seeding a super_admin with a
// well-known password ('ChangeMe123!') is a prod backdoor if the env var is
// forgotten. Require SEED_ADMIN_PASSWORD; fail loud below if it's unset.
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const ADMIN_NAME     = process.env.SEED_ADMIN_NAME     || 'Platform Admin';

async function seed() {
    console.log(`\n[Seed] Seeding super_admin: ${ADMIN_EMAIL}`);

    const client = await pool.connect();
    try {
        const existing = await client.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
        if (existing.rows.length > 0) {
            console.log('[Seed] Admin already exists — skipping.');
            return;
        }
        // Only enforced when actually creating an admin (not on the skip path).
        if (!ADMIN_PASSWORD) {
            console.error('[Seed] SEED_ADMIN_PASSWORD is required to create an admin — refusing to seed a default/known password. Set it and re-run.');
            process.exitCode = 1;
            return;
        }

        const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
        const nameParts = ADMIN_NAME.split(' ');

        await client.query(
            `INSERT INTO users (first_name, last_name, full_name, email, password_hash, role, account_status)
             VALUES ($1, $2, $3, $4, $5, 'super_admin', 'active')`,
            [nameParts[0], nameParts.slice(1).join(' ') || '', ADMIN_NAME, ADMIN_EMAIL, hash]
        );

        console.log('[Seed] ✅ Admin created successfully!');
        console.log(`       Email    : ${ADMIN_EMAIL}`);
        console.log(`       Password : ${ADMIN_PASSWORD}`);
        console.log(`       Role     : super_admin`);
        console.log('\n       IMPORTANT: Change this password after first login.\n');
    } catch (err) {
        console.error('[Seed] ❌ Error:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
