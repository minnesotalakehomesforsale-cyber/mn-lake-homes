'use strict';

// SEOP02 — "Homes for Sale on [Lake]" buyer-intent pages (/lakes/:slug/homes-for-sale).
//
// Targets the transactional query ("homes for sale on gull lake") that the lake
// HUB page doesn't own. Shows the lake's ACTIVE listings. Fact floor: indexable
// only when there's real inventory (>= 1 active listing) so we never publish a
// thin "0 homes" page — below the floor it stays reachable (and captures the
// intent through a new-listing-alert lead form) but noindex, and auto-indexes the
// moment a listing lands. Data pulled straight from the listings we already have.

const pool = require('../database/pool');

const listingsPublic = () => process.env.LISTINGS_PUBLIC !== 'false';

async function homesForSale(slug) {
    const { rows } = await pool.query(
        `SELECT id, slug, name, state, region, county, hero_image_url, intro_text, status
           FROM lakes WHERE slug = $1 LIMIT 1`, [slug]);
    const lake = rows[0];
    if (!lake || lake.status !== 'published') return null;

    const listings = listingsPublic()
        ? (await pool.query(
            `SELECT slug, title, address, city, price, beds, baths, sqft, waterfront_feet, featured_image_url
               FROM listings
              WHERE lake_id = $1 AND status = 'active'
              ORDER BY CASE WHEN price IS NULL THEN 1 ELSE 0 END, price DESC LIMIT 60`, [lake.id])).rows
        : [];
    const n = listings.length;
    return {
        lake, listings, count: n,
        indexable: n >= 1,
        canonicalPath: `/lakes/${lake.slug}/homes-for-sale`,
        h1: `Homes for Sale on ${lake.name}`,
        seoTitle: `Homes for Sale on ${lake.name}, MN${n ? ` — ${n} Listing${n === 1 ? '' : 's'}` : ''}`,
        seoDescription: n
            ? `${n} lake home${n === 1 ? '' : 's'} for sale on ${lake.name}, Minnesota — waterfront property and cabins with price, beds, and baths at a glance. See listings and connect with a local ${lake.name} agent.`
            : `Lake homes for sale on ${lake.name}, Minnesota. Get alerted when a new ${lake.name} waterfront listing hits the market, and connect with a local lake agent.`,
    };
}

// Lakes that currently have >= 1 active listing — for the sitemap (all indexable
// by definition of the join). Empty when LISTINGS_PUBLIC=false.
async function lakesWithActiveListings() {
    if (!listingsPublic()) return [];
    const { rows } = await pool.query(
        `SELECT l.slug, MAX(li.updated_at) AS updated_at, COUNT(*)::int AS n
           FROM lakes l JOIN listings li ON li.lake_id = l.id AND li.status = 'active'
          WHERE l.status = 'published'
          GROUP BY l.slug`);
    return rows;
}

module.exports = { homesForSale, lakesWithActiveListings };
