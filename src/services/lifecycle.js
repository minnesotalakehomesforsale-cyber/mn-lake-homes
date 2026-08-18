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

// The single writer. Reads current state, writes only on a real change, logs an
// event row. No sweep/controller/webhook should ever UPDATE the column directly.
async function setLifecycleState(agentId, next, reason, source) {
    if (!agentId || !STATES.includes(next)) return { changed: false };
    try {
        const cur = await pool.query(`SELECT lifecycle_state FROM agents WHERE id = $1`, [agentId]);
        if (!cur.rowCount) return { changed: false };
        const from = cur.rows[0].lifecycle_state || null;
        if (from === next) return { changed: false, from, to: next };
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
// spec's priority order. past_due -> at_risk is omitted (agents has no
// subscription_status; at_risk gets set live by dunning/churn later).
function deriveState(a) {
    const code = a.code || 'free';
    if (code !== 'free') return 'paying';                                  // 1. on a paid tier
    if (a.stripe_subscription_id) return 'churned';                        // 3. had a sub, now free
    if (a.is_published) return 'free_live';                                // 4. live on free
    if (a.profile_status === 'draft'
        && a.created_at && new Date(a.created_at).getTime() < Date.now() - 21 * 86400000)
        return 'dormant_draft';                                            // 5. draft >21d
    return 'draft';                                                        // 6. everything else
}

// One-time backfill so every existing row has exactly one correct state, each
// logged with source='backfill' so it's distinguishable from real transitions.
async function backfillLifecycleStates() {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS seed_flags (key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
        const done = await pool.query(`SELECT 1 FROM seed_flags WHERE key = 'lifecycle_backfill_v1'`);
        if (done.rowCount) return { skipped: true };

        const { rows } = await pool.query(`
            SELECT a.id, COALESCE(m.code, 'free') AS code,
                   a.stripe_subscription_id, a.is_published, a.profile_status, a.created_at
              FROM agents a LEFT JOIN memberships m ON m.id = a.membership_id`);

        const counts = {};
        for (const a of rows) {
            const state = deriveState(a);
            await pool.query(
                `UPDATE agents SET lifecycle_state = $2,
                        lifecycle_state_since = COALESCE(lifecycle_state_since, NOW()),
                        lifecycle_state_reason = 'initial backfill'
                  WHERE id = $1`, [a.id, state]);
            await pool.query(
                `INSERT INTO agent_lifecycle_events (agent_id, from_state, to_state, reason, source)
                 VALUES ($1, NULL, $2, 'initial backfill', 'backfill')`, [a.id, state]);
            counts[state] = (counts[state] || 0) + 1;
        }
        await pool.query(`INSERT INTO seed_flags (key) VALUES ('lifecycle_backfill_v1') ON CONFLICT DO NOTHING`);
        console.log('[lifecycle] backfill complete:', counts);
        return { backfilled: rows.length, counts };
    } catch (e) {
        console.warn('[lifecycle] backfill skipped:', e.message);
        return { error: e.message };
    }
}

module.exports = { STATES, setLifecycleState, deriveState, backfillLifecycleStates };
