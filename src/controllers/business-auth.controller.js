/**
 * business-auth.controller.js — self-service auth for business owners.
 *
 *   POST /api/business-auth/signup
 *     Creates a user (role='business_owner') + linked businesses row
 *     (status='draft') and returns a Stripe Checkout URL. Listing only
 *     goes public after admin flips status → 'active' AND Stripe webhook
 *     sets subscription_status='active'.
 *
 *   POST /api/business-auth/checkout
 *     Re-creates a Checkout session for an existing owner (e.g. they
 *     cancelled the first redirect). Auth-required.
 *
 *   POST /api/business-auth/portal
 *     Hands the owner a Stripe Customer Portal link — cancel, update
 *     card, receipts all happen there. Auth-required.
 *
 *   POST /api/business-auth/change-password
 *     Owner rotates their own password. Auth-required.
 *
 *   GET  /api/business-auth/me
 *     Returns the caller's business row (the dashboard bootstraps from this).
 */

const pool     = require('../database/pool');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const { logActivity } = require('../services/activity-log');

let _stripe = null;
function getStripe() {
    if (_stripe) return _stripe;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return null;
    _stripe = require('stripe')(key);
    return _stripe;
}

const BIZ_PRICE_ID = () => process.env.STRIPE_PRICE_BUSINESS_MONTHLY;

function setCookie(res, token) {
    res.cookie('auth_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 86_400_000,
    });
}

function slugify(s) {
    return String(s || '')
        .trim().toLowerCase().normalize('NFKD')
        .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
        .slice(0, 160);
}

const KNOWN_TYPES = new Set([
    'restaurant', 'marina', 'service', 'photographer',
    'builder', 'boat_rental', 'outdoor_recreation', 'other',
]);

async function createCheckoutForBusiness(businessId, customerEmail, existingStripeCustomerId) {
    const stripe  = getStripe();
    const priceId = BIZ_PRICE_ID();
    if (!stripe)  throw new Error('Stripe is not configured on this server.');
    if (!priceId || priceId.startsWith('price_STUB')) {
        throw new Error('Business plan price ID not configured — set STRIPE_PRICE_BUSINESS_MONTHLY.');
    }
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        // Reuse the customer if we already have one — keeps receipts/history
        // under one Stripe customer across multiple subscribes.
        ...(existingStripeCustomerId
            ? { customer: existingStripeCustomerId }
            : { customer_email: customerEmail }),
        client_reference_id: businessId,
        metadata: { kind: 'business', business_id: businessId },
        subscription_data: { metadata: { kind: 'business', business_id: businessId } },
        success_url: `${baseUrl}/business/dashboard?paid=1`,
        cancel_url:  `${baseUrl}/business/dashboard?paid=0`,
    });
    return session.url;
}

// ─── POST /signup ──────────────────────────────────────────────────────────
exports.signup = async (req, res) => {
    const client = await pool.connect();
    try {
        let { email, password, business_name, business_type, display_name } = req.body || {};
        email         = String(email || '').trim().toLowerCase();
        password      = String(password || '');
        business_name = String(business_name || '').trim().slice(0, 200);
        business_type = String(business_type || '').trim().toLowerCase().slice(0, 40);
        display_name  = String(display_name || '').trim() || business_name;

        if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }
        if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        if (!business_name)      return res.status(400).json({ error: 'Business name is required.' });
        if (!KNOWN_TYPES.has(business_type)) {
            return res.status(400).json({ error: 'Business type is required.' });
        }

        await client.query('BEGIN');

        const dup = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        if (dup.rowCount) throw Object.assign(new Error('An account with that email already exists.'), { code: 'DUP_EMAIL' });

        const hash = await bcrypt.hash(password, 10);
        const firstName = display_name.split(' ')[0];
        const lastName  = display_name.split(' ').slice(1).join(' ') || '';

        const userRes = await client.query(
            `INSERT INTO users (first_name, last_name, full_name, email, password_hash, role, account_status)
             VALUES ($1, $2, $3, $4, $5, 'business_owner', 'active') RETURNING id`,
            [firstName, lastName, display_name, email, hash]
        );
        const userId = userRes.rows[0].id;

        // Slug: append short random suffix on collision rather than 409'ing.
        let slug = slugify(`${business_type}-${business_name}`);
        if (!slug) slug = `business-${Date.now()}`;
        const slugExists = await client.query('SELECT 1 FROM businesses WHERE slug = $1', [slug]);
        if (slugExists.rowCount) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

        // New owner signups land in 'pending' so they show up in the
        // admin approval queue automatically — no separate "submit for
        // review" step. Admin flips to 'active' once the profile looks
        // good and Stripe has confirmed payment.
        const bizRes = await client.query(
            `INSERT INTO businesses
               (user_id, slug, name, type, state, status, subscription_status)
             VALUES ($1, $2, $3, $4, 'MN', 'pending', 'unpaid')
             RETURNING id, slug`,
            [userId, slug, business_name, business_type]
        );
        const biz = bizRes.rows[0];

        await client.query('COMMIT');

        // Sign them in immediately so the dashboard loads without a
        // separate login step after Stripe returns.
        const token = jwt.sign({ userId, role: 'business_owner' }, process.env.JWT_SECRET, { expiresIn: '24h' });
        setCookie(res, token);

        logActivity({
            event_type: 'business_owner.signup',
            event_scope: 'business',
            actor: { type: 'user', id: userId, label: email },
            target: { type: 'business', id: biz.id, label: `${business_name} (${business_type})` },
            req,
        });

        // Try to produce a Checkout URL. If Stripe isn't set up yet, we
        // still return success — the dashboard will show a "finish
        // checkout" nudge when the owner lands.
        let checkoutUrl = null;
        let checkoutError = null;
        try {
            checkoutUrl = await createCheckoutForBusiness(biz.id, email, null);
        } catch (err) {
            checkoutError = err.message;
        }
        res.status(201).json({
            success: true,
            business: { id: biz.id, slug: biz.slug },
            checkout_url: checkoutUrl,
            checkout_error: checkoutError,
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        if (err.code === 'DUP_EMAIL' || err.code === '23505') {
            return res.status(409).json({ error: err.message || 'That email is already in use.' });
        }
        console.error('[business-auth.signup]', err.message);
        res.status(500).json({ error: 'Could not create your account. Please try again.' });
    } finally {
        client.release();
    }
};

async function fetchOwnerBusiness(userId) {
    const { rows } = await pool.query(
        `SELECT id, slug, name, type, description, phone, email, website_url,
                instagram_url, facebook_url,
                address, city, state, zip, latitude, longitude, hours, price_range,
                featured_image_url, status, user_id,
                stripe_customer_id, stripe_subscription_id, subscription_status,
                created_at, updated_at
         FROM businesses WHERE user_id = $1 LIMIT 1`,
        [userId]
    );
    return rows[0] || null;
}

// ─── GET /me ───────────────────────────────────────────────────────────────
exports.me = async (req, res) => {
    if (!req.user || req.user.role !== 'business_owner') {
        return res.status(403).json({ error: 'Business-owner access only.' });
    }
    try {
        const biz = await fetchOwnerBusiness(req.user.userId);
        if (!biz) return res.status(404).json({ error: 'No business is linked to this account.' });
        res.json(biz);
    } catch (err) {
        console.error('[business-auth.me]', err.message);
        res.status(500).json({ error: 'Failed to load your business.' });
    }
};

// ─── POST /checkout ────────────────────────────────────────────────────────
exports.checkout = async (req, res) => {
    if (!req.user || req.user.role !== 'business_owner') {
        return res.status(403).json({ error: 'Business-owner access only.' });
    }
    try {
        const biz = await fetchOwnerBusiness(req.user.userId);
        if (!biz) return res.status(404).json({ error: 'No business found for your account.' });
        const emailRes = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.userId]);
        const url = await createCheckoutForBusiness(biz.id, emailRes.rows[0]?.email, biz.stripe_customer_id);
        res.json({ url });
    } catch (err) {
        console.error('[business-auth.checkout]', err.message);
        res.status(500).json({ error: err.message || 'Could not start checkout.' });
    }
};

// ─── POST /portal ──────────────────────────────────────────────────────────
exports.portal = async (req, res) => {
    if (!req.user || req.user.role !== 'business_owner') {
        return res.status(403).json({ error: 'Business-owner access only.' });
    }
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(503).json({ error: 'Stripe is not configured on this server.' });
        const biz = await fetchOwnerBusiness(req.user.userId);
        if (!biz?.stripe_customer_id) {
            return res.status(400).json({ error: 'No Stripe customer yet — complete checkout first.' });
        }
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const session = await stripe.billingPortal.sessions.create({
            customer:   biz.stripe_customer_id,
            return_url: `${baseUrl}/business/dashboard`,
        });
        res.json({ url: session.url });
    } catch (err) {
        console.error('[business-auth.portal]', err.message);
        res.status(500).json({ error: 'Could not open billing portal.' });
    }
};

// ─── POST /change-password ─────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in.' });
    try {
        const { current_password, new_password } = req.body || {};
        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Current and new password are required.' });
        }
        if (String(new_password).length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters.' });
        }
        const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.userId]);
        if (!rows.length) return res.status(404).json({ error: 'User not found.' });
        const ok = await bcrypt.compare(current_password, rows[0].password_hash);
        if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
        const hash = await bcrypt.hash(new_password, 10);
        await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('[business-auth.changePassword]', err.message);
        res.status(500).json({ error: 'Could not change password.' });
    }
};

// ─── PATCH /me  — owner edits their own profile ────────────────────────────
// Mirrors businesses.controller.patch but constrains to owner-editable
// fields. Status / stripe_* / user_id are admin-only and stripped here.
exports.updateMe = async (req, res) => {
    if (!req.user || req.user.role !== 'business_owner') {
        return res.status(403).json({ error: 'Business-owner access only.' });
    }
    try {
        const biz = await fetchOwnerBusiness(req.user.userId);
        if (!biz) return res.status(404).json({ error: 'No business found for your account.' });

        const editable = [
            'name','description','phone','email','website_url','instagram_url','facebook_url',
            'address','city','state','zip','hours','price_range','featured_image_url',
        ];
        const fields = [];
        const vals = [];
        let i = 1;
        for (const col of editable) {
            if (col in req.body) {
                let v = req.body[col];
                if (typeof v === 'string') v = v.trim();
                if (col === 'state') v = String(v || 'MN').slice(0, 2).toUpperCase();
                if (col === 'name' && !v) return res.status(400).json({ error: 'Name cannot be empty.' });
                fields.push(`${col} = $${i++}`);
                vals.push(v || null);
            }
        }
        if (!fields.length) return res.json({ success: true, noop: true });
        fields.push(`updated_at = NOW()`);
        vals.push(biz.id);
        const { rows } = await pool.query(
            `UPDATE businesses SET ${fields.join(', ')} WHERE id = $${i} RETURNING id`,
            vals
        );
        logActivity({
            event_type: 'business.owner_update',
            event_scope: 'business',
            actor: { type: 'user', id: req.user.userId, label: req.user.role },
            target: { type: 'business', id: rows[0]?.id, label: biz.name },
            details: { changed: Object.keys(req.body) },
            req,
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[business-auth.updateMe]', err.message);
        res.status(500).json({ error: 'Could not save changes.' });
    }
};
