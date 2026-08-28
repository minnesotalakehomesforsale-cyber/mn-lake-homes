'use strict';

// EM-13 follow-up rule: a held (still-unrouted) lead must never go quiet. Seven
// days after the last "no agent yet" note, if we still haven't routed them, send
// a short check-in — capped at two follow-ups total. (When an agent activates on
// the lake, releaseHeldLeads routes the lead and EM-24 sends the real match
// email, so this sweep only handles the "still working on it" case.)

const pool = require('../database/pool');
const email = require('./email');
const { sweepCutoff } = require('./sweep-guard');

async function runNoAgentFollowup() {
    // Backlog guard: don't follow up on a lead held longer than ~2 weeks (a "still
    // looking" note that stale reads worse than silence), and never replay a
    // backlog of held leads the moment the sweep is enabled.
    const cutoff = await sweepCutoff('no-agent-followup', { freshnessHours: 24 * 14, staleAfterHours: 36 });
    let rows;
    try {
        ({ rows } = await pool.query(
            `SELECT id, email, first_name, target_lake
               FROM leads
              WHERE held_no_agent = TRUE AND deleted_at IS NULL AND agent_id IS NULL
                AND (buyer_feedback IS NULL OR buyer_feedback <> 'paused')
                AND no_agent_email_count >= 1 AND no_agent_email_count < 2
                AND no_agent_last_at < NOW() - INTERVAL '3 days'
                AND created_at >= $1
              LIMIT 100`, [cutoff]));
    } catch (e) { console.warn('[no-agent-followup] query failed:', e.message); return { sent: 0 }; }

    let sent = 0;
    for (const l of rows) {
        if (!l.email) continue;
        let lakeSlug = null, nearby = [];
        try {
            const s = await pool.query(`SELECT id, slug FROM lakes WHERE name = $1 LIMIT 1`, [l.target_lake]);
            if (s.rows[0]) {
                lakeSlug = s.rows[0].slug;
                const nl = await pool.query(
                    `SELECT DISTINCT l.name FROM lakes l JOIN lake_tags lt ON lt.lake_id = l.id
                      WHERE lt.tag_id IN (SELECT tag_id FROM lake_tags WHERE lake_id = $1) AND l.id <> $1
                      ORDER BY l.name LIMIT 2`, [s.rows[0].id]);
                nearby = nl.rows.map(r => r.name);
            }
        } catch (_) {}
        try {
            // Claim first so a double-run can't double-send.
            const claim = await pool.query(
                `UPDATE leads SET no_agent_email_count = no_agent_email_count + 1, no_agent_last_at = NOW()
                  WHERE id = $1 AND no_agent_email_count < 2 AND no_agent_last_at < NOW() - INTERVAL '3 days'
                  RETURNING id`, [l.id]);
            if (!claim.rowCount) continue;
            email.sendNoAgentYet({ to: l.email, first_name: l.first_name, lake_name: l.target_lake, lake_slug: lakeSlug, nearby_lakes: nearby, variant: 'followup' });
            sent++;
        } catch (e) { console.warn('[no-agent-followup] one failed:', e.message); }
    }
    if (sent) console.log(`[no-agent-followup] sent ${sent} follow-up(s)`);
    return { sent };
}

module.exports = { runNoAgentFollowup };
