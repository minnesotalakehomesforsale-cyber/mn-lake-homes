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
    // ← Tier-1 lake content pasted here, one object per lake (15 total).
];

const TOWNS = [
    // ← Phase-1 town content pasted here (Brainerd/Baxter, Nisswa, Crosslake,
    //   Alexandria, Walker, Park Rapids, Bemidji, Ely — skip the 3 that exist).
];

module.exports = { LAKES, TOWNS };
