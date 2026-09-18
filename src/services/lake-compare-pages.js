'use strict';

// SEOP03 — lake-vs-lake comparison pages (/compare/[a]-vs-[b]).
//
// Buyers deciding between two nearby lakes search "gull lake vs whitefish chain"
// — a real, high-intent query with no good answer online. We answer it from the
// DNR facts we store (size, depth, clarity, shoreline, accesses, fish), plus the
// homes-for-sale angle, and link out to both lake pages.
//
// To avoid the classic thin-content trap (every lake × every lake = thousands of
// near-empty pairings), comparisons are CURATED, not cartesian:
//   • both lakes must be published and in the SAME region (peers buyers weigh),
//   • both must have real comparison facts (surface_acres AND max_depth_ft),
//   • within a region we pair lakes CONSECUTIVELY by size — a chain (biggest vs
//     2nd, 2nd vs 3rd, …), n-1 pairs per region instead of n².
// Anything short of the fact floor renders noindex, so this stays correctly held
// back until DNR enrichment (scripts/backfill-dnr.js) populates the facts.

const pool = require('../database/pool');

// A pair is "fact-complete" — comparable — only with both core metrics present.
const factComplete = l => l.surface_acres != null && l.max_depth_ft != null;

// Canonical, order-independent pair slug: always the two slugs sorted, joined by
// "-vs-". So gull-vs-whitefish and whitefish-vs-gull resolve to one URL.
function pairSlug(a, b) {
    return [a, b].map(s => String(s || '')).sort().join('-vs-');
}

// Split a "a-vs-b" slug back into its two lake slugs (or null if malformed).
function splitPair(slug) {
    const m = String(slug || '').split('-vs-');
    if (m.length !== 2 || !m[0] || !m[1]) return null;
    return [m[0], m[1]];
}

async function _publishedInRegions() {
    const { rows } = await pool.query(
        `SELECT slug, name, region, county, hero_image_url, surface_acres, max_depth_ft,
                mean_depth_ft, water_clarity_ft, shoreline_miles, public_accesses, fish_species
           FROM lakes
          WHERE status = 'published' AND COALESCE(region, '') <> ''`);
    return rows;
}

// Curated peer pairs: consecutive-by-size within each region, both fact-complete.
async function listComparisons() {
    const rows = await _publishedInRegions();
    const byRegion = new Map();
    for (const l of rows) {
        if (!factComplete(l)) continue;
        if (!byRegion.has(l.region)) byRegion.set(l.region, []);
        byRegion.get(l.region).push(l);
    }
    const pairs = [];
    for (const [, lakes] of byRegion) {
        lakes.sort((a, b) => (b.surface_acres || 0) - (a.surface_acres || 0) || a.name.localeCompare(b.name));
        for (let i = 0; i + 1 < lakes.length; i++) {
            const a = lakes[i], b = lakes[i + 1];
            pairs.push({ slug: pairSlug(a.slug, b.slug), a: a.slug, b: b.slug, region: a.region });
        }
    }
    return pairs;
}

const parseSpecies = v => { if (Array.isArray(v)) return v; try { return JSON.parse(v || '[]'); } catch { return []; } };

async function comparePage(pairSlugStr) {
    const parts = splitPair(pairSlugStr);
    if (!parts) return null;
    const [sa, sb] = parts;
    if (sa === sb) return null;

    const rows = await _publishedInRegions();
    const a = rows.find(l => l.slug === sa);
    const b = rows.find(l => l.slug === sb);
    if (!a || !b) return null;

    // Canonical URL is the sorted pair; a non-canonical order should redirect.
    const canonicalSlug = pairSlug(sa, sb);
    const canonicalPath = `/compare/${canonicalSlug}`;
    const isCanonical = pairSlugStr === canonicalSlug;

    // Indexable only when the pair is a genuine, comparable peer match.
    const indexable = a.region === b.region && factComplete(a) && factComplete(b);

    const bigger = (a.surface_acres || 0) >= (b.surface_acres || 0) ? a : b;
    const deeper = (a.max_depth_ft || 0) >= (b.max_depth_ft || 0) ? a : b;

    // Comparison rows the template renders (label + both values, nulls → em dash).
    const fmtAcres = v => v == null ? null : `${Number(v).toLocaleString()} acres`;
    const fmtFt = v => v == null ? null : `${v} ft`;
    const metrics = [
        { label: 'Surface area',  a: fmtAcres(a.surface_acres),  b: fmtAcres(b.surface_acres) },
        { label: 'Max depth',     a: fmtFt(a.max_depth_ft),      b: fmtFt(b.max_depth_ft) },
        { label: 'Mean depth',    a: fmtFt(a.mean_depth_ft),     b: fmtFt(b.mean_depth_ft) },
        { label: 'Water clarity', a: fmtFt(a.water_clarity_ft),  b: fmtFt(b.water_clarity_ft) },
        { label: 'Shoreline',     a: a.shoreline_miles != null ? `${a.shoreline_miles} mi` : null, b: b.shoreline_miles != null ? `${b.shoreline_miles} mi` : null },
        { label: 'Public accesses', a: a.public_accesses != null ? String(a.public_accesses) : null, b: b.public_accesses != null ? String(b.public_accesses) : null },
        { label: 'Game fish',     a: parseSpecies(a.fish_species).slice(0, 6).join(', ') || null, b: parseSpecies(b.fish_species).slice(0, 6).join(', ') || null },
    ];

    return {
        a, b, metrics, indexable, isCanonical, canonicalPath, canonicalSlug,
        region: a.region === b.region ? a.region : null,
        biggerName: bigger.name, deeperName: deeper.name,
        h1: `${a.name} vs ${b.name}`,
        seoTitle: `${a.name} vs ${b.name}, MN — Lake Comparison & Homes for Sale`,
        seoDescription: `${a.name} vs ${b.name}: compare size, depth, water clarity, and fishing side by side — plus lake homes and cabins for sale on each. Which Minnesota lake is right for you?`,
    };
}

module.exports = { listComparisons, comparePage, pairSlug, splitPair, factComplete };
