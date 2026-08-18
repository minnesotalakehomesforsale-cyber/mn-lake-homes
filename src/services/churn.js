// churn.js — at-risk agent detection + tier-split response.
// Two signals from data we already have:
//   • ghosting  — assigned ≥2 leads in 30 days but acked none (hurting buyers)
//   • dormant   — no login in 14+ days
// A daily sweep responds (throttled to every 14 days) and sends admin a weekly
// digest so churn can be caught BEFORE the cancel.
//
// AL-05: the RESPONSE is split by tier, not by signal. Free agents keep the
// automated nudge email. Paying agents raise an admin task instead — below ~10
// paying agents an automated "we miss you" reads as "you're a row in a database";
// a personal call lands better. Both signals still fire for both tiers.
const pool = require('../database/pool');
const emailService = require('./email');

const SITE_URL = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
const DORMANT_DAYS = 14;

async function findAtRisk() {
    const { rows } = await pool.query(`
        SELECT a.id AS agent_id, a.display_name, a.last_churn_nudge_at,
               u.id AS user_id, u.email, u.last_login_at,
               COALESCE(m.code, 'free') AS plan_code,
               COUNT(l.*) FILTER (WHERE l.assigned_at >= now() - interval '30 days')::int AS assigned_30,
               COUNT(l.*) FILTER (WHERE l.assigned_at >= now() - interval '30 days' AND l.agent_ack_at IS NOT NULL)::int AS acked_30,
               CASE WHEN u.last_login_at IS NULL THEN 999
                    ELSE EXTRACT(DAY FROM now() - u.last_login_at)::int END AS days_since_login
          FROM agents a
          JOIN users u ON u.id = a.user_id AND u.account_status = 'active'
          LEFT JOIN memberships m ON m.id = a.membership_id
          LEFT JOIN leads l ON l.agent_id = a.id AND l.deleted_at IS NULL
         WHERE a.profile_status = 'published' AND a.is_published = TRUE
         GROUP BY a.id, u.id, m.code`);
    const out = [];
    for (const r of rows) {
        const ghosting = r.assigned_30 >= 2 && r.acked_30 === 0;
        const dormant = r.days_since_login >= DORMANT_DAYS;
        if (!ghosting && !dormant) continue;
        const reasons = [];
        if (ghosting) reasons.push(`${r.assigned_30} leads assigned, none worked`);
        if (dormant) reasons.push(r.days_since_login >= 999 ? 'never logged in' : `no login in ${r.days_since_login} days`);
        // Paying = any non-free membership tier (matches agent.controller isPaid).
        const paying = !!r.plan_code && r.plan_code !== 'free';
        out.push({ ...r, ghosting, dormant, paying, reason: reasons.join('; ') });
    }
    return out;
}

async function runChurnSweep() {
    if (process.env.CHURN_SWEEP_ENABLED === 'false') return { at_risk: 0, nudged: 0 };
    try {
        const atRisk = await findAtRisk();
        let nudged = 0, tasked = 0;
        for (const a of atRisk) {
            // Respond at most once every 14 days per agent (same throttle for the
            // email and the task, so paying agents don't generate a daily task).
            const due = !a.last_churn_nudge_at || (Date.now() - new Date(a.last_churn_nudge_at).getTime()) > 14 * 86400000;
            if (!due) continue;

            if (a.paying) {
                // AL-05: paying agent → raise a task for the owner, send NOTHING.
                const raised = await raisePayingAtRiskTask(a);
                if (raised) { await stampNudge(a.agent_id); tasked++; }
            } else if (a.email) {
                // Free agent → keep the automated nudge email.
                const first = (a.display_name || '').split(' ')[0] || 'there';
                const body = a.ghosting
                    ? `You have leads waiting in your MN Lake Homes inbox that haven't been worked yet. Buyers move fast — leads left unanswered get reassigned to another agent. Jump in and follow up so you don't lose them.`
                    : `We haven't seen you in a while. New lake buyers are coming through every week — log in to catch any leads waiting for you.`;
                emailService.sendEmail({
                    category: 'marketing',
                    to: a.email,
                    subject: a.ghosting ? 'You have unworked leads waiting' : 'Your MN Lake Homes leads are waiting',
                    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a202c;">
                        <h2 style="margin:0 0 0.6rem;">Hi ${escapeHtml(first)},</h2>
                        <p style="color:#4a5568;line-height:1.6;">${body}</p>
                        <p style="text-align:center;margin:1.3rem 0;"><a href="${SITE_URL}/pages/agent/dashboard.html" style="background:#1d6df2;color:#fff;text-decoration:none;font-weight:700;padding:0.8rem 1.5rem;border-radius:10px;display:inline-block;">Open my dashboard →</a></p>
                    </div>`,
                });
                await stampNudge(a.agent_id);
                nudged++;
            }
        }
        // Weekly admin digest (throttled via app_config marker).
        if (atRisk.length) await maybeAdminDigest(atRisk);
        if (atRisk.length) console.log(`[churn] ${atRisk.length} at-risk agent(s), nudged ${nudged} free, tasked ${tasked} paying`);
        return { at_risk: atRisk.length, nudged, tasked };
    } catch (e) { console.warn('[churn] sweep failed:', e.message); return { at_risk: 0, nudged: 0, tasked: 0, error: e.message }; }
}

async function stampNudge(agentId) {
    await pool.query(`UPDATE agents SET last_churn_nudge_at = NOW() WHERE id = $1`, [agentId]).catch(() => {});
}

// AL-05: a paying at-risk agent gets a personal-touch task for the owner instead
// of an automated email. Idempotent — skips if an open churn task for this agent
// already exists (deduped on a stable [agent:<id>] token in details), on top of
// the 14-day last_churn_nudge_at throttle in the caller. Returns true if raised.
async function raisePayingAtRiskTask(a) {
    try {
        const cat = 'churn_paying';
        const token = `[agent:${a.agent_id}]`;
        const open = await pool.query(
            `SELECT 1 FROM admin_tasks WHERE category = $1 AND is_completed = FALSE AND details LIKE $2 LIMIT 1`,
            [cat, `%${token}%`]);
        if (open.rowCount) return false;
        const label = a.ghosting ? 'ghosting leads' : 'gone quiet';
        await pool.query(
            `INSERT INTO admin_tasks (note, details, priority, category)
             VALUES ($1, $2, 'high', $3)`,
            [`Paying agent at risk — ${a.display_name || 'agent'} (${label})`,
             `${a.reason}. Paying tier: ${a.plan_code}. Call them personally — do NOT send an automated email.` +
             `${a.ghosting ? ' Unworked leads are hurting buyers; reassign the lead if they stay silent.' : ''}` +
             ` Contact: ${a.email || 'no email on file'}. ${token}`,
             cat]);
        return true;
    } catch (e) { console.warn('[churn] raise task failed:', e.message); return false; }
}

async function maybeAdminDigest(atRisk) {
    try {
        const weekKey = new Date().toISOString().slice(0, 10);   // send at most ~1/day of this exact list; throttle 7d below
        const existing = await pool.query(`SELECT value FROM app_config WHERE key = 'churn_digest_at'`);
        if (existing.rowCount) {
            const last = typeof existing.rows[0].value === 'string' ? JSON.parse(existing.rows[0].value) : existing.rows[0].value;
            if (last && (Date.now() - new Date(last).getTime()) < 7 * 86400000) return;   // sent within a week
        }
        await pool.query(
            `INSERT INTO app_config (key, value, description) VALUES ('churn_digest_at', to_jsonb($1::text), 'Last churn digest sent')
             ON CONFLICT (key) DO UPDATE SET value = to_jsonb($1::text)`, [new Date().toISOString()]);
        const rowsHtml = atRisk.map(a => `<tr><td style="padding:4px 10px;">${escapeHtml(a.display_name || '—')}</td><td style="padding:4px 10px;color:#718096;">${escapeHtml(a.reason)}</td></tr>`).join('');
        emailService.sendEmail({
            to: process.env.ADMIN_EMAIL || process.env.LEAD_NOTIFY_EMAIL || 'hburnside99@gmail.com',
            subject: `${atRisk.length} agent(s) at risk of churning`,
            html: `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;">
                <h2>Agents at risk (${atRisk.length})</h2>
                <p style="color:#718096;">Ghosting leads or dormant. Consider a personal check-in.</p>
                <table style="border-collapse:collapse;width:100%;"><tbody>${rowsHtml}</tbody></table></div>`,
        });
    } catch (e) { console.warn('[churn] admin digest failed:', e.message); }
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

module.exports = { findAtRisk, runChurnSweep };
