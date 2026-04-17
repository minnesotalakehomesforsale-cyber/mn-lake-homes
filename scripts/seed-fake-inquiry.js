/**
 * seed-fake-inquiry.js
 * Inserts a few realistic fake contact inquiries (varied source + type
 * + status + read-state) so the admin Inquiries tab has demo data and
 * the sidebar unread badge actually shows a number.
 *
 * Idempotent-ish: uses dedicated test emails so running it again
 * adds duplicates (which is fine for demo). Run once on each env:
 *   Locally:  node scripts/seed-fake-inquiry.js
 *   Render:   node scripts/seed-fake-inquiry.js   (in Render Shell)
 */

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');

const inquiries = [
    {
        source: 'mnlakehomes',
        name: 'Sarah Donovan',
        email: 'sarah.donovan@gmail.com',
        phone: '612-555-0184',
        inquirer_type: 'buying',
        message: `Hi! My husband and I are relocating from Chicago and looking for a 4+ bedroom home on Lake Minnetonka or Gull Lake. Budget is around $1.2M. We'd love to connect with an agent this week — we'll be in MN next weekend for a look. Thanks!`,
        page_url: 'https://minnesotalakehomesforsale.com/pages/public/contact.html',
        minutes_ago: 12,
    },
    {
        source: 'commonrealtor',
        name: 'Jordan Park',
        email: 'jordan.park@example.com',
        phone: '651-555-0293',
        inquirer_type: 'partner',
        message: `Hey team — I run a boutique real estate tech firm in the Twin Cities and I'd love to explore how we might partner. Our tools could be a natural fit for your network. Can we set up a 20 minute call?`,
        page_url: 'https://minnesotalakehomesforsale.com/pages/public/commonrealtor.html',
        minutes_ago: 45,
    },
    {
        source: 'mnlakehomes',
        name: 'Alex Nguyen',
        email: 'alex.nguyen@gmail.com',
        phone: null,
        inquirer_type: 'career — Engineering',
        message: `CAREER APPLICATION — Engineering\n\nExperience: 6 years (Node, React, Postgres)\nResume / LinkedIn: https://linkedin.com/in/alex-nguyen\n\nI've been following MN Lake Homes for a few months — love that you're building something specifically for the Minnesota market. I grew up summering on Leech Lake. Would love to chat about engineering roles. I bring deep fullstack experience and have shipped a few consumer real estate products.`,
        page_url: 'https://minnesotalakehomesforsale.com/pages/public/careers.html',
        minutes_ago: 180,
    },
];

(async () => {
    let inserted = 0;
    for (const i of inquiries) {
        await pool.query(
            `INSERT INTO contact_inquiries
                (source, name, email, phone, inquirer_type, message, page_url, status, is_read, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', false, NOW() - ($8 || ' minutes')::interval)`,
            [i.source, i.name, i.email, i.phone, i.inquirer_type, i.message, i.page_url, String(i.minutes_ago)]
        );
        console.log(`  ✓ [${i.source.padEnd(14)}] ${i.name} — ${i.inquirer_type}`);
        inserted++;
    }

    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS unread FROM contact_inquiries WHERE is_read = false AND deleted_at IS NULL`
    );
    console.log(`\nInserted ${inserted} fake inquiries. Unread total now: ${rows[0].unread}`);
    await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
