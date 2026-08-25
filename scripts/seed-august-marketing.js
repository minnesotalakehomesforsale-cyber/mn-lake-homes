/**
 * seed-august-marketing.js
 * Seeds one week of marketing activity (Aug 25–31) BEYOND the social feed:
 * email campaigns, DM outreach sessions, an SMS blast, and other to-dos
 * (Google Business post, partnerships, performance review). These land on the
 * content calendar so the whole week's marketing lives in one place.
 *
 * Idempotent: skips any row whose (title, content_type) already exists.
 * Guarded by ALLOW_PUBLISH_WRITES=1. Run from the Render shell:
 *   ALLOW_PUBLISH_WRITES=1 node scripts/seed-august-marketing.js
 */

if (process.env.ALLOW_PUBLISH_WRITES !== '1') {
    console.error('\n⛔ Refuses to run without ALLOW_PUBLISH_WRITES=1.');
    console.error('   ALLOW_PUBLISH_WRITES=1 node scripts/seed-august-marketing.js\n');
    process.exit(1);
}

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');

// date | type | channel | title | internal note | tags(csv)
const ROWS = [
    ['2026-08-25', 'dm',    'instagram', 'DM: follow up with pending agents',            'Message every agent who was invited but never finished their profile — nudge them to claim it (1-tap link).', 'dm,agent-recruitment,follow-up'],
    ['2026-08-25', 'other', 'google',    'Google Business Profile — weekly post',        'Post this week’s featured lake / new listing to GBP for local SEO.',                                          'other,local-seo,gbp'],
    ['2026-08-26', 'email', '',          'Agent email: claim your free lake profile',    'Send the agent-recruitment email to the prospect list — free profile on the lake page buyers search. Free = get found, never leads.', 'email,agent-recruitment,campaign'],
    ['2026-08-27', 'dm',    'instagram', 'DM: local lake businesses → business map',      'Reach out to ~10 local lake businesses (docks, resorts, photographers) inviting them to the free business map.', 'dm,business-recruitment'],
    ['2026-08-27', 'email', '',          'Buyer email: new lake listings this week',      'Re-engagement send to buyer leads — this week’s new/updated lake listings + the match-form CTA.',            'email,lead-gen,buyers'],
    ['2026-08-28', 'email', '',          'Business email: get on the lake business map',  'Business-recruitment email — free listing on the map lake owners actually use.',                              'email,business-recruitment,campaign'],
    ['2026-08-28', 'other', '',          'Lake association outreach (content collab)',    'Reach out to 2–3 lake associations about cross-promotion or a guest content piece.',                           'other,partnerships,outreach'],
    ['2026-08-29', 'dm',    'instagram', 'DM: engaged buyers → lake match form',          'DM people who liked/saved recent buyer posts — soft intro to the lake match form.',                            'dm,lead-gen,buyers'],
    ['2026-08-30', 'other', '',          'Review the week’s content performance',         'Log reach/likes/clicks on this week’s posts + stories in the tracker; note what to repeat.',                   'other,analytics,review'],
    ['2026-08-31', 'sms',   '',          'SMS: new-listing / open-house blast (opted-in)','Text opted-in buyers about a hot new listing or this weekend’s open house. Short + a link.',                  'sms,lead-gen'],
];

async function seed() {
    const client = await pool.connect();
    let inserted = 0, skipped = 0;
    try {
        for (const [date, type, channel, title, note, tags] of ROWS) {
            const dupe = await client.query(
                `SELECT 1 FROM marketing_posts WHERE title = $1 AND content_type = $2 LIMIT 1`,
                [title, type]
            );
            if (dupe.rowCount) { skipped++; continue; }
            await client.query(
                `INSERT INTO marketing_posts
                     (title, description, tags, due_date, channel, status, content_type, performance)
                 VALUES ($1,$2,$3::jsonb,$4,$5,'scheduled',$6,'{}'::jsonb)`,
                [title, note, JSON.stringify(tags.split(',')), date, channel || null, type]
            );
            inserted++;
        }
        console.log(`\n✅ August marketing seeded — ${inserted} new, ${skipped} already present.`);
        console.log('   3 emails · 3 DM sessions · 1 SMS · 3 other to-dos (Aug 25–31).\n');
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(err => { console.error('[seed-august-marketing]', err); process.exit(1); });
