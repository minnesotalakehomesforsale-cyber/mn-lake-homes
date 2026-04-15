/**
 * setup-blog.js
 * Creates the blog_posts table if it doesn't exist.
 * Run: node scripts/setup-blog.js
 */

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');

async function setup() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS blog_posts (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title            TEXT NOT NULL,
            slug             TEXT UNIQUE NOT NULL,
            excerpt          TEXT,
            body             TEXT,
            cover_image_url  TEXT,
            tag              TEXT DEFAULT 'General',
            read_time_minutes INT DEFAULT 4,
            author_name      TEXT DEFAULT 'MN Lake Homes Team',
            is_published     BOOLEAN DEFAULT false,
            published_at     TIMESTAMPTZ,
            created_at       TIMESTAMPTZ DEFAULT NOW(),
            updated_at       TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    console.log('blog_posts table ready.');
    await pool.end();
}

setup().catch(err => { console.error(err.message); process.exit(1); });
