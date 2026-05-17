/**
 * lake-content-templates.js — Region-aware editorial copy for lake + town
 * pages. Two responsibilities:
 *
 *   1. RUNTIME FALLBACK — when {{LAKE_LIFESTYLE_BODY}} / {{LAKE_SEASONS_BODY}}
 *      (and the town equivalents) are rendered server-side and the row has
 *      no admin-curated text yet, generate copy from this module so the
 *      page is never blank.
 *
 *   2. BATCH POPULATION — scripts/lakes/generate-lake-content.js calls the
 *      same functions to fill the lifestyle_text / seasons_text columns
 *      for every row at once. After that the DB is the source of truth
 *      and the runtime fallback is dormant unless someone clears the
 *      column.
 *
 * Both paths produce identical output for any given input row, by design —
 * one render path, one place to edit copy.
 *
 * The "flavor" buckets are picked from the region string so a destination
 * lake like Lake Vermilion gets a different opening line than a small
 * community lake in central Minnesota. Region matching is forgiving
 * (substring, lowercased) so we don't have to enumerate every region
 * spelling — anything unmatched falls through to 'community', which reads
 * fine for any lake.
 */

function pickLakeFlavor(region = '') {
    const r = String(region || '').toLowerCase();
    // Big-water destination lakes — usually larger, more tourism, more
    // services around the lake itself.
    if (/brainerd|gull|mille\s*lacs|vermilion|leech|cass|whitefish|pelican|big\s+detroit|alexandria|battle/.test(r)) return 'destination';
    // Twin Cities adjacent — close enough to commute, weekend-after-lunch lakes.
    if (/twin\s*cities|metro|hennepin|carver|scott|dakota|anoka|washington|west\s+metro/.test(r))                    return 'metro';
    // Far-north / wilderness — Boundary Waters / North Shore character.
    if (/boundary|cook|ely|lutsen|north\s*shore|arrowhead|grand\s*marais|st\.?\s*louis/.test(r))                     return 'wilderness';
    return 'community';
}

function pickTownFlavor(region = '') {
    const r = String(region || '').toLowerCase();
    if (/brainerd|gull|alexandria|park\s*rapids|detroit/.test(r))                       return 'resort';
    if (/twin\s*cities|metro|hennepin|carver|scott|dakota|anoka|washington/.test(r))    return 'commuter';
    if (/north\s*shore|cook|ely|grand\s*marais|arrowhead|duluth/.test(r))               return 'frontier';
    return 'mainstreet';
}

// ─── Lake lifestyle copy (4 flavors × 3 paragraphs each) ───────────────────

function lifestyleHtmlForLake(lake) {
    const flavor = pickLakeFlavor(lake.region);
    const name   = lake.name || 'this lake';
    const region = lake.region || 'Minnesota';
    const county = lake.county ? `${lake.county} County` : null;
    const where  = county ? `${region} (${county})` : region;

    if (flavor === 'destination') {
        return `
            <p>Owning waterfront on ${name} puts you on one of the destination lakes of ${region} — the kind of property that has weight behind it. The lake draws people from across the Upper Midwest, which means a different rhythm than a small community lake: more variety on the water, more services nearby, more depth to the local economy that supports the seasonal swell.</p>
            <p>What that translates to for owners: better restaurants within a short boat ride, more capable marinas, more capable contractors when you need shoreline work done, and a deeper bench of summer-rental demand if you ever choose to rent for a couple of weeks. The trade-off is volume — ${name} on a Saturday in July is a busier place than the kind of small county lake you'd find a county or two over. Most ${name} owners we work with consider that a feature, not a bug.</p>
            <p>The wider ${where} area has spent decades building around the seasonal lake economy, and that infrastructure is what makes the difference between a lake property that's a chore to own and one that genuinely improves your life every weekend. Buying on ${name} is buying into all of that — the lake itself plus the network around it. People tend to stay for the long haul once they're here.</p>
        `.trim();
    }

    if (flavor === 'metro') {
        return `
            <p>What separates ${name} from the deeper-north lakes isn't quality — it's logistics. Owning here means you can roll out of your house in Minneapolis after lunch on a Tuesday and be on your dock by sunset, no full-weekend commitment required. ${name} sits in ${region}, close enough to keep your everyday life intact, far enough that it actually feels different when you arrive.</p>
            <p>The math changes when the lake is a 30–45 minute drive instead of three hours. You can have dinner at home Friday and still wake up on the water Saturday morning. Owners here use their properties differently than the destination-lake crowd does — more weeknight evenings, more spontaneous afternoons, more "let's just go for the day" energy. The lake stops being a vacation and starts being a normal extension of where you live.</p>
            <p>${name}'s metro-adjacent location also means a more competitive market. Inventory tends to move quickly, especially for the limited stock of true waterfront vs. lake-access properties. Most owners we represent on ${name} have a clear idea going in of which side of the lake they want, what they're willing to compromise on, and how the morning sun hits their preferred stretch — because by the time the right property surfaces, the window to act is small.</p>
        `.trim();
    }

    if (flavor === 'wilderness') {
        return `
            <p>${name} is the kind of lake people drive past their first time and come back to for the rest of their lives. Up in ${region}, this far north, the rules change — water clearer, shoreline wilder, neighbors further apart, the kind of dark sky you'd forgotten existed if you've been spending too much time in the cities. Owning here means signing up for a meaningfully different kind of life on weekends, not just a different address.</p>
            <p>That distance is the asset. The drive itself becomes a decompression chamber — you arrive different than you left, every single time. There's less infrastructure between you and the water than there is further south, which some owners initially flinch at and then come to depend on. The closest meaningful town is further away, the highway noise is further away, the commercial sprawl that creeps up around metro-adjacent lakes simply isn't a factor.</p>
            <p>${name} owners self-select. People who buy here are choosing the lake first and the convenience trade-offs second. The reward is a kind of quiet — both literal and figurative — that's getting genuinely rare in the Upper Midwest. Most properties here are held for decades. Some are passed down. That's the rhythm of ownership on a lake like this.</p>
        `.trim();
    }

    // 'community' default
    return `
        <p>There's a particular kind of slow you only get on a lake like ${name}. Smaller, quieter, more communal — the kind of lake where you start recognizing every boat on the water by the end of your first summer. ${name} sits in ${where}, well within ${region} but a turn or two off the busiest stretches, which gives it a character the bigger destination lakes can't replicate.</p>
        <p>Life on a community lake reads at a different scale. Fewer wakes during prime time, more wildlife on the shoreline at golden hour, more chance that the same handful of regulars are at the same spots every weekend. Owners here usually know each other within a season. The dock conversations get longer. The grill on Saturday night frequently has a guest or two who weren't planning on staying for dinner.</p>
        <p>${name} isn't trying to be everything to everyone, and that's the point. People who buy on a community lake are usually buying the specific lake — they've spent time here, they know which cove they want, they know the morning light they're looking for. The properties tend to be smaller, more thoughtfully sited, and more loved-on than what you'd find on a destination lake. That kind of stewardship adds up over a generation.</p>
    `.trim();
}

// ─── Lake seasons copy ─────────────────────────────────────────────────────

function seasonsHtmlForLake(lake) {
    const flavor = pickLakeFlavor(lake.region);
    const name   = lake.name || 'this lake';

    if (flavor === 'destination') {
        return `
            <p>The seasonal swing on ${name} is dramatic — summer crowds, fall emptying, winter ice culture, spring shoulder weeks — and savvy owners learn to use all four. May and early June are the underrated months; the water's still cool, the boats are sparse, and the lake feels almost private. By July ${name} is in full destination mode, which is what brought a lot of people here in the first place.</p>
            <p>Fall is when the destination lakes do their best work. The summer crowds clear by Labor Day, leaf colors come in across the shoreline, the fishing peaks, and the lakeside restaurants that were full of weekenders open up just enough to feel relaxed. October weekends on ${name} are among the most underrated experiences in Minnesota real estate — most owners we represent who've never tried staying late into fall are surprised by how much they love it.</p>
            <p>Winter on a destination lake is its own thing. Ice fishing here isn't symbolic — it's a real culture, with whole communities of trucks and houses out on the lake when the ice gets thick. Snowmobile trails connect into the regional network. Even the summer-only owners often add a winter trip after the first year, then a second, then they stop calling it "the cabin" and start calling it "the place." That's the typical arc on a destination lake like ${name}.</p>
        `.trim();
    }

    if (flavor === 'metro') {
        return `
            <p>The seasonal rhythm on a metro-adjacent lake like ${name} is closer to the city's rhythm than a destination lake's. You can be on the dock for a Tuesday evening glass of wine in June and back at your desk on a 7am call from home Wednesday. Summer weeknights here are often the best part of ownership — quiet water, no weekend traffic, a couple of hours that change the whole shape of the week.</p>
            <p>Weekend summers are busier — ${name} is close enough to the cities that the day-tripper and short-stay crowd shows up — but that volume tends to compress into Saturday midday rather than spreading across the whole season. Mornings and evenings stay your own. By Sunday afternoon the lake clears out and you've got a few good hours before the work week starts again.</p>
            <p>Fall and winter are when metro-adjacent ownership pays off differently. The drive doesn't get worse the way north-country drives can in November sleet, so you actually keep using the property through shoulder season. Many ${name} owners go up for a Sunday brunch in October, a quiet weekend in December, the first warm Saturday in March. The proximity makes those off-season visits actually happen instead of just getting talked about.</p>
        `.trim();
    }

    if (flavor === 'wilderness') {
        return `
            <p>The seasons up at ${name} are louder than the seasons further south. Spring announces itself by ice-out, which is a literal event people drive up to watch. Summer is short and intense — the long-light evenings stretch past 10pm, the loons are everywhere, and there's a kind of green you don't see in the cities. Fall is short too: the colors come in fast and the cold comes in faster. Most owners have a window of about three weekends in late September and early October to be there for peak.</p>
            <p>Winter is when the wilderness lakes earn their reputation. The cold is real. The dark is dark. The snow stays. For the right owner, that's the entire point — ${name} in February is a fundamentally different place than ${name} in July, and the people who fall in love with it usually fall in love with the winter version even more than the summer one. Ice fishing here is meditative more than social. Cross-country trails connect right off the property. The Northern Lights show up on the right nights.</p>
            <p>The transitions matter most. Mud season in April and the first week of November when everything freezes — these are the times ${name} owners learn the property the most intimately, when nobody else is around and the lake is in flux. Owning a wilderness lake is owning the full cycle, and that's the reason people stay generations.</p>
        `.trim();
    }

    return `
        <p>A community lake like ${name} runs on a slower seasonal calendar than the destination lakes do. Summer fills up gradually — the same families opening up their places in mid-May, the dock parties starting around Memorial Day, the rhythm of weekends settling in by the second week of June. There's no peak-season chaos here; just a slow build that holds steady through August.</p>
        <p>Fall on ${name} is the locals' favorite season for a reason. The shoreline color comes in slowly across September. Boat traffic thins to a trickle. Fishing improves week over week. By the time the leaves drop in mid-October the lake is mostly back to the year-rounders — and that's a good time to be one of them. Sunset on a quiet lake in fall is its own argument for owning here.</p>
        <p>Winter on ${name} is genuinely quiet. Ice fishing is more individual than communal, the snowmobile traffic is lighter than on the bigger lakes nearby, and the lake feels like it belongs to whoever happens to be there that day. Spring breaks the silence with the first warm Saturdays — a slow build through April, the first dock-in mornings in early May, and the whole cycle starts again.</p>
    `.trim();
}

// ─── Town lifestyle copy (4 flavors × 3 paragraphs) ────────────────────────

function lifestyleHtmlForTown(tag) {
    const flavor = pickTownFlavor(tag.region);
    const name   = tag.name || 'this town';
    const region = tag.region || 'Minnesota';

    if (flavor === 'resort') {
        return `
            <p>${name} is a resort town in the truest sense — it lives by the seasonal calendar of the lakes around it, and the year here has a distinct shape because of that. The population swells in summer and contracts in winter. The restaurants that are packed in July are quieter and more local in October. The hardware store, the diner, the marina supply shop — these are the year-round constants, and they're where the actual town life happens once the weekenders go home.</p>
            <p>Owning property in or near ${name} puts you on both sides of that rhythm. Summer here is loud and full, with everything you'd want from a lake town — full restaurants, busy main street, festivals, dock parties, music on weekends. Off-season is when ${name} becomes a different place: slower, more neighborhood-feeling, the kind of town where people stop on the sidewalk to talk for ten minutes about nothing in particular.</p>
            <p>People who move to ${name} from elsewhere — the Twin Cities, the coasts, anywhere — tend to talk about the same things after a year. The light. The quiet at night. How quickly people start to know your name at the coffee shop. How much time gets given back to you when you stop spending it in traffic. There's a self-selection that happens in towns like ${name}; people who land here tend to mean it.</p>
        `.trim();
    }

    if (flavor === 'commuter') {
        return `
            <p>${name} sits close enough to the Twin Cities that a lot of owners here live a two-track life — work in the metro during the week, then ${name} on weekends and increasingly on Friday afternoons and Monday mornings. The commute is real but it's also a feature: it's enough distance that you actually decompress, but not so much that you have to think about it as a trip.</p>
            <p>That proximity shapes the town. Main street has the bones of a real small town but the amenities have stayed sharp because of the weekender economy — better restaurants than a town this size would otherwise support, a couple of coffee shops that take themselves seriously, retailers that have figured out the seasonal swings. Year-round residents keep the town honest; weekenders keep it ambitious.</p>
            <p>For people considering a second home or a full relocation, ${name} is the kind of town where the math actually works. You can keep one foot in the cities for as long as you want to and still feel like you're somewhere meaningfully different on the weekends. Most owners we work with in ${name} start as second-home buyers, then quietly start spending more time here over a few years, and one day realize they're not commuting in the direction they thought they were.</p>
        `.trim();
    }

    if (flavor === 'frontier') {
        return `
            <p>${name} is far enough north that it feels like a different state from the metro, which it nearly is. The pace here matches the geography — slow, deliberate, weather-aware. Towns like ${name} have a particular kind of resilience to them; the people who stay year-round have chosen something specific, and that decision shapes how the community functions.</p>
            <p>The amenities here are what they are: a few restaurants that do real work, a hardware store that actually stocks what you need, neighbors who notice when your driveway hasn't been plowed. What's missing is the metropolitan noise. What's present is light, water, sky, and the kind of human-scale community that's getting rare anywhere within driving distance of a real city.</p>
            <p>Owning here is an investment in a different kind of life rather than a different address. The people who buy second homes near ${name} tend to spend more time at them than they planned to, because the place rewards the time you put in. It's not a quick destination — it's an actual destination.</p>
        `.trim();
    }

    // 'mainstreet' default
    return `
        <p>${name} has the kind of texture that takes generations to build — the diner that's been there forever, the families who've owned cabins in the area for four decades, the new arrivals who fold in faster than they expect to. The pace is slower than the cities, not in a vacant way but in the deliberate way of a town that knows what it wants to be.</p>
        <p>${name} sits in ${region}, with the kind of small-town economy that holds steady through seasonal swings — local businesses that have figured out their year, regular fixtures everyone in town knows, and a yearly rhythm that anyone who's spent two seasons here can recognize on sight. Owning property here means stepping into that rhythm. The neighbors notice. The handshake at the coffee shop is genuine.</p>
        <p>People who move to ${name} talk about the same things after a year: how quiet the nights are, how fast people learn their names, how much time gets given back to them when they stop spending it on traffic. The buying decision is rarely about ${name} alone — it's usually about what kind of life you're trying to live, and ${name} just happens to be the place that supports that life best.</p>
    `.trim();
}

function seasonsHtmlForTown(tag) {
    const flavor = pickTownFlavor(tag.region);
    const name   = tag.name || 'this town';

    if (flavor === 'resort') {
        return `
            <p>The year in ${name} runs on the lake calendar. Memorial Day weekend is the first crowd of the season; by mid-June every place is full; by Labor Day the town starts to exhale. October is when the locals reclaim it — same restaurants, fewer waits, the leaves coming in across the lake basin, the kind of fall weekends people drive in for specifically.</p>
            <p>Winter changes the town more than people expect. The seasonal restaurants close. The marinas wind down. The handful of year-round places get tighter and friendlier. The ice fishing community shows up — different crowd, different rhythm, but still a busy lake town just in a less obvious way. Spring is the slow re-opening, weekend by weekend, until summer comes back around.</p>
            <p>Living year-round in ${name} means watching that rhythm from the inside rather than the outside. Most second-home owners who stay a few years end up spending more shoulder-season weekends here than they planned, because the off-season version of the town is, for a lot of people, the better one.</p>
        `.trim();
    }

    if (flavor === 'commuter') {
        return `
            <p>${name} doesn't have the dramatic seasonal swing of the far-north resort towns. Summer is busier, especially on Saturdays, but the town stays functional year-round because there's a real year-round resident population alongside the second-home owners. Winter doesn't empty the place out the way it does up north.</p>
            <p>The amenities run on a 12-month calendar — coffee shops, restaurants, services all open through every season — which makes the difference if you're planning to spend real time here outside of summer. Most owners we work with in ${name} discover that fall and spring are their highest-utilization seasons, not summer, because the property is usable and the metro is close enough that off-season trips actually happen.</p>
            <p>Winter weekends on the lake near ${name} are quieter than most people expect; the metro proximity means easy weekend trips, but it also means most weekenders stay south through the cold months. That leaves the lake to the locals and the year-round owners — which is exactly the audience that bought near ${name} on purpose.</p>
        `.trim();
    }

    if (flavor === 'frontier') {
        return `
            <p>${name} runs four real seasons, all of them honest. Summer is short and good — long light, warm water, the absolute peak of the regional tourism calendar. Fall is shorter and even better; the colors are stronger up here than they are anywhere south, and the air gets sharp in a way that earns the cliché. Winter is long, dark, snowy, beautiful — and not everyone is built for it. Spring shows up late but unmistakably.</p>
            <p>The town's economy adjusts in real time to the calendar. Summer staffing levels are visibly different from winter levels. The places that stay open year-round are the ones that anchor the community. The places that close in November and reopen in May are the ones that depend on tourism to survive — which is most of them.</p>
            <p>That seasonal honesty is what owners here value most. ${name} doesn't pretend to be something it isn't. The people who buy property here have, almost universally, fallen for the place at one specific time of year and then come back to learn the others. Owning here long-term means owning all four seasons.</p>
        `.trim();
    }

    return `
        <p>${name} runs on a slower seasonal calendar than the bigger destination towns do. Summer is busy but not overwhelming — markets, festivals, the standard fixtures of a small Minnesota town with a lake nearby. Fall is quietly the best season here: the colors come in slowly, the air sharpens, the patio dinners last until the first cold snap.</p>
        <p>Winter doesn't empty ${name} the way it does the resort towns. There's a real year-round population that keeps everything functional — the coffee shop, the hardware store, the diner that's been there forever. Snow days have a particular kind of community character; the snowplow shows up early, the regulars are at the regular places.</p>
        <p>Spring is the slow re-opening. The lake ice breaks up sometime in April. The first patio Saturday is usually in late April or early May. By Memorial Day the town has shaken off winter completely and is rolling into its next year. Living through the full cycle is what makes ${name} feel like home, faster than people expect it to.</p>
    `.trim();
}

module.exports = {
    pickLakeFlavor,
    pickTownFlavor,
    lifestyleHtmlForLake,
    seasonsHtmlForLake,
    lifestyleHtmlForTown,
    seasonsHtmlForTown,
};
