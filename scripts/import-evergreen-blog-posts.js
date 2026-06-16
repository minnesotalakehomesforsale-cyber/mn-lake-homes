#!/usr/bin/env node
/**
 * import-evergreen-blog-posts.js — publish the 2026-06-15 Evergreen / Trust
 * blog batch. Idempotent: re-run safe, won't duplicate (uses slug as the
 * upsert key).
 *
 *     node scripts/import-evergreen-blog-posts.js
 *
 * Each post:
 *   - Stored as HTML in `body` (blog-post.html renders via innerHTML)
 *   - Internal links use the CONFIRMED conventions:
 *       /lakes/<slug>   (plural)
 *       /towns/<slug>   (plural)
 *       /blog/<slug>    (clean URL handled by the new SSR route)
 *   - seo_title + seo_description set explicitly per spec.
 *   - Hero images live in /assets/images/blog/ (already cropped to 1600×900).
 *   - tag = literal "Evergreen / Trust", author = "MN Lake Homes editorial",
 *     published_at = 2026-06-15 (per the handoff).
 *
 * Re-running this script PATCHes existing rows (title/body/meta) but
 * preserves their id + created_at — safe for content corrections.
 */

const pool = require('../src/database/pool');

const PUBLISHED_AT = new Date('2026-06-15T12:00:00Z');
const AUTHOR = 'MN Lake Homes editorial';
const READ_TIME = 6;

// `tag` is the visible badge on the post card and detail page, so it has
// to read naturally to a buyer/seller — not the internal "Evergreen / Trust"
// editorial taxonomy. Per-post overrides below.

// ─── Post bodies (HTML; client-side innerHTML render) ───────────────────────
//
// Each post body uses semantic HTML — <h2> for the rhythm-headers from the
// markdown, <p> for paragraphs, <ul><li> for bullet lists. Internal mentions
// of lakes / towns / sibling posts get anchored to the live URL. The CTAs
// at the end are styled inline so the look is consistent regardless of any
// blog-post.html CSS changes upstream.

const CTA_STYLE = 'display:inline-block;padding:0.85rem 1.5rem;background:#1d6df2;color:#fff;border-radius:8px;font-weight:700;text-decoration:none;margin:1.25rem 0;';

function ctaButton(text, href = '/pages/public/buy.html') {
    return `<p style="text-align:center;"><a href="${href}" style="${CTA_STYLE}">${text}</a></p>`;
}

const POSTS = [
    {
        slug: 'why-a-local-lake-specialist-beats-a-national-portal',
        title: 'Why a Local Lake Specialist Beats a National Portal',
        tag: 'Buying a Lake Home',
        seo_title: 'Why a Local Lake Specialist Beats a National Portal | MN Lake Homes',
        seo_description: "National real estate portals weren't built for Minnesota lakefront. Here's why a vetted, local lake specialist sees what a national algorithm can't.",
        excerpt: "National real estate portals weren't built for Minnesota lakefront. Here's why a vetted, local lake specialist sees what a national algorithm can't.",
        cover_image_url: '/assets/images/blog/hero-why-a-local-lake-specialist-beats-a-national-portal.jpg',
        body: `
<p>You can learn a lot about a Minnesota lake home from your couch. You can scroll the photos, check the price history, draw a little circle on the map, and set up an alert. What you can't do from a national real estate portal is understand the things that actually decide whether a lake property is a good buy — because those things never make it into the listing.</p>

<p>Minnesota has 11,842 lakes of 10 acres or more, and roughly 44,900 miles of shoreline. No national algorithm was built to understand a market that specific. A local lake specialist was. Here's the difference, and why it matters more on the water than almost anywhere else in real estate.</p>

<h2>A national portal prices the house. A lake specialist prices the shoreline.</h2>
<p>On a regular suburban street, an automated estimate has a fair shot at being close. The homes are comparable, the lots are similar, the data is dense. That's why Zillow's Zestimate now reports a median error of around 1.9% for homes actively on the market — genuinely useful in a dense, cookie-cutter market.</p>
<p>Lakefront breaks that model. Two homes on the same lake, same square footage, same age, can differ wildly in value because of things the portal can't see: 60 feet of sandy, swimmable frontage versus 60 feet of reed-choked muck; a hard sand bottom that drops to boat-lift depth versus a flat that stays shin-deep for 80 yards; a west-facing lot that gets the long summer evenings versus one that loses the sun at 4 p.m. behind a hill.</p>
<p>That's also why the off-market version of the same automated estimate carries a much larger error — around 7%. On a million-dollar lake home, that's a $70,000 swing, and the algorithm has no idea which direction it's wrong in. On the water, the value lives in the frontage, the bottom, and the orientation — and none of that is in the data feed. A specialist who has stood on that dock knows it in five minutes.</p>

<h2>The listing photos hide the things that cost you later</h2>
<p>A portal shows you a property at its absolute best: blue sky, calm water, wide lens, the seller's favorite angle. What it can't show you is the stuff that turns into a five-figure problem after closing.</p>
<p>A Minnesota lake specialist walks a property looking for a different set of things entirely:</p>
<ul>
    <li><strong>The septic system.</strong> Conforming, non-conforming, mound, drain-field condition. A failing septic on a lakefront lot is the most common expensive surprise in the entire market.</li>
    <li><strong>Shoreline classification and setbacks.</strong> Minnesota regulates shoreland zoning — how close you can build, what you can riprap, what vegetation you must keep. The portal won't tell you the addition you're picturing isn't approvable.</li>
    <li><strong>Dock and lift permits.</strong> Some bays have real restrictions. The dock in the photo isn't always the dock you're allowed to keep.</li>
    <li><strong>Lake level and water history.</strong> Some lakes are dam-regulated and stable; others swing. It changes everything about a lot.</li>
</ul>
<p>None of this is in a Zestimate. All of it is in a good agent's first walkthrough.</p>

<h2>"Local" on a lake means something different than "local" in a suburb</h2>
<p>Plenty of agents are technically local to a region. Far fewer actually know a specific lake. The gap is enormous on Minnesota water, because lake knowledge is hyper-local — often down to the bay.</p>
<p>A true lake specialist knows that one side of the lake is over a soft bottom and the other side is the good smallmouth water. They know which channel gets weedy by August. They know the difference between the <a href="/towns/brainerd">Brainerd Lakes Area's</a> busy resort corridor and a quiet north-shore bay 15 minutes away. They know which lakes are dam-regulated, which towns have which tax rates, and which lake associations are organized enough to keep the water clean. On a chain like the <a href="/lakes/whitefish-chain">Whitefish Chain</a> or a giant like <a href="/lakes/lake-minnetonka">Lake Minnetonka</a>, that bay-by-bay knowledge is the whole game.</p>
<p>That's not knowledge you can scrape into a national database. It's the kind of thing you only get from an agent who has spent real time on that particular water.</p>

<h2>A portal sells your attention. A specialist works for your outcome.</h2>
<p>This is worth being plain about. A national portal's business is traffic and advertising. The "agents" you reach when you click a listing are frequently buying that ad placement — they may have never set foot on the lake you're looking at. You're being routed by an auction, not matched by expertise.</p>
<p>That's exactly the gap MinnesotaLakeHomesForSale.com was built to close. Instead of routing you to whoever paid for the click, we match you with a vetted, licensed, local agent who actually specializes in your lake — and then we guide you through it. It's free to you, there's no commission out of your pocket, and we work with agents at every brokerage, so the match is about fit, not who happens to be advertising that day.</p>
<p>The portal is a fine place to browse. It's the wrong place to get matched.</p>

<h2>Where the portal is genuinely useful (and where it isn't)</h2>
<p>To be fair: national portals are good at a few things. They're a fine way to get a feel for inventory, to see what a price band looks like, and to daydream in February. Use them for that.</p>
<p>Where they fall down is the moment you get serious. The best lakefront lots in markets like <a href="/lakes/gull-lake">Gull Lake</a> often see multiple offers within their first two weeks on the market, frequently before they ever surface on a portal's weekend refresh. By the time a great lot shows up in your Saturday-morning scroll, the people working with a local specialist have already seen it. Browsing is a portal job. Buying is a specialist job.</p>

<h2>What this looks like in practice</h2>
<p>Working with a lake specialist doesn't mean handing over control — it means having someone who sees what you can't. You still pick the lake, the town, and the lot. The specialist's job is to make sure that when you fall in love with a place, you're falling in love with the frontage and the bottom and the orientation — not just the listing photos — and that the septic, the setbacks, and the permits all hold up before you sign.</p>
<p>That's the difference between a national algorithm and a person who knows the water. One prices a house. The other reads a shoreline.</p>

<h2>Start with the right match, not the right algorithm</h2>
<p>If you're seriously shopping a Minnesota lake, the highest-leverage first move isn't another portal alert. It's getting matched with someone who actually knows the water you want to be on.</p>
<p>Tell us what you're looking for and we'll match you with a vetted, licensed, local agent who specializes in your lake — and guide you the whole way. It's free, there's no commission to you, and the match is built around your lake and your priorities, not an ad auction.</p>
${ctaButton('Get matched with a Minnesota lake specialist →')}
<p>Curious what we mean by the right specialist, and why it's free to you? Here's <a href="/blog/what-vetted-licensed-local-means">what "vetted, licensed, local" really means when we make the match</a>, and <a href="/blog/how-to-work-with-a-lake-specialist-agent">how to work with a lake-specialist agent</a> once you're matched.</p>
        `.trim(),
    },

    {
        slug: 'how-to-work-with-a-lake-specialist-agent',
        title: 'How to Work With a Lake-Specialist Agent (and What to Expect)',
        tag: 'Working With an Agent',
        seo_title: 'How to Work With a Lake-Specialist Agent | MN Lake Homes',
        seo_description: "New to buying lakefront in Minnesota? Here's how working with a vetted, local lake-specialist agent works, what to expect, and how to get the most from it.",
        excerpt: "New to buying lakefront in Minnesota? Here's how working with a vetted, local lake-specialist agent works, what to expect, and how to get the most from it.",
        cover_image_url: '/assets/images/blog/hero-how-to-work-with-a-lake-specialist-agent.jpg',
        body: `
<p>Buying a lake home is not like buying a house in town, and working with a lake-specialist agent isn't quite like working with a regular agent either. If you've only ever bought a suburban home — or if this is your first place on the water entirely — it helps to know what the process actually looks like before you're in it.</p>
<p>Here's a plain walkthrough: what a lake specialist does, what they'll expect from you, and how to get the most out of the relationship so you end up on the right water with no expensive surprises.</p>

<h2>First, what "lake specialist" actually means</h2>
<p>Any licensed Minnesota agent can technically write an offer on a lakefront property. A lake specialist is something narrower and more useful: an agent who works a specific lake or region often enough to read the things a listing never shows — frontage quality, bottom type, dock and shoreline rules, which bays go weedy, which lots hold value, and how the seasonal market on that water actually moves.</p>
<p>That depth is the whole point. Minnesota has nearly 12,000 lakes, and they don't behave alike. A general agent who sells mostly in-town homes and does the occasional cabin is working from a different knowledge base than someone who lives and breathes one lake region. When we match you, we're matching you to that depth — a vetted, licensed, local agent who specializes in the water you want.</p>

<h2>Step one: get matched (this part is free)</h2>
<p>You don't have to go hunting for the right specialist yourself. That's what the match is for.</p>
<p>When you tell us what you're looking for — the lake or region, your budget, whether you want a summer cabin or a year-round home, what matters most to you — we match you with a vetted, licensed, local agent who fits. It's free to you, there's no commission out of your pocket, and we work with agents at every brokerage, so the match is about fit, not about who's advertising. We do the vetting so you don't have to.</p>
<p>What you can do to make the match better: be honest about your budget and your timeline, and be specific about how you'll actually use the place. "Somewhere on a quiet lake under $600K that I can use in winter" gives us far more to work with than "a cabin up north."</p>

<h2>Step two: the first conversation</h2>
<p>Your first real conversation with your matched agent is mostly listening on their end. A good lake specialist will ask questions that might surprise you:</p>
<ul>
    <li>Do you want a swimming lake, a fishing lake, or a big-water boating lake? They're often not the same lake.</li>
    <li>Summer-only, or do you see yourself there in February? This decides whether you should even look at non-winterized cabins.</li>
    <li>How much shoreline do you actually want to maintain?</li>
    <li>How far is too far from a town, a hospital, an airport?</li>
    <li>Are you buying for the next five years, or the next thirty?</li>
</ul>
<p>These questions aren't a sales script — they're how a specialist narrows nearly 12,000 lakes down to the handful that genuinely fit you. Come ready to answer them. The more clearly you can describe the life you're picturing, the faster they can find the water that delivers it.</p>

<h2>Step three: getting set up to move fast</h2>
<p>Here's something first-time lake buyers consistently underestimate: the good lots move fast. In a market like <a href="/lakes/gull-lake">Gull Lake</a>, the best lakefront listings can draw multiple offers within their first two weeks — sometimes before they hit the national portals at all. Inventory peaks in late spring and the strongest stock often clears by mid-July.</p>
<p>That means your specialist will want you ready before you fall in love with something:</p>
<ul>
    <li><strong>Listings alert set up</strong> for your lake, so you see new inventory the day it hits the MLS — not on the weekend portal refresh.</li>
    <li><strong>Lender lined up</strong> with a pre-approval in hand, so an offer can go out the same day you tour.</li>
    <li><strong>Inspector identified</strong> — ideally one who knows lake property, septic systems, and wells.</li>
</ul>
<p>A specialist will help you get all three in place early. It feels like over-preparation right up until the morning a perfect lot lists and you're the buyer who can act.</p>

<h2>Step four: touring like a lake buyer, not a house buyer</h2>
<p>When you walk a lake property with a specialist, you're not just looking at the house. You're reading the lot. Expect your agent to steer your attention to:</p>
<ul>
    <li><strong>The frontage and the bottom</strong> — sandy and swimmable, or soft and weedy? How quickly does it drop to dock and lift depth?</li>
    <li><strong>Orientation</strong> — which way does it face, and when does it get sun? West-facing lots get the long summer evenings; east-facing get calm mornings.</li>
    <li><strong>The septic, well, and shoreline setbacks</strong> — the unglamorous things that decide whether the place is a joy or a money pit.</li>
    <li><strong>Privacy, tree cover, and noise</strong> — mature pines are nearly impossible to replace, and summer water can be loud.</li>
</ul>
<p>You bring the gut feel for whether a place feels like home. Your specialist brings the checklist that keeps the gut feel from costing you later. The best tours are a partnership: you react, they translate what you're reacting to into what it'll mean to own.</p>

<h2>Step five: the offer, the inspection, and the close</h2>
<p>When you find the one, your specialist prices the offer off lake comps — not in-town comps, which routinely misprice waterfront because they're built on the wrong data. They'll know what recently sold on that water and what frontage is actually worth there.</p>
<p>Through inspection, a lake specialist knows where to push: septic condition, well water testing, dock and lift permits, shoreline-classification compliance, and any easements (shared access, road, or dock easements are common on lakes and worth reading before you fall in love). These are exactly the items that catch first-time buyers off guard, and they're where good representation earns its keep.</p>
<p>All the way through, the role we play is concierge: we made the match, and we help keep the whole thing on track. You're never doing this alone, and you're never guessing whether your agent actually knows the water.</p>

<h2>How to be a great client</h2>
<p>The relationship works best when it runs both ways. The buyers specialists love working with tend to do a few simple things: they're clear about budget and timeline, they get their financing in order early, they say yes to touring quickly when the right lot appears, and they're honest when a place isn't right rather than going quiet. Lake markets reward decisiveness — the more prepared and communicative you are, the more your specialist can do for you.</p>

<h2>Ready to be matched?</h2>
<p>If you're thinking seriously about a place on the water, the first step is simple: get matched with someone who knows it. Tell us the lake or region you're drawn to and what you're looking for, and we'll match you with a vetted, licensed, local agent who specializes in it — and guide you the whole way. Free to you, no commission.</p>
${ctaButton('Get matched with a Minnesota lake specialist →')}
<p>Want the bigger picture first? Read <a href="/blog/why-a-local-lake-specialist-beats-a-national-portal">why a local lake specialist beats a national portal</a>, or browse a real example with <a href="/lakes/gull-lake">Gull Lake</a>. Eyeing the Twin Cities metro instead? Start with <a href="/lakes/lake-minnetonka">Lake Minnetonka</a>.</p>
        `.trim(),
    },

    {
        slug: 'what-vetted-licensed-local-means',
        title: 'What "Vetted, Licensed, Local" Actually Means When We Match You',
        tag: 'How It Works',
        seo_title: 'What "Vetted, Licensed, Local" Means for Your Match | MN Lake Homes',
        seo_description: "We match you with a vetted, licensed, local Minnesota lake agent. Here's exactly what each of those three words means — and why it matters on the water.",
        excerpt: "We match you with a vetted, licensed, local Minnesota lake agent. Here's exactly what each of those three words means — and why it matters on the water.",
        cover_image_url: '/assets/images/blog/hero-what-vetted-licensed-local-means.jpg',
        body: `
<p>You'll see three words a lot on MinnesotaLakeHomesForSale.com: we match you with a <strong>vetted, licensed, local</strong> agent. It's an easy phrase to skim past. But each of those words is doing real work, and together they're the whole promise. So here's exactly what we mean by each one — and why, on Minnesota lakefront specifically, all three matter.</p>

<h2>"Licensed" — the floor, not the ceiling</h2>
<p>Start with the baseline. Every agent we match you with holds an active Minnesota real estate license. That's not a small thing to earn. To be licensed in Minnesota, a salesperson must complete 90 hours of pre-licensing education across three separate courses, pass a state exam (a national portion plus a Minnesota-specific portion), clear a background check including fingerprinting, and be sponsored by a licensed broker. To keep the license, they complete 30 hours of continuing education every renewal cycle.</p>
<p>What that gives you: someone legally accountable, bound by Minnesota real estate law and a code of conduct, carrying the obligations that come with the license. It's the floor. It means the person representing you on one of the largest purchases of your life is a credentialed professional, not a hobbyist.</p>
<p>But "licensed" alone doesn't tell you whether they know a thing about lake property. A license to sell real estate in Minnesota is the same whether you sell townhomes in the suburbs or lakefront up north. That's why it's only the first of the three words.</p>

<h2>"Local" — the word that matters most on a lake</h2>
<p>If "licensed" is the floor, "local" is the difference-maker. And on Minnesota water, "local" means something more specific than living in the same county.</p>
<p>A local lake agent knows the actual water. Not the region in the abstract — the lake. They know which side has the good sand bottom and which side stays soft and weedy. They know which bays get choked by August and which channel is shallow at low water. They know whether a lake is dam-regulated and stable or whether it swings with the season. They know the <a href="/towns/brainerd">Brainerd Lakes Area's</a> resort corridor from a quiet bay 15 minutes away, and they know that a chain like the <a href="/lakes/whitefish-chain">Whitefish Chain</a> lives or dies on which link you're on.</p>
<p>This is knowledge you genuinely cannot get from a database or a national portal. Minnesota has nearly 12,000 lakes and they don't behave alike. A "local" agent in the way we mean it has spent real time on your specific water and can read a lot in minutes — the frontage, the bottom, the orientation, the things that decide value and that never show up in a listing photo. When we say local, we mean local to <em>the lake</em>, not local to the metro.</p>

<h2>"Vetted" — the part we take off your plate</h2>
<p>Here's the word that's hardest to verify on your own, and the one we do for you. "Vetted" means we've done the work to confirm an agent is who they say they are and genuinely specializes in the lakes they claim — so you don't have to interview a dozen strangers and hope.</p>
<p>When you find an agent yourself through a national portal, you're often reaching whoever paid for that listing's ad placement — sometimes someone who has never set foot on the lake you're looking at. You have no easy way to tell the specialist from the advertiser. Vetting closes that gap. We confirm the license is active and in good standing, and we focus the match on agents who actually work your water — so the person you talk to is matched to your lake and your needs, not just the highest bidder for a click.</p>
<p>That's the concierge part of what we do: we do the vetting so you don't have to, and then we guide you through the process. It's the difference between being routed by an ad auction and being matched by fit.</p>

<h2>Why all three, together</h2>
<p>Any one of these words on its own leaves a gap:</p>
<ul>
    <li><strong>Licensed but not local</strong> — a credentialed professional who doesn't know your lake. They can write the offer; they can't read the shoreline.</li>
    <li><strong>Local but not vetted</strong> — maybe they know the water, but you've got no easy way to confirm it before you trust them with a major purchase.</li>
    <li><strong>Vetted and licensed but not local</strong> — a solid, confirmed professional working the wrong knowledge base for lakefront.</li>
</ul>
<p>Put together, the three words describe one person: a credentialed agent (licensed) who genuinely knows your specific water (local) and whom we've confirmed and matched to you (vetted). That combination is the whole product.</p>

<h2>The words we don't use — on purpose</h2>
<p>You'll notice we don't promise the "best" agent or an "unbiased" one. That's deliberate, and it's about honesty. "Best" is unprovable — the best agent for a quiet fishing lake under $500K is not the best agent for a luxury estate on <a href="/lakes/lake-minnetonka">Lake Minnetonka</a>, and anyone claiming a single "best" is overselling. "Vetted, licensed, local, and matched to your needs" is a promise we can actually stand behind, every time. We'd rather make a claim that's true than one that sounds bigger and isn't.</p>

<h2>And it's free to you</h2>
<p>One more thing that surprises people: all of this costs you nothing. The match is free, there's no commission out of your pocket, and we work with agents at every brokerage — we're not steering you toward one company. You get a vetted, licensed, local specialist and a guide through the process, at no cost to you as a buyer or seller.</p>

<h2>Get matched</h2>
<p>That's the promise, unpacked: vetted, licensed, local — and matched to what you're actually looking for. If you're thinking about buying or selling on a Minnesota lake, tell us what you want and we'll match you with the right specialist and guide you the whole way.</p>
${ctaButton('Get matched with a vetted, licensed, local lake agent →')}
<p>New to all this? Read <a href="/blog/how-to-work-with-a-lake-specialist-agent">how to work with a lake-specialist agent</a> and <a href="/blog/why-a-local-lake-specialist-beats-a-national-portal">why a local lake specialist beats a national portal</a>.</p>
        `.trim(),
    },
];

async function main() {
    console.log('=== import-evergreen-blog-posts (2026-06-15) ===\n');
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
            console.log(`  + INSERT  /blog/${p.slug}`);
        } else {
            updated++;
            console.log(`  ✓ UPDATE  /blog/${p.slug}`);
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
    console.error('import-evergreen-blog-posts FAILED:', err);
    process.exit(1);
});
