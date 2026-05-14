/**
 * resources-seed.js — Resources catalog bootstrapped at app start.
 *
 * Loaded by src/server.js ensureTables() with an INSERT … ON CONFLICT
 * (slug) DO NOTHING so the list is safe to reload every boot.
 *
 * Phase 1 launch set: 8 gated PDF downloads (4 buyer, 4 seller). Each
 * `url` points at a PDF in /assets/resources/. The public resources
 * page treats any resource whose url starts with /assets/resources/
 * as a gated download — clicking the card opens an email-capture
 * modal, and on submit the visitor becomes a lead (source:
 * 'resource_download') and is emailed the download link.
 *
 * To fully swap the catalog on an existing database (not just a fresh
 * one), run: node scripts/replace-resources.js
 */

module.exports = [
    // ── Buyer downloads ─────────────────────────────────────────────
    {
        slug: 'lake-region-comparison-guide',
        title: 'Lake Region Comparison Guide',
        description: 'Five Minnesota lake regions side by side — price, drive time, water clarity, and character — with a "best fit by buyer type" matrix. 9 pages.',
        category: 'Buyer Resources',
        resource_type: 'Guide',
        url: '/assets/resources/lake-region-comparison-guide.pdf',
        thumbnail_url: '/assets/images/mn-aerial-lake-homes.jpg',
        tags: ['buyer', 'guide'],
        featured: true,
    },
    {
        slug: 'first-time-lake-buyer-roadmap',
        title: 'First-Time Lake Buyer Roadmap',
        description: 'An 8-step walkthrough of the lake-home buying process — timelines, document lists, and the tips first-timers wish they had. 7 pages.',
        category: 'Buyer Resources',
        resource_type: 'Guide',
        url: '/assets/resources/first-time-lake-buyer-roadmap.pdf',
        thumbnail_url: '/assets/images/mn-canoe-shore.webp',
        tags: ['buyer', 'guide', 'first-time'],
        featured: true,
    },
    {
        slug: 'waterfront-inspection-checklist',
        title: 'Waterfront Inspection Checklist',
        description: 'A print-and-use, lake-specific inspection checklist — septic, well, shoreline, dock, ice and weather, access, and outbuildings. 5 pages.',
        category: 'Buyer Resources',
        resource_type: 'Checklist',
        url: '/assets/resources/waterfront-inspection-checklist.pdf',
        thumbnail_url: '/assets/images/mn-dock-water-tower.webp',
        tags: ['buyer', 'checklist', 'inspection'],
    },
    {
        slug: 'property-tax-lakeshore-estimator',
        title: 'Property Tax + Lakeshore Tax Estimator',
        description: 'A worksheet plus worked examples for estimating Minnesota property tax on a lake home before you make an offer. 5 pages.',
        category: 'Buyer Resources',
        resource_type: 'Worksheet',
        url: '/assets/resources/property-tax-lakeshore-estimator.pdf',
        thumbnail_url: '/assets/images/mn-cape-cod-lakefront.jpg',
        tags: ['buyer', 'worksheet', 'taxes'],
    },

    // ── Seller downloads ────────────────────────────────────────────
    {
        slug: 'minnesota-lake-home-seller-guide',
        title: 'Minnesota Lake Home Seller Guide',
        description: 'The flagship seller playbook — pricing and comps, seasonal timing, prep, photography, disclosures, and an 8-week pre-listing timeline. 7 pages.',
        category: 'Seller Resources',
        resource_type: 'Guide',
        url: '/assets/resources/minnesota-lake-home-seller-guide.pdf',
        thumbnail_url: '/assets/images/mn-lodge-lake-house.jpg',
        tags: ['seller', 'guide'],
    },
    {
        slug: 'sellers-net-proceeds-calculator',
        title: "Seller's Net Proceeds Calculator",
        description: 'A worksheet walking every line item from gross sale price to net proceeds, with a worked $600k example. 5 pages.',
        category: 'Seller Resources',
        resource_type: 'Worksheet',
        url: '/assets/resources/sellers-net-proceeds-calculator.pdf',
        thumbnail_url: '/assets/images/mn-modern-glass-home.jpg',
        tags: ['seller', 'worksheet'],
    },
    {
        slug: 'pre-listing-cabin-prep-checklist',
        title: 'Pre-Listing Cabin Prep Checklist',
        description: 'A week-by-week prep checklist — eight weeks down to the day before — for getting a cabin listing-ready. 5 pages.',
        category: 'Seller Resources',
        resource_type: 'Checklist',
        url: '/assets/resources/pre-listing-cabin-prep-checklist.pdf',
        thumbnail_url: '/assets/images/mn-rustic-modern-lake-house.jpg',
        tags: ['seller', 'checklist'],
    },
    {
        slug: 'seller-disclosure-reference',
        title: 'Seller Disclosure Reference',
        description: "A reference companion to Minnesota's required Seller's Property Disclosure — lakeshore-specific sections, with example language. 6 pages.",
        category: 'Seller Resources',
        resource_type: 'Reference',
        url: '/assets/resources/seller-disclosure-reference.pdf',
        thumbnail_url: '/assets/images/mn-maple-lake-aerial.jpg',
        tags: ['seller', 'reference', 'disclosure'],
    },
];
