// market.controller.js — the public MN Lake Market Index. Aggregates our own
// listing/sold data statewide + by region, and records a monthly snapshot so
// trends accumulate over time (a data moat no competitor can copy).
const pool = require('../database/pool');

const LISTINGS_PUBLIC = process.env.LISTINGS_PUBLIC !== 'false';
const intOrNull = v => (v == null ? null : Math.round(Number(v)));

// GET /api/market/index — statewide + regional aggregates + snapshot history.
exports.getIndex = async (req, res) => {
    if (!LISTINGS_PUBLIC) return res.json({ statewide: null, regions: [], history: [] });
    try {
        const stateQ = pool.query(`
            SELECT COUNT(*) FILTER (WHERE status='active')::int AS active,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY price) FILTER (WHERE status='active' AND price IS NOT NULL) AS median_price,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now()-created_at))/86400) FILTER (WHERE status='active') AS median_dom,
                   AVG(price/NULLIF(sqft,0)) FILTER (WHERE status='active' AND price IS NOT NULL AND sqft>0) AS avg_ppsf,
                   COUNT(*) FILTER (WHERE status='active' AND created_at >= date_trunc('month',now()))::int AS new_month,
                   COUNT(*) FILTER (WHERE status='sold' AND sold_at >= now()-interval '180 days')::int AS sold_180,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY price) FILTER (WHERE status='sold' AND sold_at >= now()-interval '180 days' AND price IS NOT NULL) AS sold_median
              FROM listings`);
        const regionQ = pool.query(`
            SELECT COALESCE(NULLIF(lk.region,''),'Other Minnesota') AS region,
                   COUNT(*) FILTER (WHERE l.status='active')::int AS active,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY l.price) FILTER (WHERE l.status='active' AND l.price IS NOT NULL) AS median_price,
                   COUNT(*) FILTER (WHERE l.status='sold' AND l.sold_at >= now()-interval '180 days')::int AS sold_180
              FROM listings l LEFT JOIN lakes lk ON lk.id = l.lake_id
             GROUP BY COALESCE(NULLIF(lk.region,''),'Other Minnesota')
            HAVING COUNT(*) FILTER (WHERE l.status='active') > 0
             ORDER BY active DESC`);
        const histQ = pool.query(`
            SELECT to_char(month,'YYYY-MM') AS month, active, median_price, median_dom, sold, sold_median
              FROM market_snapshots WHERE scope='state' ORDER BY month DESC LIMIT 12`);

        const [stateR, regionR, histR] = await Promise.all([stateQ, regionQ, histQ]);
        const s = stateR.rows[0];
        res.json({
            statewide: {
                active: s.active || 0,
                median_price: intOrNull(s.median_price),
                median_dom: intOrNull(s.median_dom),
                avg_ppsf: intOrNull(s.avg_ppsf),
                new_month: s.new_month || 0,
                sold_180: s.sold_180 || 0,
                sold_median: intOrNull(s.sold_median),
            },
            regions: regionR.rows.map(r => ({
                region: r.region, active: r.active,
                median_price: intOrNull(r.median_price), sold_180: r.sold_180,
            })),
            history: histR.rows.reverse(),   // oldest → newest for charting
        });
    } catch (e) { console.error('[market.getIndex]', e.message); res.status(500).json({ error: 'Failed to load market index.' }); }
};

// Record a statewide snapshot for the current month (idempotent per month).
// Called from the boot scheduler.
async function recordMonthlySnapshot() {
    if (!LISTINGS_PUBLIC) return;
    try {
        await pool.query(`
            INSERT INTO market_snapshots (scope, month, active, median_price, median_dom, sold, sold_median)
            SELECT 'state', date_trunc('month', now())::date,
                   COUNT(*) FILTER (WHERE status='active')::int,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY price) FILTER (WHERE status='active' AND price IS NOT NULL)::int,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now()-created_at))/86400) FILTER (WHERE status='active')::int,
                   COUNT(*) FILTER (WHERE status='sold' AND sold_at >= now()-interval '180 days')::int,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY price) FILTER (WHERE status='sold' AND sold_at >= now()-interval '180 days' AND price IS NOT NULL)::int
              FROM listings
            ON CONFLICT (scope, month) DO UPDATE
              SET active=EXCLUDED.active, median_price=EXCLUDED.median_price, median_dom=EXCLUDED.median_dom,
                  sold=EXCLUDED.sold, sold_median=EXCLUDED.sold_median`);

        // Per-lake snapshots (scope = lake slug) → per-lake trend charts.
        await pool.query(`
            INSERT INTO market_snapshots (scope, month, active, median_price, median_dom, sold, sold_median)
            SELECT lk.slug, date_trunc('month', now())::date,
                   COUNT(*) FILTER (WHERE l.status='active')::int,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY l.price) FILTER (WHERE l.status='active' AND l.price IS NOT NULL)::int,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now()-l.created_at))/86400) FILTER (WHERE l.status='active')::int,
                   COUNT(*) FILTER (WHERE l.status='sold' AND l.sold_at >= now()-interval '180 days')::int,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY l.price) FILTER (WHERE l.status='sold' AND l.sold_at >= now()-interval '180 days' AND l.price IS NOT NULL)::int
              FROM lakes lk JOIN listings l ON l.lake_id = lk.id
             GROUP BY lk.slug
            HAVING COUNT(*) FILTER (WHERE l.status IN ('active','sold')) > 0
            ON CONFLICT (scope, month) DO UPDATE
              SET active=EXCLUDED.active, median_price=EXCLUDED.median_price, median_dom=EXCLUDED.median_dom,
                  sold=EXCLUDED.sold, sold_median=EXCLUDED.sold_median`);
    } catch (e) { console.warn('[market.snapshot]', e.message); }
}
exports.recordMonthlySnapshot = recordMonthlySnapshot;
