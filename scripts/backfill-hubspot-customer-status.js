#!/usr/bin/env node
/**
 * backfill-hubspot-customer-status.js — flip every existing paying
 * agent and business in HubSpot to lifecyclestage = "customer".
 *
 *     node scripts/backfill-hubspot-customer-status.js
 *
 * Who gets flipped:
 *
 *   1. Any agent or business with subscription_status = 'active' in our
 *      local DB (they have a live Stripe subscription now).
 *   2. Any user whose stripe_customer_id has ever produced a successful
 *      Stripe invoice — pulled live from Stripe so we don't depend on
 *      whether the webhook ever wrote a local payments row. Covers
 *      historical churns who paid us at some point.
 *
 * The HubSpot helper is idempotent — it reads lifecyclestage first and
 * skips no-op PATCHes for contacts already at "customer" or "evangelist".
 * Safe to re-run any time.
 *
 * Throttled to ~3 HubSpot writes/sec to stay under their rate limits.
 */

const pool = require('../src/database/pool');
const hubspot = require('../src/services/hubspot');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
    console.error('STRIPE_SECRET_KEY not set — cannot verify customers via Stripe. Exiting.');
    process.exit(1);
}
const stripe = require('stripe')(STRIPE_KEY);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function gatherPayingUsers() {
    // Active subscriptions on agents and businesses.
    const { rows: agentRows } = await pool.query(`
        SELECT a.user_id, u.hs_contact_id, u.email, a.stripe_customer_id, 'agent' AS kind
          FROM agents a
          JOIN users  u ON u.id = a.user_id
         WHERE a.subscription_status = 'active'
           AND u.hs_contact_id IS NOT NULL
    `);
    const { rows: bizRows } = await pool.query(`
        SELECT b.user_id, u.hs_contact_id, u.email, b.stripe_customer_id, 'business' AS kind
          FROM businesses b
          JOIN users      u ON u.id = b.user_id
         WHERE b.subscription_status = 'active'
           AND u.hs_contact_id IS NOT NULL
    `);
    // Anyone who has at least one paid local payment row.
    const { rows: paidRows } = await pool.query(`
        SELECT DISTINCT p.user_id, u.hs_contact_id, u.email, p.stripe_customer_id, 'paid_history' AS kind
          FROM payments p
          JOIN users    u ON u.id = p.user_id
         WHERE p.status = 'paid'
           AND u.hs_contact_id IS NOT NULL
    `);
    return dedupe([...agentRows, ...bizRows, ...paidRows]);
}

function dedupe(rows) {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
        if (seen.has(r.hs_contact_id)) continue;
        seen.add(r.hs_contact_id);
        out.push(r);
    }
    return out;
}

// Also pull anyone whose Stripe customer has paid invoices but who somehow
// isn't in the local active-subscription buckets above. Covers people who
// churned but really did pay us at some point — they should still be
// "Customer" in HubSpot forever.
async function gatherFromStripeHistory() {
    // Pull every users.stripe-id we know about and check Stripe.
    const { rows } = await pool.query(`
        SELECT u.id AS user_id, u.hs_contact_id, u.email, a.stripe_customer_id
          FROM users u
          JOIN agents a ON a.user_id = u.id
         WHERE u.hs_contact_id IS NOT NULL
           AND a.stripe_customer_id IS NOT NULL
        UNION
        SELECT u.id AS user_id, u.hs_contact_id, u.email, b.stripe_customer_id
          FROM users u
          JOIN businesses b ON b.user_id = u.id
         WHERE u.hs_contact_id IS NOT NULL
           AND b.stripe_customer_id IS NOT NULL
    `);
    const result = [];
    for (const r of rows) {
        try {
            const invoices = await stripe.invoices.list({
                customer: r.stripe_customer_id,
                status: 'paid',
                limit: 1,
            });
            if (invoices.data.length) result.push({ ...r, kind: 'stripe_history' });
            await sleep(150); // polite to Stripe
        } catch (err) {
            console.warn(`  ! Stripe invoices.list failed for ${r.stripe_customer_id}: ${err.message}`);
        }
    }
    return result;
}

async function main() {
    console.log('=== backfill-hubspot-customer-status ===\n');

    const localPayers = await gatherPayingUsers();
    console.log(`Paying contacts (local DB): ${localPayers.length}`);

    const stripePayers = await gatherFromStripeHistory();
    console.log(`Paying contacts (Stripe history sweep): ${stripePayers.length}`);

    const everyone = dedupe([...localPayers, ...stripePayers]);
    console.log(`Unique HubSpot contacts to flip: ${everyone.length}\n`);

    let flipped = 0, alreadyCustomer = 0, failed = 0;
    for (const r of everyone) {
        process.stdout.write(`  ${r.email || '(no email)'}  hs=${r.hs_contact_id}  → `);
        const res = await hubspot.markContactAsCustomer(r.hs_contact_id);
        if (res?.unchanged) {
            console.log(`already ${res.stage}`);
            alreadyCustomer++;
        } else if (res?.id) {
            console.log(`✓ customer (was ${res.fromStage || 'unset'})`);
            flipped++;
        } else {
            console.log('✗ failed');
            failed++;
        }
        await sleep(350); // ~3 PATCH/sec to stay under HubSpot's per-portal rate cap
    }

    console.log(`\n── summary ──`);
    console.log(`  flipped         : ${flipped}`);
    console.log(`  already customer: ${alreadyCustomer}`);
    console.log(`  failed          : ${failed}`);
    console.log(`\nDone. Re-run is safe.\n`);
    await pool.end();
}

main().catch((err) => {
    console.error('backfill-hubspot-customer-status FAILED:', err);
    process.exit(1);
});
