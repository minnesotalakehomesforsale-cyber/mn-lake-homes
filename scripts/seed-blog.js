/**
 * seed-blog.js
 * Upserts the canonical blog posts (from src/data/default-blog-posts.js)
 * into the database. Safe to re-run — uses ON CONFLICT DO UPDATE.
 *
 * Run: ALLOW_PUBLISH_WRITES=1 node scripts/seed-blog.js
 */

// Wave-3 canary guard. This script UPSERTs with `ON CONFLICT DO UPDATE SET
// is_published = EXCLUDED.is_published` from src/data/default-blog-posts.js —
// whose flags mark only 7 posts published while ~65 are live. A single re-run
// would silently reset dozens of live posts to draft, OFF-GIT and with no
// activity-log entry, making a Wave-3 result indistinguishable from an accident.
// Blog publish state must move only through the admin UI (logged) during Wave 3.
if (process.env.ALLOW_PUBLISH_WRITES !== '1') {
    console.error('\n⛔ seed-blog.js refuses to run: it writes blog is_published and can flip many live posts to draft off-git.');
    console.error('   During Wave 3, publish state moves only via the admin UI (logged, attributable).');
    console.error('   To run deliberately: ALLOW_PUBLISH_WRITES=1 node scripts/seed-blog.js\n');
    process.exit(1);
}

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');
const { posts } = require('../src/data/default-blog-posts');

async function seed() {
    const client = await pool.connect();
    try {
        let count = 0;
        for (const post of posts) {
            await client.query(`
                INSERT INTO blog_posts (title, slug, excerpt, body, cover_image_url, tag, read_time_minutes, is_published, published_at, author_name)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'MN Lake Homes Team')
                ON CONFLICT (slug) DO UPDATE SET
                    title = EXCLUDED.title,
                    excerpt = EXCLUDED.excerpt,
                    body = EXCLUDED.body,
                    cover_image_url = EXCLUDED.cover_image_url,
                    tag = EXCLUDED.tag,
                    read_time_minutes = EXCLUDED.read_time_minutes,
                    is_published = EXCLUDED.is_published,
                    published_at = EXCLUDED.published_at,
                    updated_at = NOW()
            `, [post.title, post.slug, post.excerpt, post.body, post.cover_image_url, post.tag, post.read_time_minutes, post.is_published, post.published_at]);
            const wc = post.body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
            console.log(`  ✓ [${post.tag.padEnd(18)}] ${post.title} (${wc} words)`);
            count++;
        }
        console.log(`\nDone — ${count} blog posts seeded / updated.`);
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(err => { console.error(err.message); process.exit(1); });
