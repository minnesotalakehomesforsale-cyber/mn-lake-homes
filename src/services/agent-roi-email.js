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
const PLAN_PRICE = { founder: 249, top_agent: 149, premium: 149, mn_lake_specialist: 39, basic: 9 };
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

        const { rows } = await pool.query(`
            SELECT a.id AS agent_id, u.email, u.full_name, m.code AS plan_code,
                   COUNT(l.*)::int AS leads,
                   COUNT(l.*) FILTER (WHERE l.listing_id IS NOT NULL)::int AS showings
              FROM agents a
              JOIN users u ON u.id = a.user_id AND u.account_status = 'active'
         LEFT JOIN memberships m ON m.id = a.membership_id
         LEFT JOIN leads l ON l.agent_id = a.id AND l.deleted_at IS NULL
                          AND l.created_at >= $1 AND l.created_at < $2
             WHERE a.profile_status = 'published'
             GROUP BY a.id, u.email, u.full_name, m.code`,
            [start.toISOString(), end.toISOString()]);

        let sent = 0;
        for (const r of rows) {
            if (!r.email || !r.leads) continue;   // skip agents with no leads that month
            const planPrice = PLAN_PRICE[r.plan_code] ?? 9;
            const perLead = Math.round(AVG_SALE * (COMMISSION / 100) * CLOSE_RATE);
            const monthValue = r.leads * perLead;
            const mult = planPrice ? (monthValue / planPrice).toFixed(1) : null;
            const first = (r.full_name || '').split(' ')[0] || 'there';
            const html = `
                <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;color:#1a202c;">
                    <p style="color:#718096;margin:0 0 0.25rem;">Your ${label} recap</p>
                    <h1 style="margin:0 0 1rem;font-size:1.4rem;">Hi ${first}, here's what your MN Lake Homes plan delivered</h1>
                    <div style="background:linear-gradient(135deg,#0f2b46,#1d6df2);color:#fff;border-radius:14px;padding:1.5rem;">
                        <div style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;opacity:0.85;">Estimated value of last month's leads</div>
                        <div style="font-size:2.4rem;font-weight:800;letter-spacing:-1px;margin:0.2rem 0;">${money(monthValue)}</div>
                        ${mult ? `<div style="opacity:0.92;font-weight:600;">About ${mult}× your ${money(planPrice)}/mo plan</div>` : ''}
                    </div>
                    <p style="margin:1.1rem 0 0.3rem;font-size:1.05rem;"><b>${r.leads}</b> lead${r.leads === 1 ? '' : 's'}${r.showings ? ` · <b>${r.showings}</b> showing request${r.showings === 1 ? '' : 's'}` : ''} routed to you.</p>
                    <p style="color:#718096;font-size:0.9rem;">Responding fast wins deals — leads left unworked get reassigned. Jump into your inbox to follow up.</p>
                    <p style="text-align:center;margin:1.3rem 0 0.5rem;">
                        <a href="${SITE_URL}/pages/agent/dashboard.html" style="background:#1d6df2;color:#fff;text-decoration:none;font-weight:700;padding:0.7rem 1.5rem;border-radius:10px;display:inline-block;">Open my dashboard →</a>
                    </p>
                    <p style="font-size:0.72rem;color:#a0aec0;text-align:center;margin-top:1.2rem;">Estimate assumes ${money(AVG_SALE)} avg sale × ${COMMISSION}% commission × ${Math.round(CLOSE_RATE * 100)}% close rate. Actual results vary.</p>
                </div>`;
            emailService.sendEmail({ to: r.email, subject: `Your ${label} recap — ${money(monthValue)} in lead value`, html, category: 'marketing' });
            sent++;
        }
        console.log(`[agent-roi-email] sent ${sent} monthly recap(s) for ${label}`);
    } catch (e) { console.warn('[agent-roi-email] failed:', e.message); }
}

module.exports = { runMonthlyRoiEmails };
