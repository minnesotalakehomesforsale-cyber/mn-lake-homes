'use strict';

// LAKE15 — fact-grounded intro copy for lakes with no editorial description.
//
// A lake page with real MN DNR facts (size, depth, clarity, fish), a live market
// snapshot, nearby towns, an FAQ, and local agents is a genuinely useful, unique
// page — not thin content. But our indexability floor keys on written copy, so
// enriched-but-undescribed lakes were sitting noindex. This composes an honest
// intro paragraph from the DNR facts we already store (nothing invented), which
// both renders on the page and lets it clear the content floor.
//
// hasFacts() is the shared floor: acreage + (depth OR fish) — the minimum needed
// to say something specific and true. The sitemap predicate and the /lakes/:slug
// robots gate must use the SAME condition so index == sitemap.

const parseSpecies = v => Array.isArray(v) ? v
    : (() => { try { return JSON.parse(v || '[]'); } catch { return []; } })();

// Enough real facts to write a specific, honest sentence?
function hasFacts(lake) {
    if (!lake) return false;
    return lake.surface_acres != null && (lake.max_depth_ft != null || parseSpecies(lake.fish_species).length > 0);
}

// SQL form of hasFacts(), for the sitemap predicate. Keep in lockstep with the JS
// above: fish counts only when the array is non-empty (matches parseSpecies length
// check). `<> '[]'` is portable across real Postgres JSONB and pg-mem TEXT.
const HAS_FACTS_SQL =
    `surface_acres IS NOT NULL AND (max_depth_ft IS NOT NULL OR (fish_species IS NOT NULL AND fish_species <> '[]'))`;

function depthDescriptor(ft) {
    if (ft == null) return null;
    if (ft >= 80) return 'deep';
    if (ft >= 35) return 'moderately deep';
    return 'shallow';
}

// Join a list naturally: "a, b and c".
function naturalList(arr) {
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
    return `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;
}

// Build a factual 2–4 sentence intro from DNR data. Returns '' below the floor.
function dnrIntro(lake) {
    if (!hasFacts(lake)) return '';
    const name = lake.name;
    const state = lake.state === 'MN' || !lake.state ? 'Minnesota' : lake.state;
    const acres = Number(lake.surface_acres).toLocaleString();
    const county = lake.county ? `${lake.county} County` : null;
    const region = (lake.region || '').trim();
    const fish = parseSpecies(lake.fish_species);

    const sentences = [];

    // 1) Identity + size + place.
    let where = county ? ` in ${county}` : '';
    if (region && !/lake/i.test(region)) where += `, in ${state}'s ${region} lakes area`;
    else if (region) where += `, in the ${region} area`;
    else where += `, ${state}`;
    sentences.push(`${name} is a ${acres}-acre lake${where}.`);

    // 2) Depth (+ mean) and clarity — whichever we have.
    const bits = [];
    if (lake.max_depth_ft != null) {
        const desc = depthDescriptor(lake.max_depth_ft);
        bits.push(`a ${desc} lake reaching ${lake.max_depth_ft} feet at its deepest`
            + (lake.mean_depth_ft != null ? ` (about ${lake.mean_depth_ft} feet on average)` : ''));
    }
    if (lake.water_clarity_ft != null && lake.water_clarity_ft > 0) {
        bits.push(`water clarity of roughly ${lake.water_clarity_ft} feet`);
    }
    if (bits.length) sentences.push(`It's ${naturalList(bits)}.`);

    // 3) Fish.
    if (fish.length) {
        const top = fish.slice(0, 5);
        sentences.push(`Anglers fish ${name} for ${naturalList(top)}.`);
    }

    // 4) Public accesses (honest, useful, and lake-specific).
    if (lake.public_accesses != null && lake.public_accesses > 0) {
        sentences.push(`There ${lake.public_accesses === 1 ? 'is' : 'are'} ${lake.public_accesses} public access${lake.public_accesses === 1 ? '' : 'es'} on the lake.`);
    }

    // Purpose of the page (this is a real-estate site, so this is honest framing).
    sentences.push(`Browse waterfront homes and cabins for sale on ${name} below, and connect with a local lake agent. Lake facts: Minnesota DNR.`);

    return sentences.join(' ');
}

module.exports = { dnrIntro, hasFacts, HAS_FACTS_SQL, parseSpecies };
