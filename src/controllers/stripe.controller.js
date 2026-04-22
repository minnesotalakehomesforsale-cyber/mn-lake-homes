const pool = require('../database/pool');
const emailService = require('../services/email');

// Fetch owner email + display name for business lifecycle emails. Bundled
// here because every webhook branch that emails the owner needs the same
// lookup. Returns null silently on miss — email sends degrade gracefully.
async function fetchBusinessOwnerContact(businessId) {
    try {
        const { rows } = await pool.query(
            `SELECT u.email, u.full_name, b.name AS business_name, b.slug
             FROM businesses b JOIN users u ON u.id = b.user_id
             WHERE b.id = $1 LIMIT 1`,
            [businessId]
        );
        return rows[0] || null;
    } catch (_) { return null; }
}

async function fetchBusinessOwnerBySubscriptionId(subscriptionId) {
    try {
        const { rows } = await pool.query(
            `SELECT u.email, u.full_name, b.id AS business_id, b.name AS business_name, b.slug
             FROM businesses b JOIN users u ON u.id = b.user_id
             WHERE b.stripe_subscription_id = $1 LIMIT 1`,
            [subscriptionId]
        );
        return rows[0] || null;
    } catch (_) { return null; }
}

// Lazy-init Stripe so a missing STRIPE_SECRET_KEY doesn't crash the whole
// server at boot — Stripe only gets constructed when an endpoint is actually
// hit. Also lets the rest of the site keep working when Stripe isn't configured.
let _stripe = null;
function getStripe() {
    if (_stripe) return _stripe;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return null;
    _stripe = require('stripe')(key);
    return _stripe;
}

// ─── Price ID mapping ────────────────────────────────────────────────────────
const PRICE_MAP = {
    standard_monthly: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
    standard_annual:  process.env.STRIPE_PRICE_STANDARD_ANNUAL,
    prime_monthly:    process.env.STRIPE_PRICE_PRIME_MONTHLY,
    prime_annual:     process.env.STRIPE_PRICE_PRIME_ANNUAL,
    founder_monthly:  process.env.STRIPE_PRICE_FOUNDER_MONTHLY,
    founder_annual:   process.env.STRIPE_PRICE_FOUNDER_ANNUAL,
};

// Reverse lookup: Stripe price ID → membership code
function membershipCodeFromPriceId(priceId) {
    if (priceId === process.env.STRIPE_PRICE_STANDARD_MONTHLY || priceId === process.env.STRIPE_PRICE_STANDARD_ANNUAL) return 'basic';
    if (priceId === process.env.STRIPE_PRICE_PRIME_MONTHLY    || priceId === process.env.STRIPE_PRICE_PRIME_ANNUAL)    return 'mn_lake_specialist';
    if (priceId === process.env.STRIPE_PRICE_FOUNDER_MONTHLY  || priceId === process.env.STRIPE_PRICE_FOUNDER_ANNUAL)  return 'top_agent';
    return null;
}

// Reverse lookup for business subscriptions: price ID → tier. Premium
// maps to "Featured Partner"; basic maps to "Local Spotlight". Anything
// else falls back to basic so a misconfigured price doesn't lock the
// subscriber out of the directory.
function businessTierFromPriceId(priceId) {
    if (priceId === process.env.STRIPE_PRICE_BUSINESS_PREMIUM_MONTHLY
     || priceId === process.env.STRIPE_PRICE_BUSINESS_PREMIUM_ANNUAL) return 'premium';
    return 'basic';
}

// ─── POST /api/stripe/checkout ───────────────────────────────────────────────
// Authenticated agent creates a Stripe Checkout Session
exports.createCheckoutSession = async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) {
            return res.status(503).json({ error: 'Stripe is not configured on this server. Set STRIPE_SECRET_KEY.' });
        }

        const { tier, period } = req.body;

        // Validate inputs
        const validTiers   = ['standard', 'prime', 'founder'];
        const validPeriods = ['monthly', 'annual'];

        if (!validTiers.includes(tier)) {
            return res.status(400).json({ error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` });
        }
        if (!validPeriods.includes(period)) {
            return res.status(400).json({ error: `Invalid period. Must be one of: ${validPeriods.join(', ')}` });
        }

        const priceKey = `${tier}_${period}`;
        const priceId  = PRICE_MAP[priceKey];

        if (!priceId) {
            return res.status(500).json({ error: `Price ID not configured for ${priceKey}. Check server environment variables.` });
        }

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            metadata: {
                user_id: req.user.userId,
            },
            success_url: `${baseUrl}/pages/public/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:  `${baseUrl}/pages/agent/dashboard.html`,
        });

        return res.json({ url: session.url });
    } catch (err) {
        console.error('[Stripe Checkout] Error creating session:', err.message);
        return res.status(500).json({ error: 'Failed to create checkout session.' });
    }
};

// ─── POST /api/stripe/webhook ────────────────────────────────────────────────
// Stripe sends events here — no auth middleware, verified via signature
exports.handleWebhook = async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
        return res.status(503).json({ error: 'Stripe not configured.' });
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('[Stripe Webhook] Signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook signature verification failed.` });
    }

    try {
        switch (event.type) {
            // ── Checkout completed — activate subscription ──
            case 'checkout.session.completed': {
                const session = event.data.object;

                // Business-owner checkouts carry kind='business' in metadata
                // and map to a row in `businesses`, not `agents`. Handled
                // before the agent path so we don't fall through.
                if (session.metadata?.kind === 'business') {
                    const businessId = session.metadata.business_id;
                    if (!businessId) {
                        console.error('[Stripe Webhook] business checkout missing business_id');
                        break;
                    }
                    // Pull the subscription so we can map price → tier
                    // (premium vs basic). Tier drives the "Featured
                    // Partner" badge + sort on /towns.
                    const sub = await stripe.subscriptions.retrieve(session.subscription);
                    const priceId = sub.items.data[0]?.price?.id;
                    const tier    = businessTierFromPriceId(priceId);
                    await pool.query(
                        `UPDATE businesses
                            SET stripe_customer_id     = $1,
                                stripe_subscription_id = $2,
                                subscription_status    = 'active',
                                tier                   = $3,
                                updated_at             = NOW()
                          WHERE id = $4`,
                        [session.customer, session.subscription, tier, businessId]
                    );
                    console.log(`[Stripe Webhook] Business ${businessId} activated (${tier})`);

                    // Confirm to the owner that payment went through and
                    // their listing is now in the admin review queue.
                    const contact = await fetchBusinessOwnerContact(businessId);
                    if (contact) {
                        emailService.sendBusinessPaymentReceived({
                            to: contact.email,
                            name: contact.full_name,
                            businessName: contact.business_name,
                        });
                    }
                    break;
                }

                const userId  = session.metadata?.user_id;

                if (!userId) {
                    console.error('[Stripe Webhook] checkout.session.completed missing user_id in metadata');
                    break;
                }

                // Retrieve the subscription to get the price ID
                const subscription = await stripe.subscriptions.retrieve(session.subscription);
                const priceId      = subscription.items.data[0]?.price?.id;
                const membershipCode = membershipCodeFromPriceId(priceId);

                if (!membershipCode) {
                    console.error(`[Stripe Webhook] Unknown price ID: ${priceId}`);
                    break;
                }

                // Look up the membership row
                const { rows: membershipRows } = await pool.query(
                    `SELECT id FROM memberships WHERE code = $1`,
                    [membershipCode]
                );

                if (membershipRows.length === 0) {
                    console.error(`[Stripe Webhook] Membership code '${membershipCode}' not found in DB`);
                    break;
                }

                const membershipId = membershipRows[0].id;

                // Update the agent: assign membership, publish profile, store Stripe IDs
                await pool.query(
                    `UPDATE agents
                        SET membership_id         = $1,
                            profile_status        = 'published',
                            is_published          = true,
                            stripe_customer_id    = $2,
                            stripe_subscription_id = $3
                      WHERE user_id = $4`,
                    [membershipId, session.customer, session.subscription, userId]
                );

                console.log(`[Stripe Webhook] Agent ${userId} activated with membership '${membershipCode}'`);
                break;
            }

            // ── Subscription cancelled — unpublish agent ──
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const subscriptionId = subscription.id;

                // Businesses first — they share the subscription_id space
                // with agents, so we dispatch by table.
                const bizHit = await pool.query(
                    `UPDATE businesses
                        SET subscription_status = 'canceled', updated_at = NOW()
                      WHERE stripe_subscription_id = $1
                      RETURNING id`,
                    [subscriptionId]
                );
                if (bizHit.rowCount) {
                    console.log(`[Stripe Webhook] Business ${bizHit.rows[0].id} subscription canceled`);
                    const contact = await fetchBusinessOwnerBySubscriptionId(subscriptionId);
                    if (contact) {
                        emailService.sendBusinessSubscriptionCancelled({
                            to: contact.email,
                            name: contact.full_name,
                            businessName: contact.business_name,
                        });
                    }
                    break;
                }

                // Find the agent by their stored subscription ID
                const { rows: agentRows } = await pool.query(
                    `SELECT user_id FROM agents WHERE stripe_subscription_id = $1`,
                    [subscriptionId]
                );

                if (agentRows.length === 0) {
                    console.warn(`[Stripe Webhook] No agent found for subscription ${subscriptionId}`);
                    break;
                }

                await pool.query(
                    `UPDATE agents
                        SET profile_status = 'unpublished',
                            is_published   = false
                      WHERE stripe_subscription_id = $1`,
                    [subscriptionId]
                );

                console.log(`[Stripe Webhook] Agent ${agentRows[0].user_id} unpublished (subscription cancelled)`);
                break;
            }

            // ── Subscription state changed (past_due, unpaid, paused) ──
            // Also re-reads the price so tier stays in sync if the owner
            // upgrades/downgrades between Featured Partner and Local
            // Spotlight via the Stripe portal.
            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const priceId = sub.items?.data?.[0]?.price?.id;
                const tier    = businessTierFromPriceId(priceId);
                // Capture the previous state BEFORE the UPDATE so we can
                // detect the active→past_due transition and only send a
                // warning once per drop (not on every subsequent event).
                const prior = await pool.query(
                    `SELECT subscription_status FROM businesses WHERE stripe_subscription_id = $1 LIMIT 1`,
                    [sub.id]
                );
                const priorStatus = prior.rows[0]?.subscription_status;
                await pool.query(
                    `UPDATE businesses
                        SET subscription_status = $1,
                            tier                = $2,
                            updated_at          = NOW()
                      WHERE stripe_subscription_id = $3`,
                    [sub.status, tier, sub.id]
                );
                if (sub.status === 'past_due' && priorStatus !== 'past_due') {
                    const contact = await fetchBusinessOwnerBySubscriptionId(sub.id);
                    if (contact) {
                        emailService.sendBusinessPaymentFailed({
                            to: contact.email,
                            name: contact.full_name,
                            businessName: contact.business_name,
                        });
                    }
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                if (invoice.subscription) {
                    // Same dedupe trick: only email on the first drop, not
                    // every subsequent Stripe retry attempt.
                    const prior = await pool.query(
                        `SELECT subscription_status FROM businesses WHERE stripe_subscription_id = $1 LIMIT 1`,
                        [invoice.subscription]
                    );
                    const priorStatus = prior.rows[0]?.subscription_status;
                    await pool.query(
                        `UPDATE businesses
                            SET subscription_status = 'past_due', updated_at = NOW()
                          WHERE stripe_subscription_id = $1`,
                        [invoice.subscription]
                    );
                    if (priorStatus !== 'past_due') {
                        const contact = await fetchBusinessOwnerBySubscriptionId(invoice.subscription);
                        if (contact) {
                            emailService.sendBusinessPaymentFailed({
                                to: contact.email,
                                name: contact.full_name,
                                businessName: contact.business_name,
                            });
                        }
                    }
                }
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                if (invoice.subscription) {
                    await pool.query(
                        `UPDATE businesses
                            SET subscription_status = 'active', updated_at = NOW()
                          WHERE stripe_subscription_id = $1`,
                        [invoice.subscription]
                    );
                }
                break;
            }

            default:
                // Unhandled event type — acknowledge silently
                break;
        }
    } catch (err) {
        // Log but don't crash — Stripe will retry on 5xx, so return 200 to prevent loops
        console.error(`[Stripe Webhook] Error processing ${event.type}:`, err.message);
    }

    // Always return 200 to acknowledge receipt
    res.json({ received: true });
};
