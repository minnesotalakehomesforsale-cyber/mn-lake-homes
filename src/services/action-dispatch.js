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

// ── pass_back (EM-15) ────────────────────────────────────────────────────────
// The agent hands the lead back. Reroute immediately to another eligible agent
// and notify the buyer — no human in the path unless nobody else covers the lake.
register('pass_back', {
    describe: async () => ({
        title: 'Pass this lead back?',
        body: "We'll reroute it to another agent right away and let the buyer know. No hard feelings — it just goes back in the pool.",
        confirmLabel: 'Yes, pass it back',
    }),
    perform: async (claim) => {
        const r = await require('./reroute-lead').rerouteLead({ leadId: claim.lead_id });
        return {
            message: r.rerouted
                ? "Done — rerouted to another agent, and the buyer has been notified. Thanks for the fast, honest answer."
                : "Passed back. There's no other agent on this lake yet, so we've let the buyer know and flagged it for the team.",
        };
    },
});

// ── 72h buyer feedback (EM-16) ───────────────────────────────────────────────
// Three one-click answers. First answer wins (claimed on buyer_feedback IS NULL),
// so the sibling tokens no-op if clicked after.
async function claimFeedback(leadId, value) {
    const r = await pool.query(
        `UPDATE leads SET buyer_feedback = $2, buyer_feedback_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND buyer_feedback IS NULL RETURNING id`, [leadId, value]);
    return r.rowCount > 0;
}

register('feedback_connected', {
    describe: async () => ({ title: "Yes — you've connected?", body: 'Great. This confirms your agent reached out.', confirmLabel: 'Confirm' }),
    perform: async (claim) => {
        const first = await claimFeedback(claim.lead_id, 'connected');
        if (!first) return { message: "Thanks — we've already recorded your answer." };
        // "Connected" implies contact happened — log a response time if none.
        try { await pool.query(`UPDATE leads SET first_contact_at = COALESCE(first_contact_at, NOW()) WHERE id = $1`, [claim.lead_id]); } catch (_) {}
        return { message: "Thanks — glad you two connected. That's exactly what we wanted to hear." };
    },
});

register('feedback_not_yet', {
    describe: async () => ({ title: 'No contact yet?', body: "Sorry about that — confirm and I'll find you someone else today.", confirmLabel: 'Find me someone else' }),
    perform: async (claim) => {
        const first = await claimFeedback(claim.lead_id, 'not_yet');
        if (!first) return { message: "Thanks — we've already recorded your answer." };
        // Strike the agent ONLY when the buyer's "not yet" agrees with a second
        // signal — no contact was ever logged. A buyer clicking "not yet" is
        // self-report and they misremember; two signals agreeing keeps us from
        // quietly down-weighting a real agent's leads on one unverified click.
        // (The reroute below still fires either way — the buyer never waits on our
        // bookkeeping.)
        if (claim.agent_id) {
            try { await pool.query(`UPDATE agents SET response_strikes = response_strikes + 1 WHERE id = $1 AND EXISTS (SELECT 1 FROM leads WHERE id = $2 AND first_contact_at IS NULL)`, [claim.agent_id, claim.lead_id]); } catch (_) {}
        }
        try { require('./incidents').raise({ key: `buyer_not_yet:${claim.lead_id}`, severity: 'P2', title: 'Buyer says the agent never reached out', detail: '72h check-in came back "not yet" — rerouting to another agent.', adminLink: '/pages/admin/leads.html' }); } catch (_) {}
        // Offer an alternate immediately — the person shouldn't have to chase.
        let rr = {};
        try { rr = await require('./reroute-lead').rerouteLead({ leadId: claim.lead_id }); } catch (_) {}
        return { message: rr.rerouted
            ? "Thank you — I've matched you with a different agent and you'll hear from them shortly."
            : "Thank you — I'm on it personally and will find you someone. Sorry you had to wait." };
    },
});

register('feedback_paused', {
    describe: async () => ({ title: 'Paused your search?', body: "No problem — confirm and I'll stop the emails about this.", confirmLabel: 'Confirm' }),
    perform: async (claim) => {
        const first = await claimFeedback(claim.lead_id, 'paused');
        if (!first) return { message: "Thanks — we've already recorded your answer." };
        return { message: "No problem at all — I'll pause things on our end. Reach out whenever you're ready and we'll pick right back up." };
    },
});

module.exports = { register, describe, perform, _handlers: HANDLERS };
