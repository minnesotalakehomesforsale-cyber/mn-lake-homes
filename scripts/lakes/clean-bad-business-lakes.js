// One-shot cleanup: remove geographically-wrong business_lakes rows that
// were over-seeded for content density. Each business stays linked to the
// lake(s) it actually serves; cross-links to lakes hours away get dropped.
//
// Run with: node scripts/lakes/clean-bad-business-lakes.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// (business name, lake slug) pairs to DELETE. Anything not listed stays.
const KEEP = {
    // Brainerd-area pros — Gull Lake only.
    'Gull Lake Marina':                 ['gull-lake'],
    'North Lakes Dock & Lift Service':  ['gull-lake'],
    'Brainerd Lakes Custom Builders':   ['gull-lake'],
    // Bemidji boat rental — usable on Cass + Leech (both nearby).
    'Bemidji Boat Rentals':             ['cass-lake', 'leech-lake'],
    // Ely restaurant — Vermilion only (Ely is on Vermilion).
    'Iron Range Grill':                 ['lake-vermilion'],
    // Walker café — sits between Cass and Leech.
    'Walker Bay Café':                  ['cass-lake', 'leech-lake'],
    // North Shore resort — Lake of the Woods area only.
    'North Shore Lakeside Resort':      ['lake-of-the-woods'],
    // Minnetonka photographer — Minnetonka only.
    'Minnetonka Waterfront Photography':['lake-minnetonka'],
};

(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        await pool.query('BEGIN');
        const before = await pool.query('SELECT COUNT(*) FROM business_lakes');
        let deleted = 0;
        for (const [bizName, keepSlugs] of Object.entries(KEEP)) {
            const r = await pool.query(
                `DELETE FROM business_lakes
                  WHERE business_id = (SELECT id FROM businesses WHERE name = $1)
                    AND lake_id NOT IN (SELECT id FROM lakes WHERE slug = ANY($2::text[]))`,
                [bizName, keepSlugs]
            );
            if (r.rowCount > 0) console.log(`  - ${bizName}: removed ${r.rowCount} cross-link(s); kept on ${keepSlugs.join(', ')}`);
            deleted += r.rowCount;
        }
        await pool.query('COMMIT');
        const after = await pool.query('SELECT COUNT(*) FROM business_lakes');
        console.log(`\nbusiness_lakes rows: ${before.rows[0].count} → ${after.rows[0].count} (deleted ${deleted})`);
    } catch (e) {
        await pool.query('ROLLBACK').catch(() => {});
        console.error('FAILED:', e.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
