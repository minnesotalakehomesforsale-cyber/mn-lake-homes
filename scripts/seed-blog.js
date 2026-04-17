/**
 * seed-blog.js
 * Upserts the canonical blog posts (from src/data/default-blog-posts.js)
 * into the database. Safe to re-run — uses ON CONFLICT DO UPDATE.
 *
 * Run: node scripts/seed-blog.js
 */

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
