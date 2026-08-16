/**
 * business-tiers.js — the Free / Basic ($29) / Premium ($79) partner matrix
 * (Spec 2). Single source of truth for: the gated-field UI in the owner portal
 * (visible-but-locked — the visible gap is the upsell), the pricing page, and
 * the tier limits enforced server-side on save.
 *
 * These are BUSINESS tiers only. Agent tiers (Standard $9 / Prime $39 /
 * Elite $149) are a separate program and must never mix with these.
 */

// The minimum tier that unlocks each capability. 'free' = everyone.
const TIER_RANK = { free: 0, basic: 1, premium: 2 };

// Per-tier hard limits enforced on save.
const TIER_LIMITS = {
    free:    { lakes: 1, photos: 1, description: 140 },
    basic:   { lakes: 1, photos: 5, description: 400 },
    premium: { lakes: Infinity, photos: 15, description: 400 },
};

// Feature rows for the gated-field UI + pricing. `unlock` is the tier a feature
// first becomes available at; anything above the owner's tier renders LOCKED
// with the upgrade path shown.
const FEATURES = [
    // Free — always available.
    { key: 'name',          label: 'Business name',                 unlock: 'free' },
    { key: 'category',      label: 'Category',                      unlock: 'free' },
    { key: 'lake_tag',      label: 'Lake tag (one lake)',           unlock: 'free' },
    { key: 'logo',          label: 'Logo or photo (1)',             unlock: 'free' },
    { key: 'contact_info',  label: 'Address + phone',               unlock: 'free' },
    { key: 'website',       label: 'Website link',                  unlock: 'free' },
    { key: 'desc_short',    label: 'Description (140 characters)',   unlock: 'free' },
    // Basic — render locked at Free.
    { key: 'lake_placement', label: 'Placement on the lake page ("Local lake life" block)', unlock: 'basic' },
    { key: 'contact_button', label: 'Contact button (tap-to-call / email)', unlock: 'basic' },
    { key: 'priority',       label: 'Priority ranking within your category', unlock: 'basic' },
    { key: 'gallery_5',      label: 'Photo gallery up to 5',        unlock: 'basic' },
    { key: 'desc_400',       label: 'Description up to 400 characters', unlock: 'basic' },
    { key: 'hours_area',     label: 'Hours + service-area detail',  unlock: 'basic' },
    // Premium — render locked at Basic.
    { key: 'all_lakes',      label: 'Every lake you serve (not just one)', unlock: 'premium' },
    { key: 'spotlight',      label: 'Vendor Spotlight — a written feature with a backlink', unlock: 'premium' },
    { key: 'lead_form',      label: 'Lead-gen contact form on your listing', unlock: 'premium' },
    { key: 'top_category',   label: 'Top-of-category placement',    unlock: 'premium' },
    { key: 'gallery_15',     label: 'Photo gallery up to 15',       unlock: 'premium' },
];

const TIERS = [
    { key: 'free',    label: 'Free',    price: 0,  render: 'directory only',
      blurb: 'Always free, no card, no expiry.' },
    { key: 'basic',   label: 'Basic',   price: 29, render: 'text list',
      blurb: 'On the lake pages, with a contact button and priority in your category.' },
    { key: 'premium', label: 'Premium', price: 79, render: 'logo cards',
      blurb: 'Every lake, a written spotlight, a lead form, and top placement.' },
];

// Effective tier of a business row: only 'premium'/'basic' when actually paying
// or comped; otherwise 'free'. Mirrors the render_tier SQL used on lake pages.
function effectiveTier(biz) {
    const paying = biz && (biz.subscription_status === 'active' || biz.tier_comped === true);
    if (biz && biz.tier === 'premium' && paying) return 'premium';
    if (biz && biz.tier === 'basic'   && paying) return 'basic';
    return 'free';
}

function tierAllows(ownerTier, featureUnlock) {
    return (TIER_RANK[ownerTier] ?? 0) >= (TIER_RANK[featureUnlock] ?? 0);
}

function limitsFor(tier) { return TIER_LIMITS[tier] || TIER_LIMITS.free; }

module.exports = { TIER_RANK, TIER_LIMITS, FEATURES, TIERS, effectiveTier, tierAllows, limitsFor };
