/**
 * MN Lake Homes — Staging Seed Script
 * Fix 4: Generates real bcrypt hashes at runtime. No mock hashes.
 * 
 * Run: NODE_ENV=staging node scripts/seed-staging.js
 * 
 * Test Accounts Created:
 *   Admin  → admin@mnlakehomes-staging.com  / AdminStaging2024!
 *   Agent1 → sarah.chen@test.com            / AgentStaging2024!   (published)
 *   Agent2 → mike.johnson@test.com          / AgentStaging2024!   (draft)
 */

const bcrypt = require('bcrypt');
const pool = require('../src/database/pool');

async function seed() {
    console.log('=============================================');
    console.log(' MN LAKE HOMES — STAGING SEED');
    console.log(`  Environment: ${process.env.NODE_ENV || 'local'}`);
    console.log('=============================================\n');

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // ------------------------------------------
        // 1. Resolve membership IDs (must already exist from schema.sql)
        // ------------------------------------------
        const memRes = await client.query('SELECT id, code FROM memberships');
        const memMap = {};
        memRes.rows.forEach(m => { memMap[m.code] = m.id; });

        if (!memMap['basic'] || !memMap['top_agent'] || !memMap['mn_lake_specialist']) {
            throw new Error('Membership tiers not found. Run `npm run db:setup` first.');
        }

        console.log('✅ Membership tiers verified.');

        // ------------------------------------------
        // 2. Super Admin Account
        // ------------------------------------------
        const adminHash = await bcrypt.hash('AdminStaging2024!', 10);
        const adminRes = await client.query(`
            INSERT INTO users (first_name, last_name, full_name, email, password_hash, role, account_status, email_verified_at)
            VALUES ('System', 'Admin', 'System Admin', 'admin@mnlakehomes-staging.com', $1, 'super_admin', 'active', CURRENT_TIMESTAMP)
            ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
            RETURNING id
        `, [adminHash]);
        const adminId = adminRes.rows[0].id;
        console.log(`✅ Admin created: admin@mnlakehomes-staging.com (id: ${adminId})`);

        // ------------------------------------------
        // 3. Published Test Agent
        // ------------------------------------------
        const agentHash = await bcrypt.hash('AgentStaging2024!', 10);

        const agent1UserRes = await client.query(`
            INSERT INTO users (first_name, last_name, full_name, email, password_hash, role, account_status, email_verified_at)
            VALUES ('Sarah', 'Chen', 'Sarah Chen', 'sarah.chen@test.com', $1, 'agent', 'active', CURRENT_TIMESTAMP)
            ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
            RETURNING id
        `, [agentHash]);
        const agent1UserId = agent1UserRes.rows[0].id;

        await client.query(`
            INSERT INTO agents (user_id, membership_id, slug, display_name, brokerage_name, license_number,
                city, service_areas, specialties, bio, phone_public, email_public,
                profile_status, is_published, is_featured, published_at, approved_by_user_id, approved_at)
            VALUES ($1, $2, 'sarah-chen', 'Sarah Chen', 'Lake Country Realty', 'MN-2024-001',
                'Wayzata', '["Minnetonka", "Lake Minnewashta", "Crystal Bay"]',
                '["Luxury Lake Homes", "Cabins", "Waterfront"]',
                'Sarah is a top-performing lake home specialist with over 12 years of experience along Minnesota''s most sought-after lake shores. She brings deep local knowledge and a passion for matching buyers with their perfect lake lifestyle.',
                '(612) 555-0101', 'sarah.chen@test.com',
                'published', true, true, CURRENT_TIMESTAMP, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (slug) DO NOTHING
        `, [agent1UserId, memMap['top_agent'], adminId]);
        console.log(`✅ Published agent created: Sarah Chen (sarah-chen)`);

        // ------------------------------------------
        // 4. Draft Test Agent
        // ------------------------------------------
        const agent2UserRes = await client.query(`
            INSERT INTO users (first_name, last_name, full_name, email, password_hash, role, account_status, email_verified_at)
            VALUES ('Mike', 'Johnson', 'Mike Johnson', 'mike.johnson@test.com', $1, 'agent', 'active', CURRENT_TIMESTAMP)
            ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
            RETURNING id
        `, [agentHash]);
        const agent2UserId = agent2UserRes.rows[0].id;

        await client.query(`
            INSERT INTO agents (user_id, membership_id, slug, display_name, brokerage_name, license_number,
                profile_status, is_published)
            VALUES ($1, $2, 'mike-johnson', 'Mike Johnson', 'North Shore Realty', 'MN-2024-002',
                'draft', false)
            ON CONFLICT (slug) DO NOTHING
        `, [agent2UserId, memMap['basic']]);
        console.log(`✅ Draft agent created: Mike Johnson (mike-johnson)`);

        // ------------------------------------------
        // 5. Example Lead Record
        // ------------------------------------------
        // We need the agent ID for the published agent
        const agentRow = await client.query('SELECT id FROM agents WHERE slug = $1', ['sarah-chen']);
        const agentId = agentRow.rows[0]?.id || null;

        await client.query(`
            INSERT INTO leads (full_name, first_name, last_name, email, phone, message,
                lead_type, lead_source, lead_status)
            VALUES ('James Andersen', 'James', 'Andersen', 'james.andersen@example.com', '(612) 555-7892',
                'We are a family relocating from Chicago and are very interested in lake properties around Minnetonka. Looking for 4BR with dock access under $2.5M.',
                'buyer', 'agent_inquiry_form', 'new')
        `);
        console.log(`✅ Example lead created: James Andersen`);

        await client.query('COMMIT');

        console.log('\n=============================================');
        console.log(' SEED COMPLETE ✅');
        console.log('=============================================');
        console.log('\nStaging Test Credentials:');
        console.log('  Admin  → admin@mnlakehomes-staging.com  / AdminStaging2024!');
        console.log('  Agent1 → sarah.chen@test.com            / AgentStaging2024!  (published)');
        console.log('  Agent2 → mike.johnson@test.com          / AgentStaging2024!  (draft)');
        console.log('');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌ Seed failed:', err.message);
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
