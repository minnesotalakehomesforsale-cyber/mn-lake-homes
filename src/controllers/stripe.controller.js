const pool = require('../database/pool');
const emailService = require('../services/email');
const hubspot = require('../services/hubspot');
const { logActivity } = require('../services/activity-log');

// Persist a Stripe invoice as a row in `payments` and mirror it to HubSpot
// as a Note on the contact's timeline. Idempotent on stripe_invoice_id so
// Stripe retries don't create duplicates. Used by both
// invoice.payment_succeeded ('paid') and invoice.payment_failed ('failed').
async function persistPaymentAndMirrorToHubspot(invoice, status) {
    if (!invoice || !invoice.id) return null;

    // The subscription belongs to either a business or an agent (never both).
    // Resolve the local user_id by subscription_id so the payment row anchors
    // to a user that's already in our DB.
    let userId = null;
    if (invoice.subscription) {
        const bizRow = await pool.query(
            `SELECT user_id FROM businesses WHERE stripe_subscription_id = $1 LIMIT 1`,
            [invoice.subscription]
        );
        userId = bizRow.rows[0]?.user_id || null;
        if (!userId) {
            const agentRow = await pool.query(
                `SELECT user_id FROM agents WHERE stripe_subscription_id = $1 LIMIT 1`,
                [invoice.subscription]
            );
            userId = agentRow.rows[0]?.user_id || null;
        }
    }

    // Stripe always sends an integer in the smallest currency unit. Use
    // amount_paid on success, amount_due on failure (paid is 0 if the
    // charge bounced).
    const amountCents = status === 'paid'
        ? (invoice.amount_paid || 0)
        : (invoice.amount_due  || 0);

    // Description: prefer the first line item's description ("Premium - Apr 2026"
    // etc.), fall back to invoice description, then the billing_reason.
    const line = invoice.lines?.data?.[0];
    const description = line?.description || invoice.description || invoice.billing_reason || null;

    // period_start / period_end come back as Unix seconds.
    const periodStart = line?.period?.start
        ? new Date(line.period.start * 1000)
        : (invoice.period_start ? new Date(invoice.period_start * 1000) : null);
    const periodEnd = line?.period?.end
        ? new Date(line.period.end * 1000)
        : (invoice.period_end ? new Date(invoice.period_end * 1000) : null);

    let paymentRow = null;
    try {
        const upsert = await pool.query(
            `INSERT INTO payments
                (user_id, stripe_customer_id, stripe_subscription_id, stripe_invoice_id,
                 stripe_charge_id, amount_cents, currency, status, description,
                 invoice_url, invoice_pdf, period_start, period_end)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (stripe_invoice_id) DO UPDATE
                SET status = EXCLUDED.status,
                    amount_cents = EXCLUDED.amount_cents,
                    stripe_charge_id = COALESCE(EXCLUDED.stripe_charge_id, payments.stripe_charge_id)
             RETURNING id, hs_note_id`,
            [
                userId,
                invoice.customer || null,
                invoice.subscription || null,
                invoice.id,
                invoice.charge || null,
                amountCents,
                (invoice.currency || 'usd').toLowerCase(),
                status,
                description,
                invoice.hosted_invoice_url || null,
                invoice.invoice_pdf || null,
                periodStart,
                periodEnd,
            ]
        );
        paymentRow = upsert.rows[0];
    } catch (err) {
        console.error('[Stripe Webhook] persistPayment failed:', err.message);
        return null;
    }

    // Mirror to HubSpot — only if we know the user AND they have an
    // hs_contact_id (the contact has already been synced). Re-mirror on
    // status changes (e.g. a failed payment that later cleared) so the
    // contact timeline reflects the final state, but never duplicate the
    // initial note for the same invoice.
    if (userId && paymentRow && !paymentRow.hs_note_id) {
        try {
            const { rows } = await pool.query(
                `SELECT hs_contact_id, email FROM users WHERE id = $1`,
                [userId]
            );
            const hsId = rows[0]?.hs_contact_id;
            if (hsId) {
                const dollars = (amountCents / 100).toFixed(2);
                const currency = (invoice.currency || 'usd').toUpperCase();
                const periodStr = (periodStart && periodEnd)
                    ? `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} → ${periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : '';
                const statusLabel = status === 'paid' ? '✓ Payment received' : '⚠ Payment failed';
                const body = [
                    `${statusLabel}: $${dollars} ${currency}`,
                    description ? `Item: ${description}` : '',
                    periodStr ? `Period: ${periodStr}` : '',
                    `Invoice: ${invoice.id}`,
                    invoice.hosted_invoice_url ? `View: ${invoice.hosted_invoice_url}` : '',
                ].filter(Boolean).join('\n');
                const note = await hubspot.createContactNote(hsId, body);
                if (note?.id) {
                    await pool.query(
                        `UPDATE payments SET hs_note_id = $1 WHERE id = $2`,
                        [note.id, paymentRow.id]
                    );
                }
            }
        } catch (err) {
            // Never let HubSpot break the webhook path.
            console.error('[Stripe Webhook] hubspot note mirror failed:', err.message);
        }
    }

    return paymentRow;
}

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
// Note: the public "founder" pricing tier uses the slug `founder_public`
// to avoid colliding with the DB `founder` membership tier, which is
// admin-only and used by the 70/30 lead-routing split (not for sale).
const PRICE_MAP = {
    standard_monthly:      process.env.STRIPE_PRICE_STANDARD_MONTHLY,
    standard_annual:       process.env.STRIPE_PRICE_STANDARD_ANNUAL,
    prime_monthly:         process.env.STRIPE_PRICE_PRIME_MONTHLY,
    prime_annual:          process.env.STRIPE_PRICE_PRIME_ANNUAL,
    founder_public_monthly: process.env.STRIPE_PRICE_FOUNDER_MONTHLY,
    founder_public_annual:  process.env.STRIPE_PRICE_FOUNDER_ANNUAL,
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
        const validTiers   = ['standard', 'prime', 'founder_public'];
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
                name: 'Standard',
                tagline: 'Get your profile on one lake page — directory-style, no lead routing.',
                features: [
                    'Basic agent profile on one lake page',
                    'Listed below founding / Prime agents',
                    'No lead routing (directory listing only)',
                ],
                monthly_price: num(process.env.STRIPE_PRICING_STANDARD_MONTHLY, 9),
                annual_price:  num(process.env.STRIPE_PRICING_STANDARD_ANNUAL, 90),
                stripe_price_monthly: !!process.env.STRIPE_PRICE_STANDARD_MONTHLY,
                stripe_price_annual:  !!process.env.STRIPE_PRICE_STANDARD_ANNUAL,
            },
            {
                tier: 'prime',
                name: 'Prime',
                tagline: 'One founding spot per lake — featured at the top, first look at leads.',
                features: [
                    'Featured profile, top of one lake page',
                    'First look at qualified leads for that lake',
                    'One founding spot per lake',
                    'Founding rate locked as long as you stay subscribed',
                    'Direct line to the founder / feedback on the product',
                ],
                monthly_price: num(process.env.STRIPE_PRICING_PRIME_MONTHLY, 39),
                annual_price:  num(process.env.STRIPE_PRICING_PRIME_ANNUAL, 390),
                highlight:     true,
                stripe_price_monthly: !!process.env.STRIPE_PRICE_PRIME_MONTHLY,
                stripe_price_annual:  !!process.env.STRIPE_PRICE_PRIME_ANNUAL,
            },
            {
                tier: 'founder_public',
                name: 'Founder',
                tagline: 'Hold up to 5 lakes across a region — top placement everywhere.',
                features: [
                    'Everything in Prime, across up to 5 lakes / a region',
                    'First look at leads on every lake you hold',
                    'Top placement across your region + homepage region slot',
                    'Founding rate locked',
                ],
                monthly_price: num(process.env.STRIPE_PRICING_FOUNDER_MONTHLY, 149),
                annual_price:  num(process.env.STRIPE_PRICING_FOUNDER_ANNUAL, 1490),
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
                    // Audit trail — surfaces in the admin activity log + the
                    // business's per-entity Activity tab.
                    const ownerLookup = await pool.query(
                        `SELECT user_id FROM businesses WHERE id = $1 LIMIT 1`, [businessId]
                    );
                    logActivity({
                        event_type: 'business.subscription.activated',
                        event_scope: 'billing',
                        actor: { type: 'stripe', label: 'Stripe' },
                        target: { type: 'business', id: businessId, label: contact?.business_name || businessId },
                        details: { tier, subscription_id: session.subscription, owner_user_id: ownerLookup.rows[0]?.user_id || null },
                    });
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
                logActivity({
                    event_type: 'agent.subscription.activated',
                    event_scope: 'billing',
                    actor: { type: 'stripe', label: 'Stripe' },
                    target: { type: 'user', id: userId, label: membershipCode },
                    details: { membership_code: membershipCode, subscription_id: session.subscription },
                });
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
                    logActivity({
                        event_type: 'business.subscription.canceled',
                        event_scope: 'billing',
                        severity: 'warning',
                        actor: { type: 'stripe', label: 'Stripe' },
                        target: { type: 'business', id: bizHit.rows[0].id, label: contact?.business_name || bizHit.rows[0].id },
                        details: { subscription_id: subscriptionId },
                    });
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
                logActivity({
                    event_type: 'agent.subscription.canceled',
                    event_scope: 'billing',
                    severity: 'warning',
                    actor: { type: 'stripe', label: 'Stripe' },
                    target: { type: 'user', id: agentRows[0].user_id, label: 'agent' },
                    details: { subscription_id: subscriptionId },
                });
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
                    if (sub.status !== priorStatus) {
                        const bizRow = await pool.query(
                            `SELECT id, name FROM businesses WHERE stripe_subscription_id = $1 LIMIT 1`,
                            [sub.id]
                        );
                        logActivity({
                            event_type: 'business.subscription.updated',
                            event_scope: 'billing',
                            severity: sub.status === 'past_due' ? 'warning' : 'info',
                            actor: { type: 'stripe', label: 'Stripe' },
                            target: { type: 'business', id: bizRow.rows[0]?.id || null, label: bizRow.rows[0]?.name || null },
                            details: { from: priorStatus, to: sub.status, tier, subscription_id: sub.id },
                        });
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
                logActivity({
                    event_type: 'agent.subscription.updated',
                    event_scope: 'billing',
                    severity: sub.status === 'past_due' ? 'warning' : 'info',
                    actor: { type: 'stripe', label: 'Stripe' },
                    target: { type: 'user', id: userId, label: newCode || 'agent' },
                    details: { stripe_status: sub.status, membership_code: newCode, subscription_id: sub.id },
                });
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                if (!invoice.subscription) break;
                // Persist payment row + mirror to HubSpot timeline. Runs
                // first so the row exists even if the table-update branches
                // below fail.
                await persistPaymentAndMirrorToHubspot(invoice, 'failed');
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
                    const bizRow = await pool.query(
                        `SELECT id, name FROM businesses WHERE stripe_subscription_id = $1 LIMIT 1`,
                        [invoice.subscription]
                    );
                    logActivity({
                        event_type: 'business.payment.failed',
                        event_scope: 'billing',
                        severity: 'warning',
                        actor: { type: 'stripe', label: 'Stripe' },
                        target: { type: 'business', id: bizRow.rows[0]?.id || null, label: bizRow.rows[0]?.name || null },
                        details: { subscription_id: invoice.subscription, amount_due: invoice.amount_due, attempt: invoice.attempt_count },
                    });
                    break;
                }
                // Agent — keep profile visible during grace period.
                // Stripe retries auto-recover; subscription.deleted only
                // fires after the retry window expires.
                console.log(`[Stripe Webhook] Agent invoice.payment_failed for subscription ${invoice.subscription}`);
                const agentRow = await pool.query(
                    `SELECT user_id FROM agents WHERE stripe_subscription_id = $1 LIMIT 1`,
                    [invoice.subscription]
                );
                if (agentRow.rowCount) {
                    logActivity({
                        event_type: 'agent.payment.failed',
                        event_scope: 'billing',
                        severity: 'warning',
                        actor: { type: 'stripe', label: 'Stripe' },
                        target: { type: 'user', id: agentRow.rows[0].user_id, label: 'agent' },
                        details: { subscription_id: invoice.subscription, amount_due: invoice.amount_due, attempt: invoice.attempt_count },
                    });
                }
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                if (!invoice.subscription) break;
                // Persist payment row + mirror to HubSpot timeline. Runs
                // first so the row exists regardless of the publish updates
                // that follow.
                await persistPaymentAndMirrorToHubspot(invoice, 'paid');
                // Both tables are best-effort — only one of them owns
                // this subscription_id, the other UPDATE is a no-op.
                const bizRes = await pool.query(
                    `UPDATE businesses
                        SET subscription_status = 'active', updated_at = NOW()
                      WHERE stripe_subscription_id = $1
                      RETURNING id, name`,
                    [invoice.subscription]
                );
                const agentRes = await pool.query(
                    `UPDATE agents
                        SET is_published = true,
                            profile_status = 'published'
                      WHERE stripe_subscription_id = $1
                      RETURNING user_id`,
                    [invoice.subscription]
                );
                // Log against whichever table owned the subscription. Only
                // billing_reason=subscription_cycle (renewals) and =subscription_create
                // (first charge) are worth logging; ignore proration adjustments.
                const reason = invoice.billing_reason || 'manual';
                if (bizRes.rowCount) {
                    logActivity({
                        event_type: 'business.payment.succeeded',
                        event_scope: 'billing',
                        actor: { type: 'stripe', label: 'Stripe' },
                        target: { type: 'business', id: bizRes.rows[0].id, label: bizRes.rows[0].name },
                        details: { subscription_id: invoice.subscription, amount_paid: invoice.amount_paid, reason },
                    });
                } else if (agentRes.rowCount) {
                    logActivity({
                        event_type: 'agent.payment.succeeded',
                        event_scope: 'billing',
                        actor: { type: 'stripe', label: 'Stripe' },
                        target: { type: 'user', id: agentRes.rows[0].user_id, label: 'agent' },
                        details: { subscription_id: invoice.subscription, amount_paid: invoice.amount_paid, reason },
                    });
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
