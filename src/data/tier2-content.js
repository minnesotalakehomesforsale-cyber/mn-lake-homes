/**
 * tier2-content.js — Tier-2 lake page content (DEV-05 T2), 18 lakes, authored to
 * the Lake Page Template Spec (v1), sections A–H. Wired in by seedTier2Content()
 * the same way as Tier-1: content-hashed per entry (applies once, never clobbers
 * a later admin edit unless this file changes). Missing lakes rows are created
 * from slug/name/geo with a NULL hero (page 404s until a hero is set).
 *
 * STANDARD MAPPING (approved):
 *   A  meta title → seo_title · meta description → seo_description
 *      sub-headline → intro_text (hero lead) · H1 = "<name> Homes for Sale"
 *   B  "Where it is" opens description; "Size/depth" + "Who lives here" follow.
 *      "What people do" + "The town" → lifestyle_text.
 *      "Notable features" → notable_features (one bullet per line).
 *   C  property types + price drivers + the deliberate-drawback ¶ → real_estate_context.
 *      "Seasonality" → seasons_text.
 *   G  FAQ (8 Q&As) → faq [{q,a}].
 *   D/E/F dynamic blocks, Section H, and "Dev/Partnerships/Section-tag" lines NEVER render.
 *   stats{} = clean non-flagged numerics only → DNR columns. Ranged / UNVERIFIED /
 *      conflicted / dated figures are OMITTED (left NULL) and carried in the prose.
 *      `[verify …]` tags and markdown `**` emphasis are stripped.
 *
 * DELIBERATE drawbacks that MUST stay exactly as written (never "tidied"):
 *   Independence D-grade + "swimming not recommended"; Big Sandy + Osakis impaired
 *   clarity; White Bear unresolved water-level litigation; Waconia C-vs-Minnewashta-A.
 *   Two corrections: Miltona is NOT on the Alexandria Chain; Christmas declines
 *   "most expensive."
 */
const LAKES = [
    {
        slug: 'lake-independence', kind: 'lake',
        name: 'Lake Independence', geo: 'Hennepin County; Independence / Medina / Maple Plain',
        seo_title: 'Lake Independence Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Independence homes for sale in Medina and Independence, Minnesota. 830 acres, 58 ft deep, Baker Park Reserve shoreline, 30 min from Minneapolis. Get matched free.',
        intro_text: '830 acres half an hour from Minneapolis, with Baker Park Reserve forming its entire southeast shore — cabins and estates side by side. Get matched with an agent who knows it.',
        description: `Lake Independence straddles the cities of Independence and Medina in western Hennepin County, with Maple Plain adjoining to the east. Maple Plain is about 20 miles and 27 minutes from downtown Minneapolis via US-12 — comfortably commutable.

The lake covers roughly 832–851 acres with 7 miles of shoreline and a maximum depth of 58 feet. Average depth isn't published.

Genuinely mixed, and that's the interesting part. Small original one-bedroom cabins — some preserved and renovated as retreats — sit alongside multi-acre estate homes and newer lakefront townhome development. Of all the metro lakes in this tier, Independence has the clearest cabin-to-year-round conversion story still visibly in progress.`,
        lifestyle_text: `Walleye, largemouth bass, northern pike, muskie, crappie, bluegill and perch. Baker Park Reserve — roughly 2,700 acres run by Three Rivers Park District — forms the entire southeast shoreline, with a two-lane boat ramp, swimming beach and shore fishing. The lake is served by the Orono School District.

Maple Plain, Medina and Independence cover local services; Wayzata and the western suburbs are close, and downtown Minneapolis is under half an hour. Baker Park Reserve is an amenity in its own right.`,
        notable_features: `Baker Park Reserve forms the entire southeast shore — roughly 2,700 acres of permanent public green space, not future development
27 minutes from downtown Minneapolis via US-12
58 feet deep on 832–851 acres
A visible cabin-to-estate mix — one-bedroom originals beside multi-acre estate homes
Orono School District`,
        real_estate_context: `Typical property types: Original small cabins (some beautifully renovated), multi-acre estate homes, and newer lakefront townhomes. Few metro lakes offer this much variety in one place.

What drives price here: Lot size and whether a property is an original cabin, a renovation or a newer build. Because the stock varies so widely, comparable sales need care here — a job for someone who knows the lake.

Water quality is the honest headline, and it's poor. Lake Independence grades D (Poor) with clarity at 4.8 feet and phosphorus at 68.8 µg/L; it's classified eutrophic and swimming is not recommended on current data. It was designated an MPCA impaired water in 2003 and carries a formal TMDL restoration plan from 2007 targeting a 23% phosphorus reduction. Sources cited include agricultural runoff, animal waste, urban development, failing septic systems and geese. Phosphorus has been improving over the recent monitoring window. A buyer who wants swimmable clear water should probably look elsewhere; a buyer who wants land, space, park frontage and a metro commute may still find this the right lake. They just need to be told.`,
        seasons_text: `Year-round metro demand. Inventory varies widely in type, which makes timing less predictable than on a uniform suburban lake.`,
        faq: [
            { q: 'How big and deep is Lake Independence?', a: "Roughly 832–851 acres with 7 miles of shoreline and a maximum depth of 58 feet. Average depth isn't published." },
            { q: "What's the water quality like?", a: 'Poor, and buyers should know before they visit. The lake grades D with clarity at 4.8 feet and high phosphorus, is classified eutrophic, and swimming is not recommended on current data. It was designated an impaired water in 2003 with a formal restoration plan from 2007. Phosphorus has been improving in recent monitoring.' },
            { q: 'Why would someone buy here anyway?', a: 'Space, lot size, Baker Park Reserve frontage, the Orono School District, and a 27-minute drive to downtown Minneapolis. For buyers weighting land and location over swimming, it can be the right trade — it just has to be a conscious one.' },
            { q: 'What is Baker Park Reserve?', a: 'A roughly 2,700-acre Three Rivers Park District reserve that forms the entire southeast shoreline, with a two-lane boat ramp, swimming beach and shore fishing. It means that shore will never be developed.' },
            { q: 'What kinds of homes are on the lake?', a: 'An unusually wide mix — small original one-bedroom cabins, multi-acre estate homes, and newer lakefront townhomes.' },
            { q: 'What fish are in the lake?', a: 'Walleye, largemouth bass, northern pike, muskie, crappie, bluegill and perch.' },
            { q: 'Are there boating restrictions?', a: 'Yes — a slow-no-wake ordinance triggers at 957.8 feet lake elevation for three consecutive days, enforced jointly by Medina and Independence.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { max_depth_ft: 58, water_clarity_ft: 4.8, shoreline_miles: 7 },
    },
    {
        slug: 'bald-eagle-lake', kind: 'lake',
        name: 'Bald Eagle Lake', geo: 'Ramsey County; White Bear Township',
        seo_title: 'Bald Eagle Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Bald Eagle Lake homes for sale in White Bear Township, Minnesota. 1,049 acres, open-water boating, muskie fishery, minutes from St. Paul. Get matched free.',
        intro_text: '1,000 acres built for boating, just north of White Bear Lake — a recreational lake with a regional park and a muskie reputation. Get matched with an agent who knows it.',
        description: `Bald Eagle Lake sits in White Bear Township, Ramsey County, just north of the city of White Bear Lake off Highway 61. The adjoining city of White Bear Lake is a sourced 12 miles and about 16 minutes from downtown St. Paul; Bald Eagle sits a few miles further north — use that as a directional anchor rather than an exact figure.

The lake covers 1,049 acres with 9 to 9.2 miles of shoreline. Maximum depth is 36 feet with an average of 13 feet — this is a broad, relatively shallow basin. Clarity measured 5.6 feet, graded C (Fair), eutrophic, with a declining trend over recent years.

More purely recreational than its higher-profile neighbour. Where White Bear Lake has a yacht club and a walkable downtown, Bald Eagle is organised around open water, boating and watersports. Prices cited by area brokerages run roughly $750,000 to $3–5 million depending on lot and shoreline.`,
        lifestyle_text: `Muskellunge is a genuine regional draw here, alongside walleye described as above-average in abundance with some larger fish, plus largemouth bass, northern pike, crappie, bluegill and perch. Winter panfishing is popular. Bald Eagle–Otter Lake Regional Park provides a fishing pier, playground and picnic facilities alongside the boat ramp.

White Bear Lake city is minutes south with a walkable downtown, restaurants, retail and medical. The northeast metro and both downtowns are within easy reach. You get metro convenience with a more recreational, less formal lake.`,
        notable_features: `Built for boating — open water and watersports rather than the lake-town identity of neighbouring White Bear
Muskellunge fishery called out as a regional draw
Bald Eagle–Otter Lake Regional Park — fishing pier, playground and picnic facilities at the public access
1,049 acres with 9 miles of shoreline, minutes from the northeast metro
Active Bald Eagle Area Association funding weed control, AIS prevention and launch inspections through member dues`,
        real_estate_context: `Typical property types: Waterfront homes ranging from mid-market to genuinely high-end. Less stratified by municipality than White Bear Lake, which makes it a simpler market to shop.

What drives price here: Frontage, lot size and exposure across a broad, shallow basin. Buyers frequently cross-shop with White Bear Lake, and understanding the difference between the two is most of the value an agent adds here.

Set clarity expectations. Bald Eagle grades C (Fair) at 5.6 feet — noticeably murkier than White Bear Lake next door, which grades A at 14.4 feet. Zebra mussels arrived in 2018, and the association notes they have the potential to increase clarity over time — but that is a future possibility, not a current condition, and shouldn't be sold as one. What Bald Eagle offers is open water, a good fishery and a more recreational feel at a different price point.`,
        seasons_text: `Year-round metro demand, with boating-driven interest concentrated spring through summer.`,
        faq: [
            { q: 'How big and deep is Bald Eagle Lake?', a: '1,049 acres with about 9 miles of shoreline, a maximum depth of 36 feet and an average of 13 — a broad, relatively shallow basin.' },
            { q: 'How clear is the water?', a: "Fair. Clarity measured 5.6 feet with a C grade, eutrophic, and a declining trend in recent years. It's noticeably murkier than White Bear Lake next door." },
            { q: 'How does it compare to White Bear Lake?', a: 'Different character. White Bear has a yacht club, a walkable downtown and much clearer water. Bald Eagle is organised around open-water boating and watersports, with a strong muskie fishery and a different price point.' },
            { q: "What's the fishing like?", a: 'Muskellunge is a regional draw, with walleye described as above-average in abundance, plus largemouth bass, northern pike, crappie, bluegill and perch. Winter panfishing is popular.' },
            { q: 'How is public access?', a: 'Through Bald Eagle–Otter Lake Regional Park, operated by Ramsey County, which includes a boat ramp, fishing pier, playground and picnic facilities.' },
            { q: 'Are there invasive species?', a: 'Zebra mussels have been present since 2018. Eurasian watermilfoil is likely, consistent with other east-metro lakes — confirm the current DNR list with a local agent.' },
            { q: 'Is there a lake association?', a: 'Yes — the Bald Eagle Area Association funds weed control, AIS prevention and boat-launch inspections through member dues.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { surface_acres: 1049, max_depth_ft: 36, mean_depth_ft: 13, water_clarity_ft: 5.6 },
    },
    {
        slug: 'big-sandy-lake', kind: 'lake',
        name: 'Big Sandy Lake', geo: 'Aitkin County; Mississippi headwaters region',
        seo_title: 'Big Sandy Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Big Sandy Lake homes for sale near McGregor, Minnesota. 6,500 acres, 84 ft deep, 25 islands, strong walleye. Get matched with a local agent — free, no commission.',
        intro_text: '6,500 acres and 25 islands on the Mississippi headwaters, nine miles north of McGregor — a working walleye lake with real history. Get matched with an agent who knows it.',
        description: `Big Sandy Lake sits in Aitkin County in east-central Minnesota, about nine miles north of McGregor and roughly two and a half hours from the Twin Cities — closer to Duluth, at about an hour. It's part of the Mississippi headwaters system, and has been since an Army Corps dam made it a reservoir in 1895.

Big Sandy covers roughly 6,100–6,500 acres depending on the source, with a maximum depth of 84 feet. Shoreline is reported between 46 and 57 miles — the range reflects how many bays and islands the lake has rather than measurement error. Average depth is not published; don't quote one.

A mix of legacy cabins, year-round homes, and the historic Big Sandy Lodge & Resort. The lake has 25 islands, and extensive wild-rice beds along the south, west and northwest shores that limit both development and boat traffic in those bays — which some buyers consider the best thing about it.`,
        lifestyle_text: `Walleye is the headline fishery, alongside northern pike, bass, muskie and panfish. The islands make for genuinely good exploring by boat, the wild-rice bays are a draw for waterfowl and quiet paddling, and the dam campground area anchors summer activity.

McGregor (about nine miles) covers groceries and basics; Aitkin and Grand Rapids are the larger service towns. Duluth is about an hour, which makes Big Sandy unusually convenient for a lake with this much north-woods character.`,
        notable_features: `25 islands — unusual for a lake this size and a real character feature
Mississippi headwaters reservoir — the 1895 Army Corps dam still controls the lake
Extensive wild rice beds on three shores, which limit development and boat traffic
Sandy Lake Tragedy memorial at the dam campground — significant Ojibwe history
Active Big Sandy Lake Association`,
        real_estate_context: `Typical property types: Legacy cabins, renovated year-round homes, a smaller number of newer builds, and island property. Entry pricing is generally friendlier than the Brainerd-area lakes.

What drives price here: Frontage type matters more here than usual — wild-rice frontage boats and swims very differently from clean sand or gravel. Island views, depth off the dock, and whether a property is genuinely four-season are the other big variables.

Be honest about the water. Big Sandy is a eutrophic lake on Minnesota's impaired-waters list for phosphorus, with summer clarity typically under about 6.6 feet and natural tannin colour from the surrounding peatlands. It is not a clear-water lake, and a buyer expecting one will be disappointed on arrival. What it is: a big, characterful, island-rich walleye lake at a lower entry price than the marquee lakes — and buyers who want that should hear it framed that way, not discover it themselves.`,
        seasons_text: `Listings cluster in late spring and summer. The wild-rice bays and shallower water mean ice-out and freeze-up timing shape the usable season more than on deeper lakes.`,
        faq: [
            { q: 'How big is Big Sandy Lake?', a: 'Roughly 6,100–6,500 acres depending on the source, with 25 islands and between 46 and 57 miles of shoreline.' },
            { q: 'How deep is it?', a: "Maximum depth is 84 feet. Average depth isn't published by the DNR, so treat any figure you see quoted with caution." },
            { q: "What's the water clarity like?", a: "Honestly, this is Big Sandy's weak point. It's a eutrophic lake on the state's impaired-waters list for phosphorus, with summer clarity usually under about 6.6 feet and natural tannin colour from surrounding peatlands. It fishes very well; it doesn't look like Ten Mile." },
            { q: 'What fish are in Big Sandy Lake?', a: 'Walleye leads, with northern pike, largemouth and smallmouth bass, muskie, crappie, bluegill and burbot also present.' },
            { q: 'What are the islands like?', a: "There are 25 of them, and they're a genuine feature — they break up the lake, create protected water, and a small number are privately owned." },
            { q: 'How far is it from the Twin Cities?', a: 'About two and a half hours to McGregor. Duluth is roughly an hour, which is unusually close for a lake with this much north-woods feel.' },
            { q: 'Is there a lake association?', a: 'Yes — the Big Sandy Lake Association is active and a good first call for anyone buying here.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { max_depth_ft: 84 },
    },
    {
        slug: 'burntside-lake', kind: 'lake',
        name: 'Burntside Lake', geo: 'St. Louis County; Ely / BWCAW region',
        seo_title: 'Burntside Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Burntside Lake homes for sale near Ely, Minnesota. 7,100+ acres, 126 ft deep, 20 ft clarity, 100+ islands on the edge of the Boundary Waters. Get matched free.',
        intro_text: 'Over 100 islands, 20-foot clarity, and a shoreline hemmed in by the Boundary Waters and Superior National Forest. Private lakeshore here cannot expand. Get matched with an agent who knows it.',
        description: `Burntside Lake lies three miles northwest of Ely in St. Louis County, roughly two hours from Duluth and four from the Twin Cities. It borders the Boundary Waters Canoe Area Wilderness and is ringed by Superior National Forest and Burntside State Forest land.

Burntside covers roughly 7,139–7,314 acres with a maximum depth of 126 feet and about 103 miles of shoreline — an enormous figure driven by more than 100 islands, roughly 28 of them named. A 2003 reading recorded clarity at 20.7 feet.

Rugged, wooded and low-density. Two historic log-cabin resorts have operated continuously since the early 1900s — Burntside Lodge (1913) and Camp Van Vac (1918) — both with original hand-scribed cabins. The private market skews toward estates and island property rather than dense cabin development.`,
        lifestyle_text: `Lake trout is the signature fishery — genuinely unusual — alongside walleye, northern pike, smallmouth bass, burbot and whitefish. Beyond fishing it's paddling, island camping, and direct access to Boundary Waters country. Ely supplies outfitters, restaurants and the North American Bear Center.

Ely is three miles away and is a real town — outfitters, restaurants, grocery, clinic, and a genuine year-round community built around wilderness access. That combination of true wilderness water with a functioning town nearby is rare.`,
        notable_features: `Borders the BWCAW and is surrounded by Superior National Forest and Burntside State Forest
100+ islands, roughly 28 named — the defining feature of the lake
Two islands (Snellman and Pine) are Scientific and Natural Areas; Long Island was acquired for conservation by the Trust for Public Land
Lake trout fishery at 126 feet deep with 20-foot clarity
Historic Burntside Lodge (1913) and Camp Van Vac (1918), both still operating`,
        real_estate_context: `Typical property types: Estate homes, island properties, cabins on wooded lots, and historic resort property. Listings observed have ranged from roughly $710K for a waterfront home to $1.5–2.45M for island estates.

What drives price here: Island versus mainland, road access, dock protection from the rocky shoals, and elevation. As on Kabetogama, the fixed supply of buildable private shoreline is itself a price factor.

The supply story is the real one. National Forest and BWCAW land permanently caps private shoreline on Burntside — the inventory cannot grow. Combined with 20-foot clarity and a lake trout fishery, that's a genuinely defensible scarcity argument, and it's the thing a good agent leads with here.`,
        seasons_text: `Short northern selling season, thin inventory, and access questions (winter road maintenance, boat-only islands) that matter far more than on a metro lake.`,
        faq: [
            { q: 'How big is Burntside Lake?', a: 'Roughly 7,139–7,314 acres depending on the source, with about 103 miles of shoreline and more than 100 islands.' },
            { q: 'How deep and how clear is it?', a: "Maximum depth is 126 feet, and a 2003 reading recorded clarity at 20.7 feet. Average depth isn't published." },
            { q: 'What fish are in Burntside?', a: 'Lake trout is the signature species — unusual in Minnesota — alongside walleye, northern pike, smallmouth bass, burbot, whitefish, crappie and perch.' },
            { q: 'Can you build on Burntside?', a: 'Only on existing private parcels. Superior National Forest, Burntside State Forest and the BWCAW surround the lake, so private shoreline is fixed and cannot expand.' },
            { q: 'Are there islands for sale?', a: 'Occasionally. More than 100 islands sit in the lake and some are privately held, though two (Snellman and Pine) are Scientific and Natural Areas and Long Island is conserved.' },
            { q: 'How is public access?', a: 'Five public boat landings, two of which charge a fee. Landing #1 is gravel with no dock and no trailer access — worth knowing before you plan around it.' },
            { q: 'How far is Ely?', a: 'Three miles. Ely is about two hours from Duluth and roughly four from the Twin Cities.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { max_depth_ft: 126, shoreline_miles: 103 },
    },
    {
        slug: 'christmas-lake', kind: 'lake',
        name: 'Christmas Lake', geo: 'Hennepin and Carver Counties; Shorewood / Chanhassen / Excelsior',
        seo_title: 'Christmas Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Christmas Lake homes for sale in Shorewood, Minnesota. 265 acres, 87 ft deep, 20+ ft clarity — among the clearest lakes in the Twin Cities metro. Get matched free.',
        intro_text: '265 acres, 87 feet deep, and clarity over 20 feet — among the clearest water in the Twin Cities metro, half an hour from downtown. Get matched with an agent who knows it.',
        description: `Christmas Lake straddles Shorewood and Chanhassen just east of Excelsior on MN-7, roughly 18 miles and under 30 minutes from downtown Minneapolis. Small, deep, spring-fed and deliberately low-traffic.

The lake covers about 265–267 acres with 4 miles of shoreline and a maximum depth of 87 feet — remarkably deep for its size. The DNR baseline clarity is 20 feet; the homeowners association recorded 21.5 feet in July 2024. Average depth isn't published.

Low density, high value. The east shore rises on a ridge roughly 90 feet above the water, so many homes sit well above the lake and use motorised carts or trams to reach their docks — a genuinely distinctive feature you won't find on most metro lakes. A Shorewood estate here listed at $2,395,000.`,
        lifestyle_text: `Northern pike, largemouth bass, bluegill and walleye. Rainbow trout were historically stocked but discontinued after 2016 in favour of pike, bass and panfish management. Trumpeter swans have wintered here since 2004. With one small public launch and capped parking, boat traffic stays light — which is a large part of why the clarity holds.

Excelsior is minutes away with restaurants and shops; Chanhassen and Shorewood cover services. Downtown Minneapolis is under half an hour. This is one of the most convenient genuinely clear lakes in Minnesota.`,
        notable_features: `Clarity of 20–21.5 feet — among the clearest water in the metro, verified by both DNR and association readings
87 feet deep on only 265 acres — unusually deep for its size, spring-fed with a sandy bottom
Steep bluff shoreline — a ~90-foot ridge on the east shore means cart or tram access to many docks
Public access deliberately limited — one city launch with parking capped by ordinance, plus a seasonal AIS inspection station
Wintering trumpeter swans since 2004`,
        real_estate_context: `Typical property types: High-end residential lakefront, much of it elevated above the water on the bluff. Only four miles of shoreline on a lake this desirable means inventory is structurally scarce.

What drives price here: Clarity, privacy and proximity. Dock access matters unusually much here — whether a property has practical, level access to the water or requires a tram is a real value variable that doesn't show up on most metro lakes.

One superlative to be careful with. Christmas Lake is genuinely among the clearest lakes in the metro, and both DNR and association data support that. But "most expensive lake in the metro" is not independently corroborated — a widely-cited roundup of Minnesota's priciest lake-home markets named Minnetonka, White Bear, Pleasant, Harriet and Lower Prior, and did not include Christmas Lake. Lead with the clarity, which is verifiable. Don't claim the price crown.`,
        seasons_text: `Year-round metro demand against a very small inventory. Listings here are events.`,
        faq: [
            { q: 'How big is Christmas Lake?', a: 'About 265–267 acres with 4 miles of shoreline — small, and deliberately low-traffic.' },
            { q: 'How deep and how clear is it?', a: 'Maximum depth is 87 feet, unusually deep for the acreage. The DNR baseline clarity is 20 feet and the homeowners association recorded 21.5 feet in July 2024 — among the clearest in the metro.' },
            { q: 'Why is the water so clear?', a: 'A combination of depth, spring-fed water, a sandy bottom, and deliberately limited public access — one city launch with parking capped by ordinance keeps boat traffic light.' },
            { q: "What's the shoreline like?", a: 'Distinctive. A ridge roughly 90 feet high runs along the east shore, so many homes sit well above the water and use motorised carts or trams to reach their docks. Dock access is a real thing to evaluate here.' },
            { q: 'Is it the most expensive lake in the metro?', a: "It's frequently described that way, but that specific claim isn't independently verified — a widely-cited roundup of Minnesota's priciest lake markets listed Minnetonka, White Bear, Pleasant, Harriet and Lower Prior, not Christmas Lake. What is verified is the clarity." },
            { q: 'What fish are in the lake?', a: 'Northern pike, largemouth bass, bluegill and walleye. Rainbow trout were stocked historically but discontinued after 2016.' },
            { q: 'Are there invasive species?', a: 'Zebra mussels, which were experimentally treated in 2014–2015, and Eurasian watermilfoil. A seasonal AIS inspection station operates at the launch.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { max_depth_ft: 87, shoreline_miles: 4, water_clarity_ft: 20 },
    },
    {
        slug: 'forest-lake-lake', kind: 'lake',
        name: 'Forest Lake', geo: 'Washington County; City of Forest Lake',
        seo_title: 'Forest Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Forest Lake homes for sale in Washington County, Minnesota. Three connected basins, 2,270 acres, 34 minutes from St. Paul on the I-35 corridor. Get matched free.',
        intro_text: 'Three connected basins, 2,270 acres, each with its own public landing — the exurban option on the I-35 corridor, 34 minutes from St. Paul. Get matched with an agent who knows it.',
        description: `Forest Lake sits in the city of Forest Lake, Washington County, on the I-35 corridor about 26 miles and 34 minutes from downtown St. Paul. It's the furthest out of the metro lakes in this tier — the exurban option, with the commute artery running right past it.

The lake covers about 2,270 acres with a maximum depth of 37 feet and an average of 11 feet. Shoreline figures conflict sharply between sources — 16 miles per one, 6.6 miles per another — so verify before publishing either. Clarity measured about 5.1–5.3 feet, graded C (Fair), eutrophic, ranking 37th of 83 graded lakes in Washington County.

A bifurcated market. Area brokerages describe a "Gold Coast" of luxury estates concentrated on the north shore, with maintenance-free townhomes carrying deeded — not direct — beach and dock access elsewhere. Cited ranges run roughly $850,000–$1,500,000+ on the Gold Coast against $450,000–$750,000 for deeded-access homes.`,
        lifestyle_text: `Walleye and muskellunge are both actively stocked and managed, alongside crappie, bluegill, largemouth bass, northern pike, rock bass and perch. The three-basin structure gives the lake more variety than its acreage suggests — each basin fishes and boats slightly differently.

The city of Forest Lake has full services — grocery, medical, retail, schools — and I-35 puts both downtowns within a reasonable commute. MSP airport is roughly 50 minutes.`,
        notable_features: `Three connected basins (Lakes 1, 2 and 3), each with its own public boat landing
Directly on the I-35 corridor — the primary commuter artery to both downtowns
Stocked walleye and muskie management
A clearly two-tier market — north-shore estates versus deeded-access townhomes
Active Comfort Lake–Forest Lake Watershed District and Forest Lake Lake Association`,
        real_estate_context: `Typical property types: North-shore estate homes, standard waterfront, and maintenance-free townhomes with deeded beach and dock access. The deeded-access product is a genuine entry point to lake living at a lower price.

What drives price here: Which basin, and whether access is direct or deeded. Those two variables explain most of the price spread on this lake. Beyond them: frontage, exposure and lot size.

Two things to be straight about. Clarity is the lake's weakest metric at roughly 5 feet with a C grade — though it still ranks in the upper half of Washington County's graded lakes. And deeded access is not the same as lakefront — a townhome with beach and dock rights is a genuinely good way into lake life, but a buyer should understand exactly what they are and aren't buying before they sign.`,
        seasons_text: `Year-round demand from commuters, with boating-driven interest spring through summer.`,
        faq: [
            { q: 'Is Forest Lake one lake?', a: "Technically it's three connected basins — Lakes 1, 2 and 3 — each with its own public boat landing." },
            { q: 'How big and deep is it?', a: 'About 2,270 acres with a maximum depth of 37 feet and an average of 11. Shoreline figures conflict between sources (16 miles versus 6.6), so treat any single number with caution.' },
            { q: 'How far is it from the Twin Cities?', a: 'About 26 miles and 34 minutes to downtown St. Paul via I-35E, with MSP airport roughly 50 minutes away.' },
            { q: 'How clear is the water?', a: 'Clarity is the lake\'s weakest metric at around 5 feet, graded C (Fair) and eutrophic — though it still ranks 37th of 83 graded lakes in Washington County, so upper half locally.' },
            { q: "What's the difference between the Gold Coast and deeded-access homes?", a: 'The Gold Coast is a concentration of luxury estates on the north shore. Elsewhere, maintenance-free townhomes carry deeded beach and dock rights rather than direct lakefront — a lower-cost way into lake living, but a genuinely different thing to own.' },
            { q: "What's the fishing like?", a: 'Walleye and muskellunge are both actively stocked and managed, alongside crappie, bluegill, largemouth bass, northern pike, rock bass and perch.' },
            { q: 'Are there invasive species?', a: 'Zebra mussels and Eurasian watermilfoil are both present.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { surface_acres: 2270, max_depth_ft: 37, mean_depth_ft: 11 },
    },
    {
        slug: 'green-lake-spicer', kind: 'lake',
        name: 'Green Lake', geo: 'Kandiyohi County; Spicer / New London',
        seo_title: 'Green Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Green Lake homes for sale in Spicer, Minnesota. 5,500 acres, 110 ft deep, 14 ft clarity in Kandiyohi County. Get matched with a local agent — free, no commission.',
        intro_text: '110 feet deep and 5,500 acres, two hours west of the Cities — one of the largest, deepest lakes in west-central Minnesota. Get matched with an agent who knows it.',
        description: `Green Lake sits in Kandiyohi County with Spicer and New London directly on its shores, about two hours west of the Twin Cities on US-12. It is one of the largest and by far the deepest lake in west-central Minnesota.

Green Lake covers roughly 5,560–5,569 acres with 12 miles of shoreline. Maximum depth is 110 feet — exceptional for this part of the state — with an average of 21 feet. Clarity measured 14.1 feet, fourth-best among Kandiyohi County's monitored lakes, graded A (Excellent), mesotrophic.

Historically a resort lake reached by passenger rail from the Cities — the Teepeetonka Hotel, Interlachen Lodge and the landmark Spicer Castle (1895) drew Twin Cities visitors for decades. Today the shoreline has largely converted from seasonal resort cabins to year-round residential homes, with waterfront running from roughly $350,000 to past $1 million.`,
        lifestyle_text: `Walleye, northern pike, bass, crappie, bluegill and channel catfish. Green Lake historically held an abundant cisco population, though gillnet surveys show a steep decline from 1994 to 2023 — a coldwater indicator worth understanding. Spicer and New London supply dining, marinas and a genuine lake-town summer.

Spicer and New London are real lake towns with restaurants, marinas and services; Willmar is the regional centre about fifteen minutes away with hospital and full retail. Two hours from the Cities makes this a weekend lake, not a commuter one.`,
        notable_features: `110 feet deep — exceptional depth for west-central Minnesota
Spicer and New London both sit directly on the lake
Historic Twin Cities resort destination reached by passenger rail; Spicer Castle (1895) stood until 2020
Five public boat launches — more public access than most lakes of this size
An A water-quality grade at 14.1 feet clarity, though officially impaired for mercury and chlorides`,
        real_estate_context: `Typical property types: Converted resort-era cabins, year-round residential homes, and newer waterfront builds. The conversion from seasonal to year-round is still underway, which creates a range of both condition and price.

What drives price here: Depth off the dock, exposure, and which shore you're on. Condition varies widely because so much of the stock is converted resort-era housing — inspection matters more here than on a newer lake.

Two things to raise. The lake carries official impairments for mercury and chlorides (salinity) despite its A clarity grade, and phosphorus and algae have trended up from 2020–2025. Neither is a reason to avoid Green Lake — it remains one of the best lakes in the region — but a buyer should hear it from their agent rather than from a water-quality report later.`,
        seasons_text: `Weekend and vacation demand from the Twin Cities, concentrated spring through summer.`,
        faq: [
            { q: 'How big and deep is Green Lake?', a: 'Roughly 5,560–5,569 acres with 12 miles of shoreline, a maximum depth of 110 feet and an average of 21 feet — by far the deepest lake in west-central Minnesota.' },
            { q: 'How clear is the water?', a: 'Clarity measured 14.1 feet, fourth-best among monitored lakes in Kandiyohi County, with an A (Excellent) grade.' },
            { q: 'Is there anything to know about water quality?', a: 'Yes, and it\'s worth knowing up front. Despite the A clarity grade, the lake is officially impaired for mercury and for salinity/chlorides, and phosphorus and algae have trended upward from 2020 to 2025.' },
            { q: 'What fish are in Green Lake?', a: 'Walleye, northern pike, largemouth and smallmouth bass, crappie, bluegill and channel catfish. The historic cisco population has declined steeply since the 1990s.' },
            { q: 'What towns are on the lake?', a: 'Spicer and New London sit directly on the shore. Willmar, about fifteen minutes away, is the regional centre.' },
            { q: 'How far is it from the Twin Cities?', a: 'About two hours west via US-12 — a weekend lake rather than a commuter lake.' },
            { q: 'How is public access?', a: 'Five public boat launches, which is generous for a lake this size.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { max_depth_ft: 110, mean_depth_ft: 21, shoreline_miles: 12, water_clarity_ft: 14.1 },
    },
    {
        slug: 'lake-kabetogama', kind: 'lake',
        name: 'Lake Kabetogama', geo: 'St. Louis County; Voyageurs National Park region',
        seo_title: 'Lake Kabetogama Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Kabetogama homes for sale in Voyageurs National Park country, northern Minnesota. 24,000+ acres, protected shoreline, walleye water. Get matched free.',
        intro_text: "A national-park lake on Minnesota's northern edge — 24,000+ acres, 191 miles of mostly protected shoreline, and a finite supply of private lakeshore. Get matched with an agent who knows it.",
        description: `Lake Kabetogama sits in St. Louis County on Minnesota's northern border, forming a core boundary of Voyageurs National Park. The community of Kabetogama on the south shore is the park's quieter gateway — International Falls is about 28 miles away, Duluth roughly three hours, and the Twin Cities close to five. This is the far north: boreal forest, granite shoreline, and a lake where much of what you see will never be built on.

Kabetogama covers roughly 24,000–25,800 acres (sources vary), with a maximum depth near 80 feet and an average around 30 feet. Shoreline runs about 191 miles — an enormous figure for the acreage, because the lake is a maze of bays, points and islands rather than a single open basin.

This is the defining fact for buyers: most of Kabetogama's shoreline lies inside Voyageurs National Park and is federally protected and undeveloped. Private lakeshore is concentrated along the south shore near the Kabetogama community, mixed with historic fishing resorts. There is no road network through the park itself — much of the lake is reached by boat only. The result is a small, fixed inventory of private property on a very large lake.`,
        lifestyle_text: `Fishing is the anchor — walleye, northern pike, smallmouth bass, and lake trout among 17 documented species, including lake sturgeon. Beyond that it's boating, island exploring, paddling, and in winter, ice fishing and snowmobiling on a lake that connects into the broader Rainy Lake system. Voyageurs is one of the darkest-sky parks in the region, and the northern lights are a genuine draw.

The Kabetogama community provides resorts, guides, and basic services. International Falls (~28 miles) has grocery, medical, and hardware. This is a lake where you plan trips to town rather than run out for milk — that trade-off is exactly what buyers here are choosing.`,
        notable_features: `Voyageurs National Park shoreline — one of very few Minnesota lakes where a national park abuts private lakeshore
191 miles of shoreline across a bay-and-island geography, most of it permanently wild
17 fish species including lake sturgeon and lake trout
Boat-access-only character across much of the lake — genuine remoteness within a drive of the Twin Cities`,
        real_estate_context: `Typical property types: Historic resort cabins, seasonal cabins on the south shore, a small number of year-round homes, and island properties reached only by boat. Inventory is thin by metropolitan standards — this is a lake where the right listing appears a few times a year.

What drives price here: road access versus boat-only access, whether the property is winterised, dock and harbour protection from open-water wind, and proximity to the Kabetogama community services.

The supply argument — and it's real. Because National Park land caps the shoreline, the private inventory on Kabetogama cannot expand. That's a genuine scarcity story, and it's the single most important thing an agent should explain to a buyer here.`,
        seasons_text: `Listings cluster into the short northern selling season. Winter access, road maintenance, and whether a property is truly four-season are questions that matter far more here than on a metro lake.`,
        faq: [
            { q: 'How big is Lake Kabetogama?', a: 'Roughly 24,000–25,800 acres depending on the source, with about 191 miles of shoreline across a bay-and-island geography.' },
            { q: 'How deep is it?', a: 'Maximum depth around 80 feet, averaging about 30 feet.' },
            { q: 'Can you actually buy property on Kabetogama?', a: 'Yes — but private shoreline is limited and concentrated on the south shore, because most of the lake\'s edge is inside Voyageurs National Park and permanently undeveloped. That makes inventory small and scarce.' },
            { q: 'What fish are in Lake Kabetogama?', a: 'Walleye, northern pike, smallmouth bass and lake trout lead a list of 17 documented species that also includes lake sturgeon, sauger, crappie and whitefish.' },
            { q: 'Is it boat-access only?', a: 'Much of the lake is. Road-accessible private property exists mainly along the south shore near the Kabetogama community. Access type is one of the biggest price and lifestyle variables here.' },
            { q: 'How far is it from the Twin Cities?', a: "Roughly five hours' drive. International Falls is about 28 miles away; Duluth is about three hours." },
            { q: 'Are there water-level or access issues to know about?', a: 'Levels on Kabetogama are managed under an international rule-curve system shared with Rainy Lake, which affects shoreline and dock conditions seasonally. Spiny waterflea is present in the lake. A local agent should walk you through both.' },
            { q: 'How do I see new Kabetogama listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { max_depth_ft: 80, mean_depth_ft: 30, shoreline_miles: 191 },
    },
    {
        slug: 'lake-le-homme-dieu', kind: 'lake',
        name: 'Lake Le Homme Dieu', geo: 'Douglas County; Alexandria Chain of Lakes',
        seo_title: 'Lake Le Homme Dieu Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Le Homme Dieu homes for sale in Alexandria, Minnesota. 1,800 acres, 85 ft deep, core Alexandria Chain lake with boat access to Carlos and Geneva. Get matched free.',
        intro_text: "A core lake on the Alexandria Chain — boat straight through to Carlos, Geneva, Darling and beyond, from a lake that's effectively in town. Get matched with an agent who knows it.",
        description: `Le Homme Dieu sits directly on Alexandria's northeast boundary in Douglas County — effectively an in-town lake, about two and a half hours from the Twin Cities. Its name comes from the French L'homme de Dieu, "man of God."

The lake covers about 1,801 acres with 10 miles of shoreline. Maximum depth is 85 feet, averaging 19 feet. Clarity measured 13.1 feet, with an A (Excellent) grade, mesotrophic — though monitoring shows a declining trend from 2020–2025 worth keeping an eye on.

More developed and generally higher-end than the outlying Douglas County lakes, because of the combination of in-town convenience and Chain access. Wooded shoreline, gentle bays, established lake homes.`,
        lifestyle_text: `Boating is the point. Le Homme Dieu connects by channel to Lake Carlos and Lake Geneva, and onward through the Chain to Darling, Victoria and Jessie — a full day's cruising without ever trailering. Walleye, pike, bass, crappie and bluegill fish well; a 2023 DNR survey documented 24 species. Theatre L'Homme Dieu, one of Minnesota's oldest continuously operating summer theatres, sits on the north shore.

Alexandria is right there: hospital, full retail, restaurants, golf, marine service and an airport. Very few Minnesota lakes combine genuine chain boating with a town this convenient.`,
        notable_features: `Core Alexandria Chain lake — direct channel access to Carlos and Geneva, and onward to Darling, Victoria and Jessie
The full Chain runs to 11–12 interconnected lakes and roughly 60 miles of combined shoreline
85 feet deep with an A water-quality grade
Theatre L'Homme Dieu on the north shore — operating since the 1960s
Effectively in Alexandria — hospital, retail and restaurants minutes away`,
        real_estate_context: `Typical property types: Established lake homes, some legacy cabins, and higher-end waterfront. Chain access plus in-town location supports pricing above the standalone Douglas County lakes.

What drives price here: Chain access is the single biggest value driver here. Beyond that: frontage quality, depth off the dock, which bay you're in, and proximity to the channels.

Chain membership is the whole pitch — make sure it's real. Buyers shopping Alexandria often can't tell which lakes actually connect. Le Homme Dieu genuinely does, with channels to Carlos and Geneva. Nearby Lake Miltona, by contrast, does not connect to anything. Being precise about this is one of the most useful things an Alexandria agent does.`,
        seasons_text: `Spring through summer, with strong demand from Twin Cities weekend buyers. In-town location supports some year-round interest.`,
        faq: [
            { q: 'How big is Lake Le Homme Dieu?', a: 'About 1,801 acres with 10 miles of shoreline. Maximum depth is 85 feet, averaging 19 feet.' },
            { q: 'Is it part of the Alexandria Chain of Lakes?', a: "Yes — it's a core member, with direct channel connections to Lake Carlos and Lake Geneva, and onward through the Chain to Darling, Victoria and Jessie. The full Chain covers 11–12 interconnected lakes and roughly 60 miles of combined shoreline." },
            { q: 'How clear is the water?', a: 'Clarity measured 13.1 feet with an A (Excellent) grade. Monitoring does show a declining trend from 2020 to 2025, which is worth asking a local agent about.' },
            { q: 'What fish are in the lake?', a: 'Walleye, northern pike, largemouth and smallmouth bass, crappie and bluegill lead; a 2023 DNR biological survey documented 24 species in total.' },
            { q: 'How close is Alexandria?', a: "The lake sits on Alexandria's northeast boundary — it's effectively an in-town lake, with hospital, retail, restaurants and marine service minutes away." },
            { q: 'How is public access?', a: 'Only two known public boat launches, which is relatively low public pressure for a chain lake.' },
            { q: "What's Theatre L'Homme Dieu?", a: "One of Minnesota's oldest continuously operating summer theatres, on the lake's north shore since the 1960s." },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { surface_acres: 1801, max_depth_ft: 85, mean_depth_ft: 19, shoreline_miles: 10, water_clarity_ft: 13.1 },
    },
    {
        slug: 'lake-miltona', kind: 'lake',
        name: 'Lake Miltona', geo: 'Douglas County; Alexandria region',
        seo_title: 'Lake Miltona Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Miltona homes for sale near Alexandria, Minnesota. 5,700 acres, 105 ft deep, 18.7 ft clarity, strong muskie fishery. Get matched with a local agent — free.',
        intro_text: "Douglas County's largest lake — 5,700 acres, 105 feet deep, and clarity near 19 feet. A separate lake from the Alexandria Chain, and quieter for it. Get matched with an agent who knows it.",
        description: `Lake Miltona sits in Douglas County about 11 miles north of Alexandria, roughly two and a half hours from the Twin Cities. It is the largest lake in Douglas County — and, importantly, a standalone lake rather than part of the Alexandria Chain.

Miltona covers about 5,724–5,731 acres, roughly seven miles long, with 15–17 miles of shoreline. Maximum depth is 105 feet, and clarity measured 18.7 feet through 2025 sampling — tenth-best of 37 monitored lakes in the county, and rated A (Excellent), mesotrophic. Nearly half the basin is under 15 feet deep.

Largely wooded, non-suburban shoreline — a mix of year-round homes and traditional cabins, with several resorts operating on the lake. This is classic up-north cabin country that happens to sit twenty minutes from a real city.`,
        lifestyle_text: `The muskie fishery is the standout — fish over 50 inches are documented and the current regulation carries a 54-inch minimum. Walleye, pike, bass, crappie and bluegill round it out. Large hard-stem bulrush beds support the fishery. Alexandria supplies golf, dining and everything else.

Alexandria, about 11 miles south, is a full regional centre — hospital, retail, restaurants, golf and marine service. Miltona itself is small. The combination gives you quiet water with real services close by.`,
        notable_features: `Largest lake in Douglas County at roughly 5,700 acres
105 feet deep with clarity near 19 feet — an A water-quality grade
Trophy muskie fishery — 50-inch-plus fish documented, 54-inch minimum in force
NOT part of the Alexandria Chain — a separate lake with its own character and no boat connection to Carlos or Le Homme Dieu
Clarity has improved since zebra mussels arrived in 2012 — a genuinely mixed blessing worth understanding`,
        real_estate_context: `Typical property types: Year-round lake homes, traditional cabins, and resort property on wooded lots. Generally more accessible pricing than the in-town Alexandria Chain lakes.

What drives price here: Frontage quality and depth off the dock — remember nearly half the basin is under 15 feet. Exposure across the lake's seven-mile length, and whether a property is genuinely four-season.

Be explicit that Miltona is not on the Chain. Buyers shopping the Alexandria area often assume every big lake connects. Miltona doesn't — there is no boat access from here to Carlos, Le Homme Dieu, Darling or the rest. For some buyers that's a dealbreaker; for others, the quieter water is exactly the point. Either way they should hear it from you, not discover it with a boat in the water.`,
        seasons_text: `Weekend and vacation demand, not commuter demand — Alexandria is over two hours from the Cities. Spring and summer carry the inventory.`,
        faq: [
            { q: 'How big is Lake Miltona?', a: 'About 5,724–5,731 acres, making it the largest lake in Douglas County, with 15–17 miles of shoreline.' },
            { q: 'Is Lake Miltona part of the Alexandria Chain of Lakes?', a: 'No. This is the most common misconception about the lake. Miltona is a separate, standalone lake — there is no boat connection to Carlos, Le Homme Dieu, Darling or the other Chain lakes.' },
            { q: 'How deep and how clear is it?', a: 'Maximum depth is 105 feet, with clarity measured at 18.7 feet and an A (Excellent) water-quality grade. Nearly half the basin, though, is under 15 feet deep.' },
            { q: "What's the fishing like?", a: 'The muskie fishery is the headline — fish over 50 inches are documented and there\'s a 54-inch minimum. Walleye, northern pike, bass, crappie and bluegill are also present.' },
            { q: 'How far is Alexandria?', a: 'About 11 miles south. Alexandria has a hospital, full retail, golf and marine service. The Twin Cities are roughly two and a half hours.' },
            { q: 'Are there invasive species?', a: 'Zebra mussels arrived in 2012. Water clarity has actually improved since — a genuinely mixed outcome, and worth discussing with a local agent.' },
            { q: 'How is public access?', a: 'Three known public boat launches, with limited parking at the west access.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { max_depth_ft: 105, water_clarity_ft: 18.7 },
    },
    {
        slug: 'lake-minnewashta', kind: 'lake',
        name: 'Lake Minnewashta', geo: 'Carver County; Chanhassen / Excelsior',
        seo_title: 'Lake Minnewashta Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Minnewashta homes for sale in Chanhassen, Minnesota. 680 acres, 70 ft deep, A-grade water clarity, 20 minutes from Minneapolis. Get matched with an agent — free.',
        intro_text: '680 acres, 70 feet deep, and the best water clarity of any lake in this comparison — 20 minutes from Minneapolis. Get matched with an agent who knows it.',
        description: `Lake Minnewashta sits in Chanhassen, Carver County, roughly a mile from Excelsior and about 20 miles — 28 minutes — from downtown Minneapolis via MN-5. It's the closest-in lake in this tier.

Minnewashta is small and deep for its size: 680 acres, 70 feet maximum depth, 15 feet average, with 9 miles of shoreline. Clarity measured 11.5 feet with an A (Excellent) grade — phosphorus 14 µg/L, chlorophyll-a 2.3 µg/L, second-best of 38 monitored lakes in Carver County.

Private residential shoreline within the City of Chanhassen, plus the 340-acre Lake Minnewashta Regional Park occupying the east shore with trails, a swimming beach and a boat ramp. The specific lot-size and home-tier mix isn't well documented publicly — a local agent is the right source.`,
        lifestyle_text: `Walleye, largemouth bass, northern pike, crappie, bluegill and perch. The lake hosts an annual waterski show. With only two public launches for 680 acres, boat traffic is comparatively light — one reason clarity holds.

Chanhassen and Excelsior between them cover restaurants, retail, groceries and schools, and downtown Minneapolis is under half an hour. This is metro living with a genuinely clear lake attached.`,
        notable_features: `A-grade water clarity at 11.5 feet — the best in this metro comparison, and materially clearer than Lake Waconia
20 minutes from downtown Minneapolis — the closest-in lake on this tier
70 feet deep despite being only 680 acres
340-acre Lake Minnewashta Regional Park on the east shore — permanent public green space, not future development
Only two public launches — low public pressure for its size`,
        real_estate_context: `Typical property types: Private residential lakefront within Chanhassen. Small lake, limited frontage, and a regional park occupying a full shore means the private inventory is inherently small.

What drives price here: Clarity and proximity are the premium. Frontage, elevation and which shore you're on drive the rest. With only 9 miles of shoreline and a third of it parkland, supply is structurally tight.

One live issue worth knowing before you buy. As of late 2025, Chanhassen was petitioning the DNR to raise the slow-no-wake trigger elevation from 945.0 to 945.5 feet, after residents reported losing 34 boating days over two years — including repeated Fourth of July disruption to the annual waterski show — to high-water no-wake restrictions. A 120-day DNR review was pending. If reliable boating season matters to you, ask a local agent where that stands now.`,
        seasons_text: `Year-round metro demand. Inventory is thin simply because the lake is small.`,
        faq: [
            { q: 'How far is Lake Minnewashta from Minneapolis?', a: 'About 20 miles, roughly 28 minutes via MN-5 — the closest-in lake in this comparison.' },
            { q: 'How big and deep is it?', a: '680 acres with 9 miles of shoreline, 70 feet maximum depth and 15 feet average — deep for its size.' },
            { q: 'How clear is the water?', a: 'Very. Clarity measured 11.5 feet with an A (Excellent) grade, second-best of 38 monitored lakes in Carver County and materially clearer than nearby Lake Waconia.' },
            { q: 'Is there a boating restriction issue?', a: 'There has been. Residents reported losing 34 boating days over two years to high-water slow-no-wake restrictions, and as of late 2025 Chanhassen was petitioning the DNR to raise the trigger elevation. Ask a local agent where that review landed.' },
            { q: 'What fish are in the lake?', a: 'Walleye, largemouth bass, northern pike, crappie, bluegill, perch, rock bass and bullhead.' },
            { q: 'How much of the shoreline is public?', a: 'The 340-acre Lake Minnewashta Regional Park occupies the east shore, with trails, a swimming beach and a boat ramp. The rest is private residential within Chanhassen.' },
            { q: 'Are there invasive species?', a: 'Curly-leaf pondweed and Eurasian watermilfoil, both actively treated by the Lake Minnewashta Preservation Association. Shoreline owners may clear a 15-foot access path through aquatic vegetation without a DNR permit.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { surface_acres: 680, max_depth_ft: 70, mean_depth_ft: 15, shoreline_miles: 9, water_clarity_ft: 11.5 },
    },
    {
        slug: 'lake-minnewaska', kind: 'lake',
        name: 'Lake Minnewaska', geo: 'Pope County; Glenwood / Starbuck',
        seo_title: 'Lake Minnewaska Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Minnewaska homes for sale in Glenwood, Minnesota. 8,000 acres in Pope County, rolling hills and bluffs, walleye and muskie. Get matched with a local agent — free.',
        intro_text: "8,000 acres ringed by rolling hills and rocky bluffs — Minnesota's thirteenth-largest lake, and unusually dramatic country for the region. Get matched with an agent who knows it.",
        description: `Lake Minnewaska sits in Pope County with Glenwood on its east end and Starbuck on its west, about two and a half hours from the Twin Cities via I-94. It's the largest lake on this tier by surface area.

Minnewaska covers roughly 8,050 acres with 20 miles of shoreline — but it's a large, shallow basin: maximum depth is only 32 feet, averaging 17 feet. Clarity measured 11 feet, second-best of 20 monitored lakes in Pope County, graded A (Excellent), mesotrophic.

Glenwood and Starbuck bracket the lake, and the surrounding country is unusually varied — rocky cliffs and rolling hills rather than the flat prairie-lake norm for this part of Minnesota. The specific mix of cabins versus estate homes isn't well documented; a local agent is the right source on that.`,
        lifestyle_text: `Walleye, northern pike, bass, muskie, bluegill, crappie and perch. The shallow, large basin makes for excellent sailing and open-water boating. Glacial Lakes State Park is nearby, near Starbuck — a genuine area amenity, though it sits on Mud Lake rather than Minnewaska itself.

Glenwood is the larger of the two, with retail, dining and services; Starbuck anchors the west end. Alexandria is about half an hour north for a hospital and full retail. I-94 makes the run from the Cities straightforward.`,
        notable_features: `Roughly 8,050 acres — the largest lake on this tier
Rocky cliffs and rolling hills — genuinely dramatic topography for west-central Minnesota
Glenwood and Starbuck bracket the lake, both with services
Name from Dakota mni waste, "good water"
Glacial Lakes State Park nearby (on Mud Lake, near Starbuck)`,
        real_estate_context: `Typical property types: Cabins, year-round homes, and lakefront in and around both towns. Documentation on the cabin-versus-estate mix is thin — treat any generalisation with caution and defer to a local agent.

What drives price here: Exposure matters here more than usual — 8,000 acres and 20 miles of shoreline means real fetch and real wind. Depth off the dock is the other one; this is a shallow lake and not every frontage works for every boat.

A shallow lake, and buyers should know it. At 32 feet maximum and 17 feet average, Minnewaska is large but not deep — which shapes water temperature, weed growth and how the lake fishes. Eurasian watermilfoil, starry stonewort and zebra mussels are all present. That's a meaningful invasive-species load and should be discussed openly before an offer.`,
        seasons_text: `Weekend and vacation demand, spring through summer. Two and a half hours from the Cities puts this firmly out of commuter range.`,
        faq: [
            { q: 'How big is Lake Minnewaska?', a: 'Roughly 8,050 acres with about 20 miles of shoreline — one of the largest lakes in west-central Minnesota.' },
            { q: 'How deep is it?', a: "Not very, relative to its size — maximum depth is 32 feet and the average is 17. It's a large, shallow basin." },
            { q: 'How clear is the water?', a: 'Clarity measured 11 feet, second-best of 20 monitored lakes in Pope County, with an A (Excellent) grade.' },
            { q: 'What fish are in Lake Minnewaska?', a: 'Walleye, northern pike, largemouth and smallmouth bass, muskie, bluegill, crappie and yellow perch.' },
            { q: 'What towns are on the lake?', a: 'Glenwood at the east end and Starbuck at the west. Alexandria is about half an hour north for a hospital and full retail.' },
            { q: 'Is Glacial Lakes State Park on Minnewaska?', a: "No — it's nearby, near Starbuck, but sits on Mud Lake. It's a genuine area amenity, just not lakefront on Minnewaska." },
            { q: 'Are there invasive species?', a: "Yes, and it's a meaningful list: Eurasian watermilfoil, starry stonewort and zebra mussels are all present. Worth discussing with a local agent before you buy." },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { surface_acres: 8050, max_depth_ft: 32, mean_depth_ft: 17, shoreline_miles: 20, water_clarity_ft: 11 },
    },
    {
        slug: 'lake-osakis', kind: 'lake',
        name: 'Lake Osakis', geo: 'Todd and Douglas Counties; Alexandria region',
        seo_title: 'Lake Osakis Homes for Sale | MN Lake Homes',
        seo_description: "Lake Osakis homes for sale in Todd and Douglas counties, Minnesota. 6,300 acres, 73 ft deep, the DNR's walleye brood-stock lake. Get matched with a local agent — free.",
        intro_text: "6,300 acres of proven walleye water — the DNR's own brood-stock lake, and holder of two state fishing records. Two hours from the Cities. Get matched with an agent who knows it.",
        description: `Lake Osakis straddles the Todd and Douglas county line in west-central Minnesota, with the city of Osakis on its southwest shore. It's about two hours from the Twin Cities, and sits between Alexandria and Sauk Centre — an easy weekend lake rather than a far-north expedition.

Osakis covers roughly 6,270–6,389 acres, about 11 miles long and 3.5 miles across at its widest, with 27 miles of shoreline. Maximum depth is 73 feet and average depth about 20 feet.

A working recreational lake — resorts, campgrounds, cabins and year-round homes in a rolling, wooded setting. Osakis has never been an estate lake, and that's precisely why it offers a lower entry point than the Alexandria chain twenty minutes north.`,
        lifestyle_text: `Fishing, first and foremost. Osakis is known as the "Mother Lake" because the DNR uses it as a walleye brood-stock source for stocking across the state. It also holds two current Minnesota state records — bluegill (1 lb 13 oz) and yellow bullhead (3 lb 10 oz). Extensive bulrush beds, mid-lake flats and rocky bars give it real structure.

The city of Osakis covers everyday needs; Alexandria (about 20 minutes) is the regional centre with hospital, full retail and marine service. Sauk Centre and I-94 are close, which makes the drive from the Cities straightforward.`,
        notable_features: `The DNR's walleye brood-stock lake — the "Mother Lake" that stocks the rest of Minnesota
Two current state fishing records — bluegill and yellow bullhead
73 feet deep with 27 miles of shoreline and extensive bulrush beds
Straddles the Todd/Douglas county line — an unusual administrative split worth knowing at closing
Tighter-than-default fishing regulations (10-fish sunfish limit, 15-inch walleye minimum) reflecting active management`,
        real_estate_context: `Typical property types: Cabins, year-round homes, resort and campground property. Entry pricing is meaningfully below the Alexandria chain, which is the main reason buyers look here.

What drives price here: Frontage type — bulrush versus clean sand — matters a great deal for docking and swimming. Exposure to the lake's 11-mile fetch is the other big one; the wind runs on Osakis.

Set clarity expectations honestly. Osakis experiences periodic algal blooms with clarity dropping below about 3.5 feet during them. Zebra mussels were detected in 2017. This is a superb fishing lake at an accessible price, not a clear-water swimming lake — buyers who are told that up front tend to be happy; buyers who find out in August do not.`,
        seasons_text: `Spring and early summer carry the inventory. Fishing-driven demand means this lake shows better to buyers in May than in a late-summer bloom.`,
        faq: [
            { q: 'How big is Lake Osakis?', a: 'Roughly 6,270–6,389 acres — about 11 miles long and 3.5 miles wide, with 27 miles of shoreline.' },
            { q: 'How deep is it?', a: 'Maximum depth is 73 feet, with an average around 20 feet.' },
            { q: 'Why is it called the Mother Lake?', a: 'Because the Minnesota DNR uses Osakis as a walleye brood-stock source — fish from here are used to stock lakes across the state.' },
            { q: 'What fish are in Lake Osakis?', a: 'Walleye above all, plus northern pike, largemouth and smallmouth bass, crappie, bluegill, perch and cisco. The lake holds the current state records for bluegill and yellow bullhead.' },
            { q: "What's the water clarity like?", a: "Variable and seasonally weak — periodic algal blooms can drop clarity below about 3.5 feet. It's an excellent fishing lake rather than a clear-water swimming lake." },
            { q: 'How does it compare to the Alexandria lakes?', a: 'Osakis is about twenty minutes from Alexandria and generally offers a lower entry price than the Alexandria Chain, with a stronger walleye reputation and less estate-level development.' },
            { q: 'Are there invasive species?', a: 'Zebra mussels were detected in 2017. Ask a local agent what that means for docks and lifts.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { max_depth_ft: 73, mean_depth_ft: 20, shoreline_miles: 27 },
    },
    {
        slug: 'lake-waconia', kind: 'lake',
        name: 'Lake Waconia', geo: 'Carver County; Waconia',
        seo_title: 'Lake Waconia Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Waconia homes for sale in Carver County, Minnesota. 3,080 acres, 45 minutes from Minneapolis, trophy muskie and walleye. Get matched with a local agent — free.',
        intro_text: '3,000 acres and a trophy muskie fishery, 45 minutes from Minneapolis — a genuine commuter lake with a historic island park in the middle. Get matched with an agent who knows it.',
        description: `Lake Waconia sits in Carver County with the city of Waconia on its shore, about 33 miles and 45 minutes from Minneapolis via the US-212 corridor. That drive time is the defining fact — this is a lake people live on year-round and commute from, not a weekend cabin lake.

Waconia covers 3,080 acres with 11 miles of shoreline and a maximum depth of 37 feet. Clarity measured 7.3 feet in an August 2022 survey — moderate, eutrophic, graded C (Fair), with a declining trend since 2020.

Suburban and increasingly upscale. The shoreline is organised into platted neighbourhoods — Sandy Shores, Lakeview Terrace, Shores of Lake Waconia — rather than dense old cabin clusters. Listed lakefront has ranged from roughly $535,000 to $2.6–3.4 million.`,
        lifestyle_text: `An actively managed trophy muskie and walleye fishery — walleye stocked biennially, muskie fingerlings annually, with the muskie population described as above-average abundance and larger-than-average size. That's genuinely unusual this close to the metro. Coney Island, a 34-acre island on the National Register of Historic Places, reopened to the public in 2020 after a $1.5M restoration and is reachable only by private boat.

The city of Waconia has grown into a full service town — grocery, medical, restaurants, schools — and St. Bonifacius and Mayer are close. For buyers who want lake life without giving up a metro commute, this is one of the strongest options in the state.`,
        notable_features: `45 minutes from Minneapolis — a true commuter lake
Coney Island of the West — a 34-acre National Register island park, reopened 2020, boat access only
Trophy muskie and walleye actively stocked and managed, unusual this near the metro
3,080 acres with organised platted lakefront neighbourhoods
Part of Lake Waconia Regional Park`,
        real_estate_context: `Typical property types: Suburban lakefront in platted neighbourhoods, higher-end custom waterfront, and some townhome and deeded-access product. Year-round primary residences dominate.

What drives price here: Frontage, exposure and neighbourhood. Because these are primary residences rather than cabins, school district, commute and year-round livability weigh heavily — a different calculus from northern lakes.

The honest trade-off is water clarity. Waconia carries a C (Fair) grade at 7.3 feet, with a declining trend since 2020 — materially less clear than Lake Minnewashta twenty minutes east, which grades A. Buyers comparing metro lakes should hear that comparison plainly. What Waconia offers in return is size, a real fishery, and a proper town.`,
        seasons_text: `Year-round demand, unlike seasonal lakes. Spring listings still dominate but the market doesn't go quiet in October.`,
        faq: [
            { q: 'How far is Lake Waconia from Minneapolis?', a: 'About 33 miles, roughly 45 minutes via US-212 — close enough to commute from year-round.' },
            { q: 'How big and deep is it?', a: '3,080 acres with 11 miles of shoreline and a maximum depth of 37 feet.' },
            { q: 'How clear is the water?', a: "Moderate. An August 2022 survey measured 7.3 feet, graded C (Fair), eutrophic, with a declining trend since 2020. It's less clear than nearby Lake Minnewashta — worth knowing if clarity is your priority." },
            { q: "What's the fishing like?", a: 'Genuinely good for a metro lake. Walleye are stocked biennially and muskie fingerlings annually, with the muskie population described as above-average in both abundance and size.' },
            { q: 'What is Coney Island?', a: 'A 34-acre island in the lake, listed on the National Register of Historic Places, site of a resort from the 1800s to the 1960s. It reopened to the public in 2020 after a $1.5 million restoration and is reachable only by private boat.' },
            { q: "What's the shoreline like?", a: 'Suburban and increasingly upscale — organised platted neighbourhoods rather than old cabin clusters. Listings have ranged from roughly $535,000 to over $2.6 million.' },
            { q: 'How is public access?', a: 'Three known public boat launches, plus Lake Waconia Regional Park.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { surface_acres: 3080, max_depth_ft: 37, shoreline_miles: 11, water_clarity_ft: 7.3 },
    },
    {
        slug: 'pokegama-lake', kind: 'lake',
        name: 'Pokegama Lake', geo: 'Itasca County; Grand Rapids area',
        seo_title: 'Pokegama Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Pokegama Lake homes for sale near Grand Rapids, Minnesota. 6,600 acres, 112 ft deep, 15 ft clarity, muskie and walleye. Get matched with a local agent — free.',
        intro_text: '6,600 acres and 112 feet deep, five minutes from Grand Rapids — a developed, full-service lake with a serious muskie fishery. Get matched with an agent who knows it.',
        description: `Pokegama Lake sits in Itasca County about five miles south of Grand Rapids, roughly three hours north of the Twin Cities and 80 miles from Duluth. Unlike most northern lakes of this size, it has a full-service regional city on its doorstep — that combination is the whole pitch.

Pokegama covers about 6,612 acres with a maximum depth of 112 feet and roughly 57 miles of shoreline. Recorded clarity was 15 feet in a June 2010 reading — genuinely clear for a lake this developed. Littoral area is about 1,978 acres.

The most developed lake in its class. A 2011 association management plan counted 1,254 residential parcels covering 72% of the shoreline, plus 12 resorts. This is a subdivision-and-resort lake next to a working city, not a wilderness lake — and buyers should choose it for that, not despite it.`,
        lifestyle_text: `Muskie and walleye drive the fishing reputation, with pike, bass, perch, crappie, tullibee, whitefish and even lake trout also present. Two public swimming beaches (Sugar Sand and Tioga) and seven public launches make it an easy lake to use. Grand Rapids supplies everything else.

Grand Rapids is a genuine regional centre — hospital, grocery, hardware, marine service, restaurants, and the Forest History Center. For buyers who want lake life without planning trips to town, Pokegama is one of the strongest options in northern Minnesota.`,
        notable_features: `112 feet deep with roughly 15-foot clarity — deep and clear for a developed lake
Five minutes from Grand Rapids — full grocery, medical, hardware and marine service
Part of a small dam-controlled chain — Jay Gould, Little Jay Gould, Blackwater and Cut-Off connect via the 1884 Pokegama Dam
Seven public launches and two public beaches — high access density
Three Aquatic Management Areas (98.4 acres) protect specific spawning and wetland parcels from development`,
        real_estate_context: `Typical property types: Established year-round lake homes, subdivision lots, legacy cabins, and resort property. Because the shoreline is 72% developed, inventory turns over more predictably here than on lakes with fewer parcels.

What drives price here: Depth off the dock, exposure, and which basin or bay you're on. Proximity to Grand Rapids supports year-round demand, which tends to steady pricing relative to purely seasonal lakes.

Two things to disclose early. Both zebra mussels and starry stonewort are present — starry stonewort was confirmed by the DNR in June 2024. That's an ongoing maintenance and treatment reality for shoreline owners, and it should come up before an offer, not after an inspection.`,
        seasons_text: `Year-round demand from the Grand Rapids market softens the seasonal swing you see on purely recreational lakes. Spring and summer still carry the most inventory.`,
        faq: [
            { q: 'How big is Pokegama Lake?', a: 'About 6,612 acres with roughly 57 miles of shoreline and a littoral area near 1,978 acres.' },
            { q: 'How deep is Pokegama Lake?', a: "Maximum depth is 112 feet — one of the deeper lakes in the region. Average depth isn't published." },
            { q: 'How clear is the water?', a: 'A June 2010 reading recorded 15 feet of clarity, which is good for a lake this developed.' },
            { q: 'What fish are in Pokegama?', a: 'Muskie and walleye lead the reputation, with northern pike, largemouth and smallmouth bass, perch, bluegill, crappie, tullibee, whitefish and lake trout also present.' },
            { q: 'How developed is the shoreline?', a: "Very. A 2011 association plan counted 1,254 residential parcels across 72% of the shoreline plus 12 resorts. If you want remote, this isn't the lake — if you want a real lake with a city nearby, it's one of the best." },
            { q: 'Are there invasive species?', a: 'Yes — both zebra mussels and starry stonewort, the latter confirmed by the DNR in June 2024. Ask a local agent what that means for docks, lifts and treatment costs.' },
            { q: 'Is it part of a chain?', a: 'Yes, a small one — Jay Gould, Little Jay Gould, Blackwater and Cut-Off lakes connect via the Pokegama Dam.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { surface_acres: 6612, max_depth_ft: 112, shoreline_miles: 57, littoral_acres: 1978 },
    },
    {
        slug: 'prior-lake-lake', kind: 'lake',
        name: 'Prior Lake', geo: 'Scott County; City of Prior Lake',
        seo_title: 'Prior Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Prior Lake homes for sale in Scott County, Minnesota. Upper and Lower basins, 1,340+ acres, 35 minutes from Minneapolis. Get matched with a local agent — free.',
        intro_text: "Two basins, over 1,340 acres, joined by a navigable channel — 35 minutes from Minneapolis and named among Minnesota's priciest lake markets. Get matched with an agent who knows it.",
        description: `Prior Lake sits inside the city of Prior Lake in Scott County, about 25 miles and 35 minutes from downtown Minneapolis via I-35W. The city had a population of 27,617 at the 2020 census — this is an established suburb, not a cabin destination.

Prior Lake is two connected basins. Upper Prior runs roughly 354–386 acres, 50 feet deep, with 6 miles of shoreline. Lower Prior runs roughly 810–956 acres, 60 feet deep, with 15 miles of shoreline. The City describes the combined system as over 1,340 acres. Clarity: Upper grades C at 5 feet; Lower grades C at 10 feet.

Established suburban lakefront within an incorporated city — a built-out residential shoreline rather than rural or cabin character, ranging from standard suburban waterfront to genuinely high-end. Lower Prior Lake has been named alongside Minnetonka, White Bear, Pleasant and Lake Harriet among Minnesota's most expensive lake-home markets.`,
        lifestyle_text: `Walleye is the primary managed and stocked species (every other year), with largemouth bass, northern pike, crappie, bluegill, white bass and perch. Boating is the main draw, and the channel between basins means you can run both from one dock.

The city of Prior Lake has full services, schools and retail, with the whole southwest metro within reach. Mystic Lake is nearby. This is suburban living with real water attached.`,
        notable_features: `Two basins joined by a navigable channel under Eagle Creek Avenue (County Hwy 21) — you can boat between them
35 minutes from downtown Minneapolis — full commuter distance
Lower Prior named among Minnesota's most expensive lake-home markets
Over 1,340 combined acres inside an incorporated city of 27,000
Active, well-organised Prior Lake Association with published boating rules`,
        real_estate_context: `Typical property types: Suburban lakefront, higher-end waterfront on Lower Prior, and some townhome and deeded-access product. Primary residences dominate.

What drives price here: Which basin matters. Lower Prior is larger, deeper, clearer and generally commands more than Upper. Beyond that: frontage, exposure, and proximity to the connecting channel.

Two things buyers should know before making an offer. First, clarity is only fair — Upper Prior grades C at 5 feet, Lower at 10 feet; this is a suburban lake, not a clear northern one. Second, there is an active no-wake regime: under 5 mph within 150 feet of shore and in marked channels, and the entire lake goes no-wake when water reaches 903.9 feet, with a $500 fine and the restriction lifting only after three consecutive days below that level. If reliable boating matters, understand that rule first.`,
        seasons_text: `Year-round suburban demand. Spring listings dominate but the market stays active.`,
        faq: [
            { q: 'Is Prior Lake one lake or two?', a: 'Two connected basins. Upper Prior flows north into Lower Prior through a navigable channel running under Eagle Creek Avenue, so you can boat between them from one dock.' },
            { q: 'How big are they?', a: 'Upper Prior runs roughly 354–386 acres at 50 feet deep with 6 miles of shoreline; Lower Prior runs roughly 810–956 acres at 60 feet deep with 15 miles. The City describes the combined system as over 1,340 acres.' },
            { q: 'Which basin is better to buy on?', a: "They're different markets. Lower is larger, deeper and clearer, and has been named among Minnesota's most expensive lake-home markets. Upper is smaller and generally more accessible. A local agent should walk you through both." },
            { q: 'How clear is the water?', a: 'Fair, honestly. Upper Prior grades C at 5 feet of clarity; Lower Prior grades C at 10 feet. This is a suburban lake rather than a clear northern one.' },
            { q: 'What are the boating rules?', a: 'Strict and worth understanding. Under 5 mph within 150 feet of any shoreline and in marked channels and bays. The entire lake becomes no-wake when water reaches 903.9 feet, with a $500 fine, lifting only after three consecutive days below that level.' },
            { q: 'How far is it from Minneapolis?', a: 'About 25 miles, roughly 35 minutes via I-35W.' },
            { q: "What's the fishing like?", a: 'Walleye is the primary stocked and managed species, alongside largemouth bass, northern pike, crappie, bluegill, white bass and perch.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { max_depth_ft: 60 },
    },
    {
        slug: 'ten-mile-lake', kind: 'lake',
        name: 'Ten Mile Lake', geo: 'Cass County; Leech Lake region',
        seo_title: 'Ten Mile Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Ten Mile Lake homes for sale near Hackensack, Minnesota. 5,000 acres, 208 ft deep, 21+ ft clarity — one of the clearest lakes in the state. Get matched free.',
        intro_text: 'The third-deepest lake in Minnesota, with clarity that regularly tops 21 feet. Spring-fed, quiet, and largely private. Get matched with an agent who knows it.',
        description: `Ten Mile Lake sits in Cass County, northwest of Hackensack and just south of Walker, about three and a half hours from the Twin Cities. It's in the heart of the Leech Lake region but has an entirely different character from its bigger neighbour — deeper, clearer, and much quieter.

Ten Mile covers roughly 5,046 acres with about 25 miles of shoreline, and it is genuinely exceptional in one respect: at 208 feet, it is the third-deepest lake in Minnesota. Clarity readings frequently exceed 21 feet. Littoral area is only 1,316 acres — most of this lake is deep water.

Mostly private, lower-density, wooded shoreline. A handful of resorts operate here, but Ten Mile is not a resort lake in the way Gull is — it's a lake people buy into and keep. The Ten Mile Lake Association is active and well organised.`,
        lifestyle_text: `Fishing is different here because the lake is different — alongside walleye, pike, bass and panfish, Ten Mile holds lake whitefish, cisco, and a distinctive dwarf cisco population estimated in the millions. Clear, deep, cold water also makes it a genuinely good swimming and paddling lake.

Hackensack and Walker are the nearest towns — Walker in particular has full services, medical, and the Leech Lake economy behind it. Close enough to be practical, far enough that Ten Mile stays quiet.`,
        notable_features: `Third-deepest lake in Minnesota at 208 feet
Clarity regularly over 21 feet — spring-fed, oligotrophic to mesotrophic
A DNR Sentinel Lake — one of only 25 statewide under long-term intensive monitoring
Supports the highest-quality lake whitefish population of all 25 Sentinel Lakes, with fish aged to 62 years
Headwaters of the Boy River paddling route toward Boy and Woman Lakes`,
        real_estate_context: `Typical property types: Private lake homes and cabins on wooded lots, a small resort presence, and very limited turnover. This is a lake where families hold property for generations, which keeps inventory tight.

What drives price here: Clarity and depth are the premium here, and buyers know it. Frontage quality, exposure, and elevation above the water drive price — as does the simple fact that listings are infrequent.

The clarity is the asset, and it's under active watch. Zebra mussel larvae were detected in October 2019 and spiny waterflea is a stated concern, with residents taking precautions. Ten Mile's whole value proposition rests on water quality, so the association's AIS work is directly relevant to property values — worth understanding before you buy, and worth supporting after.`,
        seasons_text: `Thin, seasonal inventory. When good frontage lists here it can move quickly, and buyers who aren't set up to act often miss it.`,
        faq: [
            { q: 'How big is Ten Mile Lake?', a: 'About 5,046 acres with roughly 25 miles of shoreline. Littoral area is only 1,316 acres — most of the lake is deep water.' },
            { q: 'How deep is Ten Mile Lake?', a: '208 feet at its deepest, which makes it the third-deepest lake in Minnesota.' },
            { q: 'How clear is the water?', a: "Exceptionally clear — secchi readings often top 21 feet. It's spring-fed and classified oligotrophic to mesotrophic." },
            { q: 'What fish are in Ten Mile?', a: 'Walleye, northern pike, largemouth and smallmouth bass, bluegill, crappie and perch, plus lake whitefish, cisco, and a distinctive dwarf cisco population estimated at 5–8 million fish.' },
            { q: "What's a Sentinel Lake?", a: "It's a DNR designation — Ten Mile is one of only 25 lakes statewide under long-term intensive monitoring. It also supports the highest-quality lake whitefish population of all 25." },
            { q: 'Are there invasive species?', a: 'Zebra mussel larvae were detected in October 2019 and spiny waterflea is a concern. Given that clarity is this lake\'s main asset, the association takes AIS seriously and buyers should too.' },
            { q: 'Is inventory tight?', a: 'Yes. Shoreline is largely private, families hold property for a long time, and listings are infrequent. Being set up to move quickly matters more here than on most lakes.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { surface_acres: 5046, max_depth_ft: 208, shoreline_miles: 25, littoral_acres: 1316 },
    },
    {
        slug: 'white-bear-lake', kind: 'lake',
        name: 'White Bear Lake', geo: 'Ramsey and Washington Counties; White Bear Lake / Mahtomedi / Dellwood',
        seo_title: 'White Bear Lake Homes for Sale | MN Lake Homes',
        seo_description: 'White Bear Lake homes for sale in Ramsey County, Minnesota. 2,428 acres, 83 ft deep, 14 ft clarity, 16 minutes from St. Paul. Get matched with a local agent — free.',
        intro_text: "2,400 acres, 83 feet deep, and a walkable lake town 16 minutes from downtown St. Paul — one of the metro's classic addresses. Get matched with an agent who knows it.",
        description: `White Bear Lake sits on the Ramsey–Washington county line, with the city of White Bear Lake, Mahtomedi and Dellwood all on its shores. Downtown St. Paul is 12 miles and about 16 minutes via I-35E — this is a fully metro lake with a genuine lake-town identity.

The lake covers 2,428 acres with 14 miles of shoreline, a maximum depth of 83 feet and an average of 20 feet. Clarity measured 14.4 feet with an A (Excellent) grade, mesotrophic, ranked fifth of 75 lakes in Washington County.

Distinctly stratified by neighbourhood, and buyers should understand the difference. Dellwood is estate-scale homes on wooded, elevated lots — one of Minnesota's wealthiest cities, large-lot zoning, properties that rarely come to market. Mahtomedi mixes early-1900s cottages on small lots with newer luxury custom builds, and has a public sand beach. Downtown White Bear Lake has historic housing stock beside a walkable commercial district. The White Bear Yacht Club anchors a real sailing culture.`,
        lifestyle_text: `Muskie is the signature fishery and is specifically attributed to the lake's clarity, alongside walleye, pike, bass, crappie, bluegill, perch and white bass. Sailing is a genuine institution here. The walkable downtown — restaurants, shops — is unusual among metro lakes and a large part of the appeal.

The city of White Bear Lake is a proper town — walkable downtown, restaurants, shops, schools, medical. Mahtomedi and Dellwood add their own character. Very few metro lakes offer this much genuine town life on the water.`,
        notable_features: `16 minutes to downtown St. Paul with a real lake-town downtown attached
83 feet deep with 14.4-foot clarity and an A grade
Three distinct submarkets — Dellwood estates, Mahtomedi cottages-and-customs, and the historic city
Muskie fishery tied directly to the lake's clarity
White Bear Yacht Club and an established sailing culture`,
        real_estate_context: `Typical property types: Estate homes (Dellwood), early-1900s cottages and new custom builds (Mahtomedi), historic housing near downtown. Three quite different markets on one lake.

What drives price here: Which shore and which municipality you're in matters more here than on almost any other Minnesota lake. Dellwood, Mahtomedi and the city are separate markets with separate price behaviour and separate inventory dynamics.

You have to talk about the water level. White Bear Lake has a documented, litigated history of level decline — a recorded low of 918.8 feet in January 2013 against a 1943 high of 926.7. Homeowner associations sued the DNR in 2012 over groundwater pumping; a 2014 settlement stalled on funding, a 2017 district court ruling restricted new groundwater permits within five miles, and appeals continued through 2020 and a May 2024 administrative ruling. This is not resolved. It is genuinely relevant to anyone buying shoreline here, and an agent who doesn't raise it isn't doing the job. It has not stopped White Bear from being one of the metro's most desirable addresses — but buyers deserve the full picture.`,
        seasons_text: `Year-round metro demand. Dellwood inventory in particular is scarce and can sit dormant for long stretches.`,
        faq: [
            { q: 'How far is White Bear Lake from St. Paul?', a: 'About 12 miles, roughly 16 minutes via I-35E.' },
            { q: 'How big and deep is it?', a: '2,428 acres with 14 miles of shoreline, 83 feet maximum depth and about 20 feet average.' },
            { q: 'How clear is the water?', a: 'Clarity measured 14.4 feet with an A (Excellent) grade — fifth of 75 lakes in Washington County. Monitoring does show a declining trend over recent years.' },
            { q: "What's the story with the lake's water level?", a: "It's a real and ongoing issue. Levels hit a recorded low of 918.8 feet in 2013 against a 1943 high of 926.7. Homeowner groups sued the DNR in 2012 over groundwater pumping near the lake; a 2014 settlement stalled on funding, a 2017 court ruling restricted new groundwater permits within five miles, and litigation and administrative rulings continued through 2024. It is not fully resolved — ask your agent for the current position." },
            { q: "What's the difference between Dellwood, Mahtomedi and White Bear Lake?", a: "They're three genuinely different markets. Dellwood is estate-scale homes on large wooded lots and one of Minnesota's wealthiest cities. Mahtomedi mixes early-1900s cottages with newer luxury builds and has a public beach. The city of White Bear Lake has historic housing beside a walkable downtown." },
            { q: "What's the fishing like?", a: 'Muskie is the signature species, attributed to the lake\'s clarity, alongside walleye, northern pike, bass, crappie, bluegill, perch and white bass.' },
            { q: 'How is public access?', a: 'Three public boat launches. Zebra mussels and Eurasian watermilfoil are both present.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        stats: { surface_acres: 2428, max_depth_ft: 83, mean_depth_ft: 20, shoreline_miles: 14, water_clarity_ft: 14.4 },
    },
];

module.exports = { LAKES };
