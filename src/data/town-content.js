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
        intro_text: "A walkable Victorian lake town on the south shore of Lake Minnetonka — Excelsior pairs a historic Water Street downtown with some of the most sought-after waterfront in the Twin Cities.",
        description: [EXCELSIOR_OVERVIEW, EXCELSIOR_REAL_ESTATE, EXCELSIOR_LIFESTYLE].join('\n\n'),
        seo_title: 'Excelsior MN Homes for Sale | MN Lake Homes',
        seo_description: "Excelsior, MN homes for sale. A walkable Victorian downtown on the south shore of Lake Minnetonka — beaches, premier waterfront, and historic charm. Get new listings.",
        hero_image_url: '/assets/images/mn-cape-cod-lakefront.jpg',
    },
    {
        slug: 'wayzata',
        intro_text: "The polished north-shore gateway to Lake Minnetonka — Wayzata pairs a walkable lakefront downtown with some of the most coveted (and most expensive) waterfront in Minnesota.",
        description: [WAYZATA_OVERVIEW, WAYZATA_REAL_ESTATE, WAYZATA_LIFESTYLE].join('\n\n'),
        seo_title: 'Wayzata MN Homes for Sale | MN Lake Homes',
        seo_description: "Wayzata, MN homes for sale. The walkable north-shore gateway to Lake Minnetonka — historic downtown, premier waterfront, and top-ranked schools. Get new listings.",
        hero_image_url: '/assets/images/mn-chateau-aerial.jpg',
    },
    {
        slug: 'nisswa',
        intro_text: "The picture-book heart of the Brainerd Lakes — Nisswa pairs a walkable, shop-lined downtown with the Gull Lake chain, Minnesota's most established resort-lake market.",
        description: [NISSWA_OVERVIEW, NISSWA_REAL_ESTATE, NISSWA_LIFESTYLE].join('\n\n'),
        seo_title: 'Nisswa MN Homes for Sale | MN Lake Homes',
        seo_description: "Nisswa, MN homes for sale. The walkable heart of the Brainerd Lakes on the Gull Lake chain — cabins, year-round lake homes, and luxury frontage. Get new listings.",
        hero_image_url: '/assets/images/mn-lodge-lake-house.jpg',
    },
    {
        slug: 'walker',
        intro_text: "A northwoods fishing town on the south shore of Leech Lake — Walker is the walleye-and-cabin gateway to Minnesota's third-largest lake and the Chippewa National Forest.",
        description: [WALKER_OVERVIEW, WALKER_REAL_ESTATE, WALKER_LIFESTYLE].join('\n\n'),
        seo_title: 'Walker MN Homes for Sale | MN Lake Homes',
        seo_description: "Walker, MN homes for sale. A northwoods fishing town on Leech Lake — cabins, year-round homes, and frontage near the Chippewa National Forest. Get new listings.",
        hero_image_url: '/assets/images/mn-log-cabin-ducks.jpg',
    },
];
