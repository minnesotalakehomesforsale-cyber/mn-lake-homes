'use strict';

// lifecycle.js — AL-03. One authoritative lifecycle_state per agent, written by
// exactly ONE function so no two code paths can disagree. Every transition is
// logged to agent_lifecycle_events (append-only) with a reason + source.
//
// THIS SLICE IS DARK: the column is populated (writer + backfill), but no sweep
// filters on it yet. Flipping each sweep to `WHERE lifecycle_state = ANY(...)`,
// cancelling pending queue rows on transition, and the HubSpot mirror are the
// next slice — done only after this backfill is verified in prod, so a bad
// transition can't silently silence or double-email the roster.
//
// Paying signal (owner-approved): membership code != 'free'. `agents` has no
// subscription_status column, and this matches agent.controller's isPaid.

const pool = require('../database/pool');

const STATES = ['lead', 'draft', 'dormant_draft', 'free_live', 'paying', 'at_risk', 'churned'];

// The documented transition map (AL-03 spec, doc 02). Anything outside it is
// almost certainly a caller bug — e.g. paying -> draft would drop a paying agent
// into the abandoned-signup sequence once sweeps read the column. While this
// slice is dark we only WARN loudly; slice 2 will refuse the email-causing ones.
// Keyed from-state -> allowed to-states. A null from (first write/backfill) is
// always allowed.
const ALLOWED = {
    lead:          ['draft', 'paying'],
    draft:         ['free_live', 'dormant_draft', 'paying'],
    dormant_draft: ['draft'],
    free_live:     ['paying'],
    paying:        ['at_risk', 'churned'],
    at_risk:       ['paying', 'free_live', 'churned'],
    churned:       ['paying', 'free_live'],
};

// The single writer. Reads current state, writes only on a real change, logs an
// event row. No sweep/controller/webhook should ever UPDATE the column directly.
async function setLifecycleState(agentId, next, reason, source) {
    if (!agentId || !STATES.includes(next)) return { changed: false };
    try {
        const cur = await pool.query(`SELECT lifecycle_state FROM agents WHERE id = $1`, [agentId]);
        if (!cur.rowCount) return { changed: false };
        const from = cur.rows[0].lifecycle_state || null;
        if (from === next) return { changed: false, from, to: next };
        // Loud warning on any undocumented transition (backfill/first-write has
        // from=null and is exempt). This is the tripwire for a mis-wired caller.
        if (from && ALLOWED[from] && !ALLOWED[from].includes(next)) {
            console.warn(`[lifecycle] ⚠️ undocumented transition ${from} -> ${next} `
                + `(agent ${agentId}, source=${source || 'system'}, reason=${reason || '—'})`);
        }
        await pool.query(
            `UPDATE agents SET lifecycle_state = $2, lifecycle_state_since = NOW(), lifecycle_state_reason = $3, updated_at = NOW()
              WHERE id = $1`,
            [agentId, next, reason || null]);
        await pool.query(
            `INSERT INTO agent_lifecycle_events (agent_id, from_state, to_state, reason, source)
             VALUES ($1, $2, $3, $4, $5)`,
            [agentId, from, next, reason || null, source || 'system']);
        return { changed: true, from, to: next };
    } catch (e) {
        console.warn('[lifecycle] setLifecycleState failed:', e.message);
        return { changed: false, error: e.message };
    }
}

// Derive the correct state for an existing agent row — first match wins, in the
// spec's priority order. Fields:
//   paid_membership_code — what Stripe actually bills (NULL once downgraded). This
//     is the paying signal, NOT membership_id (the displayed tier, which
//     tier_comped lets disagree — a comped agent has a paid display tier but no
//     charge, so keying off the display tier would tag them 'paying' AND anchor a
//     never-arriving renewal email).
//   tier_comped — treated as paying (that's the point of comping) for experience,
//     but it is NOT the billing gate. Billing/renewal-anchored logic (dunning, the
//     day-21 pre-renewal proof, the referral-counter "what you pay" framing) must
//     gate on `paid_membership_code IS NOT NULL` — "does this person get charged?"
//     — NOT on `NOT tier_comped`. An agent comped UP from a paid tier has
//     tier_comped=true AND a live subscription that can fail; excluding them by
//     tier_comped would silently skip dunning and let their card lapse. Use
//     tier_comped ONLY to vary messaging (don't show "what you pay" to a comp).
//   has_paid — a real payment row exists (status='paid'). Gates 'churned' so an
//     abandoned checkout or a sub cancelled before its first invoice is NOT sent
//     the win-back "here's what's changed since you left".
// past_due -> at_risk is omitted here (no subscription_status column); at_risk is
// set live by dunning/churn later.
function deriveState(a) {
    if (a.paid_membership_code || a.tier_comped) return 'paying';          // 1. billed, or comped
    if (a.has_paid) return 'churned';                                      // 2. paid before, now free
    if (a.is_published) return 'free_live';                               // 3. live on free
    if (a.profile_status === 'draft'
        && a.created_at && new Date(a.created_at).getTime() < Date.now() - 21 * 86400000)
        return 'dormant_draft';                                            // 4. draft >21d
    return 'draft';                                                        // 5. everything else
}

// One-time backfill so every existing row has exactly one correct state, each
// logged with source='backfill' so it's distinguishable from real transitions.
async function backfillLifecycleStates() {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS seed_flags (key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
        // v2 corrects v1's derivation (paid_membership_code not display tier;
        // comped=paying; churned gated on a real payment; soft-deleted excluded).
        const done = await pool.query(`SELECT 1 FROM seed_flags WHERE key = 'lifecycle_backfill_v2'`);
        if (done.rowCount) return { skipped: true };

        const { rows } = await pool.query(`
            SELECT a.id, a.lifecycle_state AS current,
                   a.paid_membership_code, a.tier_comped,
                   a.is_published, a.profile_status, a.created_at,
                   EXISTS (SELECT 1 FROM payments p
                            WHERE p.user_id = a.user_id AND p.status = 'paid') AS has_paid
              FROM agents a
             WHERE a.deleted_at IS NULL`);

        const counts = {};
        for (const a of rows) {
            const state = deriveState(a);
            counts[state] = (counts[state] || 0) + 1;
            if (a.current === state) continue;   // already correct — no redundant write/event
            await pool.query(
                `UPDATE agents SET lifecycle_state = $2,
                        lifecycle_state_since = COALESCE(lifecycle_state_since, NOW()),
                        lifecycle_state_reason = 'backfill v2'
                  WHERE id = $1`, [a.id, state]);
            await pool.query(
                `INSERT INTO agent_lifecycle_events (agent_id, from_state, to_state, reason, source)
                 VALUES ($1, $2, $3, 'backfill v2 correction', 'backfill')`, [a.id, a.current || null, state]);
        }
        await pool.query(`INSERT INTO seed_flags (key) VALUES ('lifecycle_backfill_v2') ON CONFLICT DO NOTHING`);
        console.log('[lifecycle] backfill v2 complete (non-deleted agents):', counts);
        return { backfilled: rows.length, counts };
    } catch (e) {
        console.warn('[lifecycle] backfill skipped:', e.message);
        return { error: e.message };
    }
}

module.exports = { STATES, setLifecycleState, deriveState, backfillLifecycleStates };
