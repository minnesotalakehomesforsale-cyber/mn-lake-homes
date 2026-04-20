/**
 * cash-offer-calc.js — Pure cash-offer math.
 *
 * Formula:
 *     offer = avm × discountFactor
 *           − estimatedRepairs
 *           − (avm × holdingCostPct)
 *           − (avm × targetMarginPct)
 *
 * All config is injected so the caller can pull fresh values from the
 * `cash_offer_config` table. No DB access in this module — keeps it
 * unit-testable and easy to reason about.
 */

const DEFAULT_CONFIG = {
    discount_factor:       0.88,
    holding_cost_pct:      0.02,
    target_margin_pct:     0.05,
    repair_cost_excellent: 0,
    repair_cost_good:      5000,
    repair_cost_fair:      15000,
    repair_cost_needs_work:35000,
};

// Map a free-form condition value to its repair-cost lookup key.
function repairCostForCondition(condition, cfg) {
    const c = String(condition || '').trim().toLowerCase();
    switch (c) {
        case 'excellent':   return Number(cfg.repair_cost_excellent);
        case 'good':        return Number(cfg.repair_cost_good);
        case 'fair':        return Number(cfg.repair_cost_fair);
        case 'needswork':
        case 'needs_work':
        case 'needs-work':
        case 'needs work':
            return Number(cfg.repair_cost_needs_work);
        default:
            // Unknown / missing condition — assume middle of the road.
            return Number(cfg.repair_cost_good);
    }
}

// Round to nearest $1,000 (floor gives a slightly conservative number for us).
function roundToNearestThousand(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n / 1000) * 1000;
}

/**
 * @param {Object} args
 * @param {number} args.avm         — automated valuation from RentCast or manual entry
 * @param {string} args.condition   — 'Excellent' | 'Good' | 'Fair' | 'NeedsWork'
 * @param {Object} [args.config]    — row from cash_offer_config, or subset
 * @returns {{ offerAmount: number, offerFactors: Object }}
 */
function calculateOffer({ avm, condition, config }) {
    const cfg = { ...DEFAULT_CONFIG, ...(config || {}) };

    const avmNum = Number(avm) || 0;
    const discountFactor    = Number(cfg.discount_factor);
    const holdingCostPct    = Number(cfg.holding_cost_pct);
    const targetMarginPct   = Number(cfg.target_margin_pct);
    const repairCost        = repairCostForCondition(condition, cfg);

    if (avmNum <= 0) {
        return {
            offerAmount: 0,
            offerFactors: {
                discountFactor,
                repairCost,
                holdingCostPct,
                targetMarginPct,
                avm: avmNum,
            },
        };
    }

    const rawOffer =
        (avmNum * discountFactor)
        - repairCost
        - (avmNum * holdingCostPct)
        - (avmNum * targetMarginPct);

    // Never return a negative offer — floor at $0.
    const offerAmount = roundToNearestThousand(Math.max(0, rawOffer));

    return {
        offerAmount,
        offerFactors: {
            discountFactor,
            repairCost,
            holdingCostPct,
            targetMarginPct,
            avm: avmNum,
        },
    };
}

module.exports = {
    calculateOffer,
    repairCostForCondition,
    DEFAULT_CONFIG,
};
