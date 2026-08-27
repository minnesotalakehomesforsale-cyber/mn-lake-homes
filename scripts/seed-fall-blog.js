/**
 * seed-fall-blog.js
 * Upserts the 20 fall/autumn blog posts (src/data/fall-blog-posts-2026-part{1..5}.js)
 * into blog_posts, published. Safe to re-run — ON CONFLICT (slug) DO UPDATE.
 *
 * Run: ALLOW_PUBLISH_WRITES=1 node scripts/seed-fall-blog.js
 */

if (process.env.ALLOW_PUBLISH_WRITES !== '1') {
    console.error('\n⛔ Refuses to run without ALLOW_PUBLISH_WRITES=1 (publishes blog posts).');
    console.error('   ALLOW_PUBLISH_WRITES=1 node scripts/seed-fall-blog.js\n');
    process.exit(1);
}

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const pool = require('../src/database/pool');

// Gather posts from the five part files (skip any not yet written).
let posts = [];
for (const n of [1, 2, 3, 4, 5]) {
    const abs = path.join(__dirname, `../src/data/fall-blog-posts-2026-part${n}.js`);
    if (!fs.existsSync(abs)) { console.warn(`  (part${n} missing — skipping)`); continue; }
    const arr = require(abs);
    if (Array.isArray(arr)) posts = posts.concat(arr);
}

// De-dupe by slug (last wins) so a re-authored post doesn't double-insert.
const bySlug = {};
posts.forEach(p => { bySlug[p.slug] = p; });
posts = Object.values(bySlug);

async function seed() {
    if (!posts.length) { console.error('No fall posts found — nothing to seed.'); process.exit(1); }
    const client = await pool.connect();
    let count = 0;
    try {
        for (const post of posts) {
            const publishedAt = post.published_at || new Date().toISOString();
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
            `, [post.title, post.slug, post.excerpt, post.body, post.cover_image_url,
                post.tag, post.read_time_minutes, post.is_published !== false, publishedAt]);
            const wc = String(post.body || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
            console.log(`  ✓ [${String(post.tag).padEnd(16)}] ${post.slug} (${wc} words)`);
            count++;
        }
        console.log(`\n✅ ${count} fall blog posts seeded / updated (published).`);
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(err => { console.error('[seed-fall-blog]', err.message); process.exit(1); });
