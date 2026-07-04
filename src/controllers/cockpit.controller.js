// cockpit.controller.js — unified admin revenue cockpit. One call returns MRR
// (agents + businesses), 30-day churn, referral + boost revenue, cash-offer
// pipeline, at-risk agents, and an MRR trend. Each query is independently
// fault-tolerant so a missing table never blanks the whole board.
const pool = require('../database/pool');

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const AGENT_PRICE = { founder: 249, top_agent: 149, premium: 149, mn_lake_specialist: 39, basic: 9 };
const BIZ_PRICE = { premium: num(process.env.STRIPE_PRICING_BUSINESS_PREMIUM_MONTHLY, 79), basic: num(process.env.STRIPE_PRICING_BUSINESS_BASIC_MONTHLY, 29) };
const REFERRAL_FEE = num(process.env.PARTNER_REFERRAL_FEE_USD, 50);
const BOOST_PER_DAY = num(process.env.BOOST_PRICE_PER_DAY_USD, 5);
const CASH_OFFER_VALUE = num(process.env.CASH_OFFER_VALUE_USD, 3000);
const q = (sql, params = []) => pool.query(sql, params).then(r => r.rows).catch(() => []);

async function agentMrr() {
    const rows = await q(`SELECT paid_membership_code AS code, COUNT(*)::int n FROM agents
                           WHERE subscription_status = 'active' AND paid_membership_code IS NOT NULL
                        GROUP BY paid_membership_code`);
    let mrr = 0, seats = 0;
    for (const r of rows) { mrr += (AGENT_PRICE[r.code] || 0) * r.n; seats += r.n; }
    return { mrr, seats, byTier: rows };
}
async function businessMrr() {
    const rows = await q(`SELECT paid_tier AS tier, COUNT(*)::int n FROM businesses
                           WHERE subscription_status = 'active' AND paid_tier IN ('premium','basic')
                        GROUP BY paid_tier`);
    let mrr = 0, seats = 0;
    for (const r of rows) { mrr += (BIZ_PRICE[r.tier] || 0) * r.n; seats += r.n; }
    return { mrr, seats, byTier: rows };
}

// GET /api/cockpit — the whole board.
exports.getCockpit = async (req, res) => {
    if (!['admin', 'super_admin'].includes(req.user?.role)) return res.status(403).json({ error: 'Admin only.' });
    try {
        const [agents, biz] = await Promise.all([agentMrr(), businessMrr()]);
        const totalMrr = agents.mrr + biz.mrr;

        const churn = await q(`SELECT COUNT(*)::int n FROM activity_log
                                WHERE event_type IN ('agent.subscription.canceled','business.subscription.canceled')
                                  AND created_at >= NOW() - INTERVAL '30 days'`);
        const referrals = await q(`SELECT COUNT(*)::int n FROM partner_referrals WHERE created_at >= NOW() - INTERVAL '30 days'`);
        const boosts = await q(`SELECT COALESCE(SUM((details->>'days')::int),0)::int AS days, COUNT(*)::int n
                                  FROM activity_log WHERE event_type = 'listing.boost.purchased'
                                   AND created_at >= NOW() - INTERVAL '30 days'`);
        const cash = await q(`SELECT COUNT(*) FILTER (WHERE status NOT IN ('rejected','declined','canceled','closed','won','completed','sold','accepted'))::int AS open,
                                     COUNT(*) FILTER (WHERE status IN ('accepted','won','closed','sold','completed'))::int AS won
                                FROM cash_offers`);
        const atRisk = await require('../services/churn').findAtRisk().then(l => l.length).catch(() => 0);
        const history = await q(`SELECT to_char(month,'Mon') AS label, total_mrr FROM mrr_snapshots ORDER BY month ASC LIMIT 12`);

        const refCount = num(referrals[0]?.n);
        const boostDays = num(boosts[0]?.days);
        const cashOpen = num(cash[0]?.open), cashWon = num(cash[0]?.won);

        res.json({
            mrr: { agents: agents.mrr, business: biz.mrr, total: totalMrr, arr: totalMrr * 12 },
            seats: { agents: agents.seats, business: biz.seats },
            agents_by_tier: agents.byTier, business_by_tier: biz.byTier,
            churn_30d: num(churn[0]?.n),
            referrals_30d: refCount, referral_revenue_30d: refCount * REFERRAL_FEE,
            boosts_30d: num(boosts[0]?.n), boost_revenue_30d: boostDays * BOOST_PER_DAY,
            cash_offers: { open: cashOpen, won: cashWon, pipeline_value: cashOpen * CASH_OFFER_VALUE, won_value: cashWon * CASH_OFFER_VALUE },
            at_risk: atRisk,
            history,
        });
    } catch (e) { console.error('[cockpit.getCockpit]', e.message); res.status(500).json({ error: 'Failed to load cockpit.' }); }
};

// Record this month's MRR (idempotent). Called from the boot scheduler.
async function recordMrrSnapshot() {
    try {
        const [agents, biz] = await Promise.all([agentMrr(), businessMrr()]);
        await pool.query(
            `INSERT INTO mrr_snapshots (month, agent_mrr, business_mrr, total_mrr)
             VALUES (date_trunc('month', now())::date, $1, $2, $3)
             ON CONFLICT (month) DO UPDATE SET agent_mrr=EXCLUDED.agent_mrr, business_mrr=EXCLUDED.business_mrr, total_mrr=EXCLUDED.total_mrr`,
            [agents.mrr, biz.mrr, agents.mrr + biz.mrr]);
    } catch (e) { console.warn('[cockpit.recordMrrSnapshot]', e.message); }
}
exports.recordMrrSnapshot = recordMrrSnapshot;
