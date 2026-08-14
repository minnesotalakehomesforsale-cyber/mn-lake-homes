// tier1-content.js — DEV-05 curated page content for the 15 Tier-1 lakes + the
// Phase-1 town hubs. Unlike lake-content.js (which only fills EMPTY fields via
// COALESCE), this is the source-of-truth upgrade to the 1,500+ word standard, so
// seedTier1Content() in server.js OVERWRITES the listed fields — but only when the
// content actually changes (each entry is content-hashed into seed_flags, so a
// redeploy never re-clobbers, and a later admin edit isn't reverted unless this
// file changes). Populate from "Lake Page Builder/Lakes" + "…/Towns" (Drive).
//
// Entry shape (all fields optional except slug + kind — omit what you don't have;
// omitted fields are left untouched):
//   {
//     slug: 'gull-lake', kind: 'lake',            // kind: 'lake' → lakes table; 'town' → tags table
//     seo_title: '…', seo_description: '…',
//     intro_text: '…',                            // opening paragraph
//     description: '…',                           // main body (overview / real-estate context)
//     lifestyle_text: '…',                        // "Life on <lake>" section
//     seasons_text: '…',                          // "What the seasons bring" section
//     faq: [ { q: '…', a: '…' }, … ],             // stored as JSONB on the row
//   }
//
// Only include a statistic the source marked as verified (MLS/DNR). Omit any
// unsourced number rather than shipping one we can't defend (DEV-05 rule).

const LAKES = [
    // ── Wave 1 ───────────────────────────────────────────────────────────────
    {
        slug: 'lake-minnetonka', kind: 'lake',
        seo_title: 'Lake Minnetonka Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Minnetonka homes for sale across 23 bays and 125 miles of Hennepin County shoreline. Get matched with a vetted, licensed, local lakefront agent — free.',
        intro_text: 'Twenty-three bays, 125 miles of shoreline, and no two of them alike — get matched with an agent who knows which water is yours.',
        description: `Lake Minnetonka sits about 16 miles west-southwest of downtown Minneapolis, straddling Hennepin and Carver counties — close enough to the city that plenty of owners live here year-round and commute, which is rare for a Minnesota lake this size. Thirteen incorporated municipalities wrap its shoreline, from Wayzata and Orono on the north to Excelsior, Tonka Bay, and Shorewood on the south, plus Deephaven, Greenwood, Minnetonka Beach, Mound, Spring Park, and more. At 14,528 acres it's the state's ninth-largest lake and, by a wide margin, its most valuable stretch of residential water.

Minnetonka is really one lake pretending to be twenty. It's a maze of roughly 23 named bays connected by channels and narrows, with about 125 miles of shoreline and 18 islands — the product of glacial kettle lakes and marshland that filled in about 10,000 years ago. Maximum depth is 113 feet in Crystal Bay, with an average depth around 30 feet, so you get genuinely deep, cold main-lake basins as well as quiet, shallow, weedy back bays. That variety is the whole story of buying here: Wayzata Bay and Lower Lake open water feel like a different lake than the protected, no-wake character of St. Albans or Carsons Bay. The lake drains east into Minnehaha Creek.

This is a full-time, four-season lake, not a cabin lake. You'll find legacy family estates that have been held for generations alongside teardowns rebuilt into modern lake homes, executives who commute to the Cities, and retirees who want water without leaving the metro. The communities each have their own feel — Wayzata's walkable downtown and yacht-club polish, Excelsior's Main Street and Commons beach, the quieter old-money stretches of Deephaven and Woodland — but they share the same water and the same premium.

Boating is the center of everything. Minnetonka is a big, busy multi-use lake — sailing regattas out of Wayzata and Excelsior, wakeboats, cruisers, and the classic summer run to lakeside restaurants and the islands by boat. The bay layout means you can almost always find protected water somewhere when the wind is up. Fishing is genuinely good and often underrated given the lake's reputation as a "social" lake: it's a strong multi-species fishery with largemouth bass, walleye, northern pike, and one of the metro's better muskie populations, plus panfish in the back bays. Off the water, Wayzata and Excelsior anchor the lifestyle — restaurants, shops, farmers' markets, the Commons, and events all summer — and winter brings ice fishing, the Art on the Lake and pond-hockey culture, and quiet frozen bays. Median ice-out is around April 14, with records kept since 1855.

Minnetonka — Dakota for "big water" — was a nationally known resort destination in the late 1800s, reached by rail from the Twin Cities, with grand hotels, steamboats, and the amusement park at Big Island. As the resort era faded, the shoreline converted to private homes and the lake became the metro's premier address. Records on the lake go back to 1855, and the ice-out log is one of the longest continuous natural records in the state.

Living on Minnetonka means you don't trade amenities for water. Wayzata and Excelsior have real downtowns — restaurants, coffee, groceries, marine and dock service — and the broader west metro (Minnetonka, Wayzata, Chanhassen) has everything else within minutes: major medical, shopping, and top-rated school districts (Wayzata, Minnetonka, Orono). MSP International is about 30–40 minutes east. For owners, that combination of open water, walkable lake towns, and full metro convenience is exactly what holds values here.`,
    },
    {
        slug: 'gull-lake', kind: 'lake',
        seo_title: 'Gull Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Gull Lake homes for sale in the Brainerd Lakes area of Minnesota. 9,900 acres, clear walleye water, classic resort country. Get matched with a local agent — free.',
        intro_text: 'The heart of the Brainerd Lakes — 9,900 acres, a resort-town legacy, and clear walleye water. Get matched with an agent who actually knows it.',
        description: `Gull Lake sits in the heart of the Brainerd Lakes Area, straddling Cass and Crow Wing counties in central Minnesota — about two and a half hours north of the Twin Cities, and the closest thing Minnesota has to a signature "cabin country" destination. Brainerd and Baxter are minutes to the south, Nisswa just to the east, and the small city of East Gull Lake sits right on the water. This is the region people picture when they think "up north": pines, clear water, and a summer economy built on lake homes and resorts.

Gull Lake covers about 9,947 acres — roughly 15 miles long and 3 miles across at its widest — with 38 miles of shoreline. Maximum depth is about 80 feet, with an average around 30 feet, giving it clear, deep water and healthy structure. It's the largest lake in the immediate Brainerd-Baxter area and the anchor of the Gull Chain of Lakes, eight connected lakes and two bays totaling about 13,000 acres, so boaters can run well beyond Gull itself. The Gull Lake Dam, built in 1912, raised the lake about five feet and gives the chain its modern shape.

Gull is a mix of legacy cabin families, full-time residents, and second-home owners from the Cities — many of whom have been coming up for generations. The shoreline runs from classic 1950s–70s cabins (increasingly torn down and rebuilt) to modern year-round lake homes and a tier of high-end estates. Density is real for a north-woods lake — roughly 28 homes or cabins per shoreline mile — because this water has been prized for a century. The resort DNA is still here too: Gull is home to about 19 resorts, including well-known names like Cragun's, Madden's, and Grand View Lodge, which shape the summer rhythm of the whole area.

Summer on Gull is boating, watersports, and fishing, with golf and lake-town dining woven through it. The fishery is strong and varied — walleye (heavily supported by stocking), northern pike, muskie, bass, and panfish, part of a system with 35+ aquatic species. In winter the area is a genuine destination: the Brainerd Jaycees Ice Fishing Extravaganza nearby draws tens of thousands. Nisswa's shops, the area's golf courses (Grand View, Cragun's), and the resort restaurants keep the region busy well beyond the water.

People have lived around Gull for millennia — there are 12-plus Woodland-period burial mounds along the shore, and the St. Columba Mission, established in the 1850s, is on the National Register of Historic Places. The Gull Lake Dam (1912) reshaped the chain, and the twentieth century turned Gull into one of Minnesota's premier resort and cabin destinations — a legacy that still drives demand and pricing today.

Gull owners get north-woods water without being far from services. Brainerd and Baxter have full grocery, medical (Essentia Health St. Joseph's), hardware, and marine/dock service; Nisswa offers the classic lake-town Main Street. Golf is a regional draw. For travel, the Brainerd Lakes Regional Airport is close, and the Twin Cities are a straightforward drive south. That combination — clear water, resort amenities, golf, and a real town nearby — is what keeps Gull at the top of the Brainerd-area market.`,
    },
    {
        slug: 'whitefish-chain', kind: 'lake',
        seo_title: 'Whitefish Chain Homes for Sale | MN Lake Homes',
        seo_description: 'Whitefish Chain of Lakes homes for sale in Crosslake, MN — 14 connected lakes, 14,000+ acres of premium Brainerd-area water. Get matched with a local agent, free.',
        intro_text: 'Fourteen connected lakes, 14,000 acres of premium Brainerd-area water, and Crosslake at its heart. Get matched with an agent who knows the chain.',
        description: `The Whitefish Chain sits in Crow Wing County in the heart of the Brainerd Lakes Area, with the town of Crosslake at its center and Pequot Lakes, Jenkins, and Pine River nearby. It's about two and a half hours north of the Twin Cities — the same prized "up north" region as Gull Lake, and, along with Gull, one of the two marquee lake systems in the Brainerd area. Crosslake itself has grown into an upscale lake town with dining, marinas, golf, and a genuine summer scene.

The Whitefish Chain is a connected system of 14 lakes spanning about 14,272 acres — Upper and Lower Whitefish, Cross Lake, Big Trout, Rush, Lower Hay, Little Pine, Bertha, Arrowhead, Daggett, Clamshell, Pig, Island, and Loon — all navigable by boat through channels and the Crosslake dam that created the modern chain in the late 1800s. Depth varies widely across the chain: several lakes are moderate, while Big Trout Lake is deep and cold (roughly 128 feet) with notably clear water. That mix of connected water, deep clear lakes, and varied shoreline is exactly what makes the chain so desirable.

The Whitefish Chain sits at the premium end of the Brainerd-area market. You'll find legacy cabin families, retirees, and second-home owners from the Cities, plus a strong tier of high-end lake homes and estates — Crosslake has become one of the most sought-after lake addresses in central Minnesota. The shoreline ranges from original cabins (often teardown candidates on prime frontage) to modern year-round lake homes and luxury estates, with value shifting notably from lake to lake within the chain.

Boating the connected chain is the centerpiece — you can run 14 lakes without trailering, dock-hop to Crosslake restaurants, and find quiet water or open water depending on the day. Fishing is strong and varied: walleye, muskie, bass, and panfish across the chain, plus cold-water species like cisco in deep, clear Big Trout. Off the water, Crosslake anchors the lifestyle — dining, marinas, golf nearby, and a busy summer-town calendar — with the rest of the Brainerd Lakes Area minutes away.

The chain takes its name from the Ojibwe "Kadikumagokag" — "the lake where there are many whitefish." The permanent dam built on Cross Lake in the late 1800s raised and connected the waters into the chain that exists today, and over the twentieth century Crosslake grew from a logging-and-resort town into one of the premier lake destinations in the Brainerd Lakes Area. That heritage — connected water plus an upscale town — still defines it.

Crosslake provides real amenities for a lake town: restaurants, marinas and marine service, groceries, and summer events, with Pequot Lakes and Pine River nearby and Brainerd/Baxter (full medical, shopping, the regional airport) a short drive south. For buyers, the chain offers the rare combination of navigable multi-lake boating, deep clear water, and a genuine town — which is why it holds its value at the top of the region.`,
    },
    // ── Wave 2 ───────────────────────────────────────────────────────────────
    {
        slug: 'mille-lacs-lake', kind: 'lake',
        seo_title: 'Mille Lacs Lake Homes for Sale | MN Lake Homes',
        seo_description: "Mille Lacs Lake homes for sale — Minnesota's second-largest lake and its walleye capital, 132,000 acres across three counties. Get matched with a local agent, free.",
        intro_text: "Minnesota's second-biggest lake and its most famous walleye water — 132,000 acres of it. Get matched with an agent who knows this shoreline.",
        description: `Mille Lacs Lake sits about 75 miles north of the Twin Cities, spanning Mille Lacs, Aitkin, and Crow Wing counties — close enough for a weekend, big enough to feel like a different world. Garrison anchors the west shore, Isle and Wahkon the south, and Onamia sits just off the southwest corner. This is one of Minnesota's most recognizable lakes: an inland sea of walleye water with a fishing culture that runs deep and a shoreline that's more accessible, price-wise, than the metro lakes to the south.

At 132,516 acres, Mille Lacs is Minnesota's second-largest inland lake (behind Red Lake) — nearly 20 miles across. Despite its size it's relatively shallow and even: maximum depth is about 42 feet, with most of the main lake running 20–30 feet. That broad, uniform basin over rock and gravel reefs is exactly what makes it such a productive fishery. There are 11-plus named islands, the largest being Malone Island at about 35 acres. Because the lake is so large and open, wind and weather matter here — locals watch the forecast the way coastal boaters do.

Mille Lacs is a working fishing-and-vacation lake more than a luxury-estate lake, and that's its appeal. You'll find longtime cabin families, year-round residents, resort and guide operators, and second-home owners who came up to fish and stayed. The shoreline mixes classic cabins, modern lake homes, and a strong resort-and-campground tradition. The lake also holds deep cultural significance — it's the homeland of the Mille Lacs Band of Ojibwe (Misi-zaaga'igan, "Grand Lake"), and that history is part of the region's identity.

Fishing is the identity. Mille Lacs is Minnesota's signature walleye lake and, in recent years, a genuinely world-class smallmouth bass fishery, along with muskie, northern pike, perch, and crappie. The walleye population hit a low around 2016 and has recovered through 2023–2024, with regulations relaxing as the fishery rebounded. Winter is just as big: Mille Lacs is one of the great ice-fishing destinations in the country, with thousands of ice houses and full rental-village operations on the ice each season. Boating, the launch scene, and lakeside supper clubs round out the summer.

Mille Lacs — Ojibwe Misi-zaaga'igan and the French "thousand lakes" that gave it its name — has been a center of life in the region for centuries and remains the homeland of the Mille Lacs Band of Ojibwe. In the modern era it became one of the state's defining fishing destinations. More recent chapters include the establishment of zebra mussels around 2005 and the resulting increase in water clarity, plus the walleye management story of the 2010s.

Garrison, Isle, Onamia, and Wahkon supply the essentials — bait and tackle, groceries, dining, marine and dock service — with a strong resort and guide community around the whole lake. Onamia-area medical, plus casino and cultural attractions run by the Mille Lacs Band, add year-round activity. It's about 75 miles to the Twin Cities, making Mille Lacs one of the closest big lakes to the metro — a real factor in demand.`,
    },
    {
        slug: 'lake-vermilion', kind: 'lake',
        seo_title: 'Lake Vermilion Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Vermilion homes for sale near Tower & Cook, MN — 39,000 acres, 365 islands, world-class walleye and muskie water in the Arrowhead. Get matched with an agent.',
        intro_text: "365 islands, clean rocky water, and some of Minnesota's best smallmouth and muskie fishing. Get matched with an agent who knows this shoreline.",
        description: `Lake Vermilion stretches across the Arrowhead region of northeastern Minnesota, in St. Louis County, between the towns of Tower on the east and Cook on the west, with Soudan and the Bois Forte reservation on its shores. This is deep-north country — Canadian Shield rock, pine, and famously clean water — about four hours north of the Twin Cities and close to Ely and the Boundary Waters. It's long been considered one of the most scenic large lakes in the state.

Lake Vermilion covers about 39,271 acres — the fifth-largest lake entirely within Minnesota — with a maximum depth around 76 feet. Its defining feature is complexity: more than 365 islands and a deeply convoluted, rocky shoreline of countless bays, narrows, and points. That maze of islands and structure is what makes it both a spectacular place to own and a genuinely great fishing lake. The lake sits on Canadian Shield bedrock, so shorelines tend toward rock and pine rather than sand.

Vermilion draws a mix of longtime cabin families, retirees, and second-home owners who want a premium northern lake — and it sits at the higher end of the up-north market because of its water quality, islands, and reputation. You'll find classic cabins, modern lake homes, sought-after island properties, and a tier of high-end estates on the best points and bays. Fortune Bay Resort and Casino, operated by the Bois Forte Band of Ojibwe, anchors part of the shoreline and the local economy.

Fishing is a headline draw and Vermilion delivers: it's a premier walleye lake (managed with protected slot limits), a nationally respected muskie water, and one of Minnesota's best smallmouth bass fisheries, with northern pike and panfish rounding it out. Beyond fishing, the island-studded layout is made for boating, exploring, and finding your own quiet bay. On shore, the Lake Vermilion–Soudan Underground Mine State Park offers hiking and tours of Minnesota's oldest and deepest iron mine, and Ely and the Boundary Waters are close for bigger north-woods adventures.

The Vermilion area has deep Ojibwe roots and remains home to the Bois Forte Band. The late-1800s discovery of iron at Soudan brought the Soudan Underground Mine — Minnesota's first and deepest — and the boathouses of the Stuntz Bay Historic District date to that era. In 2010 the state finalized an $18 million purchase that created the Lake Vermilion–Soudan Underground Mine State Park, permanently protecting a stretch of shoreline.

Tower and Cook provide the essentials — groceries, dining, marine and bait service — with a strong resort and guide presence around the lake. Ely, a short drive east, adds outfitters and the gateway to the Boundary Waters. Regional medical and air service are in the Iron Range area and Duluth is the nearest larger city. The trade for buyers: it's remote and northern, but you're buying into arguably the most scenic big-lake setting in the state.`,
    },
    {
        slug: 'leech-lake', kind: 'lake',
        seo_title: 'Leech Lake Homes for Sale | MN Lake Homes',
        seo_description: "Leech Lake homes for sale near Walker, MN — the state's third-largest lake, legendary walleye and muskie water in the Chippewa National Forest. Get matched, free.",
        intro_text: "Minnesota's third-largest lake — 100,000 acres of walleye and muskie water wrapped in the Chippewa National Forest. Get matched with an agent who knows it.",
        description: `Leech Lake sits in north-central Minnesota, southeast of Bemidji, with the town of Walker anchoring its southwest shore. It's a true up-north lake: entirely within the Chippewa National Forest and largely within the Leech Lake Indian Reservation, homeland of the Leech Lake Band of Ojibwe. That setting is the whole character — big water, deep pine forest, bald eagles, and wild rice beds, roughly three and a half hours north of the Twin Cities.

At about 102,948 acres, Leech Lake is Minnesota's third-largest lake, with a remarkable 195 miles of shoreline and a maximum depth of 156 feet in Walker Bay. It's really a collection of big bays — Walker Bay and Shingobee Bay among the deepest — fed by seven major rivers and creeks and drained by the dam-controlled Leech Lake River. There are 11 islands totaling more than 1,600 acres. Because so much of the shoreline is national forest and reservation land, a large share stays undeveloped and wild — which keeps private lakefront relatively scarce and the setting genuinely remote.

Leech is cabin-and-fishing country more than a luxury-estate lake. You'll find multi-generation cabin families, year-round residents in and around Walker, resort operators and fishing guides, and second-home owners who came up to fish and never really left. Development clusters near Walker, Federal Dam, and the accessible bays; much of the rest is forest. The result is a lake that feels big, quiet, and unspoiled compared with the metro or Brainerd-area waters.

Fishing is the identity, and Leech is legendary for it — a top walleye lake and one of the great muskie waters in the country (the famous 1955 "Leech Lake Muskie Rampage" is still lore). There's also strong perch, northern pike, and panfish action, and in winter it's serious ice-fishing country — Walker's International Eelpout Festival is a nationally-known event built around the lake's burbot. Beyond fishing: boating the big bays, exploring the Chippewa National Forest, eagle-watching, and the small-town summer rhythm of Walker.

Leech Lake has been central to the Leech Lake Band of Ojibwe for generations; the reservation was established in 1855 and the "Greater" Leech Lake Reservation consolidated in 1936. The lake was also the site of the Battle of Sugar Point in 1898. In the modern era it became one of Minnesota's iconic fishing destinations, its economy built around resorts, guides, and the walleye and muskie runs — a heritage that still defines the shoreline today.

Walker is the hub — groceries, dining, marine and bait service, medical, and the festival-and-tourism summer economy. Federal Dam, Hackensack, and Longville are nearby small towns, and Bemidji (with its regional airport and larger amenities) is a reasonable drive northwest. For buyers, the trade is clear: fewer services and more remoteness than a Brainerd-area lake, in exchange for far bigger, wilder, more affordable water.`,
    },
    {
        slug: 'lake-of-the-woods', kind: 'lake',
        seo_title: 'Lake of the Woods Homes for Sale | MN Lake Homes',
        seo_description: 'Lake of the Woods homes for sale near Baudette, MN — the Walleye Capital of the World, thousands of islands and legendary fishing in the far north. Get matched, free.',
        intro_text: "The Walleye Capital of the World — thousands of islands, legendary fishing, and Minnesota's remote far north. Get matched with an agent who knows it.",
        description: `Lake of the Woods sits at Minnesota's far northern edge, straddling the border with Ontario and Manitoba — the only place a Minnesotan can drive to the northernmost point of the contiguous United States (the Northwest Angle). Baudette, the seat of Lake of the Woods County, is the Minnesota gateway town, with Warroad to the west. This is remote, big-water, fishing-first country — about five hours north of the Twin Cities, and unlike anywhere else in the state.

Lake of the Woods is one of the largest lakes in North America, shared by Minnesota, Ontario, and Manitoba, with more than 14,000 islands and a shoreline so intricate it's measured in thousands of miles. The Minnesota open water — Big Traverse Bay, off Baudette — is broad and relatively shallow, while the lake reaches much greater depths in its Canadian waters. The Northwest Angle, a Minnesota exclave reachable only by boat or by driving through Canada, sits amid a maze of islands and is a destination in its own right. The lake ultimately drains north toward Hudson Bay.

This is a fishing-and-resort market more than a suburban lake. Owners here are anglers, resort and lodge operators, hunters, and people who want genuine remoteness. Development centers on Baudette, the south-shore resort corridor, and the Northwest Angle. You'll find cabins, fishing homes, lodges, and resort properties — a specialized market where access, guiding, and the fishery drive value more than square footage.

Fishing is the identity, year-round. Lake of the Woods calls itself the Walleye Capital of the World, and the walleye and sauger fishing genuinely earns it — plus muskie, northern pike, perch, crappie, smallmouth bass, and lake sturgeon. Winter is enormous here: heated fish houses and sleeper (overnight) ice houses draw anglers from across the country onto the frozen bay. Beyond fishing, there's hunting, boating the island country, and the unique experience of the Northwest Angle.

Lake of the Woods has deep Ojibwe and Métis history and was central to the fur-trade era, with the border itself the product of old surveys that left the Northwest Angle as a U.S. exclave. Baudette and Warroad grew as border, timber, and fishing towns, and over the twentieth century the lake became one of North America's premier fishing destinations — a reputation that still drives its economy and its real estate today.

Baudette provides the essentials — groceries, dining, medical (Lake of the Woods County), and the resort-and-guide network that supports the fishery — with Warroad to the west adding more services and a famed hockey culture. International Falls is a drive to the east. This is a market where you buy for the water, the fishing, and the remoteness; town amenities are modest by design.`,
    },
    {
        slug: 'detroit-lake', kind: 'lake',
        seo_title: 'Detroit Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Detroit Lake homes for sale in Becker County, MN. Three connected basins, walleye and muskie water, mile-long city beach. Get matched with a local agent, free.',
        intro_text: 'Three connected basins, a mile of city beach, and walleye water that’s still producing — Detroit Lake is the working summer town of Lakes Country.',
        description: `Detroit Lake sits in Becker County in northwest Minnesota, three hours from the Twin Cities and about 45 minutes east of Fargo-Moorhead on Highway 10. The city of Detroit Lakes — the county seat, around 9,500 people year-round — wraps around the north and west shore. Once you're here, you're in the middle of a region with more than 400 lakes inside a 25-mile radius, which is why most of the town's economy runs on tourism and lakeshore real estate. Pelican Lake, Lake Sallie, Lake Melissa, Big Cormorant, and Floyd Lake are all within a short drive.

Detroit Lake is really three basins connected by narrows: Big Detroit (the main basin, just over 2,000 acres), Little Detroit (roughly 1,000 acres, where the city beach is), and Curfman Lake — locally known as Deadshot Bay — at about 120 acres. Total surface is around 3,067 acres with 13 miles of shoreline. Maximum depth is 89 feet in Big Detroit, with an average depth of about 15 feet, which means there's serious water for cisco and lake trout habitat in the deep holes and shallow weed flats elsewhere for walleye and bass.

Detroit Lake is a true mix. Unlike some Minnesota lakes that are 90% seasonal cabin country, this one has a working town built right onto its shore — meaning year-round residents, retirees who moved up from the Cities, and three generations of cabin families share the same water. You'll find original 1950s and '60s cabins still in the same family alongside modern lake homes that have replaced teardowns, plus a small cluster of luxury estates on the most protected shoreline.

Boating is the center of summer. Detroit Lake is a multi-use lake — wake sports, sailing, jet skis, pontoons, fishing boats — and the three-basin layout means you can usually find protected water no matter which way the wind is blowing. The most recent Minnesota DNR survey showed about 83% of walleye over 15 inches and 29% over 20 inches, which is strong by any Minnesota standard. The lake also has muskie, northern pike, smallmouth and largemouth bass, crappie, bluegill, and an established lake sturgeon population. Off the water, the city beach on Little Detroit runs about a mile of sand and is the busiest stretch of public lakeshore in the region; the 1915 Pavilion still hosts concerts and weekly events all summer.

Detroit Lake got its name, by local legend, from a French priest who looked across the water in the 1800s and called it a beautiful "détroit" — the French word for strait. The Northern Pacific Railroad reached the area in 1871, the village of Detroit was established in 1881, and in 1926 the town added "Lakes" to its name because the postal service kept routing mail to Detroit, Michigan. The lake has been a destination for over 140 years.

Detroit Lakes itself has the things that matter when you actually live on a lake: a real grocery store, a hardware store, marine and dock service, a hospital (Essentia Health St. Mary's), restaurants that stay open year-round, and a summer-festival downtown. Vergas, Frazee, and Lake Park are nearby small towns. For air travel, Hector International in Fargo is the closest commercial airport, and other Lakes Country water — Pelican, Sallie, Big Cormorant — is inside a 15-minute drive.`,
    },
    {
        slug: 'rainy-lake', kind: 'lake',
        seo_title: 'Rainy Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Rainy Lake homes for sale near International Falls, MN — rocky islands, clear border water, and the gateway to Voyageurs National Park. Get matched with an agent.',
        intro_text: 'Rocky islands, clear border water, and the edge of Voyageurs National Park. Get matched with an agent who knows Rainy Lake and International Falls.',
        description: `Rainy Lake sits on Minnesota's northern border with Ontario, with International Falls — the "Icebox of the Nation" — on the U.S. side opposite Fort Frances, Ontario. It's in Koochiching County, and Voyageurs National Park occupies its southeastern corner. This is deep-north border country, about five hours north of the Twin Cities, defined by Canadian Shield rock, pine, clear water, and a maze of islands.

Rainy is a large international lake — roughly 360 square miles overall, shared with Ontario — with a highly irregular, rocky shoreline measured in hundreds of miles counting its islands. It's a deep, clear Canadian Shield lake sitting over ancient bedrock and fault lines. The Minnesota waters, including the stretch within Voyageurs National Park, mix open expanses with sheltered island channels — spectacular and genuinely wild.

Rainy is a fishing, boating, and north-woods market more than a suburban one. Owners here are anglers, boaters, hunters, and people who want remoteness and access to Voyageurs. Development centers around International Falls and the accessible shoreline outside the park; a portion of the lake is national-park water, which keeps much of it undeveloped and protected. You'll find cabins, year-round homes, and island properties.

Fishing is a headline draw — walleye, smallmouth bass, muskie, northern pike, and crappie, with an annual bass championship on the lake since 1996. Boating the island country and exploring Voyageurs National Park (46 boat-in campsites on Rainy alone) define the summer, and in winter the National Park Service maintains an ice road onto the lake. It's a paddler's, angler's, and boater's lake first.

Rainy Lake was a central artery of the fur-trade voyageur routes — the national park takes its name from them — and International Falls grew as a border, timber, and paper-mill town. The lake's hydroelectric dams have long powered both countries. Today the blend of national-park protection, border character, and world-class fishing defines Rainy's identity and its shoreline.

International Falls provides the essentials — groceries, dining, medical, and a regional airport with air service — plus the border crossing to Fort Frances. Ranier, right on the water, is the small gateway community to the lake and park. This is a market where you buy for the water, the fishing, and Voyageurs; town amenities are modest but real.`,
    },
    {
        slug: 'otter-tail-lake', kind: 'lake',
        seo_title: 'Otter Tail Lake Homes for Sale | MN Lake Homes',
        seo_description: 'Otter Tail Lake homes for sale in Otter Tail County, MN — 13,700 acres of clear walleye water near Perham and Battle Lake. Get matched with a local agent, free.',
        intro_text: 'The heart of Otter Tail country — 13,700 acres of clear walleye water and classic lakes-region living. Get matched with an agent who knows it.',
        description: `Otter Tail Lake sits in west-central Minnesota's Otter Tail County — the namesake of a region with more lakes than any county in the state. The small city of Ottertail is right on the water, with Perham to the north, Battle Lake to the south, and Fergus Falls the nearest larger town to the southwest. It's about three hours northwest of the Twin Cities and roughly an hour from Fargo-Moorhead, which makes it a natural lake for both metro and Red River Valley owners.

Otter Tail Lake covers about 13,725 acres — the tenth-largest lake entirely within Minnesota — with a maximum depth of 120 feet, though it's largely a shallower lake (about 57% is 15 feet or less). Water clarity runs around 10.5 feet, which is good, and a distinctive "Point" splits the lake into eastern and western halves. Mature deciduous trees line much of the shore and act as a natural windbreak. It's part of the Otter Tail River chain of lakes, whose waters ultimately flow north to Hudson Bay via the Red River.

Otter Tail is classic lakes-country: a mix of longtime cabin families, year-round residents, retirees, and second-home owners from the Cities and the Fargo area. The shoreline ranges from original cabins to modern year-round lake homes, with a resort tradition typical of the region. It's a more accessible, family-oriented lake than the marquee metro or northern-destination waters — which is a large part of its appeal.

Fishing and boating drive the summer. Walleye and northern pike are the most sought species, with bass and panfish rounding out the mix, and the annual Reel Country Classic tournament (held each May since 2005) is a fixture. The lake's size and open water make it a genuine sailing lake — the center of the lake gets enough wind for real sailing, a tradition that goes back decades. Off the water, the broader Otter Tail lakes region — Perham, Battle Lake, and dozens of nearby lakes — offers golf, dining, and small-town summer life.

Otter Tail Lake has been a lakes-region destination for generations, with a resort and cabin culture that grew alongside the towns of Ottertail, Perham, and Battle Lake. Its sailing heyday ran from the late 1960s through the mid-1980s, and the Reel Country Classic has anchored the fishing calendar since 2005. The lake remains the centerpiece of one of Minnesota's most lake-dense counties.

The city of Ottertail sits on the lake with basic services; Perham (a growing small city to the north) and Battle Lake add groceries, dining, medical, and marine service, and Fergus Falls provides larger amenities and hospital care to the southwest. Fargo-Moorhead, about an hour away, brings a major airport and metro shopping within reach. For buyers, Otter Tail offers big, clear water and a full lakes-region lifestyle at a more approachable price point than the metro lakes.`,
    },
    {
        slug: 'lake-pepin', kind: 'lake',
        seo_title: 'Lake Pepin Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Pepin homes for sale from Red Wing to Lake City, MN — bluff-country living where the Mississippi widens, the birthplace of waterskiing. Get matched with an agent.',
        intro_text: 'Bluff-country river living where the Mississippi widens — the birthplace of waterskiing, from Red Wing to Lake City. Get matched with a local agent.',
        description: `Lake Pepin is the widest natural stretch of the Mississippi River, forming the border between Minnesota and Wisconsin about an hour southeast of the Twin Cities. On the Minnesota side it runs through Goodhue and Wabasha counties, anchored by the historic river towns of Red Wing (upstream), Lake City, and Frontenac. This is bluff country — dramatic river valley, towering bluffs, and the Great River Road National Scenic Byway hugging the shore. It's a completely different lake experience from the cabin lakes up north: river-town living with deep history and big scenery.

Lake Pepin covers about 45.7 square miles, stretching roughly 22 miles long and up to about two miles wide, with a maximum depth around 60 feet and an average depth near 21 feet. Because it's a river lake, the shoreline is defined by bluffs, river towns, and the byway rather than cabin-lined bays. Frontenac State Park protects a scenic stretch on the Minnesota side. It's big, open water — famous for wind, which is exactly why it became a sailing and waterskiing lake.

Lake Pepin is river-town living: historic homes in Red Wing and Lake City, bluff-view properties, riverfront homes, and second homes for Twin Cities owners drawn by the scenery and the roughly one-hour drive. It's a market of walkable historic downtowns, marinas, and bluff country rather than remote cabins — which gives it a distinct, year-round, town-centered character.

Lake Pepin is a boating and sailing lake first — its width and reliable wind made it the birthplace of waterskiing (Ralph Samuelson, 1922) and a sailing hub, with marinas in Lake City and along the shore. Fishing is Mississippi-pool fishing — walleye, sauger, bass, crappie, and panfish. Off the water, the Great River Road, the bluffs, wineries, riverboat history, and the antique-and-Main-Street culture of Red Wing and Lake City define the lifestyle, along with legendary fall color along the valley.

Lake Pepin has been a Mississippi landmark for centuries — a Dakota homeland, a fur-trade and steamboat corridor, and the site of the 1890 Sea Wing disaster. Red Wing and Lake City grew as river-commerce and resort towns, and in 1922 Ralph Samuelson strapped on the first water skis here. That layered history — river commerce, resort era, and recreation firsts — still shapes the towns and the shoreline.

Red Wing (pottery, shoes, a historic downtown, hospital) and Lake City (the "Birthplace of Waterskiing," a large marina, Main Street) provide full services, with Frontenac and its state park between them. The Twin Cities are about an hour northwest, and Rochester is a reasonable drive south. For buyers, Lake Pepin offers big scenic water, historic town living, and metro proximity — a rare combination in Minnesota lake real estate.`,
    },
    // ── Wave 3: Detroit Lakes / Alexandria / Bemidji Tier-1 lakes ─────────────
    {
        slug: 'lake-bemidji', kind: 'lake',
        seo_title: 'Lake Bemidji Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Bemidji homes for sale in Bemidji, MN — a 6,600-acre lake the Mississippi River runs through, wrapped by a college town and a state park. Get matched with a local agent, free.',
        intro_text: 'A 6,600-acre lake the young Mississippi runs through, with a real college town on its shore. Get matched with an agent who knows Bemidji.',
        description: `Lake Bemidji sits in Beltrami County in north-central Minnesota, with the city of Bemidji wrapped around its south and west shores — roughly four hours north of the Twin Cities and squarely in "up north" country. What sets it apart from the region's cabin lakes is that Bemidji is a genuine year-round town: Bemidji State University sits right on the south shore, and the lake is the anchor of a small regional city rather than a seasonal resort strip. This is one of the few Minnesota lakes where you can own waterfront and walk to a university, a hospital, and a downtown.

Lake Bemidji covers about 6,595 acres, with a maximum depth near 76 feet and an average depth around 28 feet, giving it deep, cool, clear main-lake water. Its defining feature is the Mississippi River: less than 50 miles downstream from the river's source at Lake Itasca, the young Mississippi flows into Lake Bemidji and back out — the lake is the northernmost point on the entire river. That connection, plus Lake Bemidji State Park on the northeast shore, gives the lake protected natural shoreline alongside its city frontage.

Bemidji is a mix of full-time residents, university families, and lake-home and second-home owners. The shoreline runs from in-town homes and older cottages to modern year-round lake houses and a tier of higher-end properties, and because the town is here, demand holds up across all four seasons rather than emptying out after Labor Day. Buyers are often drawn by the rare combination of real waterfront and real amenities.

On the water it's a classic multi-species Minnesota lake — walleye, northern pike, muskie, bass, and panfish — with room for boating, sailing, and paddling, and the Mississippi headwaters and dozens of other lakes minutes away (Bemidji bills itself as the hub of "400 lakes within 25 miles"). Lake Bemidji State Park adds hiking, a bog boardwalk, swimming, and groomed winter trails, and the lake is a busy ice-fishing and snowmobiling base in winter. The city's paved Paul Bunyan State Trail runs right along the shore.

Bemidji — from the Ojibwe leader Shaynowishkung, and the Ojibwe name for a lake with a river flowing through it — is the "First City on the Mississippi," and its lakeshore Paul Bunyan and Babe the Blue Ox statues are among the most photographed roadside landmarks in the state. The town grew as a logging and rail center and became the commercial and cultural anchor of the northwoods, a role it still plays today.

Bemidji provides services most northwoods lakes can't: Sanford Bemidji Medical Center, Bemidji State University and Northwest Technical College, a regional airport with daily flights to the Twin Cities, full shopping, and a walkable downtown on the water. For buyers, Lake Bemidji offers deep, clean water, a headwaters-of-the-Mississippi setting, and a four-season city at the door — a combination that keeps its market steadier than the purely seasonal lakes around it.`,
    },
    {
        slug: 'lake-carlos', kind: 'lake',
        seo_title: 'Lake Carlos Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Carlos homes for sale north of Alexandria, MN — the deep, clear anchor of the Alexandria Chain of Lakes, 2,600 acres with a state park. Get matched with a local agent, free.',
        intro_text: 'Deep, clear water at the head of the Alexandria Chain — 2,600 acres and a state park on the north shore. Get matched with an agent who knows the chain.',
        description: `Lake Carlos sits in Douglas County about five miles north of Alexandria, in the heart of west-central Minnesota's lake country — roughly two and a half to three hours from the Twin Cities. Alexandria is one of the state's classic lake towns, and Carlos is its marquee water: the largest and one of the deepest lakes in the Alexandria Chain of Lakes, a connected string of lakes (Carlos, Darling, Le Homme Dieu, Geneva, and Victoria among them) that lets boaters run well beyond any single shoreline.

Lake Carlos covers about 2,605 acres with roughly 13 miles of shoreline, and it's genuinely deep — a maximum depth around 163 feet, one of the deepest lakes in the region. That depth gives it cold, clear water and a complex basin; it's a Minnesota DNR "Sentinel Lake," monitored long-term for water quality, which speaks to how clear and healthy the water is. Lake Carlos State Park protects the entire northern shoreline, so a substantial stretch stays natural woods-and-water rather than developed frontage.

Carlos draws a mix of full-time residents, Alexandria-area families, and second-home owners from the Twin Cities and beyond. The shoreline ranges from legacy cabins and cottages to modern year-round lake homes and a strong tier of higher-end estates, with the clear, deep water and chain access putting Carlos at the premium end of the Alexandria market. Because Alexandria is a real town, it's a four-season lake, not just a summer address.

Boating the chain is the centerpiece — you can navigate lake to lake without trailering, dock-hop, and find both open water and quiet bays. The fishery is strong and varied: walleye, northern pike, muskie, bass, and panfish, with the deep, cold basin also supporting cool-water species. Lake Carlos State Park adds hiking and horseback trails, swimming, camping, and winter skiing and snowmobiling, and Alexandria's golf, dining, and shopping round out the lifestyle.

The Alexandria lakes have been a resort and cabin destination for well over a century, and the town leans into that heritage — it's home to the famous Kensington Runestone and the "Big Ole" Viking statue, and a long tradition as a summer getaway for the Twin Cities. That resort history, plus a genuinely deep clear lake, is what has kept Carlos desirable for generations.

Alexandria provides full services minutes away — Alomere Health hospital, shopping, restaurants, golf, and marine and dock service — and Interstate 94 makes it an easy drive from the metro. For buyers, Lake Carlos offers rare depth and clarity, navigable chain-of-lakes boating, and a protected state-park shoreline, all anchored by one of Minnesota's best-loved lake towns.`,
    },
    {
        slug: 'lake-melissa', kind: 'lake',
        seo_title: 'Lake Melissa Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Melissa homes for sale south of Detroit Lakes, MN — 1,850 acres of classic Becker County resort-and-cabin water on the Pelican chain. Get matched with a local agent, free.',
        intro_text: 'Classic Detroit Lakes cabin country — 1,850 acres on the Pelican chain, paired with neighboring Lake Sallie. Get matched with a local agent.',
        description: `Lake Melissa lies in Becker County just south of Detroit Lakes, in the lake-dense resort country of west-central Minnesota — about three and a half hours from the Twin Cities and a longtime summer destination for the Fargo–Moorhead area just to the west. This is quintessential Detroit Lakes cabin country: rolling, wooded shoreline, a deep resort tradition, and a cluster of connected lakes rather than one isolated basin. Melissa is paired with neighboring Lake Sallie, to which it's joined through the Pelican River system.

Lake Melissa covers about 1,850 acres with a maximum depth around 37 feet, giving it a mix of open water and the shallower, weedy bays that make for good fishing and easy recreation. As part of the Pelican River chain it connects to Lake Sallie and the broader watershed, so boaters aren't limited to a single lake. The shoreline is a classic Minnesota mix of cabins, year-round lake homes, and a handful of remaining resorts.

Melissa draws cabin families, retirees, and second-home owners — many with decades of history on the lake — along with a steady stream of buyers from the Red River Valley who treat the Detroit Lakes area as their weekend water. The market runs from original cabins on prized frontage (often teardown-and-rebuild candidates) to modern lake homes, with prices reflecting Detroit Lakes' status as one of the more established lake destinations in the region.

Summer here is boating, watersports, and fishing, with the town of Detroit Lakes and its mile-long beach minutes away. The fishery includes walleye, northern pike, bass, and panfish, and the connected chain adds variety. Off the water, the Detroit Lakes area offers golf, dining, the famous city beach, and a full summer-event calendar (the region is known for its festivals), while winter brings ice fishing and snowmobiling. The Lakes Melissa & Sallie Improvement Association, active since 1936, reflects how long and how seriously owners here have looked after the water.

Detroit Lakes has been a resort town since the railroad era, and Melissa and Sallie have been part of that cabin-and-resort economy for generations — a heritage that still shapes the shoreline and the seasonal rhythm of the lake.

The city of Detroit Lakes provides full services just to the north — Essentia Health St. Mary's, shopping, restaurants, golf, and marine and dock service — and Fargo–Moorhead is a straightforward drive west with the nearest major airport. For buyers, Lake Melissa offers approachable, connected-chain lake living in an established resort market, with a real town and a legendary beach right next door.`,
    },
    {
        slug: 'lake-sallie', kind: 'lake',
        seo_title: 'Lake Sallie Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Sallie homes for sale near Detroit Lakes, MN — 1,280 acres of Becker County walleye water connected to Lake Melissa on the Pelican chain. Get matched with a local agent, free.',
        intro_text: 'Detroit Lakes walleye water — 1,280 acres connected to Lake Melissa on the Pelican chain. Get matched with an agent who knows this shoreline.',
        description: `Lake Sallie sits in Becker County just southwest of Detroit Lakes, one of the tightly clustered lakes that make this corner of west-central Minnesota such a well-known summer destination — about three and a half hours from the Twin Cities and an easy trip from Fargo–Moorhead to the west. Sallie is the immediate neighbor of Lake Melissa, connected through the Pelican River, and the two are managed and enjoyed together as one of the area's classic pairs of resort-and-cabin lakes.

Lake Sallie covers about 1,280 acres with a maximum depth near 50 feet and an average depth around 17 feet — deep enough for good main-lake structure while keeping the productive shallows that make it a strong fishing lake. The Pelican River flows through, linking Sallie to Lake Melissa just downstream and tying both into the broader chain, so owners get connected water rather than a single isolated basin.

The shoreline is classic Detroit Lakes: a mix of cabins, year-round lake homes, and longtime family properties, with buyers ranging from retirees and second-home owners to Red River Valley families who have summered here for generations. As part of an established, sought-after lake area, Sallie's market runs from original cottages on good frontage to modern rebuilt lake homes.

Sallie is well known as a fishing lake — walleye and northern pike headline, alongside bass and panfish — and the connection to Melissa and the chain adds room to roam by boat. Summer means boating, watersports, and fishing, with the city of Detroit Lakes and its famous mile-long beach only minutes away. Off the water, the area's golf, dining, festivals, and the beach define the lifestyle, and winter brings ice fishing and snowmobiling. The Lakes Melissa & Sallie Improvement Association, active since 1936, shows how long owners here have worked to protect the water quality.

The Detroit Lakes area grew as a railroad-era resort destination, and Sallie has been part of that cabin-and-resort tradition for well over a century — history that still shapes its shoreline and its seasonal character.

Detroit Lakes, just to the north, supplies full services — Essentia Health St. Mary's, shopping, restaurants, golf, and marine and dock service — with Fargo–Moorhead a short drive west for the nearest major airport. For buyers, Lake Sallie offers approachable, connected-chain lake living and genuinely good fishing in one of Minnesota's most established resort-lake markets, with a real town and a legendary beach next door.`,
    },
];

const TOWNS = [
    // ← Phase-1 town content pasted here (Brainerd/Baxter, Nisswa, Crosslake,
    //   Alexandria, Walker, Park Rapids, Bemidji, Ely — skip the 3 that exist).
];

module.exports = { LAKES, TOWNS };
