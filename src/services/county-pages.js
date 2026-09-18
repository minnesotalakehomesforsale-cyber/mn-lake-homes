'use strict';

// Programmatic-SEO county hubs — "Lake Homes in [County] County, Minnesota".
//
// Aggregates the lakes we ALREADY have (grouped by their county column) into new
// indexable hub pages that internally link to every lake page in the county (and
// the towns linked to them). Those internal links lift the whole lake cluster in
// search, and each hub is a real "county lake market" landing page — new indexable
// surface built from existing data, not thin duplication.
//
// Pure data + SEO layer; the route renders it. Indexability follows a FACT FLOOR
// (a county needs at least MIN_LAKES published lakes to be indexed), matching the
// site's "robots == sitemap" discipline so a 200 page is never an orphaned index.

const pool = require('../database/pool');

const MIN_LAKES = 2;   // a 1-lake county page is thin → reachable but noindex + off the sitemap

function countySlug(name) {
    return String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/\bcounty\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || null;
}

// Every MN county with at least one published lake, with counts — for the
// /counties index and the sitemap. `indexable` applies the fact floor.
async function listCounties() {
    const { rows } = await pool.query(
        `SELECT county, COUNT(*)::int AS lake_count, MAX(updated_at) AS updated_at
           FROM lakes
          WHERE status = 'published' AND COALESCE(county, '') <> ''
            AND UPPER(COALESCE(state, 'MN')) = 'MN'
          GROUP BY county
          ORDER BY county`);
    return rows.map(r => ({ county: r.county, slug: countySlug(r.county), lake_count: r.lake_count, updated_at: r.updated_at, indexable: r.lake_count >= MIN_LAKES }));
}

// One county's page data, or null if the slug matches no county with published lakes.
async function countyData(slug) {
    if (!slug) return null;
    const counties = await listCounties();
    const match = counties.find(c => c.slug === slug);
    if (!match) return null;
    const county = match.county;

    const { rows: lakes } = await pool.query(
        `SELECT slug, name, region, hero_image_url,
                surface_acres, max_depth_ft, dow_number,
                COALESCE(CASE WHEN COALESCE(intro_text, '') <> '' THEN intro_text END,
                         CASE WHEN COALESCE(description, '') <> '' THEN description END) AS blurb
           FROM lakes
          WHERE status = 'published' AND county = $1
          ORDER BY CASE WHEN COALESCE(hero_image_url, '') <> '' THEN 0 ELSE 1 END, COALESCE(surface_acres, 0) DESC, name`, [county]);

    const { rows: towns } = await pool.query(
        `SELECT DISTINCT t.slug, t.name
           FROM tags t
           JOIN lake_tags lt ON lt.tag_id = t.id
           JOIN lakes l ON l.id = lt.lake_id
          WHERE l.status = 'published' AND l.county = $1 AND t.active = TRUE
          ORDER BY t.name LIMIT 12`, [county]);

    const n = lakes.length;
    return {
        county, slug, lakes, towns,
        lakeCount: n,
        indexable: n >= MIN_LAKES,
        seoTitle: `Lake Homes for Sale in ${county} County, MN — ${n} Lakes`,
        seoDescription: `Explore ${n} lake${n === 1 ? '' : 's'} in ${county} County, Minnesota: waterfront homes and cabins, market snapshots, and local lake experts. Find your ${county} County lake home.`,
        h1: `Lake Homes for Sale in ${county} County, Minnesota`,
    };
}

module.exports = { listCounties, countyData, countySlug, MIN_LAKES };
