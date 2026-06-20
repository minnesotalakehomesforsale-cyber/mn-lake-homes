/**
 * lake-intros.js — canonical hero subtitles for lakes whose seeded intro was
 * outside the 20-25 word target. Applied on every boot by server.js so the
 * live lakes table matches (prod is deploy-only — a direct DB write hits the
 * stale dev DB, not production). Source of truth for these slugs; edits here
 * win over admin edits on the next deploy. Keep each line 20-25 words.
 */
module.exports = {
    'big-sandy-lake': "Big Sandy Lake is a fur-trade gateway near McGregor — 6,400 acres with a long north-end beach and a quieter cabin culture than the Brainerd Chain.",
    'big-stone-lake': "Big Stone Lake is Minnesota's westernmost big water — a 26-mile glacial lake on the South Dakota border, with prairie shoreline and a serious walleye fishery.",
    'detroit-lake': "Detroit Lake is a 3,000-acre walleye and muskie lake in northwest Minnesota's lakes country — the summer-cabin destination Twin Cities and Fargo families flock to.",
    'gull-lake': "Gull Lake is one of central Minnesota's most sought-after resort lakes — clear water, sandy beaches, top-rated golf, and lively boating just north of Brainerd.",
    'kabetogama-lake': "Lake Kabetogama is one of the four big Voyageurs National Park lakes — 25,000 acres of clear water, granite islands, and old-growth boreal forest.",
    'lake-bemidji': "Lake Bemidji wraps directly around the city of Bemidji — the rare big northern lake where you can walk downtown to dinner after pulling the boat.",
    'lake-carlos': "Lake Carlos crowns the Alexandria chain — 2,600 acres of clear, deep water anchored by Lake Carlos State Park, with serious sailing and trout fishing.",
    'lake-independence': "Lake Independence is an 850-acre clear-water lake on the west edge of Hennepin County, with Baker Park Reserve covering its quiet eastern shore.",
    'lake-minnetonka': "Lake Minnetonka is Minnesota's premier waterfront destination — 14,000 acres of luxury estates, private docks, sailing, and elite lakeside dining just 30 minutes from downtown Minneapolis.",
    'lake-of-the-woods': "Lake of the Woods is Minnesota's northernmost destination lake — 950,000 acres straddling the Canadian border, legendary for walleye, sauger, and remote island retreats.",
    'lake-pepin': "Lake Pepin is a 22-mile natural widening of the Mississippi south of Red Wing — the birthplace of waterskiing and Minnesota's prettiest stretch of bluff-country lakefront.",
    'lake-waconia': "Lake Waconia is the second-largest lake in the Twin Cities metro — 3,100 acres of clear water with a charming village and a long sailing tradition.",
    'lake-winnibigoshish': "Locally called \"Big Winnie,\" Lake Winnibigoshish is Minnesota's fourth-largest lake — 67,000 acres in the Chippewa National Forest, famed for walleye and undeveloped shoreline.",
    'leech-lake': "Leech Lake is Minnesota's third-largest lake — legendary walleye fishing, 100,000-plus acres ringed by Chippewa National Forest, and quiet cabin country around the town of Walker.",
    'medicine-lake': "Medicine Lake is the largest lake within the city of Plymouth — 880 acres of west-metro waterfront 15 minutes from Minneapolis, anchored by French Regional Park.",
    'mille-lacs-lake': "Mille Lacs is Minnesota's second-largest inland lake — 132,000 acres famed for world-class walleye, hard-water fishing in winter, and big-water boating near the Twin Cities.",
    'otter-tail-lake': "Otter Tail Lake is Otter Tail County's second-largest — 13,700 acres with a long sandy bottom and a generational cabin culture dating to the 1920s.",
    'pelican-lake': "Pelican Lake is an 11,000-acre gem in Otter Tail County — clear water, a sandy bottom, and some of west-central Minnesota's most desirable lakefront.",
    'pokegama-lake': "Pokegama Lake at Grand Rapids is a deep, clear 6,600-acre lake with five distinct bays and a reputation for the largest muskies in the region.",
    'prior-lake': "Prior Lake is the largest lake in the Twin Cities metro core — over 1,400 acres of connected water in a thriving lakefront suburb.",
    'rainy-lake': "Rainy Lake straddles the Minnesota–Ontario border at International Falls — the doorstep to Voyageurs National Park, with 360 miles of shoreline and more than 500 islands.",
    'whitefish-chain': "The Whitefish Chain links 14 connected lakes north of Brainerd into one of Minnesota's most coveted addresses — clear water, deep coves, and rarely-listed properties.",
};
