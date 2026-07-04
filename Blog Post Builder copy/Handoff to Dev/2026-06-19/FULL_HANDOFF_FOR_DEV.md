# Blog Handoff for Dev — 2026-06-19

This file is **self-contained**: it has every decision, the hero-image download table, and all 3 posts' full markdown inline. You can publish from this file alone — no dependency on the Cowork folder.

**Batch:** 3 posts, all on **Mille Lacs Lake** (Tier-1 lake, core trio: buyer guide · lifestyle · comparison).

---

## Decisions (apply to all 3 posts)

- **Money-page URLs are PLURAL:** `/lakes/<slug>/` and `/towns/<slug>/`. Blog route is clean `/blog/<slug>/`.
- **Blog slugs are place-nested:** `/blog/mille-lacs-lake/<topic>/`.
- **Visible badge = the `public_category`** below, chosen per post (HARD RULE 2). The `internal_bucket` is for our tracking only — **do NOT render it on the page.**
- **Author:** MN Lake Homes editorial. **Published date:** 2026-06-19.
- **SEO fields:** each post has `seo_title` (place in first 60 chars) and `seo_description` (145–160 chars) below.
- **Schema per post:** `Article` + `BreadcrumbList` (Home › Blog › Mille Lacs Lake › [Post]). No FAQ blocks in these posts, so no FAQ schema.
- **Tagging:** Posts 1 & 2 → Mille Lacs Lake. Post 3 → Mille Lacs Lake **and** Gull Lake (appears in both "From the blog" modules).
- **External links** open in a new tab (`rel="noopener"`), MN DNR / MN Dept. of Health only.

### ⚠️ HARD RULE 1 — Mille Lacs money page is NOT yet linked (read this)
`/lakes/mille-lacs-lake/` is **PENDING DEV CONFIRMATION** in the Live Money Pages Registry — NOT confirmed live. Per HARD RULE 1, none of these posts hyperlink the Mille Lacs money page; **Mille Lacs is named in prose only.** The "up to money page" links instead point to confirmed-live nearby pages (`/lakes/gull-lake/`, `/towns/brainerd/`, `/lakes/whitefish-chain/`), framed honestly as the surrounding central-Minnesota / Brainerd-lakes region. **Once the dev confirms `/lakes/mille-lacs-lake/` is live and its geo tag is correct,** add 3x up-links to it in each post and promote the slug to CONFIRMED LIVE in the registry. Until then, every internal link below is verified live or in-batch — zero dead links.

---

## Hero images — download these (Pexels License: free commercial use, no attribution required)

| Post | Direct download URL | Save path (suggested) | Crop |
|---|---|---|---|
| 1 — Buyer's Guide | https://images.pexels.com/photos/5209619/pexels-photo-5209619.jpeg | `/assets/images/blog/hero-mille-lacs-buyers-guide-2026.jpg` | portrait → 1600x900, keep blue open water + pine far shore |
| 2 — Living On | https://images.pexels.com/photos/6294067/pexels-photo-6294067.jpeg | `/assets/images/blog/hero-mille-lacs-living.jpg` | landscape → 1600x900, keep dock + moored boat lower-center |
| 3 — vs. Gull Lake | https://images.pexels.com/photos/14924834/pexels-photo-14924834.jpeg | `/assets/images/blog/hero-mille-lacs-vs-gull-lake.jpg` | portrait → 1600x900, keep wooded far shore + reflection |

(Same images are in this handoff folder as `hero_*.jpg` if you'd rather copy them directly. License terms: https://www.pexels.com/license/)

---

# POST 1 — Mille Lacs Lake Buyer's Guide 2026

```yaml
title: "Mille Lacs Lake Buyer's Guide 2026: What to Know Before You Buy"
slug: /blog/mille-lacs-lake/buyers-guide-2026/
seo_title: "Mille Lacs Lake Buyer's Guide 2026: What to Know Before You Buy"
seo_description: "Buying on Mille Lacs Lake in 2026? Price bands, big-water realities, docks, and shoreline rules — plus how to get matched with a vetted, local lake agent."
public_category: "Mille Lacs Buyer Guide"   # VISIBLE badge
internal_bucket: "Tier-1 Lake / Buyer Guide (#8)" # tracking only — do not render
tag_to: [Mille Lacs Lake]
author: MN Lake Homes editorial
published: 2026-06-19
hero: /assets/images/blog/hero-mille-lacs-buyers-guide-2026.jpg
hero_alt: "Wide blue open water of a northern Minnesota lake under a clear summer sky, ringed by pine-forested shoreline."
schema: [Article, BreadcrumbList]
```

# Mille Lacs Lake Buyer's Guide 2026: What to Know Before You Buy

Mille Lacs is the lake a lot of Minnesotans picture when they think "up north" without the long drive. At roughly 132,500 acres it's the state's second-largest inland lake, yet it sits just an hour and a half to two hours north of the Twin Cities — close enough for a Friday-night run to the cabin, big enough that you can lose the far shore over the horizon. For buyers, that combination is the whole appeal: real big-water living, a deep fishing culture, and prices that are still down to earth compared with the metro lakes. This guide walks through what actually moves the decision on Mille Lacs in 2026.

## First, understand what kind of lake Mille Lacs is

Mille Lacs is wide, round, and shallow for its size — about 42 feet at its deepest and averaging closer to 29 feet, spread across some 207 square miles with roughly 90 miles of shoreline. That shape matters more than it sounds. A big, shallow basin means the lake can build real waves when the wind comes up, so the side of the lake you buy on and the quality of your shoreline and dock setup are practical decisions, not just view decisions. It also means the lake freezes hard and early, which is exactly why Mille Lacs is one of the most famous ice-fishing destinations in the country.

The shoreline is ringed by small, unpretentious towns — Garrison, Isle, Onamia, Wahkon, and Malmo among them — and the Mille Lacs Band of Ojibwe community sits on the south shore. This is not a manicured, gated-estate lake. It's a fishing-and-cabin lake with a strong year-round identity, and that character is a big part of what your money buys. If you want a sense of the day-to-day rhythm before you commit, read our companion piece on [what it's really like to live on Mille Lacs](/blog/mille-lacs-lake/what-its-like-to-live-on/).

## 2026 price bands: what your money buys

Here's the headline most metro buyers are surprised by: Mille Lacs is genuinely attainable. In mid-2026 the active lake-property market was averaging in the low $400,000s, with a range that runs from rustic cabins under $100,000 all the way up to a thin tier of larger lake homes and estates above $1 million. Treat those as orientation bands, not appraisals — the live, current numbers come from the MLS feed on the lake page once it's live.

In rough 2026 terms:

- **Off-water and lake-access cabins** — the entry point, often well under six figures for something rustic and seasonal.
- **Modest year-round waterfront** — updated former cabins and smaller lake homes, the realistic "we actually live on Mille Lacs" tier in the mid-to-upper hundreds.
- **Larger lake homes and the occasional estate** — the top of the market, above $1 million, and comparatively rare here.

Because the spread is wide and the inventory turns over fast on the best frontage, the same phrase — "a place on Mille Lacs" — can mean a $90,000 fishing cabin or a $1.2 million year-round home. Get specific early about which tier you're really shopping. If you're weighing Mille Lacs against the pricier, more resort-oriented Brainerd lakes, our [Mille Lacs vs. Gull Lake comparison](/blog/mille-lacs-lake/vs-gull-lake/) lays the two side by side, and you can see current Brainerd-area numbers on the [Gull Lake homes for sale page](/lakes/gull-lake/).

## Big water means the shoreline decision is everything

On a deep, sheltered lake you can be a little casual about which stretch of shore you buy. On Mille Lacs you can't. A shallow, exposed basin means wind, wave action, and ice push all behave differently depending on which side you're on and how protected your frontage is. North- and west-facing shorelines catch different weather than the tucked-in bays. Dockability, how well a boat lift holds up, swimming conditions, and even how the ice heaves against your shore in spring all turn on this. A local agent who actually knows the lake will steer you toward the right stretch of shoreline first — not just the right listing. That's the gap we dig into in [why a general agent isn't enough on lakefront](/blog/buying-lakefront-why-a-general-agent-isnt-enough/).

## Docks, shoreline rules, and what you can actually build

A dock is not automatic, and what you may install is governed by Minnesota's statewide shoreland rules plus the local ordinances administered through the county your stretch sits in (Mille Lacs wraps parts of Mille Lacs, Aitkin, and Crow Wing counties). Setbacks, dock length, the number of watercraft, and any shoreline alteration are all regulated. Before you assume you can add a slip, a bigger dock, or a boat lift, confirm what the classification of that shoreline allows. Read it straight from the source: the [Minnesota DNR shoreland regulations overview](https://www.dnr.state.mn.us/waters/watermgmt_section/shoreland/regulations.html) and the [DNR's guidance on whether a water permit is required](https://www.dnr.state.mn.us/permits/water/needpermit.html) for docks and shoreline work.

## Fishing regulations are part of the deal here

Mille Lacs is a walleye lake first — arguably the state's most famous walleye factory — along with trophy smallmouth bass, northern pike, muskie, and a strong winter bite. But it also has **special, season-specific fishing regulations** that change for the winter (starting Dec. 1) and open-water (starting in May) seasons, and they shift year to year as the walleye population is managed. If fishing is a core reason you're buying, read the current rules before you close, not after. The DNR keeps the [Mille Lacs Lake fishing regulations](https://www.dnr.state.mn.us/fishing/millelacs.html) and the broader [Mille Lacs Lake management overview](https://www.dnr.state.mn.us/millelacslake/index.html) current. None of this should scare you off — it's just part of buying on a managed trophy lake, and a local agent will know how it shapes resort, guide, and cabin demand.

## Depth, water, wells, and the practical stuff

Pull the lake survey, depth map, and water-clarity history for free from the [Minnesota DNR LakeFinder](https://www.dnr.state.mn.us/lakefind/index.html) before you ever set foot on a dock — it's the fastest way to understand a specific stretch. Many Mille Lacs properties, especially older cabins, run on a private well and septic rather than municipal service, so confirm what you're inheriting. The [Minnesota Department of Health's private-well guidance](https://www.health.state.mn.us/communities/environment/water/wells/) is the place to understand what owning a well actually involves — testing, maintenance, and what to ask for during inspection.

## Seasonality: when to buy in 2026

Lakefront inventory in Minnesota follows the calendar hard. Listings bloom from ice-out through early summer, and that's when buyers see the most choice — and the most competition for the best frontage. On Mille Lacs there's a second rhythm worth knowing: a meaningful slice of the market is fishing- and resort-driven, so demand spikes around the open-water opener in May and again heading into the ice-fishing season. Late fall and winter bring fewer listings but more motivated sellers. If you want maximum selection, shop spring into summer; if you want negotiating room, the quieter months reward patience.

## How to actually win on Mille Lacs

Mille Lacs rewards buyers who understand it as a big-water, fishing-first lake rather than treating it like a generic "lake home" search. The people who do well here work with an agent who knows which shoreline holds up to the wind, what a fair price is on that stretch, how the fishing regulations move resort and cabin demand, and how to act when the right place lists. That's exactly the gap our service closes: we match you with a vetted, licensed, local agent who specializes in this part of central Minnesota, so you're not learning the lake on the fly. It's free to you, and we work with agents at every brokerage — more on what that screening actually means in [what "vetted, licensed, local" really means](/blog/what-vetted-licensed-local-means/), and on the mechanics in [how lake-home matching works](/blog/how-lake-home-matching-works-and-why-its-free-to-you/).

If you're casting a wider net across central Minnesota, it's worth getting to know the nearby Brainerd lakes country too — the hub town of [Brainerd](/towns/brainerd/) and resort-chain lakes like the [Whitefish Chain](/lakes/whitefish-chain/) sit less than an hour west and draw many of the same buyers.

## Ready to start?

Tell us what you're looking for on Mille Lacs — the shoreline, the budget, fishing cabin or year-round home — and we'll match you with the right local agent and guide you the whole way. [Get matched now](/). We do the vetting so you don't have to.

---

# POST 2 — What It's Like to Live on Mille Lacs Lake

```yaml
title: "What It's Like to Live on Mille Lacs Lake"
slug: /blog/mille-lacs-lake/what-its-like-to-live-on/
seo_title: "What It's Like to Live on Mille Lacs Lake (2026)"
seo_description: "What it's really like to live on Mille Lacs Lake: big-water rhythms, fishing culture, the towns, winter, and how to get matched with a vetted local agent."
public_category: "Mille Lacs Lifestyle"   # VISIBLE badge
internal_bucket: "Tier-1 Lake / Lifestyle (#7)" # tracking only — do not render
tag_to: [Mille Lacs Lake]
author: MN Lake Homes editorial
published: 2026-06-19
hero: /assets/images/blog/hero-mille-lacs-living.jpg
hero_alt: "A simple wooden dock with a moored boat reaching into the wide open water of a Minnesota lake on a calm day."
schema: [Article, BreadcrumbList]
```

# What It's Like to Live on Mille Lacs Lake

Ask someone who owns on Mille Lacs what they love about it and they rarely lead with the house. They lead with the water — how big it feels, how the wind writes the day, how the lake is just as alive in January as it is in July. Mille Lacs isn't a trophy-home lake or a see-and-be-seen lake. It's a working, year-round, fishing-and-cabin lake an easy hour and a half to two hours north of the Twin Cities, and that identity shapes everything about what living there is actually like. Here's the honest picture.

## The lake sets the pace

The first thing that surprises new owners is the scale. At roughly 132,500 acres, Mille Lacs is Minnesota's second-largest inland lake, and it's wide and relatively shallow — about 42 feet at its deepest. A big, open basin like that makes its own weather. Calm glassy mornings give way to real chop by afternoon when the wind comes up, and you learn to read the lake before you launch. Owners plan around it: early fishing runs, mid-day projects, evenings back on the water once it settles. It's less "infinity-edge serenity" and more "respect the big water," and people who love Mille Lacs love it for exactly that.

That same scale is why the lake is a four-season place rather than a summer-only one. When it freezes — hard and early — it becomes one of the most famous ice-fishing destinations in the country, with fish houses dotting the ice and plowed ice roads turning the lake into a winter neighborhood of its own. Living here means owning all twelve months, not just June through August.

## Fishing is the culture, not just a hobby

You don't have to fish to live on Mille Lacs, but you'll be surrounded by people who do, and it sets the social rhythm of the lake. Mille Lacs is the state's most famous walleye water, with trophy smallmouth bass, northern pike, and muskie in the mix. The open-water opener in May and the start of the ice-fishing season are genuine local events. Resorts, bait shops, guides, and launches structure the shoreline economy. One practical note for owners: Mille Lacs carries special, season-specific fishing regulations that change between winter and open water and shift year to year as the walleye population is managed. It's worth following the DNR's [Mille Lacs Lake overview](https://www.dnr.state.mn.us/millelacslake/index.html) and the current [Mille Lacs fishing regulations](https://www.dnr.state.mn.us/fishing/millelacs.html) — they're part of the rhythm of the place. If you want the buying-side view of all this, our [Mille Lacs buyer's guide](/blog/mille-lacs-lake/buyers-guide-2026/) covers how the fishing culture shapes the market.

## The towns: small, friendly, unpretentious

Mille Lacs is ringed by small towns that each have a little personality — Garrison on the northwest with its famous walleye statue, Isle on the southeast, Onamia to the south, plus Wahkon and Malmo. You won't find big-box sprawl on the shore; you'll find bait shops, supper clubs, a handful of golf courses, county parks, and the kind of cafe where the regulars know each other. The Mille Lacs Band of Ojibwe community on the south shore is part of the area's identity and history, including the Mille Lacs Indian Museum. For everyday errands and bigger shopping, many owners drive west to the Brainerd lakes area; the hub town of [Brainerd](/towns/brainerd/) is well under an hour away and anchors that whole region of central Minnesota.

The trade-off is real and worth naming: services are spread out, winters are long, and "running to the store" is a drive. People who thrive here see that as the point. People who want walkable amenities and a short commute may be happier on a metro lake — and that's a fair comparison to make before you buy.

## Owning the practical realities

A cabin or lake home on Mille Lacs comes with the ordinary realities of big-water, semi-rural ownership. Many properties, especially older cabins, run on a private well and septic system rather than municipal service, so part of living here is maintaining your own water — the [Minnesota Department of Health's private-well guidance](https://www.health.state.mn.us/communities/environment/water/wells/) is the place to understand testing and upkeep. Shoreline care matters too: what you can build, dock, or alter is governed by [Minnesota's shoreland regulations](https://www.dnr.state.mn.us/waters/watermgmt_section/shoreland/regulations.html), and on a shallow, wind-exposed basin the durability of your dock and lift is a genuine consideration. You can pull the depth map and water-clarity history for any stretch from the [Minnesota DNR LakeFinder](https://www.dnr.state.mn.us/lakefind/index.html) before you buy.

## Who's happiest on Mille Lacs

The owners who love living here tend to share a profile: they want big, real water without a metro price tag; they value fishing and the outdoors over nightlife and amenities; and they're comfortable with the rhythms of a four-season, semi-rural lake. It's a fantastic fit for that buyer and a poor fit for someone expecting a polished resort scene at their doorstep. If you lean toward the resort-and-recreation experience — clearer water, golf, more developed shoreline — the Brainerd lakes are the natural alternative, and our [Mille Lacs vs. Gull Lake comparison](/blog/mille-lacs-lake/vs-gull-lake/) walks through that exact decision. You can also browse the resort-lake feel on the [Gull Lake homes for sale page](/lakes/gull-lake/) or the [Whitefish Chain](/lakes/whitefish-chain/).

## How a local agent helps you live the version you want

The difference between loving and tolerating life on Mille Lacs often comes down to buying the right stretch of shoreline for how you actually want to live — protected water if you've got kids and a swim raft in mind, open exposure if you're chasing sunsets and big views, proximity to a particular town if that's where your people are. A local specialist knows those distinctions cold. That's what we do: we match you with a vetted, licensed, local agent who knows this part of central Minnesota, free to you, working with agents at every brokerage. If you're new to the whole process, start with [how to work with a lake-specialist agent](/blog/how-to-work-with-a-lake-specialist-agent/) and [why a local lake specialist beats a national portal](/blog/why-a-local-lake-specialist-beats-a-national-portal/).

## Come see it for yourself

If big water, a deep fishing culture, and an honest, unpretentious lake town sound like your kind of life, Mille Lacs delivers it. Tell us what you're picturing and we'll match you with the right local agent to find it. [Get matched now](/) — we'll guide you the whole way.

---

# POST 3 — Mille Lacs Lake vs. Gull Lake

```yaml
title: "Mille Lacs Lake vs. Gull Lake"
slug: /blog/mille-lacs-lake/vs-gull-lake/
seo_title: "Mille Lacs vs. Gull Lake: Which Minnesota Lake Is Right for You"
seo_description: "Mille Lacs vs. Gull Lake in 2026: big-water fishing lake or resort-and-recreation lake? Price, character, and fit — plus how to get matched with a local agent."
public_category: "Choosing a Lake"   # VISIBLE badge
internal_bucket: "Tier-1 Lake / Comparison (#26)" # tracking only — do not render
tag_to: [Mille Lacs Lake, Gull Lake]   # appears in BOTH "From the blog" modules
author: MN Lake Homes editorial
published: 2026-06-19
hero: /assets/images/blog/hero-mille-lacs-vs-gull-lake.jpg
hero_alt: "A calm Minnesota lake under a clear sky, with a wooded shoreline mirrored in the still water."
schema: [Article, BreadcrumbList]
```

# Mille Lacs vs. Gull Lake: Which Minnesota Lake Is Right for You?

Both lakes sit in central Minnesota, both are within easy reach of the Twin Cities, and both are names every Minnesota lake shopper eventually says out loud. But Mille Lacs and Gull Lake are nearly opposite answers to the same question. One is enormous, shallow, and fishing-first; the other is smaller, deeper, clearer, and built around resorts and recreation. Pick the lake that matches how you actually want to spend your weekends, and the right home gets a lot easier to find. Here's how the two compare in 2026.

## The two lakes at a glance

**Mille Lacs** is the state's second-largest inland lake — roughly 132,500 acres of wide, open, relatively shallow water (about 42 feet at its deepest). It's ringed by small, unpretentious towns like Garrison, Isle, and Onamia, and its identity is fishing: it's arguably Minnesota's most famous walleye lake and a national-caliber ice-fishing destination. It sits about an hour and a half to two hours north of the metro.

**Gull Lake**, near Brainerd and Nisswa, is about 9,900 acres and the centerpiece of a connected chain of lakes. It's deeper (around 80 feet at its deepest) and noticeably clearer, spring-fed, with water clarity around ten feet. It's the heart of resort country — Cragun's, Madden's, and Grand View Lodge are all here — with golf, marinas, and a polished recreation scene. You can see the current market on the [Gull Lake homes for sale page](/lakes/gull-lake/).

## Price: the biggest practical difference

This is where the two lakes separate most clearly. Mille Lacs is genuinely attainable — mid-2026 lake-property listings averaged in the low $400,000s, with rustic cabins available under $100,000 and only a thin tier above $1 million. Gull Lake runs substantially higher: typical home values in the East Gull Lake area sit north of half a million dollars, and prime frontage and estates climb into the millions, with the very top of the market reaching eight figures.

Put simply: on Mille Lacs your budget buys more water and more shoreline; on Gull Lake you're paying a premium for clearer water, deeper recreation, and the resort-chain lifestyle. If keeping the number down matters most, Mille Lacs wins. If the experience and the amenities justify the spend, Gull Lake earns it. Our [Mille Lacs buyer's guide](/blog/mille-lacs-lake/buyers-guide-2026/) breaks down the Mille Lacs price ladder in more detail.

## Water and recreation: walleye factory vs. all-around playground

On Mille Lacs, the water is the sport. It's big, it can get rough when the wind blows, and the culture is built around fishing in every season — walleye above all, plus smallmouth, pike, and muskie, and a legendary winter ice-fishing scene. Note that Mille Lacs carries special, season-specific fishing regulations that change year to year; the DNR keeps the [current Mille Lacs regulations](https://www.dnr.state.mn.us/fishing/millelacs.html) posted.

Gull Lake is the all-around playground. The clearer, deeper water and chain-of-lakes layout make it a favorite for boating, water-skiing, swimming, and cruising between lakes, with golf and resort dining woven through the experience. It fishes well too, but the lake's center of gravity is recreation and lifestyle rather than serious angling. You can compare the surveys and depth maps for either lake free on the [Minnesota DNR LakeFinder](https://www.dnr.state.mn.us/lakefind/index.html).

## Character and community

Mille Lacs feels like the working north woods: small towns, supper clubs, bait shops, county parks, and a strong year-round local population mixed with cabin owners. It's unpretentious and four-season by nature. Gull Lake feels more like a polished resort community — second homes from Twin Cities families, a lively summer season, and the amenities of the Brainerd-Nisswa corridor close at hand. The hub town of [Brainerd](/towns/brainerd/) anchors that whole area, and the nearby [Whitefish Chain](/lakes/whitefish-chain/) offers a similar resort-lake feel if Gull's prices stretch the budget.

If you want the deeper lifestyle picture on each, read [what it's like to live on Mille Lacs](/blog/mille-lacs-lake/what-its-like-to-live-on/), and for a metro-versus-up-north contrast, our earlier [Lake Minnetonka vs. Gull Lake comparison](/blog/lake-minnetonka/vs-gull-lake/) is a useful companion.

## So which one is right for you?

Choose **Mille Lacs** if you want maximum water for your money, you're a fisher first, you're comfortable with a big, sometimes-rough basin and a quieter, four-season small-town setting, and you don't need resort amenities at your door.

Choose **Gull Lake** if you want clearer, deeper water, an active boating-and-recreation scene, golf and resort dining nearby, and you're willing to pay a premium for that polished, chain-of-lakes lifestyle.

There's no wrong answer — there's only the lake that fits your weekends. And the honest truth is that the listings sites flatten both lakes into a single price number that hides everything that actually matters: which shoreline, which town, which season, which community. That's the gap a local specialist closes, which is exactly why [a general agent isn't enough on lakefront](/blog/buying-lakefront-why-a-general-agent-isnt-enough/).

## Let us match you to the right lake — and the right agent

Still torn between the two? That's normal, and it's a good problem to bring us. Tell us how you want to spend your time on the water and your budget, and we'll match you with a vetted, licensed, local agent who knows both lakes and can show you honestly where you'll be happiest. It's free to you, and we work with agents at every brokerage. [Get matched now](/) and we'll guide you the whole way.

---

## Pre-publish link check (all 3 posts)
- [x] 8–12 contextual links each, all four buckets represented (UP money / ACROSS blogs / AGENT-matching / OUT external).
- [x] Every internal target is CONFIRMED LIVE (`/`, `/lakes/gull-lake/`, `/lakes/whitefish-chain/`, `/towns/brainerd/`) or in today's batch — **zero dead links**.
- [x] **Mille Lacs money page deliberately NOT linked** (HARD RULE 1 — pending dev confirmation). Add once confirmed live.
- [x] Every external URL is MN DNR / MN Dept. of Health (Approved Sources, re-verified at build); no competitors linked.
- [x] No specific paid-agent deep links; matching framed as "get matched with a vetted, licensed, local agent."
- [x] Visible badges are reader-facing (HARD RULE 2); internal buckets are tracking-only.

## Dev questions raised by this batch
1. Is `/lakes/mille-lacs-lake/` live yet, and is its geo tag correct? If so, we'll add 3x up-links per post and tag posts 1–3 to Mille Lacs.
2. Confirm the exact live slug for Mille Lacs (expected `/lakes/mille-lacs-lake/`) so the registry and tags match.
