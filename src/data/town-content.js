/**
 * town-content.js — curated long-form content for individual town pages.
 *
 * Applied at boot by seedTownContent() in src/server.js. Mirrors the
 * standalone content-lift scripts (e.g. scripts/lakes/detroit-lakes-town-
 * content-lift.js) but runs on deploy so a push publishes the town without
 * a manual Render-shell step. Each entry is matched to an existing tags row
 * by slug; the seed only fills rows that haven't been curated yet (empty
 * hero_image_url) so later admin edits are never clobbered.
 *
 * `description` is one blob of paragraphs (split on blank lines by the
 * town template into the three about-section slots), same as Detroit Lakes.
 */

const EXCELSIOR_OVERVIEW = `Excelsior is a small city of about 2,400 residents in Hennepin County, sitting on the south shore of Lake Minnetonka roughly 20 miles west of downtown Minneapolis. It was founded in 1853 and named for the Longfellow poem — and unlike a lot of lake destinations, it has stayed a real, walkable town rather than a strip of resorts. You can park once and walk to the water, to dinner, to the farmers market, and back.

The heart of it is Water Street: a compact historic downtown of boutiques, restaurants, and coffee shops that runs down toward the lake. At the bottom sits the Excelsior Commons, a 12-acre lakefront park with a swimming beach and a bandshell, and the Port of Excelsior, home dock of the restored 1906 streetcar steamboat Minnehaha. That combination — a genuine downtown you can walk to the water from — is rare on Lake Minnetonka and is most of why Excelsior holds the value it does.

This is a year-round community, not a summer-only town. It's served by Minnetonka Public Schools (ISD 276), one of the top-ranked districts in Minnesota, and it's an easy commute to the metro via Highway 7. Neighboring lake towns — Shorewood, Tonka Bay, Greenwood, Deephaven, Chanhassen, and Victoria — are all within a few minutes, which makes Excelsior a natural base for buyers shopping the south shore of the lake.`;

const EXCELSIOR_REAL_ESTATE = `Excelsior real estate covers a wide spread on a small footprint. There are historic in-town Victorians and cottages walkable to Water Street, mid-century and rebuilt lake homes on the south-shore bays of Lake Minnetonka (Excelsior Bay, St. Albans Bay, Gideons Bay), and newer luxury construction tucked onto the most protected shoreline.

Lakefront commands a steep premium here — the south shore is one of the most established and tightly held markets on the whole lake. But the walk-to-town, non-lakefront homes are their own sought-after category, precisely because that walkability is hard to find anywhere else on Minnetonka. Buyers who want the lake lifestyle without the lakefront price tag often start in Excelsior for exactly that reason.

Inventory is tight and competitive. Spring brings the most listings; turn-key lakefront and walk-to-town homes tend to move fast and frequently draw multiple offers. Working with an agent who knows the south-shore bays bay by bay matters more here than the listing photos will ever tell you.`;

const EXCELSIOR_LIFESTYLE = `Day to day, Excelsior earns its reputation. Water Street anchors the food and drink scene — Maynard's on the water, Bacio, Coalition, Jake O'Connor's, and Adele's frozen custard in summer, with Excelsior Bay Books as the downtown's long-running independent bookstore. The Commons beach and the bandshell concerts are the social center of summer, and the Thursday farmers market keeps downtown busy through the season.

The calendar carries the year: Art on the Lake in June, Apple Day in the fall, fireworks over the lake, and the Old Log Theatre — one of the oldest professional theaters in the country — just up the road. Boating life centers on the Port of Excelsior and the historic Steamboat Minnehaha, with the rest of Lake Minnetonka's 14,000-plus acres and 100-plus miles of shoreline a short cruise away. The Dakota Rail Regional Trail runs right through town for biking and walking.

It's a place that works in February as well as July — the downtown stays open, the schools and services are real, and the lake is the backyard rather than the whole point.`;

const NISSWA_OVERVIEW = `Nisswa is a small city of about 2,000 year-round residents in Crow Wing County, sitting in the middle of the Brainerd Lakes area roughly two and a half hours north of the Twin Cities. In summer that number multiplies — this is one of Minnesota's signature resort-and-cabin destinations, and Nisswa is its walkable downtown. The compact shopping district locals call Nisswa Square is the social center: boutiques, coffee, and ice cream within a few blocks, plus the Nisswa Turtle Races every Wednesday in summer, a decades-old tradition that draws hundreds of kids to the waterfront.

The town sits on the Gull Lake chain — Gull, Nisswa, Clark, and Roy lakes — with Pelican Lake and the Whitefish Chain a short drive north. The paved Paul Bunyan State Trail runs straight through town. Neighbors Pequot Lakes, Brainerd, Baxter, and Crosslake are all close, and destination resorts like Grand View Lodge anchor the area's tourism economy.

What sets Nisswa apart from a cabin in the middle of nowhere is that it's a real, walkable town wrapped around resort lakes — you can boat all afternoon and walk to dinner and ice cream at night.`;

const NISSWA_REAL_ESTATE = `The Nisswa area is one of the most active second-home and lake-home markets in the state. You'll see everything from original 1960s cabins to fully rebuilt year-round lake homes and luxury estates on Gull Lake's most desirable frontage.

Gull Lake commands the premium — big open water, a lively boating scene, and a deep luxury tier — while the smaller chain lakes and off-water homes near downtown offer more accessible entry points. Inventory is seasonal and competitive: listings cluster in spring, the best frontage moves fast (often before it hits the portals), and the buyer pool is heavily second-home, so timing and a local specialist who knows the chain matter more than the listing photos suggest.`;

const NISSWA_LIFESTYLE = `Summers run on the lake and the trail — boating and watersports on Gull, biking the paved Paul Bunyan Trail, and golf at destination courses like The Pines and The Preserve at Grand View. Downtown keeps it social with the Turtle Races, Stonehouse Coffee, the Last Turn Saloon, and lakeside spots like Zorbaz.

Winter brings snowmobiling, ice fishing, and a quieter pace, but the town doesn't shut down the way resort-only spots do. It's resort country with a genuine downtown — the reason buyers keep choosing Nisswa.`;

const WALKER_OVERVIEW = `Walker is a small town of about 1,000 year-round residents in Cass County, set on Walker Bay at the south end of Leech Lake — at roughly 112,000 acres, the third-largest lake entirely within Minnesota. This is deep northwoods country, about three and a half hours north of the Twin Cities, ringed by the Chippewa National Forest and within the Leech Lake Band of Ojibwe reservation.

Walker's Main Street is a classic lake-town strip — outfitters, supper clubs, and a protected harbor — and the town leans hard into its identity as a fishing destination. Walleye, muskie, and northern pike are the draw, and Leech Lake's bays (Walker, Agency, Sucker, Steamboat) are legendary water. The Heartland State Trail runs through town, and Northern Lights Casino is just south.

It's the quieter, more rugged end of Minnesota lake country: big water, big woods, and a town that's about the lake first.`;

const WALKER_REAL_ESTATE = `Leech Lake real estate skews more accessible than the metro and Brainerd markets — buyers routinely find solid cabins and lake homes at prices that would be impossible closer to the Cities, with trophy deep-water frontage reaching into the higher tiers. Expect original cabins, modernized year-round homes, and a smaller luxury segment on the best shoreline.

One Walker-specific wrinkle: federal (Chippewa National Forest) and tribal jurisdiction touch parts of the shoreline, so title and access questions are real. Working with a local Leech Lake specialist who knows which parcels carry what isn't optional here — it's the difference between a clean buy and an expensive surprise.`;

const WALKER_LIFESTYLE = `Walker's calendar is built around the water and the woods. Fishing is the year-round constant — open water in summer, ice houses in winter — and the International Eelpout Festival out on the frozen lake is the town's famous (and gloriously weird) winter event. Moondance Jam brings a big summer music crowd.

The rest of the year it's the Chippewa National Forest, the Heartland Trail, the City Park beach, and supper-club dinners. For buyers who want serious water and real wilderness over a polished resort scene, Walker is the trade everyone in the know makes.`;

const WAYZATA_OVERVIEW = `Wayzata is a small, affluent city of about 4,500 residents in Hennepin County, set on the north shore of Lake Minnetonka roughly 15 miles west of downtown Minneapolis. For a town its size it punches well above its weight: a walkable downtown along Lake Street, the historic Great Northern Depot right on the water, and the Wayzata Lake Walk tying it all to the bay. You can park once and move between the lake, lunch, and the shops on foot — a genuine rarity on Minnetonka.

The town grew up around James J. Hill's Great Northern Railway, and that heritage still anchors its identity: the restored depot, the James J. Hill Days festival each September, and a deep sailing culture centered on Wayzata Bay and the Wayzata Yacht Club. It's served by Wayzata Public Schools (ISD 284), consistently among the top-ranked districts in Minnesota, and it borders Orono, Minnetonka Beach, Woodland, and Minnetonka.

Wayzata is the dressed-up end of Lake Minnetonka — refined, walkable, and built around the water.`;

const WAYZATA_REAL_ESTATE = `Wayzata anchors the top of the Lake Minnetonka market — and Minnetonka is the top of the Minnesota lake market, so this is about as high as waterfront pricing goes in the state. Expect historic estates, extensively rebuilt lake homes, and new luxury construction on Wayzata Bay and the protected shoreline toward Ferndale, alongside walk-to-downtown condos and homes that trade at a premium precisely because almost nothing else on the lake is this walkable.

Lakefront here is generational and tightly held; when premier frontage trades, it often does so quietly. Off-water homes within walking distance of Lake Street are their own fierce micro-market. Inventory is thin and competition is real — a specialist who knows Wayzata Bay bay by bay, and the difference between Ferndale and the village, earns their keep here.`;

const WAYZATA_LIFESTYLE = `Downtown is the draw: lakefront dining along Lake Street, boutiques, and the Lake Walk that fills with strollers, runners, and sailors all summer. The Great Northern Depot and the bandshell anchor community events, and James J. Hill Days in September is the signature festival. Boating and sailing on Wayzata Bay define the season, with the Wayzata Yacht Club running regattas all summer.

Beyond the lake, it's a short hop to the western suburbs' trails and golf and to the rest of Minnetonka's 14,000-plus acres. Wayzata is lake life with a tucked-in shirt — polished, social, and walkable in a way the rest of the lake isn't.`;

module.exports = [
    {
        slug: 'excelsior',
        intro_text: "Excelsior pairs a walkable Victorian downtown on Lake Minnetonka's south shore with Water Street charm and the most sought-after waterfront in the Twin Cities.",
        description: [EXCELSIOR_OVERVIEW, EXCELSIOR_REAL_ESTATE, EXCELSIOR_LIFESTYLE].join('\n\n'),
        seo_title: 'Excelsior MN Homes for Sale | MN Lake Homes',
        seo_description: "Excelsior, MN homes for sale. A walkable Victorian downtown on the south shore of Lake Minnetonka — beaches, premier waterfront, and historic charm. Get new listings.",
        hero_image_url: '/assets/images/mn-cape-cod-lakefront.jpg',
    },
    {
        slug: 'wayzata',
        intro_text: "Wayzata is the polished north-shore gateway to Lake Minnetonka — a walkable lakefront downtown wrapped around the most coveted and expensive waterfront in Minnesota.",
        description: [WAYZATA_OVERVIEW, WAYZATA_REAL_ESTATE, WAYZATA_LIFESTYLE].join('\n\n'),
        seo_title: 'Wayzata MN Homes for Sale | MN Lake Homes',
        seo_description: "Wayzata, MN homes for sale. The walkable north-shore gateway to Lake Minnetonka — historic downtown, premier waterfront, and top-ranked schools. Get new listings.",
        hero_image_url: '/assets/images/mn-chateau-aerial.jpg',
    },
    {
        slug: 'nisswa',
        intro_text: "Nisswa is the walkable heart of the Brainerd Lakes — a shop-lined downtown beside the Gull Lake chain, Minnesota's most established and sought-after resort-lake market.",
        description: [NISSWA_OVERVIEW, NISSWA_REAL_ESTATE, NISSWA_LIFESTYLE].join('\n\n'),
        seo_title: 'Nisswa MN Homes for Sale | MN Lake Homes',
        seo_description: "Nisswa, MN homes for sale. The walkable heart of the Brainerd Lakes on the Gull Lake chain — cabins, year-round lake homes, and luxury frontage. Get new listings.",
        hero_image_url: '/assets/images/mn-lodge-lake-house.jpg',
    },
    {
        slug: 'walker',
        intro_text: "Walker is a northwoods fishing town on the south shore of Leech Lake, Minnesota's third-largest, and the walleye-and-cabin gateway to the Chippewa National Forest.",
        description: [WALKER_OVERVIEW, WALKER_REAL_ESTATE, WALKER_LIFESTYLE].join('\n\n'),
        seo_title: 'Walker MN Homes for Sale | MN Lake Homes',
        seo_description: "Walker, MN homes for sale. A northwoods fishing town on Leech Lake — cabins, year-round homes, and frontage near the Chippewa National Forest. Get new listings.",
        hero_image_url: '/assets/images/mn-log-cabin-ducks.jpg',
    },
    {
        slug: 'crosslake',
        intro_text: "Crosslake sits at the center of the Whitefish Chain — 14 connected lakes in the Brainerd Lakes area, with clear water, a walkable town center, and some of the north's most coveted frontage.",
        description: `Crosslake sits at the heart of the Whitefish Chain — 14 connected lakes in the northern reaches of the Brainerd Lakes area, about two and a half hours north of the Twin Cities. It's one of Minnesota's premier resort-and-cabin destinations, with a walkable town center, golf, and a summer economy built entirely around the water.

Real estate on the Whitefish Chain runs from legacy family cabins to fully rebuilt year-round lake homes and luxury estates on the most coveted frontage. The chain's clear water and connected big-lake boating make it one of the most sought-after — and tightly held — markets in the north. Inventory is seasonal and competitive, and the best frontage often sells before it reaches the portals.

Summers run on the chain — boating between the 14 lakes, golf at nearby courses, and a town center with dining and shops. Winter brings ice fishing and snowmobiling, and the community stays lively year-round. For buyers who want big-water boating and a real town in the northwoods, Crosslake is the Brainerd Lakes at their best.`,
        seo_title: 'Crosslake MN Homes for Sale | MN Lake Homes',
        seo_description: "Crosslake, MN homes for sale on the Whitefish Chain — 14 connected lakes in the Brainerd Lakes area, clear water and a walkable town. Get new listings.",
        hero_image_url: '/assets/images/mn-lake-town-sunset-aerial.jpg',
    },
    {
        slug: 'breezy-point',
        intro_text: "Breezy Point is a resort town on Pelican Lake in the Brainerd Lakes — big open water, golf, and a mix of resort condos and lake homes about two hours north of the Cities.",
        description: `Breezy Point is a resort community on Pelican Lake in the Brainerd Lakes area, roughly two hours north of the Twin Cities. Anchored by the long-running Breezy Point Resort, it pairs big open water with destination golf and a summer-resort atmosphere that has drawn Twin Cities families for generations.

The real estate here spans resort condominiums and townhomes to classic cabins and year-round lake homes on Pelican Lake's frontage. It's a heavily second-home market, so listings cluster in spring and the best water moves quickly. The resort setting makes lower-maintenance condo ownership a real option alongside traditional lakefront — a flexibility a lot of northern lakes don't offer.

Life in Breezy Point runs on the lake and the fairways: boating and watersports on Pelican, golf at the resort courses, and an easy resort-town social scene in summer. Winter keeps snowmobiling and ice fishing going. For buyers who want big Brainerd-Lakes water with resort amenities on tap, Breezy Point is a natural fit.`,
        seo_title: 'Breezy Point MN Homes for Sale | MN Lake Homes',
        seo_description: "Breezy Point, MN homes for sale on Pelican Lake — a Brainerd Lakes resort town with big water, golf, and lake homes and condos. Get new listings.",
        hero_image_url: '/assets/images/mn-purple-sunset-marina.webp',
    },
    {
        slug: 'glenwood',
        intro_text: "Glenwood wraps around Lake Minnewaska, Minnesota's 13th-largest lake, in west-central Minnesota — a classic lake town with a big-water shoreline and a walkable main street.",
        description: `Glenwood sits on the shore of Lake Minnewaska, Minnesota's 13th-largest lake, in the rolling country of west-central Minnesota about two and a half hours from the Twin Cities. It's a genuine lake town — a real main street and year-round community wrapped around big, open water — rather than a summer-only resort strip.

Real estate ranges from in-town homes walkable to downtown and the lakefront park to lake homes and cabins along Minnewaska's shoreline. Because Glenwood is a four-season community with its own services and schools, the market supports year-round living as well as second homes, and prices tend to be more attainable than the metro and Brainerd lakes for comparable water.

Summers center on Lake Minnewaska — boating, fishing, and the town's Waterama festival — with a lakefront beach and park right in town. The surrounding Pope County lakes and rolling terrain add to the appeal. For buyers who want a real lake town on big water without a resort price tag, Glenwood is one of the best values in the region.`,
        seo_title: 'Glenwood MN Homes for Sale | MN Lake Homes',
        seo_description: "Glenwood, MN homes for sale on Lake Minnewaska — a classic west-central Minnesota lake town on big water with a walkable downtown. Get new listings.",
        hero_image_url: '/assets/images/mn-lake-town-street.jpg',
    },
    {
        slug: 'spicer',
        intro_text: "Spicer sits on Green Lake, one of central Minnesota's deepest, clearest lakes, near Willmar — a small resort town with a lakefront beach and a lively summer scene.",
        description: `Spicer is a small lake town on the shore of Green Lake, one of the deepest and clearest lakes in central Minnesota, just north of Willmar and about two hours west of the Twin Cities. Green Lake's exceptional water quality has made Spicer a recreation destination for generations, and the town is built squarely around the lake.

Real estate here is anchored by Green Lake frontage — from classic cabins to rebuilt year-round homes and higher-end waterfront on the most desirable stretches — along with in-town and near-lake homes. The lake's clarity and depth keep demand strong and frontage tightly held; the best water is competitive and often moves fast in spring.

Life in Spicer is the lake: swimming and boating on clean, deep water, a lakefront beach, and a compact downtown with dining and shops. The surrounding Kandiyohi County lakes add to the options. For buyers who want clear, swimmable water and a friendly small lake town, Spicer and Green Lake are a standout in central Minnesota.`,
        seo_title: 'Spicer MN Homes for Sale | MN Lake Homes',
        seo_description: "Spicer, MN homes for sale on Green Lake — a central Minnesota resort town on deep, clear water near Willmar, with a lakefront beach. Get new listings.",
        hero_image_url: '/assets/images/mn-harbor-town.webp',
    },
    {
        slug: 'waconia',
        intro_text: "Waconia wraps around Lake Waconia, the largest lake in the southwest metro — a fast-growing city with a real downtown, an easy Twin Cities commute, and genuine open water.",
        description: `Waconia sits on the shore of Lake Waconia, the largest lake in the southwest Twin Cities metro, in Carver County about 35 miles from downtown Minneapolis. Close enough for a daily commute yet genuinely a lake destination, Waconia has become one of the most sought-after lake communities on the metro's western edge.

Real estate ranges from lakefront homes on Lake Waconia's broad open water to newer construction and established neighborhoods in the growing city. Because Waconia pairs real open-water boating with an easy metro commute, demand is strong from year-round families as well as weekend boaters, and lakefront is competitive — turn-key homes tend to move quickly, especially in spring.

Life here is boating, fishing, and a revitalized downtown. Lake Waconia's big water is excellent for sailing and watersports, historic Coney Island sits near the center of the lake, and the walkable downtown and waterfront keep the social scene close. For buyers who want real lake living within commuting distance of the Cities, Waconia is one of the metro's best options.`,
        seo_title: 'Waconia MN Homes for Sale | MN Lake Homes',
        seo_description: "Waconia, MN homes for sale on Lake Waconia — the largest lake in the southwest metro, with a real downtown and an easy Twin Cities commute. Get new listings.",
        hero_image_url: '/assets/images/mn-stillwater-aerial.webp',
    },
    {
        slug: 'chanhassen',
        intro_text: "Chanhassen is an upscale southwest-metro community built around a string of clear lakes — Minnewashta, Riley, and more — with top schools and a short drive to the Cities.",
        description: `Chanhassen is a sought-after southwest-metro community in Carver County, wrapped around a string of clear lakes including Lake Minnewashta, Lake Riley, and Lotus Lake, about 20 miles from downtown Minneapolis. It consistently ranks among the best places to live in the country, and the combination of lakes, parks, and top schools is a big part of why.

Real estate spans lakefront homes on Minnewashta and the surrounding lakes to upscale neighborhoods and newer construction throughout the city. Lakefront here is tightly held and commands a premium — the clear water and metro-close location keep demand high — while the broader market draws year-round families for the schools and the easy commute. Turn-key lake homes move quickly, especially in spring.

Life in Chanhassen balances the lakes with real amenities: boating and swimming on clear metro water, an extensive park and trail system, a walkable downtown, and the Minnesota Landscape Arboretum nearby. For buyers who want clear-water lake living with big-city convenience and standout schools, Chanhassen is one of the metro's most desirable addresses.`,
        seo_title: 'Chanhassen MN Homes for Sale | MN Lake Homes',
        seo_description: "Chanhassen, MN homes for sale on Lake Minnewashta and nearby lakes — an upscale southwest-metro community with clear water and top schools. Get new listings.",
        hero_image_url: '/assets/images/mn-aerial-small-town.jpg',
    },
    {
        slug: 'orono',
        intro_text: "Orono is the large, low-density community wrapping the north and west shores of Lake Minnetonka — big wooded lots, estate frontage, and some of the most valuable waterfront in Minnesota.",
        description: `Orono spreads across the north and west shores of Lake Minnetonka, a large, low-density community about 20 miles west of Minneapolis. Where the south-shore towns are walkable and compact, Orono is defined by space — big wooded lots, long private driveways, and estate-scale frontage — which is a large part of why it holds some of the highest property values in the state.

Real estate here skews toward the top of the Minnetonka market: substantial lake homes and estates on prime open-water and protected frontage, along with large non-lakefront acreage set back in the woods. Bays and exposure drive value enormously, and the best frontage is tightly held and often trades quietly. Buyers here are usually after privacy and scale as much as the water itself.

Day to day, Orono pairs a rural, wooded feel with quick access to Wayzata's lakefront downtown and the rest of the metro. It's served by the well-regarded Orono schools, and the lake — boating, sailing, and the full sweep of Minnetonka's open water — is the backyard. For buyers who want privacy, land, and premier frontage, Orono is Minnetonka at its most exclusive.`,
        seo_title: 'Orono MN Homes for Sale | Lake Minnetonka Real Estate',
        seo_description: "Orono, MN homes for sale on Lake Minnetonka — big wooded lots and estate frontage on the lake's north and west shores. Get new listings with a local agent.",
        hero_image_url: '/assets/images/mn-lakefront-estate-dusk.jpg',
    },
    {
        slug: 'deephaven',
        intro_text: "Deephaven is an established, wooded community on Lake Minnetonka's south shore — mature neighborhoods, private frontage, and a quiet, old-Minnetonka character.",
        description: `Deephaven sits on the south shore of Lake Minnetonka, one of the lake's most established and understated communities. Wrapped around Carsons Bay, St. Louis Bay, and the wooded Cottagewood neighborhood, it has a mature, settled character — big trees, winding streets, and a sense of old Minnetonka that newer developments can't manufacture.

Real estate ranges from historic lake homes and cottages to rebuilt and newly constructed waterfront on the south shore's protected bays. Frontage here is highly sought after and tightly held, and even the non-lakefront homes command a premium for the neighborhood, the trees, and the walk-to-water pockets like Cottagewood. Inventory is limited and competitive.

Life in Deephaven is quiet and lake-centered — private beaches, the historic Cottagewood store, and easy access to Excelsior and Wayzata for dining and shopping. It's served by the top-ranked Minnetonka schools, and the protected south-shore bays make for calm, family-friendly boating. For buyers who want mature, private, quintessential Minnetonka, Deephaven is hard to beat.`,
        seo_title: 'Deephaven MN Homes for Sale | Lake Minnetonka Real Estate',
        seo_description: "Deephaven, MN homes for sale on Lake Minnetonka's south shore — established wooded neighborhoods and private frontage. Get new listings with a local agent.",
        hero_image_url: '/assets/images/mn-lake-home-dusk.jpg',
    },
    {
        slug: 'tonka-bay',
        intro_text: "Tonka Bay is a small peninsula community surrounded on three sides by Lake Minnetonka — an unusually high share of lakefront and a boating-first way of life.",
        description: `Tonka Bay occupies a narrow peninsula reaching into the south-central part of Lake Minnetonka, surrounded by water on three sides. That geography gives it an unusually high ratio of lakefront to land, and it shapes everything about the community — this is a boating-first, water-on-both-sides kind of place.

Real estate is dominated by lakefront and near-lake homes, from classic Minnetonka cottages to rebuilt and new luxury waterfront on the surrounding bays. Because so much of the town touches the water, frontage is the market here, and it's competitive and tightly held. The peninsula setting means many homes have water views even when they aren't directly on the shore.

Life in Tonka Bay runs on the lake — quick access to the open water, protected bays for calmer days, and a short hop to Excelsior's downtown for dining. It's served by the top-rated Minnetonka schools, and the small, water-wrapped footprint gives it a tight-knit feel. For buyers who want to be on the water in the heart of Minnetonka, Tonka Bay delivers.`,
        seo_title: 'Tonka Bay MN Homes for Sale | Lake Minnetonka Real Estate',
        seo_description: "Tonka Bay, MN homes for sale on Lake Minnetonka — a peninsula community surrounded by water with a high share of lakefront. Get new listings with a local agent.",
        hero_image_url: '/assets/images/mn-lake-dock-golden.jpg',
    },
    {
        slug: 'minnetonka-beach',
        intro_text: "Minnetonka Beach is a tiny, exclusive village on a narrow Lake Minnetonka peninsula — home to the historic Lafayette Club and some of the lake's most prestigious frontage.",
        description: `Minnetonka Beach is one of the smallest and most exclusive communities on Lake Minnetonka — a tiny village occupying a narrow peninsula between Lafayette Bay and Crystal Bay on the lake's north-central shore. Home to the historic Lafayette Club, it has long been one of the lake's most prestigious addresses.

Real estate here is nearly all lakefront or near-lake, and it sits firmly at the top of the Minnetonka market. Expect substantial, well-appointed lake homes and estates on prized open-water and bay frontage. With so few homes in such a sought-after spot, inventory is scarce and closely held — properties here often change hands quietly, and rarely.

Life in Minnetonka Beach is private and lake-centered, anchored by the Lafayette Club's golf and social scene and the open water just off the shore. It's minutes from Wayzata's lakefront downtown and served by the Orono schools. For buyers seeking a small, historic, prestige address on premier Minnetonka frontage, few places compare.`,
        seo_title: 'Minnetonka Beach MN Homes for Sale | Lake Minnetonka',
        seo_description: "Minnetonka Beach, MN homes for sale — a tiny, exclusive Lake Minnetonka peninsula village with prestigious frontage. Get new listings with a local agent.",
        hero_image_url: '/assets/images/mn-lakefront-sunset-dock.jpg',
    },
    {
        slug: 'shorewood',
        intro_text: "Shorewood is a family-friendly community on Lake Minnetonka's south shore — a range of neighborhoods and price points with easy access to Excelsior and the water.",
        description: `Shorewood sits on the south shore of Lake Minnetonka, one of the larger and more family-oriented lake communities. Wrapped around Gideons Bay and neighboring the walkable downtown of Excelsior, it offers a broader range of neighborhoods and price points than the lake's most exclusive enclaves — which makes it a common starting point for buyers who want the Minnetonka lifestyle.

Real estate spans lakefront homes on the south-shore bays to established and newer neighborhoods set back from the water. That range is Shorewood's strength: genuine lakefront alongside more attainable non-lakefront homes that still put the water, the schools, and Excelsior within reach. Lakefront is competitive, while the broader market draws year-round families.

Life in Shorewood balances the lake with everyday convenience — boating and swimming on the south shore, a short trip to Excelsior's Water Street and Commons beach, and top-rated Minnetonka schools. For buyers who want real access to Lake Minnetonka with more flexibility on price, Shorewood is one of the south shore's most practical choices.`,
        seo_title: 'Shorewood MN Homes for Sale | Lake Minnetonka Real Estate',
        seo_description: "Shorewood, MN homes for sale on Lake Minnetonka's south shore — family neighborhoods, lakefront, and a short hop to Excelsior. Get new listings with a local agent.",
        hero_image_url: '/assets/images/mn-lake-home-from-water.jpg',
    },
    {
        slug: 'spring-park',
        intro_text: "Spring Park is a compact community on Lake Minnetonka's west side — marinas, denser lakefront, and one of the more attainable ways onto the lake.",
        description: `Spring Park is a small, compact community on the west side of Lake Minnetonka, wrapped around the water near the West Arm and Black Lake. Denser and more walkable than the sprawling estate towns, it's long been one of the more attainable ways onto Minnetonka — a place to own on the lake without the north-shore estate price tag.

Real estate here includes lakefront homes, townhomes, and condominiums along with near-lake single-family homes, giving buyers a range of entry points that's unusual for Minnetonka. The marinas and denser waterfront make it a boating hub, and the lower-maintenance options appeal to buyers who want the lake without a large property to manage. Inventory moves, and the value proposition keeps demand steady.

Life in Spring Park is lake-forward and low-key — marinas and boat access, quick trips to Mound and Wayzata, and the full open water of Minnetonka just off the shore. It's served by the Westonka schools. For buyers who want to be on Lake Minnetonka at a more accessible price, Spring Park is one of the best doors in.`,
        seo_title: 'Spring Park MN Homes for Sale | Lake Minnetonka Real Estate',
        seo_description: "Spring Park, MN homes for sale on Lake Minnetonka's west side — marinas, condos, and a more attainable way onto the lake. Get new listings with a local agent.",
        hero_image_url: '/assets/images/mn-purple-sunset-marina.webp',
    },
    {
        slug: 'minnetrista',
        intro_text: "Minnetrista wraps the western bays of Lake Minnetonka — larger lots, newer construction, and a mix of lake living and open country on the metro's edge.",
        description: `Minnetrista covers the western reaches of Lake Minnetonka, wrapping Halsted Bay, Jennings Bay, and the quieter west-end water. It's a larger, less-dense community than the eastern lake towns — a mix of lakefront living and open country that appeals to buyers who want space and newer homes near the water.

Real estate here ranges from lakefront on the western bays to large-lot and newer-construction neighborhoods set in the rolling country west of the lake. Because it's less built-out than the south and east shores, Minnetrista offers more room and more new homes, often at a better value per square foot than the lake's most established enclaves — while still delivering genuine Minnetonka frontage on the west end.

Life in Minnetrista balances the lake with a semi-rural feel — boating the quieter western bays, room to spread out, and quick access to Mound, Wayzata, and the metro beyond. It's served by the Westonka schools. For buyers who want newer homes, larger lots, and western Minnetonka water, Minnetrista is the space-and-value end of the lake.`,
        seo_title: 'Minnetrista MN Homes for Sale | Lake Minnetonka Real Estate',
        seo_description: "Minnetrista, MN homes for sale on western Lake Minnetonka — larger lots, newer construction, and quieter bays. Get new listings with a local agent.",
        hero_image_url: '/assets/images/mn-lake-sunset-firepit.jpg',
    },
    {
        slug: 'hackensack',
        intro_text: "Hackensack is a small northwoods town on Birch and Ten Mile lakes, deep in the Chippewa National Forest — clear, deep water and a classic cabin-country main street.",
        description: `Hackensack is a small northwoods town in Cass County, set between Birch Lake and Ten Mile Lake in the heart of the Chippewa National Forest, about three hours north of the Twin Cities. Ten Mile Lake is one of the deepest and clearest lakes in Minnesota, and that water quality is the whole draw here — this is quiet, clear-water cabin country.

Real estate ranges from classic family cabins to rebuilt year-round lake homes on Ten Mile, Birch, and the surrounding lakes. Ten Mile's depth and clarity keep its frontage highly prized and tightly held, while the smaller lakes offer more accessible entry points. Inventory is seasonal and second-home heavy, so the best water tends to move quickly and often quietly.

Life in Hackensack is the lake and the woods — swimming and boating on exceptionally clear water, fishing, and a compact main street with the northwoods charm the area is known for. The Chippewa National Forest and the Paul Bunyan State Trail surround the town. For buyers who want some of the clearest water in the state in a quiet cabin setting, Hackensack and Ten Mile Lake are a rare find.`,
        seo_title: 'Hackensack MN Homes for Sale | Ten Mile Lake Real Estate',
        seo_description: "Hackensack, MN homes for sale on Ten Mile Lake — one of the state's deepest, clearest lakes in the Chippewa National Forest. Get new listings with a local agent.",
        hero_image_url: '/assets/images/mn-clearwater-lakeshore.jpg',
    },
    {
        slug: 'osakis',
        intro_text: "Osakis is a friendly lake town on Lake Osakis, a big, well-known fishing lake between Alexandria and Sauk Centre in west-central Minnesota.",
        description: `Osakis sits on the shore of Lake Osakis, a large, well-known fishing lake straddling Douglas and Todd counties in west-central Minnesota, between Alexandria and Sauk Centre off I-94. It's a genuine small lake town — a real main street and year-round community built around one of the region's classic recreation lakes.

Real estate here is anchored by Lake Osakis frontage — from traditional cabins to year-round lake homes — along with in-town and near-lake houses. The lake's size and reputation for fishing keep demand steady, and prices tend to be more attainable than the Alexandria chain just to the west, which makes Osakis a value option for buyers who want big water without the premium.

Life in Osakis runs on the lake: fishing, boating, and a lakefront park, with an easy-going small-town pace and quick interstate access to Alexandria and St. Cloud. For buyers who want an affordable spot on a big, established fishing lake in central Minnesota, Osakis is a solid pick.`,
        seo_title: 'Osakis MN Homes for Sale | Lake Osakis Real Estate',
        seo_description: "Osakis, MN homes for sale on Lake Osakis — a big, well-known fishing lake between Alexandria and Sauk Centre. Get new listings with a local agent.",
        hero_image_url: '/assets/images/mn-harbor-town.webp',
    },
    {
        slug: 'perham',
        intro_text: "Perham is a thriving small town in the heart of Otter Tail County's lake country — near Otter Tail Lake and dozens of others, with a strong Main Street and resort economy.",
        description: `Perham sits in the middle of Otter Tail County's lake country, one of the most lake-dense regions in Minnesota, about three hours northwest of the Twin Cities. Unlike a lot of resort areas, Perham is a thriving, diversified town — home to real industry and a lively Main Street — set within easy reach of Otter Tail Lake and dozens of others.

Real estate ranges from lakefront homes and cabins on Otter Tail Lake and the surrounding waters to in-town homes in a genuine four-season community. Otter Tail Lake's big, sandy-bottomed water anchors the premium end, while the many smaller lakes nearby offer a wide range of options and price points. The combination of real jobs and abundant lakes keeps the market active year-round.

Life in Perham balances the lakes with a real town — boating and fishing across the county's water, a walkable downtown, and community events that run all year. For buyers who want to be surrounded by lakes while living in a genuine, working town rather than a resort strip, Perham is one of the best bases in Otter Tail County.`,
        seo_title: 'Perham MN Homes for Sale | Otter Tail Lakes Real Estate',
        seo_description: "Perham, MN homes for sale near Otter Tail Lake — the hub of Otter Tail County's lake country, a real town among dozens of lakes. Get new listings.",
        hero_image_url: '/assets/images/mn-lake-town-sunset-aerial.jpg',
    },
    {
        slug: 'pelican-rapids',
        intro_text: "Pelican Rapids is a small, diverse town near Lake Lida and the Pelican River in Otter Tail County's lake country in west-central Minnesota.",
        description: `Pelican Rapids is a small town in Otter Tail County, set on the Pelican River near Lake Lida and a scatter of other lakes in west-central Minnesota, about three and a half hours from the Twin Cities. Known for its striking mix of cultures and its friendly Main Street, it sits right in the heart of the region's lake country.

Real estate here spans lakefront homes and cabins on Lake Lida and the surrounding waters to affordable in-town homes. Lake Lida's clear water makes its frontage the sought-after tier, while the town itself offers some of the more attainable housing in the lakes region. It's a market that appeals to both second-home buyers chasing the water and year-round residents drawn by the value.

Life in Pelican Rapids is small-town and lake-adjacent — fishing and boating on Lida and the nearby lakes, a walkable downtown, and a strong community feel. For buyers who want clear-water lake access with an affordable, genuine town nearby, Pelican Rapids and Lake Lida are a west-central Minnesota value.`,
        seo_title: 'Pelican Rapids MN Homes for Sale | Lake Lida Real Estate',
        seo_description: "Pelican Rapids, MN homes for sale near Lake Lida — clear-water lake country and an affordable small town in Otter Tail County. Get new listings.",
        hero_image_url: '/assets/images/mn-lake-dock-golden.jpg',
    },
    {
        slug: 'battle-lake',
        intro_text: "Battle Lake is a small resort-and-arts town on West Battle Lake, a gateway to Otter Tail County's lakes with a lively summer Main Street.",
        description: `Battle Lake is a small town on the shore of West Battle Lake in Otter Tail County, west-central Minnesota, about three hours from the Twin Cities. It's a classic lake-and-arts town — a compact, walkable Main Street that fills with visitors in summer, set on a clear, popular chain of lakes at the edge of the county's dense lake country.

Real estate is anchored by West Battle Lake and the neighboring lakes — from cabins to year-round lake homes on clear, swimmable frontage — along with in-town homes walkable to the shops and lake. The clear water and the town's charm keep demand strong through the season, and good frontage is competitive, clustering in spring listings.

Life in Battle Lake runs on the lake and the arts — boating and swimming on clear water, a summer Main Street of galleries, shops, and dining, and the wider Otter Tail lakes a short drive in any direction. For buyers who want a genuine small resort town on clear water, Battle Lake is one of the most charming spots in the region.`,
        seo_title: 'Battle Lake MN Homes for Sale | West Battle Lake Real Estate',
        seo_description: "Battle Lake, MN homes for sale on West Battle Lake — a clear-water resort-and-arts town in Otter Tail County's lake country. Get new listings.",
        hero_image_url: '/assets/images/mn-lake-home-from-water.jpg',
    },
    {
        slug: 'pine-river',
        intro_text: "Pine River is the northern gateway to the Whitefish Chain — a small northwoods town on the water in the Brainerd Lakes area with a walkable Main Street.",
        description: `Pine River is a small northwoods town in Cass County, the northern gateway to the Whitefish Chain and the Brainerd Lakes area, about two and a half hours north of the Twin Cities. Set on the Pine River and Norway Lake, it's a genuine small town — walkable Main Street, real services — at the doorstep of one of the north's premier chains of lakes.

Real estate ranges from cabins and year-round homes on Norway Lake and the nearby waters to in-town homes, with the coveted Whitefish Chain just to the south. That proximity is Pine River's advantage: more attainable in-town and small-lake options within easy reach of the big-water boating and clear frontage of the chain. Inventory is seasonal and competitive on the best water.

Life in Pine River is northwoods and lake-forward — boating and fishing, the Paul Bunyan State Trail running through town, and a friendly Main Street. The Whitefish Chain, Crosslake, and the wider Brainerd Lakes are all close. For buyers who want a real town and a more accessible foothold near the Whitefish Chain, Pine River is a smart base.`,
        seo_title: 'Pine River MN Homes for Sale | Whitefish Chain Real Estate',
        seo_description: "Pine River, MN homes for sale — the northern gateway to the Whitefish Chain in the Brainerd Lakes, a walkable northwoods town. Get new listings.",
        hero_image_url: '/assets/images/mn-lake-town-street.jpg',
    },
    {
        slug: 'pequot-lakes',
        intro_text: "Pequot Lakes is a Brainerd Lakes town near Pelican Lake and the Whitefish Chain — resort-and-cabin country with a walkable Main Street and its famous bobber water tower.",
        description: `Pequot Lakes sits in the heart of the Brainerd Lakes area in Crow Wing County, about two and a half hours north of the Twin Cities, near Pelican Lake and within easy reach of the Whitefish Chain. Known for its bobber-topped water tower and a walkable Main Street, it's a classic resort-and-cabin town at the center of one of Minnesota's top lake regions.

Real estate ranges from cabins and year-round lake homes on Pelican Lake and the surrounding waters to in-town homes near the shops and trail. Pelican Lake's big open water anchors the premium end, while smaller lakes and off-water homes offer more accessible options. Like the rest of the Brainerd Lakes, it's a competitive, second-home-heavy market where the best frontage moves fast.

Life in Pequot Lakes is Brainerd-Lakes summer at its best — boating and watersports, golf nearby, the Paul Bunyan State Trail through town, and a lively Main Street. Breezy Point, Nisswa, and Crosslake are all minutes away. For buyers who want a walkable town in the middle of the Brainerd Lakes, Pequot Lakes is a natural fit.`,
        seo_title: 'Pequot Lakes MN Homes for Sale | Brainerd Lakes Real Estate',
        seo_description: "Pequot Lakes, MN homes for sale near Pelican Lake and the Whitefish Chain — a walkable Brainerd Lakes resort town. Get new listings with a local agent.",
        hero_image_url: '/assets/images/mn-aerial-small-town.jpg',
    },
    {
        slug: 'crosby',
        intro_text: "Crosby is a Cuyuna Range town on Serpent Lake — former mining country reborn as a mountain-biking and clear-water lake destination in central Minnesota.",
        description: `Crosby sits on Serpent Lake on the Cuyuna Iron Range in Crow Wing County, about two and a half hours north of the Twin Cities. Once an iron-mining town, it has been reborn as an outdoor destination — the flooded mine pits left behind a string of deep, remarkably clear lakes, and the Cuyuna Country State Recreation Area has made the area a nationally known mountain-biking hub.

Real estate here is anchored by Serpent Lake and the clear Cuyuna mine lakes, from cabins to year-round lake homes, along with an increasingly sought-after in-town market driven by the biking economy. The clear water and the recreation draw have pushed demand up in recent years, while prices still run below the metro and Brainerd markets — a combination that has put Crosby on a lot of buyers' radar.

Life in Crosby blends lake and trail — swimming and boating on clear water, world-class mountain biking out the back door, and a walkable downtown that has grown a real food-and-coffee scene. For buyers who want clear water, a genuine town, and a recreation lifestyle at a relative value, Crosby and Serpent Lake are one of central Minnesota's most interesting markets.`,
        seo_title: 'Crosby MN Homes for Sale | Serpent Lake Real Estate',
        seo_description: "Crosby, MN homes for sale on Serpent Lake — clear Cuyuna Range mine lakes and a mountain-biking town in central Minnesota. Get new listings.",
        hero_image_url: '/assets/images/mn-purple-sunset-marina.webp',
    },
    {
        slug: 'deerwood',
        intro_text: "Deerwood is a small Cuyuna-area town near Bay Lake, home of the historic Ruttger's resort — quiet, clear-water lake country in central Minnesota.",
        description: `Deerwood is a small town in Crow Wing County near Bay Lake, in the Cuyuna lake country about two hours north of the Twin Cities. It's best known as the home of Ruttger's Bay Lake Resort, one of Minnesota's oldest family resorts, and the area keeps a quiet, established lake-country character.

Real estate centers on Bay Lake and the surrounding waters — clear, spring-fed lakes with a long resort history — ranging from cabins to year-round lake homes, along with in-town and near-lake houses. Bay Lake's clarity and the resort legacy keep frontage sought after, while the smaller area lakes and Deerwood itself offer more accessible options. Nearby Crosby and the Cuyuna recreation area add to the draw.

Life in Deerwood is quiet and lake-forward — golf and boating at Ruttger's, clear-water swimming and fishing, and the Cuyuna biking trails minutes away. For buyers who want a settled, clear-water lake community with a bit of resort history, Deerwood and Bay Lake are a calm, classic choice.`,
        seo_title: 'Deerwood MN Homes for Sale | Bay Lake Real Estate',
        seo_description: "Deerwood, MN homes for sale near Bay Lake — clear Cuyuna-area water and the historic Ruttger's resort in central Minnesota. Get new listings.",
        hero_image_url: '/assets/images/mn-lake-home-from-water.jpg',
    },
    {
        slug: 'aitkin',
        intro_text: "Aitkin is a classic county-seat river town near Big Sandy Lake and the upper Mississippi — a gateway to central Minnesota's lakes and northwoods.",
        description: `Aitkin is the county seat of Aitkin County, a classic small river town on the upper Mississippi about two hours north of the Twin Cities, near Big Sandy Lake and a scatter of northwoods lakes. It's a genuine year-round town — a real Main Street and county services — set at the southern gateway to central Minnesota's lake and forest country.

Real estate ranges from lakefront homes and cabins on Big Sandy Lake and the surrounding waters to in-town and riverfront homes. Big Sandy's size and fishing reputation anchor the lake market, while Aitkin itself offers some of the more affordable housing in the region. It's a value area — big water and northwoods access at prices well below the metro and Brainerd lakes.

Life in Aitkin is river, lake, and small-town — fishing and boating on Big Sandy, the Mississippi and Rice Lake wildlife refuge nearby, and a walkable downtown with a working-town feel. For buyers who want an affordable base near big water and the northwoods, Aitkin and Big Sandy Lake are a practical, uncrowded pick.`,
        seo_title: 'Aitkin MN Homes for Sale | Big Sandy Lake Real Estate',
        seo_description: "Aitkin, MN homes for sale near Big Sandy Lake and the upper Mississippi — an affordable gateway to central Minnesota's lakes. Get new listings.",
        hero_image_url: '/assets/images/mn-harbor-town.webp',
    },
    {
        slug: 'cass-lake',
        intro_text: "Cass Lake is a northwoods town on the lake of the same name, deep in the Chippewa National Forest near Bemidji — clear water and legendary fishing.",
        description: `Cass Lake is a small town in Cass County, set on the shore of Cass Lake within the Chippewa National Forest, near Bemidji in north-central Minnesota about three and a half hours from the Twin Cities. Surrounded by forest and water on the Leech Lake reservation, it's classic northwoods fishing country.

Real estate centers on Cass Lake and the surrounding forest lakes — cabins and year-round lake homes on clear, wooded frontage — at prices that run well below the metro markets. Because so much of the shoreline is within the national forest, development is limited and much of the water stays wild, which is a large part of the appeal. As with the wider reservation-and-forest region, buyers benefit from a local specialist who knows the parcel and access details.

Life in Cass Lake is fishing, boating, and the northwoods — walleye and muskie water, the Chippewa National Forest, and a quiet, lake-first pace. Bemidji's services and college-town amenities are a short drive west. For buyers who want affordable, wild, clear-water lake country, Cass Lake delivers the real northwoods.`,
        seo_title: 'Cass Lake MN Homes for Sale | Chippewa Forest Waterfront',
        seo_description: "Cass Lake, MN homes for sale on Cass Lake — clear northwoods water in the Chippewa National Forest near Bemidji. Get new listings with a local agent.",
        hero_image_url: '/assets/images/mn-clearwater-lakeshore.jpg',
    },
    {
        slug: 'ottertail',
        intro_text: "Ottertail is a small town on the shore of Otter Tail Lake — a big, sandy recreation lake in the heart of Otter Tail County's lake country.",
        description: `Ottertail is a small town on the north shore of Otter Tail Lake, in the middle of Otter Tail County's dense lake country in west-central Minnesota, about three hours from the Twin Cities. It's a genuine lake town built around one of the region's premier recreation lakes — big, sandy-bottomed water that has drawn cabin families for generations.

Real estate here is anchored by Otter Tail Lake frontage — from classic cabins to rebuilt year-round homes on the lake's sandy shoreline — along with in-town and near-lake homes. The lake's size, clean sand, and reputation keep frontage sought after, while the surrounding smaller lakes and the town offer a range of options. It's a second-home-heavy market where the best water clusters in spring listings.

Life in Ottertail runs on the lake — boating and watersports on big open water, swimming off sandy beaches, and fishing across the county's many lakes. Nearby Perham and Battle Lake add services and small-town charm. For buyers who want big, sandy recreation water in the heart of Otter Tail lake country, Ottertail is right on it.`,
        seo_title: 'Ottertail MN Homes for Sale | Otter Tail Lake Real Estate',
        seo_description: "Ottertail, MN homes for sale on Otter Tail Lake — big, sandy recreation water in the heart of Otter Tail County. Get new listings with a local agent.",
        hero_image_url: '/assets/images/mn-lake-dock-golden.jpg',
    },
    {
        slug: 'annandale',
        intro_text: "Annandale calls itself the Heart of the Lakes — a central Minnesota town among Clearwater, Sugar, and Sylvia lakes, halfway between the Twin Cities and St. Cloud.",
        description: `Annandale sits in central Minnesota's lake country in Wright County, about an hour northwest of the Twin Cities and a short drive from St. Cloud. It bills itself as the Heart of the Lakes for good reason — it's ringed by popular recreation lakes including Clearwater, Sugar, and Sylvia — and its commutable location has made it a growing four-season community.

Real estate ranges from lakefront homes and cabins on Clearwater, Sugar, Sylvia, and the surrounding waters to in-town homes in a genuine, growing town. The mix of clear recreation lakes and an easy metro/St. Cloud commute is Annandale's strength: buyers can own on the water and still commute, which keeps year-round demand strong alongside the second-home market. Good frontage is competitive, especially in spring.

Life in Annandale balances lakes and town — boating and swimming on the area's clear water, a walkable downtown, and quick access to both the Cities and St. Cloud. For buyers who want central-Minnesota lake living within commuting distance, Annandale and its ring of lakes are one of the most convenient options in the region.`,
        seo_title: 'Annandale MN Homes for Sale | Central MN Lakes Real Estate',
        seo_description: "Annandale, MN homes for sale — the Heart of the Lakes, ringed by Clearwater, Sugar, and Sylvia lakes an hour from the Twin Cities. Get new listings.",
        hero_image_url: '/assets/images/mn-lake-town-sunset-aerial.jpg',
    },
];
