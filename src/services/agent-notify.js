/**
 * agent-notify.js — in-app notification centre for the agent portal (#11).
 *
 * A thin, fire-and-forget writer over the agent_notifications table. Keeps the
 * portal feeling alive between leads: "your profile is live", "new lead",
 * "payment issue", "your monthly report is ready", etc. Never throws — a
 * notification failing must never break the action that triggered it.
 */
const pool = require('../database/pool');

const TYPES = ['lead', 'profile', 'billing', 'report', 'view', 'referral', 'system'];

/**
 * notifyAgent(agentId, { type, title, body, link })
 * @param {string} agentId  agents.id
 */
async function notifyAgent(agentId, { type = 'system', title, body = null, link = null } = {}) {
    if (!agentId || !title) return null;
    const t = TYPES.includes(type) ? type : 'system';
    try {
        const { rows } = await pool.query(
            `INSERT INTO agent_notifications (agent_id, type, title, body, link)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [agentId, t, String(title).slice(0, 200), body ? String(body).slice(0, 500) : null, link]
        );
        return rows[0]?.id || null;
    } catch (e) {
        console.warn('[agent-notify]', e.message);
        return null;
    }
}

/** Same, but resolve the agent from a user id (some call sites only have that). */
async function notifyAgentByUserId(userId, payload) {
    if (!userId) return null;
    try {
        const r = await pool.query(`SELECT id FROM agents WHERE user_id = $1 LIMIT 1`, [userId]);
        if (!r.rows[0]) return null;
        return notifyAgent(r.rows[0].id, payload);
    } catch (e) {
        console.warn('[agent-notify.byUser]', e.message);
        return null;
    }
}

/**
 * notifyAgentOfLead — the in-portal companion to the agent's new-lead EMAIL.
 * Drops a 'lead' notification into the portal so a new lead shows up as an alert
 * with unread count, not only in an inbox. `claimable` deep-links to the lead
 * with the claim action open, so the agent can claim it right there.
 *
 * @param {string} agentId  agents.id
 * @param {object} opts  { lead:{id,target_lake,first_name,city,lead_type}, kind, claimable }
 *   kind: 'matched' (auto-route) | 'assigned' (admin) | 'offer' (manual, timed)
 */
async function notifyAgentOfLead(agentId, { lead = {}, kind = 'matched', claimable = true } = {}) {
    if (!agentId || !lead.id) return null;
    const where = lead.target_lake ? ` on ${lead.target_lake}` : (lead.city ? ` in ${lead.city}` : '');
    const title = kind === 'offer' ? `New lead offer${where} — claim it` : `New lead${where}`;
    const bits = [];
    if (lead.first_name) bits.push(lead.first_name);
    if (lead.lead_type) bits.push(String(lead.lead_type).replace(/_/g, ' '));
    const body = kind === 'offer'
        ? `Claim it in your portal before it moves to the next agent.${bits.length ? ' ' + bits.join(' · ') : ''}`
        : (bits.length ? bits.join(' · ') : 'Open it to see the details and reach out.');
    // In-app deep link; the portal reads ?claim=1 to open the claim action inline.
    const link = `/pages/agent/dashboard.html?view=leads&lead=${encodeURIComponent(lead.id)}${claimable ? '&claim=1' : ''}`;
    return notifyAgent(agentId, { type: 'lead', title, body, link });
}

module.exports = { notifyAgent, notifyAgentByUserId, notifyAgentOfLead };
