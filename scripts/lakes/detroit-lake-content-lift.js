// Phase 1 content lift for /lakes/detroit-lake.
// Idempotent — safe to re-run. Updates the Detroit Lake row, ensures the
// detroit-lake geo tag exists and is linked via lake_tags so any agent /
// business / blog post tagged "detroit-lake" auto-populates the lake page's
// dynamic blocks.
//
// Run with:
//   node scripts/lakes/detroit-lake-content-lift.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const SLUG = 'detroit-lake';

const INTRO = `A 3,000-acre walleye and muskie lake in northwest MN's lakes country — the kind of summer-cabin-on-the-water destination Minnesotans drive three hours for and Fargo families come to most weekends.`;

const DESCRIPTION = `Detroit Lake sits in Becker County, about 225 miles northwest of the Twin Cities — roughly three and a half hours via I-94 and Highway 10 — and an easy hour east of Fargo–Moorhead. The city of Detroit Lakes shares the lake's southwestern shore, which makes this one of the rare Minnesota lakes where you can walk from a coffee shop to a public beach in under five minutes.

The lake covers roughly 3,000 acres of surface water, with a maximum depth around 88 feet and an average depth near 32 feet. The main basin (Big Detroit) connects to Little Detroit Lake on the north end, and the wider Detroit Lakes chain — Big Cormorant, Lake Sallie, Lake Melissa, Floyd Lake, Long Lake — sits within an easy boat or short drive away. That chain is the structural reason buyers come to this market: a Detroit Lake address gives you fast access to a half-dozen distinct lakes without locking yourself into one shoreline.

Buyers landing on Detroit Lake for the first time tend to come from one of three places. Fargo–Moorhead families looking for a weekend cabin within an hour. Twin Cities families looking for somewhere quieter than the Brainerd Lakes Area. And out-of-state retirees — Iowa, Texas, Arizona — who summer in Detroit Lakes and winter south. The result is a lake with the activity of a tourist town and the residential rhythm of a place that actually runs year-round. The city itself sits at about 9,500 people year-round and roughly doubles in summer.

For fishing, the signature game is walleye and muskie. Detroit Lake is on the Minnesota DNR's muskie-management list and has produced serious fish for decades. Northern pike, smallmouth and largemouth bass, and a strong panfish population (sunfish, crappies, perch) round out the lineup. Boating culture is mature — pontoons dominate the social side, but the main basin has enough room for water skiing while Little Detroit and the connecting channels stay quiet for paddlers and morning fishing.

The summer calendar is busy in a way that surprises first-timers. The Water Carnival in July, Polar Fest in February (ice fishing tournaments and a literal jump into a hole cut in the lake), and WE Fest, the country music festival at Soo Pass Ranch just outside town, draw tens of thousands of out-of-town visitors each year. Detroit Mountain Recreation Area on the south edge of town runs year-round — skiing and tubing in winter, mountain biking and disc golf in summer.

The town side gives the lake its commercial backbone, and it's better than most. Downtown is compact and walkable. The Pavilion is a historic lakeside landmark hosting concerts and events. Holmes Theatre handles arts programming, and a scattering of locally-owned restaurants and shops keep the place feeling like a real town rather than a strip-mall vacation outpost. Essentia Health St. Mary's hospital handles the medical side. Detroit Lakes Public Schools serves year-round families and is regarded well for a district of its size.

Drive times worth knowing: Fargo–Moorhead is about an hour. Bemidji is about ninety minutes. Brainerd is about ninety minutes east. The Twin Cities is three and a half hours.

Detroit Lake sits in the mid-tier of Minnesota lake-home pricing — less expensive than Lake Minnetonka or the Whitefish Chain, more developed and pricier than the dozens of smaller lakes scattered across Becker County. Inventory typically falls into three bands: vintage cabins from roughly $400K to $700K, mid-tier modern lake homes between $700K and $1.5M, and a smaller cluster of luxury estates above $2M. Lot character — proximity to town, depth of the parcel, dock access — drives price more than home square footage on this lake.

Seasonality follows the standard Minnesota pattern. Inventory peaks in late spring as sellers prep for summer showings; the most competitive bidding happens between Memorial Day and the Fourth of July. Most listings come off by Labor Day, and winter inventory is thinner and skews toward pre-arranged off-market deals through local agents.`;

const SEO_TITLE       = 'Detroit Lake Homes for Sale | MN Lake Homes';
const SEO_DESCRIPTION = 'Browse homes on Detroit Lake in Detroit Lakes, MN. Lake-home market data, trusted local agents, and a curated list of resorts, marinas, and lake-area pros.';
const HERO_IMG        = '/assets/images/mn-aerial-small-town.jpg';
const FEATURED_IMG    = '/assets/images/mn-couple-lake-sunset.jpg';
const LAT             = 46.7866;
const LNG             = -95.8456;

(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        await pool.query('BEGIN');

        // 1. Lake content lift.
        const upd = await pool.query(
            `UPDATE lakes
                SET intro_text         = $2,
                    description        = $3,
                    seo_title          = $4,
                    seo_description    = $5,
                    hero_image_url     = $6,
                    featured_image_url = $7,
                    latitude           = $8,
                    longitude          = $9,
                    status             = 'published',
                    updated_at         = NOW()
              WHERE slug = $1
              RETURNING id, name`,
            [SLUG, INTRO, DESCRIPTION, SEO_TITLE, SEO_DESCRIPTION, HERO_IMG, FEATURED_IMG, LAT, LNG]
        );
        if (!upd.rows.length) throw new Error(`No lake row with slug=${SLUG}`);
        const lakeId = upd.rows[0].id;
        console.log(`✓ Updated lake content for "${upd.rows[0].name}" (${lakeId})`);

        // 2. Ensure the detroit-lake tag exists in the geo tags catalog so
        //    agents/businesses/blog posts tagged 'detroit-lake' surface here.
        const tagRes = await pool.query(
            `INSERT INTO tags (slug, name, state, region, latitude, longitude, active)
             VALUES ($1, $2, 'MN', 'Lakes Country', $3, $4, TRUE)
             ON CONFLICT (slug) DO UPDATE
                SET name      = EXCLUDED.name,
                    state     = EXCLUDED.state,
                    region    = EXCLUDED.region,
                    latitude  = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    active    = TRUE,
                    updated_at = NOW()
             RETURNING id`,
            [SLUG, 'Detroit Lake', LAT, LNG]
        );
        const tagId = tagRes.rows[0].id;
        console.log(`✓ Tag "${SLUG}" ready (${tagId})`);

        // 3. Link the tag to the lake (idempotent — UNIQUE on lake_id+tag_id).
        await pool.query(
            `INSERT INTO lake_tags (lake_id, tag_id)
             VALUES ($1, $2)
             ON CONFLICT (lake_id, tag_id) DO NOTHING`,
            [lakeId, tagId]
        );
        console.log(`✓ lake_tags row linking "${SLUG}" tag to Detroit Lake`);

        await pool.query('COMMIT');

        // 4. Quick sanity printout of the final state.
        const summary = await pool.query(
            `SELECT slug, status, length(description) AS desc_chars,
                    hero_image_url, featured_image_url,
                    latitude, longitude
               FROM lakes WHERE slug = $1`,
            [SLUG]
        );
        console.log('\nFinal Detroit Lake row:');
        console.log(summary.rows[0]);

        const tags = await pool.query(
            `SELECT t.slug FROM lake_tags lt
              JOIN tags  t ON t.id = lt.tag_id
              JOIN lakes l ON l.id = lt.lake_id
             WHERE l.slug = $1
             ORDER BY t.slug`,
            [SLUG]
        );
        console.log('Linked tags:', tags.rows.map(r => r.slug).join(', '));

        console.log('\nDone. Visit http://localhost:3000/lakes/detroit-lake');
    } catch (e) {
        await pool.query('ROLLBACK').catch(() => {});
        console.error('FAILED:', e.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
