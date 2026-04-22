/**
 * seed-businesses.js — sample local businesses for the Businesses view
 * on the /towns directory. Run from project root:
 *
 *   # local (loads .env.local)
 *   node scripts/seed-businesses.js
 *
 *   # production — pass DATABASE_URL inline or export it first
 *   DATABASE_URL=postgres://… node scripts/seed-businesses.js
 *
 * Idempotent: ON CONFLICT (slug) DO UPDATE so re-runs refresh fields.
 */

// If DATABASE_URL is already set (production run), skip loading the
// local env file so we never accidentally overwrite it with dev creds.
if (!process.env.DATABASE_URL) {
    require('dotenv').config({ path: '.env.local' });
}
const pool = require('../src/database/pool');
console.log('→ Connecting to:', (process.env.DATABASE_URL || '').replace(/:[^:@]+@/, ':****@'));

const BUSINESSES = [
    {
        slug: 'iron-range-grill-ely',
        name: 'Iron Range Grill',
        type: 'restaurant',
        description: 'Upscale lakeside grill in Ely — fresh walleye, wood-fired steaks, and a deep Minnesota craft-beer list. Reservations recommended on weekends and during ricing season.',
        phone: '(218) 365-0200',
        email: 'reservations@ironrangegrill.example',
        website_url: 'https://example.com/iron-range-grill',
        instagram_url: 'https://instagram.com/ironrangegrill',
        facebook_url: 'https://facebook.com/ironrangegrill',
        address: '112 E Sheridan St',
        city: 'Ely', state: 'MN', zip: '55731',
        latitude: 47.9032, longitude: -91.8671,
        price_range: '$$',
        featured_image_url: '/assets/images/mn-dining-wicker-open.jpg',
    },
    {
        slug: 'gull-lake-marina',
        name: 'Gull Lake Marina',
        type: 'marina',
        tier: 'premium',
        description: 'Full-service marina on Gull Lake — slip rentals, pontoon + fishing boat rentals, fuel dock, and a well-stocked ship store. In-water and indoor winter storage available.',
        phone: '(218) 829-1100',
        email: 'dock@gulllakemarina.example',
        website_url: 'https://example.com/gull-lake-marina',
        instagram_url: 'https://instagram.com/gulllakemarina',
        facebook_url: 'https://facebook.com/gulllakemarina',
        address: '9591 Barbarossa Rd NW',
        city: 'Nisswa', state: 'MN', zip: '56468',
        latitude: 46.5297, longitude: -94.3275,
        price_range: '$$',
        featured_image_url: '/assets/images/mn-dock-water-tower.webp',
    },
    {
        slug: 'north-shore-resort',
        name: 'North Shore Lakeside Resort',
        type: 'outdoor_recreation',
        tier: 'premium',
        description: 'Family-owned resort on Lake Superior — lakeside cabins, wood-fired sauna, canoe rentals, guided kayak tours, and beach bonfire pits. Open year-round with winter package add-ons.',
        phone: '(218) 387-2200',
        email: 'stay@northshoreresort.example',
        website_url: 'https://example.com/north-shore-resort',
        instagram_url: 'https://instagram.com/northshoreresort',
        facebook_url: 'https://facebook.com/northshoreresort',
        address: '1234 Hwy 61',
        city: 'Grand Marais', state: 'MN', zip: '55604',
        latitude: 47.7506, longitude: -90.3343,
        price_range: '$$$',
        featured_image_url: '/assets/images/mn-adirondack-rocky-shore.jpg',
    },
    {
        slug: 'bemidji-boat-rentals',
        name: 'Bemidji Boat Rentals',
        type: 'boat_rental',
        description: 'Pontoon, wakeboard boat, and fishing rig rentals on Lake Bemidji. Hourly, daily, and weekly — delivered to your dock. Free safety briefing and tow insurance on every rental.',
        phone: '(218) 751-4422',
        email: 'rentals@bemidjiboats.example',
        website_url: 'https://example.com/bemidji-boat-rentals',
        instagram_url: 'https://instagram.com/bemidjiboats',
        facebook_url: 'https://facebook.com/bemidjiboats',
        address: '2501 Bemidji Ave N',
        city: 'Bemidji', state: 'MN', zip: '56601',
        latitude: 47.5394, longitude: -94.8828,
        price_range: '$$',
        featured_image_url: '/assets/images/mn-canoe-shore.webp',
    },
    {
        slug: 'brainerd-lakes-builders',
        name: 'Brainerd Lakes Custom Builders',
        type: 'builder',
        description: 'Custom lake-home builder serving Brainerd, Nisswa, and Pequot Lakes — design-build, remodels, and four-season cabins. 20 years of Brainerd-area permits and shoreline experience.',
        phone: '(218) 824-7100',
        email: 'build@brainerdlakes.example',
        website_url: 'https://example.com/brainerd-lakes-builders',
        instagram_url: 'https://instagram.com/brainerdlakesbuilders',
        facebook_url: 'https://facebook.com/brainerdlakesbuilders',
        address: '15500 Edgewood Dr',
        city: 'Baxter', state: 'MN', zip: '56425',
        latitude: 46.3430, longitude: -94.2869,
        price_range: '$$$',
        featured_image_url: '/assets/images/mn-chateau-aerial.jpg',
    },
    {
        slug: 'minnetonka-yacht-club-photography',
        name: 'Minnetonka Waterfront Photography',
        type: 'photographer',
        description: 'Aerial + drone + twilight photography for Lake Minnetonka real estate listings. Same-day turnaround for agents. Packages starting at $495 for single-family listings.',
        phone: '(952) 470-8080',
        email: 'book@mtkaphoto.example',
        website_url: 'https://example.com/mtka-photo',
        instagram_url: 'https://instagram.com/mtkaphoto',
        facebook_url: 'https://facebook.com/mtkaphoto',
        address: '500 Lake St E',
        city: 'Wayzata', state: 'MN', zip: '55391',
        latitude: 44.9733, longitude: -93.5089,
        price_range: '$$',
        featured_image_url: '/assets/images/mn-aerial-lake-homes.jpg',
    },
    {
        slug: 'north-lakes-dock-service',
        name: 'North Lakes Dock & Lift Service',
        type: 'service',
        description: 'Seasonal dock installs, lift repair, and winterization across the Brainerd Lakes area. Licensed, insured, same-week scheduling from ice-out through October.',
        phone: '(218) 270-3300',
        email: 'schedule@northlakesdock.example',
        website_url: 'https://example.com/north-lakes-dock',
        instagram_url: 'https://instagram.com/northlakesdock',
        facebook_url: 'https://facebook.com/northlakesdock',
        address: '7250 County Rd 77',
        city: 'Nisswa', state: 'MN', zip: '56468',
        latitude: 46.5213, longitude: -94.2889,
        price_range: '$$',
        featured_image_url: '/assets/images/mn-dock-water-tower.webp',
    },
    {
        slug: 'walker-bay-cafe',
        name: 'Walker Bay Café',
        type: 'restaurant',
        tier: 'premium',
        description: 'Bright lakeside café on Leech Lake — wild-rice soup, walleye tacos, and house-made pie. Big patio, boat-up dock, and live acoustic music Friday + Saturday.',
        phone: '(218) 547-1444',
        email: 'hello@walkerbaycafe.example',
        website_url: 'https://example.com/walker-bay-cafe',
        instagram_url: 'https://instagram.com/walkerbaycafe',
        facebook_url: 'https://facebook.com/walkerbaycafe',
        address: '111 Minnesota Ave E',
        city: 'Walker', state: 'MN', zip: '56484',
        latitude: 47.1008, longitude: -94.5867,
        price_range: '$$',
        featured_image_url: '/assets/images/mn-stucco-home-path.jpg',
    },
];

async function main() {
    console.log(`Seeding ${BUSINESSES.length} businesses…`);
    for (const b of BUSINESSES) {
        await pool.query(
            `INSERT INTO businesses (
                slug, name, type, tier, description, phone, email, website_url,
                instagram_url, facebook_url,
                address, city, state, zip, latitude, longitude,
                price_range, featured_image_url, status
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10,
                $11, $12, $13, $14, $15, $16,
                $17, $18, 'active'
             )
             ON CONFLICT (slug) DO UPDATE SET
                name               = EXCLUDED.name,
                type               = EXCLUDED.type,
                tier               = EXCLUDED.tier,
                description        = EXCLUDED.description,
                phone              = EXCLUDED.phone,
                email              = EXCLUDED.email,
                website_url        = EXCLUDED.website_url,
                instagram_url      = EXCLUDED.instagram_url,
                facebook_url       = EXCLUDED.facebook_url,
                address            = EXCLUDED.address,
                city               = EXCLUDED.city,
                state              = EXCLUDED.state,
                zip                = EXCLUDED.zip,
                latitude           = EXCLUDED.latitude,
                longitude          = EXCLUDED.longitude,
                price_range        = EXCLUDED.price_range,
                featured_image_url = EXCLUDED.featured_image_url,
                status             = 'active',
                updated_at         = NOW()`,
            [
                b.slug, b.name, b.type, b.tier || 'basic', b.description, b.phone, b.email, b.website_url,
                b.instagram_url, b.facebook_url,
                b.address, b.city, b.state, b.zip, b.latitude, b.longitude,
                b.price_range, b.featured_image_url,
            ]
        );
        console.log(`  ✓ ${b.name}${b.tier === 'premium' ? ' ★ Featured' : ''}`);
    }

    // Also add a couple of pending submissions so the admin approval
    // queue has something to demo.
    const PENDING = [
        {
            slug: 'lake-harriet-kayak-co',
            name: 'Lake Harriet Kayak Co.',
            type: 'boat_rental',
            description: 'Hourly kayak, paddleboard, and canoe rentals right off the Lake Harriet band shell beach. Minneapolis classic — no reservations needed most weekdays.',
            phone: '(612) 555-7214',
            email: 'paddle@lakeharrietkayak.example',
            website_url: 'https://example.com/lake-harriet-kayak',
            instagram_url: 'https://instagram.com/lakeharrietkayak',
            facebook_url: '',
            address: '4135 W Lake Harriet Pkwy',
            city: 'Minneapolis', state: 'MN', zip: '55409',
            latitude: 44.9219, longitude: -93.3088,
            price_range: '$',
            featured_image_url: '/assets/images/mn-canoe-shore.webp',
        },
    ];
    for (const b of PENDING) {
        await pool.query(
            `INSERT INTO businesses (
                slug, name, type, description, phone, email, website_url,
                instagram_url, facebook_url,
                address, city, state, zip, latitude, longitude,
                price_range, featured_image_url, status
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9,
                $10, $11, $12, $13, $14, $15,
                $16, $17, 'pending'
             )
             ON CONFLICT (slug) DO NOTHING`,
            [
                b.slug, b.name, b.type, b.description, b.phone, b.email, b.website_url,
                b.instagram_url, b.facebook_url,
                b.address, b.city, b.state, b.zip, b.latitude, b.longitude,
                b.price_range, b.featured_image_url,
            ]
        );
        console.log(`  ⏳ ${b.name} (pending)`);
    }

    // Tag each business to a handful of lakes so the public lake + town
    // pages (which require geo-tagged businesses via business_lakes) have
    // enough coverage to hit the ≥3 threshold. Picks are roughly regional
    // with some metro-wide spread for service-type businesses.
    const BIZ_LAKE_LINKS = {
        'iron-range-grill-ely':              ['lake-vermilion', 'leech-lake', 'cass-lake'],
        'gull-lake-marina':                  ['gull-lake', 'mille-lacs-lake', 'lake-minnetonka', 'white-bear-lake'],
        'north-shore-resort':                ['lake-vermilion', 'leech-lake', 'lake-of-the-woods'],
        'bemidji-boat-rentals':              ['cass-lake', 'leech-lake', 'gull-lake'],
        'brainerd-lakes-builders':           ['gull-lake', 'mille-lacs-lake', 'lake-minnetonka', 'white-bear-lake'],
        'minnetonka-yacht-club-photography': ['lake-minnetonka', 'white-bear-lake', 'gull-lake'],
        'north-lakes-dock-service':          ['gull-lake', 'mille-lacs-lake', 'lake-minnetonka', 'white-bear-lake'],
        'walker-bay-cafe':                   ['leech-lake', 'cass-lake', 'lake-vermilion'],
    };
    console.log('Linking businesses to lakes…');
    for (const [bizSlug, lakeSlugs] of Object.entries(BIZ_LAKE_LINKS)) {
        const bizQ = await pool.query('SELECT id FROM businesses WHERE slug = $1', [bizSlug]);
        if (!bizQ.rowCount) continue;
        const bizId = bizQ.rows[0].id;
        // Clear + replace — idempotent across re-runs.
        await pool.query('DELETE FROM business_lakes WHERE business_id = $1', [bizId]);
        for (const lakeSlug of lakeSlugs) {
            const lakeQ = await pool.query('SELECT id FROM lakes WHERE slug = $1', [lakeSlug]);
            if (!lakeQ.rowCount) continue;
            await pool.query(
                `INSERT INTO business_lakes (business_id, lake_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [bizId, lakeQ.rows[0].id]
            );
        }
        console.log(`  ↔ ${bizSlug} → ${lakeSlugs.length} lakes`);
    }

    await pool.end();
    console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
