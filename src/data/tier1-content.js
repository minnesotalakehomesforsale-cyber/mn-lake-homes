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
];

const TOWNS = [
    // ← Phase-1 town content pasted here (Brainerd/Baxter, Nisswa, Crosslake,
    //   Alexandria, Walker, Park Rapids, Bemidji, Ely — skip the 3 that exist).
];

module.exports = { LAKES, TOWNS };
