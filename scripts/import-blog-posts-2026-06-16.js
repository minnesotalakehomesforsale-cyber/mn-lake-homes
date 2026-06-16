#!/usr/bin/env node
/**
 * import-blog-posts-2026-06-16.js — second Evergreen / Trust batch.
 * Sibling to import-evergreen-blog-posts.js (the 2026-06-15 batch).
 * Idempotent: re-run safe, won't duplicate (slug-keyed UPSERT).
 *
 *     node scripts/import-blog-posts-2026-06-16.js
 *
 * Per-post visible tag (blog_posts.tag column):
 *   - Buying a Lake Home   → why-general-agent-isnt-enough
 *   - How It Works         → how-lake-home-matching-works
 *   - Working With an Agent → questions-to-ask-before-you-pick
 *
 * "Evergreen / Trust" stays internal — never written to the DB.
 * Internal cross-links use the live blog slugs from the 2026-06-15 batch
 * and the confirmed /lakes/<slug>, /towns/<slug> conventions.
 */

const pool = require('../src/database/pool');

const PUBLISHED_AT = new Date('2026-06-16T12:00:00Z');
const AUTHOR = 'MN Lake Homes editorial';
const READ_TIME = 6;

const CTA_STYLE = 'display:inline-block;padding:0.85rem 1.5rem;background:#1d6df2;color:#fff;border-radius:8px;font-weight:700;text-decoration:none;margin:1.25rem 0;';
function ctaButton(text, href = '/pages/public/buy.html') {
    return `<p style="text-align:center;"><a href="${href}" style="${CTA_STYLE}">${text}</a></p>`;
}

const POSTS = [
    {
        slug: 'buying-lakefront-why-a-general-agent-isnt-enough',
        title: "Buying Lakefront? Why a General Agent Isn't Enough",
        tag: 'Buying a Lake Home',
        seo_title: "Buying Lakefront? Why a General Agent Isn't Enough | MN Lake Homes",
        seo_description: "A great suburban agent can still miss what makes a Minnesota lakefront buy good or bad. Here's why lake homes need a vetted, local lake specialist.",
        excerpt: "A great suburban agent can still miss what makes a Minnesota lakefront buy good or bad. Here's why lake homes need a vetted, local lake specialist.",
        cover_image_url: '/assets/images/blog/hero-buying-lakefront-why-a-general-agent-isnt-enough.jpg',
        body: `
<p>You probably already know a good agent. Someone who sold your neighbor's split-level in a weekend, knows the school boundaries cold, and can read a suburban comp sheet in their sleep. If you're buying a house in town, that person is exactly who you want.</p>
<p>A Minnesota lakefront home is a different animal. The skills that make a great in-town agent — pricing dense comps, working a fast suburban market, knowing the cul-de-sacs — don't transfer cleanly to the water. On a lake, the value lives in things that never show up on a comp sheet: the bottom, the frontage, the orientation, the shoreline rules. A general agent who is excellent everywhere else can still walk you straight into a five-figure mistake on a lake, simply because nobody taught them what to look for.</p>
<p>Here's where the gap opens up, and why buying lakefront calls for a vetted, local lake specialist rather than just a good agent.</p>

<h2>A house has comps. A shoreline has variables.</h2>
<p>In a subdivision, three houses on the same street are genuinely comparable — same era, same lot size, similar finishes. An agent can triangulate a fair price in an afternoon, and an automated estimate has a real shot at being close.</p>
<p>Lakefront breaks that. Two homes on the same lake, identical square footage and age, can be worth wildly different amounts because of factors a general agent isn't trained to weigh:</p>
<ul>
    <li><strong>The bottom.</strong> Hard sand that drops to swimming and boat-lift depth versus a soft, mucky flat that stays shin-deep for 80 yards. Same frontage footage, completely different lifestyle and value.</li>
    <li><strong>The frontage quality.</strong> Sixty feet of clean, swimmable shoreline is not the same as 60 feet of reed-choked, erosion-prone bank — even though both read as "60 ft of frontage" on the listing.</li>
    <li><strong>Orientation.</strong> A west-facing lot that catches the long summer evenings commands a premium over one that loses the sun behind a hill at 4 p.m. A general agent rarely thinks to check.</li>
    <li><strong>Exposure and wind.</strong> A lot on a big open fetch takes waves and weather that a protected bay never sees — it changes docks, erosion, and how the place actually feels.</li>
</ul>
<p>None of that is on a comp sheet. A lake specialist prices it in five minutes on the dock. A general agent often doesn't know it's a question.</p>

<h2>The expensive surprises are all below the waterline</h2>
<p>The most costly lakefront mistakes aren't about the house at all — they're about the parts of the property a general agent has never had reason to inspect.</p>
<p>A Minnesota lake specialist walks a property looking for a different checklist entirely:</p>
<ul>
    <li><strong>Septic.</strong> Most lake properties are on private septic, not city sewer. Conforming versus non-conforming, mound versus drain-field, age and condition — a failing septic on a lakefront lot is the single most common expensive surprise in the market, and replacing one can run well into five figures.</li>
    <li><strong>Wells.</strong> Same story for water. A general agent who's only worked municipal-water neighborhoods may not even think to ask about well depth, age, or water quality.</li>
    <li><strong>Shoreline zoning and setbacks.</strong> Minnesota regulates shoreland development — how close you can build to the water, what you can riprap, how much natural vegetation you must keep. The addition you're already picturing may not be approvable, and a general agent likely won't know to flag it before you fall in love.</li>
    <li><strong>Dock and lift permits.</strong> Some bays and associations have real restrictions. The dock in the listing photo isn't always the dock you're allowed to keep.</li>
</ul>
<p>A general agent isn't being careless by missing these. They've simply never needed them. A lake specialist makes them the first walkthrough.</p>

<h2>"Local" on a lake is hyper-local</h2>
<p>Plenty of agents are local to a region. Far fewer actually know a specific lake — and on Minnesota water, the knowledge that matters is local down to the bay.</p>
<p>A true lake specialist knows which side of the lake sits over a soft bottom and which side holds the good smallmouth water. They know which channel chokes with weeds by August, which lakes are dam-regulated and stable versus which ones swing, and which lake associations are organized enough to keep the water clean. On a sprawling system like the <a href="/lakes/whitefish-chain">Whitefish Chain</a> or a giant like <a href="/lakes/lake-minnetonka">Lake Minnetonka</a>, that bay-by-bay knowledge is the entire game — and it's not something a great agent from the next county over can fake.</p>
<p>It's also why "I have a guy who's a fantastic agent" and "I have a guy who knows that lake" are two very different statements. You want the second one.</p>

<h2>A general agent learns on your dime</h2>
<p>There's nothing wrong with an agent learning a new market — except that lakefront is an expensive place to learn it. The tuition comes out of your purchase. A missed septic flag, a misread on frontage quality, an addition you assumed was buildable and isn't — any one of those can cost more than you'd ever save by going with the familiar name.</p>
<p>The competitive timing makes it worse. The best lots on in-demand lakes like <a href="/lakes/gull-lake">Gull Lake</a> often see multiple offers within their first couple of weeks — sometimes before they hit the portals at all. A specialist who already knows the lake can move fast and advise confidently. A general agent who is still figuring out what questions to ask is a step behind in exactly the moment that matters.</p>

<h2>How to get a specialist without the guesswork</h2>
<p>The honest problem is that finding a true lake specialist is hard from the outside. Anyone can put "lake homes" on a website. You can't tell from a profile photo who has actually stood on the docks of the lake you want.</p>
<p>That's the gap MinnesotaLakeHomesForSale.com was built to close. Tell us the lake or area you're shopping and what you're looking for, and we match you with a vetted, licensed, local agent who specializes in that water — then guide you through the rest. It's free to use, we don't take a commission out of your pocket, and we work with agents at every brokerage, so the match is about fit and lake knowledge, not who happens to advertise. If you'd like the full picture of how that vetting works, our explainer on <a href="/blog/what-vetted-licensed-local-means">what "vetted, licensed, local" actually means</a> walks through it, and our piece on <a href="/blog/why-a-local-lake-specialist-beats-a-national-portal">why a local specialist beats a national portal</a> covers why the lake niche matters so much.</p>

<h2>Where a general agent still earns their keep</h2>
<p>None of this is a knock on general agents. If you're also selling an in-town home to fund the lake place, your familiar agent may be exactly right for that side of the move — the suburban market is their home court. The mistake isn't trusting a good agent; it's assuming that being good in one market makes someone good on the water. They're different jobs that happen to share a license. The smart play is to match the agent to the property: your in-town pro for the house in town, a vetted lake specialist for the lakefront. You can absolutely run both at once.</p>

<h2>The bottom line</h2>
<p>A great general agent is a real asset — in town. On the water, the job changes. Buying lakefront means reading a shoreline, not just a house: the bottom, the frontage, the orientation, the septic, the setbacks, the permits. That's specialist work.</p>
<p>You don't have to figure out who that specialist is on your own. Get matched with a vetted, local lake agent who knows your water — we do the vetting so you don't have to, and it's free to you.</p>
${ctaButton('Get matched with a Minnesota lake specialist →')}
        `.trim(),
    },

    {
        slug: 'how-lake-home-matching-works-and-why-its-free-to-you',
        title: "How Lake-Home Matching Works — and Why It's Free to You",
        tag: 'How It Works',
        seo_title: "How Lake-Home Matching Works — and Why It's Free | MN Lake Homes",
        seo_description: "How MinnesotaLakeHomesForSale.com matches you with a vetted, local lake agent — the step-by-step process, and exactly why it's free to use.",
        excerpt: "How MinnesotaLakeHomesForSale.com matches you with a vetted, local lake agent — the step-by-step process, and exactly why it's free to use.",
        cover_image_url: '/assets/images/blog/hero-how-lake-home-matching-works.jpg',
        body: `
<p>When people first land on MinnesotaLakeHomesForSale.com, two questions come up almost immediately: <em>What exactly happens when I get "matched"?</em> and <em>If it's free, what's the catch?</em></p>
<p>Fair questions. A lot of real estate sites are vague about both on purpose. We'd rather just tell you. Here's the whole process, start to finish, and a plain explanation of why it costs you nothing to use.</p>

<h2>What "matching" actually means</h2>
<p>Matching is simple to describe: you tell us what you're after, and we connect you with a vetted, licensed, local agent who specializes in that specific lake or area — then we help guide you through the process. We're not a brokerage and we don't sell the homes ourselves. Think of us as the concierge desk for Minnesota lake real estate: our job is to put you with the right local expert and make sure you're not navigating the water alone.</p>
<p>The key word is <strong>local</strong>. There are plenty of fine agents in Minnesota. Far fewer truly know a given lake — the bottoms, the bays, the shoreline rules, the price ladder. On lakefront, that hyper-local knowledge is the difference between a good buy and an expensive surprise. Matching is how you skip the guesswork of finding that person yourself.</p>

<h2>The step-by-step process</h2>
<p>Here's what it looks like in practice.</p>
<h3>1. You tell us what you're looking for</h3>
<p>You start with a short form — the lake or area you're interested in, whether you're buying or selling, your rough timeline, and the kind of property you have in mind (a cabin to fix up, a turnkey year-round home, a specific budget band). The more you tell us, the better the match. There's no account to create and no obligation.</p>
<h3>2. We match you to a specialist for that water</h3>
<p>We look at which vetted, licensed, local agents actually specialize in your lake or town and line up the best fit for what you described. A first-time cabin buyer on a quiet northern lake and a luxury buyer on <a href="/lakes/lake-minnetonka">Lake Minnetonka</a> need different specialists — matching means you get the one who fits, not whoever happened to pay for the click.</p>
<h3>3. The agent reaches out, and we stay in the loop</h3>
<p>Your matched agent connects with you directly to talk through what you want and start the real work — showings, comps, the shoreline walk-through. We don't disappear once the intro is made. If something's not clicking or you have a question about the process, we're still here to guide you.</p>
<h3>4. You stay in control the whole way</h3>
<p>You're never locked into anything by getting matched. You pick the lake, the town, the lot, and ultimately whether a given agent is the right fit. If they're not, tell us and we'll adjust. Matching is a starting point built around you, not a contract.</p>
<p>If you want a fuller picture of what working with that agent is like day to day, our guide on <a href="/blog/how-to-work-with-a-lake-specialist-agent">how to work with a lake-specialist agent</a> walks through what to expect.</p>

<h2>Why it's free to you — the honest version</h2>
<p>Now the part everyone really wants explained: it's free to use, and there's a straightforward reason.</p>
<p>We don't charge buyers or sellers, and we don't take a commission out of your transaction. Using MinnesotaLakeHomesForSale.com to get matched and guided costs you nothing.</p>
<p>So how does the business work? Agents who want to be part of our vetted, local network support the platform. That's the entire model. It means we can keep the service free for the people actually buying and selling lake homes — you — while still doing the work of vetting agents and guiding you through.</p>
<p>A couple of honest clarifications, because this is exactly where real estate sites tend to get slippery:</p>
<ul>
    <li><strong>"Free to use" is about our service, not the whole transaction.</strong> Every home purchase still has its own costs — closing costs, inspections, and agent commissions that are negotiated as part of your deal. (Since the industry rule changes that took effect in August 2024, buyer's-agent compensation is something you and your agent agree to in writing up front, so it's worth discussing early.) What's free is <em>us</em>: the matching and the concierge guidance. We don't add a fee on top, and we don't skim your sale.</li>
    <li><strong>A match is a fit, not a favor.</strong> Because agents support the platform, we're careful about how we describe them: vetted, licensed, local, and matched to your needs. We don't claim any agent is "the best" or "unbiased" — we match you to genuine local specialists and let their work speak.</li>
</ul>
<p>That's the catch, such as it is. There isn't a hidden one.</p>

<h2>Selling a lake home? Matching works the same way</h2>
<p>Most people think of matching as a buyer tool, but it's just as useful when you're selling. Pricing a lakefront home is the hardest part of the whole sale — the value lives in frontage quality, bottom, and orientation, and a general agent who guesses can leave real money on the table or scare off buyers with an overreach. We match sellers with a vetted, local specialist who knows what waterfront buyers on your lake actually pay for, so your home is priced and presented to the right audience from day one. Same process, same cost to you: nothing.</p>

<h2>What matching is not</h2>
<p>Worth being clear about the boundaries, too. Matching is <strong>not a lock-in</strong> — you're not signing anything by telling us what you want, and you can walk away at any point. It's <strong>not a lead-resale scheme</strong> where your information gets blasted to a dozen agents who race to call you; you're connected with a fit, not auctioned. And it's <strong>not a brokerage in disguise</strong> — we don't list homes, hold your earnest money, or push you toward any one company. We're the concierge layer that gets you to the right local expert and stays with you through it.</p>

<h2>Why this beats the alternatives</h2>
<p>The usual ways people find a lake agent each have a weak spot. National portals route you to whoever bought the ad on that listing — often an agent who's never set foot on your lake. (We get into why that matters in <a href="/blog/why-a-local-lake-specialist-beats-a-national-portal">why a local lake specialist beats a national portal</a>.) Asking around gets you your cousin's friend who's "great with houses" but may be learning lakefront on your dime. Searching cold leaves you guessing who's a real specialist and who just put "lake homes" on their website.</p>
<p>Matching solves the one thing those approaches can't: it puts the right local expert for your specific water in front of you, vetted in advance, at no cost. Whether you're eyeing a cabin near <a href="/towns/brainerd">Brainerd</a>, a chain like the <a href="/lakes/whitefish-chain">Whitefish Chain</a>, or a lake you haven't named yet, the process is the same — and it's built around your needs, not an ad auction.</p>

<h2>Ready to see your match?</h2>
<p>It takes a couple of minutes and there's no obligation. Tell us the lake or area you're considering and whether you're buying or selling, and we'll match you with a vetted, licensed, local agent who knows that water — and guide you from there.</p>
${ctaButton('Get matched with the right Minnesota lake agent →')}
<p style="text-align:center;color:#718096;font-size:0.92rem;">Free to you, no commission.</p>
        `.trim(),
    },

    {
        slug: 'questions-to-ask-before-you-pick-a-lake-agent',
        title: 'Questions to Ask Before You Pick a Lake Agent',
        tag: 'Working With an Agent',
        seo_title: 'Questions to Ask Before You Pick a Lake Agent | MN Lake Homes',
        seo_description: "Ten questions that separate a true Minnesota lake specialist from a general agent — what to ask before you pick who helps you buy or sell lakefront.",
        excerpt: "Ten questions that separate a true Minnesota lake specialist from a general agent — what to ask before you pick who helps you buy or sell lakefront.",
        cover_image_url: '/assets/images/blog/hero-questions-to-ask-before-you-pick-a-lake-agent.jpg',
        body: `
<p>Choosing who helps you buy or sell a Minnesota lake home is the single most important decision you'll make in the whole process — bigger than the lake, bigger than the budget. The right agent catches the problems you can't see and finds the lots that never hit the portals. The wrong one learns lakefront on your dime.</p>
<p>The good news: you can tell the two apart in one conversation, if you ask the right things. Here are ten questions that separate a true lake specialist from a perfectly nice general agent — and what a good answer sounds like.</p>

<h2>1. "Which lakes do you actually specialize in?"</h2>
<p>This is the first filter and the most important. You're listening for specifics. A real specialist names lakes, bays, and areas without hesitating — "I do most of my business on the north end of the chain" — and can tell you how the lake you're asking about differs from the one next to it. A vague "I work all over the area" is a general agent answer. On lakefront, the knowledge that matters is local down to the bay.</p>

<h2>2. "What should I know about the bottom and frontage on this lake?"</h2>
<p>A great test question, because it's pure lake knowledge. A specialist will talk about hard sand versus soft muck, swimmable versus reed-choked frontage, where the water drops off to boat-lift depth, and which shorelines erode. If the answer is about the kitchen and the curb appeal, you're talking to someone who reads houses, not shorelines — and on the water, the shoreline is most of the value.</p>

<h2>3. "How does shoreland zoning affect what I can do with this property?"</h2>
<p>Minnesota regulates shoreland development — setbacks from the water, what you can riprap, how much natural vegetation you have to keep. If you're picturing an addition, a bigger dock, or a cleared lawn down to the water, those rules decide whether it's even possible. A specialist flags this before you fall in love. A general agent often doesn't know it's a question until it's a problem.</p>

<h2>4. "What are the big expensive surprises on lake properties here?"</h2>
<p>You want them to bring up septic and wells unprompted. Most lake homes are on private septic and a private well, not city utilities, and a failing septic is the most common five-figure surprise in the market. An agent who immediately talks about septic age and condition, well depth, and water quality has clearly walked these properties. One who looks blank has not.</p>

<h2>5. "Are you licensed and in good standing — and how do you keep current?"</h2>
<p>A basic but fair question. Every Minnesota agent must complete 90 hours of pre-licensing education, pass the state exam, and then complete 30 hours of continuing education every two-year cycle to stay licensed (Minnesota Department of Commerce). You're not quizzing them on the statute — you just want to confirm they're a licensed professional in good standing, not someone working off expired credentials. (When you get matched through us, this is already verified — more on that below.)</p>

<h2>6. "Can you show me recent comparable sales on this lake?"</h2>
<p>On lakefront, comps are an art, not a lookup. Two homes with identical square footage can sell for very different prices based on frontage quality and orientation. A specialist can pull recent sales on that lake and explain why one went higher than another. If they reach for a generic regional average, they're guessing — and guessing is expensive on the water.</p>

<h2>7. "How will we handle our working agreement and your compensation?"</h2>
<p>Since the industry rule changes that took effect in August 2024, buyers and their agents put their working relationship — including how the agent is compensated — in writing before touring homes. That's normal now, and a good agent will explain it plainly and early rather than dodging. Clarity here is a green flag. Evasiveness is not. Our overview of <a href="/blog/how-to-work-with-a-lake-specialist-agent">how to work with a lake-specialist agent</a> goes deeper on what that working relationship looks like.</p>

<h2>8. "What's the buying timeline really like on this lake?"</h2>
<p>The best lots on in-demand lakes move fast — sometimes multiple offers within a couple of weeks, occasionally before they ever hit the portals. A specialist knows the rhythm of their lake: when inventory shows up, how competitive the good frontage gets, and when it pays to be patient. A general answer about "the spring market" tells you they're working from headlines, not the dock.</p>

<h2>9. "Do you have local connections — inspectors, lenders, dock and septic pros?"</h2>
<p>Lake transactions lean on a specific bench of local specialists: inspectors who know shoreline septic, surveyors who handle waterfront lots, dock and lift installers. An agent embedded in the lake community has these relationships ready. It's a quiet but reliable signal of how much real lakefront business they actually do.</p>

<h2>10. "What happens if you're not the right fit?"</h2>
<p>A confident professional is comfortable with this question. You want someone who'd rather you end up with the right specialist than hang onto a poor match. That posture — your outcome over their ego — is exactly what you're looking for, on a purchase this size.</p>

<h2>A few red flags worth noticing</h2>
<p>The questions above tell you what a good answer sounds like. It's just as useful to know the warning signs. Be cautious with an agent who rushes you past the shoreline details to talk finishes and staging, who can't name recent sales on the actual lake, who waves off septic and well questions as "the inspector's job," or who gets evasive about how the working agreement and compensation are handled. None of those are automatic disqualifiers on their own — but two or three together usually mean you've found someone who sells houses, not someone who knows the water. On a purchase this size, that distinction is worth a lot.</p>

<h2>The shortcut: get matched instead of vetting cold</h2>
<p>Here's the honest catch with all ten questions: they only help once you're already sitting across from an agent. Finding good candidates to ask in the first place is the hard part. Anyone can put "lake homes" on a website.</p>
<p>That's the gap MinnesotaLakeHomesForSale.com closes. We do the first round of vetting for you — confirming agents are licensed, local, and genuine specialists on the lake you care about — then match you to the best fit and guide you through the rest. It's free to use, we don't take a commission out of your pocket, and we work with agents at every brokerage, so the match is about lake knowledge and fit. If you want the full picture of how matching works, our <a href="/blog/how-lake-home-matching-works-and-why-its-free-to-you">step-by-step explainer</a> lays it out, and <a href="/blog/why-a-local-lake-specialist-beats-a-national-portal">why a local specialist beats a national portal</a> covers why the lake niche matters so much. You'll still want to ask your questions — you'll just be asking them of someone who's already cleared the bar.</p>
<p>Whether you're shopping near <a href="/lakes/gull-lake">Gull Lake</a>, the <a href="/lakes/whitefish-chain">Whitefish Chain</a>, or a lake you haven't picked yet, the move is the same.</p>

<h2>Ready when you are</h2>
<p>Bring these ten questions to any agent you meet — they work. And if you'd rather start from a shortlist that's already been vetted, get matched with a vetted, local lake agent who knows your water. We do the vetting so you don't have to, and it's free to you.</p>
${ctaButton('Get matched with a Minnesota lake specialist →')}
        `.trim(),
    },
];

async function main() {
    console.log('=== import-blog-posts-2026-06-16 ===\n');
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
    console.error('import-blog-posts-2026-06-16 FAILED:', err);
    process.exit(1);
});
