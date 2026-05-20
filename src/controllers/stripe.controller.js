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
// maps to "Featured Partner"; basic (monthly or annual, plus the legacy
// STRIPE_PRICE_BUSINESS_MONTHLY env var) maps to "Local Spotlight".
// Anything else still defaults to basic so a misconfigured price doesn't
// silently lock the subscriber out of the directory.
function businessTierFromPriceId(priceId) {
    if (priceId === process.env.STRIPE_PRICE_BUSINESS_PREMIUM_MONTHLY
     || priceId === process.env.STRIPE_PRICE_BUSINESS_PREMIUM_ANNUAL) return 'premium';
    return 'basic';
}

// ─── POST /api/stripe/checkout ───────────────────────────────────────────────
// Authenticated agent creates a Stripe Checkout Session.
// Gated: the caller must already have an agents row — no profile, no paid
// plan. The pricing page never sends payment-less users here, but the
// server enforces it too so a hand-crafted POST can't bypass it.
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

        // Profile-required gate: an agent who hasn't created an agents row
        // shouldn't be able to start checkout. Reuse the existing customer
        // if we have one so receipts stay under a single Stripe customer.
        const { rows: agentRows } = await pool.query(
            `SELECT a.id, a.stripe_customer_id, u.email
               FROM agents a JOIN users u ON u.id = a.user_id
              WHERE a.user_id = $1 LIMIT 1`,
            [req.user.userId]
        );
        if (!agentRows.length) {
            return res.status(400).json({ error: 'Create your agent profile before choosing a plan.' });
        }
        const agent = agentRows[0];

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            // Carry the user_id through to the webhook so checkout.session.
            // completed knows which agents row to flip live.
            metadata:                  { user_id: req.user.userId, kind: 'agent' },
            subscription_data: { metadata: { user_id: req.user.userId, kind: 'agent' } },
            // Reuse existing Stripe customer if we already have one.
            ...(agent.stripe_customer_id
                ? { customer: agent.stripe_customer_id }
                : { customer_email: agent.email }),
            success_url: `${baseUrl}/pages/public/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:  `${baseUrl}/pages/public/pricing.html?canceled=1`,
        });

        return res.json({ url: session.url });
    } catch (err) {
        console.error('[Stripe Checkout] Error creating session:', err.message);
        return res.status(500).json({ error: 'Failed to create checkout session.' });
    }
};

// ─── POST /api/stripe/portal ─────────────────────────────────────────────────
// Returns a Stripe Customer Portal URL the agent can use to update their
// card, view invoices, downgrade, or cancel. Cancellation flows through
// the webhook (customer.subscription.deleted) and unpublishes the agent.
exports.createPortalSession = async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(503).json({ error: 'Stripe is not configured on this server.' });

        const { rows } = await pool.query(
            `SELECT stripe_customer_id FROM agents WHERE user_id = $1 LIMIT 1`,
            [req.user.userId]
        );
        const customerId = rows[0]?.stripe_customer_id;
        if (!customerId) {
            return res.status(400).json({ error: 'No active subscription yet — start a plan from the pricing page first.' });
        }

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const session = await stripe.billingPortal.sessions.create({
            customer:   customerId,
            return_url: `${baseUrl}/pages/agent/dashboard.html`,
        });
        return res.json({ url: session.url });
    } catch (err) {
        console.error('[Stripe Portal] Error creating session:', err.message);
        return res.status(500).json({ error: 'Could not open billing portal.' });
    }
};

// ─── GET /api/agents/me/billing ──────────────────────────────────────────────
// Returns the agent's current membership snapshot. Pulls the local row +,
// when a stripe_subscription_id is on file, the live subscription state
// from Stripe (next renewal date, amount, status). Used by the dashboard
// to render "Current tier · $X/mo · Renews May 17" without storing those
// fields locally (Stripe is the source of truth for billing detail).
exports.getMyBilling = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT a.id, a.profile_status, a.is_published, a.stripe_customer_id, a.stripe_subscription_id,
                    m.code AS membership_code, m.name AS membership_name, m.display_badge_label
               FROM agents a
               LEFT JOIN memberships m ON m.id = a.membership_id
              WHERE a.user_id = $1 LIMIT 1`,
            [req.user.userId]
        );
        if (!rows.length) return res.status(404).json({ error: 'No agent profile found for this account.' });
        const a = rows[0];

        const out = {
            has_profile:           true,
            profile_status:        a.profile_status,
            is_published:          a.is_published,
            membership_code:       a.membership_code,
            membership_name:       a.membership_name,
            badge_label:           a.display_badge_label,
            stripe_customer_id:    a.stripe_customer_id,
            stripe_subscription_id:a.stripe_subscription_id,
            subscription:          null,
        };

        // Live Stripe lookup when a subscription exists. Failure here is
        // soft — the dashboard still renders the local snapshot.
        const stripe = getStripe();
        if (stripe && a.stripe_subscription_id) {
            try {
                const sub = await stripe.subscriptions.retrieve(a.stripe_subscription_id, { expand: ['items.data.price.product'] });
                const item = sub.items?.data?.[0];
                const price = item?.price;
                out.subscription = {
                    status:               sub.status,                                            // active / past_due / canceled / etc.
                    cancel_at_period_end: !!sub.cancel_at_period_end,
                    current_period_end:   sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
                    started_at:           sub.start_date         ? new Date(sub.start_date * 1000).toISOString()         : null,
                    interval:             price?.recurring?.interval || null,                    // 'month' / 'year'
                    interval_count:       price?.recurring?.interval_count || 1,
                    amount_cents:         price?.unit_amount || null,
                    currency:             price?.currency || 'usd',
                    product_name:         price?.product?.name || null,
                };
            } catch (err) {
                console.warn('[Stripe getMyBilling] subscription lookup failed:', err.message);
            }
        }
        res.json(out);
    } catch (err) {
        console.error('[Stripe getMyBilling]', err.message);
        res.status(500).json({ error: 'Failed to load billing info.' });
    }
};

// ─── GET /api/pricing/agents ─────────────────────────────────────────────────
// Returns display-only price labels for each tier × period. Env-driven so
// Marketing can change the numbers on the pricing page without a deploy.
// Stripe remains the source of truth for actual billing — these are just
// what appears on the page.
exports.getAgentPricing = (req, res) => {
    const num = (v, def) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : def;
    };
    const out = {
        currency: 'usd',
        tiers: [
            {
                tier: 'standard',
                name: 'Basic',
                tagline: 'Get your profile live and start receiving leads in your service area.',
                features: [
                    'Public agent profile + lake-page placement',
                    'Lead inbox + email notifications',
                    'Up to 3 service-area tags',
                    'Standard listing position on lake pages',
                ],
                monthly_price: num(process.env.STRIPE_PRICING_STANDARD_MONTHLY, 49),
                annual_price:  num(process.env.STRIPE_PRICING_STANDARD_ANNUAL, 490),
                stripe_price_monthly: !!process.env.STRIPE_PRICE_STANDARD_MONTHLY,
                stripe_price_annual:  !!process.env.STRIPE_PRICE_STANDARD_ANNUAL,
            },
            {
                tier: 'prime',
                name: 'MN Lake Specialist',
                tagline: 'Featured placement on the lakes you specialize in, plus richer profile.',
                features: [
                    'Everything in Basic',
                    'Featured-agent badge on lake pages',
                    'Up to 10 service-area tags',
                    'Priority placement in lead routing',
                    'Direct-inquiry button on your profile',
                ],
                monthly_price: num(process.env.STRIPE_PRICING_PRIME_MONTHLY, 99),
                annual_price:  num(process.env.STRIPE_PRICING_PRIME_ANNUAL, 990),
                highlight:     true,
                stripe_price_monthly: !!process.env.STRIPE_PRICE_PRIME_MONTHLY,
                stripe_price_annual:  !!process.env.STRIPE_PRICE_PRIME_ANNUAL,
            },
            {
                tier: 'founder',
                name: 'Top Agent',
                tagline: 'Top-of-page placement, founder badge, and exclusive territory holds.',
                features: [
                    'Everything in MN Lake Specialist',
                    'Founder badge across the network',
                    'Unlimited service-area tags',
                    'First pick on new leads in your tagged areas',
                    'Featured in regional reports + blog roundups',
                ],
                monthly_price: num(process.env.STRIPE_PRICING_FOUNDER_MONTHLY, 199),
                annual_price:  num(process.env.STRIPE_PRICING_FOUNDER_ANNUAL, 1990),
                stripe_price_monthly: !!process.env.STRIPE_PRICE_FOUNDER_MONTHLY,
                stripe_price_annual:  !!process.env.STRIPE_PRICE_FOUNDER_ANNUAL,
            },
        ],
    };
    res.json(out);
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
                    // Always record what they're paying (paid_tier). Only
                    // move the effective `tier` when it isn't admin-comped.
                    await pool.query(
                        `UPDATE businesses
                            SET stripe_customer_id     = $1,
                                stripe_subscription_id = $2,
                                subscription_status    = 'active',
                                paid_tier              = $3,
                                tier                   = CASE WHEN tier_comped THEN tier ELSE $3 END,
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

                // Update the agent: publish + store Stripe IDs. Record what
                // they're paying (paid_membership_code); only move the
                // effective membership_id when it isn't admin-comped.
                await pool.query(
                    `UPDATE agents
                        SET membership_id         = CASE WHEN tier_comped THEN membership_id ELSE $1 END,
                            paid_membership_code  = $5,
                            profile_status        = 'published',
                            is_published          = true,
                            stripe_customer_id    = $2,
                            stripe_subscription_id = $3
                      WHERE user_id = $4`,
                    [membershipId, session.customer, session.subscription, userId, membershipCode]
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

                // Comped agents are intentionally kept live without payment,
                // so a cancellation must NOT hide them — leave their status
                // and publish flag exactly as the admin set them. Everyone
                // else drops to 'pending_review' (hidden, but it surfaces in
                // the admin "Pending Review" tab for a one-click re-publish,
                // rather than the orphaned 'unpublished' state).
                await pool.query(
                    `UPDATE agents
                        SET profile_status = CASE WHEN tier_comped THEN profile_status ELSE 'pending_review' END,
                            is_published   = CASE WHEN tier_comped THEN is_published   ELSE false END
                      WHERE stripe_subscription_id = $1`,
                    [subscriptionId]
                );

                console.log(`[Stripe Webhook] Agent ${agentRows[0].user_id} subscription cancelled (comped agents left live)`);
                break;
            }

            // ── Subscription state changed (past_due, unpaid, paused) ──
            // Also re-reads the price so tier stays in sync if the owner
            // or agent upgrades/downgrades via the Stripe portal. Same
            // event covers both businesses and agents; we dispatch by
            // which table the subscription_id is in.
            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const priceId = sub.items?.data?.[0]?.price?.id;

                // Try businesses first
                const bizPrior = await pool.query(
                    `SELECT subscription_status FROM businesses WHERE stripe_subscription_id = $1 LIMIT 1`,
                    [sub.id]
                );
                if (bizPrior.rowCount) {
                    const tier = businessTierFromPriceId(priceId);
                    const priorStatus = bizPrior.rows[0]?.subscription_status;
                    await pool.query(
                        `UPDATE businesses
                            SET subscription_status = $1,
                                paid_tier           = $2,
                                tier                = CASE WHEN tier_comped THEN tier ELSE $2 END,
                                updated_at          = NOW()
                          WHERE stripe_subscription_id = $3`,
                        [sub.status, tier, sub.id]
                    );
                    if (sub.status === 'past_due' && priorStatus !== 'past_due') {
                        const contact = await fetchBusinessOwnerBySubscriptionId(sub.id);
                        if (contact) {
                            emailService.sendBusinessPaymentFailed({
                                to: contact.email, name: contact.full_name,
                                businessName: contact.business_name,
                            });
                        }
                    }
                    break;
                }

                // Otherwise: agent. Re-map the membership tier in case
                // they upgraded/downgraded via the portal, and toggle
                // is_published based on subscription status. past_due /
                // unpaid keeps them visible (grace period); canceled /
                // incomplete_expired hides them. The dedicated
                // customer.subscription.deleted handler below takes
                // over for full cancellations.
                const newCode = membershipCodeFromPriceId(priceId);
                const { rows: agentRows } = await pool.query(
                    `SELECT user_id FROM agents WHERE stripe_subscription_id = $1 LIMIT 1`,
                    [sub.id]
                );
                if (!agentRows.length) break;
                const userId = agentRows[0].user_id;

                // Only swap membership_id if the new price maps cleanly.
                let membershipId = null;
                if (newCode) {
                    const mRows = await pool.query(`SELECT id FROM memberships WHERE code = $1`, [newCode]);
                    membershipId = mRows.rows[0]?.id || null;
                }

                // Hard-hide on incomplete_expired or unpaid → past grace.
                // active / past_due / trialing stay published.
                const visibleStatuses = ['active', 'trialing', 'past_due'];
                const shouldPublish = visibleStatuses.includes(sub.status);

                // Comped agents are pinned: never let a Stripe state change
                // flip their tier or visibility. For everyone else, visible
                // statuses stay published; a lapse drops to 'pending_review'
                // (hidden but recoverable from the admin Pending tab).
                await pool.query(
                    `UPDATE agents
                        SET membership_id  = CASE WHEN tier_comped THEN membership_id ELSE COALESCE($1, membership_id) END,
                            paid_membership_code = COALESCE($4, paid_membership_code),
                            is_published   = CASE WHEN tier_comped THEN is_published ELSE $2 END,
                            profile_status = CASE WHEN tier_comped THEN profile_status
                                                  WHEN $2 THEN 'published'
                                                  ELSE 'pending_review' END
                      WHERE stripe_subscription_id = $3`,
                    [membershipId, shouldPublish, sub.id, newCode]
                );
                console.log(`[Stripe Webhook] Agent ${userId} subscription.updated → ${sub.status} (${newCode || 'membership unchanged'})`);
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                if (!invoice.subscription) break;
                // Businesses
                const bizPrior = await pool.query(
                    `SELECT subscription_status FROM businesses WHERE stripe_subscription_id = $1 LIMIT 1`,
                    [invoice.subscription]
                );
                if (bizPrior.rowCount) {
                    const priorStatus = bizPrior.rows[0]?.subscription_status;
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
                                to: contact.email, name: contact.full_name,
                                businessName: contact.business_name,
                            });
                        }
                    }
                    break;
                }
                // Agent — keep profile visible during grace period.
                // Stripe retries auto-recover; subscription.deleted only
                // fires after the retry window expires.
                console.log(`[Stripe Webhook] Agent invoice.payment_failed for subscription ${invoice.subscription}`);
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                if (!invoice.subscription) break;
                // Both tables are best-effort — only one of them owns
                // this subscription_id, the other UPDATE is a no-op.
                await pool.query(
                    `UPDATE businesses
                        SET subscription_status = 'active', updated_at = NOW()
                      WHERE stripe_subscription_id = $1`,
                    [invoice.subscription]
                );
                await pool.query(
                    `UPDATE agents
                        SET is_published = true,
                            profile_status = 'published'
                      WHERE stripe_subscription_id = $1`,
                    [invoice.subscription]
                );
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
