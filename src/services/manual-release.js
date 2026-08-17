'use strict';

// T141 — manual release of a held lead to a free-tier agent (Measurement §4.3b).
//
// This is a SALES TOOL, not a service tier. It is admin-only, hand-placed, with
// NO rule engine and NO eligibility scoring — the admin's judgement is the
// logic. The hard invariants below are guardrails, not a router:
//   • grade A or B only — grade C is never eligible
//   • the lead must currently be held (no paying agent on its lake)
//   • the agent must be free-tier (non-paying, not comped)
//   • a lifetime cap of MANUAL_ASSIGNMENT_CAP hand-placements RECEIVED per agent
//
// Lifecycle: admin offers → agent has ACCEPT_SLA_HOURS to accept via a signed
// email link → on accept the lead is theirs and the "your agent will contact
// you" promise fires to the lead; on lapse it auto-reclaims to the held queue.
// The cap counts an offer at placement and frees the slot again if the offer
// lapses unaccepted (see the controller / sweep) — so it bounds leads RECEIVED,
// not offers made.
//
// Pure functions only (no DB, no I/O) so the guardrails are unit-testable — see
// test/manual-release.test.js.

const crypto = require('crypto');

const MANUAL_ASSIGNMENT_CAP = 2;   // lifetime hand-placements an agent may RECEIVE
const ACCEPT_SLA_HOURS      = 24;  // agent's window to accept before auto-reclaim

// Can this held lead be hand-placed with this agent right now? Returns a reason
// code on failure so the caller (and the disabled-control UI) can explain why.
function canManuallyRelease({ leadGrade, held, agentIsFreeTier, agentCount }) {
    if (leadGrade !== 'A' && leadGrade !== 'B') return { ok: false, reason: 'grade_not_eligible' };
    if (!held)                                   return { ok: false, reason: 'not_held' };
    if (!agentIsFreeTier)                        return { ok: false, reason: 'agent_not_free_tier' };
    if (atCap(agentCount))                       return { ok: false, reason: 'agent_at_cap' };
    return { ok: true, reason: null };
}

function atCap(agentCount) { return Number(agentCount) >= MANUAL_ASSIGNMENT_CAP; }

// Signed acceptance token — HMAC over the (lead, agent) pair, same secret family
// as the unsubscribe tokens. The link is the ONLY acceptance surface, so the
// feature never appears in the agent portal.
const secret = () => process.env.JWT_SECRET || '';
function acceptToken(leadId, agentId) {
    return crypto.createHmac('sha256', secret())
        .update(`manual-accept:${leadId}:${agentId}`).digest('hex').slice(0, 40);
}
function verifyAcceptToken(leadId, agentId, token) {
    const expected = acceptToken(leadId, agentId);
    const got = Buffer.from(String(token || ''));
    const exp = Buffer.from(expected);
    return got.length === exp.length && crypto.timingSafeEqual(got, exp);
}

// Has a pending offer passed its acceptance SLA? (manualAssignedAt is the offer
// timestamp; pass `now` in tests.)
function isOfferExpired(manualAssignedAt, now = Date.now()) {
    if (!manualAssignedAt) return false;
    const t = new Date(manualAssignedAt).getTime();
    return Number.isFinite(t) && (now - t) > ACCEPT_SLA_HOURS * 3600 * 1000;
}

module.exports = {
    MANUAL_ASSIGNMENT_CAP, ACCEPT_SLA_HOURS,
    canManuallyRelease, atCap, acceptToken, verifyAcceptToken, isOfferExpired,
};
