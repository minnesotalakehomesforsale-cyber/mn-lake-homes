/**
 * seed-marketing-content.js
 * Prefills the content calendar (marketing_posts) with the owner's real plan:
 *   • 54 feed posts  (Mon/Wed/Fri, Aug–Dec) — #1–7 marked posted, #8+ scheduled
 *   • 33 stories     (Tue/Thu shadow schedule, Aug–Dec)
 *   • the Monday 9 AM Central email newsletter
 *
 * Each row carries its card ID (e.g. 4c), theme, and look in the internal-notes
 * field + tags, so you can match it to the file in your Posts/Stories folders.
 * Captions are left blank on purpose — paste the real copy per card when you post.
 *
 * Idempotent: skips any row whose (title, content_type) already exists, so it's
 * safe to re-run. Nothing here publishes anything — a marketing_post is a
 * plan/tracker row only.
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

const slug  = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const d2026 = (s) => { const [m, dd] = s.split('/'); return `2026-${m.padStart(2, '0')}-${dd.padStart(2, '0')}`; };

// ── The Monday 9 AM Central newsletter (adjust the date in the UI if needed) ─
const newsletter = {
    title: 'Weekly Newsletter — August 31',
    content_type: 'email',
    channel: null,
    status: 'scheduled',
    due_date: '2026-08-31',
    scheduled_time: '09:00',
    caption: 'This week on the lake: new listings, a market note, and a lake-life tip. (Sends Monday 9:00 AM Central.)',
    description: 'Scheduled email newsletter — goes out Monday at 9:00 AM Central.',
    tags: ['newsletter', 'email'],
    performance: {},
};

// ── 54 feed posts — date | id | theme | look | headline | posted(y/n) ───────
const FEED_RAW = `
8/01|8a|Brand|Photo|Ten thousand lakes. One place to start.|y
8/01|4a|About us|Light|Every family deserves an agent who knows the water|y
8/07|2b|Brand|Blue|11,842 lakes. A specialist for the one you want.|y
8/10|4g|About us|Dark|One lake at a time (our goal)|y
8/12|4b|CEO quote|Dark|You can't learn a lake from a listing sheet|y
8/14|4d|About us|Light|What we actually do.|y
8/17|4c|Brand|Blue|Lake homes get sold like regular houses. They aren't.|y
8/19|5c|Agents|Blue|Free to join. Free to stay.|n
8/21|8b|About us|Photo|Lake homes, shown by people who know the water.|n
8/24|4f|About us|Light|How we work with you (our promise)|n
8/26|7c|Agents|Dark|Your profile on MN's lake home network. Join free.|n
8/28|5i|Brand|Light|Local expertise = a house vs a home|n
8/31|2a|Buyers|Photo|Wake up here.|n
9/02|3d|Agents|Photo|You know the water. Get found for it.|n
9/04|1c|Buyers|Light|We know these lakes by name.|n
9/07|5b|Sellers|Blue|Your shoreline is the most valuable thing you own.|n
9/09|3c|Agents|Light|What a free profile actually gets you.|n
9/11|2e|Buyer tip|Dark|Five things to check before you buy.|n
9/14|8c|Buyers|Photo|The cabin is the whole point.|n
9/16|1b|Sellers|Light|Thinking of selling your lakefront home?|n
9/18|3a|Agents|Blue|$0 — Your profile on the network. Free.|n
9/21|5e|CEO quote|Blue|Not an investment you check quarterly|n
9/23|7a|Brand|Dark|Water first. House second.|n
9/25|3e|Agents|Light|Three steps and you're on the network.|n
9/28|5a|Buyers|Photo|Nobody ever regretted the lake years.|n
9/30|5f|Buyer tip|Light|'Lakefront' isn't one thing.|n
10/02|6a|Business|Blue|Get on the lake business map. Free.|n
10/05|7d|CEO quote|Dark|Someone who's been on that water in February|n
10/07|8d|Buyers|Photo|You're buying a lake town, not just a lake house.|n
10/09|6f|Business|Dark|On the map by tonight.|n
10/12|2c|Sellers|Light|A lake home isn't sold like a house.|n
10/14|7b|Buyers|Photo|The view is the whole listing.|n
10/16|6d|Business|Light|If lake owners call you, you belong on it.|n
10/19|6g|CEO quote|Blue|The lake economy isn't the listings|n
10/21|8e|Buyers|Photo|Every window should earn its view.|n
10/23|6c|Business|Light|What does it cost to be on the business map? $0.|n
10/26|8f|About us|Photo|From one-room cabins to legacy lakefront.|n
10/28|7e|Buyer tip|Dark|What we check: shoreline, depth, sunset…|n
10/30|6e|Business|Light|Every new lake owner asks the same four questions.|n
11/02|5d|Renters|Light|Rent the lake life before you buy.|n
11/04|4h|About us|Light|Who gets to be on this network (standards)|n
11/06|6i|Business|Photo|Who should we feature next?|n
11/09|4j|About us|Blue|Started with one lake (founding story)|n
11/11|4e|CEO quote|Light|We'd rather tell someone to wait a year|n
11/13|8g|Buyer tip|Photo|Which way does the dock face?|n
11/16|6h|Business|Light|What the free listing gets you.|n
11/18|5g|FAQ|Light|What does it cost to get matched? $0.|n
11/20|5h|Sellers|Photo|The quiet season is the buyer's season.|n
11/23|7f|Business|Dark|On the map lake owners actually use.|n
11/25|2d|About us|Light|The MN Lake Homes standard — honest timing.|n
11/27|4i|About us|Photo|A real person reads every request (the team)|n
11/30|6j|Business|Light|Claim your pin.|n
12/02|5j|Buyers|Light|How to start looking, without the pressure.|n
12/04|8h|Buyers|Photo|Two blocks back is still lake life.|n
`;

// ── 33 stories — date | id | theme | headline ──────────────────────────────
const STORY_RAW = `
8/27|1b|Agents|Free profile poll (interactive — IG poll sticker)
9/01|2a|Agents|Your name on your water
9/03|2i|Agents|They're searching your lake now
9/08|2b|Agents|Profile preview
9/10|2e|Agents|What the free profile includes
9/15|2c|Agents|Three zeros price list
9/17|2f|CEO quote|Why it's free for agents
9/22|2g|Agents|Do you make the list
9/24|2h|Agents|What's the catch
9/29|2d|Agents|Live by tonight
10/01|2j|Agents|Claim your water
10/06|3a|Business|Get on the lake business map
10/08|3b|Business|Who belongs on it
10/13|3e|Business|Three steps to get listed
10/15|3d|Business|What it costs
10/20|3c|Business|The four questions
10/22|3f|CEO quote|The lake economy
10/27|3g|Business|What's included
10/29|3h|Business|Respect the trades
11/03|3i|Business|What's the catch
11/05|3j|Business|Claim your pin
11/10|1a|Buyers|Some mornings you can own
11/12|1c|Buyer tip|Stand on the dock at 4pm
11/17|4a|Brand|Ten thousand lakes
11/19|4b|About us|People who know the water
11/24|4c|Buyers|The cabin is the whole point
11/26|4d|Buyers|Buying a lake town (Thanksgiving — skip or move)
12/01|4e|Buyers|Every window earns its view
12/03|4f|About us|Cabins to legacy lakefront
12/08|4g|Buyer tip|Which way does the dock face
12/10|4h|Buyers|Two blocks back is still lake life
12/15|4i|Agents|Your lake your listings
12/17|4j|Business|On the map lake owners use
`;

function parseFeed() {
    return FEED_RAW.trim().split('\n').map((line, i) => {
        const [date, id, theme, look, headline, posted] = line.split('|');
        return {
            title: headline.trim(),
            content_type: 'post',
            channel: 'instagram',
            status: (posted || '').trim() === 'y' ? 'posted' : 'scheduled',
            due_date: d2026(date.trim()),
            scheduled_time: null,
            caption: null,
            description: `#${i + 1} · card ${id.trim()} · ${theme.trim()} · ${look.trim()} look`,
            tags: [slug(theme.trim()), id.trim().toLowerCase(), slug(look.trim()), 'feed'],
            performance: {},
        };
    });
}
function parseStories() {
    return STORY_RAW.trim().split('\n').map((line, i) => {
        const [date, id, theme, headline] = line.split('|');
        return {
            title: headline.trim(),
            content_type: 'story',
            channel: 'instagram',
            status: 'scheduled',
            due_date: d2026(date.trim()),
            scheduled_time: null,
            caption: null,
            description: `Story #${i + 1} · card ${id.trim()} · ${theme.trim()}`,
            tags: [slug(theme.trim()), id.trim().toLowerCase(), 'story'],
            performance: {},
        };
    });
}

async function seed() {
    const client = await pool.connect();
    let inserted = 0, skipped = 0;
    try {
        const rows = [newsletter, ...parseFeed(), ...parseStories()];
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
        console.log(`   • 54 feed posts (Mon/Wed/Fri) — #1–7 marked posted, #8+ scheduled.`);
        console.log(`   • 33 stories (Tue/Thu shadow schedule).`);
        console.log(`   • Newsletter — Monday 09:00 Central.\n`);
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(err => { console.error('[seed-marketing-content]', err); process.exit(1); });
