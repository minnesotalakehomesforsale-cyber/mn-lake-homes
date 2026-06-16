#!/usr/bin/env node
/**
 * backfill-orphaned-payments.js — heal payments rows that were saved
 * with user_id=NULL because of the Stripe webhook race condition (where
 * invoice.payment_succeeded arrived before checkout.session.completed
 * could write stripe_subscription_id onto the agent/business row).
 *
 *     node scripts/backfill-orphaned-payments.js
 *
 * For each orphan we:
 *   1. Retrieve the subscription from Stripe by stripe_subscription_id.
 *   2. Read subscription.metadata.user_id (stamped at checkout creation).
 *   3. Update payments.user_id, and also backfill agents/businesses
 *      .stripe_subscription_id + stripe_customer_id so future invoices
 *      resolve locally without an API call.
 *   4. Last-resort fallback: match by customer email → users.email.
 *
 * Idempotent — already-healed rows are skipped. Safe to re-run.
 * Throttled to 4 lookups/sec to stay polite to the Stripe API.
 */

const pool = require('../src/database/pool');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
    console.error('STRIPE_SECRET_KEY not set — cannot retrieve subscriptions. Exiting.');
    process.exit(1);
}
const stripe = require('stripe')(STRIPE_KEY);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function listOrphans() {
    const { rows } = await pool.query(
        `SELECT id, stripe_invoice_id, stripe_subscription_id, stripe_customer_id, created_at
           FROM payments
          WHERE user_id IS NULL
          ORDER BY created_at ASC`
    );
    return rows;
}

async function resolveUserIdForOrphan(row) {
    // 1) sub.metadata.user_id — the canonical path for everything created
    //    by our own checkout flow.
    if (row.stripe_subscription_id) {
        try {
            const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
            const metaUserId  = sub?.metadata?.user_id || null;
            const metaKind    = sub?.metadata?.kind || null;
            const metaBusinessId = sub?.metadata?.business_id || null;
            if (metaUserId) {
                return { userId: metaUserId, source: 'sub.metadata', kind: metaKind, businessId: metaBusinessId };
            }
            // 2) Fall back to the Stripe customer's email.
            if (sub?.customer) {
                const cust = await stripe.customers.retrieve(sub.customer);
                if (cust?.email && !cust.deleted) {
                    const { rows } = await pool.query(
                        `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
                        [cust.email]
                    );
                    if (rows[0]?.id) {
                        return { userId: rows[0].id, source: 'customer.email', kind: metaKind, businessId: metaBusinessId };
                    }
                }
            }
        } catch (err) {
            console.warn(`  ! Stripe retrieve failed for ${row.stripe_subscription_id}: ${err.message}`);
        }
    }
    // 3) Last resort: customer_id alone — try to retrieve the customer
    //    directly and match by email.
    if (row.stripe_customer_id) {
        try {
            const cust = await stripe.customers.retrieve(row.stripe_customer_id);
            if (cust?.email && !cust.deleted) {
                const { rows } = await pool.query(
                    `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
                    [cust.email]
                );
                if (rows[0]?.id) {
                    return { userId: rows[0].id, source: 'customer.email (direct)', kind: null, businessId: null };
                }
            }
        } catch (err) {
            console.warn(`  ! Stripe customer retrieve failed for ${row.stripe_customer_id}: ${err.message}`);
        }
    }
    return null;
}

async function applyResolution(row, resolution) {
    await pool.query(
        `UPDATE payments SET user_id = $1 WHERE id = $2`,
        [resolution.userId, row.id]
    );
    // Also patch the matching agent/business row so future invoices on
    // this subscription resolve locally without another Stripe roundtrip.
    if (row.stripe_subscription_id) {
        if (resolution.kind === 'agent') {
            await pool.query(
                `UPDATE agents
                    SET stripe_subscription_id = COALESCE(stripe_subscription_id, $1),
                        stripe_customer_id     = COALESCE(stripe_customer_id, $2)
                  WHERE user_id = $3`,
                [row.stripe_subscription_id, row.stripe_customer_id, resolution.userId]
            );
        } else if (resolution.kind === 'business' && resolution.businessId) {
            await pool.query(
                `UPDATE businesses
                    SET stripe_subscription_id = COALESCE(stripe_subscription_id, $1),
                        stripe_customer_id     = COALESCE(stripe_customer_id, $2)
                  WHERE id = $3`,
                [row.stripe_subscription_id, row.stripe_customer_id, resolution.businessId]
            );
        }
    }
}

async function main() {
    console.log('=== backfill-orphaned-payments ===\n');
    const orphans = await listOrphans();
    console.log(`Orphaned payments (user_id IS NULL): ${orphans.length}`);
    if (!orphans.length) {
        console.log('Nothing to backfill. Done.');
        await pool.end();
        return;
    }
    let healed = 0, unresolved = 0;
    for (const row of orphans) {
        const sub = row.stripe_subscription_id || '(no sub)';
        const inv = row.stripe_invoice_id || '(no invoice)';
        process.stdout.write(`  ${inv}  sub=${sub}  → `);
        const resolution = await resolveUserIdForOrphan(row);
        if (resolution) {
            await applyResolution(row, resolution);
            console.log(`✓ user_id=${resolution.userId} (via ${resolution.source})`);
            healed++;
        } else {
            console.log('✗ unresolved');
            unresolved++;
        }
        await sleep(250); // ~4 req/sec, polite to Stripe
    }
    console.log(`\n── summary ──`);
    console.log(`  healed     : ${healed}`);
    console.log(`  unresolved : ${unresolved}`);
    console.log(`\nDone. Re-run is safe.\n`);
    await pool.end();
}

main().catch((err) => {
    console.error('backfill-orphaned-payments FAILED:', err);
    process.exit(1);
});
