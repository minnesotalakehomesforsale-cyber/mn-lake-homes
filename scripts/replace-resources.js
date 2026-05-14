// One-time: fully swap the resources catalog to the Phase 1 launch set.
//
// The boot-time seed uses ON CONFLICT (slug) DO NOTHING, so it can ADD
// new resources but never removes the old placeholder ones. This script
// clears the table and re-inserts exactly what's in resources-seed.js.
//
// Idempotent — safe to re-run (it always ends with the seed's contents).
// Run with: node scripts/replace-resources.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const RESOURCES = require('../src/database/resources-seed');

(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        await pool.query('BEGIN');
        const before = await pool.query('SELECT COUNT(*) FROM resources');
        await pool.query('DELETE FROM resources');

        const values = [];
        const params = [];
        RESOURCES.forEach((r, i) => {
            const b = i * 9;
            values.push(`($${b+1}, $${b+2}, $${b+3}, $${b+4}, $${b+5}, $${b+6}, $${b+7}, $${b+8}::jsonb, $${b+9})`);
            params.push(
                r.slug, r.title, r.description || null, r.category,
                r.resource_type, r.url, r.thumbnail_url || null,
                JSON.stringify(r.tags || []), !!r.featured,
            );
        });
        await pool.query(
            `INSERT INTO resources (slug, title, description, category, resource_type, url, thumbnail_url, tags, featured)
             VALUES ${values.join(', ')}`,
            params
        );
        await pool.query('COMMIT');

        const after = await pool.query('SELECT slug, title, category, resource_type, featured FROM resources ORDER BY category, title');
        console.log(`resources: ${before.rows[0].count} → ${after.rows.length}`);
        console.table(after.rows);
        console.log('Done.');
    } catch (e) {
        await pool.query('ROLLBACK').catch(() => {});
        console.error('FAILED:', e.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
