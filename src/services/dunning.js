/**
 * dunning.js — fixed day-0/3/7 failed-payment sequence for agents (A3).
 *
 * On the FIRST failed renewal we enqueue three steps (day 0, 3, 7). A sweep
 * sends the due ones. Day 7 downgrades the agent to the FREE plan but KEEPS
 * their public profile live (never a delete) — the warm listing is what powers
 * win-back. A recovered payment cancels the remaining pending steps.
 *
 * Stripe is the source of truth for payment state; this only reacts to it.
 */
const pool = require('../database/pool');

const STEPS = [0, 3, 7];
const DAY_MS = 86400000;

async function freeMembershipId() {
    try { const r = await pool.query(`SELECT id FROM memberships WHERE code = 'free' LIMIT 1`); return r.rows[0]?.id || null; }
    catch (_) { return null; }
}

/**
 * enqueueDunning — idempotent per subscription. Inserts the 3 steps and fires
 * the day-0 email immediately (so "email 1 within the hour" holds regardless of
 * the sweep cadence). No-op if a sequence is already running for this sub.
 */
async function enqueueDunning({ agentId, userId, email, subscriptionId }) {
    if (!agentId || !subscriptionId) return { skipped: true };
    try {
        const existing = await pool.query(
            `SELECT 1 FROM dunning_queue WHERE subscription_id = $1 AND status IN ('pending','sent') LIMIT 1`,
            [subscriptionId]);
        if (existing.rowCount) return { skipped: true };
        const now = Date.now();
        for (const d of STEPS) {
            await pool.query(
                `INSERT INTO dunning_queue (agent_id, user_id, email, subscription_id, step_day, send_at, status)
                 VALUES ($1, $2, $3, $4, $5, to_timestamp($6::double precision / 1000.0), 'pending')`,
                [agentId, userId || null, email || null, subscriptionId, d, now + d * DAY_MS]);
        }
        // Fire day 0 right away.
        await runDunningSweep().catch(() => {});
        return { enqueued: true };
    } catch (e) { console.warn('[dunning.enqueue]', e.message); return { error: e.message }; }
}

/** Payment recovered / resubscribed → stop the remaining steps. */
async function resolveDunning(subscriptionId) {
    if (!subscriptionId) return;
    try { await pool.query(`UPDATE dunning_queue SET status = 'canceled' WHERE subscription_id = $1 AND status = 'pending'`, [subscriptionId]); }
    catch (e) { console.warn('[dunning.resolve]', e.message); }
}

/**
 * Downgrade the agent on this subscription to the FREE plan, keeping their
 * public profile exactly as it is (we deliberately DON'T touch is_published /
 * profile_status). Comped agents are skipped. Returns the agent row or null.
 */
async function downgradeAgentToFree(subscriptionId) {
    try {
        const freeId = await freeMembershipId();
        const r = await pool.query(
            `UPDATE agents
                SET membership_id = COALESCE($2, membership_id),
                    paid_membership_code = NULL,
                    updated_at = NOW()
              WHERE stripe_subscription_id = $1 AND NOT COALESCE(tier_comped, false)
              RETURNING id, user_id, display_name`,
            [subscriptionId, freeId]);
        return r.rows[0] || null;
    } catch (e) { console.warn('[dunning.downgrade]', e.message); return null; }
}

/**
 * runDunningSweep — send every due, still-pending step. Day 7 also downgrades
 * to free. Safe to run on an interval; only pending rows past send_at are
 * touched, and a recovered payment has already flipped them to 'canceled'.
 */
async function runDunningSweep() {
    let sent = 0, downgraded = 0;
    try {
        const due = await pool.query(
            `SELECT dq.*, a.display_name
               FROM dunning_queue dq JOIN agents a ON a.id = dq.agent_id
              WHERE dq.status = 'pending' AND dq.send_at <= NOW()
              ORDER BY dq.send_at ASC LIMIT 200`);
        if (!due.rows.length) return { sent, downgraded };
        const email = require('./email');
        for (const row of due.rows) {
            try {
                email.sendAgentPaymentFailed({
                    to: row.email,
                    name: row.display_name,
                    attempt: row.step_day === 0 ? 1 : 2,
                    final: row.step_day === 7,
                });
                await pool.query(`UPDATE dunning_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`, [row.id]);
                sent++;
                if (row.step_day === 7) {
                    const dg = await downgradeAgentToFree(row.subscription_id);
                    if (dg) {
                        downgraded++;
                        // AL-03: dunning day-7 downgrade → at_risk becomes free_live.
                        // (Only here, not inside downgradeAgentToFree, which also runs
                        // on cancel where the agent should become churned instead.)
                        await require('./lifecycle').setLifecycleState(dg.id, 'free_live', 'dunning day-7 downgrade', 'dunning').catch(() => {});
                        try {
                            require('./agent-notify').notifyAgent(dg.id, {
                                type: 'billing',
                                title: 'Membership moved to Free',
                                body: 'Your card kept declining, so your plan moved to Free. Your public profile is still live — update billing anytime to restore leads and featured placement.',
                                link: '?view=account',
                            });
                        } catch (_) {}
                    }
                }
            } catch (e) { console.warn('[dunning.sweep step]', e.message); }
        }
        if (sent) console.log(`[dunning] sent ${sent} step(s), ${downgraded} downgrade(s)`);
    } catch (e) { console.warn('[dunning.sweep]', e.message); }
    return { sent, downgraded };
}

module.exports = { enqueueDunning, resolveDunning, downgradeAgentToFree, runDunningSweep };
