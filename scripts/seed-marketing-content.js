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

// ── Feed posts (the 54-post "Social Calendar — Feed") ───────────────────────
// This sheet lives in the owner's workbook. Paste it in here — Nb, Day →
// due_date, Headline → title, Caption, Hashtags → tags — to bulk-load with the
// exact copy + X/Twitter versions. Left empty until the sheet is exported as
// text so we don't seed misread captions off a screenshot.
const POSTS = [];

// ── The 33 stories (owner's "2 - Social Posts (Working)/Stories/") ──────────
// Vertical / 24-hour, no fixed order — seeded UNDATED as a story bank tagged by
// set. Drop them onto days to support whatever the feed is that week. Set 2
// pairs with feed slots 21–27 (agent-join), Set 3 with 29–45 (business map).
const STORIES = [
    // Set 1 — Mixed opener
    { title: '1a — Some mornings you can own',       set: 'Set 1 — Mixed opener',                        tags: ['set-1', 'buyers'] },
    { title: '1b — Free profile poll (interactive)', set: 'Set 1 — Mixed opener',                        tags: ['set-1', 'agent-join', 'interactive'] },
    { title: '1c — Stand on the dock at 4pm',        set: 'Set 1 — Mixed opener',                        tags: ['set-1', 'buyer-tip'] },
    // Set 2 — Agent recruitment (pairs with feed 21–27)
    { title: '2a — Your name on your water',         set: 'Set 2 — Agent recruitment · pairs feed 21–27', tags: ['set-2', 'agent-recruitment'] },
    { title: '2b — Profile preview',                 set: 'Set 2 — Agent recruitment · pairs feed 21–27', tags: ['set-2', 'agent-recruitment'] },
    { title: '2c — Three zeros price list',          set: 'Set 2 — Agent recruitment · pairs feed 21–27', tags: ['set-2', 'agent-recruitment'] },
    { title: '2d — Live by tonight',                 set: 'Set 2 — Agent recruitment · pairs feed 21–27', tags: ['set-2', 'agent-recruitment'] },
    { title: '2e — What the free profile includes',  set: 'Set 2 — Agent recruitment · pairs feed 21–27', tags: ['set-2', 'agent-recruitment'] },
    { title: "2f — CEO quote — Why it's free for agents", set: 'Set 2 — Agent recruitment · pairs feed 21–27', tags: ['set-2', 'agent-recruitment', 'ceo-quote'] },
    { title: '2g — Do you make the list',            set: 'Set 2 — Agent recruitment · pairs feed 21–27', tags: ['set-2', 'agent-recruitment'] },
    { title: "2h — What's the catch",                set: 'Set 2 — Agent recruitment · pairs feed 21–27', tags: ['set-2', 'agent-recruitment'] },
    { title: "2i — They're searching your lake now", set: 'Set 2 — Agent recruitment · pairs feed 21–27', tags: ['set-2', 'agent-recruitment'] },
    { title: '2j — Claim your water',                set: 'Set 2 — Agent recruitment · pairs feed 21–27', tags: ['set-2', 'agent-recruitment'] },
    // Set 3 — Business listing / lake business map (pairs with feed 29–45)
    { title: '3a — Get on the lake business map',    set: 'Set 3 — Business listing · pairs feed 29–45',  tags: ['set-3', 'business-listing'] },
    { title: '3b — Who belongs on it',               set: 'Set 3 — Business listing · pairs feed 29–45',  tags: ['set-3', 'business-listing'] },
    { title: '3c — The four questions',              set: 'Set 3 — Business listing · pairs feed 29–45',  tags: ['set-3', 'business-listing'] },
    { title: '3d — What it costs',                   set: 'Set 3 — Business listing · pairs feed 29–45',  tags: ['set-3', 'business-listing'] },
    { title: '3e — Three steps to get listed',       set: 'Set 3 — Business listing · pairs feed 29–45',  tags: ['set-3', 'business-listing'] },
    { title: '3f — CEO quote — The lake economy',    set: 'Set 3 — Business listing · pairs feed 29–45',  tags: ['set-3', 'business-listing', 'ceo-quote'] },
    { title: "3g — What's included",                 set: 'Set 3 — Business listing · pairs feed 29–45',  tags: ['set-3', 'business-listing'] },
    { title: '3h — Respect the trades',              set: 'Set 3 — Business listing · pairs feed 29–45',  tags: ['set-3', 'business-listing'] },
    { title: "3i — What's the catch",                set: 'Set 3 — Business listing · pairs feed 29–45',  tags: ['set-3', 'business-listing'] },
    { title: '3j — Claim your pin',                  set: 'Set 3 — Business listing · pairs feed 29–45',  tags: ['set-3', 'business-listing'] },
    // Set 4 — Photo stories, brand + buyers
    { title: '4a — Ten thousand lakes',              set: 'Set 4 — Photo · brand + buyers',               tags: ['set-4', 'brand'] },
    { title: '4b — People who know the water',       set: 'Set 4 — Photo · brand + buyers',               tags: ['set-4', 'about-us'] },
    { title: '4c — The cabin is the whole point',    set: 'Set 4 — Photo · brand + buyers',               tags: ['set-4', 'buyers'] },
    { title: '4d — Buying a lake town',              set: 'Set 4 — Photo · brand + buyers',               tags: ['set-4', 'buyers'] },
    { title: '4e — Every window earns its view',     set: 'Set 4 — Photo · brand + buyers',               tags: ['set-4', 'buyers'] },
    { title: '4f — Cabins to legacy lakefront',      set: 'Set 4 — Photo · brand + buyers',               tags: ['set-4', 'about-us'] },
    { title: '4g — Which way does the dock face',    set: 'Set 4 — Photo · brand + buyers',               tags: ['set-4', 'buyer-tip'] },
    { title: '4h — Two blocks back is still lake life', set: 'Set 4 — Photo · brand + buyers',            tags: ['set-4', 'buyers'] },
    { title: '4i — Your lake your listings',         set: 'Set 4 — Photo · brand + buyers',               tags: ['set-4', 'agent-join'] },
    { title: '4j — On the map lake owners use',      set: 'Set 4 — Photo · brand + buyers',               tags: ['set-4', 'business-listing'] },
];

function toRow(x, content_type) {
    return {
        title: x.title,
        content_type,
        channel: x.channel || (content_type === 'story' ? 'instagram' : null),
        status: 'idea',
        due_date: x.due || null,
        scheduled_time: x.time || null,
        caption: x.caption || null,
        description: x.set || x.description || null,
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
        console.log(`   • ${POSTS.length} feed posts + ${STORIES.length} stories (undated story bank, tagged by set).`);
        if (!POSTS.length) console.log(`   • Feed posts pending — paste the "Social Calendar — Feed" sheet into POSTS to load all 54.\n`);
        else console.log('');
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(err => { console.error('[seed-marketing-content]', err); process.exit(1); });
