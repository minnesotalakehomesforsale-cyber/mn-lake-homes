'use strict';

// SEOP — Minnesota lake ranking pages (/rankings/[metric]).
//
// High-intent, high-volume "superlative" queries — "deepest lakes in minnesota",
// "largest lakes in minnesota", "clearest lakes in minnesota" — answered as real
// leaderboards from the DNR facts we store (see [[dnr-data-populated]]). Each page
// ranks published lakes by one metric, links every lake to its page, and carries
// the homes-for-sale angle. Fact-floored: a ranking needs >= MIN_LAKES lakes that
// actually have the metric, or it stays noindex (a 2-lake "ranking" is not one).
//
// Column names come from this fixed RANKINGS table, never user input, so they're
// safe to interpolate into ORDER BY / WHERE.

const pool = require('../database/pool');

const MIN_LAKES = 5;   // a credible ranking needs a real field of contenders
const TOP_N = 30;      // how many to list

const RANKINGS = [
    { slug: 'deepest',  col: 'max_depth_ft',    unit: 'ft',    label: 'max depth',
      noun: 'Deepest',  h1: 'Deepest Lakes in Minnesota',
      blurb: 'ranked by maximum depth' },
    { slug: 'largest',  col: 'surface_acres',   unit: 'acres', label: 'surface area',
      noun: 'Largest',  h1: 'Largest Lakes in Minnesota',
      blurb: 'ranked by surface area (acres)' },
    { slug: 'clearest', col: 'water_clarity_ft', unit: 'ft',   label: 'water clarity',
      noun: 'Clearest', h1: 'Clearest Lakes in Minnesota',
      blurb: 'ranked by water clarity (Secchi depth)' },
];

const parseSpecies = v => { if (Array.isArray(v)) return v; try { return JSON.parse(v || '[]'); } catch { return []; } };

// Format a metric value for display (acres get thousands separators).
function fmtValue(col, v) {
    if (v == null) return null;
    if (col === 'surface_acres') return Number(v).toLocaleString();
    // clarity can be fractional (e.g. 12.5), depth is whole feet
    return String(Math.round(Number(v) * 10) / 10);
}

async function _rankedLakes(col) {
    // col is whitelisted (from RANKINGS), safe to interpolate.
    const { rows } = await pool.query(
        `SELECT slug, name, county, region, hero_image_url, surface_acres, max_depth_ft,
                water_clarity_ft, fish_species, ${col} AS metric
           FROM lakes
          WHERE status = 'published' AND ${col} IS NOT NULL AND ${col} > 0
          ORDER BY ${col} DESC, name
          LIMIT ${TOP_N}`);
    return rows;
}

async function rankingPage(slug) {
    const r = RANKINGS.find(x => x.slug === slug);
    if (!r) return null;
    const lakes = (await _rankedLakes(r.col)).map((l, i) => ({
        rank: i + 1,
        slug: l.slug, name: l.name, county: l.county, region: l.region,
        hero_image_url: l.hero_image_url,
        value: fmtValue(r.col, l.metric), unit: r.unit,
        fish: parseSpecies(l.fish_species).slice(0, 3),
    }));
    const n = lakes.length;
    const low = r.noun.toLowerCase();
    const leaders = lakes.slice(0, 3).map(l => l.name).join(', ');
    return {
        ranking: r, lakes, count: n,
        indexable: n >= MIN_LAKES,
        canonicalPath: `/rankings/${r.slug}`,
        h1: r.h1,
        metricLabel: r.label, unit: r.unit,
        seoTitle: `${r.h1} — ${r.noun} Lakes${n ? ` (Top ${n})` : ''} & Homes for Sale`,
        seoDescription: `The ${low} lakes in Minnesota ${r.blurb}, from Minnesota DNR data${leaders ? ` — led by ${leaders}` : ''}. Compare depth, size, and clarity, and browse lake homes and cabins for sale on each.`,
        lede: `Minnesota's ${low} lakes, ${r.blurb} from the Minnesota DNR${n ? ` — the top ${n}` : ''}. Tap any lake for its market snapshot, facts, and a local lake agent.`,
    };
}

// Rankings that clear the fact floor — for the /rankings index + sitemap.
async function listRankings() {
    const out = [];
    for (const r of RANKINGS) {
        const rows = await _rankedLakes(r.col);
        out.push({ slug: r.slug, noun: r.noun, h1: r.h1, label: r.label, count: rows.length, indexable: rows.length >= MIN_LAKES });
    }
    return out;
}

module.exports = { rankingPage, listRankings, RANKINGS, MIN_LAKES, TOP_N };
