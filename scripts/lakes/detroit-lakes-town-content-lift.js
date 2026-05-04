// Phase 1 content lift for /towns/detroit-lakes.
// Idempotent — safe to re-run. Updates the detroit-lakes tag with the
// curated SEO + description + intro + hero image. The content merges
// Section B (Town Overview) + Section D (Real Estate Context) + Section H
// (Lifestyle & Things to Do) from the brief into one description blob.
// Bold lead-in markers (**Foo.**) are stripped — paragraphs read fine
// without them since each one already opens with a topic sentence.
//
// Run with:
//   node scripts/lakes/detroit-lakes-town-content-lift.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const SLUG = 'detroit-lakes';

const INTRO = `A working county-seat town surrounded by 400 lakes — Detroit Lakes is where Lakes Country looks more like real life than vacation brochure.`;

const SECTION_B = `Detroit Lakes is the seat of Becker County in northwest Minnesota — about three hours up Highway 10 from the Twin Cities, 45 minutes east of Fargo–Moorhead, and almost dead center of what the rest of the state calls Lakes Country. Year-round population is around 9,500. In summer that number doesn't quite double, but the parking lots downtown will fool you into thinking it has.

The town sits on the north and west shore of Detroit Lake, and from there the rest of Becker County unfolds in every direction with more than 400 lakes inside a 25-mile radius. That density is the reason the local economy runs on tourism, lakeshore real estate, healthcare, and a surprisingly steady manufacturing base — and it's why "which lake" is a more useful question here than "which neighborhood."

Detroit Lakes sits on the eastern edge of the Red River Valley and the western edge of the lakes-and-pines transition. Drive 30 minutes west and you're in farmland; drive 30 minutes east and you're in the woods. The town itself has a real working downtown — Washington Avenue runs north–south through it, the railroad runs east–west across the top of Little Detroit, and the lakefront is a short walk from the courthouse.

Unlike resort-only lake towns, Detroit Lakes is genuinely year-round. The schools, the hospital, the grocery stores, and most restaurants stay open through winter. That changes the buyer pool: a Detroit Lakes lake home is as likely to be someone's primary residence as it is a second home, and the full-time population skews a little older and a little more retired than it did fifteen years ago.

Detroit Lakes Public Schools (ISD 22) runs the public district — 12 schools, roughly 2,800 students. The high school sits on Roosevelt Avenue, mascots are the Lakers, and the senior high carries Advanced Placement coursework. Public Schools Review and U.S. News both rank Detroit Lakes Senior High in the upper third of Minnesota high schools. Private and parochial options exist, mostly Christian.

Essentia Health St. Mary's-Detroit Lakes is the local hospital. For most everyday care it's enough — the more involved cases route to Fargo (Sanford or Essentia) or down to the Twin Cities. Worth knowing if you're buying as a retirement primary residence: the level-of-care question is the one second-home retirees ask first, and Detroit Lakes is one of the few Minnesota lake towns where the answer is "there's actually a hospital."

WE Fest is the headline event — country music festival held the first weekend of August at Soo Pass Ranch just south of town. Around 50,000 people. If you're buying for quiet, that weekend is not it, and seasoned cabin owners book it on their calendars the same way they book ice-out. Polar Fest in February is the winter answer — polar plunge, pond hockey, ice fishing, snowmobile runs. The Fourth of July parade and fireworks over Big Detroit are the local social anchor of summer. Add the Becker County Fair in late July, and the calendar takes care of itself.

A surprise on the list: Detroit Lakes hosts six Thomas Dambo trolls hidden in the woods around town. TIME named the project a World's Greatest Place in 2025. It's the kind of detail that doesn't fit a "lake town" pitch and is exactly the kind of thing that makes the town more than that.

Drive proximity to other lake towns: Vergas is 20 minutes south, Frazee 15 minutes east, Lake Park 10 minutes west, Pelican Rapids 30 minutes south. Park Rapids — a different lake-country anchor town — is about an hour east. The Brainerd Lakes Area is two hours east; if a buyer is comparing Detroit Lakes to Brainerd, they're choosing between "less crowded, closer to Fargo" and "bigger market, closer to the Cities."`;

const SECTION_D = `The Detroit Lakes-area market is not one market — it's six (at least). What you'll pay depends almost entirely on which lake, which side of the lake, and how recently the place was rebuilt.

Home types you'll see: original 1950s and '60s cabins on smaller lots, modernized cabins with one or two additions, full-time year-round lake homes built or rebuilt in the last 20 years, and a smaller cluster of luxury estates on the most protected shoreline of Big Detroit and the deeper basins of Big Cormorant and Pelican. In-town residential (off the lake) is its own category — workforce housing, downtown rebuilds, and a small but growing share of new construction east of Highway 10.

Big Detroit and Big Cormorant tend to command the highest prices on a per-foot-of-shoreline basis — more open water, deeper holes, more luxury inventory. Sallie and Melissa price below Detroit because the chain is more cabin-dense and lots are smaller. Floyd prices below the chain because the lake is smaller and the buyer pool is smaller. Pelican Lake is its own market — bigger, more developed, more like a Brainerd-area lake on the price ladder.

Listings start to hit in March and peak through May and June. Closings cluster in May–August. By mid-September the new-listing rate drops fast. Winter is a slower market but not a dead one — and the deals, when they show up, tend to be priced more rationally because the buyers shopping in February are serious. Bidding gets most competitive in May and June for anything turn-key.`;

const SECTION_H = `Detroit Lakes earns its lake-town billing by also being a real town. Here's what that looks like once you live here.

The Fireside is the lakes-area icon — open-air charcoal grill, view of Detroit Lake, reliable steaks and walleye. Roasted Pub & Eatery and Bucks Mill (a downtown brewery with twelve-plus taps) are the year-round downtown anchors. Long Bridge Bar, Grill & Marina and Zorbaz at the Beach are the on-the-water summer spots. Bleachers and Hub 41 round out the casual side.

Detroit Mountain Recreation Area east of town is a small ski hill in winter and a mountain-bike park the rest of the year — locally run, not part of a chain, and a quietly impressive amenity for a town this size. Trails connect snowmobiles out of town in every direction in winter. The Heartland State Trail anchors paved bike-and-walk routes. Golf-wise, the Detroit Country Club is the in-town option; Wildflower at Fair Hills (south on Pelican Lake) is the destination course.

Real grocery (more than one), real hardware (more than one), full marine and dock services, contractors who do lake-home rebuilds for a living, an actual downtown with a coffee shop, a brewery, restaurants that stay open in March. The everyday-life infrastructure here is the reason year-round buyers can actually live year-round.`;

const DESCRIPTION = [SECTION_B, SECTION_D, SECTION_H].join('\n\n');

const SEO_TITLE       = 'Detroit Lakes MN Homes for Sale | MN Lake Homes';
const SEO_DESCRIPTION = 'Detroit Lakes, MN homes for sale. County-seat town with 400+ lakes in 25 miles — Detroit, Sallie, Melissa, Big Cormorant, Pelican, Floyd. Get new listings.';
const HERO_IMG        = '/assets/images/mn-aerial-small-town.jpg';

(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        const r = await pool.query(
            `UPDATE tags
                SET intro_text      = $2,
                    description     = $3,
                    seo_title       = $4,
                    seo_description = $5,
                    hero_image_url  = $6,
                    updated_at      = NOW()
              WHERE slug = $1
              RETURNING id, name`,
            [SLUG, INTRO, DESCRIPTION, SEO_TITLE, SEO_DESCRIPTION, HERO_IMG]
        );
        if (!r.rows.length) throw new Error(`No tag with slug=${SLUG}`);
        console.log(`✓ Updated content for "${r.rows[0].name}" (${r.rows[0].id})`);

        const summary = await pool.query(
            `SELECT slug, length(description) AS desc_chars, length(intro_text) AS intro_chars,
                    seo_title, hero_image_url
               FROM tags WHERE slug = $1`,
            [SLUG]
        );
        console.log(summary.rows[0]);
        console.log('\nDone. Visit http://localhost:3000/towns/detroit-lakes');
    } catch (e) {
        console.error('FAILED:', e.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
