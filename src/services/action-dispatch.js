'use strict';

// Block D — the action registry behind the tokenised email links. Each Block D
// email registers its button handlers here; the /a/:token route calls describe()
// to render the confirm page (GET) and perform() to run the action (POST).
//
// A handler is { describe(claim) → {title, body, confirmLabel}, perform(claim) → {message} }
// where claim = { action, lead_id, agent_id, meta }. Register from the feature
// modules so this file stays a thin dispatcher.

const pool = require('../database/pool');

const HANDLERS = {};
function register(action, handler) { HANDLERS[action] = handler; }

async function describe(claim) {
    const h = HANDLERS[claim.action];
    if (!h) return { title: 'This link', body: 'This action is no longer available.', confirmLabel: null };
    return h.describe(claim);
}
async function perform(claim) {
    const h = HANDLERS[claim.action];
    if (!h) return { message: 'This action is no longer available.' };
    return h.perform(claim);
}

// ── mark_contacted (EM-15) ───────────────────────────────────────────────────
// The agent confirms they reached the buyer. Stamps first_contact_at (which the
// nudge sweep reads to stop reminding) and stops here — idempotent.
register('mark_contacted', {
    describe: async () => ({
        title: 'Mark this lead as contacted?',
        body: "This tells the system you've reached out, and stops the reminder emails for this lead.",
        confirmLabel: 'Yes, I contacted them',
    }),
    perform: async (claim) => {
        await pool.query(
            `UPDATE leads
                SET first_contact_at = COALESCE(first_contact_at, NOW()),
                    lead_status = CASE WHEN lead_status IN ('received','routed','contacted') OR lead_status IS NULL THEN 'contacted' ELSE lead_status END,
                    updated_at = NOW()
              WHERE id = $1`, [claim.lead_id]);
        return { message: "Thanks — marked as contacted. The reminders for this lead will stop." };
    },
});

module.exports = { register, describe, perform, _handlers: HANDLERS };
