/**
 * town-descriptions.js — unique body copy for town pages that previously ran
 * the templated fallback. Applied on boot (description-only UPDATE, so it never
 * touches a town's hero/intro). The 5 fully-curated towns (excelsior, wayzata,
 * nisswa, walker, detroit-lakes) are intentionally excluded — their richer
 * description comes from town-content.js / the content-lift. Plain text; blank
 * lines separate paragraphs (the page splits them into "about" sections).
 */
module.exports = {
    // ── Greater Minnesota lake towns ─────────────────────────────────────────
    'alexandria': `Alexandria is the hub of the Alexandria Lakes in Douglas County — a regional retail and resort center surrounded by a dense chain of lakes including Carlos, Le Homme Dieu, Darling, Mary, and Ida. It's far enough from the Twin Cities (about two hours) to feel like real lake country, but big enough to offer year-round services, healthcare, and a lively downtown.

The market spans classic family cabins, rebuilt year-round lake homes, and in-town residential. Which lake and which shoreline you choose drives value far more than the address, so working with an agent who knows the chain bay by bay pays off here.`,

    'brainerd': `Brainerd is the county seat of Crow Wing County and the heart of the Brainerd Lakes — the gateway to more than 400 lakes within a short drive, about two hours north of the Twin Cities. Unlike resort-only towns, it's a genuine year-round community with schools, a hospital, and a working downtown, which broadens the buyer pool from second-home owners to full-time residents.

The area market runs from modest cabins to high-end lakefront on names like Gull and the Whitefish Chain. Brainerd itself offers more attainable in-town and near-lake homes for buyers who want the lifestyle without premier-frontage pricing.`,

    'baxter': `Baxter is Brainerd's fast-growing retail and residential twin along Highway 371 — the commercial center of the Brainerd Lakes and the practical home base for many who play on Gull Lake and the surrounding chain. It trades resort character for convenience: shopping, services, and quick access to the lakes.

The market here leans to year-round homes, newer subdivisions, and near-lake properties rather than premier frontage, making Baxter a popular choice for full-time residents and families who want to be minutes from both the water and everyday amenities.`,

    'grand-rapids': `Grand Rapids is the seat of Itasca County and the gateway to northern Minnesota's lake-and-forest country, set on the upper Mississippi near deep, clear Pokegama Lake. A historic paper-mill town and Judy Garland's birthplace, it pairs a real working economy with access to hundreds of forest lakes.

The market is cabins and year-round lake homes at northern-Minnesota prices, plus solid in-town housing. Buyers get genuine northwoods water and fishing with the services of a regional hub close at hand.`,

    'bemidji': `Bemidji is the first city on the Mississippi and the commercial hub of north-central Minnesota, wrapped around Lake Bemidji with the famous Paul Bunyan and Babe statues on its shore. A university town with year-round amenities, it's the rare northern lake city where you can live on the water and walk to downtown.

The market spans in-town homes to lakefront on Bemidji and the surrounding lakes. The mix of a real city, a state university, and northwoods water makes it unusually livable for a destination lake market.`,

    'fergus-falls': `Fergus Falls is the seat of Otter Tail County — Minnesota's most lake-dense county — sitting where the prairie meets lake country on the Otter Tail River. It's the regional hub for a vast spread of lakes including Otter Tail and the Battle Lake chain, with year-round services and a historic downtown.

The market combines affordable in-town housing with cabins and lake homes across the county's many lakes. For buyers who want lake access with a real town nearby and attainable prices, the Fergus Falls area delivers.`,

    'willmar': `Willmar is the seat of Kandiyohi County and the commercial center of west-central Minnesota's lakes region, near the Willmar chain and a short drive from deep, clear Green Lake at Spicer. It's a genuine regional hub with year-round retail, healthcare, and employment.

The market is in-town homes plus cabins and lake homes on the surrounding waters. Buyers get central-Minnesota affordability with quick access to some of the region's best lakes.`,

    'spicer': `Spicer is a resort village on the shore of Green Lake in Kandiyohi County — one of west-central Minnesota's deepest, clearest lakes and a genuine summer destination. Small and walkable, it punches above its size with a marina, beach, and lakefront dining.

The market centers on Green Lake cabins and year-round homes, where clarity and frontage quality command the premiums, plus more attainable options on nearby lakes and in the village itself.`,

    'new-london': `New London sits on the Crow River near Green Lake in Kandiyohi County — a small, arts-minded community in the heart of the central-lakes region, paired with neighboring Spicer as the gateway to Green Lake. It offers lake-country living with a creative, small-town character.

The market is cabins and year-round homes on the area lakes plus affordable in-town housing, appealing to buyers who want Green Lake access with a quieter village feel.`,

    'hutchinson': `Hutchinson is a McLeod County hub on the South Fork of the Crow River, southwest of the Twin Cities — a tidy, employer-anchored town (it's a longtime 3M manufacturing community) near smaller lakes and the river. It blends a strong local economy with easy access to water and the metro.

The market is mostly attainable in-town homes plus river and small-lake properties, a practical choice for buyers wanting affordability within reach of both the Cities and central-Minnesota lakes.`,

    'faribault': `Faribault is the seat of Rice County, set where the Straight and Cannon Rivers meet south of the Twin Cities — a historic mill town (home of Faribault Woolen Mill) near the Cannon Lakes and a quick I-35 commute to the metro. It pairs a well-preserved downtown with nearby lake and river recreation.

The market is affordable in-town and historic homes plus lake properties on the area's waters, drawing buyers who want value, character, and metro access in one package.`,

    'albert-lea': `Albert Lea sits at the I-35/I-90 crossroads in Freeborn County, built around Fountain Lake and Albert Lea Lake in southern Minnesota. The in-town lakes and the Blazing Star trail give it genuine waterfront character unusual for a southern-Minnesota hub.

The market is attainable in-town and lakefront homes on Fountain Lake, appealing to buyers who want affordable lake living with interstate access and full city services.`,

    'fairmont': `Fairmont is the "City of Lakes" of southern Minnesota — five connected lakes (Budd, Sisseton, Hall, George, and Amber) run right through Martin County's seat, giving an interstate town a genuine chain-of-lakes waterfront. It's a regional hub with services and an easy I-90 location.

The market is in-town and lakefront homes along the chain at southern-Minnesota prices, a rare combination of affordability and connected-lake living.`,

    'worthington': `Worthington is the seat of Nobles County in southwest Minnesota, built on the shore of Lake Okabena — a recreation centerpiece in prairie-and-farm country. Known for its turkey heritage and a notably diverse community, it's the regional hub for the area.

The market is affordable in-town housing plus lakefront homes on Okabena, appealing to buyers who want lake access and city services well off the metro's price map.`,

    // ── Twin Cities metro lake suburbs ───────────────────────────────────────
    'chanhassen': `Chanhassen is a sought-after southwest-metro suburb in Carver County, laced with lakes — Minnewashta, Lotus, Riley, and Ann — and minutes from the Lake Minnetonka corridor. Consistently ranked among the best places to live in the country, it pairs top schools with genuine lake access (and Paisley Park).

The market is established and newer year-round homes, with lakefront on Minnewashta and Lotus commanding premiums. Buyers get metro convenience, strong schools, and real water without leaving the suburbs.`,

    'waconia': `Waconia is a fast-growing Carver County city on the shore of Lake Waconia — the second-largest lake in the Twin Cities metro — about 35 minutes west of Minneapolis. A charming, walkable downtown and a long sailing tradition give it real lake-town character close to the cities.

The market spans in-town homes to substantial lakefront; the lake's size, clarity, and the metro-edge location sustain strong demand from both families and lake buyers.`,

    'mound': `Mound anchors the western end of Lake Minnetonka in Hennepin County, wrapped around Cooks Bay and the quieter Westonka bays. It offers genuine Minnetonka frontage at prices below the lake's marquee east-side addresses, with a small-town feel and an easy western-suburb commute.

The market is year-round lake homes and in-town housing; buyers who want on-Minnetonka living with more attainable pricing focus here and on the surrounding Westonka communities.`,

    'prior-lake': `Prior Lake is a thriving Scott County suburb built around Upper and Lower Prior Lake — the largest lake in the Twin Cities metro core — about 25 minutes south of Minneapolis. With Mystic Lake nearby and a strong lakefront economy, it's one of the south metro's premier lake communities.

The market runs from accessible suburban homes to high-end connected-lake frontage. The combination of big metro water, top amenities, and a short commute keeps demand consistently strong.`,

    'white-bear-lake': `White Bear Lake is the historic boating town of St. Paul's north suburbs, straddling Ramsey and Washington counties on the lake of the same name. A storied yacht club and one of the metro's most walkable lake-adjacent downtowns give it a character few suburbs can match.

The market is established year-round homes, from in-town near the walkable core to premier lakefront. The sailing heritage and downtown set White Bear apart in the metro lake market.`,

    'lakeville': `Lakeville is one of the fastest-growing suburbs in Dakota County, a top-rated south-metro community with Lake Marion and Orchard Lake within the city. It pairs newer family neighborhoods and strong schools with genuine in-town lake access along the I-35 corridor.

The market is largely newer year-round homes, with lakefront on Marion and Orchard at a premium. Buyers get suburban amenities and lake access with a straightforward commute to the cities.`,

    'forest-lake': `Forest Lake is the north-metro gateway in Washington County, built around its three-basin namesake lake plus Comfort and Bone lakes. At the junction of I-35 routes, it offers a commuter-friendly base with real recreational water right in town.

The market spans in-town homes to lakefront; the combination of metro access and genuine lake living draws families and lake buyers alike to this fast-growing edge city.`,

    'shoreview': `Shoreview is a parky, established north-metro suburb in Ramsey County dotted with lakes — Snail, Turtle, and Owasso among them — and threaded with trails and open space. It offers quiet, leafy lake living minutes from both St. Paul and Minneapolis.

The market is established year-round homes, with lakefront on the city's lakes commanding premiums. Buyers value the central location, parks, and water without leaving the core metro.`,

    'lino-lakes': `Lino Lakes is a green, water-rich Anoka County suburb on the north edge of the metro, named for its lakes and shaped by the Rice Creek chain and extensive parkland. It offers a more natural, open-space feel than the inner suburbs while staying commuter-friendly.

The market is largely newer year-round homes near lakes, trails, and reserves — a draw for buyers who want space, water, and recreation within reach of the cities.`,

    'big-lake': `Big Lake is a Sherburne County city on the northwest edge of the metro, built around Big Lake and Mitchell Lake and anchored by the Northstar commuter rail's end-of-line station. It blends affordable lake-edge living with a genuine rail connection to downtown Minneapolis.

The market is attainable year-round homes plus lake properties, popular with commuters who want lake access and lower prices than the inner suburbs.`,

    'buffalo': `Buffalo is the seat of Wright County, a growing exurb west of the metro built around Buffalo Lake right in town. It offers small-city services and genuine in-town waterfront at prices below the inner-ring suburbs, with an easy Highway 55 commute.

The market spans in-town homes to lakefront on Buffalo and the county's many surrounding lakes, appealing to buyers who want lake living with room to breathe west of the Cities.`,

    'monticello': `Monticello sits on the Mississippi River in Wright County, midway between the Twin Cities and St. Cloud on I-94, with the Bertram Chain of Lakes regional park on its doorstep. It pairs a riverfront downtown with fast-growing residential neighborhoods and new lake-and-trail recreation.

The market is largely newer year-round homes plus river and Bertram-area properties, a practical choice for commuters who want water, parks, and interstate access.`,

    'chisago-city': `Chisago City sits on the Chisago Lakes chain in Chisago County — connected waters (Green, Chisago, and the Lindstrom lakes) steeped in Swedish-immigrant heritage, about 40 minutes up I-35 from the metro. It offers genuine chain-of-lakes living within commuting distance of the cities.

The market is cabins and year-round homes on the chain plus in-town housing; the connected lakes and Scandinavian character make it a distinctive metro-edge lake community.`,

    'lindstrom': `Lindstrom — "America's Little Sweden" — sits on the Chisago Lakes chain in Chisago County, a tidy lake town with strong Swedish-immigrant roots (the Karl Oskar heritage) and water on nearly every side. It's a genuine chain-of-lakes community an easy drive north of the metro.

The market is lakefront and near-lake homes on the connected lakes plus charming in-town housing, drawing buyers who want real lake living with character and metro access.`,

    // ── Northern & western Wisconsin ─────────────────────────────────────────
    'hayward': `Hayward is the heart of northwest Wisconsin's lake country in Sawyer County — home of the Chippewa Flowage, the muskie-fishing legend behind the Freshwater Fishing Hall of Fame, and the American Birkebeiner ski race. It's a quintessential northwoods resort town with deep cabin culture.

The market is seasonal cabins and year-round lake homes across the Flowage and the area's many lakes, where fishing quality, water, and northwoods character drive value.`,

    'spooner': `Spooner is a Washburn County crossroads and gateway to northwest Wisconsin's lakes, a historic railroad town near Shell Lake and a spread of forest waters. It serves as a practical base for the region's deep cabin-and-fishing culture.

The market is affordable cabins and lake homes across the surrounding lakes plus in-town housing, appealing to buyers who want northwoods water without the priciest resort-town addresses.`,

    'rice-lake': `Rice Lake is the regional hub of Barron County in northwest Wisconsin, built around its namesake lake and surrounded by the area's many waters. It offers genuine in-town lake access plus the retail and services of a small regional center.

The market is in-town and lakefront homes on Rice Lake and nearby waters, a practical, affordable entry into northwest Wisconsin's lake country.`,

    'hudson': `Hudson is a thriving St. Croix County river town on the Wisconsin bank of the St. Croix, a short hop across the river from the Twin Cities. A picturesque, walkable downtown and a beach on the river give it genuine waterfront character with an easy metro commute.

The market is in-town historic homes, newer subdivisions, and prized St. Croix riverfront. The combination of charm, water, and metro access makes Hudson one of the most sought-after addresses on the Wisconsin side.`,

    'river-falls': `River Falls is a Pierce County university town on the Kinnickinnic River, a trout stream that runs right through its walkable downtown, about 40 minutes from the Twin Cities. It blends a college-town energy with river recreation and a metro-edge location.

The market is in-town homes, student-adjacent housing, and river-valley properties, drawing buyers who want character, the Kinni, and an easy commute into the cities.`,

    'new-richmond': `New Richmond is a growing St. Croix County city in western Wisconsin, near the metro and surrounded by lakes, golf, and the St. Croix valley. It offers small-city services and recreational water with a manageable commute to the Twin Cities.

The market is newer year-round homes plus area lake and golf-course properties, appealing to buyers who want space and water within reach of the metro.`,

    'superior': `Superior sits at the head of Lake Superior in Douglas County, Wisconsin — the working-harbor twin of Duluth at the western tip of the Great Lakes. It pairs an authentic port-city character with access to the world's largest freshwater lake and the inland lakes south of the city.

The market is affordable in-town homes plus Lake Superior and inland-lake properties, an unusually attainable foothold on the big lake and the northwoods beyond it.`,

    'ashland': `Ashland sits on Chequamegon Bay of Lake Superior in northern Wisconsin — the mainland gateway to the Apostle Islands and a historic Great Lakes port with a richly preserved downtown. It offers genuine big-lake living with a northwoods backyard.

The market is affordable historic in-town homes plus Lake Superior frontage and nearby inland lakes, drawing buyers who want big-water character without big-water prices.`,

    // ── North Dakota (Red River Valley, Missouri River & prairie cities) ─────
    'fargo': `Fargo is North Dakota's largest city, anchoring the Fargo–Moorhead metro on the Red River — a fast-growing regional center for healthcare, education, and commerce, with a revitalized downtown. While not a lake town, it's the hub many regional buyers and lake-country second-home owners call home base.

The market is broad and active: in-town homes, fast-growing new subdivisions, and riverfront properties along the Red. Buyers get big-city amenities and a strong economy with quick access to the lakes of west-central Minnesota.`,

    'west-fargo': `West Fargo is one of North Dakota's fastest-growing cities, a family-oriented suburb of the Fargo–Moorhead metro with top schools and abundant new construction. It offers modern suburban living at the center of a thriving regional economy.

The market is dominated by newer year-round homes and planned neighborhoods, appealing to families and professionals who want new construction and amenities with easy access to Fargo and the broader region.`,

    'horace': `Horace is a booming small city on the southern edge of the Fargo–Moorhead metro, one of the region's fastest-growing communities. It offers brand-new neighborhoods and a small-town feel within minutes of Fargo's jobs and amenities.

The market is overwhelmingly new construction — single-family homes and developing subdivisions — drawing young families and buyers who want a new home and room to grow at the metro's edge.`,

    'mapleton': `Mapleton is a small, growing community just west of the Fargo–Moorhead metro along I-94 — a quieter, more rural alternative to the suburbs with quick access to Fargo's economy. It offers small-town living on the prairie within an easy commute.

The market is a mix of established homes and newer construction, appealing to buyers who want affordability and space near, but not in, the metro.`,

    'grand-forks': `Grand Forks sits on the Red River in northeast North Dakota, a regional hub anchored by the University of North Dakota and a strong healthcare and aerospace economy. Its riverfront, rebuilt and reinforced after the 1997 flood, and a lively downtown define the city.

The market is in-town homes, university-adjacent housing, and newer subdivisions. Buyers get an affordable, amenity-rich regional center with river recreation and easy reach into Minnesota's lake country.`,

    'wahpeton': `Wahpeton is the Richland County seat at the headwaters of the Red River of the North, where the Bois de Sioux and Otter Tail rivers meet on the North Dakota–Minnesota border. A tidy river city with the state science college, it pairs small-town affordability with riverfront character.

The market is attainable in-town and riverfront homes, a practical base for buyers in the southern valley with access to the lakes of west-central Minnesota a short drive east.`,

    'bismarck': `Bismarck is North Dakota's capital, set on the bluffs above the Missouri River — a stable, growing city built on government, healthcare, and energy. While a river city rather than a lake town, the Missouri and nearby reservoirs give it real water recreation, and it's the regional hub for central North Dakota.

The market is broad: established in-town neighborhoods, new subdivisions, and prized Missouri riverfront. Buyers get a strong economy, river access, and an affordable cost of living.`,

    'mandan': `Mandan sits across the Missouri River from Bismarck, a historic railroad and ranching city with a strong sense of its own identity and frontier heritage (Fort Abraham Lincoln stands just south). It shares the capital metro's economy while keeping a distinct, down-to-earth character.

The market is affordable in-town homes plus newer construction and Missouri River-valley properties, appealing to buyers who want river access and value within the Bismarck–Mandan metro.`,

    'jamestown': `Jamestown sits on the James River in central North Dakota along I-94 — the "Buffalo City," home of the National Buffalo Museum and the world's largest buffalo statue, with the Jamestown and Pipestem reservoirs on its doorstep. It's a steady regional center with genuine reservoir recreation.

The market is affordable in-town homes plus reservoir and river-valley properties, a practical choice for buyers who want water recreation and small-city services in central North Dakota.`,

    'valley-city': `Valley City is the "City of Bridges," tucked into the wooded Sheyenne River valley in eastern North Dakota along I-94 — a scenic exception to the surrounding prairie, with Lake Ashtabula and the Baldhill Dam just north. A university town, it pairs river-valley charm with nearby lake recreation.

The market is affordable in-town and river-valley homes plus Lake Ashtabula properties, appealing to buyers who want scenery, water, and value in the eastern part of the state.`,

    'devils-lake': `Devils Lake sits on the shore of its vast namesake — North Dakota's largest natural lake and a nationally known walleye and perch fishery in the heart of the Lake Region. The city is built around the water, with a fishing-and-hunting economy that draws anglers year-round.

The market is in-town homes plus lakefront and lake-access properties on Devils Lake, a genuine big-water option in North Dakota where fishing access and frontage drive value.`,

    'minot': `Minot is north-central North Dakota's "Magic City," a regional hub on the Souris (Mouse) River anchored by Minot Air Force Base, a strong energy-and-agriculture economy, and the State Fair. While a river-and-prairie city rather than a lake town, it's the commercial center for a wide region.

The market is broad — established in-town homes, newer subdivisions, and river-valley properties — offering an affordable, amenity-rich base in the northern part of the state.`,

    'dickinson': `Dickinson is western North Dakota's gateway to the Badlands in Stark County, an energy-and-ranching city along I-94 with Patterson Lake right at its edge for local recreation. It blends a strong western economy with quick access to Theodore Roosevelt National Park.

The market is in-town homes, newer construction from the region's growth, and Patterson Lake-area properties, appealing to buyers who want opportunity and outdoor access in the west.`,
};
