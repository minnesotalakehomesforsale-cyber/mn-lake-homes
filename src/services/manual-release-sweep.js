'use strict';

// T141 — 24h acceptance SLA sweep. A hand-placed held lead that the free-tier
// agent doesn't accept within ACCEPT_SLA_HOURS auto-reclaims to the held queue,
// and the agent's lifetime slot is freed (the offer never landed). The lead is
// never told anything during a pending offer, so a lapse is invisible to them.
//
// Runs on a timer from server boot (see the app.listen block). Idempotent and
// best-effort: safe to run every few minutes.

const pool = require('../database/pool');
const { ACCEPT_SLA_HOURS } = require('./manual-release');
const { sweepCutoff } = require('./sweep-guard');

async function runManualReleaseSweep() {
    // Backlog guard: don't mass-reclaim (and cascade into held-lead notices) a
    // backlog of stale pending offers the moment the sweep is enabled; and never
    // reclaim an offer older than a week in one burst.
    const cutoff = await sweepCutoff('manual-release-sweep', { freshnessHours: 24 * 7, staleAfterHours: 3 });
    let reclaimed = 0;
    try {
        // Pending offers past their acceptance window: hand-placed, not accepted,
        // not already back in the held pool, and older than the SLA.
        const expired = await pool.query(
            `SELECT l.id, l.full_name, l.email, l.phone, l.lead_type, l.target_lake,
                    l.agent_id, l.lead_grade, u.id AS agent_user_id,
                    COALESCE(a.display_name, u.full_name) AS agent_name
               FROM leads l
               LEFT JOIN agents a ON a.id = l.agent_id
               LEFT JOIN users  u ON u.id = a.user_id
              WHERE l.assigned_manually = TRUE
                AND l.accepted_at IS NULL
                AND l.held_no_agent = FALSE
                AND l.agent_id IS NOT NULL
                AND l.deleted_at IS NULL
                AND l.manual_assigned_at < NOW() - ($1 || ' hours')::interval
                AND l.manual_assigned_at >= $2
              ORDER BY l.manual_assigned_at ASC
              LIMIT 200`, [String(ACCEPT_SLA_HOURS), cutoff]);

        for (const lead of expired.rows) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                // Revert to held. Guarded so we never reclaim one that got accepted
                // between the SELECT and here.
                const upd = await client.query(
                    `UPDATE leads
                        SET held_no_agent = TRUE, lead_status = 'held_no_agent',
                            assigned_manually = FALSE, agent_id = NULL, assigned_user_id = NULL,
                            manual_assigned_at = NULL, updated_at = NOW()
                      WHERE id = $1 AND accepted_at IS NULL AND assigned_manually = TRUE`,
                    [lead.id]);
                if (upd.rowCount) {
                    // Free the agent's slot — the offer didn't land.
                    await client.query(
                        `UPDATE agents SET manual_assignment_count = GREATEST(0, manual_assignment_count - 1), updated_at = NOW()
                          WHERE id = $1`, [lead.agent_id]);
                    reclaimed++;
                }
                await client.query('COMMIT');
                if (upd.rowCount) {
                    try {
                        require('./activity-log').logActivity({
                            event_type: 'lead.manual_release_lapsed', event_scope: 'lead', severity: 'notice',
                            actor: { type: 'system', label: 'manual-release-sweep' },
                            target: { type: 'lead', id: lead.id, label: lead.full_name || lead.email },
                            details: { agent_id: lead.agent_id, agent: lead.agent_name, grade: lead.lead_grade, reason: 'not_accepted_in_sla' },
                        });
                    } catch (_) {}
                    // EM-14: reroute to another agent and tell both sides — the
                    // buyer gets the no-blame "matching you with a different agent"
                    // note; the old agent gets the factual "went to another agent".
                    // If nobody else covers the lake, rerouteLead sends the buyer
                    // EM-13 and raises the P2 (so the person is never left waiting,
                    // and the team only sees what the system couldn't resolve).
                    try {
                        await require('./reroute-lead').rerouteLead({
                            leadId: lead.id, notifyOldAgent: true, windowHours: ACCEPT_SLA_HOURS,
                            oldAgentId: lead.agent_id, oldAgentUserId: lead.agent_user_id,
                        });
                    } catch (e) { console.warn('[manual-release-sweep] reroute failed:', e.message); }
                }
            } catch (e) {
                try { await client.query('ROLLBACK'); } catch (_) {}
                console.warn('[manual-release-sweep] one reclaim failed:', e.message);
            } finally {
                client.release();
            }
        }
        if (reclaimed) console.log(`[manual-release-sweep] reclaimed ${reclaimed} lapsed offer(s)`);
    } catch (e) {
        console.warn('[manual-release-sweep]', e.message);
    }
    return { reclaimed };
}

module.exports = { runManualReleaseSweep };
