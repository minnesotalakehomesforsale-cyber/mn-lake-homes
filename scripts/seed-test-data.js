/**
 * seed-test-data.js — one-shot test data to verify a fresh database.
 *
 * Creates:
 *   1. A master super_admin login
 *   2. Agent "Lara Bergstrom" — published profile + login
 *   3. Three lakes (published)
 *   4. Three local businesses (active)
 *
 * Run on Render Shell (DATABASE_URL is already set there):
 *   node scripts/seed-test-data.js
 *
 * Idempotent — safe to re-run. Uses ON CONFLICT so it never duplicates rows.
 */

// Production runs already have DATABASE_URL in the environment. Only fall
// back to .env.local for local development.
if (!process.env.DATABASE_URL) {
    require('dotenv').config({ path: '.env.local' });
}

const bcrypt = require('bcrypt');
const pool = require('../src/database/pool');

console.log('→ Connecting to:', (process.env.DATABASE_URL || '').replace(/:[^:@]+@/, ':****@'));

const ADMIN = {
    email: 'admin@mnlakehomes.com',
    password: 'MnLakes#Admin2026',
    first_name: 'Platform',
    last_name: 'Admin',
    full_name: 'Platform Admin',
};

const LARA = {
    email: 'lara@mnlakehomes.com',
    password: 'MnLakes#Agent2026',
    first_name: 'Lara',
    last_name: 'Bergstrom',
    full_name: 'Lara Bergstrom',
    slug: 'lara-bergstrom',
    display_name: 'Lara Bergstrom',
    title: 'MN Lake Specialist',
    membership_code: 'mn_lake_specialist',
    brokerage_name: 'MN Lake Homes Realty',
    license_number: 'MN-RE-60412',
    phone_public: '(218) 555-0142',
    city: 'Brainerd',
    years_experience: 9,
    bio: 'Lara Bergstrom is a MN Lake Specialist focused on the Brainerd Lakes area. She helps families find cabins and year-round lake homes, and brings nine years of local market knowledge to every search.',
    profile_photo_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=800&auto=format&fit=crop',
    service_areas: JSON.stringify(['Gull Lake', 'Nisswa', 'Brainerd', 'Crosslake']),
    specialties: JSON.stringify(['Cabins & Recreational Property', 'First-Time Lake Buyers', 'Waterfront Homes']),
};

const LAKES = [
    {
        slug: 'lake-minnetonka',
        name: 'Lake Minnetonka',
        region: 'Twin Cities Metro',
        county: 'Hennepin',
        latitude: 44.9083,
        longitude: -93.5853,
        intro_text: 'Minnesota\'s premier waterfront destination — luxury estates, private docks, and elite dining just 30 minutes from the Twin Cities.',
        seo_title: 'Lake Minnetonka Homes for Sale | Luxury Waterfront Real Estate',
        seo_description: 'Browse luxury lake homes on Lake Minnetonka — Wayzata, Orono, and Excelsior estates with private docks.',
        status: 'published',
    },
    {
        slug: 'gull-lake',
        name: 'Gull Lake',
        region: 'Brainerd Lakes',
        county: 'Cass',
        latitude: 46.4097,
        longitude: -94.3483,
        intro_text: 'One of central Minnesota\'s most sought-after resort lakes — clear water, sandy beaches, and top-rated golf just north of Brainerd.',
        seo_title: 'Gull Lake Homes for Sale | Brainerd Lakes Waterfront',
        seo_description: 'Gull Lake homes for sale in the Brainerd Lakes area — sandy beaches, clear water, and cabin-country living.',
        status: 'published',
    },
    {
        slug: 'leech-lake',
        name: 'Leech Lake',
        region: 'Northern Lakes',
        county: 'Cass',
        latitude: 47.1569,
        longitude: -94.3875,
        intro_text: 'Minnesota\'s third-largest lake — legendary walleye fishing, Chippewa National Forest shoreline, and quiet cabin country.',
        seo_title: 'Leech Lake Homes for Sale | Walker, MN Waterfront Real Estate',
        seo_description: 'Leech Lake real estate near Walker, MN — walleye fishing and a slower pace of cabin life.',
        status: 'published',
    },
];

const BUSINESSES = [
    {
        slug: 'gull-lake-marina',
        name: 'Gull Lake Marina',
        type: 'marina',
        description: 'Full-service marina on Gull Lake — slip rentals, pontoon and fishing boat rentals, a fuel dock, and a well-stocked ship store. Indoor winter storage available.',
        phone: '(218) 829-1100',
        email: 'dock@gulllakemarina.example',
        website_url: 'https://example.com/gull-lake-marina',
        address: '9591 Barbarossa Rd NW',
        city: 'Nisswa', state: 'MN', zip: '56468',
        latitude: 46.5297, longitude: -94.3275,
        price_range: '$$',
        featured_image_url: '/assets/images/mn-dock-water-tower.webp',
    },
    {
        slug: 'birch-point-grill',
        name: 'Birch Point Grill',
        type: 'restaurant',
        description: 'Lakeside grill in Nisswa — fresh walleye, wood-fired steaks, and a deep Minnesota craft-beer list. Reservations recommended on summer weekends.',
        phone: '(218) 963-0200',
        email: 'reservations@birchpointgrill.example',
        website_url: 'https://example.com/birch-point-grill',
        address: '24 Main St',
        city: 'Nisswa', state: 'MN', zip: '56468',
        latitude: 46.5210, longitude: -94.2900,
        price_range: '$$',
        featured_image_url: '/assets/images/mn-dining-wicker-open.jpg',
    },
    {
        slug: 'north-woods-builders',
        name: 'North Woods Builders',
        type: 'builder',
        description: 'Custom lake home and cabin builder serving the Brainerd Lakes area for over 20 years — new construction, additions, and four-season conversions.',
        phone: '(218) 829-4500',
        email: 'build@northwoodsbuilders.example',
        website_url: 'https://example.com/north-woods-builders',
        address: '14920 Edgewood Dr',
        city: 'Baxter', state: 'MN', zip: '56425',
        latitude: 46.3430, longitude: -94.2870,
        price_range: '$$$',
        featured_image_url: '/assets/images/mn-rustic-modern-lake-house.jpg',
    },
];

async function seed() {
    console.log('\n=======================================================');
    console.log(' MN LAKE HOMES — TEST DATA SEED');
    console.log('=======================================================\n');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Master super_admin
        const adminHash = await bcrypt.hash(ADMIN.password, 10);
        const adminRes = await client.query(`
            INSERT INTO users (first_name, last_name, full_name, email, password_hash, role, account_status, email_verified_at)
            VALUES ($1, $2, $3, $4, $5, 'super_admin', 'active', CURRENT_TIMESTAMP)
            ON CONFLICT (email) DO UPDATE SET
                password_hash  = EXCLUDED.password_hash,
                role           = 'super_admin',
                account_status = 'active'
            RETURNING id
        `, [ADMIN.first_name, ADMIN.last_name, ADMIN.full_name, ADMIN.email, adminHash]);
        const adminId = adminRes.rows[0].id;
        console.log(`✅ Admin: ${ADMIN.email}`);

        // 2. Agent Lara — user account
        const laraHash = await bcrypt.hash(LARA.password, 10);
        const laraUserRes = await client.query(`
            INSERT INTO users (first_name, last_name, full_name, email, password_hash, role, account_status, email_verified_at)
            VALUES ($1, $2, $3, $4, $5, 'agent', 'active', CURRENT_TIMESTAMP)
            ON CONFLICT (email) DO UPDATE SET
                password_hash  = EXCLUDED.password_hash,
                role           = 'agent',
                account_status = 'active'
            RETURNING id
        `, [LARA.first_name, LARA.last_name, LARA.full_name, LARA.email, laraHash]);
        const laraUserId = laraUserRes.rows[0].id;

        // 2b. Resolve membership tier
        const memRes = await client.query('SELECT id FROM memberships WHERE code = $1', [LARA.membership_code]);
        if (!memRes.rows.length) {
            throw new Error(`Membership "${LARA.membership_code}" not found — the app must boot once to seed memberships.`);
        }
        const membershipId = memRes.rows[0].id;

        // 2c. Agent profile — published
        await client.query(`
            INSERT INTO agents (
                user_id, membership_id, slug, display_name,
                brokerage_name, license_number, phone_public, email_public,
                city, state, years_experience, service_areas, specialties, bio,
                profile_photo_url, is_featured, is_verified,
                profile_status, is_published, published_at,
                approved_by_user_id, approved_at
            ) VALUES (
                $1, $2, $3, $4,
                $5, $6, $7, $8,
                $9, 'Minnesota', $10, $11::jsonb, $12::jsonb, $13,
                $14, false, true,
                'published', true, CURRENT_TIMESTAMP,
                $15, CURRENT_TIMESTAMP
            )
            ON CONFLICT (slug) DO UPDATE SET
                user_id          = EXCLUDED.user_id,
                membership_id    = EXCLUDED.membership_id,
                display_name     = EXCLUDED.display_name,
                brokerage_name   = EXCLUDED.brokerage_name,
                license_number   = EXCLUDED.license_number,
                phone_public     = EXCLUDED.phone_public,
                email_public     = EXCLUDED.email_public,
                city             = EXCLUDED.city,
                years_experience = EXCLUDED.years_experience,
                service_areas    = EXCLUDED.service_areas,
                specialties      = EXCLUDED.specialties,
                bio              = EXCLUDED.bio,
                profile_photo_url = EXCLUDED.profile_photo_url,
                profile_status   = 'published',
                is_published     = true,
                updated_at       = CURRENT_TIMESTAMP
        `, [
            laraUserId, membershipId, LARA.slug, LARA.display_name,
            LARA.brokerage_name, LARA.license_number, LARA.phone_public, LARA.email,
            LARA.city, LARA.years_experience, LARA.service_areas, LARA.specialties, LARA.bio,
            LARA.profile_photo_url, adminId,
        ]);
        console.log(`✅ Agent: ${LARA.display_name} (${LARA.slug}) — published`);

        // 3. Lakes
        for (const lake of LAKES) {
            await client.query(`
                INSERT INTO lakes (slug, name, state, region, county, latitude, longitude,
                    intro_text, seo_title, seo_description, status)
                VALUES ($1, $2, 'MN', $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (slug) DO NOTHING
            `, [
                lake.slug, lake.name, lake.region, lake.county, lake.latitude, lake.longitude,
                lake.intro_text, lake.seo_title, lake.seo_description, lake.status,
            ]);
            console.log(`✅ Lake: ${lake.name}`);
        }

        // 4. Businesses
        for (const biz of BUSINESSES) {
            await client.query(`
                INSERT INTO businesses (slug, name, type, description, phone, email, website_url,
                    address, city, state, zip, latitude, longitude, price_range, featured_image_url, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active')
                ON CONFLICT (slug) DO UPDATE SET
                    name              = EXCLUDED.name,
                    type              = EXCLUDED.type,
                    description       = EXCLUDED.description,
                    phone             = EXCLUDED.phone,
                    email             = EXCLUDED.email,
                    website_url       = EXCLUDED.website_url,
                    address           = EXCLUDED.address,
                    city              = EXCLUDED.city,
                    zip               = EXCLUDED.zip,
                    latitude          = EXCLUDED.latitude,
                    longitude         = EXCLUDED.longitude,
                    price_range       = EXCLUDED.price_range,
                    featured_image_url = EXCLUDED.featured_image_url,
                    updated_at        = CURRENT_TIMESTAMP
            `, [
                biz.slug, biz.name, biz.type, biz.description, biz.phone, biz.email, biz.website_url,
                biz.address, biz.city, biz.state, biz.zip, biz.latitude, biz.longitude,
                biz.price_range, biz.featured_image_url,
            ]);
            console.log(`✅ Business: ${biz.name}`);
        }

        await client.query('COMMIT');

        console.log('\n=======================================================');
        console.log(' SEED COMPLETE ✅');
        console.log('=======================================================');
        console.log('\n  Master admin login:');
        console.log(`    ${ADMIN.email}  /  ${ADMIN.password}`);
        console.log('\n  Agent Lara login:');
        console.log(`    ${LARA.email}  /  ${LARA.password}`);
        console.log('\n  Change both passwords after first login.\n');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌ Seed failed:', err.message);
        console.error(err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
