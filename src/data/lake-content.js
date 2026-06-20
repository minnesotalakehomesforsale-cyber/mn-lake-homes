/**
 * lake-content.js — unique, hand-written "Life on…" and "Seasons" copy for the
 * highest-traffic lakes, replacing the region-templated fallback in
 * lake-content-templates.js (which reads similar across lakes — weak for SEO).
 * Applied on boot by server.js (prod is deploy-only). Source of truth for these
 * slugs. Plain text; blank lines separate paragraphs (the server wraps each in
 * <p>). Batch 1 — extend this object to cover more lakes.
 */
module.exports = {
    'lake-minnetonka': {
        lifestyle: `Lake Minnetonka is the Twin Cities' marquee waterfront address — more than 14,000 acres of interconnected bays just 20 minutes west of Minneapolis, ringed by towns like Wayzata, Excelsior, Orono, and Deephaven. It is a working lake and a social one: sailboat races out of the yacht clubs, boat-in dinners along the Wayzata and Excelsior waterfronts, and a summer rhythm built entirely around the dock.

The real-estate market here is the deepest and most expensive in Minnesota. Big-water bays command estate pricing, while quieter back bays and channel frontage open the door to first-time lake buyers. Which bay you are on — open water versus protected channel, hard sand versus soft bottom — drives value as much as the house itself, which is why local, bay-by-bay knowledge matters so much on Minnetonka.`,
        seasons: `Summer is the main event: the bays fill with cruisers and sailboats, the Big Island sandbar turns into a floating gathering, and the lake towns hum straight through Labor Day. Early fall quiets things to color tours and the last warm sails before docks come out.

Winter doesn't empty Minnetonka the way it does the northern lakes. Plowed roads, lively downtowns, and an easy metro commute mean most homes here are primary residences, not seasonal cabins. Ice fishing, pond hockey, and frozen-lake walks carry the cold months until ice-out reopens the water in April.`,
    },
    'gull-lake': {
        lifestyle: `Gull Lake is the heart of the Brainerd Lakes — central Minnesota's classic resort-and-cabin country, about two hours north of the Twin Cities. Clear water, sandy beaches, and a chain of connected lakes make it a boating and golf destination, anchored by resorts like Grand View Lodge and Madden's and the shop-lined town of Nisswa just up the road.

The market runs from legacy family cabins to rebuilt year-round lake homes and high-end new construction on the prime sand frontage. Demand is strongest for clean, swimmable shoreline with western light; busier main-lake stretches and quieter weeknight bays price differently, so what you value in a day on the water should guide where you buy.`,
        seasons: `Summer is peak Gull: the chain fills with pontoons and ski boats, the golf courses book out, and Nisswa's main street draws weekend crowds. Early fall is a local favorite — warm water, thinner traffic, and the first color in the pines and hardwoods.

The area stays lively in winter, with groomed snowmobile trails, ice houses dotting the lake, and resorts that run year-round. The May fishing opener is a Brainerd Lakes institution that effectively starts the season every spring.`,
    },
    'mille-lacs-lake': {
        lifestyle: `Mille Lacs is Minnesota's second-largest inland lake — roughly 132,000 acres of big, open water about 90 minutes north of the Twin Cities, long famous as one of the country's premier walleye fisheries. This is a fishing lake first: launches, bait shops, and guide services ring the shore, and the towns of Garrison, Isle, and Wahkon are built around getting people on the water.

Real estate skews to cabins and year-round homes priced well below the metro lakes, which makes Mille Lacs one of the more attainable big-water markets in the state. Because the lake is so large and relatively shallow, exposure is everything — protected shoreline and quality frontage are what buyers should weigh before anything else.`,
        seasons: `Summer brings walleye, smallmouth, and muskie anglers along with big-water boating, though wind can build quickly across such open water. Fall is prime trophy-fishing season and the quietest, most scenic stretch of the year.

Winter is when Mille Lacs is busiest of all: it becomes a small city on the ice, with rental ice houses, plowed ice roads, and one of the most serious hard-water fishing scenes in North America. Ice-out in spring resets the cycle and reopens the open-water season.`,
    },
    'leech-lake': {
        lifestyle: `Leech Lake is Minnesota's third-largest lake — over 100,000 acres of northwoods water ringed by the Chippewa National Forest, near the town of Walker. It is a fishing-and-cabin lake at heart, with a quieter, more wilderness feel than the busier resort chains to the south, and a shoreline of bays, points, and islands that rewards local knowledge.

The market is largely seasonal cabins and walleye-country lake homes priced well below the metro, with national forest and tribal land shaping where private shoreline exists. On a lake this size, which bay you are on and how exposed the frontage is should drive the decision as much as the home.`,
        seasons: `Summer is walleye season and the busiest stretch, with Walker's main street and lakeside resorts drawing anglers and families. Fall turns the surrounding hardwoods and tamarack gold and brings some of the best fishing of the year, with the crowds gone.

Winter is serious ice-fishing and snowmobile country — Leech freezes hard and the surrounding forest laces with groomed trails. The May fishing opener marks the real start of the season each spring.`,
    },
    'whitefish-chain': {
        lifestyle: `The Whitefish Chain links 14 connected lakes north of Brainerd into one of Minnesota's most coveted lake addresses, anchored by the town of Crosslake. Clear water, deep coves, and the ability to boat lake-to-lake for dinner or a day of fishing make it a destination for serious lake people — and properties here are tightly held.

The market is among the strongest in the Brainerd Lakes: well-kept cabins, rebuilt year-round homes, and high-end estates on the prime frontage. Lakefront on the chain rarely sits long, and value tracks closely with water clarity, frontage quality, and which of the connected lakes a property sits on.`,
        seasons: `Summer is the chain at full tilt — boats moving between lakes, the Crosslake waterfront busy, and a steady calendar of lake-association and town events. Fall is a quieter, scenic reward, with warm water often lingering into September.

The area stays active through winter with snowmobiling, ice fishing, and a year-round community in Crosslake. Spring brings ice-out and the Brainerd-area opener, reopening the full run of connected water.`,
    },
    'lake-of-the-woods': {
        lifestyle: `Lake of the Woods is Minnesota's northernmost destination lake — a vast border water shared with Ontario and Manitoba, famous for walleye, sauger, and a true remote-north experience. Baudette anchors the U.S. shore, and much of the lake is reached by boat to island lodges and far-flung bays rather than by road.

Private property is limited and localized, so this is a specialized market of cabins, resorts, and legacy holdings rather than a typical lakefront-subdivision scene. Access, electricity, and winter ice-road reliability matter here as much as the shoreline itself.`,
        seasons: `Summer and fall are prime open-water fishing, with charter and lodge traffic running out of Baudette and the Northwest Angle. The big water and island maze reward anglers who know it — or who hire guides who do.

Winter turns Lake of the Woods into one of the continent's great ice-fishing destinations: plowed ice roads, sleeper houses, and walleye through the ice for months. It is a year-round fishing economy far more than a summer-cabin one.`,
    },
    'lake-carlos': {
        lifestyle: `Lake Carlos crowns the Alexandria chain in Douglas County — about 2,600 acres of clear, deep water just north of Alexandria, anchored by Lake Carlos State Park. It is a long-tenured cabin community with a genuine sailing and trout-fishing culture, and enough depth and water quality to stand out among west-central Minnesota's lakes.

The market blends established family cabins with rebuilt year-round homes; clean, deep frontage and proximity to Alexandria's amenities drive the premiums. The chain connection lets buyers reach several lakes from one dock, which keeps demand steady.`,
        seasons: `Summer centers on sailing, deep-water fishing, and the busy Alexandria-area resort scene. Fall cools the water and thins the crowds, with state-park trails turning color.

Winter brings ice fishing and snowmobiling, and Alexandria's year-round economy keeps the area lively rather than shuttered. Ice-out in spring reopens the chain.`,
    },
    'kabetogama-lake': {
        lifestyle: `Lake Kabetogama sits inside Voyageurs National Park in St. Louis County — roughly 25,000 acres of clear water, granite islands, and old-growth boreal forest reached from Ray and the Ash River. It is a houseboat-and-resort lake with a true north-woods, roadless-interior character prized by anglers and paddlers.

Private property is limited to a ring of resorts and cabins along the accessible shore, so this is a specialized market where access and park-adjacency define value more than square footage.`,
        seasons: `Summer and early fall are prime for walleye, smallmouth, and exploring the park's island maze by boat. Autumn is quiet and spectacular as the forest turns.

Winter brings ice roads, ice fishing, and snowmobiling on the frozen park lakes, then a late northern ice-out reopens the water in spring.`,
    },
    'rainy-lake': {
        lifestyle: `Rainy Lake straddles the Minnesota–Ontario border at International Falls in Koochiching County — the doorstep to Voyageurs National Park, with hundreds of miles of shoreline and more than 500 islands. It is a serious fishing and wilderness-boating lake with a remote, big-water feel.

Private shoreline is localized around International Falls and the park's edges; buyers weigh access, services, and how exposed a property is on such expansive water.`,
        seasons: `Summer and fall deliver world-class walleye and smallmouth fishing and long days among the islands. The far-north light and quiet make autumn a favorite.

Winter is hard and long here — ice fishing and snowmobiling dominate, and ice-out comes late, often well into spring.`,
    },
    'bay-lake': {
        lifestyle: `Bay Lake is a classic Brainerd-area lake in Crow Wing County, best known as the home of Ruttger's, Minnesota's oldest family resort. Clear water and an established, low-key cabin culture give it a more relaxed feel than the busier chains nearby, while staying an easy drive from the Twin Cities.

The market is largely well-kept family cabins and year-round homes; water quality and quiet frontage are the draw, and properties tend to stay in families for generations.`,
        seasons: `Summer is golf, swimming, and resort life on calm, family-oriented water. Fall quiets things to color and the last warm days.

Winter brings ice fishing and snowmobiling across the Brainerd Lakes trail network, with the May opener restarting the season.`,
    },
    'big-sandy-lake': {
        lifestyle: `Big Sandy Lake in Aitkin County is a historic fur-trade gateway near McGregor — about 6,400 acres with a long sandy north-end beach and a quieter resort-and-cabin culture than the Brainerd Chain to its west. It is a walleye and northern-pike lake with deep local roots.

The market favors affordable cabins and year-round homes; sandy frontage and the lake's size relative to its modest prices make it a genuine value in lake country.`,
        seasons: `Summer is fishing, swimming off the sand, and easygoing resort life. Fall is prime walleye time as the crowds fade.

Winter is ice-fishing and snowmobile country, with a late-spring opener kicking off the warm season.`,
    },
    'north-long-lake': {
        lifestyle: `North Long Lake is one of the larger lakes right at Brainerd's doorstep in Crow Wing County — popular, easily accessed, and a staple of the Brainerd Lakes boating scene. Its size supports everything from watersports to serious fishing, minutes from town amenities.

The market spans cabins to substantial year-round homes; convenience to Brainerd and Baxter keeps demand strong, with frontage quality setting the price ladder.`,
        seasons: `Summer is busy with boats, anglers, and lake-town life close to Brainerd. Fall cools and quiets the water.

Winter brings ice houses and sled trails, and the spring opener restarts the season.`,
    },
    'south-long-lake': {
        lifestyle: `South Long Lake is a quieter Crow Wing County lake just south of Brainerd and Baxter — smaller and more residential than its big-name neighbors, with an easy commute to town that supports year-round living.

The market leans to year-round homes and cabins for buyers who want Brainerd-area lake life without the main-lake bustle; clean frontage and proximity drive value.`,
        seasons: `Summer is relaxed boating and fishing close to town. Fall brings color and calm water.

Winter offers ice fishing and trail access, with ice-out reopening the lake in spring.`,
    },
    'lake-koronis': {
        lifestyle: `Lake Koronis near Paynesville in Stearns County is a clear, spring-influenced central-Minnesota lake with a long family-resort tradition. Its water quality and central location make it a dependable cabin destination within easy reach of both the Twin Cities and St. Cloud.

The market is cabins and year-round homes at central-Minnesota prices; clean, swimmable frontage commands the premium.`,
        seasons: `Summer is swimming, fishing, and resort life on clear water. Fall quiets the lake under turning hardwoods.

Winter brings ice fishing and snowmobiling, with the spring opener restarting the season.`,
    },
    'burntside-lake': {
        lifestyle: `Burntside Lake near Ely in St. Louis County is one of Minnesota's clearest lakes — rocky, island-studded, and rimmed by pine on the edge of the Boundary Waters. It is the lake of Sigurd Olson's Listening Point, with a wilderness character that draws paddlers and purists.

The market is legacy cabins and a small number of premier properties; water clarity, rock-and-pine frontage, and BWCA proximity make it irreplaceable and tightly held.`,
        seasons: `Summer is paddling, lake trout, and swimming in cold, clear water. Fall is quiet and spectacular along the pine shore.

Winter is deep north-woods cold — skiing, ice fishing, and snowmobiling out of Ely — with a late ice-out.`,
    },
    'lake-vermilion': {
        lifestyle: `Lake Vermilion stretches across St. Louis County near Tower and Cook — about 40 miles of shoreline and 365 islands that rival the Boundary Waters, but with motorized access and full-service marinas. It pairs wilderness scenery with real boating practicality and a strong year-round community.

The market ranges from back-bay cabins to island estates; water quality, the islands, and the mix of wilderness and amenity make it one of northern Minnesota's marquee lakes. Lake Vermilion–Soudan Underground Mine State Park anchors the east end.`,
        seasons: `Summer is island-hopping, walleye and smallmouth fishing, and resort life. Fall turns the shoreline gold and brings trophy fishing with the crowds gone.

Winter is serious ice-fishing and snowmobile country across the Arrowhead, with a late northern ice-out.`,
    },
    'detroit-lake': {
        lifestyle: `Detroit Lake is the centerpiece of Becker County's Lakes Country — a roughly 3,000-acre walleye and muskie lake on the edge of the city of Detroit Lakes, with a mile-long public beach and a lively summer downtown. It is the rare destination lake with a full-service, year-round town right on the water.

The market spans cabins to year-round lake homes; frontage quality and proximity to town and the beach drive value, and the surrounding 400-plus lakes give buyers options nearby.`,
        seasons: `Summer peaks around the beach, boating, and WE Fest weekend in early August. Fall quiets the lake under northern color.

Winter keeps going with ice fishing, Polar Fest, and a town that stays open year-round, until spring ice-out.`,
    },
    'lake-melissa': {
        lifestyle: `Lake Melissa sits just south of Detroit Lakes in Becker County, part of the same sought-after chain — clear water, sandy frontage, and a classic Lakes Country cabin culture a few minutes from town. It offers the Detroit Lakes lifestyle with a quieter, more residential feel.

The market is cabins and rebuilt lake homes; clean sand frontage and the chain location are the premiums.`,
        seasons: `Summer is swimming, boating, and easy access to Detroit Lakes amenities. Fall brings calm water and color.

Winter offers ice fishing and the area's year-round services, with spring ice-out reopening the chain.`,
    },
    'otter-tail-lake': {
        lifestyle: `Otter Tail Lake is Otter Tail County's second-largest — about 13,700 acres with a long sandy bottom and a generational cabin culture dating to the 1920s, with Battle Lake on its north shore. Big, sandy, and well-established, it is a Lakes Country staple.

The market is family cabins and year-round homes; sandy, swimmable frontage and the lake's size sustain steady demand.`,
        seasons: `Summer is swimming off the sand, boating, and resort life. Fall quiets the lake under turning hardwoods.

Winter brings ice fishing and snowmobiling, with the May opener restarting the season.`,
    },
    'pelican-lake': {
        lifestyle: `Pelican Lake in Otter Tail County is an 11,000-acre gem — clear water, a sandy bottom, and some of west-central Minnesota's most desirable lakefront. It is big enough for real boating and clean enough for swimming, with an established cabin community.

The market favors well-kept cabins and rebuilt lake homes; clarity and sand frontage command the premiums on this sought-after water.`,
        seasons: `Summer is swimming, boating, and fishing on clear water. Fall brings calm and color.

Winter offers ice fishing and trail access across Lakes Country, reopening at spring ice-out.`,
    },
    'lake-pepin': {
        lifestyle: `Lake Pepin is a 22-mile natural widening of the Mississippi River below Red Wing in Goodhue County — the birthplace of waterskiing and the prettiest stretch of bluff-country waterfront in Minnesota. Lake City and a string of historic river towns line its shore.

The market is river-town and bluff-side homes rather than typical cabins; views, the sailing-and-boating culture, and proximity to the Twin Cities define value.`,
        seasons: `Summer is sailing, boating, and the waterskiing heritage in full swing along the river towns. Fall is spectacular as the bluffs turn and eagles gather.

Winter quiets the river valley, with bald eagles wintering on the open water below the dams before spring reopens the season.`,
    },
    'cass-lake': {
        lifestyle: `Cass Lake in Cass County sits within the Chippewa National Forest — a clear walleye lake dotted with islands, including Star Island with its own lake-within-an-island. It is a north-woods fishing lake with deep forest character, with tribal and federal land shaping its shore.

The market is cabins and seasonal homes at northern-Minnesota prices; the forest setting and fishing quality are the draw.`,
        seasons: `Summer is walleye fishing and island exploring on clear water. Fall brings color and quiet to the forest shoreline.

Winter is ice fishing and snowmobiling deep in the Chippewa National Forest, with a late-spring opener.`,
    },
    'lake-winnibigoshish': {
        lifestyle: `Locally called "Big Winnie," Lake Winnibigoshish in Cass County is one of Minnesota's largest lakes — roughly 67,000 acres of open water in the Chippewa National Forest, famed for walleye and a cabins-not-castles culture. Undeveloped forest shoreline gives it a genuinely wild feel.

The market is fishing cabins and modest lake homes; the appeal is big water, fishing, and forest rather than luxury, which keeps it relatively attainable.`,
        seasons: `Summer is big-water walleye fishing and boating, with wind a real factor on such open water. Fall is prime fishing as the forest turns.

Winter brings extensive ice fishing and sled trails through the national forest, with a late ice-out.`,
    },
    'pokegama-lake': {
        lifestyle: `Pokegama Lake at Grand Rapids in Itasca County is a deep, clear lake with several distinct bays and a reputation for big muskies — and the Mississippi River runs straight through it. It pairs strong fishing with a setting right beside a full-service town.

The market is cabins and year-round homes; depth, clarity, and proximity to Grand Rapids drive value.`,
        seasons: `Summer is muskie and walleye fishing and boating across the bays. Fall brings color and quiet to the deep water.

Winter offers ice fishing and snowmobiling, with Grand Rapids' year-round services nearby and a spring opener.`,
    },
    'lake-bemidji': {
        lifestyle: `Lake Bemidji wraps around the city of Bemidji in Beltrami County — the rare big northern lake where you can walk downtown to dinner after pulling the boat. Near the Mississippi headwaters and Paul Bunyan country, it blends a north-woods setting with city convenience.

The market spans cabins to year-round homes; the in-town location and lake access make it unusually livable for a destination northern lake.`,
        seasons: `Summer is boating, fishing, and the Bemidji waterfront and trails. Fall brings color around the lake as the university returns to session.

Winter is full north-woods cold — ice fishing, skiing, and the Paul Bunyan Trail — until a late spring ice-out.`,
    },
    'big-stone-lake': {
        lifestyle: `Big Stone Lake is Minnesota's westernmost big water in Big Stone County — a 26-mile glacial lake forming the South Dakota border and the source of the Minnesota River, with Ortonville as its gateway. Quiet prairie shoreline and a serious walleye fishery define it.

The market is affordable cabins and lake homes; the appeal is big water, fishing, and prairie quiet far from the metro, at attainable prices.`,
        seasons: `Summer is walleye fishing and easygoing boating on long open water. Fall brings prairie color and waterfowl along the flyway.

Winter is ice fishing on the border water, with a spring opener restarting the season.`,
    },
    'lake-zumbro': {
        lifestyle: `Lake Zumbro is a Zumbro River reservoir in Olmsted County just north of Rochester — the closest real lake-recreation water to the Mayo Clinic city, which makes it a popular weekend and second-home spot for the Rochester area.

The market is cabins and year-round homes serving Rochester; proximity to the city and boatable water drive demand more than the lake's size.`,
        seasons: `Summer is boating, fishing, and weekend escapes from Rochester. Fall brings color along the river valley.

Winter offers ice fishing close to town, with spring reopening the reservoir.`,
    },
    'lake-shetek': {
        lifestyle: `Lake Shetek is the largest lake in southwestern Minnesota, in Murray County, anchored by Shetek State Park — a prairie-pothole lake that is a genuine recreation oasis in farm country and draws boaters and anglers from across the region.

The market is cabins and lake homes serving southwest Minnesota; as the area's premier lake, demand outstrips the limited supply of good frontage.`,
        seasons: `Summer is the busy season, with boating, fishing, and state-park camping drawing regional crowds. Fall brings prairie color and waterfowl.

Winter is quiet ice fishing on the prairie, reopening at spring thaw.`,
    },
    'bald-eagle-lake': {
        lifestyle: `Bald Eagle Lake in the north Twin Cities metro (Ramsey County, near White Bear Township) is an accessible recreation lake close to the suburbs — popular for pontooning and fishing, with an easy commute that supports year-round living.

The market is metro lake homes and cabins; proximity to the cities and usable frontage drive value on this convenient north-metro water.`,
        seasons: `Summer is busy with metro boaters and anglers. Fall quiets the lake as cabins wind down.

Winter brings ice fishing close to the suburbs, with spring ice-out reopening the season.`,
    },
    'big-marine-lake': {
        lifestyle: `Big Marine Lake in Washington County, near Marine on St. Croix, is one of the cleaner east-metro lakes, with a county park and a quieter, more natural feel than the busier metro waters. It offers genuine lake life within reach of the Twin Cities.

The market is year-round homes and cabins for buyers wanting clean water and a rural feel close to the cities; clarity and natural shoreline are the draw.`,
        seasons: `Summer is swimming, paddling, and easygoing boating on clear water. Fall brings color and calm in the St. Croix valley.

Winter offers ice fishing and county-park trails, reopening at spring ice-out.`,
    },
    'christmas-lake': {
        lifestyle: `Christmas Lake sits beside Lake Minnetonka near Shorewood and Excelsior in Hennepin County — small, exceptionally clear, and one of the most exclusive addresses in the metro. Spring-fed clarity and limited frontage make it highly coveted.

The market is high-end: a tight ring of premium homes where water clarity and the prestige location command some of the metro's top lakefront prices.`,
        seasons: `Summer is swimming in famously clear water and quiet boating, minutes from Minnetonka's amenities. Fall brings calm and color.

Winter is metro lake life — ice fishing and skating — with year-round homes and an easy commute, reopening at ice-out.`,
    },
    'lake-independence': {
        lifestyle: `Lake Independence is an 850-acre clear-water lake on the far west edge of Hennepin County, with Baker Park Reserve covering much of its shore — a Twin Cities lake that still feels rural and natural. Protected parkland keeps its character intact.

The market is year-round homes for buyers who want quiet, clean water within commuting distance of the cities; the park and clarity are the appeal.`,
        seasons: `Summer is swimming, paddling, and Baker Park recreation on clear water. Fall brings color across the reserve.

Winter offers Baker Park trails and ice fishing close to the metro, reopening at spring ice-out.`,
    },
    'lake-minnewashta': {
        lifestyle: `Lake Minnewashta in Carver County sits in Chanhassen, with Minnewashta Regional Park on its shore — a clean, sought-after southwest-metro lake minutes from the Minnetonka corridor. It blends suburban convenience with quality water.

The market is established year-round homes; clean frontage, the regional park, and the desirable Chanhassen location drive value.`,
        seasons: `Summer is swimming, boating, and regional-park life close to the suburbs. Fall brings calm and color.

Winter is metro ice fishing and park trails, with an easy commute year-round, reopening at ice-out.`,
    },
    'lake-waconia': {
        lifestyle: `Lake Waconia is the second-largest lake in the Twin Cities metro — about 3,100 acres in Carver County, 35 minutes from Minneapolis, with the charming city of Waconia and historic Coney Island on its water. It offers big-lake boating and a long sailing tradition close to the cities.

The market spans cabins to substantial year-round homes; size, clarity, and metro proximity sustain strong, steady demand.`,
        seasons: `Summer is sailing, boating, and a lively Waconia waterfront. Fall brings color and calmer water.

Winter is metro ice fishing and a year-round community, reopening at spring ice-out.`,
    },
    'medicine-lake': {
        lifestyle: `Medicine Lake is the largest lake entirely within a single city — Plymouth, in Hennepin County — about 880 acres of west-metro waterfront 15 minutes from downtown Minneapolis, anchored by French Regional Park. It is genuine lake recreation inside the suburbs.

The market is established year-round homes; the in-city location, park access, and metro convenience drive value.`,
        seasons: `Summer is sailing, paddling, and French Park recreation close to the city. Fall brings color around the park.

Winter offers park trails and ice activities minutes from Minneapolis, reopening at ice-out.`,
    },
    'prior-lake': {
        lifestyle: `Prior Lake is the largest lake in the Twin Cities metro core — over 1,400 acres of connected water in Scott County's thriving lakefront suburb, 25 minutes from Minneapolis. Upper and Lower Prior together make it a true metro boating hub.

The market is suburban lake homes from accessible to high-end; connected water, metro proximity, and a strong lakefront economy drive demand.`,
        seasons: `Summer is the metro boating scene at full tilt across the connected lakes. Fall brings calmer water and color.

Winter is suburban ice fishing and a year-round community, reopening at spring ice-out.`,
    },
    'white-bear-lake': {
        lifestyle: `White Bear Lake in Ramsey County is the historic boating destination of St. Paul's north suburbs — home to a storied yacht club and one of the metro's most walkable lake-adjacent downtowns. It pairs sailing heritage with genuine town life on the water.

The market is established year-round homes, from in-town to premier lakefront; the walkable downtown and sailing tradition set it apart in the metro.`,
        seasons: `Summer is sailing, regattas, and a lively downtown by the water. Fall brings color and calmer sailing.

Winter is metro ice fishing and a year-round community with an easy commute, reopening at ice-out.`,
    },
    'green-lake': {
        lifestyle: `Green Lake at Spicer in Kandiyohi County is a deep, clear west-central Minnesota lake with an underrated sailing and swimming culture, near New London. Its depth and clarity make it stand out among the region's lakes.

The market is cabins and year-round homes; clean, deep water and the Spicer–New London community drive value.`,
        seasons: `Summer is sailing, swimming, and boating on clear, deep water. Fall brings calm and color.

Winter offers ice fishing and area trails, reopening at spring ice-out.`,
    },
    'lake-minnewaska': {
        lifestyle: `Lake Minnewaska at Glenwood in Pope County is one of Minnesota's larger lakes — clear water in the gentle hills of "Lake Wobegon" country, with Glenwood right on its shore. It is an established west-central destination with a relaxed, scenic character.

The market is cabins and year-round homes; size, clarity, and the Glenwood waterfront drive demand at west-central prices.`,
        seasons: `Summer is boating, swimming, and the Glenwood waterfront and festivals. Fall brings color to the surrounding hills.

Winter offers ice fishing and quiet, reopening at spring ice-out.`,
    },
};
