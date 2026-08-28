'use strict';

// Block E — the ladder sweep. For each published agent it asks the governor
// (EM-17) what to do, then sends/re-sends the rung email (EM-18/19/20) or stops
// the ladder. Every send carries a plus-addressed Reply-To (attribution) and runs
// as class content_ask, so the global frequency cap + suppression list apply
// automatically in sendEmail. Agents with no lake are skipped (never a broken
// [Lake Name]). Daily.

const pool = require('../database/pool');
const email = require('./email');
const { nextLadderAction } = require('./ladder-governor');
const { ladderReplyAddress } = require('./ladder-reply');
const { sweepCutoff } = require('./sweep-guard');

// The rung email + fields, by rung number.
async function sendRung(agent, rung, lake) {
    const replyTo = ladderReplyAddress(agent.id, rung);
    const common = { to: agent.email, first_name: agent.first_name, lake_name: lake.name, replyTo };
    if (rung === 1) return email.sendLadderPhotos(common);
    if (rung === 2) return email.sendLadderQuestion(common);
    if (rung === 4) return email.sendLadderFeatured({ ...common, contributed: agent.ladder_rung === 2 ? 'answer' : 'photos', lake_url: lake.slug ? `${process.env.SITE_URL || 'https://minnesotalakehomesforsale.com'}/lakes/${lake.slug}` : null });
    return { skipped: true };
}

// The agent's lake for the ladder copy: their founder seat first, else a lake
// reachable via their town/geo tags. No lake → skip (excluded, not broken copy).
async function resolveLake(agent) {
    const { rows } = await pool.query(
        `SELECT l.name, l.slug FROM lakes l
          WHERE EXISTS (SELECT 1 FROM agent_lakes al WHERE al.lake_id = l.id AND al.agent_id = $1)
             OR EXISTS (SELECT 1 FROM lake_tags lt JOIN user_tags ut ON ut.tag_id = lt.tag_id
                         WHERE lt.lake_id = l.id AND ut.user_id = $2)
          ORDER BY EXISTS (SELECT 1 FROM agent_lakes al WHERE al.lake_id = l.id AND al.agent_id = $1) DESC, l.name
          LIMIT 1`, [agent.id, agent.user_id]);
    return rows[0] || null;
}

async function runLadderSweep() {
    // Backlog guard: the ladder is keyed off published_at over a 21-day arc, so a
    // freshness floor doesn't fit — but without a watermark, enabling the sweep
    // would drop a rung email on every already-published agent at once (a cold-
    // domain burst). Skip agents published before the sweep was enabled; new
    // agents ladder normally. (No freshnessHours — the watermark alone.)
    const cutoff = await sweepCutoff('ladder-sweep', { staleAfterHours: 36 });
    let agents;
    try {
        ({ rows: agents } = await pool.query(
            `SELECT a.id, a.user_id, u.email, u.first_name,
                    a.ladder_rung, a.ladder_status, a.last_rung_sent_at, a.last_rung_resent,
                    a.last_response_at, a.last_contribution_at, a.published_at
               FROM agents a JOIN users u ON u.id = a.user_id
              WHERE a.is_published = TRUE AND a.profile_status = 'published'
                AND a.deleted_at IS NULL AND a.ladder_status <> 'stopped'
                AND u.account_status = 'active'
                AND a.published_at >= $1
              LIMIT 500`, [cutoff]));
    } catch (e) { console.warn('[ladder] query failed:', e.message); return { sent: 0 }; }

    let sent = 0, stopped = 0;
    for (const a of agents) {
        try {
            const decision = nextLadderAction(a, a.published_at);
            if (decision.action === 'stop') {
                await pool.query(`UPDATE agents SET ladder_status = 'stopped', updated_at = NOW() WHERE id = $1`, [a.id]);
                stopped++;
                continue;
            }
            if (decision.action !== 'send' && decision.action !== 'resend') continue;
            if (!a.email) continue;

            const lake = await resolveLake(a);
            if (!lake) continue;   // no lake → excluded, not sent broken copy

            const res = await sendRung(a, decision.rung, lake);
            // Suppressed/capped by the class rules? Don't advance the ladder — try
            // again next window (the rung stays where it is).
            if (res && (res.suppressed || res.capped || res.blocked)) continue;

            if (decision.action === 'send') {
                await pool.query(
                    `UPDATE agents SET ladder_rung = $2, last_rung_sent_at = NOW(),
                            last_rung_resent = FALSE, ladder_status = 'paused', updated_at = NOW()
                      WHERE id = $1`, [a.id, decision.rung]);
            } else { // resend
                await pool.query(
                    `UPDATE agents SET last_rung_sent_at = NOW(), last_rung_resent = TRUE, updated_at = NOW()
                      WHERE id = $1`, [a.id]);
            }
            sent++;
        } catch (e) { console.warn('[ladder] one agent failed:', e.message); }
    }
    if (sent || stopped) console.log(`[ladder] sent ${sent}, stopped ${stopped}`);
    return { sent, stopped };
}

module.exports = { runLadderSweep };
