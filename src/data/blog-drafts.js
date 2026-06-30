/**
 * blog-drafts.js — a batch of SEO blog posts staged as DRAFTS.
 *
 * Every post here has `is_published: false`. seedBlogPosts() in src/server.js
 * inserts them on deploy (ON CONFLICT (slug) DO NOTHING), so they show up in
 * the admin Blog list as drafts — ready for a human to review and click
 * "Publish" when they want them live. They will NOT appear on the public site
 * until published.
 *
 * To publish one permanently via deploy instead of the admin toggle, move its
 * object into default-blog-posts.js and flip is_published to true.
 */

const author = 'MN Lake Homes Team';
const img = s => `/assets/images/blog/hero-${s}.jpg`;

const drafts = [
    // ─────────────────────────────────────────────────────────────────────
    // 1 — Best Minnesota lakes for families
    // ─────────────────────────────────────────────────────────────────────
    {
        title: 'The Best Minnesota Lakes for Families',
        slug: 'best-minnesota-lakes-for-families',
        tag: 'Buyer Guide',
        read_time_minutes: 7,
        cover_image_url: img('best-minnesota-lakes-for-families'),
        is_published: false,
        seo_title: 'Best Minnesota Lakes for Families (2026 Buyer Guide)',
        seo_description: 'The most family-friendly Minnesota lakes for a cabin or lake home — sandy swimming, calm water, and towns with everything kids need. A buyer-focused guide.',
        excerpt: "Sandy swimming, calm water, and a town with ice cream and a beach within reach — here are the Minnesota lakes families actually buy on, and what makes a lake kid-friendly in the first place.",
        body: `<p>If you're buying a lake home so the <em>kids</em> grow up on the water, the things that matter change. Trophy fishing and deep, open water take a back seat to a gradual sandy bottom, protected swimming areas, and a town nearby with a beach, a clinic, and somewhere to get ice cream on a hot July evening. This guide covers what makes a Minnesota lake genuinely family-friendly — and the lakes that consistently deliver it.</p>

<h2>What makes a lake good for families</h2>
<ul>
<li><strong>A hard, sandy, gradually deepening bottom.</strong> Toddlers and new swimmers need shallow, firm shallows — not a soft-muck drop-off. Always wade in during a showing.</li>
<li><strong>Protected water.</strong> A bay or smaller lake stays calmer than an open-fetch shoreline that takes wind and big-boat wake all afternoon.</li>
<li><strong>Good water quality.</strong> Check clarity, algae history, and swimmer's-itch reports on the <a href="https://www.dnr.state.mn.us/lakefind/index.html" target="_blank" rel="noopener">DNR LakeFinder</a> before you fall in love with a listing.</li>
<li><strong>A real town nearby.</strong> Groceries, urgent care, and rainy-day options matter more than you'd think with kids.</li>
</ul>

<h2>Lakes families love in Minnesota</h2>
<p><strong><a href="/lakes/gull-lake">Gull Lake</a> (Brainerd Lakes).</strong> The classic Minnesota family lake — sandy public beaches, resorts, mini-golf, and the town of <a href="/towns/nisswa">Nisswa</a> a few minutes away. It's busy in summer, which most families consider a feature.</p>
<p><strong><a href="/lakes/detroit-lake">Detroit Lake</a> (Detroit Lakes).</strong> A wide, sandy in-town lake with a long public beach and a walkable downtown. Hard to beat for first-time cabin families who don't want to feel isolated.</p>
<p><strong><a href="/lakes/lake-waconia">Lake Waconia</a>.</strong> Under an hour from the Twin Cities, big enough for boating but with calm bays — a strong pick if you want lake life without a long Friday drive.</p>
<p><strong><a href="/lakes/pelican-lake">Pelican Lake</a> and <a href="/lakes/otter-tail-lake">Otter Tail Lake</a>.</strong> The Otter Tail County lakes country offers clean water, gentle beaches, and friendly prices compared to the metro lakes.</p>
<p><strong><a href="/lakes/lake-melissa">Lake Melissa</a>.</strong> Quieter than neighboring Detroit Lake, with excellent sand and a relaxed, cabin-y feel.</p>

<h2>Match a lake to your family</h2>
<p>Every family weighs drive time, budget, and "busy resort vs. quiet bay" differently. Our <a href="/find-your-lake">Find Your Lake quiz</a> takes four questions and points you to the lakes that fit, and you can put two or three head-to-head on price, size, and vibe with the <a href="/compare-lakes">lake comparison tool</a>. When you're closer to touring, the <a href="/lake-buyer-checklist">buyer's checklist</a> covers the family-specific things to verify — swimming bottom, traffic, and access.</p>

<h2>The smartest first step</h2>
<p>The agents who specialize in these lakes know which <em>specific shorelines</em> swim well and which bays go weedy by August — detail no listing photo reveals. <a href="/pages/public/buy.html">Get matched with a local lake specialist</a> and tell them you're buying for the family; it's free, and there's no commission to you as the buyer. For the broader fundamentals of evaluating any waterfront parcel, start with <a href="/blog/5-things-to-look-for-in-a-lake-property">5 things to look for in a Minnesota lake property</a>.</p>`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // 2 — Buying a cabin in Minnesota: 2026 guide
    // ─────────────────────────────────────────────────────────────────────
    {
        title: 'Buying a Cabin in Minnesota: The 2026 Guide',
        slug: 'buying-a-cabin-in-minnesota-2026-guide',
        tag: 'Buyer Guide',
        read_time_minutes: 8,
        cover_image_url: img('buying-a-cabin-in-minnesota-2026-guide'),
        is_published: false,
        seo_title: 'Buying a Cabin in Minnesota: Step-by-Step 2026 Guide',
        seo_description: 'How to buy a cabin in Minnesota in 2026 — set your budget, pick the right lake, inspect the septic and shoreline, finance it, and make a winning offer.',
        excerpt: "From setting a realistic budget to closing on the right shoreline — a clear, step-by-step walkthrough of buying a cabin in Minnesota, with the lakefront pitfalls most first-time buyers miss.",
        body: `<p>Buying a cabin in Minnesota is a different process than buying a house in town. The value lives in the shoreline, half the systems are private (septic and well), and the best places move fast in spring. Here's the step-by-step, 2026 version of how to do it right.</p>

<h2>1. Set a real budget — including the lakefront costs</h2>
<p>Start with the monthly number, not the sticker price. Our <a href="/lake-mortgage-calculator">lake home cost calculator</a> estimates principal, interest, taxes, and insurance, and flags the costs cabin buyers forget: septic, docks, road-association dues, and second-home insurance. Read <a href="/blog/true-cost-of-owning-a-minnesota-lake-cabin">the true cost of owning a Minnesota lake cabin</a> before you set a ceiling.</p>

<h2>2. Pick your lake (and your drive)</h2>
<p>Drive time shapes everything — a cabin 90 minutes out gets used most weekends; four hours out becomes a once-a-month trip. Decide what "up north" means to you, then narrow it with the <a href="/find-your-lake">Find Your Lake quiz</a> and the <a href="/compare-lakes">comparison tool</a>. If you want resort energy, look at the <a href="/lakes/gull-lake">Gull Lake</a> area and <a href="/towns/nisswa">Nisswa</a>; for big walleye water, <a href="/lakes/leech-lake">Leech Lake</a> and <a href="/lakes/mille-lacs-lake">Mille Lacs</a>; for metro-close, <a href="/lakes/lake-waconia">Lake Waconia</a>.</p>

<h2>3. Get pre-approved — for the right property type</h2>
<p>Not every lender treats cabins the same. Seasonal cabins without year-round road access, or properties on leased land, can be harder to finance. Tell your lender it's a lake property up front, and confirm the loan product fits. (More on this in <a href="/blog/year-round-vs-seasonal-lake-homes-minnesota">year-round vs. seasonal lake homes</a>.)</p>

<h2>4. Inspect what's underwater and underground</h2>
<p>Two systems sink more cabin deals than anything else: the <strong>septic</strong> and the <strong>shoreline</strong>. Minnesota requires a septic Certificate of Compliance at most sales — see <a href="/blog/minnesota-lake-home-septic-and-well-guide">our septic & well guide</a>. And before you plan any addition or new dock, understand <a href="/blog/minnesota-shoreland-rules-before-you-buy">Minnesota's shoreland rules</a>, which limit how close you can build to the water. Walk through the full <a href="/lake-buyer-checklist">buyer's checklist</a> at every showing.</p>

<h2>5. Comp it against the same lake</h2>
<p>Two identical cabins can sell for wildly different prices based on frontage, bottom quality, and orientation. Regional averages are meaningless on the water. A specialist comps against the <em>same lake</em> — sometimes the same bay.</p>

<h2>6. Write a clean, contingent offer</h2>
<p>In a competitive spring market, sellers favor clean offers — but never waive your septic, well, and shoreline contingencies on a cabin. The right agent structures an offer that's attractive <em>and</em> protects you.</p>

<h2>Work with someone who reads water</h2>
<p>The single biggest advantage a cabin buyer can have is a local agent who knows the lake. <a href="/pages/public/buy.html">Get matched with a vetted Minnesota lake specialist</a> — free, no buyer commission — and skip the expensive lessons. For the fundamentals of any waterfront evaluation, start with <a href="/blog/5-things-to-look-for-in-a-lake-property">5 things to look for in a lake property</a>.</p>`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // 3 — Lake Minnetonka vs. the Brainerd Lakes
    // ─────────────────────────────────────────────────────────────────────
    {
        title: 'Lake Minnetonka vs. the Brainerd Lakes: Where Should You Buy?',
        slug: 'lake-minnetonka-vs-brainerd-lakes',
        tag: 'Choosing a Lake',
        read_time_minutes: 7,
        cover_image_url: img('lake-minnetonka-vs-brainerd-lakes'),
        is_published: false,
        seo_title: 'Lake Minnetonka vs. Brainerd Lakes: Where to Buy a Lake Home',
        seo_description: "Metro luxury or up-north cabin country? Compare Lake Minnetonka and the Brainerd Lakes on price, drive time, lifestyle, and resale before you buy.",
        excerpt: "Metro luxury minutes from the city, or up-north cabin country two hours away? A head-to-head look at Minnesota's two iconic lake markets — price, lifestyle, drive time, and who each one is really for.",
        body: `<p>For a lot of Minnesota buyers, the choice comes down to two very different dreams: a home on <a href="/lakes/lake-minnetonka">Lake Minnetonka</a>, minutes from the Twin Cities, or a cabin in the <strong>Brainerd Lakes</strong> area, where the north woods start. Both are iconic. They're also almost opposites. Here's how to choose.</p>

<h2>Lake Minnetonka: metro luxury on the water</h2>
<p>Minnetonka is a sprawling, multi-bay lake just 20–30 minutes west of Minneapolis, wrapped in walkable lake towns like <a href="/towns/wayzata">Wayzata</a> and <a href="/towns/excelsior">Excelsior</a>. You get restaurants, shops, and a commute that works for a primary residence — which is exactly why it commands Minnesota's highest waterfront prices.</p>
<ul>
<li><strong>Best for:</strong> buyers who want lake life as a primary home, with city convenience.</li>
<li><strong>Drive:</strong> well under an hour from downtown.</li>
<li><strong>Trade-offs:</strong> premium pricing, busy summer boat traffic, and dock licensing through the conservation district.</li>
</ul>

<h2>The Brainerd Lakes: up-north cabin country</h2>
<p>About two to two-and-a-half hours north, the Brainerd Lakes area — <a href="/lakes/gull-lake">Gull Lake</a>, the <a href="/lakes/whitefish-chain">Whitefish Chain</a>, <a href="/lakes/north-long-lake">North Long</a>, and dozens more — is the heart of Minnesota's resort and cabin culture. Towns like <a href="/towns/nisswa">Nisswa</a> deliver the classic up-north summer without sacrificing golf, dining, and good healthcare.</p>
<ul>
<li><strong>Best for:</strong> weekend and seasonal cabin buyers; multi-generational family getaways.</li>
<li><strong>Drive:</strong> roughly 2–2.5 hours from the metro.</li>
<li><strong>Trade-offs:</strong> too far for a daily commute; the best shorelines still sell fast and aren't cheap.</li>
</ul>

<h2>Price and resale</h2>
<p>Dollar for dollar, your money buys far more shoreline up north than on Minnetonka. But Minnetonka's metro-close scarcity has historically made it extremely resilient on resale. Neither is "better" — they serve different buyers. The right question isn't which lake is nicer; it's which lifestyle you'll actually live.</p>

<h2>Put them side by side</h2>
<p>Use the <a href="/compare-lakes">lake comparison tool</a> to line up Minnetonka against Gull or the Whitefish Chain on price, size, vibe, and fishing, or take the <a href="/find-your-lake">Find Your Lake quiz</a> if you're still deciding what you want. When you're ready to get specific, <a href="/pages/public/buy.html">get matched with a specialist</a> for whichever market you choose — the metro and Brainerd agents are different people, and local knowledge is the whole game.</p>`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // 4 — Minnesota lakefront property taxes explained
    // ─────────────────────────────────────────────────────────────────────
    {
        title: 'Minnesota Lakefront Property Taxes, Explained',
        slug: 'minnesota-lakefront-property-taxes-explained',
        tag: 'Buyer Guide',
        read_time_minutes: 7,
        cover_image_url: img('minnesota-lakefront-property-taxes-explained'),
        is_published: false,
        seo_title: 'Minnesota Lakefront Property Taxes Explained (Buyer Guide)',
        seo_description: 'How property taxes work on Minnesota lake homes — homestead vs. seasonal classification, how lakeshore is assessed, and what drives your bill. Plain-English guide.',
        excerpt: "Why two cabins on the same lake can have very different tax bills — homestead vs. seasonal classification, how lakeshore is valued, and how to estimate your real number before you buy.",
        body: `<p>Property taxes are one of the biggest surprises for first-time Minnesota lake buyers — partly because lakeshore is assessed differently than the house, and partly because a <em>seasonal</em> cabin is taxed differently than a primary home. Here's how it actually works, in plain English. (This is general education, not tax advice — confirm specifics with the county assessor.)</p>

<h2>How lake property is valued</h2>
<p>Minnesota property taxes are based on the assessor's <strong>estimated market value</strong>, which for lake property is typically split into the <em>land</em> (heavily driven by shoreline footage and quality) and the <em>structures</em>. This is why a modest cabin on 150 feet of prime sand can carry a higher land value — and tax bill — than a larger home on a weedy 60-foot lot. The water is the asset.</p>

<h2>Homestead vs. seasonal: the big one</h2>
<p>Classification drives your rate:</p>
<ul>
<li><strong>Homestead</strong> (your primary residence) generally receives the most favorable treatment, including the homestead market value exclusion.</li>
<li><strong>Seasonal residential recreational</strong> — the classic "cabin" — is taxed as non-homestead and does not get the homestead exclusion, so the effective rate is usually higher.</li>
</ul>
<p>If you're buying a place you'll eventually retire to full-time, the tax picture can change when you convert it to a homestead. Factor that into a long-term plan. The official rules live with the <a href="https://www.revenue.state.mn.us/property-tax-programs" target="_blank" rel="noopener">Minnesota Department of Revenue</a>, and each county assessor applies them locally.</p>

<h2>What drives your bill up (or down)</h2>
<ul>
<li><strong>Shoreline footage and quality</strong> — the single biggest land-value factor on a lake.</li>
<li><strong>Lake desirability</strong> — assessors track sales; a hot lake reassesses upward.</li>
<li><strong>Local levies</strong> — school, county, and township levies vary a lot by location, so identical lakeshore in two counties can be taxed differently.</li>
<li><strong>Improvements</strong> — new construction, additions, and finished shoreline raise assessed value.</li>
</ul>

<h2>Estimate your real number before you offer</h2>
<p>Don't trust a round "1%" rule of thumb. Pull the actual tax history (it's public), confirm the current classification, and plug a realistic figure into the <a href="/lake-mortgage-calculator">lake home cost calculator</a> so your monthly estimate is honest. A local agent can tell you how a specific county tends to assess lakeshore — it's part of the <a href="/lake-buyer-checklist">buyer's checklist</a> for a reason.</p>

<h2>Get local, lake-specific guidance</h2>
<p>Taxes are local, and a specialist who closes deals in that county every month knows the patterns. <a href="/pages/public/buy.html">Get matched with a Minnesota lake specialist</a> — free, no commission — and ask them to walk you through the tax classification before you write an offer.</p>`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // 5 — Minnesota shoreland rules before you buy
    // ─────────────────────────────────────────────────────────────────────
    {
        title: 'Minnesota Shoreland Rules Every Lake Buyer Should Know',
        slug: 'minnesota-shoreland-rules-before-you-buy',
        tag: 'Buyer Guide',
        read_time_minutes: 7,
        cover_image_url: img('minnesota-shoreland-rules-before-you-buy'),
        is_published: false,
        seo_title: 'Minnesota Shoreland Rules: What Lake Buyers Must Know',
        seo_description: "Setbacks, lake classifications, vegetation rules, and impervious-surface limits — the Minnesota shoreland rules that decide what you can build before you buy lakefront.",
        excerpt: "The addition you're picturing might not be legal. A buyer's guide to Minnesota's shoreland rules — setbacks, lake classifications, vegetation buffers, and what they mean for your plans.",
        body: `<p>Before you buy a lake home imagining a bigger deck, a bunkhouse, or a cleared, manicured lawn down to the water — understand Minnesota's <strong>shoreland rules</strong>. They govern how close you can build to the lake, how much hard surface you can add, and how much natural shoreline you have to keep. Buyers who skip this step get expensive surprises.</p>

<h2>Why shoreland is regulated</h2>
<p>Minnesota's Shoreland Management Program sets statewide minimum standards that counties and cities adopt and enforce. The goal is protecting water quality and the lake's value — which is also <em>your</em> investment. The state overview lives with the <a href="https://www.dnr.state.mn.us/waters/watermgmt_section/shoreland/index.html" target="_blank" rel="noopener">Minnesota DNR Shoreland Management</a> program; the specific ordinance that applies is your county's.</p>

<h2>Lake classifications change the rules</h2>
<p>The DNR classifies lakes, and the class drives the strictness:</p>
<ul>
<li><strong>Natural Environment</strong> lakes carry the largest setbacks and tightest limits.</li>
<li><strong>Recreational Development</strong> lakes — many of Minnesota's popular cabin lakes — sit in the middle.</li>
<li><strong>General Development</strong> lakes (busy, developed waters) have the most permissive standards.</li>
</ul>
<p>A quiet lake like one in the Vermilion or up-north country may be a natural-environment lake with strict rules, while a developed lake closer to the metro may allow more.</p>

<h2>The rules that affect your plans most</h2>
<ul>
<li><strong>Structure setbacks.</strong> Homes and additions must sit a minimum distance back from the ordinary high-water mark — often 75 to 150+ feet depending on classification. The lot you love may have very little buildable area.</li>
<li><strong>Impervious-surface limits.</strong> There's usually a cap (commonly around 25%) on how much of the lot can be roofs, driveways, and patios.</li>
<li><strong>Vegetation / shoreline buffers.</strong> You generally must preserve a strip of natural vegetation along the water — you can't just mow a golf-course lawn to the lake.</li>
<li><strong>Nonconforming structures.</strong> Many older cabins sit closer to the water than today's rules allow. They're often "grandfathered," but expanding them can trigger the current setback — meaning that addition may not be approvable.</li>
</ul>

<h2>Check it before you're under contract</h2>
<p>If your plans depend on building, adding, or moving close to the water, confirm what's allowed with the county zoning office <em>before</em> your contingency lapses. It's on the <a href="/lake-buyer-checklist">buyer's checklist</a> for exactly this reason, and it pairs with understanding <a href="/blog/minnesota-lake-home-septic-and-well-guide">septic and well requirements</a>, which have their own setbacks.</p>

<h2>An agent who knows the local ordinance</h2>
<p>Shoreland enforcement is local, and a specialist knows which lakes and counties are strict. <a href="/pages/public/buy.html">Get matched with a Minnesota lake specialist</a> — free, no commission — and tell them what you hope to build. It's far cheaper to learn "you can't" before closing than after.</p>`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // 6 — How to sell a lake home in Minnesota
    // ─────────────────────────────────────────────────────────────────────
    {
        title: 'How to Sell a Lake Home in Minnesota: 2026 Seller’s Guide',
        slug: 'how-to-sell-a-lake-home-in-minnesota',
        tag: 'Seller Resources',
        read_time_minutes: 8,
        cover_image_url: img('how-to-sell-a-lake-home-in-minnesota'),
        is_published: false,
        seo_title: 'How to Sell a Lake Home in Minnesota (2026 Seller Guide)',
        seo_description: 'Sell your Minnesota lake home for more — when to list, how lakeshore is priced, septic compliance, staging the waterfront, and choosing a lake specialist.',
        excerpt: "Timing, pricing, septic compliance, and showing the shoreline at its best — a seller's playbook for getting top dollar on a Minnesota lake home, from the specialists who sell them.",
        body: `<p>Selling a lake home isn't like selling a house in town. The shoreline is most of the value, the buying season is short, and a failed septic can derail a closing. Here's how to sell a Minnesota lake home for what it's worth in 2026.</p>

<h2>1. Time it with the water</h2>
<p>Lake homes sell best when the lake looks like the dream — late spring through summer, water in, dock out, trees green. Listing in May or June puts you in front of the most motivated buyers. A great agent will still photograph the shoreline in peak season even if you list later.</p>

<h2>2. Price against the same lake</h2>
<p>The most common seller mistake is pricing off regional averages. Lake value is hyper-local: frontage footage, bottom quality, orientation, and which <em>bay</em> you're on all move the number. Comp against recent sales on the same lake. Curious where you stand? Start a no-pressure valuation through our <a href="/pages/public/sell.html">seller page</a>.</p>

<h2>3. Get the septic compliance handled early</h2>
<p>Minnesota requires a septic Certificate of Compliance at most sales. A non-compliant or failing system discovered late can blow up a deal or force a steep credit. Get it inspected <em>before</em> you list so there are no surprises — see our <a href="/blog/minnesota-lake-home-septic-and-well-guide">septic & well guide</a>.</p>

<h2>4. Stage the waterfront, not just the house</h2>
<p>Buyers are buying the shoreline. Clean and stain the dock, clear the swimming area, tidy the firepit and beach, and stage one irresistible "this is the life" spot at the water's edge. Inside, the same fundamentals apply — declutter, depersonalize, maximize light. (Our guide to <a href="/blog/how-to-stage-your-cabin-for-maximum-value">staging your cabin for maximum value</a> goes deeper.)</p>

<h2>5. Market it where lake buyers actually look</h2>
<p>Lake buyers often live hours away in the metro or out of state. Your listing needs drone and shoreline photography, accurate frontage and lake data, and exposure to buyers actively searching that lake — not just a sign in the yard.</p>

<h2>6. Consider your options</h2>
<p>Most sellers maximize value with a well-marketed listing. If speed and certainty matter more than top dollar — an estate, a quick relocation — ask about a <a href="/pages/public/cash-offer.html">cash offer</a>. A good agent will lay out both paths honestly.</p>

<h2>List with a lake specialist</h2>
<p>An agent who sells on your lake every season knows your buyers, your comps, and how to present the shoreline. <a href="/pages/public/sell.html">Get matched with a Minnesota lake selling specialist</a> and get a real valuation before you decide anything.</p>`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // 7 — True cost of owning a Minnesota lake cabin
    // ─────────────────────────────────────────────────────────────────────
    {
        title: 'The True Cost of Owning a Minnesota Lake Cabin',
        slug: 'true-cost-of-owning-a-minnesota-lake-cabin',
        tag: 'Buyer Guide',
        read_time_minutes: 7,
        cover_image_url: img('true-cost-of-owning-a-minnesota-lake-cabin'),
        is_published: false,
        seo_title: 'The True Cost of Owning a Minnesota Lake Cabin',
        seo_description: 'Beyond the mortgage: septic, docks, insurance, road dues, and seasonal upkeep. A realistic breakdown of what it actually costs to own a Minnesota lake cabin.',
        excerpt: "The mortgage is only the beginning. Here's the honest, line-by-line breakdown of what it really costs to own a Minnesota lake cabin — including the bills first-time buyers never see coming.",
        body: `<p>The listing price tells you what it costs to <em>buy</em> a Minnesota lake cabin. It says nothing about what it costs to <em>own</em> one. Lakefront carries a stack of expenses a typical in-town home doesn't, and they catch first-time buyers off guard. Here's the realistic picture.</p>

<h2>The obvious four (run the numbers)</h2>
<p>Principal, interest, property taxes, and insurance are your baseline. Plug a real purchase price and tax figure into the <a href="/lake-mortgage-calculator">lake home cost calculator</a> to get an honest monthly number — and read <a href="/blog/minnesota-lakefront-property-taxes-explained">how Minnesota lakefront taxes work</a>, since a seasonal cabin is taxed less favorably than a homestead.</p>

<h2>The lakefront costs buyers forget</h2>
<ul>
<li><strong>Septic system.</strong> Most cabins are on private septic. Routine pumping is modest, but a failing system replacement runs well into five figures — see the <a href="/blog/minnesota-lake-home-septic-and-well-guide">septic & well guide</a>.</li>
<li><strong>Well & water.</strong> Private wells mean pumps, pressure tanks, softeners, and periodic testing.</li>
<li><strong>Dock, lift & shoreline.</strong> Docks and boat lifts cost thousands up front and need install/removal each season. Riprap and erosion control add up — and may need permits under <a href="/blog/minnesota-shoreland-rules-before-you-buy">shoreland rules</a>.</li>
<li><strong>Insurance.</strong> Waterfront premiums run higher, and any flood-zone exposure can mean mandatory flood insurance.</li>
<li><strong>Road-association dues.</strong> Many cabins sit on private roads with annual dues for grading and plowing.</li>
<li><strong>Seasonal upkeep.</strong> Winterizing, opening/closing the cabin, dock in and out, and a second set of utilities you pay year-round whether you're there or not.</li>
</ul>

<h2>Don't forget the "fun" budget</h2>
<p>The boat, the pontoon, fuel, lift maintenance, and the gear that makes lake life lake life are real recurring costs. Build them into the plan so the cabin stays a joy, not a stressor.</p>

<h2>How to keep it affordable</h2>
<ul>
<li><strong>Buy the right systems.</strong> A recently updated septic, well, and roof saves you the big surprises.</li>
<li><strong>Pick year-round access</strong> if you want flexibility — see <a href="/blog/year-round-vs-seasonal-lake-homes-minnesota">year-round vs. seasonal lake homes</a>.</li>
<li><strong>Inspect thoroughly.</strong> Work the full <a href="/lake-buyer-checklist">buyer's checklist</a> so cost surprises surface before closing.</li>
</ul>

<h2>Get a clear-eyed local read</h2>
<p>A specialist who knows the lake can estimate the real carrying costs for a specific property and flag the expensive ones early. <a href="/pages/public/buy.html">Get matched with a Minnesota lake specialist</a> — free, and no commission to you as the buyer.</p>`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // 8 — Best walleye lakes in Minnesota
    // ─────────────────────────────────────────────────────────────────────
    {
        title: 'The Best Walleye Lakes in Minnesota for Cabin Buyers',
        slug: 'best-walleye-lakes-in-minnesota',
        tag: 'Local Life',
        read_time_minutes: 7,
        cover_image_url: img('best-walleye-lakes-in-minnesota'),
        is_published: false,
        seo_title: 'Best Walleye Lakes in Minnesota (for Cabin Buyers)',
        seo_description: "Minnesota's top walleye lakes — Mille Lacs, Leech, Winnibigoshish, Lake of the Woods, Vermilion and more — and what buying a cabin on each is really like.",
        excerpt: "Minnesota's legendary walleye water — Mille Lacs, Leech, Winnie, Lake of the Woods — ranked for anglers who want to own the cabin, not just rent the weekend. With the lake-buying realities for each.",
        body: `<p>For a lot of Minnesota buyers, the dream cabin is measured in walleye. The good news: this state has the best walleye fishing in the country, and you can own on most of it. Here are the legendary walleye lakes — and what buying a cabin on each is actually like. (Always check current regulations and fish surveys on the <a href="https://www.dnr.state.mn.us/lakefind/index.html" target="_blank" rel="noopener">DNR LakeFinder</a> before you buy or fish.)</p>

<h2>Mille Lacs Lake</h2>
<p><a href="/lakes/mille-lacs-lake">Mille Lacs</a> is Minnesota's walleye factory — a vast, shallow basin with world-class numbers and famously dynamic regulations. It's about two hours from the metro, with a mix of cabins and year-round homes. Big water means you want a protected harbor or a good launch nearby.</p>

<h2>Leech Lake</h2>
<p><a href="/lakes/leech-lake">Leech Lake</a> near <a href="/towns/walker">Walker</a> pairs trophy walleye (and muskie) with a true up-north resort culture. It's huge, with countless bays and a strong cabin market across a wide price range.</p>

<h2>Lake Winnibigoshish</h2>
<p><a href="/lakes/lake-winnibigoshish">Lake Winnibigoshish</a> — "Winnie" — sits within the Chippewa National Forest, which keeps much of the shoreline wild and undeveloped. That scarcity makes privately owned lots prized among serious anglers.</p>

<h2>Lake of the Woods</h2>
<p><a href="/lakes/lake-of-the-woods">Lake of the Woods</a> on the Canadian border is a destination fishery — walleye and sauger year-round, including a massive winter ice-fishing scene. It's a long haul from the Twin Cities, so think genuine getaway, not weekend regular.</p>

<h2>Lake Vermilion</h2>
<p><a href="/lakes/lake-vermilion">Lake Vermilion</a> blends excellent walleye with stunning, rocky, island-dotted scenery near the edge of the Boundary Waters. It draws buyers who want fishing <em>and</em> a spectacular setting — and prices reflect it.</p>

<h2>Cass Lake & the rest</h2>
<p><a href="/lakes/cass-lake">Cass Lake</a>, <a href="/lakes/kabetogama-lake">Lake Kabetogama</a>, <a href="/lakes/rainy-lake">Rainy Lake</a>, and <a href="/lakes/big-sandy-lake">Big Sandy</a> all deliver outstanding walleye with their own characters and price points.</p>

<h2>Buying on big walleye water</h2>
<p>Trophy lakes are usually big lakes, which changes what to look for: a protected dock, manageable wind exposure, and good access. Compare a few on the <a href="/compare-lakes">comparison tool</a>, then <a href="/pages/public/buy.html">get matched with a specialist</a> who fishes the lake you want — they'll know which shorelines anglers actually covet. Pair this with <a href="/blog/5-things-to-look-for-in-a-lake-property">5 things to look for in a lake property</a>.</p>`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // 9 — Year-round vs. seasonal lake homes
    // ─────────────────────────────────────────────────────────────────────
    {
        title: 'Year-Round vs. Seasonal Lake Homes in Minnesota',
        slug: 'year-round-vs-seasonal-lake-homes-minnesota',
        tag: 'Buyer Guide',
        read_time_minutes: 6,
        cover_image_url: img('year-round-vs-seasonal-lake-homes-minnesota'),
        is_published: false,
        seo_title: 'Year-Round vs. Seasonal Lake Homes in Minnesota',
        seo_description: 'Four-season home or summer cabin? How access, insulation, financing, septic, and taxes differ between year-round and seasonal Minnesota lake properties.',
        excerpt: "A summer-only cabin and a four-season lake home look similar in photos but buy very differently — access, insulation, financing, and taxes all change. Here's how to know which one you're really buying.",
        body: `<p>Two lake listings can look nearly identical and be completely different purchases — one a true four-season home, the other a summer-only cabin. The difference affects financing, insurance, taxes, and how often you'll actually use it. Here's how to tell them apart and choose.</p>

<h2>What "seasonal" really means</h2>
<p>A seasonal cabin is built for warm-weather use: it may lack full insulation, have a shallow or summer-only water system, sit on a road that isn't plowed, or be winterized and shut down from fall to spring. A year-round home is built and serviced for Minnesota winters.</p>

<h2>The differences that matter</h2>
<ul>
<li><strong>Access.</strong> Is the road public and plowed, association-maintained, or unmaintained in winter? No winter access effectively makes a home seasonal regardless of how it's built.</li>
<li><strong>Insulation & systems.</strong> Four-season living needs real insulation, a reliable heat source, and a water/septic system that won't freeze.</li>
<li><strong>Financing.</strong> Lenders may treat a seasonal cabin without year-round access differently than a primary-residence-quality home. Confirm the loan fits before you write the offer — more in <a href="/blog/buying-a-cabin-in-minnesota-2026-guide">our 2026 cabin-buying guide</a>.</li>
<li><strong>Taxes.</strong> A seasonal recreational cabin is taxed less favorably than a homestead — see <a href="/blog/minnesota-lakefront-property-taxes-explained">lakefront property taxes explained</a>.</li>
<li><strong>Insurance.</strong> Vacant-in-winter cabins can carry different coverage requirements than occupied homes.</li>
</ul>

<h2>Which towns lean which way</h2>
<p>Lakes wrapped around established towns — like <a href="/lakes/detroit-lake">Detroit Lake</a>, <a href="/lakes/lake-bemidji">Lake Bemidji</a>, or the <a href="/lakes/gull-lake">Gull Lake</a> corridor near <a href="/towns/nisswa">Nisswa</a> — have plenty of true year-round housing stock. Remote, deep-woods lakes skew toward seasonal cabins. Decide how you'll use the place, then shop the matching inventory.</p>

<h2>Don't assume — verify</h2>
<p>"Year-round" in a listing isn't a guarantee. Confirm winter road maintenance, the heating system, and how the water and septic handle freezing. It's all on the <a href="/lake-buyer-checklist">buyer's checklist</a>.</p>

<h2>Get help reading the difference</h2>
<p>A local specialist can tell at a glance whether a property is genuinely four-season and what it'd take to upgrade a seasonal cabin. <a href="/pages/public/buy.html">Get matched with a Minnesota lake specialist</a> — free, no buyer commission — and tell them how you plan to use the place.</p>`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // 10 — Septic & well guide
    // ─────────────────────────────────────────────────────────────────────
    {
        title: 'Septic & Well on a Minnesota Lake Home: What Buyers Must Know',
        slug: 'minnesota-lake-home-septic-and-well-guide',
        tag: 'Buyer Guide',
        read_time_minutes: 7,
        cover_image_url: img('minnesota-lake-home-septic-and-well-guide'),
        is_published: false,
        seo_title: 'Septic & Well on a Minnesota Lake Home: Buyer Guide',
        seo_description: "Most Minnesota lake homes are on private septic and well. Compliance certificates, conforming vs. non-conforming systems, mound systems, and what buyers must verify.",
        excerpt: "Most Minnesota lake homes run on a private septic and well — and those two systems sink more cabin deals than anything else. Here's exactly what to verify before you buy.",
        body: `<p>In town, you connect to city sewer and water and never think about it. On the lake, you usually don't have that option — most Minnesota lake homes run on a <strong>private septic system and a private well</strong>. They're also where the most expensive surprises hide. Here's what every lake buyer needs to know.</p>

<h2>Septic: the compliance certificate is non-negotiable</h2>
<p>Minnesota regulates private septic systems as Subsurface Sewage Treatment Systems (SSTS). At most property sales, the seller must provide a <strong>Certificate of Compliance</strong> showing the system was inspected and meets standards. A failing or non-compliant system can derail a closing or force a costly credit. Get the inspection, the pumping records, and the system's as-built drawing. The state framework is with the <a href="https://www.pca.state.mn.us/water/subsurface-sewage-treatment-systems-ssts" target="_blank" rel="noopener">Minnesota Pollution Control Agency (MPCA)</a>; enforcement is at the county level.</p>

<h2>Conforming vs. non-conforming</h2>
<p>Older cabins often have older systems. A "non-conforming" or "imminent threat" classification can mean the system must be upgraded — sometimes within a set timeframe after sale, sometimes before. Replacement of a full system, especially a <strong>mound system</strong> (common where soils or water tables don't allow a standard drainfield), routinely runs well into five figures. Know the system's status and age before you commit.</p>

<h2>What to verify about the septic</h2>
<ul>
<li>Current Certificate of Compliance (and its expiration).</li>
<li>System type (standard drainfield, mound, holding tank) and installation date.</li>
<li>Tank size vs. the home's bedroom count — undersized systems fail inspections.</li>
<li>Pumping and maintenance history.</li>
<li>Whether any upgrade is required as a condition of sale.</li>
</ul>

<h2>The well: test the water, read the log</h2>
<p>A private well comes with its own checklist:</p>
<ul>
<li><strong>Well log & depth</strong> — confirm it's a proper drilled well, not a shallow point.</li>
<li><strong>Water quality test</strong> — coliform bacteria, nitrates, and region-specific concerns like arsenic or manganese.</li>
<li><strong>Equipment</strong> — pump, pressure tank, and any softener/filtration, plus their age.</li>
<li><strong>Setbacks</strong> — wells and septic have required separation distances from each other and the lake.</li>
</ul>

<h2>Put it on the list</h2>
<p>Septic and well checks are front and center on our <a href="/lake-buyer-checklist">buyer's checklist</a>, and they tie into <a href="/blog/minnesota-shoreland-rules-before-you-buy">shoreland setback rules</a>. Budget for them in <a href="/blog/true-cost-of-owning-a-minnesota-lake-cabin">your true cost of ownership</a>.</p>

<h2>Buy with someone who's seen it all</h2>
<p>An experienced lake agent knows the local inspectors, the lakes with tricky soils, and how to write contingencies that protect you. <a href="/pages/public/buy.html">Get matched with a Minnesota lake specialist</a> — free, no commission — before you fall for a cabin with a system you haven't checked.</p>`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // 11 — Local Spotlight: Granite City Aerial Media (featured partner)
    // Tagged to the business via featured_business_slug, so once PUBLISHED it
    // also surfaces in the "Featured Blogs" section on their profile at
    // /businesses/granite-city-aerial-media.
    // ─────────────────────────────────────────────────────────────────────
    {
        title: 'Local Spotlight: Granite City Aerial Media — Showing Minnesota Lake Homes From Above',
        slug: 'local-spotlight-granite-city-aerial-media',
        tag: 'Local Spotlight',
        read_time_minutes: 4,
        cover_image_url: img('local-spotlight-granite-city-aerial-media'),
        is_published: false,
        featured_business_slug: 'granite-city-aerial-media',
        seo_title: 'Granite City Aerial Media — Drone Photography for MN Lake Homes',
        seo_description: 'A MinnesotaLakeHomesForSale.com local business spotlight on Granite City Aerial Media, a St. Cloud-based drone photography and video partner serving lake listings statewide.',
        excerpt: "The view from the ground tells half the story. We're spotlighting Granite City Aerial Media — a central-Minnesota drone photography partner that shows a lake home's shoreline, frontage, and setting the way buyers want to see it.",
        body: `<p style="font-style:italic;color:#718096;">A <a href="/index.html">MinnesotaLakeHomesForSale.com</a> local business spotlight.</p>

<p>When you're <a href="/pages/public/buy.html">buying</a> or <a href="/pages/public/sell.html">selling</a> a Minnesota lake home, the view from the ground only tells half the story. The shoreline, the water frontage, the dock, the tree line, how the lot sits against the lake — those are the details that sell a property, and they're nearly impossible to capture standing in the front yard. That's where the view from above changes everything.</p>

<p>So for this local spotlight, we're featuring a central-Minnesota partner who does exactly that: <a href="/businesses/granite-city-aerial-media">Granite City Aerial Media</a>.</p>

<h2>Why we wanted to highlight them</h2>
<p>We're picky about the businesses we put in front of our community. Lake real estate is its own world — shoreline regulations, water frontage, dock rights, lot orientation — and the people who serve it well actually understand the water. Granite City Aerial Media brings professional drone photography and video to the table, and that's one of the highest-leverage things a lake listing can have.</p>
<p>A strong aerial shot does a few things at once:</p>
<ul>
<li><strong>It shows the full setting</strong> — how the home relates to the shoreline, the size and shape of the lot, and the surrounding landscape.</li>
<li><strong>It reveals the waterfront</strong> — frontage length, dock placement, and water access that a buyer can't gauge from a standard photo.</li>
<li><strong>It gives buyers confidence</strong> — they can picture the property as a whole before they ever drive out to see it.</li>
</ul>
<p>For sellers, that often means more interest and stronger first impressions. For buyers, it means a clearer, more honest look at what they're really considering.</p>

<h2>Based in the heart of Minnesota lake country</h2>
<p>Operating out of the Granite City (St. Cloud) area, Granite City Aerial Media sits right in the middle of some of Minnesota's best lake country — within easy reach of the lakes that draw buyers from across the state. That local footprint matters. A photographer who knows the area knows the light, the seasons, and how to frame a property so it looks like the place buyers are dreaming about.</p>
<p>Granite City Aerial Media provides professional drone photography, interior photography, cinematic video, and social media content for real estate professionals, businesses, and property owners throughout Minnesota. And while they're based near St. Cloud, they travel statewide for projects — lake homes, resorts, and commercial properties alike.</p>

<h2>See their work</h2>
<p>If you're an agent prepping a lake listing — or a <a href="/pages/public/sell.html">seller who wants your property to stand out</a> — it's worth seeing what aerial coverage can do. Visit the <a href="/businesses/granite-city-aerial-media">Granite City Aerial Media profile</a> on our site, or reach them directly:</p>
<ul>
<li><strong>Website:</strong> <a href="https://granitecityaerialmedia.com" target="_blank" rel="noopener">granitecityaerialmedia.com</a></li>
<li><strong>Instagram:</strong> <a href="https://www.instagram.com/granitecityaerial" target="_blank" rel="noopener">@granitecityaerial</a></li>
<li><strong>Facebook:</strong> <a href="https://www.facebook.com/search/top?q=Granite%20City%20Aerial%20Media" target="_blank" rel="noopener">Granite City Aerial Media</a></li>
</ul>

<p><a href="/businesses/granite-city-aerial-media">→ View Granite City Aerial Media's full profile</a></p>`,
    },
];

module.exports = drafts;
module.exports.drafts = drafts;
