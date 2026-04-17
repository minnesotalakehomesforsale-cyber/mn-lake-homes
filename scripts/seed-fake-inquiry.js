/**
 * seed-fake-inquiry.js
 * Inserts a single fake contact inquiry as 'new' + unread so the admin
 * badge lights up. Handy for demoing / testing the Inquiries inbox.
 *
 * Run: node scripts/seed-fake-inquiry.js
 */

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');

(async () => {
    const message = `Hi! My husband and I are relocating from Chicago and looking for a 4+ bedroom home on Lake Minnetonka or Gull Lake. Budget is around $1.2M. We'd love to connect with an agent this week if possible — we'll be in MN next weekend for a look. Thanks!`;

    const { rows } = await pool.query(
        `INSERT INTO contact_inquiries
            (source, name, email, phone, inquirer_type, message, page_url, status, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', false, NOW() - INTERVAL '12 minutes')
         RETURNING id, name, email, status, is_read`,
        [
            'mnlakehomes',
            'Sarah Donovan',
            'sarah.donovan@gmail.com',
            '612-555-0184',
            'buying',
            message,
            'https://minnesotalakehomesforsale.com/pages/public/contact.html',
        ]
    );
    console.log('✓ Inquiry created:', rows[0]);

    const { rows: cnt } = await pool.query(
        `SELECT COUNT(*)::int AS unread FROM contact_inquiries WHERE is_read = false AND deleted_at IS NULL`
    );
    console.log('Unread count in inbox:', cnt[0].unread);

    await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
