// win-back.js — post-cancellation email sequence for churned agents.
// enqueueWinBack() drops 3 steps (day 0 / 7 / 30) into win_back_queue; a sweep
// sends each due step with the agent's lifetime stats and stops the moment the
// agent resubscribes.
const pool = require('../database/pool');
const emailService = require('./email');

const SITE_URL = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
const COMMISSION = Number(process.env.AGENT_ROI_COMMISSION_PCT) || 2.5;
const money = n => '$' + Number(n || 0).toLocaleString('en-US');
const DAY = 86400000;

// Called from the Stripe cancellation handler.
async function enqueueWinBack({ userId, agentId, email, name }) {
    if (!email || !agentId) return;
    try {
        // Fresh sequence: drop any pending steps from a prior cancel.
        await pool.query(`DELETE FROM win_back_queue WHERE agent_id = $1 AND sent_at IS NULL`, [agentId]);
        const now = Date.now();
        const steps = [
            { step: 0, at: new Date(now + 60 * 1000) },        // ~immediately
            { step: 1, at: new Date(now + 7 * DAY) },
            { step: 2, at: new Date(now + 30 * DAY) },
        ];
        for (const s of steps) {
            await pool.query(
                `INSERT INTO win_back_queue (user_id, agent_id, email, name, step, send_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId || null, agentId, email, name || null, s.step, s.at.toISOString()]);
        }
    } catch (e) { console.warn('[win-back] enqueue failed:', e.message); }
}

function stepEmail(step, first, stats) {
    const reactivate = `${SITE_URL}/pages/public/pricing.html`;
    const statLine = stats.leads
        ? `While you were with us you received <b>${stats.leads} lead${stats.leads === 1 ? '' : 's'}</b>${stats.wins ? `, closed <b>${stats.wins}</b>` : ''}${stats.volume ? ` and moved <b>${money(stats.volume)}</b> in volume (~${money(stats.gci)} commission)` : ''}.`
        : '';
    const bodies = [
        `We're sorry to see you go. ${statLine} Your lakes are still sending buyers every week — you can reactivate anytime and pick up right where you left off.`,
        `Just checking in — new lake buyers have come through since you left. ${statLine} Your service areas are still open; come back before someone else claims them.`,
        `Last note from us: your spots in your service areas may be reassigned to other agents soon. ${statLine} Reactivate to keep getting matched with buyers on your lakes.`,
    ];
    const subjects = [
        "Here's what MN Lake Homes earned you",
        'New lake buyers came through this week',
        'Your lake territory may get reassigned',
    ];
    return {
        subject: subjects[step] || subjects[0],
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a202c;">
            <h2 style="margin:0 0 0.6rem;">Hi ${first},</h2>
            <p style="color:#4a5568;line-height:1.6;">${bodies[step] || bodies[0]}</p>
            <p style="text-align:center;margin:1.4rem 0;"><a href="${reactivate}" style="background:#1d6df2;color:#fff;text-decoration:none;font-weight:700;padding:0.8rem 1.6rem;border-radius:10px;display:inline-block;">Reactivate my membership →</a></p>
        </div>`,
    };
}

async function runWinBackSweep() {
    if (process.env.WIN_BACK_ENABLED === 'false') return { sent: 0 };
    try {
        const { rows } = await pool.query(
            `SELECT * FROM win_back_queue WHERE sent_at IS NULL AND canceled = FALSE AND send_at <= NOW() ORDER BY send_at ASC LIMIT 100`);
        let sent = 0;
        for (const row of rows) {
            // Skip + cancel the rest if the agent has come back (published again).
            const ag = await pool.query(`SELECT is_published FROM agents WHERE id = $1`, [row.agent_id]);
            if (ag.rows[0]?.is_published) {
                await pool.query(`UPDATE win_back_queue SET canceled = TRUE WHERE agent_id = $1 AND sent_at IS NULL`, [row.agent_id]);
                continue;
            }
            const st = await pool.query(`
                SELECT COUNT(*)::int AS leads,
                       COUNT(*) FILTER (WHERE outcome = 'won')::int AS wins,
                       COALESCE(SUM(outcome_price) FILTER (WHERE outcome = 'won'), 0)::bigint AS volume
                  FROM leads WHERE agent_id = $1 AND deleted_at IS NULL`, [row.agent_id]);
            const s = st.rows[0];
            const stats = { leads: s.leads, wins: s.wins, volume: Number(s.volume), gci: Math.round(Number(s.volume) * (COMMISSION / 100)) };
            const first = (row.name || '').split(' ')[0] || 'there';
            const mail = stepEmail(row.step, first, stats);
            emailService.sendEmail({ to: row.email, subject: mail.subject, html: mail.html });
            await pool.query(`UPDATE win_back_queue SET sent_at = NOW() WHERE id = $1`, [row.id]);
            sent++;
        }
        if (sent) console.log(`[win-back] sent ${sent} step(s)`);
        return { sent };
    } catch (e) { console.warn('[win-back] sweep failed:', e.message); return { sent: 0, error: e.message }; }
}

module.exports = { enqueueWinBack, runWinBackSweep };
