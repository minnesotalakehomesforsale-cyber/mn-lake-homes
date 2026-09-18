'use strict';

// SEOP04 — "Best [Fish] Lakes in Minnesota" list pages (/fishing/[fish]).
//
// High-intent, high-volume queries ("best walleye lakes in minnesota") answered
// from the DNR fish_species we already store per lake. A small curated set of game
// fish (not one page per obscure species), each listing the published lakes that
// hold that fish, ranked by size, and linking down to every lake page. Fact floor:
// a species page needs >= MIN_LAKES lakes to be indexed (a 1-lake "best" list is
// not a list). Filtered in JS over the ~small published-lake set — no JSONB SQL,
// so it's simple and portable.

const pool = require('../database/pool');

const MIN_LAKES = 3;

// Curated game fish → the DNR species names (from dnr-lakefinder SPECIES) that count.
const FISH = [
    { slug: 'walleye',       name: 'Walleye',            species: ['Walleye'] },
    { slug: 'northern-pike', name: 'Northern Pike',      species: ['Northern Pike'] },
    { slug: 'bass',          name: 'Bass',               species: ['Largemouth Bass', 'Smallmouth Bass'] },
    { slug: 'muskie',        name: 'Muskie',             species: ['Muskellunge', 'Tiger Muskie'] },
    { slug: 'crappie',       name: 'Crappie',            species: ['Black Crappie', 'White Crappie'] },
    { slug: 'bluegill',      name: 'Bluegill & Sunfish', species: ['Bluegill'] },
    { slug: 'trout',         name: 'Trout',              species: ['Lake Trout', 'Rainbow Trout', 'Brown Trout', 'Brook Trout'] },
    { slug: 'perch',         name: 'Yellow Perch',       species: ['Yellow Perch'] },
];

const parseSpecies = v => { if (Array.isArray(v)) return v; try { return JSON.parse(v || '[]'); } catch { return []; } };

async function _publishedWithFish() {
    const { rows } = await pool.query(
        `SELECT slug, name, region, county, surface_acres, max_depth_ft, hero_image_url, fish_species
           FROM lakes WHERE status = 'published' AND fish_species IS NOT NULL`);
    return rows;
}

function _matchLakes(rows, species) {
    const want = new Set(species.map(s => s.toLowerCase()));
    return rows
        .filter(l => parseSpecies(l.fish_species).some(sp => want.has(String(sp).toLowerCase())))
        .sort((a, b) => (b.surface_acres || 0) - (a.surface_acres || 0));
}

async function fishPage(slug) {
    const fish = FISH.find(f => f.slug === slug);
    if (!fish) return null;
    const lakes = _matchLakes(await _publishedWithFish(), fish.species);
    const n = lakes.length;
    const low = fish.name.toLowerCase();
    return {
        fish, lakes, count: n,
        indexable: n >= MIN_LAKES,
        canonicalPath: `/fishing/${fish.slug}`,
        h1: `Best ${fish.name} Lakes in Minnesota`,
        seoTitle: `Best ${fish.name} Lakes in Minnesota${n ? ` — ${n} Top Lakes` : ''}`,
        seoDescription: `The best ${low} lakes in Minnesota for lake homes and cabins${n ? ` — ${n} lakes known for ${low}` : ''}. Compare waterfront property on Minnesota's top ${low} lakes and connect with a local lake agent.`,
    };
}

// Indexable fish pages (>= MIN_LAKES) for the /fishing index + sitemap.
async function listFish() {
    const rows = await _publishedWithFish();
    return FISH.map(f => {
        const n = _matchLakes(rows, f.species).length;
        return { slug: f.slug, name: f.name, count: n, indexable: n >= MIN_LAKES };
    }).filter(f => f.indexable);
}

module.exports = { fishPage, listFish, FISH, MIN_LAKES };
