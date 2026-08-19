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
    //
    // ⚠ Race condition: Stripe doesn't guarantee webhook ordering, and for
    // a brand-new subscription `invoice.payment_succeeded` often arrives
    // BEFORE `checkout.session.completed` — the event that writes
    // stripe_subscription_id onto the agent/business row. When that happens,
    // both DB lookups below return nothing and the payment row used to be
    // saved with user_id=NULL — orphaned forever, invisible on the admin
    // Payments tab. To fix that, when the DB lookups miss, we fall back
    // to retrieving the subscription from Stripe and reading the user_id
    // we stamped onto subscription.metadata at checkout creation time. We
    // ALSO backfill the missing stripe_subscription_id onto the agent/
    // business row so the race never bites the next invoice.
    let userId = null;
    let resolvedFrom = null;
    if (invoice.subscription) {
        const bizRow = await pool.query(
            `SELECT user_id FROM businesses WHERE stripe_subscription_id = $1 LIMIT 1`,
            [invoice.subscription]
        );
        if (bizRow.rows[0]?.user_id) {
            userId = bizRow.rows[0].user_id;
            resolvedFrom = 'businesses.sub_id';
        }
        if (!userId) {
            const agentRow = await pool.query(
                `SELECT user_id FROM agents WHERE stripe_subscription_id = $1 LIMIT 1`,
                [invoice.subscription]
            );
            if (agentRow.rows[0]?.user_id) {
                userId = agentRow.rows[0].user_id;
                resolvedFrom = 'agents.sub_id';
            }
        }
        // Fallback 1: ask Stripe for subscription.metadata.user_id (we stamp
        // this at checkout time on both agent and business flows).
        if (!userId) {
            try {
                const stripe = getStripe();
                if (stripe) {
                    const sub = await stripe.subscriptions.retrieve(invoice.subscription);
                    const metaUserId = sub?.metadata?.user_id || null;
                    const metaKind   = sub?.metadata?.kind || null;
                    if (metaUserId) {
                        userId = metaUserId;
                        resolvedFrom = 'stripe.sub.metadata';
                        // Backfill the matching row so the next invoice for
                        // this subscription resolves locally without hitting
                        // the Stripe API.
                        if (metaKind === 'agent') {
                            await pool.query(
                                `UPDATE agents
                                    SET stripe_subscription_id = COALESCE(stripe_subscription_id, $1),
                                        stripe_customer_id     = COALESCE(stripe_customer_id, $2)
                                  WHERE user_id = $3`,
                                [invoice.subscription, invoice.customer || null, metaUserId]
                            );
                        } else if (metaKind === 'business' && sub?.metadata?.business_id) {
                            await pool.query(
                                `UPDATE businesses
                                    SET stripe_subscription_id = COALESCE(stripe_subscription_id, $1),
                                        stripe_customer_id     = COALESCE(stripe_customer_id, $2)
                                  WHERE id = $3`,
                                [invoice.subscription, invoice.customer || null, sub.metadata.business_id]
                            );
                        }
                    }
                }
            } catch (err) {
                console.error('[Stripe Webhook] sub.metadata fallback failed:', err.message);
            }
        }
        // Fallback 2: match by customer email — last resort, covers historical
        // rows where the subscription wasn't created with our metadata.
        if (!userId && invoice.customer_email) {
            const userRow = await pool.query(
                `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
                [invoice.customer_email]
            );
            if (userRow.rows[0]?.id) {
                userId = userRow.rows[0].id;
                resolvedFrom = 'users.email';
            }
        }
    }
    if (userId && resolvedFrom !== 'businesses.sub_id' && resolvedFrom !== 'agents.sub_id') {
        console.log(`[Stripe Webhook] user_id resolved via ${resolvedFrom} for invoice ${invoice.id}`);
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
                // Flip the contact's lifecyclestage to Customer on the first
                // successful charge so paying agents stop showing as Leads in
                // the HubSpot pipeline. Idempotent — markContactAsCustomer
                // reads the stage first and skips no-op patches.
                if (status === 'paid') {
                    await hubspot.markContactAsCustomer(hsId);
                }
            }
        } catch (err) {
            // Never let HubSpot break the webhook path.
            console.error('[Stripe Webhook] hubspot note mirror failed:', err.message);
        }
    }

    return paymentRow;
}

// Mirror Stripe subscription state → HubSpot contact property (T074). Resolves
// the account email from either table by subscription_id, then upserts the
// contact's `subscription_status`. Best-effort and fully swallow-safe: a CRM
// hiccup must never break the webhook. Handles the agent product and business
// listings alike.
async function mirrorSubStatus(subscriptionId, status) {
    if (!subscriptionId) return;
    try {
        const { rows } = await pool.query(
            `SELECT u.email FROM agents a JOIN users u ON u.id = a.user_id
               WHERE a.stripe_subscription_id = $1
             UNION
             SELECT u.email FROM businesses b JOIN users u ON u.id = b.user_id
               WHERE b.stripe_subscription_id = $1
             LIMIT 1`,
            [subscriptionId]
        );
        const email = rows[0]?.email;
        if (email) {
            if (status === 'canceled') {
                // A2: churn → lifecyclestage back to Lead + churned_at.
                await hubspot.markContactChurned(email);
            } else {
                await hubspot.syncSubscriptionStatus(email, status);
            }
        }
    } catch (e) {
        console.warn('[Stripe Webhook] subscription_status mirror failed:', e.message);
    }
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
// admin-only and used by the exclusive-founder lead routing (not for sale).
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
// ─── Founder seats (per-lake exclusive) — FEATURE-FLAGGED, HIDDEN ────────────
// A founder seat is a per-lake add-on: the buyer gets 100% of that lake's leads
// plus top routing priority in their towns. Price is per-lake and variable
// (lakes.founder_seat_price, floor $249, ceiling $5000), so checkout uses Stripe
// dynamic price_data rather than a fixed price ID. Gated behind
// FOUNDER_SEATS_PUBLIC — default OFF, so nothing is buyable until we flip it on.
// (Admins can still seat founders manually via lake.controller setFounder.)
const FOUNDER_SEATS_PUBLIC = process.env.FOUNDER_SEATS_PUBLIC === 'true';
exports.FOUNDER_SEATS_PUBLIC = FOUNDER_SEATS_PUBLIC;

const FOUNDER_SEAT_FLOOR   = 249;
const FOUNDER_SEAT_CEILING = 5000;
// Annual = 10× monthly (matches the ~2-months-free convention on the other tiers).
const FOUNDER_ANNUAL_MULTIPLIER = 10;

// POST /api/stripe/founder-seat/checkout  { lakeId, period }
// Hidden until FOUNDER_SEATS_PUBLIC=true. Creates a subscription Checkout with
// the lake's own price. On success the webhook flags agent_lakes.is_founder.
exports.createFounderSeatCheckout = async (req, res) => {
    try {
        if (!FOUNDER_SEATS_PUBLIC) {
            return res.status(404).json({ error: 'Founder seats are not available yet.' });
        }
        const stripe = getStripe();
        if (!stripe) {
            return res.status(503).json({ error: 'Stripe is not configured on this server. Set STRIPE_SECRET_KEY.' });
        }

        const { lakeId, period } = req.body;
        if (!lakeId) return res.status(400).json({ error: 'A lakeId is required.' });
        if (!['monthly', 'annual'].includes(period)) {
            return res.status(400).json({ error: 'Invalid period. Must be monthly or annual.' });
        }

        // Caller must be an agent with a profile (same gate as the tier checkout).
        const { rows: agentRows } = await pool.query(
            `SELECT a.id, a.stripe_customer_id, u.email
               FROM agents a JOIN users u ON u.id = a.user_id
              WHERE a.user_id = $1 LIMIT 1`,
            [req.user.userId]
        );
        if (!agentRows.length) {
            return res.status(400).json({ error: 'Create your agent profile before claiming a founder seat.' });
        }
        const agent = agentRows[0];

        // Lake must be published, have a listed (or AI) price, and be unclaimed.
        const { rows: lakeRows } = await pool.query(
            `SELECT id, name, status,
                    COALESCE(founder_seat_price, founder_seat_ai_value) AS price,
                    EXISTS (SELECT 1 FROM agent_lakes al WHERE al.lake_id = lakes.id AND al.is_founder) AS taken
               FROM lakes WHERE id = $1 LIMIT 1`,
            [lakeId]
        );
        const lake = lakeRows[0];
        if (!lake || lake.status !== 'published') {
            return res.status(404).json({ error: 'Lake not found.' });
        }
        if (lake.taken) {
            return res.status(409).json({ error: "This lake's founder seat is already taken." });
        }
        if (!lake.price) {
            return res.status(400).json({ error: "This lake isn't open for founder seats yet." });
        }

        // Enforce the floor/ceiling server-side regardless of what's stored.
        const monthly = Math.max(FOUNDER_SEAT_FLOOR, Math.min(FOUNDER_SEAT_CEILING, parseInt(lake.price, 10) || 0));
        const amount  = period === 'annual' ? monthly * FOUNDER_ANNUAL_MULTIPLIER : monthly;
        const interval = period === 'annual' ? 'year' : 'month';

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const meta = { kind: 'founder_seat', lake_id: lake.id, agent_id: agent.id, user_id: req.user.userId };

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: 'usd',
                    unit_amount: amount * 100,
                    recurring: { interval },
                    product_data: { name: `Founder seat — ${lake.name}` },
                },
            }],
            metadata:          meta,
            subscription_data: { metadata: meta },
            ...(agent.stripe_customer_id
                ? { customer: agent.stripe_customer_id }
                : { customer_email: agent.email }),
            success_url: `${baseUrl}/pages/public/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:  `${baseUrl}/pages/public/pricing.html?canceled=1`,
        });

        return res.json({ url: session.url });
    } catch (err) {
        console.error('[Stripe Founder Seat] Error creating session:', err.message);
        return res.status(500).json({ error: 'Failed to create founder-seat checkout session.' });
    }
};

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
// Pricing data (shared by the JSON endpoint + the server-rendered /join page).
function buildAgentPricing() {
    const num = (v, def) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : def;
    };
    return {
        currency: 'usd',
        tiers: [
            {
                tier: 'free',
                name: 'Lake Agent',
                tagline: 'Get listed — a public agent profile at no cost. Upgrade any time for leads.',
                features: [
                    'Public agent profile on the site',
                    'Show your bio, photo, specialties & service areas',
                    'Not featured, and not in the lead rotation',
                    'No matched leads until you upgrade',
                    'Upgrade any time — your profile and reviews come with you',
                ],
                monthly_price: 0,
                annual_price: 0,
                is_free: true,
            },
            {
                tier: 'standard',
                name: 'Standard',
                tagline: 'Get on the map — your profile on a lake page, in the lead rotation at base priority.',
                features: [
                    'Agent profile on your lake page',
                    'In the lead matching rotation (base priority)',
                    'Instant email alert the moment a lead is matched to you',
                    'Lead quality scoring — work your hottest leads first',
                    'Response-time badge on your public profile',
                    'Refer an agent, get a free month',
                ],
                monthly_price: num(process.env.STRIPE_PRICING_STANDARD_MONTHLY, 9),
                annual_price:  num(process.env.STRIPE_PRICING_STANDARD_ANNUAL, 90),
                stripe_price_monthly: !!process.env.STRIPE_PRICE_STANDARD_MONTHLY,
                stripe_price_annual:  !!process.env.STRIPE_PRICE_STANDARD_ANNUAL,
            },
            {
                tier: 'prime',
                name: 'Prime',
                tagline: 'Featured placement and higher lead priority across your service areas.',
                features: [
                    'Everything in Standard, plus:',
                    'Featured profile, top of your lake page',
                    'Higher lead priority than Standard in your areas',
                    'Cover up to 10 service-area towns',
                    'Featured badge across the site',
                    'Early-adopter pricing — 30 days\' notice before any increase',
                ],
                monthly_price: num(process.env.STRIPE_PRICING_PRIME_MONTHLY, 39),
                annual_price:  num(process.env.STRIPE_PRICING_PRIME_ANNUAL, 390),
                highlight:     true,
                stripe_price_monthly: !!process.env.STRIPE_PRICE_PRIME_MONTHLY,
                stripe_price_annual:  !!process.env.STRIPE_PRICE_PRIME_ANNUAL,
            },
            {
                // Slug/code stay 'founder_public'/'top_agent' (Stripe env vars +
                // checkout depend on them) — only the display name changes, to
                // stop colliding with the per-lake "Founder" (lake ownership).
                tier: 'founder_public',
                name: 'Elite',
                tagline: 'Top placement and the highest lead priority of any plan, across your region.',
                features: [
                    'Everything in Prime, across your whole region',
                    'Highest lead priority of any plan',
                    'Top placement across your region + homepage region slot',
                    'Early-adopter pricing — 30 days\' notice before any increase',
                ],
                monthly_price: num(process.env.STRIPE_PRICING_FOUNDER_MONTHLY, 149),
                annual_price:  num(process.env.STRIPE_PRICING_FOUNDER_ANNUAL, 1490),
                stripe_price_monthly: !!process.env.STRIPE_PRICE_FOUNDER_MONTHLY,
                stripe_price_annual:  !!process.env.STRIPE_PRICE_FOUNDER_ANNUAL,
            },
        ],
    };
}
exports.buildAgentPricing = buildAgentPricing;

// Monthly price ($) for a membership CODE, read from the same env-driven source
// as the pricing page — so nothing hardcodes 9/39/149 and drifts on a price
// change. Founder (per-lake seat) falls back to its own env / $249 floor.
function monthlyPriceForCode(code) {
    const { tiers } = buildAgentPricing();
    const bySlug = Object.fromEntries(tiers.map(t => [t.tier, t.monthly_price]));
    const map = {
        free: 0,
        basic: bySlug.standard,
        mn_lake_specialist: bySlug.prime,
        top_agent: bySlug.founder_public,
        premium: bySlug.founder_public,
        founder: Number(process.env.STRIPE_PRICING_FOUNDER_SEAT) || 249,
    };
    const v = map[code];
    return Number.isFinite(v) ? v : (bySlug.standard ?? 9);
}
exports.monthlyPriceForCode = monthlyPriceForCode;

exports.getAgentPricing = (req, res) => {
    res.json(buildAgentPricing());
};

// Server-rendered agent-tier grid for /join (SEO — crawlers can't read the
// client-side fetch). The client script re-renders this for interactivity
// (period toggle + gating), but the prices are present in the initial HTML.
exports.renderJoinTiersHtml = function renderJoinTiersHtml() {
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const dollars = n => '$' + Number(n || 0).toLocaleString('en-US');
    const { tiers } = buildAgentPricing();
    return (tiers || []).map(t => {
        const isFree = t.is_free || t.tier === 'free';
        const amt = isFree ? '$0' : dollars(t.monthly_price);
        const note = isFree ? 'No card required · upgrade any time' : 'Billed monthly · cancel anytime';
        const feats = (t.features || []).map(f => `<li>${esc(f)}</li>`).join('');
        return `<div class="jp-tier ${t.highlight ? 'hi' : ''}${isFree ? ' free' : ''}">`
            + (t.highlight ? '<span class="jp-badge">Recommended</span>' : '')
            + `<h3>${esc(t.name)}</h3>`
            + `<p class="tl">${esc(t.tagline)}</p>`
            + `<div><span class="jp-amt">${amt}</span>${isFree ? '' : '<span class="jp-per-lbl"> / mo</span>'}</div>`
            + `<p class="jp-note">${esc(note)}</p>`
            + (feats ? `<ul class="jp-features">${feats}</ul>` : '')
            + `</div>`;
    }).join('');
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

    // ── Idempotency (T072) ──────────────────────────────────────────────────
    // Stripe can deliver the same event more than once (retries, at-least-once
    // delivery). Our handlers do idempotent DB writes, but side effects (emails,
    // win-back enqueue, admin alerts) are NOT naturally dedup-safe. Claim each
    // event.id exactly once: the first delivery inserts and proceeds; any
    // duplicate hits the PK conflict, inserts nothing, and is acked without
    // re-running the handler. Best-effort — if the ledger table is unavailable
    // we fall through and process (matches prior behavior) rather than drop it.
    try {
        const claim = await pool.query(
            `INSERT INTO stripe_events (event_id, type) VALUES ($1, $2)
             ON CONFLICT (event_id) DO NOTHING`,
            [event.id, event.type]
        );
        if (claim.rowCount === 0) {
            console.log(`[Stripe Webhook] duplicate event ${event.id} (${event.type}) — already processed, skipping`);
            return res.json({ received: true, duplicate: true });
        }
    } catch (e) {
        console.warn('[Stripe Webhook] idempotency ledger unavailable, processing anyway:', e.message);
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

                // Founder-seat purchases (per-lake add-on) carry kind='founder_seat'.
                // They flag agent_lakes.is_founder for that lake rather than touching
                // the agent's membership tier. Handled before the agent path.
                if (session.metadata?.kind === 'founder_seat') {
                    const { lake_id, agent_id, user_id } = session.metadata;
                    if (!lake_id || !agent_id) {
                        console.error('[Stripe Webhook] founder_seat checkout missing lake_id/agent_id');
                        break;
                    }
                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');
                        // One founder per lake — clear any existing seat first.
                        await client.query(`UPDATE agent_lakes SET is_founder = FALSE WHERE lake_id = $1`, [lake_id]);
                        await client.query(
                            `INSERT INTO agent_lakes (agent_id, lake_id, is_founder)
                             VALUES ($1, $2, TRUE)
                             ON CONFLICT (agent_id, lake_id) DO UPDATE SET is_founder = TRUE`,
                            [agent_id, lake_id]
                        );
                        // Track the subscription on the lake so a cancellation can
                        // find it and release the seat.
                        await client.query(
                            `UPDATE lakes SET founder_seat_subscription_id = $1 WHERE id = $2`,
                            [session.subscription, lake_id]
                        );
                        await client.query('COMMIT');
                    } catch (e) {
                        await client.query('ROLLBACK').catch(() => {});
                        console.error('[Stripe Webhook] founder_seat seating failed:', e.message);
                        break;
                    } finally {
                        client.release();
                    }
                    console.log(`[Stripe Webhook] Founder seat: agent ${agent_id} seated on lake ${lake_id}`);
                    logActivity({
                        event_type: 'lake.founder.purchased',
                        event_scope: 'billing',
                        actor: { type: 'stripe', label: 'Stripe' },
                        target: { type: 'lake', id: lake_id, label: 'founder seat' },
                        details: { agent_id, user_id, subscription_id: session.subscription },
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

                // B3: a newly-paying agent auto-claims any held leads on their lakes.
                // AL-03: and transitions to 'paying' (which cancels any pending
                // win-back/dunning for them).
                try {
                    const aid = await pool.query(`SELECT id FROM agents WHERE user_id = $1 LIMIT 1`, [userId]);
                    if (aid.rows[0]) {
                        require('./lead.controller').releaseHeldLeads(aid.rows[0].id);
                        await require('../services/lifecycle').setLifecycleState(aid.rows[0].id, 'paying', 'subscription activated', 'stripe');
                    }
                } catch (e) { console.warn('[Stripe Webhook] releaseHeldLeads/lifecycle failed:', e.message); }

                // "Your profile is live" email — fires once on first payment.
                // Renewals come through invoice.payment_succeeded and don't
                // hit this branch, so this email won't double-send.
                try {
                    const { rows: liveRows } = await pool.query(
                        `SELECT u.email, a.display_name, a.slug
                           FROM agents a
                           JOIN users u ON u.id = a.user_id
                          WHERE a.user_id = $1`,
                        [userId]
                    );
                    if (liveRows[0]?.email) {
                        emailService.sendAgentProfileLive({
                            email:           liveRows[0].email,
                            display_name:    liveRows[0].display_name,
                            slug:            liveRows[0].slug,
                            membership_code: membershipCode,
                        });
                    }
                } catch (e) {
                    console.warn('[Stripe Webhook] sendAgentProfileLive failed:', e.message);
                }

                // B4 (T025): a paying Prime+ subscription flips the agent's
                // Agent Acquisition deal to Won–Paying in HubSpot. Prime+ =
                // Prime (mn_lake_specialist) or Elite (top_agent); Standard
                // (basic) does NOT auto-win. Best-effort — never break checkout.
                try {
                    const TIER_FOR_CODE = { mn_lake_specialist: 'prime', top_agent: 'elite' };
                    const dealTier = TIER_FOR_CODE[membershipCode];
                    if (dealTier) {
                        const { rows: er } = await pool.query(`SELECT email FROM users WHERE id = $1`, [userId]);
                        const agentEmail = er[0]?.email;
                        if (agentEmail) {
                            const r = await hubspot.markAgentAcquisitionWon(agentEmail, { tier: dealTier });
                            console.log(`[Stripe Webhook] Agent Acquisition deal → Won (${dealTier}) for ${agentEmail}:`, r.ok ? r.action : r.reason);
                        }
                    }
                } catch (e) {
                    console.warn('[Stripe Webhook] markAgentAcquisitionWon failed:', e.message);
                }
                break;
            }

            // ── Subscription cancelled — unpublish agent ──
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const subscriptionId = subscription.id;
                await mirrorSubStatus(subscriptionId, 'canceled'); // T074

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
                    // Alert the owner inbox that a business churned.
                    emailService.sendAdminSubscriptionCancelled({
                        kind: 'Business',
                        who: contact?.business_name || `Business ${bizHit.rows[0].id}`,
                        contact: [contact?.full_name, contact?.email].filter(Boolean).join(' · ') || null,
                        subscriptionId,
                    });
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

                // Founder-seat subscriptions live on lakes, not agents — release
                // the seat (clear is_founder + the tracked subscription) if this
                // cancellation matches one.
                const seatHit = await pool.query(
                    `UPDATE lakes SET founder_seat_subscription_id = NULL
                      WHERE founder_seat_subscription_id = $1
                      RETURNING id`,
                    [subscriptionId]
                );
                if (seatHit.rowCount) {
                    const lakeId = seatHit.rows[0].id;
                    await pool.query(`UPDATE agent_lakes SET is_founder = FALSE WHERE lake_id = $1`, [lakeId]);
                    console.log(`[Stripe Webhook] Founder seat released on lake ${lakeId} (subscription canceled)`);
                    // Alert the owner inbox — a founder seat is high-value churn.
                    const { rows: lkRows } = await pool.query(`SELECT name FROM lakes WHERE id = $1`, [lakeId]);
                    emailService.sendAdminSubscriptionCancelled({
                        kind: 'Founder seat',
                        who: lkRows[0]?.name ? `${lkRows[0].name} founder seat` : `Lake ${lakeId}`,
                        contact: null,
                        subscriptionId,
                        note: 'The lake’s founder seat is now open again — its leads fall back to the town lottery until reseated.',
                    });
                    logActivity({
                        event_type: 'lake.founder.canceled',
                        event_scope: 'billing',
                        severity: 'warning',
                        actor: { type: 'stripe', label: 'Stripe' },
                        target: { type: 'lake', id: lakeId, label: 'founder seat' },
                        details: { subscription_id: subscriptionId },
                    });
                    break;
                }

                // Find the agent by their stored subscription ID (+ contact/plan
                // for the admin churn alert).
                const { rows: agentRows } = await pool.query(
                    `SELECT u.id AS user_id, u.full_name, u.email,
                            a.id AS agent_id, a.display_name, a.paid_membership_code, a.tier_comped
                       FROM agents a JOIN users u ON u.id = a.user_id
                      WHERE a.stripe_subscription_id = $1`,
                    [subscriptionId]
                );

                if (agentRows.length === 0) {
                    console.warn(`[Stripe Webhook] No agent found for subscription ${subscriptionId}`);
                    break;
                }

                // A3: cancellation DOWNGRADES to the free plan but KEEPS the
                // public profile live (their listing is what keeps them warm for
                // win-back) — never hide or delete. downgradeAgentToFree skips
                // comped agents and leaves is_published/profile_status untouched,
                // so the profile stays exactly as it was, now on the free tier.
                try {
                    await require('../services/dunning').downgradeAgentToFree(subscriptionId);
                    await require('../services/dunning').resolveDunning(subscriptionId);
                } catch (e) { console.warn('[Stripe Webhook] downgrade-to-free failed:', e.message); }

                console.log(`[Stripe Webhook] Agent ${agentRows[0].user_id} subscription cancelled → downgraded to Free, profile kept live`);
                // Alert the owner inbox that an agent churned.
                {
                    const a = agentRows[0];
                    const PLAN_LABEL = { basic: 'Standard ($9)', mn_lake_specialist: 'Prime ($39)', top_agent: 'Elite ($149)' };
                    emailService.sendAdminSubscriptionCancelled({
                        kind: 'Agent',
                        who: a.display_name || a.full_name || 'An agent',
                        contact: a.email || null,
                        tier: PLAN_LABEL[a.paid_membership_code] || a.paid_membership_code || null,
                        subscriptionId,
                    });
                }
                logActivity({
                    event_type: 'agent.subscription.canceled',
                    event_scope: 'billing',
                    severity: 'warning',
                    actor: { type: 'stripe', label: 'Stripe' },
                    target: { type: 'user', id: agentRows[0].user_id, label: 'agent' },
                    details: { subscription_id: subscriptionId },
                });
                // Churn handling — skip comped agents (never billed), and skip any
                // subscription cancelled before its first invoice (an abandoned
                // checkout is not a churn: no churned state, no win-back, no "what
                // would we have had to do to stay"). Defaults to treating it as paid
                // if the payments lookup errors, so a real churn is never dropped.
                if (!agentRows[0].tier_comped) {
                    const a = agentRows[0];
                    const paid = await pool.query(
                        `SELECT 1 FROM payments WHERE user_id = $1 AND status = 'paid' LIMIT 1`, [a.user_id])
                        .then(r => r.rowCount > 0).catch(() => true);
                    if (paid) {
                        // AL-03: → churned (win-back.js owns this state once slice-2 sweeps flip).
                        await require('../services/lifecycle').setLifecycleState(a.agent_id, 'churned', 'subscription canceled', 'stripe');
                        require('../services/win-back').enqueueWinBack({
                            userId: a.user_id, agentId: a.agent_id, email: a.email,
                            name: a.display_name || a.full_name,
                        }).catch(e => console.warn('[win-back enqueue]', e.message));

                        // AL-13 — exit survey. Auto-capture the churn reason Stripe already
                        // collected in its cancel flow, then send the one-question survey from
                        // the owner's address. exit_survey_response fills from the reply.
                        const cd = subscription.cancellation_details || {};
                        const churnReason = [cd.feedback, cd.comment].filter(Boolean).join(' — ') || null;
                        pool.query(`UPDATE agents SET churn_reason = $1 WHERE id = $2`, [churnReason, a.agent_id])
                            .catch(e => console.warn('[exit-survey] churn_reason save failed:', e.message));
                        try {
                            emailService.sendAgentExitSurvey({ to: a.email, first_name: (a.display_name || a.full_name || '').split(' ')[0] });
                        } catch (e) { console.warn('[exit-survey] send failed:', e.message); }
                    }
                }
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
                // T074: mirror the current Stripe status to HubSpot. past_due →
                // past_due, canceled → canceled, everything else billable
                // (active/trialing) → active.
                await mirrorSubStatus(sub.id,
                    sub.status === 'past_due' ? 'past_due'
                    : sub.status === 'canceled' ? 'canceled'
                    : 'active');
                // Recovered to a billable state → cancel any in-flight dunning (A3).
                if (sub.status === 'active' || sub.status === 'trialing') {
                    try { await require('../services/dunning').resolveDunning(sub.id); } catch (_) {}
                }

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
                await mirrorSubStatus(invoice.subscription, 'past_due'); // T074
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
                // Agent — start (or continue) the fixed day-0/3/7 dunning
                // sequence (A3). enqueueDunning is idempotent per subscription,
                // so Stripe's repeated retry webhooks don't re-trigger it; the
                // day-0 email fires immediately, day 3 and 7 via the sweep, and
                // day 7 downgrades to Free while keeping the public profile.
                console.log(`[Stripe Webhook] Agent invoice.payment_failed for subscription ${invoice.subscription}`);
                const agentRow = await pool.query(
                    `SELECT a.id AS agent_id, a.user_id, a.display_name, u.email
                       FROM agents a JOIN users u ON u.id = a.user_id
                      WHERE a.stripe_subscription_id = $1 LIMIT 1`,
                    [invoice.subscription]
                );
                if (agentRow.rowCount) {
                    const ag = agentRow.rows[0];
                    logActivity({
                        event_type: 'agent.payment.failed',
                        event_scope: 'billing',
                        severity: 'warning',
                        actor: { type: 'stripe', label: 'Stripe' },
                        target: { type: 'user', id: ag.user_id, label: ag.display_name || 'agent' },
                        details: { subscription_id: invoice.subscription, amount_due: invoice.amount_due, attempt: invoice.attempt_count },
                    });
                    try {
                        await require('../services/dunning').enqueueDunning({
                            agentId: ag.agent_id, userId: ag.user_id, email: ag.email, subscriptionId: invoice.subscription,
                        });
                    } catch (e) { console.warn('[Stripe Webhook] enqueueDunning failed:', e.message); }
                    // AL-03: payment failing → at_risk (dunning.js owns this state).
                    await require('../services/lifecycle').setLifecycleState(ag.agent_id, 'at_risk', 'payment failed', 'stripe');
                    // In-app notification centre (#11) — once, on first failure.
                    try {
                        require('../services/agent-notify').notifyAgent(ag.agent_id, {
                            type: 'billing',
                            title: 'Payment issue — update your card',
                            body: 'Your renewal payment was declined. Update your payment method to keep your placement.',
                            link: '?view=account',
                        });
                    } catch (_) {}
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
                await mirrorSubStatus(invoice.subscription, 'active'); // T074
                // Payment recovered → stop any in-flight dunning sequence (A3).
                try { await require('../services/dunning').resolveDunning(invoice.subscription); } catch (_) {}
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
                      RETURNING id AS agent_id, user_id`,
                    [invoice.subscription]
                );
                // AL-03: a successful charge means paying. No-op for a normal renewal
                // (already paying); on a recovery it flips at_risk→paying and cancels
                // the in-flight dunning/win-back queues (see setLifecycleState).
                if (agentRes.rowCount) {
                    await require('../services/lifecycle').setLifecycleState(agentRes.rows[0].agent_id, 'paying', 'payment succeeded', 'stripe');
                }
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

            // ── Subscription created (A1) ──
            // Activation is fully handled by checkout.session.completed; this
            // is a belt-and-suspenders backfill of the stored IDs + an 'active'
            // mirror, and makes the event explicitly handled (not a silent ack).
            case 'customer.subscription.created': {
                const sub = event.data.object;
                await mirrorSubStatus(sub.id, sub.status === 'trialing' || sub.status === 'active' ? 'active' : sub.status);
                console.log(`[Stripe Webhook] subscription.created ${sub.id} (${sub.status})`);
                break;
            }

            // ── Trial ending soon (A1) ──
            // Fires ~3 days before a trial converts. Nudge the agent to confirm
            // their card so they don't lapse the moment the trial ends.
            case 'customer.subscription.trial_will_end': {
                const sub = event.data.object;
                try {
                    const r = await pool.query(
                        `SELECT a.id AS agent_id, a.display_name, u.email
                           FROM agents a JOIN users u ON u.id = a.user_id
                          WHERE a.stripe_subscription_id = $1 LIMIT 1`, [sub.id]);
                    if (r.rows[0]) {
                        const ag = r.rows[0];
                        const when = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
                        emailService.sendEmail({
                            to: ag.email,
                            subject: 'Your MN Lake Homes trial is ending soon',
                            html: emailService.layout({
                                title: `Heads up${ag.display_name ? ', ' + ag.display_name.split(' ')[0] : ''} — your trial ends soon`,
                                preheader: 'Confirm your card so your leads and placement continue.',
                                body: `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#2d3748;">Your free trial${when ? ` ends on <strong>${when.toLocaleDateString('en-US',{month:'long',day:'numeric'})}</strong>` : ' is ending soon'}. To keep receiving matched leads and your featured placement without interruption, just make sure a valid card is on file.</p>`,
                                ctaText: 'Review my billing',
                                ctaUrl: `${process.env.SITE_URL || 'https://minnesotalakehomesforsale.com'}/pages/agent/dashboard.html`,
                            })
                        });
                        require('../services/agent-notify').notifyAgent(ag.agent_id, {
                            type: 'billing', title: 'Your trial is ending soon',
                            body: 'Confirm your card so your leads and placement continue.', link: '?view=account',
                        });
                    }
                } catch (e) { console.warn('[Stripe Webhook] trial_will_end handling failed:', e.message); }
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
