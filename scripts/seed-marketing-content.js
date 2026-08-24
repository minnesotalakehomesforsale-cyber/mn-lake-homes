/**
 * seed-marketing-content.js
 * Prefills the content calendar (marketing_posts) with:
 *   • the scheduled Monday 9 AM Central email newsletter, and
 *   • a starter set of Minnesota-lake-home social posts + stories.
 *
 * These are editable DRAFTS — open any of them in Marketing → Social / Newsletter
 * and change the copy, dates, tags, or performance. The site owner's original
 * 54-post / 33-story list was provided in an earlier session and isn't
 * recoverable verbatim here, so this seeds a genuinely useful starter calendar
 * to replace or extend rather than an empty grid.
 *
 * Idempotent: skips any row whose (title, content_type) already exists, so it's
 * safe to re-run. Nothing here is published anywhere — a marketing_post is just
 * a plan/tracker row.
 *
 * Run (where DATABASE_URL is set — e.g. the Render shell):
 *   ALLOW_PUBLISH_WRITES=1 node scripts/seed-marketing-content.js
 */

if (process.env.ALLOW_PUBLISH_WRITES !== '1') {
    console.error('\n⛔ seed-marketing-content.js refuses to run without ALLOW_PUBLISH_WRITES=1.');
    console.error('   It writes rows to the production content calendar. To run deliberately:');
    console.error('   ALLOW_PUBLISH_WRITES=1 node scripts/seed-marketing-content.js\n');
    process.exit(1);
}

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');

// ── Date helpers ────────────────────────────────────────────────────────────
const ymd = (d) => d.toISOString().slice(0, 10);
function nextMonday(from = new Date()) {
    const d = new Date(from);
    const day = d.getDay();                 // 0 Sun … 1 Mon … 6 Sat
    const delta = (8 - day) % 7 || 7;       // days until the NEXT Monday (never today)
    d.setDate(d.getDate() + delta);
    return d;
}
const base = new Date();
const plus = (days) => { const d = new Date(base); d.setDate(d.getDate() + days); return ymd(d); };
const MON = ymd(nextMonday());

// ── The scheduled newsletter (concrete) ─────────────────────────────────────
const newsletter = {
    title: `Weekly Newsletter — ${new Date(MON + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
    content_type: 'email',
    channel: null,
    status: 'scheduled',
    due_date: MON,
    scheduled_time: '09:00',
    caption: 'This week on the lake: new listings, a market note, and a lake-life tip. (Sends Monday 9:00 AM Central.)',
    description: 'Scheduled email newsletter — goes out Monday at 9:00 AM Central.',
    tags: ['newsletter', 'email'],
    performance: {},
};

// ── Starter social posts (edit/replace freely) ──────────────────────────────
const POSTS = [
    { title: 'New listing spotlight — lakefront cabin', caption: 'Just listed on the water 🌅 Swipe for the dock view. Link in bio to tour.', channel: 'instagram', due: plus(2), tags: ['listing', 'new-listing'] },
    { title: 'Buyer tip: 5 things to check on a lakefront home', caption: 'Before you fall in love with the view, check these 5 things: shoreline type, well/septic, water depth, easements, and lake association rules.', channel: 'facebook', due: plus(4), tags: ['buyer-tips', 'education'] },
    { title: 'Market update: MN lake home prices this season', caption: 'Where lake-country prices are landing this month — and what it means if you\'re buying or selling.', channel: 'facebook', due: plus(6), tags: ['market-update'] },
    { title: 'Why fall is a great time to buy on the lake', caption: 'Fewer buyers, motivated sellers, and you get to see the property in shoulder season. 🍂', channel: 'instagram', due: plus(9), tags: ['buyer-tips', 'fall'] },
    { title: 'Local spotlight: best swimming beaches', caption: 'Our favorite sandy-bottom spots for a summer swim. Save this one 📌', channel: 'instagram', due: plus(11), tags: ['local', 'lake-life'] },
    { title: 'Fishing report — walleye & bass', caption: 'What\'s biting and where. Tag the angler who needs to see this. 🎣', channel: 'facebook', due: plus(13), tags: ['fishing', 'lake-life'] },
    { title: 'Dock & shoreline fall maintenance', caption: 'Getting the dock ready for winter? Here\'s the short checklist.', channel: 'instagram', due: plus(16), tags: ['tips', 'seasonal'] },
    { title: 'Sunset over the lake', caption: 'No caption needed. 🌇 Which lake is this? Guess below.', channel: 'instagram', due: plus(18), tags: ['photo', 'lake-life'] },
    { title: 'Financing a lake cabin vs a primary home', caption: 'Second-home and cabin loans work a little differently. Here\'s what to know before you shop.', channel: 'facebook', due: plus(20), tags: ['financing', 'education'] },
    { title: 'Client testimonial', caption: '"They found us the cabin we\'d been dreaming about for years." — happy buyers on [Lake]. 💙', channel: 'instagram', due: plus(23), tags: ['testimonial', 'social-proof'] },
    { title: 'Weekend open house announcement', caption: 'Open house this Saturday 11–1 on the water. Details + directions in bio.', channel: 'facebook', due: plus(25), tags: ['open-house', 'listing'] },
    { title: 'Agent spotlight — meet your lake specialist', caption: 'Local, on the water, and here to help you buy or sell in lake country.', channel: 'instagram', due: plus(28), tags: ['agent', 'brand'] },
];

// ── Starter stories (edit/replace freely) ───────────────────────────────────
const STORIES = [
    { title: 'Poll: lake life or city life?', caption: 'Tap your pick 👆', channel: 'instagram', due: plus(1), tags: ['poll', 'engagement'] },
    { title: 'This or that: pontoon vs kayak', caption: 'Vote in the sticker!', channel: 'instagram', due: plus(3), tags: ['engagement'] },
    { title: 'Behind the scenes: showing a lakefront home', caption: 'Come along on today\'s showing 🎥', channel: 'instagram', due: plus(5), tags: ['bts', 'brand'] },
    { title: 'Quick tip: lakefront insurance', caption: 'One thing buyers forget to budget for.', channel: 'instagram', due: plus(8), tags: ['tips', 'education'] },
    { title: 'Countdown: open house this weekend', caption: 'Countdown sticker + address.', channel: 'instagram', due: plus(10), tags: ['open-house'] },
    { title: 'Q&A: ask me about buying on the lake', caption: 'Drop your questions in the box 📥', channel: 'instagram', due: plus(14), tags: ['qa', 'engagement'] },
    { title: 'Sunset time-lapse', caption: 'Golden hour on the water.', channel: 'instagram', due: plus(17), tags: ['photo', 'lake-life'] },
    { title: 'New listing teaser', caption: 'Coming to market this week 👀 Swipe up when it\'s live.', channel: 'instagram', due: plus(22), tags: ['listing', 'teaser'] },
];

function toRow(x, content_type) {
    return {
        title: x.title,
        content_type,
        channel: x.channel || null,
        status: 'idea',
        due_date: x.due || null,
        scheduled_time: x.time || null,
        caption: x.caption || null,
        description: null,
        tags: x.tags || [],
        performance: {},
    };
}

async function seed() {
    const client = await pool.connect();
    let inserted = 0, skipped = 0;
    try {
        const rows = [
            newsletter,
            ...POSTS.map(p => toRow(p, 'post')),
            ...STORIES.map(s => toRow(s, 'story')),
        ];
        for (const r of rows) {
            const dupe = await client.query(
                `SELECT 1 FROM marketing_posts WHERE title = $1 AND content_type = $2 LIMIT 1`,
                [r.title, r.content_type]
            );
            if (dupe.rowCount) { skipped++; continue; }
            await client.query(
                `INSERT INTO marketing_posts
                     (title, description, caption, tags, due_date, scheduled_time,
                      channel, status, content_type, performance)
                 VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb)`,
                [r.title, r.description, r.caption, JSON.stringify(r.tags), r.due_date,
                 r.scheduled_time, r.channel, r.status, r.content_type, JSON.stringify(r.performance)]
            );
            inserted++;
        }
        console.log(`\n✅ Content calendar seeded — ${inserted} new item(s), ${skipped} already present.`);
        console.log(`   • Newsletter scheduled for ${MON} at 09:00 (Central).`);
        console.log(`   • ${POSTS.length} starter posts + ${STORIES.length} starter stories (drafts — edit in Marketing).\n`);
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(err => { console.error('[seed-marketing-content]', err); process.exit(1); });
