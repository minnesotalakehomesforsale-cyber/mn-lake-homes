// Admin login helper.
//
//   node reset-admin.js
//       → LISTS every admin / super_admin account (email, role, status).
//         Read-only. Tells you which email is your admin login.
//
//   EMAIL="you@example.com" NEWPASS="somethingStrong123" node reset-admin.js
//       → Ensures that user is an ACTIVE admin and sets the password.
//         Creates the user if it doesn't exist. Bumps password_changed_at
//         (which logs out any stale sessions). ROLE defaults to super_admin
//         (the owner); pass ROLE="admin" to override.
//
// Uses .env.production by default; set ENVFILE=.env.staging to target staging.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const ENVFILE = process.env.ENVFILE || '.env.production';
function readEnv(file, key) {
  try {
    const m = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
      .match(new RegExp('^' + key + '\\s*=\\s*(.+)$', 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch (_) {}
  return null;
}

const url = readEnv(ENVFILE, 'DATABASE_URL') || readEnv('.env.local', 'DATABASE_URL');
if (!url) { console.error('No DATABASE_URL found in ' + ENVFILE); process.exit(1); }
console.log('DB host:', (url.match(/@([^:/]+)/) || [])[1] || '(unknown)', '\n');

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const EMAIL = process.env.EMAIL && process.env.EMAIL.trim().toLowerCase();
const NEWPASS = process.env.NEWPASS;
const ROLE = (process.env.ROLE || 'super_admin').trim();

(async () => {
  try {
    // Always show the current admin accounts first.
    const admins = await pool.query(
      `SELECT id, email, role, account_status,
              password_changed_at,
              (password_hash IS NOT NULL) AS has_password
         FROM users
        WHERE role IN ('admin','super_admin')
        ORDER BY role, email`);
    console.log('=== Current admin / super_admin accounts ===');
    if (!admins.rows.length) console.log('  (none found — you have no admin users)');
    console.table(admins.rows);

    if (!EMAIL || !NEWPASS) {
      console.log('\nTo reset/create an admin password, re-run with:');
      console.log('  EMAIL="you@example.com" NEWPASS="newStrongPass123" node reset-admin.js');
      await pool.end();
      return;
    }

    const hash = await bcrypt.hash(NEWPASS, 10);
    const existing = await pool.query(`SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`, [EMAIL]);

    if (existing.rows.length) {
      await pool.query(
        `UPDATE users
            SET password_hash = $2,
                role = $3,
                account_status = 'active',
                password_changed_at = NOW(),
                deleted_at = NULL
          WHERE id = $1`,
        [existing.rows[0].id, hash, ROLE]);
      console.log(`\n✅ Reset existing account "${EMAIL}" → role=${ROLE}, status=active, new password set.`);
    } else {
      await pool.query(
        `INSERT INTO users (first_name, last_name, full_name, email, password_hash, role, account_status, password_changed_at)
         VALUES ('Site','Admin','Site Admin', $1, $2, $3, 'active', NOW())`,
        [EMAIL, hash, ROLE]);
      console.log(`\n✅ Created new admin account "${EMAIL}" → role=${ROLE}, status=active.`);
    }
    console.log('   You can now log in at /login with that email and the password you passed.');
    await pool.end();
  } catch (e) {
    console.error('\n❌ Error:', e.message);
    try { await pool.end(); } catch (_) {}
    process.exit(1);
  }
})();
