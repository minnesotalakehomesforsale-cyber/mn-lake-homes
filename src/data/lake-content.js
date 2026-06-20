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
};
