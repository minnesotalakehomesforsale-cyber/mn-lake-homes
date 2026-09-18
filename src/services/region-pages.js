'use strict';

// SEOP06 — "Lakes Area" hubs (/areas/[region]). Groups published lakes by their
// region/area (e.g. "Brainerd / Baxter", "Alexandria") — the tourism-brand terms
// buyers actually search ("brainerd lakes area for sale"), distinct from the
// administrative /counties grouping. Fact floor >= 2 lakes. Same shape as
// county-pages so it's testable in isolation.

const pool = require('../database/pool');

const MIN_LAKES = 2;

function areaSlug(name) {
    return String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || null;
}

async function listAreas() {
    const { rows } = await pool.query(
        `SELECT region, COUNT(*)::int AS lake_count, MAX(updated_at) AS updated_at
           FROM lakes
          WHERE status = 'published' AND COALESCE(region, '') <> ''
          GROUP BY region
          ORDER BY region`);
    return rows.map(r => ({ region: r.region, slug: areaSlug(r.region), lake_count: r.lake_count, updated_at: r.updated_at, indexable: r.lake_count >= MIN_LAKES }));
}

async function areaData(slug) {
    if (!slug) return null;
    const areas = await listAreas();
    const match = areas.find(a => a.slug === slug);
    if (!match) return null;
    const region = match.region;

    const { rows: lakes } = await pool.query(
        `SELECT slug, name, county, hero_image_url, surface_acres, max_depth_ft,
                COALESCE(CASE WHEN COALESCE(intro_text, '') <> '' THEN intro_text END,
                         CASE WHEN COALESCE(description, '') <> '' THEN description END) AS blurb
           FROM lakes
          WHERE status = 'published' AND region = $1
          ORDER BY CASE WHEN COALESCE(hero_image_url, '') <> '' THEN 0 ELSE 1 END, COALESCE(surface_acres, 0) DESC, name`, [region]);

    const { rows: towns } = await pool.query(
        `SELECT DISTINCT t.slug, t.name
           FROM tags t JOIN lake_tags lt ON lt.tag_id = t.id JOIN lakes l ON l.id = lt.lake_id
          WHERE l.status = 'published' AND l.region = $1 AND t.active = TRUE
          ORDER BY t.name LIMIT 12`, [region]);

    const n = lakes.length;
    return {
        region, slug, lakes, towns, lakeCount: n,
        indexable: n >= MIN_LAKES,
        canonicalPath: `/areas/${slug}`,
        h1: `${region} Lakes — Homes & Cabins for Sale`,
        seoTitle: `${region} Lakes Area, MN — Lake Homes for Sale (${n} Lakes)`,
        seoDescription: `Lake homes and cabins for sale in the ${region} lakes area of Minnesota — ${n} lake${n === 1 ? '' : 's'}, waterfront property, and local lake experts. Explore the ${region} area lakes.`,
    };
}

module.exports = { listAreas, areaData, areaSlug, MIN_LAKES };
