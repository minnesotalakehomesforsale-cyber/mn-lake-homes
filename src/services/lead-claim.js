'use strict';

// Lead claim (Feature B — the "claim it right there" action).
//
// Atomic, first-come-wins. A lead is claimable only while unclaimed
// (accepted_at IS NULL) and offered to THIS agent — today that means the lead is
// assigned to them (assigned_user_id); when the timed round-robin relay (B2)
// lands, the relay keeps assigned_user_id pointed at the currently-offered agent,
// so this same guard is exactly Option X: only the active agent can claim.
//
// Claiming LOCKS the lead (accepted_at) and acks it (agent_ack_at, which stops
// the SLA relay), reveals the full contact info, and closes the open offer in the
// ledger as 'claimed'. Actually calling the buyer is tracked separately
// (first_contact_at + the EM-15 nudges) — claim is the lock, not the call.

const pool = require('../database/pool');

async function claimLead({ leadId, userId }) {
    if (!leadId || !userId) return { claimed: false, reason: 'bad_request' };

    const ag = await pool.query(`SELECT id FROM agents WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`, [userId]);
    if (!ag.rows[0]) return { claimed: false, reason: 'not_an_agent' };
    const agentId = ag.rows[0].id;

    // The claim itself: succeeds for exactly one agent, and only if still open.
    const r = await pool.query(
        `UPDATE leads
            SET accepted_at  = NOW(),
                agent_ack_at = COALESCE(agent_ack_at, NOW()),
                updated_at   = NOW()
          WHERE id = $1 AND deleted_at IS NULL
            AND accepted_at IS NULL
            AND assigned_user_id = $2
          RETURNING id, full_name, first_name, email, phone, target_lake, lead_type,
                    message, property_address, created_at`,
        [leadId, userId]);

    if (!r.rowCount) {
        // Explain why so the portal can show the right message.
        const chk = await pool.query(`SELECT accepted_at, assigned_user_id FROM leads WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [leadId]);
        const row = chk.rows[0];
        if (!row) return { claimed: false, reason: 'not_found' };
        if (row.accepted_at) return { claimed: false, reason: 'already_claimed' };
        return { claimed: false, reason: 'not_yours' };
    }

    // Close the open offer in the audit ledger (no-op if the relay hasn't opened one).
    try { await require('./offer-ledger').closeOffer({ leadId, status: 'claimed', claimed: true }); } catch (_) {}
    return { claimed: true, agentId, lead: r.rows[0] };
}

module.exports = { claimLead };
