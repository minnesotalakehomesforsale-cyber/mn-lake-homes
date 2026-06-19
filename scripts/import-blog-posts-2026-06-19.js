#!/usr/bin/env node
/**
 * import-blog-posts-2026-06-19.js — first Tier-1 LAKE batch (Mille Lacs Lake).
 * Sibling to import-blog-posts-2026-06-16.js (Evergreen / Trust batch #2).
 * Idempotent: re-run safe, won't duplicate (slug-keyed UPSERT).
 *
 *     node scripts/import-blog-posts-2026-06-19.js
 *
 * Hero images already placed in assets/images/blog/:
 *   - hero-mille-lacs-lake-buyers-guide-2026.jpg
 *   - hero-living-on-mille-lacs-lake.jpg
 *   - hero-mille-lacs-lake-vs-gull-lake.jpg
 *
 * Per-post visible tag (blog_posts.tag column = reader-facing badge):
 *   - Mille Lacs Buyer Guide → mille-lacs-lake-buyers-guide-2026
 *   - Mille Lacs Lifestyle   → living-on-mille-lacs-lake
 *   - Choosing a Lake        → mille-lacs-lake-vs-gull-lake
 *   (Internal buckets — Tier-1 Buyer Guide/Lifestyle/Comparison — are NOT written to the DB.)
 *
 * Internal links verified against the live codebase:
 *   - Lake pages /lakes/:slug — mille-lacs-lake, gull-lake, whitefish-chain are all in lakes-seed.js.
 *   - Blog cross-links /blog/:slug — only the 6 live evergreen slugs + the 3 slugs in THIS batch.
 *   - NOTE: there is no town route wired yet, so Brainerd is referenced in prose only (no /towns/ link).
 *   - Get-matched CTA points to /pages/public/buy.html (same as the 06-16 batch).
 *   - External links: MN DNR / MN Dept. of Health only (no competitors).
 */

const pool = require('../src/database/pool');

const PUBLISHED_AT = new Date('2026-06-19T12:00:00Z');
const AUTHOR = 'MN Lake Homes editorial';
const READ_TIME = 7;

const CTA_STYLE = 'display:inline-block;padding:0.85rem 1.5rem;background:#1d6df2;color:#fff;border-radius:8px;font-weight:700;text-decoration:none;margin:1.25rem 0;';
function ctaButton(text, href = '/pages/public/buy.html') {
    return `<p style="text-align:center;"><a href="${href}" style="${CTA_STYLE}">${text}</a></p>`;
}

const POSTS = [
    {
        slug: 'mille-lacs-lake-buyers-guide-2026',
        title: "Mille Lacs Lake Buyer's Guide 2026: What to Know Before You Buy",
        tag: 'Mille Lacs Buyer Guide',
        seo_title: "Mille Lacs Lake Buyer's Guide 2026 | MN Lake Homes",
        seo_description: "Buying on Mille Lacs Lake in 2026? Price bands, big-water realities, docks, and shoreline rules, plus how to get matched with a vetted, local lake agent.",
        excerpt: "Price bands, big-water realities, docks, and shoreline rules on Minnesota's second-largest inland lake, plus how to get matched with a vetted, local lake agent.",
        cover_image_url: '/assets/images/blog/hero-mille-lacs-lake-buyers-guide-2026.jpg',
        body: `
<p>Mille Lacs is the lake a lot of Minnesotans picture when they think "up north" without the long drive. At roughly 132,500 acres it's the state's second-largest inland lake, yet it sits just an hour and a half to two hours north of the Twin Cities. Close enough for a Friday-night run to the cabin, big enough that you can lose the far shore over the horizon. For buyers, that combination is the whole appeal: real big-water living, a deep fishing culture, and prices that are still down to earth compared with the metro lakes. This guide walks through what actually moves the decision on <a href="/lakes/mille-lacs-lake">Mille Lacs Lake</a> in 2026.</p>

<h2>First, understand what kind of lake Mille Lacs is</h2>
<p>Mille Lacs is wide, round, and shallow for its size. About 42 feet at its deepest and averaging closer to 29 feet, spread across some 207 square miles with roughly 90 miles of shoreline. That shape matters more than it sounds. A big, shallow basin means the lake can build real waves when the wind comes up, so the side of the lake you buy on and the quality of your shoreline and dock setup are practical decisions, not just view decisions. It also means the lake freezes hard and early, which is exactly why Mille Lacs is one of the most famous ice-fishing destinations in the country.</p>
<p>The shoreline is ringed by small, unpretentious towns: Garrison, Isle, Onamia, Wahkon, and Malmo among them, with the Mille Lacs Band of Ojibwe community on the south shore. This is not a manicured, gated-estate lake. It's a fishing-and-cabin lake with a strong year-round identity, and that character is a big part of what your money buys. If you want a sense of the day-to-day rhythm before you commit, read our companion piece on <a href="/blog/living-on-mille-lacs-lake">what it's really like to live on Mille Lacs</a>.</p>

<h2>2026 price bands: what your money buys</h2>
<p>Here's the headline most metro buyers are surprised by: Mille Lacs is genuinely attainable. In mid-2026 the active lake-property market was averaging in the low $400,000s, with a range that runs from rustic cabins under $100,000 all the way up to a thin tier of larger lake homes and estates above $1 million. Treat those as orientation bands, not appraisals. The live, current numbers are on the <a href="/lakes/mille-lacs-lake">Mille Lacs Lake homes for sale page</a>, which pulls straight from the MLS.</p>
<ul>
    <li><strong>Off-water and lake-access cabins</strong> — the entry point, often well under six figures for something rustic and seasonal.</li>
    <li><strong>Modest year-round waterfront</strong> — updated former cabins and smaller lake homes, the realistic "we actually live on Mille Lacs" tier in the mid-to-upper hundreds.</li>
    <li><strong>Larger lake homes and the occasional estate</strong> — the top of the market, above $1 million, and comparatively rare here.</li>
</ul>
<p>Because the spread is wide and the inventory turns over fast on the best frontage, the same phrase ("a place on Mille Lacs") can mean a $90,000 fishing cabin or a $1.2 million year-round home. Get specific early about which tier you're really shopping. If you're weighing Mille Lacs against the pricier, more resort-oriented Brainerd lakes, our <a href="/blog/mille-lacs-lake-vs-gull-lake">Mille Lacs vs. Gull Lake comparison</a> lays the two side by side, and you can see current Brainerd-area numbers on the <a href="/lakes/gull-lake">Gull Lake homes for sale page</a>.</p>

<h2>Big water means the shoreline decision is everything</h2>
<p>On a deep, sheltered lake you can be a little casual about which stretch of shore you buy. On Mille Lacs you can't. A shallow, exposed basin means wind, wave action, and ice push all behave differently depending on which side you're on and how protected your frontage is. Dockability, how well a boat lift holds up, swimming conditions, and even how the ice heaves against your shore in spring all turn on this. A local agent who actually knows the lake will steer you toward the right stretch of shoreline first, not just the right listing. That's the gap we dig into in <a href="/blog/buying-lakefront-why-a-general-agent-isnt-enough">why a general agent isn't enough on lakefront</a>.</p>

<h2>Docks, shoreline rules, and what you can actually build</h2>
<p>A dock is not automatic, and what you may install is governed by Minnesota's statewide shoreland rules plus the local ordinances administered through the county your stretch sits in (Mille Lacs touches Mille Lacs, Aitkin, and Crow Wing counties). Setbacks, dock length, the number of watercraft, and any shoreline alteration are all regulated. Before you assume you can add a slip, a bigger dock, or a boat lift, confirm what the classification of that shoreline allows. Read it straight from the source: the <a href="https://www.dnr.state.mn.us/waters/watermgmt_section/shoreland/regulations.html" target="_blank" rel="noopener">Minnesota DNR shoreland regulations overview</a> and the <a href="https://www.dnr.state.mn.us/permits/water/needpermit.html" target="_blank" rel="noopener">DNR's guidance on whether a water permit is required</a> for docks and shoreline work.</p>

<h2>Fishing regulations are part of the deal here</h2>
<p>Mille Lacs is a walleye lake first (arguably the state's most famous walleye factory) along with trophy smallmouth bass, northern pike, muskie, and a strong winter bite. But it also has special, season-specific fishing regulations that change for the winter (starting Dec. 1) and open-water (starting in May) seasons, and they shift year to year as the walleye population is managed. If fishing is a core reason you're buying, read the current rules before you close, not after. The DNR keeps the <a href="https://www.dnr.state.mn.us/fishing/millelacs.html" target="_blank" rel="noopener">Mille Lacs Lake fishing regulations</a> and the broader <a href="https://www.dnr.state.mn.us/millelacslake/index.html" target="_blank" rel="noopener">Mille Lacs Lake management overview</a> current. None of this should scare you off. It's just part of buying on a managed trophy lake, and a local agent will know how it shapes resort, guide, and cabin demand.</p>

<h2>Depth, water, wells, and the practical stuff</h2>
<p>Pull the lake survey, depth map, and water-clarity history for free from the <a href="https://www.dnr.state.mn.us/lakefind/index.html" target="_blank" rel="noopener">Minnesota DNR LakeFinder</a> before you ever set foot on a dock. It's the fastest way to understand a specific stretch. Many Mille Lacs properties, especially older cabins, run on a private well and septic rather than municipal service, so confirm what you're inheriting. The <a href="https://www.health.state.mn.us/communities/environment/water/wells/" target="_blank" rel="noopener">Minnesota Department of Health's private-well guidance</a> is the place to understand what owning a well actually involves: testing, maintenance, and what to ask for during inspection.</p>

<h2>Seasonality: when to buy in 2026</h2>
<p>Lakefront inventory in Minnesota follows the calendar hard. Listings bloom from ice-out through early summer, and that's when buyers see the most choice and the most competition for the best frontage. On Mille Lacs there's a second rhythm worth knowing: a meaningful slice of the market is fishing- and resort-driven, so demand spikes around the open-water opener in May and again heading into the ice-fishing season. Late fall and winter bring fewer listings but more motivated sellers. If you want maximum selection, shop spring into summer; if you want negotiating room, the quieter months reward patience.</p>

<h2>How to actually win on Mille Lacs</h2>
<p>Mille Lacs rewards buyers who understand it as a big-water, fishing-first lake rather than treating it like a generic "lake home" search. The people who do well here work with an agent who knows which shoreline holds up to the wind, what a fair price is on that stretch, how the fishing regulations move resort and cabin demand, and how to act when the right place lists. That's exactly the gap our service closes: we match you with a vetted, licensed, local agent who specializes in this part of central Minnesota, so you're not learning the lake on the fly. It's free to you, and we work with agents at every brokerage. More on what that screening actually means in <a href="/blog/what-vetted-licensed-local-means">what "vetted, licensed, local" really means</a>, and on the mechanics in <a href="/blog/how-lake-home-matching-works-and-why-its-free-to-you">how lake-home matching works</a>.</p>
<p>If you're casting a wider net across central Minnesota, it's worth getting to know the nearby Brainerd lakes country too. Resort-chain lakes like the <a href="/lakes/whitefish-chain">Whitefish Chain</a> sit less than an hour west and draw many of the same buyers.</p>

<h2>Ready to start?</h2>
<p>Tell us what you're looking for on Mille Lacs: the shoreline, the budget, fishing cabin or year-round home, and we'll match you with the right local agent and guide you the whole way. We do the vetting so you don't have to.</p>
${ctaButton('Get matched with a Mille Lacs lake specialist →')}
        `.trim(),
    },

    {
        slug: 'living-on-mille-lacs-lake',
        title: "What It's Like to Live on Mille Lacs Lake",
        tag: 'Mille Lacs Lifestyle',
        seo_title: "What It's Like to Live on Mille Lacs Lake | MN Lake Homes",
        seo_description: "Big-water rhythms, fishing culture, the towns, and winter on Mille Lacs Lake, plus how to get matched with a vetted, local Minnesota lake agent.",
        excerpt: "Big-water rhythms, a deep fishing culture, the towns, and four-season life on Minnesota's second-largest inland lake. An honest look at living on Mille Lacs.",
        cover_image_url: '/assets/images/blog/hero-living-on-mille-lacs-lake.jpg',
        body: `
<p>Ask someone who owns on Mille Lacs what they love about it and they rarely lead with the house. They lead with the water. How big it feels, how the wind writes the day, how the lake is just as alive in January as it is in July. Mille Lacs isn't a trophy-home lake or a see-and-be-seen lake. It's a working, year-round, fishing-and-cabin lake an easy hour and a half to two hours north of the Twin Cities, and that identity shapes everything about what living there is actually like. Here's the honest picture, and you can browse what's currently for sale on the <a href="/lakes/mille-lacs-lake">Mille Lacs Lake homes page</a>.</p>

<h2>The lake sets the pace</h2>
<p>The first thing that surprises new owners is the scale. At roughly 132,500 acres, Mille Lacs is Minnesota's second-largest inland lake, and it's wide and relatively shallow, about 42 feet at its deepest. A big, open basin like that makes its own weather. Calm glassy mornings give way to real chop by afternoon when the wind comes up, and you learn to read the lake before you launch. It's less "infinity-edge serenity" and more "respect the big water," and people who love Mille Lacs love it for exactly that.</p>
<p>That same scale is why the lake is a four-season place rather than a summer-only one. When it freezes (hard and early) it becomes one of the most famous ice-fishing destinations in the country, with fish houses dotting the ice and plowed ice roads turning the lake into a winter neighborhood of its own. Living here means owning all twelve months, not just June through August.</p>

<h2>Fishing is the culture, not just a hobby</h2>
<p>You don't have to fish to live on Mille Lacs, but you'll be surrounded by people who do, and it sets the social rhythm of the lake. Mille Lacs is the state's most famous walleye water, with trophy smallmouth bass, northern pike, and muskie in the mix. The open-water opener in May and the start of the ice-fishing season are genuine local events. One practical note for owners: Mille Lacs carries special, season-specific fishing regulations that change between winter and open water and shift year to year. It's worth following the DNR's <a href="https://www.dnr.state.mn.us/millelacslake/index.html" target="_blank" rel="noopener">Mille Lacs Lake overview</a> and the current <a href="https://www.dnr.state.mn.us/fishing/millelacs.html" target="_blank" rel="noopener">Mille Lacs fishing regulations</a>. If you want the buying-side view of all this, our <a href="/blog/mille-lacs-lake-buyers-guide-2026">Mille Lacs buyer's guide</a> covers how the fishing culture shapes the market.</p>

<h2>The towns: small, friendly, unpretentious</h2>
<p>Mille Lacs is ringed by small towns that each have a little personality: Garrison on the northwest with its famous walleye statue, Isle on the southeast, Onamia to the south, plus Wahkon and Malmo. You won't find big-box sprawl on the shore; you'll find bait shops, supper clubs, a handful of golf courses, county parks, and the kind of cafe where the regulars know each other. The Mille Lacs Band of Ojibwe community on the south shore is part of the area's identity and history, including the Mille Lacs Indian Museum. For everyday errands and bigger shopping, many owners drive west to the Brainerd lakes area, well under an hour away.</p>
<p>The trade-off is real and worth naming: services are spread out, winters are long, and "running to the store" is a drive. People who thrive here see that as the point. People who want walkable amenities and a short commute may be happier on a metro lake, and that's a fair comparison to make before you buy.</p>

<h2>Owning the practical realities</h2>
<p>A cabin or lake home on Mille Lacs comes with the ordinary realities of big-water, semi-rural ownership. Many properties, especially older cabins, run on a private well and septic system rather than municipal service, so part of living here is maintaining your own water. The <a href="https://www.health.state.mn.us/communities/environment/water/wells/" target="_blank" rel="noopener">Minnesota Department of Health's private-well guidance</a> is the place to understand testing and upkeep. Shoreline care matters too: what you can build, dock, or alter is governed by <a href="https://www.dnr.state.mn.us/waters/watermgmt_section/shoreland/regulations.html" target="_blank" rel="noopener">Minnesota's shoreland regulations</a>, and on a shallow, wind-exposed basin the durability of your dock and lift is a genuine consideration. You can pull the depth map and water-clarity history for any stretch from the <a href="https://www.dnr.state.mn.us/lakefind/index.html" target="_blank" rel="noopener">Minnesota DNR LakeFinder</a> before you buy.</p>

<h2>Who's happiest on Mille Lacs</h2>
<p>The owners who love living here tend to share a profile: they want big, real water without a metro price tag; they value fishing and the outdoors over nightlife and amenities; and they're comfortable with the rhythms of a four-season, semi-rural lake. It's a fantastic fit for that buyer and a poor fit for someone expecting a polished resort scene at their doorstep. If you lean toward the resort-and-recreation experience (clearer water, golf, more developed shoreline) the Brainerd lakes are the natural alternative, and our <a href="/blog/mille-lacs-lake-vs-gull-lake">Mille Lacs vs. Gull Lake comparison</a> walks through that exact decision. You can also browse the resort-lake feel on the <a href="/lakes/gull-lake">Gull Lake homes page</a> or the <a href="/lakes/whitefish-chain">Whitefish Chain</a>.</p>

<h2>How a local agent helps you live the version you want</h2>
<p>The difference between loving and tolerating life on Mille Lacs often comes down to buying the right stretch of shoreline for how you actually want to live: protected water if you've got kids and a swim raft in mind, open exposure if you're chasing sunsets and big views, proximity to a particular town if that's where your people are. A local specialist knows those distinctions cold. That's what we do: we match you with a vetted, licensed, local agent who knows this part of central Minnesota, free to you, working with agents at every brokerage. If you're new to the whole process, start with <a href="/blog/how-to-work-with-a-lake-specialist-agent">how to work with a lake-specialist agent</a> and <a href="/blog/why-a-local-lake-specialist-beats-a-national-portal">why a local lake specialist beats a national portal</a>.</p>

<h2>Come see it for yourself</h2>
<p>If big water, a deep fishing culture, and an honest, unpretentious lake town sound like your kind of life, Mille Lacs delivers it. Tell us what you're picturing and we'll match you with the right local agent to find it.</p>
${ctaButton('Get matched with a Mille Lacs lake specialist →')}
        `.trim(),
    },

    {
        slug: 'mille-lacs-lake-vs-gull-lake',
        title: "Mille Lacs Lake vs. Gull Lake: Which Minnesota Lake Is Right for You?",
        tag: 'Choosing a Lake',
        seo_title: "Mille Lacs vs. Gull Lake: Which Is Right for You? | MN Lake Homes",
        seo_description: "Mille Lacs vs. Gull Lake in 2026: big-water fishing lake or resort-and-recreation lake? Price, character, and fit, plus how to get matched with a local agent.",
        excerpt: "Big-water fishing lake or resort-and-recreation lake? How Mille Lacs and Gull Lake compare on price, character, and fit in 2026, and how to choose.",
        cover_image_url: '/assets/images/blog/hero-mille-lacs-lake-vs-gull-lake.jpg',
        body: `
<p>Both lakes sit in central Minnesota, both are within easy reach of the Twin Cities, and both are names every Minnesota lake shopper eventually says out loud. But Mille Lacs and Gull Lake are nearly opposite answers to the same question. One is enormous, shallow, and fishing-first; the other is smaller, deeper, clearer, and built around resorts and recreation. Pick the lake that matches how you actually want to spend your weekends, and the right home gets a lot easier to find. Here's how the two compare in 2026.</p>

<h2>The two lakes at a glance</h2>
<p><strong>Mille Lacs</strong> is the state's second-largest inland lake: roughly 132,500 acres of wide, open, relatively shallow water (about 42 feet at its deepest). It's ringed by small, unpretentious towns like Garrison, Isle, and Onamia, and its identity is fishing. It's arguably Minnesota's most famous walleye lake and a national-caliber ice-fishing destination. See what's for sale on the <a href="/lakes/mille-lacs-lake">Mille Lacs Lake homes page</a>.</p>
<p><strong>Gull Lake</strong>, near Brainerd and Nisswa, is about 9,900 acres and the centerpiece of a connected chain of lakes. It's deeper (around 80 feet at its deepest) and noticeably clearer, spring-fed, with water clarity around ten feet. It's the heart of resort country, with golf, marinas, and a polished recreation scene. You can see the current market on the <a href="/lakes/gull-lake">Gull Lake homes for sale page</a>.</p>

<h2>Price: the biggest practical difference</h2>
<p>This is where the two lakes separate most clearly. Mille Lacs is genuinely attainable: mid-2026 lake-property listings averaged in the low $400,000s, with rustic cabins available under $100,000 and only a thin tier above $1 million. Gull Lake runs substantially higher: typical home values in the East Gull Lake area sit north of half a million dollars, and prime frontage and estates climb into the millions, with the very top of the market reaching eight figures.</p>
<p>Put simply: on Mille Lacs your budget buys more water and more shoreline; on Gull Lake you're paying a premium for clearer water, deeper recreation, and the resort-chain lifestyle. If keeping the number down matters most, Mille Lacs wins. If the experience and the amenities justify the spend, Gull Lake earns it. Our <a href="/blog/mille-lacs-lake-buyers-guide-2026">Mille Lacs buyer's guide</a> breaks down the Mille Lacs price ladder in more detail.</p>

<h2>Water and recreation: walleye factory vs. all-around playground</h2>
<p>On Mille Lacs, the water is the sport. It's big, it can get rough when the wind blows, and the culture is built around fishing in every season: walleye above all, plus smallmouth, pike, and muskie, and a legendary winter ice-fishing scene. Note that Mille Lacs carries special, season-specific fishing regulations that change year to year; the DNR keeps the <a href="https://www.dnr.state.mn.us/fishing/millelacs.html" target="_blank" rel="noopener">current Mille Lacs regulations</a> posted.</p>
<p>Gull Lake is the all-around playground. The clearer, deeper water and chain-of-lakes layout make it a favorite for boating, water-skiing, swimming, and cruising between lakes, with golf and resort dining woven through the experience. It fishes well too, but the lake's center of gravity is recreation and lifestyle rather than serious angling. You can compare the surveys and depth maps for either lake free on the <a href="https://www.dnr.state.mn.us/lakefind/index.html" target="_blank" rel="noopener">Minnesota DNR LakeFinder</a>.</p>

<h2>Character and community</h2>
<p>Mille Lacs feels like the working north woods: small towns, supper clubs, bait shops, county parks, and a strong year-round local population mixed with cabin owners. It's unpretentious and four-season by nature. Gull Lake feels more like a polished resort community: second homes from Twin Cities families, a lively summer season, and the amenities of the Brainerd-Nisswa corridor close at hand. The nearby <a href="/lakes/whitefish-chain">Whitefish Chain</a> offers a similar resort-lake feel if Gull's prices stretch the budget.</p>
<p>If you want the deeper lifestyle picture, read <a href="/blog/living-on-mille-lacs-lake">what it's like to live on Mille Lacs</a>. And because the listings sites flatten both lakes into a single price number that hides what actually matters (which shoreline, which town, which season, which community), it's worth understanding why <a href="/blog/buying-lakefront-why-a-general-agent-isnt-enough">a general agent isn't enough on lakefront</a>.</p>

<h2>So which one is right for you?</h2>
<p>Choose <strong>Mille Lacs</strong> if you want maximum water for your money, you're a fisher first, you're comfortable with a big, sometimes-rough basin and a quieter, four-season small-town setting, and you don't need resort amenities at your door.</p>
<p>Choose <strong>Gull Lake</strong> if you want clearer, deeper water, an active boating-and-recreation scene, golf and resort dining nearby, and you're willing to pay a premium for that polished, chain-of-lakes lifestyle.</p>
<p>There's no wrong answer. There's only the lake that fits your weekends.</p>

<h2>Let us match you to the right lake, and the right agent</h2>
<p>Still torn between the two? That's normal, and it's a good problem to bring us. Tell us how you want to spend your time on the water and your budget, and we'll match you with a vetted, licensed, local agent who knows both lakes and can show you honestly where you'll be happiest. It's free to you, and we work with agents at every brokerage.</p>
${ctaButton('Get matched with a Minnesota lake specialist →')}
        `.trim(),
    },
];

async function main() {
    console.log('=== import-blog-posts-2026-06-19 (Mille Lacs Lake) ===\n');
    let inserted = 0, updated = 0;
    for (const p of POSTS) {
        const result = await pool.query(
            `INSERT INTO blog_posts
                (title, slug, excerpt, body, cover_image_url, tag,
                 read_time_minutes, is_published, published_at, author_name,
                 seo_title, seo_description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $10, $11)
             ON CONFLICT (slug) DO UPDATE SET
                title           = EXCLUDED.title,
                excerpt         = EXCLUDED.excerpt,
                body            = EXCLUDED.body,
                cover_image_url = EXCLUDED.cover_image_url,
                tag             = EXCLUDED.tag,
                read_time_minutes = EXCLUDED.read_time_minutes,
                is_published    = TRUE,
                published_at    = COALESCE(blog_posts.published_at, EXCLUDED.published_at),
                author_name     = EXCLUDED.author_name,
                seo_title       = EXCLUDED.seo_title,
                seo_description = EXCLUDED.seo_description,
                updated_at      = NOW()
             RETURNING (xmax = 0) AS inserted`,
            [
                p.title, p.slug, p.excerpt, p.body, p.cover_image_url, p.tag,
                READ_TIME, PUBLISHED_AT, AUTHOR, p.seo_title, p.seo_description,
            ]
        );
        if (result.rows[0]?.inserted) {
            inserted++;
            console.log(`  + INSERT  /blog/${p.slug}  [tag: ${p.tag}]`);
        } else {
            updated++;
            console.log(`  ✓ UPDATE  /blog/${p.slug}  [tag: ${p.tag}]`);
        }
    }
    console.log(`\n── summary ──`);
    console.log(`  inserted: ${inserted}`);
    console.log(`  updated : ${updated}`);
    console.log(`\nLive URLs (after deploy):`);
    for (const p of POSTS) {
        console.log(`  https://minnesotalakehomesforsale.com/blog/${p.slug}`);
    }
    console.log();
    await pool.end();
}

main().catch((err) => {
    console.error('import-blog-posts-2026-06-19 FAILED:', err);
    process.exit(1);
});
