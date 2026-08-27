'use strict';

// Referral reward automation. A referral is recorded at signup (status
// 'signed_up'). The reward is earned only when the referred agent actually
// PAYS — that's the anti-fraud gate (self-referral would mean paying for a real
// second subscription). On that first paid invoice we:
//   1. qualify the referral (status → 'rewarded', converted_at, reward_granted),
//   2. reward BOTH sides with one free month, and
//   3. email both.
//
// The one-free-month credit is applied as a Stripe customer balance credit ONLY
// when REFERRAL_AUTO_CREDIT=1 — so billing is never touched until the owner
// turns it on and verifies. When off, the referral is still qualified + flagged
// (reward_granted=TRUE) and both parties are emailed, and the team applies the
// credit from Stripe — matching today's manual model, but now automatic + tracked.

const pool = require('../database/pool');
const email = require('./email');

async function maybeRewardReferral(referredUserId) {
    // The referred agent + their still-pending referral + both parties' details.
    const q = await pool.query(
        `SELECT ar.id AS referral_id, da.paid_membership_code, m.code AS referred_plan,
                ra.stripe_customer_id AS referrer_customer, ru.email AS referrer_email, ru.first_name AS referrer_first,
                da.stripe_customer_id AS referred_customer, du.email AS referred_email, du.first_name AS referred_first
           FROM agents da
           JOIN agent_referrals ar ON ar.referred_agent_id = da.id AND ar.status = 'signed_up'
           JOIN agents ra ON ra.id = ar.referrer_agent_id
           JOIN users  ru ON ru.id = ra.user_id
           JOIN users  du ON du.id = da.user_id
      LEFT JOIN memberships m ON m.id = da.membership_id
          WHERE da.user_id = $1
          LIMIT 1`,
        [referredUserId]);
    if (!q.rowCount) return { rewarded: false };
    const r = q.rows[0];

    // Claim the referral atomically so a duplicate webhook can't double-reward.
    const claim = await pool.query(
        `UPDATE agent_referrals
            SET status = 'rewarded', reward_granted = TRUE, converted_at = NOW()
          WHERE id = $1 AND status = 'signed_up'
          RETURNING id`,
        [r.referral_id]);
    if (!claim.rowCount) return { rewarded: false };

    // One free month of the referred agent's plan — what each side gets.
    let monthly = 0;
    try { monthly = require('../controllers/stripe.controller').monthlyPriceForCode(r.paid_membership_code || r.referred_plan) || 0; }
    catch (_) { monthly = 0; }

    // Auto-apply the credit only when explicitly enabled.
    const auto = process.env.REFERRAL_AUTO_CREDIT === '1' && monthly > 0;
    if (auto) {
        let stripe = null;
        try { stripe = require('../controllers/stripe.controller').getStripe(); } catch (_) {}
        if (stripe) {
            for (const cust of [r.referrer_customer, r.referred_customer]) {
                if (!cust) continue;
                try {
                    await stripe.customers.createBalanceTransaction(cust, {
                        amount: -Math.round(monthly * 100),   // negative = credit
                        currency: 'usd',
                        description: 'MN Lake Homes referral reward — 1 month free',
                    });
                } catch (e) { console.warn('[referral] credit failed for', cust, '—', e.message); }
            }
        }
    }

    // Notify both sides (best-effort — a bounce must not undo the reward).
    try { email.sendReferralRewardEmail({ to: r.referrer_email, first_name: r.referrer_first, kind: 'referrer', auto, amount: monthly }); }
    catch (e) { console.warn('[referral] referrer email failed:', e.message); }
    try { email.sendReferralRewardEmail({ to: r.referred_email, first_name: r.referred_first, kind: 'referred', auto, amount: monthly }); }
    catch (e) { console.warn('[referral] referred email failed:', e.message); }

    console.log(`[referral] rewarded referral ${r.referral_id} (auto-credit: ${auto})`);
    return { rewarded: true, auto };
}

module.exports = { maybeRewardReferral };
