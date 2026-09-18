'use strict';

// Lead-offer ledger — Feature B foundation (the timed round-robin relay).
//
// One row per time a lead is OFFERED to an agent. It is the audit trail the
// build asks for: who was offered what, when, how long they got, and what they
// lost. The relay logic (timed windows + loop) writes here; the admin history
// view reads here. This module is deliberately decision-independent — it works
// the same under reclaim Option X or Y and any per-tier window durations, so it
// can't become rework while those calls are still open.
//
// Invariant: at most ONE open ('offered') row per lead at a time — the active
// alert. The DB enforces it (partial unique index idx_lead_offers_open), so a
// caller must close the current open offer before opening the next.

const pool = require('../database/pool');

// Open a new offer to an agent. Close any current open offer first (see invariant).
// windowSecs = how long this agent has to claim (from their plan tier); null = untimed.
// Returns the new offer id.
async function recordOffer({ leadId, agentId, userId = null, tier = null, cycleNo = 1, windowSecs = null, source = 'relay' }) {
    const expiresAt = windowSecs ? new Date(Date.now() + windowSecs * 1000).toISOString() : null;
    const { rows } = await pool.query(
        `INSERT INTO lead_offers (lead_id, agent_id, user_id, tier, cycle_no, window_secs, window_expires_at, status, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'offered', $8)
         RETURNING id`,
        [leadId, agentId, userId, tier, cycleNo, windowSecs, expiresAt, source]);
    return rows[0].id;
}

// Close an offer with its outcome. status: 'claimed' | 'expired' | 'superseded'.
// Pass a specific offerId, or omit it to close whatever open offer the lead has.
async function closeOffer({ offerId = null, leadId = null, status, claimed = false }) {
    if (!['claimed', 'expired', 'superseded'].includes(status)) throw new Error(`bad offer status: ${status}`);
    const setClaim = claimed ? ', claimed_at = NOW()' : '';
    if (offerId) {
        const r = await pool.query(`UPDATE lead_offers SET status = $2${setClaim} WHERE id = $1 AND status = 'offered' RETURNING id`, [offerId, status]);
        return r.rowCount;
    }
    const r = await pool.query(`UPDATE lead_offers SET status = $2${setClaim} WHERE lead_id = $1 AND status = 'offered' RETURNING id`, [leadId, status]);
    return r.rowCount;
}

// The currently-open offer for a lead (the active alert), or null.
async function currentOffer(leadId) {
    const { rows } = await pool.query(`SELECT * FROM lead_offers WHERE lead_id = $1 AND status = 'offered' LIMIT 1`, [leadId]);
    return rows[0] || null;
}

// Every agent already offered this lead in the given cycle (so the relay never
// repeats an agent until the cycle restarts).
async function offeredThisCycle(leadId, cycleNo) {
    const { rows } = await pool.query(
        `SELECT DISTINCT agent_id FROM lead_offers WHERE lead_id = $1 AND cycle_no = $2 AND agent_id IS NOT NULL`, [leadId, cycleNo]);
    return rows.map(r => r.agent_id);
}

// The full chain for one lead, oldest first — the "life of this lead" view.
async function leadChain(leadId) {
    const { rows } = await pool.query(`SELECT * FROM lead_offers WHERE lead_id = $1 ORDER BY offered_at ASC`, [leadId]);
    return rows;
}

// One agent's history: what they were offered, claimed, and lost. newest first.
async function agentHistory(agentId, limit = 200) {
    const { rows } = await pool.query(
        `SELECT * FROM lead_offers WHERE agent_id = $1 ORDER BY offered_at DESC LIMIT $2`, [agentId, limit]);
    return rows;
}

module.exports = { recordOffer, closeOffer, currentOffer, offeredThisCycle, leadChain, agentHistory };
