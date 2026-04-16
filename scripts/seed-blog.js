/**
 * seed-blog.js
 * Seeds the 4 blog posts that were previously hardcoded in blog.html.
 * Run: node scripts/seed-blog.js
 */

require('dotenv').config({ path: '.env.local' });
const pool = require('../src/database/pool');

const posts = [
    {
        title: '5 Things to Look For in a Lake Property',
        slug: '5-things-to-look-for-in-a-lake-property',
        tag: 'Buyer Guide',
        read_time_minutes: 4,
        excerpt: "Buying a lake home is one of the most exciting purchases you'll ever make — but it comes with unique considerations that a traditional home purchase doesn't. Here's what to evaluate before you sign.",
        cover_image_url: '/assets/images/mn-cape-cod-lakefront.jpg',
        is_published: true,
        published_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        body: `<p>Buying a lake home is one of the most exciting purchases you'll ever make. Whether it's a weekend retreat or a permanent residence, lakefront property comes with a lifestyle unlike anything else. But it also comes with considerations that most buyers — especially first-timers — overlook. Before you fall in love with the view and make an offer, here are the five things you absolutely need to evaluate.</p>

<h2>1. Water Frontage and Bottom Quality</h2>
<p>Not all lake frontage is created equal. The amount of usable shoreline you own directly affects your enjoyment and resale value. A property with 100 feet of hard-sand frontage is worth significantly more than one with 60 feet of weedy, soft-bottom shoreline — even if the listing price looks similar.</p>
<p>Walk into the water at low tide if you can. Check for weed density, water clarity, and bottom firmness. If you plan to swim, kayak, or have kids playing in the shallows, this matters enormously.</p>

<h2>2. Dock Rights and Existing Structures</h2>
<p>In Minnesota, not every lakefront property automatically grants you the right to install a permanent dock. Dock permits are issued at the county level and can be affected by the lake's classification, shoreline type, and whether the property has existing grandfathered structures. Always ask for the current dock permit status and whether it transfers to you at closing.</p>
<p>If the property already has a dock, boat lift, or boathouse, verify those are legally permitted — not just "always been there." Unpermitted structures can become your problem the moment you own the property.</p>

<h2>3. Septic System Age and Capacity</h2>
<p>The majority of lake homes in Minnesota are on private septic systems, not municipal sewer. A failing septic system is one of the most expensive surprises a lake home buyer can face — with replacement costs often running $15,000–$40,000 or more depending on soil conditions and system type.</p>
<p>Ask for the last inspection certificate and pump records. If the system is more than 20 years old with no recent inspection, budget for a full evaluation as part of your contingency period.</p>

<h2>4. Flood Zone and Shoreline Setback Rules</h2>
<p>Minnesota has strong shoreland zoning regulations that dictate how close to the water you can build, expand, or even landscape. Most lakes have a minimum 75-foot setback for structures, and some high-priority lakes enforce 150 feet or more.</p>
<p>This matters if you plan to add a garage, expand the deck, or build a screened porch. What you envision doing to the property may not be legally permitted. Always pull the county zoning rules before you commit.</p>

<h2>5. Off-Season Access and Road Maintenance</h2>
<p>That gorgeous private road you drove down in July might be impassable by February. Ask who maintains the road to the property — the county, a lake association, or the individual owners? If it's a shared private road, request a copy of the road maintenance agreement and find out what each owner contributes.</p>
<p>Year-round accessibility also affects your insurance, mortgage terms, and ability to rent the property short-term. Some lenders treat seasonal-access properties differently than those with year-round road access.</p>

<h2>The Bottom Line</h2>
<p>A good lake property isn't just about the view — it's about the full package: the water quality, the legal rights, the infrastructure, and the surrounding rules. Work with an agent who specializes in lake properties. They'll know which questions to ask and which red flags most general agents miss. If you'd like help evaluating a specific property or lake region, our team is here to help.</p>`,
    },
    {
        title: 'Top 10 Lakes in Minnesota for Boating Enthusiasts',
        slug: 'top-10-minnesota-lakes-for-boating',
        tag: 'Local Life',
        read_time_minutes: 3,
        excerpt: "Minnesota is home to over 11,000 lakes, but not all are created equal for boating. Here's our ranked list of the best lakes for powerboaters, pontoon cruisers, and watersport lovers.",
        cover_image_url: '/assets/images/mn-purple-sunset-marina.webp',
        is_published: true,
        published_at: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000),
        body: `<p>Minnesota is called the "Land of 10,000 Lakes" — though the real count is closer to 11,842. With so many options, choosing where to boat can feel overwhelming. We've narrowed it down to the top 10 lakes that consistently rank among the best for powerboating, pontoon cruising, wake sports, and fishing from a boat.</p>

<h2>1. Lake Minnetonka</h2>
<p>The undisputed king of Twin Cities boating. With 14,528 acres and 110 miles of shoreline, Minnetonka offers everything: marinas, restaurants accessible by boat, sandbars to anchor and socialize, and deep water for serious wake sports. It's busy on summer weekends, but the experience is unmatched.</p>

<h2>2. Mille Lacs Lake</h2>
<p>The second-largest lake entirely within Minnesota at 132,516 acres. Mille Lacs is famous for walleye fishing, but its sheer size makes it excellent for long-range cruising. Just plan around wind — it can get choppy quickly on open water this large.</p>

<h2>3. Gull Lake (Brainerd)</h2>
<p>One of the most popular resort lakes in the state, Gull Lake is known for clear water, a lively boating scene, and proximity to the Brainerd Lakes area's restaurants and resorts. Pontoon and wakeboard boats coexist comfortably thanks to reasonable size and good no-wake zone management.</p>

<h2>4. Leech Lake</h2>
<p>At 112,000 acres, Leech Lake is Minnesota's third-largest lake and a serious boater's destination. It's known for walleye, northern pike, and muskie fishing — but its open bays and protected channels make it excellent for cruising as well. Walker, MN on its shores is a classic lake town.</p>

<h2>5. Lake Vermilion</h2>
<p>Northeastern Minnesota's crown jewel. Vermilion has over 1,200 miles of shoreline and 365 islands, making it endlessly explorable. The scenery rivals anything in the Boundary Waters and the fishing is world-class. Buy a good chart — navigation through the islands takes some local knowledge.</p>

<h2>6. Prior Lake</h2>
<p>The closest major boating lake to the Twin Cities south metro. Prior Lake is well-maintained, has multiple public launches, and a strong watersport culture. Lower Prior Lake is connected to Upper Prior, giving you variety in a single trip.</p>

<h2>7. Lake Kabetogama</h2>
<p>Located within Voyageurs National Park, Kabetogama is wilderness boating at its finest. The park is only accessible by water — there are no roads through it — which means you're truly off the grid. Stunning scenery, excellent bass and walleye fishing, and almost no crowds by midsummer.</p>

<h2>8. White Bear Lake</h2>
<p>The historic boating destination of St. Paul's north suburbs. White Bear has a long sailing and powerboat tradition, a beautiful yacht club, and well-organized regattas throughout summer. Smaller than Minnetonka but less chaotic on summer weekends.</p>

<h2>9. Lake of the Woods</h2>
<p>A borderless experience — Lake of the Woods straddles Minnesota, Ontario, and Manitoba, covering over 1.7 million acres. It's a bucket-list destination for serious anglers (walleye fishing is legendary) and boaters who want open water with no horizon. Plan this one as a dedicated trip, not a day outing.</p>

<h2>10. Big Birch Lake (Wadena County)</h2>
<p>Our under-the-radar pick. Big Birch is a hidden gem in central Minnesota with excellent water clarity, a sandy bottom, and a much quieter scene than the famous resort lakes. If you want a beautiful boating experience without the crowds, this is worth the drive.</p>

<h2>Finding a Home on the Water</h2>
<p>If any of these lakes have you thinking about owning instead of just visiting, our agents specialize in exactly that. We can match you with properties on the lakes that fit your boating style, budget, and lifestyle. Reach out anytime — we'd love to talk water.</p>`,
    },
    {
        title: 'How to Stage Your Cabin for Maximum Value',
        slug: 'how-to-stage-your-cabin-for-maximum-value',
        tag: 'Seller Resources',
        read_time_minutes: 5,
        excerpt: "Staging a lakefront cabin is different from staging a suburban home. Buyers are purchasing a lifestyle, not just square footage. Here's how to show them exactly what that lifestyle looks like at its best.",
        cover_image_url: '/assets/images/mn-rustic-modern-lake-house.jpg',
        is_published: true,
        published_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        body: `<p>Selling a lakefront cabin or lake home is a fundamentally different sales process than selling a house in the suburbs. Buyers aren't just evaluating square footage and lot size — they're buying into a fantasy. They want to see themselves on the dock at sunset, hear the loons in the morning, and imagine family weekends spent exactly where you've been spending yours. Your job, as a seller, is to make that vision as vivid as possible.</p>
<p>Here's how to stage your cabin for maximum impact — and maximum price.</p>

<h2>1. Lead With the Water View, Always</h2>
<p>Every room in your cabin should point toward the water, conceptually and physically. Move furniture so it faces the lake. Remove anything that blocks sightlines to the water — overgrown shrubs, cluttered decks, dark window treatments. The first thing a buyer should see when they walk through your front door is water.</p>
<p>If your cabin has a screened porch or a deck, stage it fully: chairs arranged toward the lake, a table set as if someone just finished breakfast, maybe a pair of binoculars and a bird guide left casually on the railing. Sell the morning.</p>

<h2>2. Declutter Ruthlessly — Then Add Back Intentionally</h2>
<p>Lake cabins accumulate decades of stuff: fishing gear, old life jackets, mismatched furniture inherited from relatives, faded towels, and an inexplicable number of board games. Clear all of it out before photos and showings.</p>
<p>Then add back selectively. A well-placed kayak paddle leaning against a clean mudroom wall reads as "adventure awaits." Three moldy life jackets stuffed under a bench reads as "neglect." The difference is curation. Keep what tells the story, eliminate what distracts from it.</p>

<h2>3. The Dock Is Part of the Showing</h2>
<p>Most listing agents only stage the interior. Your dock is one of your most valuable selling features — treat it that way. Power-wash the boards, replace any rotted planks, add a couple of Adirondack chairs, and stage an afternoon out there. If you have a boat lift, make sure the lift is operational and the boat is clean. A clean, inviting dock adds measurable perceived value.</p>

<h2>4. Address the Smells</h2>
<p>Lake cabins often have a characteristic smell — a mix of pine, must, mildew, and old wood. You know it, but you've stopped noticing it. Buyers will notice it immediately and it will undermine everything else you've done. Air the cabin out for several days before showings if weather permits. Replace old mattresses and rugs if needed. Use a light, neutral dehumidifier. Avoid heavy artificial scents — they signal that you're hiding something.</p>

<h2>5. Update the Lighting</h2>
<p>Old cabin lighting — dark lampshades, single overhead fixtures, flickering fluorescents in the kitchen — makes spaces feel small and dated. Swap out bulbs for warm-white LEDs at minimum. Add floor lamps in dark corners. Clean every window inside and out so natural light floods in. Bright cabins feel larger, newer, and more welcoming.</p>

<h2>6. Professional Photography Is Non-Negotiable</h2>
<p>The vast majority of lake home buyers search online before ever contacting an agent. Your listing photos are your first showing. Hire a professional photographer who has experience with real estate and can come at golden hour — the 30–60 minutes after sunrise or before sunset when the light on the water is extraordinary. Drone photography of the waterfront is worth every penny for lakefront properties specifically.</p>

<h2>7. Price It Right From Day One</h2>
<p>Overpricing a lake home and then reducing the price later is the single most damaging thing sellers do to their own sale. Days on market kill perceived value on lake properties — buyers wonder what's wrong with it. Work with your agent to understand comparable sales and position your property competitively from the first day it hits the market. A well-staged, correctly-priced lake home in good condition should generate offers within two to three weeks in a normal market.</p>

<h2>Ready to List?</h2>
<p>If you're considering selling your lake property and want a professional evaluation, our agents can provide a complimentary market analysis and staging consultation. We know the lake market, and we know how to position your property to attract the right buyers at the right price.</p>`,
    },
    {
        title: 'Discovering the Magic of Northern Minnesota',
        slug: 'discovering-the-magic-of-northern-minnesota',
        tag: 'Community',
        read_time_minutes: 4,
        excerpt: "Northern Minnesota is more than a destination — it's a mindset. For those who've experienced it, no explanation is needed. For those who haven't, here's what you're missing.",
        cover_image_url: '/assets/images/mn-wilderness-lake-dock.jpg',
        is_published: true,
        published_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        body: `<p>There's a particular kind of quiet that only exists in northern Minnesota. It's not the absence of sound — the loons call, the pines creak in the wind, the fish jump — it's the absence of urgency. Time moves differently up north. The pace is dictated by sunrises and sunsets, not calendars and commutes. If you've been there, you already know. If you haven't, this is your introduction.</p>

<h2>The Boundary Waters: Wilderness You Can Actually Reach</h2>
<p>The Boundary Waters Canoe Area Wilderness is one of the most visited wilderness areas in the United States — and one of the most pristine. Over a million acres of interconnected lakes, rivers, and forest, accessible only by paddle and portage. No motorized vehicles, no resorts, no Wi-Fi. Just you, a canoe, and a lake that looks the same as it did a hundred years ago.</p>
<p>You don't need to be an expert paddler to experience it. Day trips from entry points near Ely or Grand Marais are accessible to almost any fitness level. But for those who spend a week deep in the interior, it's a transformative experience that city life simply cannot replicate.</p>

<h2>Ely: The Gateway Town That Became a Destination</h2>
<p>Ely is a town of about 3,000 people that manages to feel like both a working-class mining community and a sophisticated outdoor destination simultaneously. The International Wolf Center and the North American Bear Center draw visitors from around the world. The Main Street has exceptional restaurants, independent outfitters, art galleries, and a bookstore that's operated continuously since 1938. And from Ely, the Boundary Waters is fifteen minutes away.</p>
<p>Ely is also one of the more accessible lake property markets in the region — you can find cabins on smaller lakes in the surrounding area at prices that feel impossible compared to the metro lakes. The trade-off is remoteness; the reward is authenticity.</p>

<h2>Grand Marais and the North Shore</h2>
<p>The North Shore of Lake Superior stretches 150 miles from Duluth to the Canadian border, and Grand Marais sits near its northern end as a town seemingly designed for people who appreciate good coffee, fresh fish, and hiking trails with views that look like screensavers. The Gunflint Trail extends 57 miles from Grand Marais into the wilderness, with lodges and lake properties along the entire route.</p>
<p>Lake Superior itself isn't a swimming lake — it's cold, vast, and occasionally violent. But it's one of the most dramatically beautiful bodies of water in North America, and living within sight of it changes how you see the world.</p>

<h2>The Itasca Region: Where the Mississippi Begins</h2>
<p>Itasca State Park, Minnesota's oldest, contains the headwaters of the Mississippi River — a modest stream you can wade across in summer, impossible to reconcile with the great river it becomes. But the park itself is worth a visit for the old-growth red and white pines alone, some of which were saplings before European contact.</p>
<p>The lakes around Park Rapids and Nevis in the Itasca region are a well-kept secret among Twin Cities families looking for lake properties with reasonable prices and exceptional fishing. The scenery is pure Minnesota: birch and pine, clean water, loons at dusk.</p>

<h2>Why People Don't Just Visit — They Move</h2>
<p>We talk to buyers every week who started with "we're thinking about a cabin" and ended up with "we're thinking about making this our permanent home." Northern Minnesota has a way of doing that. The combination of natural beauty, community authenticity, affordable land relative to the coasts, and a pace of life that prioritizes experience over productivity is a powerful argument for re-evaluating where you live.</p>
<p>Remote work has made it more possible than ever. Broadband internet has reached most northern Minnesota lake communities. The calculation that once required giving up a career to live in the wilderness has changed dramatically.</p>
<p>If northern Minnesota is calling to you — even faintly — it's worth a conversation. Our agents know this region, and we can show you what's possible.</p>`,
    },
];

async function seed() {
    const client = await pool.connect();
    try {
        let count = 0;
        for (const post of posts) {
            await client.query(`
                INSERT INTO blog_posts (title, slug, excerpt, body, cover_image_url, tag, read_time_minutes, is_published, published_at, author_name)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'MN Lake Homes Team')
                ON CONFLICT (slug) DO UPDATE SET
                    title = EXCLUDED.title,
                    excerpt = EXCLUDED.excerpt,
                    body = EXCLUDED.body,
                    cover_image_url = EXCLUDED.cover_image_url,
                    tag = EXCLUDED.tag,
                    read_time_minutes = EXCLUDED.read_time_minutes,
                    is_published = EXCLUDED.is_published,
                    published_at = EXCLUDED.published_at,
                    updated_at = NOW()
            `, [post.title, post.slug, post.excerpt, post.body, post.cover_image_url, post.tag, post.read_time_minutes, post.is_published, post.published_at]);
            console.log(`  ✓ [${post.tag}] ${post.title}`);
            count++;
        }
        console.log(`\nDone — ${count} blog posts seeded.`);
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(err => { console.error(err.message); process.exit(1); });
