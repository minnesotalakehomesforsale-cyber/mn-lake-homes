/**
 * seed-agents.js — MN Lake Homes Featured Agent Profiles
 *
 * Creates the three homepage featured agents as fully real, published profiles
 * with login credentials, complete profile data, and admin visibility.
 *
 * Run (from project root):
 *   node scripts/seed-agents.js
 *
 * Re-running is safe — uses ON CONFLICT to update existing records.
 *
 * Credentials created:
 *   David Chen    → david.chen@mnlakehomes.com     / LakeExpert2024!
 *   Sarah Jenkins → sarah.jenkins@mnlakehomes.com  / LakeExpert2024!
 *   Marcus W.     → marcus.washington@mnlakehomes.com / LakeExpert2024!
 */

// Accept DATABASE_URL from the real environment when present (prod run);
// fall back to .env.local otherwise so local development stays zero-config.
if (!process.env.DATABASE_URL) {
    require('dotenv').config({ path: '.env.local' });
}

const bcrypt = require('bcrypt');
const pool   = require('../src/database/pool');
console.log('→ Connecting to:', (process.env.DATABASE_URL || '').replace(/:[^:@]+@/, ':****@'));

const AGENT_PASSWORD = 'LakeExpert2024!';

const AGENTS = [
    {
        // ── User record ──────────────────────────────────────────────────
        first_name: 'David',
        last_name:  'Chen',
        full_name:  'David Chen',
        email:      'david.chen@mnlakehomes.com',
        role:       'agent',

        // ── Agent profile ────────────────────────────────────────────────
        slug:         'david-chen',
        display_name: 'David Chen',
        title:        'Senior Lake Specialist',
        membership:   'top_agent',
        brokerage_name:  'MN Lake Homes Realty',
        license_number:  'MN-RE-48291',
        phone_public:    '(612) 555-0148',
        email_public:    'david.chen@mnlakehomes.com',
        city:            'Wayzata',
        years_experience: 15,
        is_featured:  true,
        is_verified:  true,
        profile_photo_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=800&auto=format&fit=crop',
        cover_photo_url:   'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=1200',
        service_areas: JSON.stringify(['Lake Minnetonka', 'Wayzata', 'Minnetrista', 'Orono', 'Spring Park', 'Deephaven']),
        specialties:   JSON.stringify(['Luxury Shoreline Estates', 'High-Value Negotiations', 'Zoning & Regulatory Guidance', 'Investment Properties', 'Off-Market Listings']),
        bio: `David Chen is MN Lake Homes' most decorated Senior Lake Specialist, with 15 years of exclusive focus on Lake Minnetonka's premier shoreline estates. A Wayzata native, David grew up on these waters and brings an unmatched depth of local knowledge to every transaction — from understanding the nuances of riparian rights and DNR shoreline regulations to knowing which docks offer the best sunrise views.

Over his career, David has closed more than $280 million in lakefront sales and consistently ranks in the top 1% of Minnesota real estate professionals. He has represented clients in some of the most complex high-value negotiations in the Lake Minnetonka market and built a reputation for discretion, professionalism, and results.

Whether you're acquiring a trophy estate on Crystal Bay, navigating the permitting process for a dock expansion, or positioning a multi-generational property for sale, David's process is methodical, transparent, and relentlessly client-focused. He works with a curated client base by referral and introductions only, ensuring every buyer and seller receives his full attention from initial consultation through closing day.

David holds an active Minnesota real estate license (MN-RE-48291), is a certified Luxury Home Marketing Specialist (CLHMS), and is a member of the Minnetonka Area Association of Realtors.`,
        linkedin_url: 'https://linkedin.com',
        instagram_url: 'https://instagram.com',
    },
    {
        // ── User record ──────────────────────────────────────────────────
        first_name: 'Sarah',
        last_name:  'Jenkins',
        full_name:  'Sarah Jenkins',
        email:      'sarah.jenkins@mnlakehomes.com',
        role:       'agent',

        // ── Agent profile ────────────────────────────────────────────────
        slug:         'sarah-jenkins',
        display_name: 'Sarah Jenkins',
        title:        'Luxury Waterfront Director',
        membership:   'top_agent',
        brokerage_name:  'MN Lake Homes Realty',
        license_number:  'MN-RE-37584',
        phone_public:    '(218) 555-0193',
        email_public:    'sarah.jenkins@mnlakehomes.com',
        city:            'Brainerd',
        years_experience: 11,
        is_featured:  true,
        is_verified:  true,
        profile_photo_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=800&auto=format&fit=crop',
        cover_photo_url:   'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=1200',
        service_areas: JSON.stringify(['Brainerd Lakes Area', 'Gull Lake', 'Nisswa', 'Crosslake', 'Pequot Lakes', 'Breezy Point']),
        specialties:   JSON.stringify(['Luxury Waterfront Estates', 'Seller Marketing & Staging', 'Out-of-State Buyer Network', 'Premium Cash Offers', 'Vacation Rental Investment']),
        bio: `Sarah Jenkins is the Luxury Waterfront Director at MN Lake Homes and the undisputed authority on Brainerd Lakes Area real estate. With 11 years embedded in this market, Sarah has developed one of the most extensive out-of-state buyer networks in the industry — connecting Minneapolis, Chicago, and Twin Cities executives with their perfect Minnesota retreat.

Her sellers consistently receive multiple offers within the first week on market. Sarah's comprehensive marketing approach combines professional photography, drone footage, targeted digital campaigns, and direct outreach to her proprietary database of 1,400+ qualified luxury buyers — many of whom are actively searching for properties before they ever hit MLS.

Sarah's background in interior design gives her an exceptional eye for staging and presentation. She has transformed underperforming listings into bidding-war properties simply through strategic staging and repositioning. Her clients trust her not only to maximize sale price but to manage the entire process from pre-listing preparation through post-closing handoff.

With over $195 million in closed volume and a 98% list-to-sale price ratio, Sarah is consistently ranked as a top producer in the Brainerd-Crow Wing County market. She holds an active Minnesota license (MN-RE-37584) and is a Certified Luxury Home Marketing Specialist (CLHMS) with the Million Dollar Guild distinction.`,
        linkedin_url: 'https://linkedin.com',
        facebook_url: 'https://facebook.com',
    },
    {
        // ── User record ──────────────────────────────────────────────────
        first_name: 'Marcus',
        last_name:  'Washington',
        full_name:  'Marcus Washington',
        email:      'marcus.washington@mnlakehomes.com',
        role:       'agent',

        // ── Agent profile ────────────────────────────────────────────────
        slug:         'marcus-washington',
        display_name: 'Marcus Washington',
        title:        "Buyer's Agent — Northern Lakes Specialist",
        membership:   'mn_lake_specialist',
        brokerage_name:  'MN Lake Homes Realty',
        license_number:  'MN-RE-52847',
        phone_public:    '(218) 555-0267',
        email_public:    'marcus.washington@mnlakehomes.com',
        city:            'Grand Rapids',
        years_experience: 8,
        is_featured:  false,
        is_verified:  true,
        profile_photo_url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=800&auto=format&fit=crop',
        cover_photo_url:   'https://images.unsplash.com/photo-1501426026826-31c667bdf23d?q=80&w=1200',
        service_areas: JSON.stringify(['Leech Lake', 'Lake Winnibigoshish', 'Mille Lacs Lake', 'Grand Rapids', 'Itasca County', 'Aitkin County']),
        specialties:   JSON.stringify(['First-Time Lake Home Buyers', 'Structural & Dock Inspection', 'Hidden Value Properties', 'Cabin & Recreational Properties', 'Northern Minnesota Market']),
        bio: `Marcus Washington is MN Lake Homes' Northern Lakes Specialist and one of Minnesota's most trusted buyer's agents for first-time lake home purchasers. Based in Grand Rapids with deep roots across Itasca and Aitkin counties, Marcus has spent 8 years helping families find their first slice of the Minnesota lake lifestyle — without getting overwhelmed, overpaying, or making costly mistakes.

What sets Marcus apart is his eye for the details that matter. A former licensed home inspector turned realtor, Marcus understands structural integrity, dock systems, septic evaluation, and waterfront grading at a level most agents simply don't. His buyers consistently avoid expensive surprises after closing because Marcus spots issues before they become problems.

He has a particular talent for finding hidden value — properties that the market hasn't fully priced in, whether due to cosmetic condition, days-on-market stigma, or seller motivation. His clients have purchased dream lake homes well below asking price on more than one occasion because Marcus knew when to act and how to negotiate.

Marcus works patiently and without pressure. He believes buying a lake home is one of the most meaningful financial decisions a family can make, and he treats every search with that weight. He's available seven days a week and responds to all client communications within the hour.

Marcus holds an active Minnesota real estate license (MN-RE-52847) and is a member of the Northern Lakes Association of Realtors.`,
        instagram_url: 'https://instagram.com',
        facebook_url:  'https://facebook.com',
    }
];

async function seed() {
    console.log('=======================================================');
    console.log(' MN LAKE HOMES — FEATURED AGENT SEED');
    console.log('=======================================================\n');

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // ── Resolve membership IDs ──────────────────────────────────────
        const memRes = await client.query('SELECT id, code FROM memberships');
        const memMap = {};
        memRes.rows.forEach(m => { memMap[m.code] = m.id; });

        const requiredTiers = ['basic', 'mn_lake_specialist', 'top_agent'];
        for (const tier of requiredTiers) {
            if (!memMap[tier]) throw new Error(`Membership tier "${tier}" not found. Run \`npm run db:setup\` first.`);
        }
        console.log('✅ Membership tiers verified.\n');

        // ── Resolve super_admin ID for approved_by_user_id ─────────────
        const adminRes = await client.query(
            `SELECT id FROM users WHERE role IN ('super_admin','admin') ORDER BY created_at ASC LIMIT 1`
        );
        const adminId = adminRes.rows[0]?.id || null;

        // ── Hash the shared password once ──────────────────────────────
        const passwordHash = await bcrypt.hash(AGENT_PASSWORD, 10);

        for (const a of AGENTS) {
            // 1. Upsert user account
            const userRes = await client.query(`
                INSERT INTO users
                    (first_name, last_name, full_name, email, password_hash, role, account_status, email_verified_at)
                VALUES ($1, $2, $3, $4, $5, $6, 'active', CURRENT_TIMESTAMP)
                ON CONFLICT (email) DO UPDATE SET
                    first_name     = EXCLUDED.first_name,
                    last_name      = EXCLUDED.last_name,
                    full_name      = EXCLUDED.full_name,
                    password_hash  = EXCLUDED.password_hash,
                    role           = EXCLUDED.role,
                    account_status = 'active'
                RETURNING id
            `, [a.first_name, a.last_name, a.full_name, a.email, passwordHash, a.role]);

            const userId = userRes.rows[0].id;

            const membershipId = memMap[a.membership];

            // 2. Upsert agent profile — fully published
            await client.query(`
                INSERT INTO agents (
                    user_id, membership_id, slug, display_name,
                    brokerage_name, license_number,
                    phone_public, email_public,
                    city, state, years_experience,
                    service_areas, specialties, bio,
                    profile_photo_url, cover_photo_url,
                    linkedin_url, instagram_url, facebook_url,
                    is_featured, is_verified,
                    profile_status, is_published, published_at,
                    approved_by_user_id, approved_at
                )
                VALUES (
                    $1,  $2,  $3,  $4,
                    $5,  $6,
                    $7,  $8,
                    $9,  'Minnesota', $10,
                    $11::jsonb, $12::jsonb, $13,
                    $14, $15,
                    $16, $17, $18,
                    $19, $20,
                    'published', true, CURRENT_TIMESTAMP,
                    $21, CURRENT_TIMESTAMP
                )
                ON CONFLICT (slug) DO UPDATE SET
                    user_id            = EXCLUDED.user_id,
                    membership_id      = EXCLUDED.membership_id,
                    display_name       = EXCLUDED.display_name,
                    brokerage_name     = EXCLUDED.brokerage_name,
                    license_number     = EXCLUDED.license_number,
                    phone_public       = EXCLUDED.phone_public,
                    email_public       = EXCLUDED.email_public,
                    city               = EXCLUDED.city,
                    years_experience   = EXCLUDED.years_experience,
                    service_areas      = EXCLUDED.service_areas,
                    specialties        = EXCLUDED.specialties,
                    bio                = EXCLUDED.bio,
                    profile_photo_url  = EXCLUDED.profile_photo_url,
                    cover_photo_url    = EXCLUDED.cover_photo_url,
                    linkedin_url       = EXCLUDED.linkedin_url,
                    instagram_url      = EXCLUDED.instagram_url,
                    facebook_url       = EXCLUDED.facebook_url,
                    is_featured        = EXCLUDED.is_featured,
                    is_verified        = EXCLUDED.is_verified,
                    profile_status     = 'published',
                    is_published       = true,
                    published_at       = COALESCE(agents.published_at, CURRENT_TIMESTAMP),
                    approved_by_user_id = EXCLUDED.approved_by_user_id,
                    approved_at        = COALESCE(agents.approved_at, CURRENT_TIMESTAMP),
                    updated_at         = CURRENT_TIMESTAMP
            `, [
                userId, membershipId, a.slug, a.display_name,
                a.brokerage_name, a.license_number,
                a.phone_public, a.email_public,
                a.city, a.years_experience,
                a.service_areas, a.specialties, a.bio,
                a.profile_photo_url, a.cover_photo_url,
                a.linkedin_url || null, a.instagram_url || null, a.facebook_url || null,
                a.is_featured, a.is_verified,
                adminId
            ]);

            console.log(`✅ ${a.display_name} (${a.slug}) — ${a.membership} — published`);
            console.log(`   Login: ${a.email}  /  ${AGENT_PASSWORD}`);
            console.log(`   Profile: /pages/public/agent-profile.html?slug=${a.slug}\n`);
        }

        // Tag David Chen with every active geo tag so he surfaces as the
        // featured agent on every single lake + town page. Idempotent —
        // safe to re-run.
        const { rows: davidRow } = await client.query(
            `SELECT u.id FROM users u WHERE u.email = 'david.chen@mnlakehomes.com' LIMIT 1`
        );
        if (davidRow.length) {
            const davidId = davidRow[0].id;
            await client.query(`DELETE FROM user_tags WHERE user_id = $1`, [davidId]);
            const { rows: activeTags } = await client.query(
                `SELECT id FROM tags WHERE active = TRUE`
            );
            for (const t of activeTags) {
                await client.query(
                    `INSERT INTO user_tags (user_id, tag_id) VALUES ($1, $2)
                     ON CONFLICT DO NOTHING`,
                    [davidId, t.id]
                );
            }
            console.log(`🌍 David Chen tagged with ${activeTags.length} geo tags (everywhere-agent)`);
        }

        await client.query('COMMIT');

        console.log('=======================================================');
        console.log(' SEED COMPLETE ✅');
        console.log('=======================================================');
        console.log('\nAll agents are published and visible at:');
        console.log('  Public directory : /pages/public/agents.html');
        console.log('  Admin ledger     : /pages/admin/agents.html');
        console.log('\nShared agent password:', AGENT_PASSWORD);
        console.log('(Each agent should change their password after first login)\n');

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
