/**
 * tier2-content.js — Tier-2 lake page content (DEV-05 T2), authored to the Lake
 * Page Template Spec (v1), sections A–H. Wired in by seedTier2Content() the same
 * way as Tier-1: content-hashed per entry so it applies once and never clobbers
 * a later admin edit unless this file changes.
 *
 * Field mapping (per Director of Marketing hand-off):
 *   A  meta title            → seo_title
 *      meta description      → seo_description
 *      sub-headline          → intro_text        (hero lead; see NOTE below)
 *   B  "Where it is"         → description ¶1
 *      "Size, depth…"+"Who…" → description ¶2–3
 *      "What people do"+"Town" → lifestyle_text
 *      "Notable features"    → notable_features  (one bullet per line)
 *   C  property types + price drivers + the deliberate-drawback ¶ → real_estate_context
 *      "Seasonality"         → seasons_text
 *   G  FAQ (8 Q&As)          → faq  [{q,a}]
 *   D/E/F dynamic blocks, H dev/flag log, and "Dev/Partnerships note" lines
 *      NEVER render — excluded here.
 *   Non-flagged numerics → stats{} (written to DNR columns only when clean);
 *      ranged / UNVERIFIED / absent figures are omitted (left NULL), and live
 *      in the prose instead. `[verify …]` tags are stripped.
 *
 * NOTE on the hero: Tier-1's intro_text is the punchy hero one-liner, which is
 * what the sub-headline is — so the sub-headline is mapped to intro_text and
 * "Where it is" opens the description. (Your literal note said "Where it is →
 * intro_text"; this is the one place I deviated, because intro_text is the hero
 * lead. Flag it and I'll swap.)
 */
const LAKES = [
    {
        slug: 'lake-independence', kind: 'lake',
        seo_title: 'Lake Independence Homes for Sale | MN Lake Homes',
        seo_description: 'Lake Independence homes for sale in Medina and Independence, Minnesota. 830 acres, 58 ft deep, Baker Park Reserve shoreline, 30 min from Minneapolis. Get matched free.',
        intro_text: '830 acres half an hour from Minneapolis, with Baker Park Reserve forming its entire southeast shore — cabins and estates side by side. Get matched with an agent who knows it.',
        description: `Lake Independence straddles the cities of Independence and Medina in western Hennepin County, with Maple Plain adjoining to the east. Maple Plain is about 20 miles and 27 minutes from downtown Minneapolis via US-12 — comfortably commutable.

The lake covers roughly 832–851 acres with 7 miles of shoreline and a maximum depth of 58 feet. Average depth isn't published.

Genuinely mixed, and that's the interesting part. Small original one-bedroom cabins — some preserved and renovated as retreats — sit alongside multi-acre estate homes and newer lakefront townhome development. Of all the metro lakes in this tier, Independence has the clearest cabin-to-year-round conversion story still visibly in progress.`,
        lifestyle_text: `Walleye, largemouth bass, northern pike, muskie, crappie, bluegill and perch. Baker Park Reserve — roughly 2,700 acres run by Three Rivers Park District — forms the entire southeast shoreline, with a two-lane boat ramp, swimming beach and shore fishing. The lake is served by the Orono School District.

Maple Plain, Medina and Independence cover local services; Wayzata and the western suburbs are close, and downtown Minneapolis is under half an hour. Baker Park Reserve is an amenity in its own right.`,
        notable_features: `Baker Park Reserve forms the entire southeast shore — roughly 2,700 acres of permanent public green space, not future development
27 minutes from downtown Minneapolis via US-12
58 feet deep on 832–851 acres
A visible cabin-to-estate mix — one-bedroom originals beside multi-acre estate homes
Orono School District`,
        real_estate_context: `Typical property types: Original small cabins (some beautifully renovated), multi-acre estate homes, and newer lakefront townhomes. Few metro lakes offer this much variety in one place.

What drives price here: Lot size and whether a property is an original cabin, a renovation or a newer build. Because the stock varies so widely, comparable sales need care here — a job for someone who knows the lake.

Water quality is the honest headline, and it's poor. Lake Independence grades D (Poor) with clarity at 4.8 feet and phosphorus at 68.8 µg/L; it's classified eutrophic and swimming is not recommended on current data. It was designated an MPCA impaired water in 2003 and carries a formal TMDL restoration plan from 2007 targeting a 23% phosphorus reduction. Sources cited include agricultural runoff, animal waste, urban development, failing septic systems and geese. Phosphorus has been improving over the recent monitoring window. A buyer who wants swimmable clear water should probably look elsewhere; a buyer who wants land, space, park frontage and a metro commute may still find this the right lake. They just need to be told.`,
        seasons_text: `Year-round metro demand. Inventory varies widely in type, which makes timing less predictable than on a uniform suburban lake.`,
        faq: [
            { q: 'How big and deep is Lake Independence?', a: "Roughly 832–851 acres with 7 miles of shoreline and a maximum depth of 58 feet. Average depth isn't published." },
            { q: "What's the water quality like?", a: 'Poor, and buyers should know before they visit. The lake grades D with clarity at 4.8 feet and high phosphorus, is classified eutrophic, and swimming is not recommended on current data. It was designated an impaired water in 2003 with a formal restoration plan from 2007. Phosphorus has been improving in recent monitoring.' },
            { q: 'Why would someone buy here anyway?', a: 'Space, lot size, Baker Park Reserve frontage, the Orono School District, and a 27-minute drive to downtown Minneapolis. For buyers weighting land and location over swimming, it can be the right trade — it just has to be a conscious one.' },
            { q: 'What is Baker Park Reserve?', a: 'A roughly 2,700-acre Three Rivers Park District reserve that forms the entire southeast shoreline, with a two-lane boat ramp, swimming beach and shore fishing. It means that shore will never be developed.' },
            { q: 'What kinds of homes are on the lake?', a: 'An unusually wide mix — small original one-bedroom cabins, multi-acre estate homes, and newer lakefront townhomes.' },
            { q: 'What fish are in the lake?', a: 'Walleye, largemouth bass, northern pike, muskie, crappie, bluegill and perch.' },
            { q: 'Are there boating restrictions?', a: 'Yes — a slow-no-wake ordinance triggers at 957.8 feet lake elevation for three consecutive days, enforced jointly by Medina and Independence.' },
            { q: 'How do I see new listings?', a: 'Use the form on this page, or get matched with a local agent who can send them the day they hit MLS.' },
        ],
        // Clean, non-flagged numerics only. surface_acres omitted (832–851 range);
        // mean_depth_ft omitted (UNVERIFIED). Prose carries both.
        stats: { max_depth_ft: 58, water_clarity_ft: 4.8, shoreline_miles: 7 },
    },
];

module.exports = { LAKES };
