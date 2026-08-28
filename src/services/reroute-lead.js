'use strict';

// Shared reroute — the ACTION behind "pass this one back" (EM-15), "not yet"
// (EM-16) and offer-expiry (EM-14). Re-routes the lead to another eligible agent,
// excluding the current one. If someone else covers the lake: reassign, tell the
// buyer (EM-14 buyer copy), send the fresh intro to the new agent, and — for the
// expiry case only — tell the old agent. If nobody else covers it: the buyer gets
// EM-13 and a P2 is raised. A person only ever sees what the system can't resolve.

const pool = require('../database/pool');
const email = require('./email');

async function rerouteLead({ leadId, notifyOldAgent = false, windowHours = null, oldAgentId = null, oldAgentUserId = null }) {
    const { rows } = await pool.query(
        `SELECT id, email, first_name, target_lake, lake_id, agent_id, assigned_user_id, timeline_text
           FROM leads WHERE id = $1`, [leadId]);
    const lead = rows[0];
    if (!lead) return { rerouted: false, reason: 'not_found' };
    // The old agent may already be cleared off the lead (e.g. the expiry sweep
    // reclaims first), so callers can pass it in explicitly for exclusion + notice.
    const priorAgentId = oldAgentId || lead.agent_id;
    const priorUserId = oldAgentUserId || lead.assigned_user_id;

    const { routeLead } = require('./lead-router');
    const pick = await routeLead({ lakeId: lead.lake_id, excludeUserIds: [priorUserId].filter(Boolean) });

    // EM-14 (agent): only on the expiry path, factual, no scolding.
    if (notifyOldAgent && priorAgentId) {
        try {
            const oa = await pool.query(`SELECT u.email, u.first_name FROM agents a JOIN users u ON u.id = a.user_id WHERE a.id = $1`, [priorAgentId]);
            if (oa.rows[0]?.email) email.sendRerouteAgent({ to: oa.rows[0].email, agentFirstName: oa.rows[0].first_name, buyer_first: lead.first_name, lake_name: lead.target_lake, timeline: lead.timeline_text, windowHours });
        } catch (_) {}
    }

    if (!pick) {
        // No fallback → the buyer gets the honest EM-13, and it's a P2.
        try { email.sendNoAgentYet({ to: lead.email, first_name: lead.first_name, lake_name: lead.target_lake }); } catch (_) {}
        try {
            require('./incidents').raise({
                key: `lead_no_agent:${lead.lake_id || lead.target_lake || 'unknown'}`, severity: 'P2', append: true,
                title: `Unrouted leads — no paying agent on ${lead.target_lake || 'a lake'}`,
                detail: `${lead.first_name || lead.email || 'A buyer'} — reroute found no other eligible agent`,
                adminLink: '/pages/admin/leads.html',
            });
        } catch (_) {}
        await pool.query(
            `UPDATE leads SET agent_id = NULL, assigned_user_id = NULL, held_no_agent = TRUE,
                    held_at = COALESCE(held_at, NOW()), lead_status = 'held_no_agent',
                    first_contact_at = NULL, nudge_1h_at = NULL, nudge_24h_at = NULL, updated_at = NOW()
              WHERE id = $1`, [leadId]);
        return { rerouted: false, reason: 'no_fallback' };
    }

    // Reassign; reset the contact clock + intro dedupe so the new agent gets
    // nudged if they go quiet and the buyer gets a fresh intro to them.
    await pool.query(
        `UPDATE leads SET agent_id = $1, assigned_user_id = $2, lead_status = 'contacted', pipeline_status = 'routed',
                held_no_agent = FALSE, routed_at = NOW(), first_contact_at = NULL, nudge_1h_at = NULL, nudge_24h_at = NULL,
                match_intro_at = NULL, updated_at = NOW()
          WHERE id = $3`, [pick.agentId, pick.userId, leadId]);

    try { email.sendRerouteBuyer({ to: lead.email, first_name: lead.first_name, lake_name: lead.target_lake }); } catch (_) {}
    try {
        email.sendMatchedAgentNotification({
            to: pick.email, agentFirstName: (pick.fullName || '').split(' ')[0] || 'there',
            lead: { id: leadId, name: lead.first_name, email: lead.email, type: null },
            distanceMiles: pick.distanceMiles, matchedAreas: [pick.lakeName || pick.tagName].filter(Boolean),
        });
    } catch (_) {}
    try { await require('./match-intro').sendMatchIntro({ leadId, agentId: pick.agentId }); } catch (_) {}
    return { rerouted: true, agentId: pick.agentId };
}

module.exports = { rerouteLead };
