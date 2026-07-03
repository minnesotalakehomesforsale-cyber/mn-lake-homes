/**
 * financials.controller.js — Financials tab data.
 *
 *  - projections(): DB-modeled seat capacity + fill scenarios. Live Stripe
 *    actuals (MRR/ARR) come from the existing /api/admin/revenue; this adds the
 *    "what if we fill X seats" side. Recomputes on every call, so it tracks the
 *    current agent roster, founder seatings, and per-lake prices automatically.
 *  - lakeSeatValues(): per-lake founder-seat economics (leads + AI value + the
 *    actual listed price).
 *  - recomputeSeatValues(): AI re-estimates each lake's founder-seat value from
 *    home-price desirability × our lead traffic.
 *  - setFounderPrice(): admin sets the actual listed price ($249–$5000).
 */
const pool = require('../database/pool');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
// Elite = $149 (top_agent, env FOUNDER_MONTHLY), Prime = $39, Basic = $9.
const PRICE = {
    elite: num(process.env.STRIPE_PRICING_FOUNDER_MONTHLY, 149),
    prime: num(process.env.STRIPE_PRICING_PRIME_MONTHLY, 39),
    basic: num(process.env.STRIPE_PRICING_STANDARD_MONTHLY, 9),
};
// Per-area staffing goals (founder is per-lake, priced individually).
const GOAL = { elite: 2, prime: 5, basic: 10 };

// ── Businesses (directory: resorts, marinas, dock builders, …) ──────────────
// Tiers: Premium ($79, "Featured Partner") · Standard ($29, "Local Spotlight")
// · Free ($0). Only paying tiers (subscription_status='active') add revenue.
const BIZ_PRICE = {
    premium: num(process.env.STRIPE_PRICING_BUSINESS_PREMIUM_MONTHLY, 79),
    basic:   num(process.env.STRIPE_PRICING_BUSINESS_BASIC_MONTHLY, 29),
};
// Per-area goal: 1 Featured Partner + 3 Local Spotlights in each service area.
const BIZ_GOAL = { premium: 1, basic: 3 };
// The canonical business categories (business.controller KNOWN_TYPES), with a
// label + whether we consider it a "core" type every area should have covered.
const BIZ_TYPES = [
    { key: 'marina',             label: 'Marina',            core: true  },
    { key: 'outdoor_recreation', label: 'Resort / Outdoor',  core: true  },
    { key: 'restaurant',         label: 'Restaurant',        core: true  },
    { key: 'boat_rental',        label: 'Boat rental',       core: true  },
    { key: 'builder',            label: 'Builder',           core: false },
    { key: 'photographer',       label: 'Photographer',      core: false },
    { key: 'service',            label: 'Service',           core: false },
    { key: 'other',              label: 'Other',             core: false },
];
// A business is "live" on the directory when active AND either admin-managed
// (no owner login), paying, or comped. Reused across the queries below.
const BIZ_LIVE = `b.status = 'active' AND (b.user_id IS NULL OR b.subscription_status = 'active' OR b.tier_comped)`;
// A founder seat with no listed price AND no AI value counts as $0 — NOT a tier
// price. (It used to fall back to $149, which is the Elite rate and made the
// founder projection look like elite pricing.) Set a price or run the AI
// valuation to give a lake real founder value.
const DEFAULT_FOUNDER = 0;

function stripeFromEnv() {
    try { const k = process.env.STRIPE_SECRET_KEY; return k ? require('stripe')(k) : null; } catch (_) { return null; }
}
// Actual current MRR straight from Stripe's active subscriptions (real amounts),
// normalized to monthly. This is the source of truth for "now" — never assume
// membership tier == amount paid.
async function stripeMonthlyMrrCents(stripe) {
    let cents = 0, active = 0;
    for await (const sub of stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.items.data.price'] })) {
        active++;
        for (const it of sub.items.data) {
            const price = it.price || {}; const qty = it.quantity || 1;
            let amt = (price.unit_amount || 0) * qty;
            const iv = price.recurring && price.recurring.interval;
            if (iv === 'year') amt = Math.round(amt / 12);
            else if (iv === 'week') amt = Math.round((amt * 52) / 12);
            else if (iv === 'day') amt = Math.round((amt * 365) / 12);
            cents += amt;
        }
    }
    return { cents, active };
}

let _openai = null;
function getOpenAI() {
    if (_openai) return _openai;
    if (!process.env.OPENAI_API_KEY) return null;
    try { const { OpenAI } = require('openai'); _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); return _openai; }
    catch (_) { return null; }
}
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

exports.projections = async (req, res) => {
    try {
        const [areasQ, lakesQ, filledQ, founderNowQ, founderPotQ] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int n FROM tags WHERE active = TRUE`),
            pool.query(`SELECT COUNT(*)::int n FROM lakes WHERE status = 'published'`),
            pool.query(`SELECT m.code, COUNT(*)::int n
                          FROM agents a JOIN users u ON u.id = a.user_id JOIN memberships m ON m.id = a.membership_id
                         WHERE a.profile_status = 'published' AND a.is_published = TRUE AND u.account_status = 'active' AND a.deleted_at IS NULL
                      GROUP BY m.code`),
            pool.query(`SELECT COUNT(*)::int n,
                               COALESCE(SUM(COALESCE(l.founder_seat_price, l.founder_seat_ai_value, ${DEFAULT_FOUNDER})), 0)::int total
                          FROM lakes l
                         WHERE EXISTS (SELECT 1 FROM agent_lakes al WHERE al.lake_id = l.id AND al.is_founder)`),
            pool.query(`SELECT COALESCE(SUM(COALESCE(founder_seat_price, founder_seat_ai_value, ${DEFAULT_FOUNDER})), 0)::int total
                          FROM lakes WHERE status = 'published'`),
        ]);
        const A = areasQ.rows[0].n, L = lakesQ.rows[0].n;
        const by = {}; filledQ.rows.forEach(r => { by[r.code] = r.n; });
        const cap  = { elite: A * GOAL.elite, prime: A * GOAL.prime, basic: A * GOAL.basic };
        const fill = { elite: by['top_agent'] || 0, prime: by['mn_lake_specialist'] || 0, basic: by['basic'] || 0 };

        const subMrrFull  = cap.elite * PRICE.elite + cap.prime * PRICE.prime + cap.basic * PRICE.basic;
        const founderFull = founderPotQ.rows[0].total;
        const mrrFull     = subMrrFull + founderFull;
        // Modeled "now" is only a fallback when Stripe isn't connected.
        const modeledNow  = fill.elite * PRICE.elite + fill.prime * PRICE.prime + fill.basic * PRICE.basic + founderNowQ.rows[0].total;

        // ACTUAL current MRR from Stripe (real charges) — the source of truth.
        const stripe = stripeFromEnv();
        let actualMrr = null, activeSubs = null;
        if (stripe) { try { const s = await stripeMonthlyMrrCents(stripe); actualMrr = Math.round(s.cents / 100); activeSubs = s.active; } catch (_) {} }

        const mrrNow = (actualMrr != null) ? actualMrr : modeledNow;
        const ceiling = Math.max(mrrFull, mrrNow);
        const scen = p => Math.round(mrrNow + p * (ceiling - mrrNow));

        res.json({
            prices: PRICE, goals: GOAL, areas: A, lakes: L,
            actual: { source: actualMrr != null ? 'stripe' : 'modeled', stripeConfigured: !!stripe, activeSubs, modeledNow },
            subscription: { capacity: cap, filled: fill, mrrFull: subMrrFull,
                            potentialByTier: { elite: cap.elite * PRICE.elite, prime: cap.prime * PRICE.prime, basic: cap.basic * PRICE.basic } },
            founder: { seatsFilled: founderNowQ.rows[0].n, seatsTotal: L, mrrFull: founderFull },
            mrr: { now: mrrNow, full: mrrFull }, arr: { now: mrrNow * 12, full: mrrFull * 12 },
            scenarios: [
                { label: 'Today (actual)',   mrr: mrrNow },
                { label: 'Fill 25% of gap',  mrr: scen(0.25) },
                { label: 'Fill 50% of gap',  mrr: scen(0.50) },
                { label: 'Fill 75% of gap',  mrr: scen(0.75) },
                { label: 'All seats full',   mrr: mrrFull },
            ],
        });
    } catch (err) {
        console.error('[financials.projections]', err.message);
        res.status(500).json({ error: 'Failed to build projections.' });
    }
};

exports.lakeSeatValues = async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT l.id, l.slug, l.name, l.region, l.state,
                   l.founder_seat_price, l.founder_seat_ai_value, l.founder_seat_ai_reason, l.founder_seat_ai_at,
                   EXISTS (SELECT 1 FROM agent_lakes al WHERE al.lake_id = l.id AND al.is_founder) AS founder_seated,
                   (SELECT COUNT(*) FROM leads le WHERE le.lake_id = l.id AND le.created_at > NOW() - INTERVAL '90 days')::int AS leads_90d,
                   (SELECT COUNT(*) FROM leads le WHERE le.lake_id = l.id)::int AS leads_all,
                   (SELECT COUNT(*) FROM page_views pv WHERE pv.path IN ('/lakes/' || l.slug, '/lakes/' || l.slug || '/')
                                                         AND pv.created_at > NOW() - INTERVAL '90 days')::int AS views_90d
              FROM lakes l
             WHERE l.status = 'published'
          ORDER BY COALESCE(l.founder_seat_ai_value, 0) DESC, l.name ASC`);
        res.json(rows);
    } catch (err) {
        console.error('[financials.lakeSeatValues]', err.message);
        res.status(500).json({ error: 'Failed to load lake seat values.' });
    }
};

exports.setFounderPrice = async (req, res) => {
    try {
        const raw = req.body?.price;
        const price = (raw === null || raw === '' || raw === undefined)
            ? null : Math.max(249, Math.min(5000, parseInt(raw, 10) || 0));
        const { rowCount } = await pool.query(`UPDATE lakes SET founder_seat_price = $1 WHERE id = $2`, [price, req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Lake not found.' });
        res.json({ success: true, price });
    } catch (err) {
        console.error('[financials.setFounderPrice]', err.message);
        res.status(500).json({ error: 'Failed to set price.' });
    }
};

exports.recomputeSeatValues = async (req, res) => {
    const client = getOpenAI();
    if (!client) return res.status(503).json({ error: 'OpenAI is not configured (set OPENAI_API_KEY).' });
    try {
        const { rows } = await pool.query(`
            SELECT l.id, l.name, l.region, l.state,
                   (SELECT COUNT(*) FROM leads le WHERE le.lake_id = l.id AND le.created_at > NOW() - INTERVAL '90 days')::int AS leads_90d,
                   (SELECT COUNT(*) FROM page_views pv WHERE pv.path IN ('/lakes/' || l.slug, '/lakes/' || l.slug || '/')
                                                         AND pv.created_at > NOW() - INTERVAL '90 days')::int AS views_90d
              FROM lakes l WHERE l.status = 'published' ORDER BY l.name`);
        if (!rows.length) return res.json({ updated: 0, total: 0 });

        // Reference lakes by a small integer index — NOT their UUID. LLMs mangle
        // opaque UUIDs, which silently breaks the id match. We map the index back
        // to the real id server-side.
        const input = rows.map((r, i) => ({ i, name: r.name, region: r.region, state: r.state, leads_90d: r.leads_90d, views_90d: r.views_90d }));
        const sys = 'You price exclusive "founding agent" sponsorship seats on lakes for a Minnesota-area lake-real-estate lead network. Each lake has ONE founder seat: the founder gets 100% of that lake\'s leads AND top priority in their surrounding towns, so the seat is worth MORE than the $149/mo Elite plan — the floor is $249/mo, ceiling $5000/mo. Method: (1) WATERFRONT HOME PRICES on that lake (your knowledge) set the CEILING — ultra-premium lakes like Lake Minnetonka can justify up to $5000, modest community lakes far less. (2) Then scale DOWN toward the floor by ACTUAL DEMAND we can prove: page views (views_90d) and leads (leads_90d) on that lake page. Demand is what a founder actually pays for. A lake with ZERO views AND ZERO leads has NO demonstrated demand, so price it LOW regardless of home prices — NEVER near the max — as speculative potential (roughly $300-$700 for premium lakes, $249-$300 for modest ones). Leads count more than views; both rising moves it toward the ceiling. Return ONLY JSON: {"values":[{"i":<lake index>,"value":<integer 249-5000>,"reason":"<max 12 words; name the driver>"}]} with one entry for EVERY lake index provided.';
        const user = `Lakes (JSON, use the "i" index in your reply):\n${JSON.stringify(input)}`;
        const completion = await client.chat.completions.create({
            model: MODEL,
            messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
            temperature: 0.3, max_tokens: 8000, response_format: { type: 'json_object' },
        });
        let parsed; try { parsed = JSON.parse(completion.choices[0]?.message?.content || '{}'); }
        catch (_) { return res.status(502).json({ error: 'AI returned invalid JSON.' }); }
        // Be lenient about the wrapper key.
        const values = Array.isArray(parsed) ? parsed
            : (parsed.values || parsed.lakes || parsed.data || Object.values(parsed).find(Array.isArray) || []);
        let updated = 0;
        for (const v of values) {
            const idx = Number(v.i ?? v.index);
            const lake = rows[idx];
            const val = Math.max(249, Math.min(5000, parseInt(v.value, 10) || 0));
            if (!lake || !val) continue;
            const r = await pool.query(
                `UPDATE lakes SET founder_seat_ai_value = $1, founder_seat_ai_reason = $2, founder_seat_ai_at = NOW() WHERE id = $3`,
                [val, String(v.reason || '').slice(0, 160), lake.id]);
            updated += r.rowCount;
        }
        if (!updated) return res.status(502).json({ error: `AI returned ${values.length} value(s) but none mapped to a lake. Try again.` });
        res.json({ updated, total: rows.length });
    } catch (err) {
        console.error('[financials.recomputeSeatValues]', err.message);
        res.status(500).json({ error: `Recompute failed: ${err.message}` });
    }
};

// ── Shared models (used by the business + company endpoints) ────────────────

// Agent + founder side, modeled from current roster + per-area goals.
async function agentModel() {
    const [areasQ, lakesQ, filledQ, founderNowQ, founderPotQ] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int n FROM tags WHERE active = TRUE`),
        pool.query(`SELECT COUNT(*)::int n FROM lakes WHERE status = 'published'`),
        pool.query(`SELECT m.code, COUNT(*)::int n
                      FROM agents a JOIN users u ON u.id = a.user_id JOIN memberships m ON m.id = a.membership_id
                     WHERE a.profile_status = 'published' AND a.is_published = TRUE AND u.account_status = 'active' AND a.deleted_at IS NULL
                  GROUP BY m.code`),
        pool.query(`SELECT COUNT(*)::int n,
                           COALESCE(SUM(COALESCE(l.founder_seat_price, l.founder_seat_ai_value, ${DEFAULT_FOUNDER})), 0)::int total
                      FROM lakes l
                     WHERE EXISTS (SELECT 1 FROM agent_lakes al WHERE al.lake_id = l.id AND al.is_founder)`),
        pool.query(`SELECT COALESCE(SUM(COALESCE(founder_seat_price, founder_seat_ai_value, ${DEFAULT_FOUNDER})), 0)::int total
                      FROM lakes WHERE status = 'published'`),
    ]);
    const A = areasQ.rows[0].n, L = lakesQ.rows[0].n;
    const by = {}; filledQ.rows.forEach(r => { by[r.code] = r.n; });
    const cap  = { elite: A * GOAL.elite, prime: A * GOAL.prime, basic: A * GOAL.basic };
    const fill = { elite: by['top_agent'] || 0, prime: by['mn_lake_specialist'] || 0, basic: by['basic'] || 0 };
    const subMrrFull = cap.elite * PRICE.elite + cap.prime * PRICE.prime + cap.basic * PRICE.basic;
    const founderFull = founderPotQ.rows[0].total;
    const founderNow  = founderNowQ.rows[0].total;
    const modeledNow  = fill.elite * PRICE.elite + fill.prime * PRICE.prime + fill.basic * PRICE.basic + founderNow;
    return { areas: A, lakes: L, capacity: cap, filled: fill, subMrrFull,
             founderFull, founderNow, founderSeated: founderNowQ.rows[0].n,
             modeledNow, mrrFull: subMrrFull + founderFull };
}

// Business side, modeled from live directory + per-area goals + type coverage.
async function businessModel() {
    const [areasQ, payingQ, liveQ, typeCovQ, areaGapQ] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int n FROM tags WHERE active = TRUE`),
        pool.query(`SELECT paid_tier AS tier, COUNT(*)::int n
                      FROM businesses
                     WHERE subscription_status = 'active' AND stripe_subscription_id IS NOT NULL
                       AND paid_tier IN ('premium','basic')
                  GROUP BY paid_tier`),
        pool.query(`SELECT b.type, COALESCE(NULLIF(b.tier,''),'free') AS tier, COUNT(*)::int n
                      FROM businesses b WHERE ${BIZ_LIVE} GROUP BY b.type, 2`),
        pool.query(`SELECT b.type, COUNT(DISTINCT bt.tag_id)::int areas
                      FROM businesses b
                      JOIN business_tags bt ON bt.business_id = b.id
                      JOIN tags t ON t.id = bt.tag_id AND t.active = TRUE
                     WHERE ${BIZ_LIVE} GROUP BY b.type`),
        pool.query(`SELECT t.name, t.state, t.region
                      FROM tags t
                     WHERE t.active = TRUE
                       AND NOT EXISTS (SELECT 1 FROM business_tags bt
                                        JOIN businesses b ON b.id = bt.business_id AND ${BIZ_LIVE}
                                       WHERE bt.tag_id = t.id)
                  ORDER BY t.state, t.name`),
    ]);
    const A = areasQ.rows[0].n;
    const paying = { premium: 0, basic: 0 };
    payingQ.rows.forEach(r => { if (r.tier in paying) paying[r.tier] = r.n; });
    paying.total = paying.premium + paying.basic;

    const live = { premium: 0, basic: 0, free: 0, total: 0 };
    const typeCount = {};
    liveQ.rows.forEach(r => {
        const tier = ['premium', 'basic', 'free'].includes(r.tier) ? r.tier : 'free';
        live[tier] += r.n; live.total += r.n;
        typeCount[r.type] = (typeCount[r.type] || 0) + r.n;
    });
    const areasByType = {};
    typeCovQ.rows.forEach(r => { areasByType[r.type] = r.areas; });

    const typeCoverage = BIZ_TYPES.map(t => ({
        key: t.key, label: t.label, core: t.core,
        live: typeCount[t.key] || 0,
        areasCovered: areasByType[t.key] || 0,
    }));

    const capacity = { premium: A * BIZ_GOAL.premium, basic: A * BIZ_GOAL.basic };
    const mrrNow  = paying.premium * BIZ_PRICE.premium + paying.basic * BIZ_PRICE.basic;
    const mrrFull = capacity.premium * BIZ_PRICE.premium + capacity.basic * BIZ_PRICE.basic;

    return { areas: A, prices: BIZ_PRICE, goals: BIZ_GOAL, paying, live, capacity,
             typeCoverage, mrr: { now: mrrNow, full: mrrFull },
             areaGaps: areaGapQ.rows, coveredAreas: A - areaGapQ.rows.length };
}

// GET /api/admin/financials/business-projections
exports.businessProjections = async (req, res) => {
    try {
        const m = await businessModel();
        const mrrNow = m.mrr.now, mrrFull = m.mrr.full;
        const ceiling = Math.max(mrrFull, mrrNow);
        const scen = p => Math.round(mrrNow + p * (ceiling - mrrNow));
        res.json({
            ...m,
            arr: { now: mrrNow * 12, full: mrrFull * 12 },
            scenarios: [
                { label: 'Today (paying now)', mrr: mrrNow },
                { label: 'Fill 25% of goal',   mrr: scen(0.25) },
                { label: 'Fill 50% of goal',   mrr: scen(0.50) },
                { label: 'Fill 75% of goal',   mrr: scen(0.75) },
                { label: 'Every slot full',    mrr: mrrFull },
            ],
        });
    } catch (err) {
        console.error('[financials.businessProjections]', err.message);
        res.status(500).json({ error: 'Failed to build business projections.' });
    }
};

// GET /api/admin/financials/company — the whole company, agents + businesses.
exports.companyProjections = async (req, res) => {
    try {
        const [ag, biz] = await Promise.all([agentModel(), businessModel()]);
        // Stripe actual is the true combined "now" (every active subscription).
        const stripe = stripeFromEnv();
        let actualMrr = null, activeSubs = null;
        if (stripe) { try { const s = await stripeMonthlyMrrCents(stripe); actualMrr = Math.round(s.cents / 100); activeSubs = s.active; } catch (_) {} }

        const agentSubsNow = ag.modeledNow - ag.founderNow;
        const modeledNow = ag.modeledNow + biz.mrr.now;
        const mrrNow = actualMrr != null ? actualMrr : modeledNow;
        const mrrFull = ag.mrrFull + biz.mrr.full;

        res.json({
            source: actualMrr != null ? 'stripe' : 'modeled',
            stripeConfigured: !!stripe, activeSubs, modeledNow,
            mrr: { now: mrrNow, full: mrrFull },
            arr: { now: mrrNow * 12, full: mrrFull * 12 },
            upside: Math.max(0, mrrFull - mrrNow),
            areas: ag.areas, lakes: ag.lakes,
            streams: {
                agents:   { nowModeled: agentSubsNow, full: ag.subMrrFull },
                founder:  { nowModeled: ag.founderNow, full: ag.founderFull, seated: ag.founderSeated, total: ag.lakes },
                business: { nowModeled: biz.mrr.now,   full: biz.mrr.full,   paying: biz.paying.total, live: biz.live.total },
            },
        });
    } catch (err) {
        console.error('[financials.companyProjections]', err.message);
        res.status(500).json({ error: 'Failed to build company overview.' });
    }
};
