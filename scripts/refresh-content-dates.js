#!/usr/bin/env node
/**
 * refresh-content-dates.js — bump blog post + resource timestamps so
 * they read as "just published". Run from Render shell whenever the
 * site should look freshly launched:
 *
 *     node scripts/refresh-content-dates.js
 *
 * What it does:
 *
 *   1. Spreads every blog_posts.published_at across the last 35 days,
 *      newest 2 days ago, oldest 35 days ago, evenly stepped.
 *      Also bumps updated_at to match. Only touches is_published
 *      rows so drafts stay drafts.
 *
 *   2. Spreads every resources.created_at across the last 28 days,
 *      newest 1 day ago, oldest 28 days ago, evenly stepped. Bumps
 *      updated_at too.
 *
 * Re-running shifts everything to "now-relative" again so the site
 * keeps feeling fresh.
 */

const pool = require('../src/database/pool');

async function bumpBlog() {
    const { rows } = await pool.query(
        `SELECT id, title FROM blog_posts
          WHERE is_published = TRUE AND deleted_at IS NULL
          ORDER BY published_at DESC NULLS LAST, created_at DESC`
    );
    if (!rows.length) {
        console.log('  (no published blog posts to bump)');
        return 0;
    }
    const n = rows.length;
    const spreadDays = 35;
    const minAgo = 2;
    for (let i = 0; i < n; i++) {
        // Linear spread: newest at minAgo days, oldest at minAgo+spreadDays.
        const days = minAgo + (spreadDays * i) / Math.max(1, n - 1);
        await pool.query(
            `UPDATE blog_posts
                SET published_at = NOW() - ($1::numeric * INTERVAL '1 day'),
                    updated_at   = NOW() - ($1::numeric * INTERVAL '1 day')
              WHERE id = $2`,
            [days, rows[i].id]
        );
        console.log(`  blog [${days.toFixed(1)}d ago]  ${rows[i].title}`);
    }
    return n;
}

async function bumpResources() {
    const { rows } = await pool.query(
        `SELECT id, title FROM resources
          WHERE active = TRUE
          ORDER BY created_at DESC`
    );
    if (!rows.length) {
        console.log('  (no resources to bump)');
        return 0;
    }
    const n = rows.length;
    const spreadDays = 28;
    const minAgo = 1;
    for (let i = 0; i < n; i++) {
        const days = minAgo + (spreadDays * i) / Math.max(1, n - 1);
        await pool.query(
            `UPDATE resources
                SET created_at = NOW() - ($1::numeric * INTERVAL '1 day'),
                    updated_at = NOW() - ($1::numeric * INTERVAL '1 day')
              WHERE id = $2`,
            [days, rows[i].id]
        );
        console.log(`  resource [${days.toFixed(1)}d ago]  ${rows[i].title}`);
    }
    return n;
}

async function main() {
    console.log('\n=== refresh-content-dates ===\n');
    console.log('── blog_posts ──');
    const blogN = await bumpBlog();
    console.log('\n── resources ──');
    const resN = await bumpResources();
    console.log(`\n── summary ──`);
    console.log(`  blog posts bumped : ${blogN}`);
    console.log(`  resources bumped  : ${resN}`);
    console.log(`\nDone. Re-run any time to refresh again.\n`);
    await pool.end();
}

main().catch((err) => {
    console.error('refresh-content-dates FAILED:', err);
    process.exit(1);
});
