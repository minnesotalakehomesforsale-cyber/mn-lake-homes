'use strict';

// EM-16 — 72h after routing, ask the buyer one question: did the agent reach
// out? Three tokenised one-click answers. Fires once per lead (claimed on
// feedback_asked_at); skips anyone who already paused their search.

const pool = require('../database/pool');
const email = require('./email');
const tokens = require('./action-tokens');
const { sweepCutoff } = require('./sweep-guard');

async function runFeedbackRequest() {
    // Backlog guard: never ask for "72h" feedback on a lead routed more than 7
    // days ago, and never replay a backlog the moment the sweep is enabled.
    const cutoff = await sweepCutoff('feedback-request', { freshnessHours: 24 * 7, staleAfterHours: 8 });
    let rows;
    try {
        ({ rows } = await pool.query(
            `SELECT l.id, l.email, l.first_name, l.agent_id,
                    COALESCE(a.display_name, u.full_name) AS agent_name
               FROM leads l
               JOIN agents a ON a.id = l.agent_id
               JOIN users u ON u.id = a.user_id
              WHERE l.agent_id IS NOT NULL AND l.deleted_at IS NULL
                AND l.routed_at IS NOT NULL AND l.routed_at < NOW() - INTERVAL '72 hours'
                AND l.routed_at >= $1
                AND l.feedback_asked_at IS NULL
                AND (l.buyer_feedback IS NULL OR l.buyer_feedback <> 'paused')
              LIMIT 200`, [cutoff]));
    } catch (e) { console.warn('[feedback-request] query failed:', e.message); return { sent: 0 }; }

    let sent = 0;
    for (const l of rows) {
        if (!l.email) continue;
        try {
            const claim = await pool.query(`UPDATE leads SET feedback_asked_at = NOW() WHERE id = $1 AND feedback_asked_at IS NULL RETURNING id`, [l.id]);
            if (!claim.rowCount) continue;
            const url = async (action) => tokens.actionUrl(await tokens.createToken({ action, leadId: l.id, agentId: l.agent_id }));
            email.sendDidTheyReachOut({
                to: l.email, first_name: l.first_name, agent_full_name: l.agent_name,
                yesUrl: await url('feedback_connected'),
                notYetUrl: await url('feedback_not_yet'),
                pausedUrl: await url('feedback_paused'),
            });
            sent++;
        } catch (e) { console.warn('[feedback-request] one failed:', e.message); }
    }
    if (sent) console.log(`[feedback-request] sent ${sent} check-in(s)`);
    return { sent };
}

module.exports = { runFeedbackRequest };
