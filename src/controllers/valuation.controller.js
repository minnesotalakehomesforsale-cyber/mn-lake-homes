// valuation.controller.js — instant "What's my lake home worth?" estimate.
// The estimate itself is a rough, honest range built from our own market data
// ($/sq ft from recent local listings, adjusted for waterfront, shoreline and
// condition). The real product is the SELLER LEAD — this is the highest-volume
// seller-lead magnet in real estate, so the flow ends by handing the homeowner
// to a local specialist for a proper CMA.

const pool = require('../database/pool');

const DEFAULT_PPSF = 325;       // statewide fallback $/sq ft when we have no data
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = n => Math.round(n / 1000) * 1000;   // nearest $1k

// Average $/sq ft from real listings, narrowing from lake → city → state.
async function resolvePpsf({ lakeSlug, city, state }) {
    const tryQuery = async (sql, params, basis) => {
        try {
            const { rows } = await pool.query(sql, params);
            const v = rows[0] && rows[0].ppsf ? Number(rows[0].ppsf) : null;
            return (v && v > 20 && v < 5000) ? { ppsf: v, basis } : null;
        } catch (_) { return null; }
    };
    if (lakeSlug) {
        const r = await tryQuery(
            `SELECT AVG(price::numeric / NULLIF(sqft,0)) AS ppsf
               FROM listings li JOIN lakes l ON l.id = li.lake_id
              WHERE l.slug = $1 AND li.price > 0 AND li.sqft > 200`,
            [lakeSlug], 'recent listings on this lake');
        if (r) return r;
    }
    if (city) {
        const r = await tryQuery(
            `SELECT AVG(price::numeric / NULLIF(sqft,0)) AS ppsf
               FROM listings WHERE LOWER(city) = LOWER($1) AND price > 0 AND sqft > 200`,
            [city], 'recent listings in this area');
        if (r) return r;
    }
    const r = await tryQuery(
        `SELECT AVG(price::numeric / NULLIF(sqft,0)) AS ppsf
           FROM listings WHERE price > 0 AND sqft > 200 AND status IN ('active','sold')`,
        [], 'recent Minnesota lake listings');
    return r || { ppsf: DEFAULT_PPSF, basis: 'statewide lake-home averages' };
}

// POST /api/valuation/estimate
exports.estimate = async (req, res) => {
    try {
        const b = req.body || {};
        const lakeSlug = (b.lake_slug || '').toString().trim() || null;
        const city = (b.city || '').toString().trim() || null;
        const state = (b.state || 'MN').toString().trim();
        let sqft = parseInt(b.sqft, 10);
        if (!Number.isFinite(sqft) || sqft <= 0) sqft = null; else sqft = clamp(sqft, 400, 15000);
        const isWaterfront = b.is_waterfront === true || /^yes/i.test(b.is_waterfront || '');
        let shoreline = parseInt(b.waterfront_feet, 10); if (!Number.isFinite(shoreline) || shoreline < 0) shoreline = 0;
        const condition = (b.condition || 'move_in').toString();

        const { ppsf, basis } = await resolvePpsf({ lakeSlug, city, state });

        let mid;
        if (sqft) {
            mid = sqft * ppsf;
        } else {
            // No size given → fall back to the local median list price.
            let median = null;
            try {
                const { rows } = await pool.query(
                    lakeSlug
                        ? `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS m
                             FROM listings li JOIN lakes l ON l.id = li.lake_id
                            WHERE l.slug = $1 AND price > 0`
                        : `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS m
                             FROM listings WHERE price > 0`,
                    lakeSlug ? [lakeSlug] : []);
                median = rows[0] && rows[0].m ? Number(rows[0].m) : null;
            } catch (_) {}
            mid = median || 2000 * ppsf;   // assume a ~2,000 sq ft home if truly nothing
        }

        // Adjustments — waterfront is the biggest driver on a lake.
        if (isWaterfront) mid *= 1.25;
        if (shoreline > 0) mid *= (1 + Math.min(0.15, shoreline / 2000));
        const condMult = { move_in: 1, light: 0.95, major: 0.85, teardown: 0.7 }[condition] || 1;
        mid *= condMult;

        mid = clamp(mid, 40000, 25000000);
        const low = round(mid * 0.88), high = round(mid * 1.12);

        res.json({
            low, mid: round(mid), high,
            ppsf: Math.round(ppsf),
            basis,
            disclaimer: 'This is an automated estimate from local market data, not an appraisal. A local specialist can give you a precise, comparable-based valuation.',
        });
    } catch (err) {
        console.error('[valuation.estimate]', err.message);
        res.status(500).json({ error: 'Could not generate an estimate right now.' });
    }
};
