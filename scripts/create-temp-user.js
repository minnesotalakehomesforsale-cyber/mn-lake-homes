// Creates (or refreshes) a demo client user + a couple of sample leads so
// the admin Users page has a non-admin row to click into and the Inquiries
// tab has content. Idempotent — re-running just updates the user and adds
// fresh demo leads if the previous ones were cleaned up.
//
// Run locally: node scripts/create-temp-user.js
// Run on prod (Render shell): node scripts/create-temp-user.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const DEMO_EMAIL    = 'demo.client@mnlakehomes.test';
const DEMO_PASSWORD = 'demopass1234';
const DEMO_FIRST    = 'Demo';
const DEMO_LAST     = 'Client';
const DEMO_PHONE    = '612-555-0199';

(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        // 1. Upsert the user.
        const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
        const u = await pool.query(
            `INSERT INTO users (first_name, last_name, full_name, email, phone, password_hash, role, account_status)
             VALUES ($1, $2, $3, $4, $5, $6, 'client', 'active')
             ON CONFLICT (email) DO UPDATE
                SET first_name = EXCLUDED.first_name,
                    last_name  = EXCLUDED.last_name,
                    full_name  = EXCLUDED.full_name,
                    phone      = EXCLUDED.phone,
                    password_hash = EXCLUDED.password_hash,
                    role          = 'client',
                    account_status = 'active',
                    updated_at = NOW()
             RETURNING id, email`,
            [DEMO_FIRST, DEMO_LAST, `${DEMO_FIRST} ${DEMO_LAST}`, DEMO_EMAIL, DEMO_PHONE, hash]
        );
        const userId = u.rows[0].id;
        console.log(`✓ Demo user ready: ${u.rows[0].email} (${userId})`);

        // 2. Two sample regular leads — buyer + seller — so the Inquiries
        //    tab has rows of different types. Skip if either already exists.
        const seedLead = async (type, source, message, address) => {
            const exists = await pool.query(
                `SELECT 1 FROM leads WHERE user_id = $1 AND lead_type = $2 LIMIT 1`,
                [userId, type]
            );
            if (exists.rows.length) {
                console.log(`  (lead [${type}] already present — skipped)`);
                return;
            }
            await pool.query(
                `INSERT INTO leads (full_name, first_name, email, phone, message,
                                    lead_type, lead_source, lead_status,
                                    property_address, user_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9)`,
                [`${DEMO_FIRST} ${DEMO_LAST}`, DEMO_FIRST, DEMO_EMAIL, DEMO_PHONE,
                 message, type, source, address, userId]
            );
            console.log(`  + seeded ${type} lead`);
        };
        await seedLead('buyer',  'buyer',  'Looking for a 3BR cabin on Detroit Lake under $850k.', '123 Demo Shore Dr, Detroit Lakes, MN');
        await seedLead('seller', 'seller', 'Considering listing our place on Gull Lake next spring.', '88 Demo Point Rd, Nisswa, MN');

        // 3. One sample cash-offer lead — matched by email in the inquiries
        //    query, so it shows up under "Cash offers" without needing a
        //    user_id column on cash_offer_leads.
        const cashExists = await pool.query(
            `SELECT 1 FROM cash_offer_leads WHERE LOWER(email) = LOWER($1) LIMIT 1`,
            [DEMO_EMAIL]
        );
        if (!cashExists.rows.length) {
            await pool.query(
                `INSERT INTO cash_offer_leads (status, full_name, email, phone, address_raw)
                 VALUES ('new', $1, $2, $3, $4)`,
                [`${DEMO_FIRST} ${DEMO_LAST}`, DEMO_EMAIL, DEMO_PHONE,
                 '500 Demo Bay, Lake Minnetonka, MN']
            );
            console.log('  + seeded cash-offer lead');
        } else {
            console.log('  (cash-offer lead already present — skipped)');
        }

        console.log('\nLog in / impersonate test:');
        console.log(`  email:    ${DEMO_EMAIL}`);
        console.log(`  password: ${DEMO_PASSWORD}`);
        console.log('\nAdmin view: /pages/admin/users.html → click "Demo Client" → Inquiries tab.');
    } catch (e) {
        console.error('FAILED:', e.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
