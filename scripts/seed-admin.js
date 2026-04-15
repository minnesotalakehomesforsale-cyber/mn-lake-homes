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
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
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
