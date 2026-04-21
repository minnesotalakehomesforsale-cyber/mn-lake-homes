/**
 * resources-seed.js — Initial resources catalog bootstrapped at app start.
 *
 * Loaded by src/server.js ensureTables() with an INSERT … ON CONFLICT
 * (slug) DO NOTHING so the list is safe to reload every boot. Admin
 * edits to existing slugs are preserved; adding a new row here ships
 * it on the next deploy.
 *
 * Kept intentionally small — the admin UI (Phase 2) will be the
 * canonical way to add new resources at scale.
 */

module.exports = [
    {
        slug: 'lake-buyer-guide',
        title: 'The Minnesota Lake Home Buyer Guide',
        description: 'A 32-page walk-through of everything first-time buyers need to know — from shoreline setbacks to dock permits and winterization.',
        category: 'Guides',
        resource_type: 'pdf',
        url: '#',
        thumbnail_url: '/assets/images/mn-canoe-shore.webp',
        tags: ['buyer', 'first-time'],
        featured: true,
    },
    {
        slug: 'shoreline-regulations',
        title: 'Shoreline Setback & Permit Reference',
        description: 'Every Minnesota county rule that matters when building, remodeling, or selling on the water.',
        category: 'Guides',
        resource_type: 'article',
        url: '#',
        thumbnail_url: '/assets/images/mn-dock-water-tower.webp',
        tags: ['legal', 'permits'],
    },
    {
        slug: 'property-value-calc',
        title: 'Lakefront Property Value Calculator',
        description: 'Plug in your address and get an instant estimate powered by live comps and public records.',
        category: 'Tools',
        resource_type: 'calculator',
        url: '/pages/public/cash-offer.html',
        thumbnail_url: '/assets/images/mn-modern-glass-home.jpg',
        tags: ['valuation', 'seller'],
        featured: true,
    },
    {
        slug: '2026-market-report',
        title: '2026 Minnesota Lakefront Market Report',
        description: 'Sold volume, price-per-linear-foot, and regional breakdowns across every major MN lake market.',
        category: 'Market Reports',
        resource_type: 'pdf',
        url: '#',
        thumbnail_url: '/assets/images/mn-maple-lake-aerial.jpg',
        tags: ['market', 'data'],
        featured: true,
    },
    {
        slug: 'dock-permit-guide',
        title: 'Dock & Lift Permit Quick Reference',
        description: 'The five agencies that matter and what each requires before your dock goes in next spring.',
        category: 'Guides',
        resource_type: 'article',
        url: '#',
        thumbnail_url: '/assets/images/mn-dock-water-tower.webp',
        tags: ['permits', 'dock'],
    },
    {
        slug: 'mortgage-preapproval-checklist',
        title: 'Lake Home Mortgage Pre-Approval Checklist',
        description: 'Every document your lender will ask for, organized by category and labeled for the waterfront-specific questions.',
        category: 'Checklists',
        resource_type: 'pdf',
        url: '#',
        thumbnail_url: '/assets/images/mn-cape-cod-lakefront.jpg',
        tags: ['buyer', 'financing'],
    },
    {
        slug: 'seasonal-rental-template',
        title: 'Seasonal Rental Terms Template',
        description: 'Bulletproof rental agreement tailored for Minnesota lake homes — covers docks, boats, and shoreline use.',
        category: 'Templates',
        resource_type: 'pdf',
        url: '#',
        thumbnail_url: '/assets/images/mn-lodge-lake-house.jpg',
        tags: ['rental', 'legal'],
    },
    {
        slug: 'closing-costs-calc',
        title: 'Closing Costs Calculator',
        description: 'Budget for title, transfer taxes, agent fees, and the lake-specific surveys most tools miss.',
        category: 'Tools',
        resource_type: 'calculator',
        url: '#',
        thumbnail_url: '/assets/images/mn-stucco-home-path.jpg',
        tags: ['seller', 'buyer', 'financing'],
    },
];
