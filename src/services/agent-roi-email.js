// agent-roi-email.js — once-a-month "here's what your subscription earned you"
// recap to every active agent who got leads last month. Churn insurance.
//
// Fires from a periodic check (server.js). A marker in app_config
// ('agent_roi_email_month') makes it send at most once per calendar month even
// across restarts — we claim the month BEFORE sending so a crash mid-run can't
// double-send the whole roster.
const pool = require('../database/pool');
const emailService = require('./email');

const AVG_SALE   = Number(process.env.AGENT_ROI_AVG_SALE_USD)  || 475000;
const COMMISSION = Number(process.env.AGENT_ROI_COMMISSION_PCT) || 2.5;
const CLOSE_RATE = Number(process.env.AGENT_ROI_CLOSE_RATE)     || 0.08;
// Plan prices come from the single env-driven source (STRIPE_PRICING_*), not
// hardcoded here — so a price change can't silently make this recap's math wrong.
const { monthlyPriceForCode, agentTierLabel } = require('../controllers/stripe.controller');
const SITE_URL   = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
const money = n => '$' + Number(n || 0).toLocaleString('en-US');

async function runMonthlyRoiEmails() {
    if (process.env.AGENT_ROI_EMAIL_ENABLED === 'false') return;
    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7);            // e.g. 2026-08 → recap for July
    try {
        // First time we ever run: initialize the marker silently so we don't
        // blast a recap for a month that predates this feature.
        const existing = await pool.query(`SELECT value FROM app_config WHERE key = 'agent_roi_email_month'`);
        if (!existing.rowCount) {
            await pool.query(
                `INSERT INTO app_config (key, value, description)
                 VALUES ('agent_roi_email_month', to_jsonb($1::text), 'Last month the agent ROI recap was sent')
                 ON CONFLICT (key) DO NOTHING`, [monthKey]);
            return;
        }
        const cur = typeof existing.rows[0].value === 'string' ? JSON.parse(existing.rows[0].value) : existing.rows[0].value;
        if (cur === monthKey) return;   // already sent this month
        // Claim the month atomically before sending (guards against double-send).
        const claim = await pool.query(
            `UPDATE app_config SET value = to_jsonb($1::text)
              WHERE key = 'agent_roi_email_month' AND value <> to_jsonb($1::text) RETURNING key`,
            [monthKey]);
        if (!claim.rowCount) return;

        // Previous calendar month window [start, end).
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

        // PAID (or comped) published agents only — this monthly performance report
        // is a paid-tier perk. "Live paying" = lifecycle paying/at_risk, or comped.
        const { rows } = await pool.query(`
            SELECT a.id AS agent_id, a.slug, a.is_featured,
                   a.paid_membership_code, a.lifecycle_state, a.tier_comped,
                   u.email, u.full_name, m.code AS plan_code,
                   COALESCE(a.referral_fees_saved_usd, 0)::int AS referral_saved,
                   COUNT(l.*)::int AS leads,
                   COUNT(l.*) FILTER (WHERE l.listing_id IS NOT NULL)::int AS showings
              FROM agents a
              JOIN users u ON u.id = a.user_id AND u.account_status = 'active'
         LEFT JOIN memberships m ON m.id = a.membership_id
         LEFT JOIN leads l ON l.agent_id = a.id AND l.deleted_at IS NULL
                          AND l.created_at >= $1 AND l.created_at < $2
             WHERE a.profile_status = 'published'
               AND (a.lifecycle_state IN ('paying', 'at_risk') OR a.tier_comped = TRUE)
             GROUP BY a.id, a.slug, a.is_featured, a.paid_membership_code,
                      a.lifecycle_state, a.tier_comped, u.email, u.full_name, m.code`,
            [start.toISOString(), end.toISOString()]);

        // Per-agent reach for the previous month: profile views, views on the
        // lake pages they serve, and buyer requests on those lakes.
        async function reachFor(agentId, slug) {
            const lk = await pool.query(
                `SELECT l.slug, l.id FROM agent_lakes al JOIN lakes l ON l.id = al.lake_id
                  WHERE al.agent_id = $1 AND l.slug IS NOT NULL`, [agentId]);
            const lakeIds = lk.rows.map(r => r.id).filter(Boolean);
            const lakePaths = lk.rows.map(r => '/lakes/' + r.slug);
            const pv = await pool.query(
                `SELECT COUNT(*)::int AS n FROM page_views
                  WHERE path = $1 AND created_at >= $2 AND created_at < $3`,
                ['/agents/' + slug, start.toISOString(), end.toISOString()]);
            let lakeViews = 0, demand = 0;
            if (lakePaths.length) {
                const lv = await pool.query(
                    `SELECT COUNT(*)::int AS n FROM page_views
                      WHERE path = ANY($1) AND created_at >= $2 AND created_at < $3`,
                    [lakePaths, start.toISOString(), end.toISOString()]);
                lakeViews = lv.rows[0].n;
                const ad = await pool.query(
                    `SELECT COUNT(*)::int AS n FROM leads
                      WHERE lake_id = ANY($1) AND deleted_at IS NULL
                        AND created_at >= $2 AND created_at < $3`,
                    [lakeIds, start.toISOString(), end.toISOString()]);
                demand = ad.rows[0].n;
            }
            return { profileViews: pv.rows[0].n, lakeViews, demand, lakesServed: lakePaths.length };
        }

        let sent = 0;
        for (const r of rows) {
            if (!r.email) continue;
            const reach = await reachFor(r.agent_id, r.slug);
            // Nothing worth reporting — no leads and no views — skip to avoid an empty recap.
            if (!r.leads && !reach.profileViews && !reach.lakeViews) continue;

            const priceCode = r.paid_membership_code || r.plan_code;
            const planPrice = monthlyPriceForCode(priceCode);
            const perLead = Math.round(AVG_SALE * (COMMISSION / 100) * CLOSE_RATE);
            const monthValue = r.leads * perLead;
            const mult = (planPrice && monthValue) ? (monthValue / planPrice).toFixed(1) : null;
            const first = (r.full_name || '').split(' ')[0] || 'there';
            const tierLabel = agentTierLabel(r);
            const placement = reach.lakesServed
                ? `★ You're a ${tierLabel}, featured on your ${reach.lakesServed} lake page${reach.lakesServed === 1 ? '' : 's'}.`
                : `★ You're a ${tierLabel}. Add your service-area lakes to get featured on their pages.`;

            const reachCell = (v, l) => `<td style="text-align:center;padding:0.35rem;"><div style="font-size:1.5rem;font-weight:800;color:#1a202c;">${v}</div><div style="color:#718096;font-size:0.74rem;line-height:1.25;">${l}</div></td>`;
            const html = `
                <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;color:#1a202c;">
                    <p style="color:#718096;margin:0 0 0.25rem;">Your ${label} performance report</p>
                    <h1 style="margin:0 0 1rem;font-size:1.4rem;">Hi ${first}, here's how your lakes performed</h1>

                    <div style="border:1px solid #e6eaf0;border-radius:14px;padding:1.1rem 1rem 0.8rem;margin-bottom:1rem;">
                        <div style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.5px;color:#718096;margin-bottom:0.3rem;">Your lakes in ${label}</div>
                        <table style="width:100%;border-collapse:collapse;"><tr>
                            ${reachCell(reach.profileViews, 'profile views')}
                            ${reachCell(reach.lakeViews, 'views on your lake pages')}
                            ${reachCell(reach.demand, 'buyer requests on your lakes')}
                        </tr></table>
                        <div style="font-size:0.85rem;color:#2f855a;font-weight:700;margin-top:0.7rem;text-align:center;">${placement}</div>
                    </div>

                    ${r.leads ? `
                    <div style="background:linear-gradient(135deg,#0f2b46,#1d6df2);color:#fff;border-radius:14px;padding:1.5rem;">
                        <div style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;opacity:0.85;">Estimated value of last month's leads</div>
                        <div style="font-size:2.4rem;font-weight:800;letter-spacing:-1px;margin:0.2rem 0;">${money(monthValue)}</div>
                        ${mult ? `<div style="opacity:0.92;font-weight:600;">About ${mult}× your ${money(planPrice)}/mo plan</div>` : ''}
                    </div>
                    <p style="margin:1.1rem 0 0.3rem;font-size:1.05rem;"><b>${r.leads}</b> lead${r.leads === 1 ? '' : 's'}${r.showings ? ` · <b>${r.showings}</b> showing request${r.showings === 1 ? '' : 's'}` : ''} routed to you.</p>
                    <div style="border:1px solid #e6eaf0;border-radius:12px;padding:0.9rem 1.1rem;margin:0.9rem 0 0.3rem;background:#f7faff;">
                        <div style="font-size:0.95rem;color:#1a202c;">What a 35% referral would have cost you: <b style="color:#1d6df2;">${money(r.referral_saved)}</b></div>
                        <div style="font-size:0.78rem;color:#718096;margin-top:0.25rem;">Every deal you close through the portal is one we take no cut on. On MN Lake Homes you keep 100%.</div>
                    </div>` : `
                    <p style="font-size:1rem;color:#2d3748;margin:0.4rem 0 0.6rem;">No leads were routed to you last month — but the demand above is real. Responding fast and keeping your profile complete is how you win the next one.</p>`}

                    <p style="text-align:center;margin:1.3rem 0 0.5rem;">
                        <a href="${SITE_URL}/pages/agent/dashboard.html" style="background:#1d6df2;color:#fff;text-decoration:none;font-weight:700;padding:0.7rem 1.5rem;border-radius:10px;display:inline-block;">Open my dashboard →</a>
                    </p>
                    <p style="font-size:0.72rem;color:#a0aec0;text-align:center;margin-top:1.2rem;">Lead-value estimate assumes ${money(AVG_SALE)} avg sale × ${COMMISSION}% commission × ${Math.round(CLOSE_RATE * 100)}% close rate. Actual results vary.</p>
                </div>`;
            const subject = r.leads
                ? `Your ${label} report — ${money(monthValue)} in lead value`
                : `Your ${label} report — ${reach.profileViews + reach.lakeViews} views on your lakes`;
            emailService.sendEmail({ to: r.email, subject, html, category: 'marketing' });
            sent++;
        }
        console.log(`[agent-roi-email] sent ${sent} monthly performance report(s) for ${label}`);
    } catch (e) { console.warn('[agent-roi-email] failed:', e.message); }
}

module.exports = { runMonthlyRoiEmails };
