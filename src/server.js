const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');

// Determine Environment file (Default: Local)
const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.local';
require('dotenv').config({ path: envFile });

const app = express();

// ==========================================
// MIDDLEWARE
// ==========================================
// Security & Formatting
app.use(helmet({
    contentSecurityPolicy: false, // Temporarily disabled to allow inline scripts from existing UI prototypes
}));

// Permissive CORS — this is a staging/admin environment with no auth walls.
// Previous config rejected requests from any origin except http://localhost:3000
// unless ALLOWED_ORIGINS was set, which silently broke every POST/PATCH/DELETE
// on the live site because browsers send Origin headers for non-GET requests.
app.use(cors({
    origin: true,       // reflect the request origin (effectively 'accept any')
    credentials: true
}));

// Stripe webhook needs the raw body for signature verification — must come BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// ==========================================
// API ROUTES (Backend Node/Postgres Engine)
// ==========================================
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/agents', require('./routes/agent.routes'));
// More-specific /api/admin/cash-offers must mount BEFORE the general /api/admin
// router, which has a catch-all /:id route that would otherwise shadow us.
app.use('/api/admin/cash-offers', require('./routes/admin-cash-offer.routes'));
app.use('/api/admin/cash-offer-partners', require('./routes/admin-cash-offer-partner.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/leads', require('./routes/lead.routes'));
app.use('/api/blog', require('./routes/blog.routes'));
app.use('/api/tasks', require('./routes/task.routes'));
app.use('/api/stripe', require('./routes/stripe.routes'));
app.use('/api/inquiries', require('./routes/inquiry.routes'));
app.use('/api/assistant', require('./routes/assistant.routes'));
app.use('/api/activity', require('./routes/activity.routes'));
app.use('/api/cash-offer', require('./routes/cash-offer.routes'));
app.use('/api/tags', require('./routes/tag.routes'));
app.use('/api/lakes', require('./routes/lake.routes'));
app.use('/api/businesses',     require('./routes/business.routes'));
app.use('/api/business-auth',  require('./routes/business-auth.routes'));
app.use('/api/resources', require('./routes/resource.routes'));
app.use('/api/marketing', require('./routes/marketing.routes'));

app.get('/api/health', (req, res) => {
    res.json({
        status: 'live',
        environment: process.env.NODE_ENV || 'local',
        deploy_time: process.env.RENDER_DEPLOY_TIME || new Date().toISOString(),
        commit: process.env.RENDER_GIT_COMMIT || 'unknown',
        node: process.version
    });
});

// ─── /api/analytics/conversion ──────────────────────────────────────────────
// Public mirror of every conversion event fired by trackConversion() on
// the frontend. GA4 + HubSpot already see the event via their own pixels;
// this just appends a row to conversion_events so the admin can show
// counts and a feed without querying external APIs. Always returns 204
// — never lets analytics failures surface to the visitor.
app.post('/api/analytics/conversion', async (req, res) => {
    const pool = require('./database/pool');
    res.status(204).end(); // ack immediately, never block the page
    try {
        const b = req.body || {};
        const event_name = String(b.event_name || '').trim().slice(0, 60);
        if (!event_name) return;
        const form_name = b.params?.form_name ? String(b.params.form_name).slice(0, 80) : null;
        await pool.query(
            `INSERT INTO conversion_events
                (event_name, form_name, params, path, referrer, session_id, ua)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                event_name,
                form_name,
                b.params || null,
                b.path ? String(b.path).slice(0, 1000) : null,
                b.referrer ? String(b.referrer).slice(0, 1000) : null,
                b.session_id ? String(b.session_id).slice(0, 80) : null,
                (req.headers['user-agent'] || '').slice(0, 500),
            ]
        );
    } catch (err) {
        console.error('[analytics.conversion]', err.message);
    }
});

// ─── /api/site-images ───────────────────────────────────────────────────────
// Public, cached. Returns the override map { original_src: override_url }
// for every site_images row that has an override set. The frontend
// resolver in components/components.js reads this once per session and
// swaps any matching <img src> / background-image at page load.
app.get('/api/site-images', async (req, res) => {
    const pool = require('./database/pool');
    res.set('Cache-Control', 'public, max-age=120'); // 2 min — short so admin edits show up quickly
    try {
        const { rows } = await pool.query(
            `SELECT original_src, override_url
               FROM site_images
              WHERE override_url IS NOT NULL AND override_url <> ''`
        );
        const map = {};
        for (const r of rows) map[r.original_src] = r.override_url;
        res.json(map);
    } catch (err) {
        console.error('[site-images.public]', err.message);
        res.json({}); // never fail — pages should keep rendering originals
    }
});

// ─── /api/config/public ─────────────────────────────────────────────────────
// Single source of truth for public, safe-to-expose env values + tunables
// the frontend needs (GA4/HubSpot tracking pixels, Search Console meta tag,
// the Google Places autocomplete key, signup tunables). Missing env values
// just disable that particular feature — the page still loads. Merged from
// what used to be two handlers; Express runs the first match, so a duplicate
// further down silently shadowed the Places key and broke address search.
app.get('/api/config/public', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');

    let signupMaxServiceAreas = 10;
    try {
        const pool = require('./database/pool');
        const { rows } = await pool.query(
            `SELECT value FROM app_config WHERE key = 'signup_max_service_areas'`
        );
        const n = Number(rows[0]?.value);
        if (Number.isFinite(n) && n > 0) signupMaxServiceAreas = Math.floor(n);
    } catch (_) { /* degrade to default */ }

    res.json({
        ga4_id:               process.env.GA4_MEASUREMENT_ID    || null,
        hubspot_portal_id:    process.env.HUBSPOT_PORTAL_ID     || null,
        gsc_verification:     process.env.GSC_VERIFICATION      || null,
        environment:          process.env.NODE_ENV              || 'local',
        googlePlacesKey:      process.env.GOOGLE_PLACES_API_KEY || '',
        signupMaxServiceAreas,
    });
});

// /api/_diagnostic — quick test of DB connectivity and schema
app.get('/api/_diagnostic', async (req, res) => {
    const pool = require('./database/pool');
    const out = { status: 'ok', checks: {} };
    try {
        const t = await pool.query(`SELECT 1 AS ok`);
        out.checks.db_connection = t.rows[0].ok === 1 ? 'pass' : 'fail';
    } catch (e) { out.checks.db_connection = `fail: ${e.message}`; out.status = 'degraded'; }

    for (const table of ['leads', 'agents', 'users', 'blog_posts', 'admin_tasks']) {
        try {
            const r = await pool.query(`SELECT COUNT(*) AS c FROM ${table}`);
            out.checks[`table_${table}`] = `ok (${r.rows[0].c} rows)`;
        } catch (e) {
            out.checks[`table_${table}`] = `missing: ${e.message}`;
            out.status = 'degraded';
        }
    }

    try {
        const r = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'leads' ORDER BY ordinal_position
        `);
        out.checks.leads_columns = r.rows.map(x => x.column_name);
    } catch (e) { out.checks.leads_columns = `error: ${e.message}`; }

    // Cloudinary health check — verifies env vars are loaded AND credentials work
    out.checks.cloudinary_env = {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'set' : 'MISSING',
        api_key:    process.env.CLOUDINARY_API_KEY    ? 'set' : 'MISSING',
        api_secret: process.env.CLOUDINARY_API_SECRET ? 'set' : 'MISSING',
    };
    try {
        const cloudinary = require('cloudinary').v2;
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key:    process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
            secure:     true,
        });
        const ping = await cloudinary.api.ping();
        out.checks.cloudinary_ping = ping.status === 'ok' ? 'pass' : `fail: ${JSON.stringify(ping)}`;
    } catch (e) {
        out.checks.cloudinary_ping = `fail: ${e.message || e}`;
        out.status = 'degraded';
    }

    // Stripe health check — reports which env vars the running process
    // actually sees, plus a live API ping. Makes "Stripe is not configured"
    // debuggable without tailing logs.
    const stripeKey = process.env.STRIPE_SECRET_KEY || '';
    // Show the actual Stripe price ID stored in each env var (price IDs
    // are not secrets — they show up in Stripe Checkout URLs). Lets us see
    // at a glance which env vars are pointing where, including whether
    // any are stuck on archived/legacy IDs.
    const priceHint = (v) => {
        const s = String(v || '').trim();
        if (!s) return 'MISSING';
        return s.length > 24 ? `${s.slice(0, 24)}… (${s.length} chars)` : s;
    };
    out.checks.stripe_env = {
        STRIPE_SECRET_KEY:              stripeKey ? `set (${stripeKey.slice(0, 8)}…, ${stripeKey.length} chars)` : 'MISSING',
        STRIPE_WEBHOOK_SECRET:          process.env.STRIPE_WEBHOOK_SECRET ? 'set' : 'MISSING',
        STRIPE_PRICE_BUSINESS_MONTHLY:  priceHint(process.env.STRIPE_PRICE_BUSINESS_MONTHLY),
        STRIPE_PRICE_BUSINESS_BASIC_MONTHLY: priceHint(process.env.STRIPE_PRICE_BUSINESS_BASIC_MONTHLY),
        STRIPE_PRICE_BUSINESS_BASIC_ANNUAL:  priceHint(process.env.STRIPE_PRICE_BUSINESS_BASIC_ANNUAL),
        STRIPE_PRICE_BUSINESS_PREMIUM_MONTHLY: priceHint(process.env.STRIPE_PRICE_BUSINESS_PREMIUM_MONTHLY),
        STRIPE_PRICE_BUSINESS_PREMIUM_ANNUAL:  priceHint(process.env.STRIPE_PRICE_BUSINESS_PREMIUM_ANNUAL),
        STRIPE_PRICE_STANDARD_MONTHLY:  priceHint(process.env.STRIPE_PRICE_STANDARD_MONTHLY),
        STRIPE_PRICE_STANDARD_ANNUAL:   priceHint(process.env.STRIPE_PRICE_STANDARD_ANNUAL),
        STRIPE_PRICE_PRIME_MONTHLY:     priceHint(process.env.STRIPE_PRICE_PRIME_MONTHLY),
        STRIPE_PRICE_PRIME_ANNUAL:      priceHint(process.env.STRIPE_PRICE_PRIME_ANNUAL),
        STRIPE_PRICE_FOUNDER_MONTHLY:   priceHint(process.env.STRIPE_PRICE_FOUNDER_MONTHLY),
        STRIPE_PRICE_FOUNDER_ANNUAL:    priceHint(process.env.STRIPE_PRICE_FOUNDER_ANNUAL),
        BASE_URL:                       process.env.BASE_URL || 'MISSING (falls back to localhost:3000)',
    };
    try {
        if (!stripeKey) {
            out.checks.stripe_ping = 'skipped — STRIPE_SECRET_KEY is MISSING';
            out.status = 'degraded';
        } else {
            const stripe = require('stripe')(stripeKey);
            // Cheap call: list 1 product to confirm the key is valid + authorized.
            await stripe.products.list({ limit: 1 });
            out.checks.stripe_ping = `pass (mode: ${stripeKey.startsWith('sk_live_') ? 'live' : 'test'})`;
        }
    } catch (e) {
        out.checks.stripe_ping = `fail: ${e.message || e}`;
        out.status = 'degraded';
    }

    // Email transport — matches the selection logic in services/email.js
    out.checks.email_transport =
        (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ? `gmail-smtp (${process.env.GMAIL_USER})` :
        process.env.RESEND_API_KEY ? 'resend' :
        'NONE — set GMAIL_USER+GMAIL_APP_PASSWORD or RESEND_API_KEY';

    // HubSpot — verifies env vars are loaded AND credentials work.
    out.checks.hubspot_env = {
        HUBSPOT_ACCESS_TOKEN: process.env.HUBSPOT_ACCESS_TOKEN ? 'set' : 'MISSING',
        HUBSPOT_PORTAL_ID:    process.env.HUBSPOT_PORTAL_ID    || 'MISSING',
        HUBSPOT_REGION:       process.env.HUBSPOT_REGION       || 'na2 (default)',
        HUBSPOT_ENABLE_SYNC:  process.env.HUBSPOT_ENABLE_SYNC  || 'true (default)',
    };
    try {
        const hubspot = require('./services/hubspot');
        if (!hubspot.isConfigured()) {
            out.checks.hubspot_ping = 'skipped — HUBSPOT_ACCESS_TOKEN/PORTAL_ID missing';
        } else {
            const r = await hubspot.ping();
            out.checks.hubspot_ping = r.ok
                ? 'pass'
                : `fail: ${r.reason || 'unknown'}${r.status ? ` (${r.status})` : ''}`;
            if (!r.ok) out.status = 'degraded';
        }
    } catch (e) {
        out.checks.hubspot_ping = `fail: ${e.message || e}`;
        out.status = 'degraded';
    }

    res.json(out);
});

// Global API error handler — guarantees JSON responses for /api routes
// (instead of Express's default HTML error page which makes fetches fail silently)
app.use('/api', (err, req, res, next) => {
    console.error(`[API Error] ${req.method} ${req.originalUrl}:`, err.message);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({
        error: err.message || 'Unexpected server error.',
        path: req.originalUrl,
        method: req.method
    });
});

// (Removed duplicate /api/config/public handler — merged into the one
//  above so the frontend actually receives googlePlacesKey + the signup
//  tunables alongside the tracking IDs.)

// ==========================================
// STATIC FRONTEND DELIVERY
// ==========================================
// Serve the existing HTML/CSS UI layer exactly as it was.
const PROJECT_ROOT = path.join(__dirname, '..');

// Permanent redirect from the hand-authored Lake Minnetonka page to its
// dynamic /lakes/<slug> replacement. Preserves SEO juice and any bookmarks
// that pointed at the old pages/public/... URL (which was the canonical
// before the Lakes system existed).
app.get('/pages/public/lake-minnetonka.html', (req, res) => {
    res.redirect(301, '/lakes/lake-minnetonka');
});

// ─── /api/analytics/track ─────────────────────────────────────────────────
// Single-table pageview log. Fire-and-forget: any DB error is swallowed
// so a transient issue doesn't break the visitor's request. We hash the
// IP+UA rather than store them raw to keep the table privacy-friendly
// (no PII, no cookies). The admin dashboard reads counts from this.
app.post('/api/analytics/track', async (req, res) => {
    try {
        const b = req.body || {};
        const path = String(b.path || '').slice(0, 500) || '/';
        const referrer = b.referrer ? String(b.referrer).slice(0, 500) : null;
        const ua = String(req.headers['user-agent'] || '').slice(0, 300) || null;
        const session_id = b.session_id ? String(b.session_id).slice(0, 60) : null;
        // Drop obvious crawler traffic so our own counts aren't inflated.
        if (ua && /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|twitterbot|linkedinbot|applebot|headlesschrome/i.test(ua)) {
            return res.status(204).end();
        }
        // Don't log admin/auth/API paths — they're not interesting
        // marketing-side, and 99% of them come from the admin browsing
        // their own site while signed in.
        if (/^\/(pages\/admin|api|business\/dashboard|admin)\b/.test(path)) {
            return res.status(204).end();
        }
        const crypto = require('crypto');
        const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
        const visitorHash = crypto.createHash('sha256').update(ip + '|' + (ua || '')).digest('hex').slice(0, 24);
        await pool.query(
            `INSERT INTO page_views (path, referrer, visitor_hash, ua, session_id) VALUES ($1,$2,$3,$4,$5)`,
            [path, referrer, visitorHash, ua, session_id]
        );
        res.status(204).end();
    } catch (err) {
        // Never surface analytics failures to the client
        res.status(204).end();
    }
});

// ─── /api/analytics/summary ───────────────────────────────────────────────
// Admin-only overview for the metrics dashboard. Returns pageviews +
// top pages + top referrers + daily counts, plus the lead/inquiry/
// signup counts the admin actually cares about.
app.get('/api/analytics/summary', async (req, res) => {
    // Lightweight inline auth — same as other admin endpoints: require
    // a verified admin JWT, otherwise bail.
    try {
        const jwt = require('jsonwebtoken');
        let token = req.cookies?.auth_session;
        if (!token && req.headers.authorization?.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (!token) return res.status(401).json({ error: 'Not logged in.' });
        const user = jwt.verify(token, process.env.JWT_SECRET);
        if (!['admin', 'super_admin'].includes(user.role)) {
            return res.status(403).json({ error: 'Admin only.' });
        }
    } catch (_) {
        return res.status(401).json({ error: 'Invalid session.' });
    }

    try {
        const since7  = `NOW() - INTERVAL '7 days'`;
        const since30 = `NOW() - INTERVAL '30 days'`;

        const [totals7, totals30, topPages, topReferrers, daily, leads, inquiries, newBiz, newAgents] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS views, COUNT(DISTINCT visitor_hash)::int AS visitors FROM page_views WHERE created_at > ${since7}`),
            pool.query(`SELECT COUNT(*)::int AS views, COUNT(DISTINCT visitor_hash)::int AS visitors FROM page_views WHERE created_at > ${since30}`),
            pool.query(`SELECT path, COUNT(*)::int AS views FROM page_views WHERE created_at > ${since30} GROUP BY path ORDER BY views DESC LIMIT 15`),
            pool.query(`
                SELECT COALESCE(NULLIF(SUBSTRING(referrer FROM '^https?://([^/]+)'), ''), 'direct') AS host,
                       COUNT(*)::int AS views
                FROM page_views
                WHERE created_at > ${since30}
                  AND (referrer IS NULL
                       OR referrer NOT LIKE 'https://minnesotalakehomesforsale.com%'
                       AND referrer NOT LIKE 'http://minnesotalakehomesforsale.com%'
                       AND referrer NOT LIKE 'https://www.minnesotalakehomesforsale.com%')
                GROUP BY host ORDER BY views DESC LIMIT 10`),
            pool.query(`
                SELECT date_trunc('day', created_at)::date AS day,
                       COUNT(*)::int AS views,
                       COUNT(DISTINCT visitor_hash)::int AS visitors
                FROM page_views
                WHERE created_at > ${since30}
                GROUP BY day
                ORDER BY day ASC`),
            pool.query(`SELECT COUNT(*)::int AS c7, (SELECT COUNT(*)::int FROM leads WHERE submitted_at > ${since30} AND deleted_at IS NULL) AS c30 FROM leads WHERE submitted_at > ${since7} AND deleted_at IS NULL`),
            pool.query(`SELECT COUNT(*)::int AS c7, (SELECT COUNT(*)::int FROM contact_inquiries WHERE created_at > ${since30} AND deleted_at IS NULL) AS c30 FROM contact_inquiries WHERE created_at > ${since7} AND deleted_at IS NULL`),
            pool.query(`SELECT COUNT(*)::int AS c7, (SELECT COUNT(*)::int FROM businesses WHERE created_at > ${since30}) AS c30 FROM businesses WHERE created_at > ${since7}`),
            pool.query(`SELECT COUNT(*)::int AS c7, (SELECT COUNT(*)::int FROM agents WHERE created_at > ${since30} AND deleted_at IS NULL) AS c30 FROM agents WHERE created_at > ${since7} AND deleted_at IS NULL`),
        ]);

        res.json({
            views_7d:    totals7.rows[0],
            views_30d:   totals30.rows[0],
            top_pages:   topPages.rows,
            top_referrers: topReferrers.rows,
            daily:       daily.rows,
            leads:       leads.rows[0],
            inquiries:   inquiries.rows[0],
            new_businesses: newBiz.rows[0],
            new_agents:  newAgents.rows[0],
        });
    } catch (err) {
        console.error('[analytics.summary]', err.message);
        res.status(500).json({ error: 'Failed to load analytics.' });
    }
});

// ─── /robots.txt ──────────────────────────────────────────────────────────
// Open to all crawlers for public content; blocks admin + auth + API paths
// that shouldn't appear in search results. Points at the dynamic sitemap.
app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(
`User-agent: *
Allow: /

# Don't crawl dashboards, admin, or raw APIs
Disallow: /api/
Disallow: /pages/admin/
Disallow: /pages/agent/
Disallow: /business/dashboard
Disallow: /admin/
Disallow: /login
Disallow: /signup
Disallow: /agent-login
Disallow: /business-login
Disallow: /forbidden

Sitemap: https://minnesotalakehomesforsale.com/sitemap.xml
`);
});

// ─── /sitemap.xml ─────────────────────────────────────────────────────────
// Generated on every request from the DB + a static page list. Small
// enough that caching is premature — ~200-300 entries at current size.
// Google + Bing both fetch this once per crawl cycle.
app.get('/sitemap.xml', async (req, res) => {
    const base = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' }[c]));
    const iso = (d) => { try { return new Date(d).toISOString().split('T')[0]; } catch (_) { return null; } };

    try {
        const [lakes, towns, businesses, agents, posts] = await Promise.all([
            // Only list pages that actually RENDER. /lakes/:slug and /towns/:slug
            // 404 without a hero image, so a published-but-heroless row in the
            // sitemap is a 404 we're handing Google. Require the hero here.
            pool.query(`SELECT slug, updated_at FROM lakes
                        WHERE status = 'published' AND COALESCE(hero_image_url,'') <> ''`),
            pool.query(`SELECT DISTINCT t.slug, t.updated_at FROM tags t
                        WHERE t.active = TRUE AND COALESCE(t.hero_image_url,'') <> ''
                          AND EXISTS (SELECT 1 FROM lake_tags lt
                                      JOIN lakes l ON l.id = lt.lake_id
                                      WHERE lt.tag_id = t.id AND l.status = 'published')`),
            pool.query(`SELECT slug, updated_at FROM businesses
                        WHERE status = 'active'
                          AND (user_id IS NULL OR subscription_status = 'active' OR tier_comped)`),
            pool.query(`SELECT slug, updated_at FROM agents
                        WHERE profile_status = 'published' AND is_published = TRUE AND deleted_at IS NULL`),
            pool.query(`SELECT slug, updated_at, published_at FROM blog_posts
                        WHERE is_published = TRUE AND deleted_at IS NULL`),
        ]);

        const entries = [];
        const push = (loc, opts = {}) => entries.push({ loc, ...opts });

        // Static pages — ordered by importance (priority drives crawl order).
        const staticPages = [
            { url: '/',                priority: 1.0, changefreq: 'weekly'  },
            { url: '/buy',             priority: 0.9, changefreq: 'weekly'  },
            { url: '/sell',            priority: 0.9, changefreq: 'weekly'  },
            { url: '/towns',           priority: 0.9, changefreq: 'weekly'  },
            { url: '/agents',          priority: 0.8, changefreq: 'weekly'  },
            { url: '/cash-offer',      priority: 0.7, changefreq: 'monthly' },
            { url: '/blog',            priority: 0.7, changefreq: 'daily'   },
            { url: '/find-your-lake',            priority: 0.7, changefreq: 'monthly' },
            { url: '/compare-lakes',             priority: 0.7, changefreq: 'monthly' },
            { url: '/lake-mortgage-calculator',  priority: 0.6, changefreq: 'monthly' },
            { url: '/lake-buyer-checklist',      priority: 0.6, changefreq: 'monthly' },
            { url: '/resources',       priority: 0.6, changefreq: 'monthly' },
            { url: '/rent',            priority: 0.6, changefreq: 'weekly'  },
            { url: '/join',            priority: 0.5, changefreq: 'monthly' },
            { url: '/submit-business', priority: 0.5, changefreq: 'monthly' },
            { url: '/business-signup', priority: 0.5, changefreq: 'monthly' },
            { url: '/commonrealtor',   priority: 0.5, changefreq: 'monthly' },
            { url: '/about',           priority: 0.5, changefreq: 'yearly'  },
            { url: '/contact',         priority: 0.5, changefreq: 'yearly'  },
            { url: '/faq',             priority: 0.4, changefreq: 'yearly'  },
            { url: '/careers',         priority: 0.3, changefreq: 'monthly' },
            { url: '/privacy',         priority: 0.3, changefreq: 'yearly'  },
            { url: '/terms',           priority: 0.3, changefreq: 'yearly'  },
        ];
        for (const p of staticPages) push(base + p.url, { priority: p.priority, changefreq: p.changefreq });

        // Dynamic pages, in priority order. Lakes + towns are our biggest
        // SEO surface — they're where cabin buyers and sellers actually land.
        for (const l of lakes.rows)      push(`${base}/lakes/${encodeURIComponent(l.slug)}`,       { lastmod: iso(l.updated_at),  priority: 0.8, changefreq: 'weekly'  });
        for (const t of towns.rows)      push(`${base}/towns/${encodeURIComponent(t.slug)}`,       { lastmod: iso(t.updated_at),  priority: 0.8, changefreq: 'weekly'  });
        for (const b of businesses.rows) push(`${base}/businesses/${encodeURIComponent(b.slug)}`,  { lastmod: iso(b.updated_at),  priority: 0.6, changefreq: 'monthly' });
        for (const a of agents.rows)     push(`${base}/agents/${encodeURIComponent(a.slug)}`,                              { lastmod: iso(a.updated_at), priority: 0.6, changefreq: 'monthly' });
        for (const p of posts.rows)      push(`${base}/blog/${encodeURIComponent(p.slug)}`,                                   { lastmod: iso(p.published_at || p.updated_at), priority: 0.5, changefreq: 'monthly' });

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(e => `  <url>
    <loc>${esc(e.loc)}</loc>${e.lastmod ? `
    <lastmod>${e.lastmod}</lastmod>` : ''}
    <changefreq>${e.changefreq || 'monthly'}</changefreq>
    <priority>${(e.priority ?? 0.5).toFixed(1)}</priority>
  </url>`).join('\n')}
</urlset>`;
        res.type('application/xml').send(xml);
    } catch (err) {
        console.error('[sitemap]', err.message);
        // Degrade to an empty-but-valid sitemap rather than 500 — a
        // transient DB blip shouldn't deindex the whole site.
        res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
});

// ─── Lakes: public browse + dynamic lake pages ─────────────────────────
// These sit in front of express.static so /lakes and /lakes/:slug resolve
// to the lake templates, not to any same-named static file. The detail
// page does a small server-side token replacement so SEO meta tags hit
// the initial HTML (Google-indexable without needing JS execution).
const fs = require('fs');
function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

/**
 * Build the optional photo-gallery section for a lake or town SSR page.
 * Reuses the existing .mn-photo-gallery styles from styles/style.css so it
 * matches the index/buy/sell galleries. Returns '' when there are no images
 * so the entire <section> is omitted from the page — no padding, no header,
 * nothing to fall back to. Each card links to `href` (typically the same
 * lake/town page) with `label` as the visible caption.
 *
 *   images   — JSONB array. Each entry is either a URL string or an object
 *              like { url, alt }. Anything else is skipped.
 *   title    — h2 inside the section header.
 *   eyebrow  — tiny label above the title.
 *   subtitle — short paragraph below the title.
 *   href     — link target for every card (e.g. `/lakes/<slug>`).
 *   label    — caption shown over each card (e.g. lake name).
 */
/**
 * Hero photo credit caption. Renders a small "Photo: Name, LICENSE" line
 * with a link to the source page. Returns empty string when no credit is
 * stored — locally-uploaded images get no caption, Wikimedia-sourced
 * ones get visible attribution as CC BY / CC BY-SA require.
 */
function buildPhotoCreditHtml(row) {
    const name = row && row.hero_image_credit_name;
    if (!name) return '';
    const url     = row.hero_image_credit_url || '';
    const license = row.hero_image_license   || '';
    const nameLink = url
        ? `<a href="${escapeHtml(url)}" rel="noopener" target="_blank">${escapeHtml(name)}</a>`
        : escapeHtml(name);
    const licenseText = license ? `, ${escapeHtml(license)}` : '';
    return `<div class="photo-credit" style="font-size:0.72rem;color:#94a3b8;margin-top:0.6rem;text-align:right;line-height:1.4;">Photo: ${nameLink}${licenseText}</div>`;
}

/**
 * Friendly 404 for unknown lake/town/business slugs (and for entries we
 * carry but don't yet have a hero photo for). Renders pages/public/404.html
 * with kind + slug tokens so the page can address the visitor specifically
 * ("We don't profile <Lake Lida> yet, but our agents do…"). Falls back to
 * bare text if the template is missing so we never 500 the request.
 */
function renderFriendly404(res, { kind, slug }) {
    const tplPath = path.join(PROJECT_ROOT, 'pages/public/404.html');
    fs.readFile(tplPath, 'utf8', (err, html) => {
        if (err) {
            res.status(404).send(`${kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Page'} not found`);
            return;
        }
        const kindLabel = kind === 'lake' ? 'lake'
            : kind === 'town' ? 'town'
            : kind === 'business' ? 'business'
            : 'page';
        // Best-effort prettification of the slug into a display name —
        // "lake-lida" → "Lake Lida". Title-cases each kebab segment.
        const pretty = (slug || '')
            .split('-')
            .filter(Boolean)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ') || 'this page';
        const out = html
            .replace(/\{\{NOT_FOUND_KIND\}\}/g,  escapeHtml(kindLabel))
            .replace(/\{\{NOT_FOUND_NAME\}\}/g,  escapeHtml(pretty))
            .replace(/\{\{NOT_FOUND_SLUG\}\}/g,  escapeHtml(slug || ''));
        res.status(404).type('html').send(out);
    });
}

function buildGalleryHtml({ images, title, eyebrow, subtitle, href, label }) {
    const list = Array.isArray(images) ? images : [];
    const urls = list.map(it => {
        if (typeof it === 'string') return it;
        if (it && typeof it === 'object' && typeof it.url === 'string') return it.url;
        return null;
    }).filter(Boolean);
    if (!urls.length) return '';

    const cards = urls.map((url, idx) => `
                <a class="gallery-card" href="${escapeHtml(href)}">
                    <img src="${escapeHtml(url)}" alt="${escapeHtml(label)} photo ${idx + 1}" loading="lazy" width="400" height="300">
                    <span class="gallery-label">${escapeHtml(label)}</span>
                </a>`).join('');

    return `
    <section class="mn-photo-gallery" aria-label="${escapeHtml(label)} photo gallery">
        <div class="mn-photo-gallery-container">
            <div class="mn-photo-gallery-header">
                <div class="mn-photo-gallery-eyebrow">${escapeHtml(eyebrow)}</div>
                <h2 class="mn-photo-gallery-title">${escapeHtml(title)}</h2>
                <p class="mn-photo-gallery-subtitle">${escapeHtml(subtitle)}</p>
            </div>
            <div class="mn-photo-gallery-grid">${cards}
            </div>
        </div>
    </section>`;
}
// /lakes was consolidated into /towns — that page is now the unified
// lake + town database, so send any inbound traffic there permanently.
app.get('/lakes', (req, res) => {
    res.redirect(301, '/towns');
});
app.get('/lakes/:slug', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, slug, name, state, region, county, latitude, longitude,
                    intro_text, description, hero_image_url, featured_image_url,
                    seo_title, seo_description, status, gallery,
                    hero_image_credit_name, hero_image_credit_url, hero_image_license
             FROM lakes WHERE slug = $1 LIMIT 1`,
            [req.params.slug]
        );
        const lake = rows[0];
        // Public detail pages require a real hero photo. A lake without
        // one auto-hides — same response as if the slug didn't exist at
        // all — so visitors never land on a half-baked placeholder card.
        const hasHero = lake && (lake.hero_image_url || '').trim();
        if (!lake || lake.status !== 'published' || !hasHero) {
            renderFriendly404(res, { kind: 'lake', slug: req.params.slug });
            return;
        }

        // Towns connected to this lake (reverse lake_tags lookup) — used to add
        // a crawlable "nearby towns" block so lake pages link back to towns
        // (towns already link to their lakes).
        const townRows = await pool.query(
            `SELECT t.slug, t.name FROM tags t
                JOIN lake_tags lt ON lt.tag_id = t.id
              WHERE lt.lake_id = $1 AND t.active = TRUE
                AND COALESCE(t.hero_image_url,'') <> '' ORDER BY t.name`,
            [lake.id]
        ).then(r => r.rows).catch(() => []);

        const templatePath = path.join(PROJECT_ROOT, 'pages/public/lake-detail.html');
        fs.readFile(templatePath, 'utf8', (err, html) => {
            if (err) return next(err);
            const title = lake.seo_title || `${lake.name} Homes for Sale | ${lake.state} Waterfront Real Estate`;
            const desc  = lake.seo_description || lake.intro_text || `${lake.name} real estate — waterfront homes and cabins on ${lake.name}, ${lake.state}.`;
            const canonical = `/lakes/${lake.slug}`;
            // Visible hero shows the real photo when set; otherwise a neutral
            // gradient placeholder (matching the lake cards) rather than a
            // stock photo. Meta/preload token keeps a default for og:image.
            const heroReal = lake.hero_image_url || null;
            const hero     = heroReal || '/assets/images/mn-winter-birch-chalet.jpg';
            const featured = lake.featured_image_url || lake.hero_image_url || '/assets/images/mn-canoe-shore.webp';
            const lakeInitial   = escapeHtml((lake.name || '?').trim().charAt(0).toUpperCase());
            const lakeHeroBlock = heroReal
                ? `<img src="${escapeHtml(heroReal)}" alt="${escapeHtml(lake.name)} waterfront real estate in ${escapeHtml(lake.state)}" width="1200" height="800" fetchpriority="high">`
                : `<div class="lm-hero-ph"><span>${lakeInitial}</span></div>`;
            // Hero photo credit — required for CC BY / CC BY-SA, shown for all
            // licenses for consistency. Collapses to empty string when the
            // image is locally uploaded (no Wikimedia metadata).
            const lakeHeroCredit = buildPhotoCreditHtml(lake);
            const siteBase = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
            const lakeBreadcrumb = JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home',  item: `${siteBase}/` },
                    { '@type': 'ListItem', position: 2, name: 'Lakes', item: `${siteBase}/towns` },
                    { '@type': 'ListItem', position: 3, name: lake.name, item: `${siteBase}/lakes/${lake.slug}` },
                ],
            });
            const lakeStructuredData = `<script type="application/ld+json">${lakeBreadcrumb}</script>`;

            // Editorial sections — admin-curated text wins; otherwise the
            // region-aware generated copy from lake-content-templates.js
            // fills in. Tokens are HTML blobs (paragraph runs), not plain
            // text, so they bypass escapeHtml — content here is trusted
            // (admin-authored or hand-templated).
            const lct = require('./services/lake-content-templates');
            const lifestyleBody = (lake.lifestyle_text && lake.lifestyle_text.trim())
                ? lake.lifestyle_text.trim().split(/\n{2,}/).map(p => `<p>${escapeHtml(p)}</p>`).join('')
                : lct.lifestyleHtmlForLake(lake);
            const seasonsBody = (lake.seasons_text && lake.seasons_text.trim())
                ? lake.seasons_text.trim().split(/\n{2,}/).map(p => `<p>${escapeHtml(p)}</p>`).join('')
                : lct.seasonsHtmlForLake(lake);

            // Public gallery — only rendered when the admin has uploaded at
            // least one image beyond the hero. Empty array (the default)
            // collapses to an empty string and the section disappears
            // entirely. Each card links back to this same lake page (so the
            // grid mirrors how the index/buy/sell galleries link out).
            const lakeGalleryHtml = buildGalleryHtml({
                images: lake.gallery,
                title: `Around ${lake.name}`,
                eyebrow: 'Photo Gallery',
                subtitle: `A closer look at ${lake.name}${lake.state ? ', ' + lake.state : ''} — added by our team.`,
                href: `/lakes/${lake.slug}`,
                label: lake.name,
            });

            const replacements = {
                '{{LAKE_SEO_TITLE}}':       escapeHtml(title),
                '{{LAKE_SEO_DESCRIPTION}}': escapeHtml(desc),
                '{{LAKE_NAME}}':            escapeHtml(lake.name),
                '{{LAKE_SLUG}}':            escapeHtml(lake.slug),
                '{{LAKE_CANONICAL_PATH}}':  escapeHtml(canonical),
                '{{LAKE_ID}}':              escapeHtml(lake.id),
                '{{LAKE_HERO_IMAGE}}':      escapeHtml(hero),
                '{{LAKE_HERO_BLOCK}}':      lakeHeroBlock,
                '{{LAKE_HERO_CREDIT}}':     lakeHeroCredit,
                '{{LAKE_FEATURED_IMAGE}}':  escapeHtml(featured),
                '{{LAKE_INTRO_TEXT}}':      escapeHtml(lake.intro_text || `${lake.name} — explore waterfront homes and cabins for sale, and get matched with a vetted, local agent who knows this lake bay by bay.`),
                '{{LAKE_LATITUDE}}':        escapeHtml(lake.latitude ?? ''),
                '{{LAKE_LONGITUDE}}':       escapeHtml(lake.longitude ?? ''),
                '{{LAKE_REGION}}':          escapeHtml(lake.region || ''),
                '{{LAKE_COUNTY}}':          escapeHtml(lake.county || ''),
                '{{LAKE_STATE}}':           escapeHtml(lake.state || ''),
                '{{LAKE_STRUCTURED_DATA}}': lakeStructuredData,
                '{{LAKE_LIFESTYLE_BODY}}':  lifestyleBody,
                '{{LAKE_SEASONS_BODY}}':    seasonsBody,
                '{{LAKE_GALLERY_HTML}}':    lakeGalleryHtml,
            };
            let out = html;
            for (const [k, v] of Object.entries(replacements)) {
                out = out.split(k).join(v);
            }
            if (townRows.length) {
                const townDir = seoDirectory([{
                    title: `Towns on & near ${lake.name}`,
                    items: townRows.map(t => ({ href: `/towns/${encodeURIComponent(t.slug)}`, name: t.name })),
                }]);
                out = out.replace('</body>', `${townDir}\n</body>`);
            }
            res.type('html').send(out);
        });
    } catch (err) {
        next(err);
    }
});

// ─── Businesses: per-business public detail page ───────────────────────
// Mirror of /lakes/:slug — static template with {{BUSINESS_*}} tokens
// replaced server-side so SEO meta tags are in the initial HTML.
app.get('/businesses/:slug', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, slug, name, type, description, phone, email, website_url,
                    instagram_url, facebook_url,
                    address, city, state, zip, latitude, longitude,
                    featured_image_url, status
             FROM businesses WHERE slug = $1 LIMIT 1`,
            [req.params.slug]
        );
        const biz = rows[0];
        if (!biz || biz.status !== 'active') {
            renderFriendly404(res, { kind: 'business', slug: req.params.slug });
            return;
        }

        // Featured Blogs — published posts tagged to this business via
        // blog_posts.featured_business_slug. The section is omitted entirely
        // (token → '') when there are no published posts yet.
        let featuredBlogsHtml = '';
        try {
            const { rows: bposts } = await pool.query(
                `SELECT title, slug, excerpt, cover_image_url
                   FROM blog_posts
                  WHERE featured_business_slug = $1 AND is_published = true AND deleted_at IS NULL
                  ORDER BY published_at DESC NULLS LAST`,
                [biz.slug]
            );
            if (bposts.length) {
                const cards = bposts.map(p => `
                    <a class="bz-blog-card" href="/blog/${escapeHtml(p.slug)}">
                        ${p.cover_image_url ? `<div class="bz-blog-img"><img src="${escapeHtml(p.cover_image_url)}" alt="${escapeHtml(p.title)}" loading="lazy"></div>` : ''}
                        <div class="bz-blog-body">
                            <h3>${escapeHtml(p.title)}</h3>
                            ${p.excerpt ? `<p>${escapeHtml(p.excerpt)}</p>` : ''}
                            <span class="bz-blog-readmore">Read article →</span>
                        </div>
                    </a>`).join('');
                featuredBlogsHtml = `
        <section class="bz-blogs" aria-label="Featured blogs">
            <div class="bz-blogs-head">
                <h2>Featured Blogs</h2>
                <span class="sub">Stories featuring ${escapeHtml(biz.name)} on MinnesotaLakeHomesForSale.com</span>
            </div>
            <div class="bz-blogs-grid">${cards}</div>
        </section>`;
            }
        } catch (_) { featuredBlogsHtml = ''; }

        const templatePath = path.join(PROJECT_ROOT, 'pages/public/business-detail.html');
        fs.readFile(templatePath, 'utf8', (err, html) => {
            if (err) return next(err);
            const prettyType = ({
                restaurant: 'Restaurant', marina: 'Marina', service: 'Service',
                photographer: 'Photographer', builder: 'Builder',
                boat_rental: 'Boat Rental', outdoor_recreation: 'Resort',
                other: 'Local Business',
            })[biz.type] || 'Local Business';
            // "Back to all services" link — drops the visitor back on
            // /towns in Businesses view with "All" selected.
            const backUrl = `/towns?view=biz`;
            const locLine = [biz.city, biz.state].filter(Boolean).join(', ');
            const title = `${biz.name} | ${prettyType}${locLine ? ' in ' + locLine : ''}`;
            const desc  = (biz.description && biz.description.slice(0, 160))
                || `${prettyType}${locLine ? ' in ' + locLine : ''} — contact ${biz.name} for hours, info, and bookings.`;
            // LocalBusiness + BreadcrumbList JSON-LD — lets Google show
            // rich results (stars, hours, contact) instead of a plain
            // blue link. Built server-side so Googlebot sees it without
            // executing JS. JSON.stringify escapes <, >, etc. safely
            // inside the JSON-LD script block.
            const siteBase = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
            const bizJsonLd = JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'LocalBusiness',
                '@id': `${siteBase}/businesses/${biz.slug}`,
                name: biz.name,
                description: biz.description || undefined,
                url: `${siteBase}/businesses/${biz.slug}`,
                image: biz.featured_image_url || undefined,
                telephone: biz.phone || undefined,
                email: biz.email || undefined,
                address: (biz.address || biz.city) ? {
                    '@type': 'PostalAddress',
                    streetAddress: biz.address || undefined,
                    addressLocality: biz.city || undefined,
                    addressRegion: biz.state || undefined,
                    postalCode: biz.zip || undefined,
                    addressCountry: 'US',
                } : undefined,
                geo: (biz.latitude != null && biz.longitude != null) ? {
                    '@type': 'GeoCoordinates',
                    latitude: biz.latitude,
                    longitude: biz.longitude,
                } : undefined,
                sameAs: [biz.website_url, biz.instagram_url, biz.facebook_url].filter(Boolean),
            });
            const breadcrumbJsonLd = JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteBase}/` },
                    { '@type': 'ListItem', position: 2, name: 'Businesses & Services', item: `${siteBase}/towns?view=biz` },
                    { '@type': 'ListItem', position: 3, name: biz.name, item: `${siteBase}/businesses/${biz.slug}` },
                ],
            });
            const structuredData =
                `<script type="application/ld+json">${bizJsonLd}</script>\n    ` +
                `<script type="application/ld+json">${breadcrumbJsonLd}</script>`;

            const replacements = {
                '{{BUSINESS_SEO_TITLE}}':       escapeHtml(title),
                '{{BUSINESS_SEO_DESCRIPTION}}': escapeHtml(desc),
                '{{BUSINESS_NAME}}':            escapeHtml(biz.name),
                '{{BUSINESS_SLUG}}':            escapeHtml(biz.slug),
                '{{BUSINESS_TYPE}}':            escapeHtml(biz.type || ''),
                '{{BUSINESS_TYPE_LABEL}}':      escapeHtml(prettyType),
                '{{BUSINESS_BACK_URL}}':        escapeHtml(backUrl),
                '{{BUSINESS_DESCRIPTION}}':     escapeHtml(biz.description || ''),
                '{{BUSINESS_PHONE}}':           escapeHtml(biz.phone || ''),
                '{{BUSINESS_EMAIL}}':           escapeHtml(biz.email || ''),
                '{{BUSINESS_WEBSITE}}':         escapeHtml(biz.website_url || ''),
                '{{BUSINESS_INSTAGRAM}}':       escapeHtml(biz.instagram_url || ''),
                '{{BUSINESS_FACEBOOK}}':        escapeHtml(biz.facebook_url || ''),
                '{{BUSINESS_ADDRESS}}':         escapeHtml(biz.address || ''),
                '{{BUSINESS_CITY}}':            escapeHtml(biz.city || ''),
                '{{BUSINESS_STATE}}':           escapeHtml(biz.state || ''),
                '{{BUSINESS_ZIP}}':             escapeHtml(biz.zip || ''),
                '{{BUSINESS_IMAGE}}':           escapeHtml(biz.featured_image_url || ''),
                '{{BUSINESS_LATITUDE}}':        escapeHtml(biz.latitude ?? ''),
                '{{BUSINESS_LONGITUDE}}':       escapeHtml(biz.longitude ?? ''),
                // Structured-data block injected verbatim — already contains
                // JSON-safe output from JSON.stringify, no HTML-escaping.
                '{{BUSINESS_STRUCTURED_DATA}}': structuredData,
                // Featured Blogs section (verbatim HTML; fields escaped above).
                // Empty string when the business has no published tagged posts.
                '{{BUSINESS_FEATURED_BLOGS}}': featuredBlogsHtml,
            };
            let out = html;
            for (const [k, v] of Object.entries(replacements)) {
                out = out.split(k).join(v);
            }
            res.type('html').send(out);
        });
    } catch (err) {
        next(err);
    }
});

// Public submission form page (vendor self-serve).
app.get('/submit-business', (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'pages/public/submit-business.html'));
});

// Business-owner self-service flow (signup → Stripe → dashboard).
app.get('/business-signup', (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'pages/public/business-signup.html'));
});
app.get('/business-login', (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'pages/public/business-login.html'));
});
app.get('/business/dashboard', (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'pages/business/dashboard.html'));
});

// Build a crawlable link directory injected into hub pages, so every
// lake/town/agent link sits in the raw HTML (not just the client-fetched
// cards) — strengthens internal linking and crawl discovery.
function seoDirectory(groups) {
    const cols = groups.map(g => {
        if (!g.items.length) return '';
        const links = g.items.map(i => `<a href="${i.href}" style="color:#1d6df2;text-decoration:none;display:block;padding:0.12rem 0;">${escapeHtml(i.name)}</a>`).join('');
        return `<div style="break-inside:avoid;margin-bottom:1.5rem;"><h3 style="font-size:0.74rem;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#718096;margin:0 0 0.6rem;">${escapeHtml(g.title)}</h3>${links}</div>`;
    }).join('');
    if (!cols) return '';
    return `<nav aria-label="Browse all" style="background:#f7f9fa;border-top:1px solid #edf2f7;padding:3rem 2rem;"><div style="max-width:1200px;margin:0 auto;columns:4;column-gap:2.5rem;font-size:0.9rem;line-height:1.5;">${cols}</div></nav>`;
}

// ─── Towns: public browse-all page ─────────────────────────────────────
app.get('/towns', async (req, res, next) => {
    try {
        const [lakesR, townsR] = await Promise.all([
            pool.query(`SELECT slug, name FROM lakes WHERE status = 'published' ORDER BY name`).catch(() => ({ rows: [] })),
            pool.query(`SELECT slug, name FROM tags WHERE active = TRUE AND COALESCE(hero_image_url,'') <> '' ORDER BY name`).catch(() => ({ rows: [] })),
        ]);
        fs.readFile(path.join(PROJECT_ROOT, 'pages/public/towns-index.html'), 'utf8', (err, html) => {
            if (err) return next(err);
            const dir = seoDirectory([
                { title: 'Minnesota Lakes', items: lakesR.rows.map(l => ({ href: `/lakes/${encodeURIComponent(l.slug)}`, name: l.name })) },
                { title: 'Lake Towns', items: townsR.rows.map(t => ({ href: `/towns/${encodeURIComponent(t.slug)}`, name: t.name })) },
            ]);
            res.type('html').send(html.replace('</body>', `${dir}\n</body>`));
        });
    } catch (err) { next(err); }
});

// ─── Homepage: inject Google Search Console verification meta tag ─────
// GoogleBot may not run JS reliably for the verification check, so the
// `<meta name="google-site-verification" content="...">` tag has to be in
// the static HTML response. We intercept `/` and `/index.html`, read the
// real file from disk, and string-substitute the {{GSC_META}} token in
// the <head> with the env-driven verification value (or empty when no
// value is configured — the page still renders normally).
const _injectGscMeta = (filePath) => async (req, res, next) => {
    try {
        const fs = require('fs').promises;
        let html = await fs.readFile(filePath, 'utf8');
        const tok = process.env.GSC_VERIFICATION
            ? `<meta name="google-site-verification" content="${process.env.GSC_VERIFICATION.replace(/"/g, '&quot;')}">`
            : '<!-- GSC_VERIFICATION env var not set -->';
        html = html.replace('{{GSC_META}}', tok);
        res.type('html').send(html);
    } catch (err) {
        console.error('[gsc-inject]', err.message);
        next();
    }
};
app.get('/',           _injectGscMeta(path.join(PROJECT_ROOT, 'index.html')));
app.get('/index.html', _injectGscMeta(path.join(PROJECT_ROOT, 'index.html')));

// ─── Towns: public dynamic page per geo-tag ────────────────────────────
// Server-renders SEO tokens into the initial HTML (matches the /lakes/:slug
// pattern). The page itself fetches lakes/agents/businesses client-side.
app.get('/towns/:slug', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT t.id, t.slug, t.name, t.state, t.region, t.latitude, t.longitude,
                    t.intro_text, t.description,
                    t.hero_image_url, t.seo_title, t.seo_description, t.gallery,
                    t.hero_image_credit_name, t.hero_image_credit_url, t.hero_image_license
             FROM tags t
             WHERE t.slug = $1 AND t.active = TRUE
             LIMIT 1`,
            [req.params.slug]
        );
        const tag = rows[0];
        const hasHero = tag && (tag.hero_image_url || '').trim();
        if (!tag || !hasHero) {
            renderFriendly404(res, { kind: 'town', slug: req.params.slug });
            return;
        }
        const templatePath = path.join(PROJECT_ROOT, 'pages/public/town-detail.html');
        fs.readFile(templatePath, 'utf8', (err, html) => {
            if (err) return next(err);
            // Per-town overrides win when set, otherwise fall back to safe
            // auto-generated values so towns without curated content still ship.
            const title = tag.seo_title       || `${tag.name}, ${tag.state} — Lake Homes, Agents & Local Businesses`;
            const desc  = tag.seo_description || `Browse lake homes for sale, top local agents, and trusted businesses serving ${tag.name}, ${tag.state}.`;
            const canonical = `/towns/${tag.slug}`;
            // Visible hero shows the real photo when one is set; otherwise a
            // neutral gradient placeholder (matching the town cards) rather
            // than a stock photo that looks like a real image. The meta /
            // preload token keeps a sensible default so og:image and social
            // cards are never empty.
            const heroImageReal = tag.hero_image_url || null;
            const heroImage     = heroImageReal || '/assets/images/mn-aerial-small-town.jpg';
            const townInitial   = escapeHtml((tag.name || '?').trim().charAt(0).toUpperCase());
            const townHeroBlock = heroImageReal
                ? `<img src="${escapeHtml(heroImageReal)}" alt="${escapeHtml(tag.name)}, ${escapeHtml(tag.state)}" width="1200" height="800" fetchpriority="high">`
                : `<div class="tn-hero-ph"><span>${townInitial}</span></div>`;
            const townHeroCredit = buildPhotoCreditHtml(tag);
            const siteBase = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
            const townBreadcrumb = JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home',  item: `${siteBase}/` },
                    { '@type': 'ListItem', position: 2, name: 'Lake Towns', item: `${siteBase}/towns` },
                    { '@type': 'ListItem', position: 3, name: tag.name,   item: `${siteBase}/towns/${tag.slug}` },
                ],
            });
            const townStructuredData = `<script type="application/ld+json">${townBreadcrumb}</script>`;
            // Hero text — when curated copy is present we surface a fuller
            // SEO-leaning H1 ("[Town] Lake Homes for Sale"); otherwise the
            // template falls back to the simpler "Explore [Town]" treatment.
            const hasContent      = !!(tag.description && tag.description.trim());
            // Both variants MUST close the </h1> themselves — the template
            // emits a bare "<h1>{{TOWN_HERO_H1_HTML}}" with no closing tag. If
            // the rich variant omits </h1>, the <p class="lead"> subtitle is
            // swallowed into the heading and inherits its letter-spacing:-2px,
            // which jams the subtitle text together.
            const heroH1HtmlRich  = `${escapeHtml(tag.name)} <span>Homes for Sale</span></h1>`;
            const heroH1HtmlBasic = `Explore<br><span>${escapeHtml(tag.name)}</span></h1>`;
            const heroH1Html      = hasContent ? heroH1HtmlRich : heroH1HtmlBasic;
            const introText       = (tag.intro_text || '').trim()
                || `${tag.name} is a ${tag.state} lake-country town. Browse lake homes for sale, get matched with a vetted, local lake agent, and find the trusted businesses nearby.`;

            // Description is JSON-encoded so the template's client-side JS
            // can parse and split it into the about-1/2/3 sections without
            // worrying about escaping line breaks. JSON.stringify produces
            // a quoted JS-safe string we drop straight into a script tag.
            const descriptionJson = JSON.stringify(tag.description || '');

            // Editorial sections — admin-curated text wins; otherwise the
            // region-aware generated copy fills in.
            const lct = require('./services/lake-content-templates');
            const lifestyleBody = (tag.lifestyle_text && tag.lifestyle_text.trim())
                ? tag.lifestyle_text.trim().split(/\n{2,}/).map(p => `<p>${escapeHtml(p)}</p>`).join('')
                : lct.lifestyleHtmlForTown(tag);
            const seasonsBody = (tag.seasons_text && tag.seasons_text.trim())
                ? tag.seasons_text.trim().split(/\n{2,}/).map(p => `<p>${escapeHtml(p)}</p>`).join('')
                : lct.seasonsHtmlForTown(tag);

            // Public gallery — only rendered when the admin has uploaded at
            // least one image beyond the hero. Empty array (the default)
            // collapses to an empty string and the section disappears.
            // Each card links back to this town page (matches how the
            // index/buy/sell galleries link to their source location).
            const townGalleryHtml = buildGalleryHtml({
                images: tag.gallery,
                title: `Around ${tag.name}`,
                eyebrow: 'Photo Gallery',
                subtitle: `A closer look at ${tag.name}${tag.state ? ', ' + tag.state : ''} — added by our team.`,
                href: `/towns/${tag.slug}`,
                label: tag.name,
            });

            const replacements = {
                '{{TOWN_SEO_TITLE}}':        escapeHtml(title),
                '{{TOWN_SEO_DESCRIPTION}}':  escapeHtml(desc),
                '{{TOWN_NAME}}':             escapeHtml(tag.name),
                '{{TOWN_SLUG}}':             escapeHtml(tag.slug),
                '{{TOWN_ID}}':               escapeHtml(tag.id),
                '{{TOWN_STATE}}':            escapeHtml(tag.state || ''),
                '{{TOWN_REGION}}':           escapeHtml(tag.region || 'Minnesota'),
                '{{TOWN_CANONICAL_PATH}}':   escapeHtml(canonical),
                '{{TOWN_LATITUDE}}':         escapeHtml(tag.latitude ?? ''),
                '{{TOWN_LONGITUDE}}':        escapeHtml(tag.longitude ?? ''),
                '{{TOWN_COUNTY}}':           escapeHtml(tag.county || ''),
                '{{TOWN_HERO_IMAGE}}':       escapeHtml(heroImage),
                '{{TOWN_HERO_BLOCK}}':       townHeroBlock,
                '{{TOWN_HERO_CREDIT}}':      townHeroCredit,
                '{{TOWN_HERO_H1_HTML}}':     heroH1Html,
                '{{TOWN_INTRO_TEXT}}':       escapeHtml(introText),
                '{{TOWN_DESCRIPTION_JSON}}': descriptionJson,
                '{{TOWN_STRUCTURED_DATA}}':  townStructuredData,
                '{{TOWN_LIFESTYLE_BODY}}':   lifestyleBody,
                '{{TOWN_SEASONS_BODY}}':     seasonsBody,
                '{{TOWN_GALLERY_HTML}}':     townGalleryHtml,
            };
            let out = html;
            for (const [k, v] of Object.entries(replacements)) {
                out = out.split(k).join(v);
            }
            res.type('html').send(out);
        });
    } catch (err) {
        next(err);
    }
});

// Strip the legacy in-article CTA button (a centered <p> wrapping a styled
// "Get matched … →" anchor) from post bodies — the blog template now renders a
// single canonical bottom CTA, so the in-body one is a duplicate.
function stripCtaButtons(html) {
    if (!html) return html;
    return html.replace(
        /<p[^>]*text-align:\s*center[^>]*>\s*<a\b[\s\S]*?(?:→|&rarr;|&#8594;)[\s\S]*?<\/a>\s*<\/p>/gi,
        ''
    );
}

// ── Blog detail SSR (/blog/:slug) ───────────────────────────────────────────
// Renders pages/public/blog-post.html with title/meta/JSON-LD baked in so
// the bot sees the right SEO surface (the client-side JS fallback was fine
// for users but invisible to crawlers). Article + BreadcrumbList JSON-LD
// follows the same pattern as the lake/town pages.
app.get('/blog/:slug', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, title, slug, excerpt, body, cover_image_url, tag,
                    read_time_minutes, author_name, is_published,
                    published_at, updated_at, seo_title, seo_description
               FROM blog_posts
              WHERE slug = $1 AND deleted_at IS NULL
              LIMIT 1`,
            [req.params.slug]
        );
        const post = rows[0];
        if (!post || !post.is_published) {
            renderFriendly404(res, { kind: 'page', slug: req.params.slug });
            return;
        }
        post.body = stripCtaButtons(post.body);

        // Related posts ("Featured Blogs" at the foot of the article): same tag
        // first, then a close tag-family fallback. Section is omitted entirely
        // when nothing relevant is found.
        let relatedHtml = '';
        try {
            const TAG_FAMILIES = [
                ['Buyer Guide', 'Buying a Lake Home', 'Choosing a Lake', 'Mille Lacs Buyer Guide'],
                ['Seller Resources'],
                ['Working With an Agent', 'How It Works'],
                ['Local Life', 'Community', 'Mille Lacs Lifestyle', 'Local Spotlight'],
            ];
            const myTag = post.tag || 'General';
            const family = TAG_FAMILIES.find(f => f.includes(myTag)) || [myTag];
            const { rows: rel } = await pool.query(
                `SELECT title, slug, excerpt, cover_image_url, tag
                   FROM blog_posts
                  WHERE tag = ANY($1) AND slug <> $2
                    AND is_published = true AND deleted_at IS NULL
                  ORDER BY (tag = $3) DESC, published_at DESC NULLS LAST
                  LIMIT 3`,
                [family, post.slug, myTag]
            );
            if (rel.length) {
                const cards = rel.map(p => `
                    <a class="related-card" href="/blog/${escapeHtml(p.slug)}">
                        ${p.cover_image_url ? `<div class="related-img"><img src="${escapeHtml(p.cover_image_url)}" alt="${escapeHtml(p.title)}" loading="lazy"></div>` : ''}
                        <div class="related-body">
                            <span class="related-tag">${escapeHtml(p.tag || 'General')}</span>
                            <h3 class="related-title">${escapeHtml(p.title)}</h3>
                            ${p.excerpt ? `<p class="related-ex">${escapeHtml(p.excerpt)}</p>` : ''}
                        </div>
                    </a>`).join('');
                relatedHtml = `
    <section class="post-related post-container">
        <h2>Related articles</h2>
        <div class="related-grid">${cards}</div>
    </section>`;
            }
        } catch (_) { relatedHtml = ''; }

        const tplPath = path.join(PROJECT_ROOT, 'pages/public/blog-post.html');
        fs.readFile(tplPath, 'utf8', (err, html) => {
            if (err) return next(err);

            const seoTitle = post.seo_title || `${post.title} | MN Lake Homes`;
            const seoDesc  = post.seo_description || post.excerpt || '';
            const canonical = `/blog/${post.slug}`;
            const baseUrl = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
            const heroAbs = post.cover_image_url
                ? (post.cover_image_url.startsWith('http') ? post.cover_image_url : `${baseUrl}${post.cover_image_url}`)
                : '';
            const pubISO = post.published_at ? new Date(post.published_at).toISOString() : null;
            const updISO = post.updated_at   ? new Date(post.updated_at).toISOString()   : pubISO;

            // Article + BreadcrumbList (Home → Blog → this post). Wrapped in
            // a single <script> via @graph so we keep the document clean.
            const jsonld = {
                '@context': 'https://schema.org',
                '@graph': [
                    {
                        '@type': 'Article',
                        'headline': post.title,
                        'description': seoDesc || undefined,
                        'image': heroAbs || undefined,
                        'author': { '@type': 'Organization', 'name': post.author_name || 'MN Lake Homes Team' },
                        'publisher': { '@type': 'Organization', 'name': 'MN Lake Homes',
                            'logo': { '@type': 'ImageObject', 'url': `${baseUrl}/favicon.svg` } },
                        'datePublished': pubISO || undefined,
                        'dateModified':  updISO || undefined,
                        'mainEntityOfPage': `${baseUrl}${canonical}`,
                        'articleSection': post.tag || undefined,
                    },
                    {
                        '@type': 'BreadcrumbList',
                        'itemListElement': [
                            { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': `${baseUrl}/` },
                            { '@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': `${baseUrl}/blog` },
                            { '@type': 'ListItem', 'position': 3, 'name': post.title, 'item': `${baseUrl}${canonical}` },
                        ],
                    },
                ],
            };
            const jsonldTag = `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`;

            // Replace the document title + inject meta tags + JSON-LD into
            // <head>. The template is still client-side rendered for the
            // body — we just give the crawler what it needs up front.
            let out = html
                .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(seoTitle)}</title>`);
            const metaBlock = `
    <meta name="description" content="${escapeHtml(seoDesc)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${escapeHtml(seoTitle)}">
    <meta property="og:description" content="${escapeHtml(seoDesc)}">
    <meta property="og:url" content="${escapeHtml(baseUrl + canonical)}">
    ${heroAbs ? `<meta property="og:image" content="${escapeHtml(heroAbs)}">` : ''}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(seoTitle)}">
    <meta name="twitter:description" content="${escapeHtml(seoDesc)}">
    ${heroAbs ? `<meta name="twitter:image" content="${escapeHtml(heroAbs)}">` : ''}
    ${jsonldTag}
`;
            // Server-render the body so crawlers (and no-JS clients) get the
            // full article, not a "Loading…" shell. The whole post is also
            // handed to the page as window.__BLOG_POST__ so the client renders
            // from it (TOC, CTAs, newsletter) without a second fetch.
            const tagTxt   = post.tag || 'General';
            const readTxt  = `${post.read_time_minutes || 4} min read`;
            const subTxt   = post.excerpt || post.seo_description || '';
            const authorTxt = post.author_name || 'MN Lake Homes';
            let dateTxt = '';
            const rawDate = post.published_at || post.updated_at;
            if (rawDate) { try { dateTxt = new Date(rawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (_) {} }
            // JSON for the client; escape `<` so a "</script>" in the body can't break out.
            const postJson = JSON.stringify({
                title: post.title, slug: post.slug, excerpt: post.excerpt, body: post.body,
                cover_image_url: post.cover_image_url, tag: post.tag, read_time_minutes: post.read_time_minutes,
                author_name: post.author_name, published_at: post.published_at, seo_description: post.seo_description,
            }).replace(/</g, '\\u003c');

            out = out
                .replace('</head>', `${metaBlock}<script>window.__BLOG_POST__=${postJson};</script>\n</head>`)
                .replace('<span class="current" id="bc-title">Loading…</span>', `<span class="current" id="bc-title">${escapeHtml(post.title)}</span>`)
                .replace('<span id="post-tag" class="post-tag"></span>', `<span id="post-tag" class="post-tag">${escapeHtml(tagTxt)}</span>`)
                .replace('<span id="post-read-time" class="post-read-pill"></span>', `<span id="post-read-time" class="post-read-pill">${escapeHtml(readTxt)}</span>`)
                .replace('<h1 id="post-title" class="post-title">Loading…</h1>', `<h1 id="post-title" class="post-title">${escapeHtml(post.title)}</h1>`)
                .replace('<p id="post-subtitle" class="post-subtitle"></p>', `<p id="post-subtitle" class="post-subtitle">${escapeHtml(subTxt)}</p>`)
                .replace('<div class="post-author-name" id="post-author">MN Lake Homes</div>', `<div class="post-author-name" id="post-author">${escapeHtml(authorTxt)}</div>`)
                .replace('<div class="post-author-date" id="post-date"></div>', `<div class="post-author-date" id="post-date">${escapeHtml(dateTxt)}</div>`)
                .replace('<img id="hero-img" src="" alt="">', `<img id="hero-img" src="${escapeHtml(post.cover_image_url || '')}" alt="${escapeHtml(post.title)}">`)
                .replace('<article class="post-body" id="post-body"></article>', `<article class="post-body" id="post-body">${post.body || ''}</article>`)
                .replace('<section class="post-related post-container" id="related-blogs"></section>', relatedHtml);
            res.type('html').send(out);
        });
    } catch (err) {
        next(err);
    }
});

// 301 the old query-string URLs to the clean route so we don't fragment
// link equity between two URLs pointing at the same post.
app.get('/pages/public/blog-post.html', (req, res, next) => {
    const slug = (req.query.slug || '').toString().trim();
    if (!slug) return next();
    res.redirect(301, `/blog/${encodeURIComponent(slug)}`);
});

// ── Agent profile SSR (/agents/:slug) ───────────────────────────────────────
// Clean, crawlable agent URLs with RealEstateAgent + BreadcrumbList JSON-LD and
// a server-rendered hero. The page (agent-profile.html) renders the rest from
// window.__AGENT__ without a second fetch.
app.get('/agents/:slug', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT a.id, a.slug, a.display_name, a.brokerage_name, a.city, a.state,
                    a.service_areas, a.specialties, a.is_featured, a.bio,
                    a.phone_public, a.email_public,
                    a.website_url, a.facebook_url, a.instagram_url, a.linkedin_url,
                    a.profile_photo_url, m.display_badge_label AS membership_badge
               FROM agents a JOIN memberships m ON a.membership_id = m.id
              WHERE a.slug = $1 AND a.profile_status = 'published' AND a.is_published = true
              LIMIT 1`,
            [req.params.slug]
        );
        const agent = rows[0];
        if (!agent) { renderFriendly404(res, { kind: 'agent', slug: req.params.slug }); return; }

        const tplPath = path.join(PROJECT_ROOT, 'pages/public/agent-profile.html');
        fs.readFile(tplPath, 'utf8', (err, html) => {
            if (err) return next(err);
            const baseUrl = (process.env.SITE_URL || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
            const canonical = `/agents/${agent.slug}`;
            const role = agent.membership_badge || 'Lake Home Specialist';
            const loc = [agent.city, agent.state].filter(Boolean).join(', ');
            const title = `${agent.display_name}${agent.brokerage_name ? ' · ' + agent.brokerage_name : ''} | Minnesota Lake Home Agent`;
            const bioText = (agent.bio || '').replace(/\s+/g, ' ').trim();
            const desc = bioText ? bioText.slice(0, 155) : `${agent.display_name} is a vetted Minnesota lake home specialist${loc ? ' serving ' + loc : ''}. Get matched and start your lakefront search.`;
            const photoAbs = agent.profile_photo_url
                ? (agent.profile_photo_url.startsWith('http') ? agent.profile_photo_url : `${baseUrl}${agent.profile_photo_url}`)
                : '';

            let areas = agent.service_areas;
            if (typeof areas === 'string') { try { areas = JSON.parse(areas); } catch (_) { areas = []; } }
            if (!Array.isArray(areas)) areas = [];
            const areaNames = areas.map(a => (typeof a === 'string' ? a : (a && (a.name || a.slug)))).filter(Boolean);

            const agentLd = {
                '@context': 'https://schema.org',
                '@type': 'RealEstateAgent',
                name: agent.display_name,
                url: `${baseUrl}${canonical}`,
                image: photoAbs || undefined,
                description: bioText || undefined,
                telephone: agent.phone_public || undefined,
                email: agent.email_public || undefined,
                worksFor: agent.brokerage_name ? { '@type': 'Organization', name: agent.brokerage_name } : undefined,
                address: loc ? { '@type': 'PostalAddress', addressLocality: agent.city || undefined, addressRegion: agent.state || undefined, addressCountry: 'US' } : undefined,
                areaServed: areaNames.length ? areaNames.map(n => ({ '@type': 'Place', name: n })) : (agent.state ? { '@type': 'State', name: agent.state } : undefined),
                sameAs: [agent.website_url, agent.facebook_url, agent.instagram_url, agent.linkedin_url].filter(Boolean),
            };
            if (!agentLd.sameAs.length) delete agentLd.sameAs;
            const breadcrumbLd = {
                '@context': 'https://schema.org', '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
                    { '@type': 'ListItem', position: 2, name: 'Agents', item: `${baseUrl}/agents` },
                    { '@type': 'ListItem', position: 3, name: agent.display_name, item: `${baseUrl}${canonical}` },
                ],
            };

            const head = `
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:type" content="profile">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(desc)}">
    <meta property="og:url" content="${escapeHtml(baseUrl + canonical)}">
    ${photoAbs ? `<meta property="og:image" content="${escapeHtml(photoAbs)}">` : ''}
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">${JSON.stringify(agentLd)}</script>
    <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
`;
            const agentJson = JSON.stringify(agent).replace(/</g, '\\u003c');
            const heroSsr = `
                <h1 style="font-size:3rem;font-weight:700;letter-spacing:-1px;margin-bottom:0.5rem;">${escapeHtml(agent.display_name)}</h1>
                <p style="color:#cbd5e0;font-size:1.15rem;margin-bottom:1rem;">${escapeHtml(role)}${loc ? ' · ' + escapeHtml(loc) : ''}</p>
                ${bioText ? `<p style="color:#a0aec0;max-width:640px;margin:0 auto;line-height:1.6;">${escapeHtml(bioText)}</p>` : ''}`;

            const out = html
                .replace(/<title[^>]*>[^<]*<\/title>/, `<title id="page-title">${escapeHtml(title)}</title>`)
                .replace('<meta name="description" content="MN Lake Homes agent profile page.">', `<meta name="description" content="${escapeHtml(desc)}">`)
                .replace('</head>', `${head}<script>window.__AGENT__=${agentJson};</script>\n</head>`)
                .replace('<div style="color: #a0aec0; font-size: 1.1rem;">Loading profile...</div>', heroSsr);
            res.type('html').send(out);
        });
    } catch (err) { next(err); }
});

// Default-browser favicon path → SVG. Even though every page now references
// /favicon.svg explicitly via <link rel="icon">, older browsers and some
// social-share crawlers still probe /favicon.ico unconditionally. Redirect
// so they get a usable icon instead of a 404 line in the server logs.
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));

// ── Agents hub (/agents) ────────────────────────────────────────────────────
// Serve agents.html with a server-rendered directory of every agent link so
// crawlers see them in the raw HTML (the cards themselves load client-side).
app.get('/agents', async (req, res, next) => {
    try {
        const r = await pool.query(
            `SELECT slug, display_name, city FROM agents
              WHERE profile_status = 'published' AND is_published = true ORDER BY display_name`
        ).catch(() => ({ rows: [] }));
        fs.readFile(path.join(PROJECT_ROOT, 'pages/public/agents.html'), 'utf8', (err, html) => {
            if (err) return next(err);
            const dir = seoDirectory([
                { title: 'All Minnesota Lake Agents', items: r.rows.map(a => ({ href: `/agents/${encodeURIComponent(a.slug)}`, name: a.display_name + (a.city ? ` — ${a.city}` : '') })) },
            ]);
            res.type('html').send(html.replace('</body>', `${dir}\n</body>`));
        });
    } catch (err) { next(err); }
});

// ── Site search (/search?q=) ────────────────────────────────────────────────
// Server-rendered results across lakes, towns, blog guides, and agents. Backs
// the homepage WebSite SearchAction. Results pages are noindex (see template).
app.get('/search', async (req, res, next) => {
    try {
        const q = (req.query.q || '').toString().trim().slice(0, 80);
        const tplPath = path.join(PROJECT_ROOT, 'pages/public/search.html');
        const like = `%${q}%`;
        const safe = (p) => p.then(r => r.rows).catch(() => []);

        let lakes = [], towns = [], posts = [], agents = [];
        if (q) {
            [lakes, towns, posts, agents] = await Promise.all([
                safe(pool.query(`SELECT slug, name, region, intro_text FROM lakes WHERE status = 'published' AND name ILIKE $1 ORDER BY name LIMIT 8`, [like])),
                safe(pool.query(`SELECT slug, name, region FROM tags WHERE active = TRUE AND COALESCE(hero_image_url,'') <> '' AND name ILIKE $1 ORDER BY name LIMIT 8`, [like])),
                safe(pool.query(`SELECT slug, title, excerpt FROM blog_posts WHERE is_published = TRUE AND deleted_at IS NULL AND (title ILIKE $1 OR excerpt ILIKE $1) ORDER BY published_at DESC NULLS LAST LIMIT 8`, [like])),
                safe(pool.query(`SELECT slug, display_name, city, state, brokerage_name FROM agents WHERE profile_status = 'published' AND is_published = true AND display_name ILIKE $1 ORDER BY display_name LIMIT 8`, [like])),
            ]);
        }

        const enc = encodeURIComponent;
        const hit = (href, name, meta, sub) =>
            `<a class="search-hit" href="${href}"><div><span class="h-name">${escapeHtml(name)}</span>${meta ? `<span class="h-meta">${escapeHtml(meta)}</span>` : ''}</div>${sub ? `<div class="h-sub">${escapeHtml(sub)}</div>` : ''}</a>`;
        const group = (title, items) => items.length ? `<div class="search-group"><h2>${title}</h2>${items.join('')}</div>` : '';
        const clip = (s) => { s = (s || '').trim(); return s.length > 130 ? s.slice(0, 130).trim() + '…' : s; };

        let results;
        if (!q) {
            results = `<p class="search-empty">Search Minnesota lakes, towns, buyer guides, and agents.</p>`;
        } else {
            const blocks = [
                group('Lakes', lakes.map(l => hit(`/lakes/${enc(l.slug)}`, l.name, l.region || 'Lake', clip(l.intro_text)))),
                group('Towns', towns.map(t => hit(`/towns/${enc(t.slug)}`, t.name, t.region || 'Town'))),
                group('Guides', posts.map(p => hit(`/blog/${enc(p.slug)}`, p.title, 'Blog', clip(p.excerpt)))),
                group('Agents', agents.map(a => hit(`/agents/${enc(a.slug)}`, a.display_name, [a.brokerage_name, [a.city, a.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Agent'))),
            ].filter(Boolean);
            results = blocks.length ? blocks.join('') : `<p class="search-empty">No matches for “${escapeHtml(q)}”. Try a lake or town name like “Gull Lake” or “Nisswa”.</p>`;
        }

        fs.readFile(tplPath, 'utf8', (err, html) => {
            if (err) return next(err);
            const out = html
                .replace('<title>Search | MN Lake Homes</title>', `<title>${q ? `${escapeHtml(q)} — Search` : 'Search'} | MN Lake Homes</title>`)
                .replace('{{SEARCH_TITLE}}', q ? `Results for “${escapeHtml(q)}”` : 'Search')
                .replace('{{SEARCH_QUERY}}', escapeHtml(q))
                .replace('{{SEARCH_RESULTS}}', results);
            res.type('html').send(out);
        });
    } catch (err) { next(err); }
});

// Lake tools data: live lake rows merged with quiz/compare attributes.
app.get('/api/tools/lakes', async (req, res) => {
    try {
        const attrs = require('./data/lake-attributes');
        const { rows } = await pool.query(
            `SELECT slug, name, region, county, intro_text, hero_image_url
               FROM lakes WHERE status = 'published' AND COALESCE(hero_image_url,'') <> '' ORDER BY name`
        );
        const out = rows.filter(l => attrs[l.slug]).map(l => ({
            slug: l.slug, name: l.name, region: l.region, county: l.county,
            intro: l.intro_text || '', hero: l.hero_image_url || '', ...attrs[l.slug],
        }));
        res.json(out);
    } catch (e) {
        console.error('[tools/lakes]', e.message);
        res.status(500).json({ error: 'failed' });
    }
});

app.use(express.static(PROJECT_ROOT));

// Fallback for Next.js-style clean URL resolution. Most public pages
// live under /pages/public/ — try that first so /buy, /about, /privacy
// etc. all resolve to their respective files. Falls back to PROJECT_ROOT
// for the few pages (index.html) that sit at the repo root, then 404.
app.get('/:page', (req, res, next) => {
    const { page } = req.params;
    if (page.includes('.')) return next();
    const publicPath = path.join(PROJECT_ROOT, 'pages/public', `${page}.html`);
    res.sendFile(publicPath, (err) => {
        if (!err) return;
        const rootPath = path.join(PROJECT_ROOT, `${page}.html`);
        res.sendFile(rootPath, (err2) => {
            if (err2) next();
        });
    });
});

// ==========================================
// AUTO-MIGRATE: ensure any new tables exist
// ==========================================
const pool = require('./database/pool');
// Run a DDL/migration statement that may legitimately fail on a fresh
// database — e.g. an ALTER/INDEX/TRIGGER on a table that is CREATEd later
// in this same function. Logs and continues instead of aborting the whole
// boot sequence. The statement succeeds normally on the next boot, once the
// target table exists.
async function safeExec(sql, params) {
    try {
        await pool.query(sql, params);
    } catch (err) {
        console.warn(' Migration step skipped (will retry next boot):', err.message);
    }
}

async function ensureTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS blog_posts (
                id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title            TEXT NOT NULL,
                slug             TEXT UNIQUE NOT NULL,
                excerpt          TEXT,
                body             TEXT,
                cover_image_url  TEXT,
                tag              TEXT DEFAULT 'General',
                read_time_minutes INT DEFAULT 4,
                author_name      TEXT DEFAULT 'MN Lake Homes Team',
                is_published     BOOLEAN DEFAULT false,
                published_at     TIMESTAMPTZ,
                created_at       TIMESTAMPTZ DEFAULT NOW(),
                updated_at       TIMESTAMPTZ DEFAULT NOW(),
                deleted_at       TIMESTAMPTZ
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_tasks (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                note         TEXT NOT NULL,
                is_completed BOOLEAN DEFAULT false,
                completed_at TIMESTAMPTZ,
                created_at   TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ai_chat_messages (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                role       TEXT NOT NULL,
                content    TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_ai_chat_created ON ai_chat_messages(created_at);
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contact_inquiries (
                id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                source         TEXT NOT NULL DEFAULT 'mnlakehomes',
                name           TEXT NOT NULL,
                email          TEXT NOT NULL,
                phone          TEXT,
                inquirer_type  TEXT,
                message        TEXT NOT NULL,
                page_url       TEXT,
                status         TEXT NOT NULL DEFAULT 'new',
                is_read        BOOLEAN NOT NULL DEFAULT false,
                created_at     TIMESTAMPTZ DEFAULT NOW(),
                updated_at     TIMESTAMPTZ DEFAULT NOW(),
                deleted_at     TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_contact_inquiries_unread ON contact_inquiries(is_read) WHERE is_read = false AND deleted_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_contact_inquiries_created ON contact_inquiries(created_at DESC);
        `);
        // SEO overrides on blog posts — separate columns so the listing
        // page can keep using `excerpt` as the social-preview text while
        // the detail page sets distinct <title> and meta description tags
        // for search. Backward compatible: both nullable; SSR falls back
        // to title / excerpt when blank.
        await pool.query(`
            ALTER TABLE blog_posts
                ADD COLUMN IF NOT EXISTS seo_title       VARCHAR(300),
                ADD COLUMN IF NOT EXISTS seo_description TEXT;
        `);

        // Add deleted_at to blog_posts if it doesn't exist yet (migration for existing tables)
        await pool.query(`
            ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
        `);

        // Lets a blog post be "tagged" to a partner business (by slug). The
        // business profile (/businesses/:slug) renders a "Featured Blogs" section
        // listing the published posts that point at it — see seedBlogPosts and
        // the /businesses/:slug route.
        await pool.query(`
            ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS featured_business_slug TEXT;
            CREATE INDEX IF NOT EXISTS idx_blog_posts_featured_business
                ON blog_posts(featured_business_slug) WHERE featured_business_slug IS NOT NULL;
        `);

        // One-time data fix: the 2026-06-15 evergreen posts were originally
        // seeded with the INTERNAL bucket "Evergreen / Trust" in the visible
        // `tag` column, which the blog list renders verbatim as the badge.
        // Replace it with the reader-facing category. Idempotent and scoped to
        // rows still showing the internal label, so any later admin edit to the
        // tag is preserved (the WHERE no longer matches once it's changed).
        await pool.query(`
            UPDATE blog_posts SET tag = CASE slug
                WHEN 'why-a-local-lake-specialist-beats-a-national-portal' THEN 'Buying a Lake Home'
                WHEN 'how-to-work-with-a-lake-specialist-agent'            THEN 'Working With an Agent'
                WHEN 'what-vetted-licensed-local-means'                    THEN 'How It Works'
                ELSE tag END
            WHERE tag = 'Evergreen / Trust';
        `);

        // One-time data fix: the six evergreen posts (2026-06-15 + 2026-06-16)
        // were all seeded with a flat 6-minute read time. Replace with honest,
        // length-derived values (~225 wpm). Scoped to rows still at the canned
        // 6 so any later admin edit is preserved (WHERE stops matching once
        // the value changes), which also makes it idempotent across deploys.
        await pool.query(`
            UPDATE blog_posts SET read_time_minutes = CASE slug
                WHEN 'what-vetted-licensed-local-means'                    THEN 4
                WHEN 'how-lake-home-matching-works-and-why-its-free-to-you' THEN 5
                WHEN 'why-a-local-lake-specialist-beats-a-national-portal'  THEN 5
                WHEN 'how-to-work-with-a-lake-specialist-agent'            THEN 5
                ELSE read_time_minutes END
            WHERE read_time_minutes = 6 AND slug IN (
                'what-vetted-licensed-local-means',
                'how-lake-home-matching-works-and-why-its-free-to-you',
                'why-a-local-lake-specialist-beats-a-national-portal',
                'how-to-work-with-a-lake-specialist-agent'
            );
        `);

        // Backfill lead table columns for older production databases.
        // These are referenced by /api/admin/leads/:id/assign and related endpoints.
        await pool.query(`
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_user_id UUID;
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_preference VARCHAR(50);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS location_text VARCHAR(255);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_min DECIMAL(15,2);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_max DECIMAL(15,2);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS timeline_text VARCHAR(150);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_payload_json JSONB;
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_page_url VARCHAR(1000);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_page_title VARCHAR(255);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_address TEXT;
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_street VARCHAR(255);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_city VARCHAR(120);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_state VARCHAR(50);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_zip VARCHAR(20);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_place_id VARCHAR(255);
        `);

        // Stripe columns on agents table
        await pool.query(`
            ALTER TABLE agents ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
            ALTER TABLE agents ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
            -- Membership = "what they're SET to" (the perks authority, what
            -- the public profile shows). paid_membership_code = "what they're
            -- actually PAYING for" per Stripe. tier_comped=true means an admin
            -- has manually pinned the membership; the Stripe webhook then
            -- keeps paid_membership_code current but never overwrites the
            -- comped membership_id. Lets admins comp an agent to a higher
            -- tier than they pay for.
            ALTER TABLE agents ADD COLUMN IF NOT EXISTS paid_membership_code VARCHAR(50);
            ALTER TABLE agents ADD COLUMN IF NOT EXISTS tier_comped BOOLEAN NOT NULL DEFAULT FALSE;
        `);

        // HubSpot mirror id — populated by src/services/hubspot.js after a
        // successful upsert. NULL means "not yet synced" (or sync was off
        // when the record was created); we re-attempt on next contact edit.
        await pool.query(`
            ALTER TABLE users              ADD COLUMN IF NOT EXISTS hs_contact_id TEXT;
            ALTER TABLE leads              ADD COLUMN IF NOT EXISTS hs_contact_id TEXT;
            ALTER TABLE contact_inquiries  ADD COLUMN IF NOT EXISTS hs_contact_id TEXT;

            -- Password-reset infrastructure. password_changed_at lets the
            -- JWT middleware reject any session token issued *before* the
            -- last password change — so a reset effectively invalidates
            -- old sessions even though we don't have a token blocklist.
            ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
            -- Normalized phone column for dedup. Stores the digit-only
            -- form of the user's phone, with the leading US country code
            -- (1) stripped if present, so different formats of the same
            -- number compare equal in a simple index lookup. The raw
            -- phone column stays as the user typed it for display.
            ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_normalized VARCHAR(20);
            CREATE INDEX IF NOT EXISTS idx_users_phone_normalized ON users(phone_normalized) WHERE phone_normalized IS NOT NULL;

            -- Per-admin sidebar permissions. NULL = full access (backward
            -- compatible default — every existing admin still sees every
            -- tab). When non-null, must be a JSON array of tab keys
            -- (e.g. ["dashboard","messages","marketing"]) — the sidebar
            -- only renders nav items whose key is in the array. Always
            -- ignored for role='super_admin' (the owner) — they see all.
            ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_tab_permissions JSONB;

            -- Password reset tokens. token_hash stores SHA-256(token) so
            -- a DB leak doesn't expose live reset links. Tokens are
            -- single-use (used_at) and expire (expires_at).
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash  TEXT NOT NULL UNIQUE,
                expires_at  TIMESTAMPTZ NOT NULL,
                used_at     TIMESTAMPTZ,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                ip          TEXT,
                ua          TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_password_reset_user    ON password_reset_tokens(user_id);
            CREATE INDEX IF NOT EXISTS idx_password_reset_active  ON password_reset_tokens(expires_at) WHERE used_at IS NULL;
        `);

        // ── Lead routing infrastructure (Founder/Premium/Basic tiers + round-robin) ──
        // Two new membership tiers. Sort priorities keep ordering intuitive
        // (lower = higher priority): founder 50, top_agent 100, premium 150,
        // mn_lake_specialist 200, basic 300.
        await pool.query(`
            INSERT INTO memberships (name, code, description, display_badge_label, sort_priority)
            VALUES
                ('Founder',  'founder',  'Exclusive founding agent for a service area — receives 70% of leads in that area.', 'Founder',  50),
                ('Premium',  'premium',  'Premium network agent — receives leads via round-robin after the founder.',         'Premium',  150)
            ON CONFLICT (code) DO UPDATE
                SET name                = EXCLUDED.name,
                    description         = EXCLUDED.description,
                    display_badge_label = EXCLUDED.display_badge_label,
                    sort_priority       = EXCLUDED.sort_priority;
        `);

        // Per-tag routing counter powers the 70/30 founder split. Increments on
        // each successful assignment in that tag's geography.
        await safeExec(`
            ALTER TABLE tags ADD COLUMN IF NOT EXISTS lead_routing_counter INTEGER NOT NULL DEFAULT 0;
        `);

        // Per-user (agent) last-routed timestamp for round-robin fairness within a tier.
        // NULL = never routed — picked first. Cleared when a new founder is seated in a tag.
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS last_routed_at TIMESTAMPTZ;
        `);

        // Founder uniqueness: at most one user with membership.code='founder' per tag.
        // Enforced via a partial unique index on user_tags joined to memberships.
        // Materialized column on user_tags + trigger keeps it fast and index-able.
        await safeExec(`
            ALTER TABLE user_tags ADD COLUMN IF NOT EXISTS membership_code VARCHAR(100);
        `);
        // Keep user_tags.membership_code in sync with the agent's current tier.
        await safeExec(`
            UPDATE user_tags ut
               SET membership_code = m.code
              FROM agents a JOIN memberships m ON m.id = a.membership_id
             WHERE a.user_id = ut.user_id
               AND (ut.membership_code IS DISTINCT FROM m.code);
        `);
        await safeExec(`
            CREATE UNIQUE INDEX IF NOT EXISTS ux_user_tags_founder_per_tag
                ON user_tags (tag_id)
                WHERE membership_code = 'founder';
        `);

        // Trigger: whenever an agent's membership_id changes, sync user_tags.membership_code.
        await pool.query(`
            CREATE OR REPLACE FUNCTION sync_user_tags_membership() RETURNS TRIGGER AS $$
            BEGIN
                UPDATE user_tags ut
                   SET membership_code = (SELECT code FROM memberships WHERE id = NEW.membership_id)
                 WHERE ut.user_id = NEW.user_id;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        await pool.query(`
            DROP TRIGGER IF EXISTS trg_sync_user_tags_membership ON agents;
            CREATE TRIGGER trg_sync_user_tags_membership
            AFTER UPDATE OF membership_id ON agents
            FOR EACH ROW EXECUTE FUNCTION sync_user_tags_membership();
        `);
        // And when a new user_tag row is inserted without membership_code set, backfill it.
        await pool.query(`
            CREATE OR REPLACE FUNCTION fill_user_tag_membership() RETURNS TRIGGER AS $$
            BEGIN
                IF NEW.membership_code IS NULL THEN
                    NEW.membership_code := (
                        SELECT m.code FROM agents a
                        JOIN memberships m ON m.id = a.membership_id
                        WHERE a.user_id = NEW.user_id
                    );
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        await safeExec(`
            DROP TRIGGER IF EXISTS trg_fill_user_tag_membership ON user_tags;
            CREATE TRIGGER trg_fill_user_tag_membership
            BEFORE INSERT ON user_tags
            FOR EACH ROW EXECUTE FUNCTION fill_user_tag_membership();
        `);

        // Businesses: social links + 'pending' status for the public
        // self-submission → admin-approve flow. Columns are nullable
        // since most legacy rows won't have them.
        await safeExec(`
            ALTER TABLE businesses ADD COLUMN IF NOT EXISTS instagram_url TEXT;
            ALTER TABLE businesses ADD COLUMN IF NOT EXISTS facebook_url  TEXT;
        `);

        // Business-owner self-service: one user can own one business,
        // listing visibility gated on both admin approval (status='active')
        // AND an active Stripe subscription (subscription_status='active').
        // Legacy admin-seeded rows keep user_id NULL and bypass the
        // subscription check — they're admin-managed, always visible.
        await pool.query(`DO $$ BEGIN
            ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'business_owner';
        EXCEPTION WHEN undefined_object THEN NULL;
        END $$;`);
        // 'client' = end-user accounts (home buyers/browsers, captured at signup).
        await pool.query(`DO $$ BEGIN
            ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'client';
        EXCEPTION WHEN undefined_object THEN NULL;
        END $$;`);
        await safeExec(`
            ALTER TABLE businesses ADD COLUMN IF NOT EXISTS user_id UUID;
            ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT;
            ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
            ALTER TABLE businesses ADD COLUMN IF NOT EXISTS subscription_status    VARCHAR(24);
            ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tier                   VARCHAR(16);
            -- tier = "what they are SET to" (perks authority + public badge).
            -- paid_tier = "what they are actually PAYING for" per Stripe.
            -- tier_comped=true pins the effective tier so the Stripe webhook
            -- keeps paid_tier current but never overwrites a comped tier.
            ALTER TABLE businesses ADD COLUMN IF NOT EXISTS paid_tier   VARCHAR(16);
            ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tier_comped BOOLEAN NOT NULL DEFAULT FALSE;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_user_id
                ON businesses(user_id) WHERE user_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_businesses_stripe_sub
                ON businesses(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
        `);

        // Reminders-style columns on admin_tasks (details + due date)
        await pool.query(`
            ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS details TEXT;
            ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
            CREATE INDEX IF NOT EXISTS idx_admin_tasks_due_date ON admin_tasks(due_date) WHERE is_completed = false;
        `);

        // Activity log — site-wide audit trail of everything that happens.
        // If an older-schema activity_log table already exists (columns like
        // entity_type/action/actor_user_id from database/schema.sql), rename it
        // out of the way so the new schema below can be created fresh.
        await pool.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'activity_log'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'activity_log' AND column_name = 'event_type'
                ) THEN
                    ALTER TABLE activity_log RENAME TO activity_log_legacy;
                END IF;
            END $$;
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS activity_log (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_type    TEXT NOT NULL,
                event_scope   TEXT,
                actor_type    TEXT,
                actor_id      UUID,
                actor_label   TEXT,
                target_type   TEXT,
                target_id     UUID,
                target_label  TEXT,
                details       JSONB,
                ip_address    TEXT,
                user_agent    TEXT,
                severity      TEXT NOT NULL DEFAULT 'info',
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_activity_log_created  ON activity_log(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_activity_log_type     ON activity_log(event_type);
            CREATE INDEX IF NOT EXISTS idx_activity_log_scope    ON activity_log(event_scope);
            CREATE INDEX IF NOT EXISTS idx_activity_log_severity ON activity_log(severity);
        `);

        // Ensure the FK constraint from assigned_user_id → users exists (best-effort)
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE table_name = 'leads' AND constraint_name = 'leads_assigned_user_id_fkey'
                ) THEN
                    ALTER TABLE leads
                    ADD CONSTRAINT leads_assigned_user_id_fkey
                    FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL;
                END IF;
            END $$;
        `);

        // Cash Offer feature — lead table + single-row config table.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cash_offer_leads (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                status TEXT NOT NULL DEFAULT 'new',
                full_name TEXT,
                email TEXT,
                phone TEXT,
                address_raw TEXT,
                place_id TEXT,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                property_data_json JSONB,
                beds NUMERIC,
                baths NUMERIC,
                sqft INTEGER,
                year_built INTEGER,
                lot_size NUMERIC,
                condition TEXT,
                last_sale_date DATE,
                last_sale_price NUMERIC,
                avm NUMERIC,
                offer_amount NUMERIC,
                offer_factors_json JSONB,
                offer_generated_at TIMESTAMPTZ,
                user_selection TEXT,
                selection_made_at TIMESTAMPTZ,
                admin_notes TEXT,
                archived_at TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_cash_offer_leads_created ON cash_offer_leads(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cash_offer_leads_status  ON cash_offer_leads(status) WHERE archived_at IS NULL;
            ALTER TABLE cash_offer_leads ADD COLUMN IF NOT EXISTS source_site   VARCHAR(40);
            ALTER TABLE cash_offer_leads ADD COLUMN IF NOT EXISTS hs_contact_id TEXT;
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cash_offer_config (
                id INT PRIMARY KEY DEFAULT 1,
                discount_factor NUMERIC DEFAULT 0.88,
                holding_cost_pct NUMERIC DEFAULT 0.02,
                target_margin_pct NUMERIC DEFAULT 0.05,
                repair_cost_excellent NUMERIC DEFAULT 0,
                repair_cost_good NUMERIC DEFAULT 5000,
                repair_cost_fair NUMERIC DEFAULT 15000,
                repair_cost_needs_work NUMERIC DEFAULT 35000,
                CONSTRAINT single_row CHECK (id = 1)
            );
            INSERT INTO cash_offer_config (id) VALUES (1) ON CONFLICT DO NOTHING;
            -- Fallback price per sqft for properties RentCast cannot value
            -- (rural lakefront, off-the-grid acreage, etc.). Without this,
            -- the cash-offer funnel returned 0 whenever RentCast had no
            -- coverage. Set to a conservative MN-lake-area baseline; admin
            -- can override per-row from /system Database tab.
            ALTER TABLE cash_offer_config
                ADD COLUMN IF NOT EXISTS fallback_price_per_sqft NUMERIC NOT NULL DEFAULT 300;
        `);

        // Cash-offer partner network — investors / iBuyers / wholesalers the
        // admin forwards inbound cash-offer leads to. One contact per row,
        // with a HubSpot mirror so the partner shows up in HubSpot too. Sends
        // are tracked in cash_offer_sends so the offer's timeline knows who's
        // been pitched and when.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cash_offer_partners (
                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name          TEXT NOT NULL,
                email         TEXT NOT NULL,
                phone         TEXT,
                company       TEXT,
                notes         TEXT,
                hs_contact_id TEXT,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                archived_at   TIMESTAMPTZ
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_offer_partners_email_unique
                ON cash_offer_partners (lower(email));
            CREATE INDEX IF NOT EXISTS idx_cash_offer_partners_active
                ON cash_offer_partners (created_at DESC) WHERE archived_at IS NULL;

            CREATE TABLE IF NOT EXISTS cash_offer_sends (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                offer_id        UUID NOT NULL REFERENCES cash_offer_leads(id) ON DELETE CASCADE,
                partner_id      UUID NOT NULL REFERENCES cash_offer_partners(id) ON DELETE CASCADE,
                sent_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                subject         TEXT,
                message         TEXT,
                hs_note_id      TEXT,
                sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_cash_offer_sends_offer
                ON cash_offer_sends(offer_id, sent_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cash_offer_sends_partner
                ON cash_offer_sends(partner_id, sent_at DESC);
        `);

        // Payment history mirror — one row per Stripe invoice (succeeded
        // or failed) for both agents and businesses. The Stripe webhook
        // inserts on invoice.payment_succeeded / invoice.payment_failed,
        // dedup by stripe_invoice_id so retries are idempotent. hs_note_id
        // tracks the mirrored entry on the contact's HubSpot timeline so
        // admins can deep-link to it from the Payments tab. amount_cents
        // is the Stripe integer (no float drift); convert to dollars at
        // display time only.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id                UUID REFERENCES users(id) ON DELETE SET NULL,
                stripe_customer_id     TEXT,
                stripe_subscription_id TEXT,
                stripe_invoice_id      TEXT UNIQUE,
                stripe_charge_id       TEXT,
                amount_cents           INTEGER NOT NULL DEFAULT 0,
                currency               VARCHAR(8) NOT NULL DEFAULT 'usd',
                status                 VARCHAR(40) NOT NULL,   -- 'paid' | 'failed' | 'refunded'
                description            TEXT,
                invoice_url            TEXT,
                invoice_pdf            TEXT,
                period_start           TIMESTAMPTZ,
                period_end             TIMESTAMPTZ,
                hs_note_id             TEXT,
                created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_payments_user      ON payments(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_payments_invoice   ON payments(stripe_invoice_id);
            CREATE INDEX IF NOT EXISTS idx_payments_status    ON payments(status);
        `);

        // Geographic tag system (see docs/geo-tags.md — lead routing by
        // proximity to a tagged service area). Tables are idempotent and
        // safe to re-run on every boot.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tags (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(150) NOT NULL,
                state VARCHAR(2) NOT NULL,
                region VARCHAR(100),
                latitude NUMERIC(9,6),
                longitude NUMERIC(9,6),
                active BOOLEAN NOT NULL DEFAULT TRUE,
                intro_text      TEXT,
                description     TEXT,
                hero_image_url  TEXT,
                seo_title       VARCHAR(300),
                seo_description TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            -- Backfill for existing deployments where the tags table predates
            -- the town-content fields (intro_text/description/etc).
            ALTER TABLE tags
                ADD COLUMN IF NOT EXISTS intro_text      TEXT,
                ADD COLUMN IF NOT EXISTS description     TEXT,
                ADD COLUMN IF NOT EXISTS hero_image_url  TEXT,
                ADD COLUMN IF NOT EXISTS seo_title       VARCHAR(300),
                ADD COLUMN IF NOT EXISTS seo_description TEXT,
                -- Editorial content for the town-detail public page. Both
                -- nullable; runtime template falls back to region-aware
                -- generated copy from src/services/lake-content-templates.js
                -- when these are blank, so the page is never empty.
                ADD COLUMN IF NOT EXISTS lifestyle_text  TEXT,
                ADD COLUMN IF NOT EXISTS seasons_text    TEXT,
                -- Wikimedia-sourced hero photos legally require visible
                -- attribution for CC BY / CC BY-SA. We render a small
                -- caption under the hero on town-detail when these are set;
                -- if blank (or for CC0/PD), nothing renders.
                ADD COLUMN IF NOT EXISTS hero_image_credit_name TEXT,
                ADD COLUMN IF NOT EXISTS hero_image_credit_url  TEXT,
                ADD COLUMN IF NOT EXISTS hero_image_license     VARCHAR(40);
            CREATE INDEX IF NOT EXISTS idx_tags_state_region ON tags(state, region);
            CREATE INDEX IF NOT EXISTS idx_tags_active_coords ON tags(active, latitude, longitude)
                WHERE active = TRUE AND latitude IS NOT NULL AND longitude IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_tags_name_lower ON tags(lower(name));

            CREATE TABLE IF NOT EXISTS user_tags (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (user_id, tag_id)
            );
            CREATE INDEX IF NOT EXISTS idx_user_tags_tag ON user_tags(tag_id);
            CREATE INDEX IF NOT EXISTS idx_user_tags_user ON user_tags(user_id);

            CREATE TABLE IF NOT EXISTS lead_tags (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
                tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                distance_miles NUMERIC(8,3),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_lead_tags_lead ON lead_tags(lead_id);
            CREATE INDEX IF NOT EXISTS idx_lead_tags_tag  ON lead_tags(tag_id);
        `);

        // Lakes catalog — each lake is its own public hub page
        // (/lakes/<slug>) with its own SEO, imagery, and connected
        // businesses/agents. Parallel to the geo tags system above, but
        // richer (content + SEO + media + join tables).
        await pool.query(`
            CREATE TABLE IF NOT EXISTS lakes (
                id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug               VARCHAR(120) UNIQUE NOT NULL,
                name               VARCHAR(200) NOT NULL,
                state              VARCHAR(2)   NOT NULL DEFAULT 'MN',
                region             VARCHAR(100),
                county             VARCHAR(100),
                latitude           NUMERIC(9,6),
                longitude          NUMERIC(9,6),
                intro_text         TEXT,
                description        TEXT,
                hero_image_url     TEXT,
                featured_image_url TEXT,
                seo_title          VARCHAR(300),
                seo_description    TEXT,
                status             VARCHAR(20) NOT NULL DEFAULT 'draft',
                created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_lakes_state_region ON lakes(state, region);
            CREATE INDEX IF NOT EXISTS idx_lakes_status       ON lakes(status);
            CREATE INDEX IF NOT EXISTS idx_lakes_coords       ON lakes(latitude, longitude)
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_lakes_name_lower   ON lakes(lower(name));
            -- Editorial content for the lake-detail public page. Both
            -- nullable; runtime template falls back to region-aware
            -- generated copy from src/services/lake-content-templates.js
            -- when these are blank, so the page is never empty.
            ALTER TABLE lakes
                ADD COLUMN IF NOT EXISTS lifestyle_text TEXT,
                ADD COLUMN IF NOT EXISTS seasons_text   TEXT,
                -- Public page gallery — JSON array of Cloudinary image URLs.
                -- The lake-detail SSR renders these as a photo grid below the
                -- hero. Empty array (the default) hides the section entirely
                -- so a lake with just the one hero shot doesn't look padded.
                ADD COLUMN IF NOT EXISTS gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
                -- Same Wikimedia-attribution columns as tags: rendered as a
                -- small caption under the hero on lake-detail when set.
                ADD COLUMN IF NOT EXISTS hero_image_credit_name TEXT,
                ADD COLUMN IF NOT EXISTS hero_image_credit_url  TEXT,
                ADD COLUMN IF NOT EXISTS hero_image_license     VARCHAR(40);
            -- Same gallery story for towns (tags table).
            ALTER TABLE tags
                ADD COLUMN IF NOT EXISTS gallery JSONB NOT NULL DEFAULT '[]'::jsonb;
            -- One image per lake, used everywhere: the hero reads
            -- hero_image_url, cards/listings read featured_image_url, and new
            -- writes keep both in lock-step (see lake.controller). Reconcile
            -- existing rows so both columns hold the same URL — preferring
            -- featured_image_url (the canonical card image), falling back to
            -- hero. Safe to overwrite divergent rows because no admin surface
            -- ever set the two columns to different images; divergence only
            -- ever came from seed data.
            UPDATE lakes
               SET hero_image_url     = COALESCE(featured_image_url, hero_image_url),
                   featured_image_url = COALESCE(featured_image_url, hero_image_url)
             WHERE featured_image_url IS DISTINCT FROM hero_image_url;

            CREATE TABLE IF NOT EXISTS agent_lakes (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                lake_id     UUID NOT NULL REFERENCES lakes(id)  ON DELETE CASCADE,
                is_featured BOOLEAN NOT NULL DEFAULT FALSE,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (agent_id, lake_id)
            );
            CREATE INDEX IF NOT EXISTS idx_agent_lakes_lake  ON agent_lakes(lake_id);
            CREATE INDEX IF NOT EXISTS idx_agent_lakes_agent ON agent_lakes(agent_id);

            CREATE TABLE IF NOT EXISTS blog_post_lakes (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                blog_post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
                lake_id      UUID NOT NULL REFERENCES lakes(id)      ON DELETE CASCADE,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (blog_post_id, lake_id)
            );
            CREATE INDEX IF NOT EXISTS idx_blog_post_lakes_lake ON blog_post_lakes(lake_id);
            CREATE INDEX IF NOT EXISTS idx_blog_post_lakes_post ON blog_post_lakes(blog_post_id);

            -- Nearby-towns join: reuses the existing tags catalog (each tag
            -- is a town). One lake can be near many towns and one town can
            -- border many lakes.
            CREATE TABLE IF NOT EXISTS lake_tags (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                lake_id    UUID NOT NULL REFERENCES lakes(id) ON DELETE CASCADE,
                tag_id     UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (lake_id, tag_id)
            );
            CREATE INDEX IF NOT EXISTS idx_lake_tags_lake ON lake_tags(lake_id);
            CREATE INDEX IF NOT EXISTS idx_lake_tags_tag  ON lake_tags(tag_id);
        `);

        // Businesses catalog — unified table for restaurants, marinas,
        // service providers, photographers, builders, boat rentals and
        // other local categories. Each business can connect to multiple
        // lakes via business_lakes. `type` is loose (VARCHAR) so new
        // categories can be added without a migration; the admin UI
        // defaults to a known set.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS businesses (
                id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug                VARCHAR(160) UNIQUE NOT NULL,
                name                VARCHAR(200) NOT NULL,
                type                VARCHAR(40)  NOT NULL,
                description         TEXT,
                phone               VARCHAR(50),
                email               VARCHAR(255),
                website_url         TEXT,
                address             TEXT,
                city                VARCHAR(120),
                state               VARCHAR(2)   NOT NULL DEFAULT 'MN',
                zip                 VARCHAR(20),
                latitude            NUMERIC(9,6),
                longitude           NUMERIC(9,6),
                hours               TEXT,
                price_range         VARCHAR(20),
                featured_image_url  TEXT,
                gallery             JSONB NOT NULL DEFAULT '[]'::jsonb,
                status              VARCHAR(20) NOT NULL DEFAULT 'active',
                created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_businesses_type    ON businesses(type);
            CREATE INDEX IF NOT EXISTS idx_businesses_status  ON businesses(status);
            CREATE INDEX IF NOT EXISTS idx_businesses_name_lower ON businesses(lower(name));
            CREATE INDEX IF NOT EXISTS idx_businesses_city_lower ON businesses(lower(city));

            CREATE TABLE IF NOT EXISTS business_lakes (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
                lake_id     UUID NOT NULL REFERENCES lakes(id)      ON DELETE CASCADE,
                is_featured BOOLEAN NOT NULL DEFAULT FALSE,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (business_id, lake_id)
            );
            CREATE INDEX IF NOT EXISTS idx_business_lakes_lake     ON business_lakes(lake_id);
            CREATE INDEX IF NOT EXISTS idx_business_lakes_business ON business_lakes(business_id);

            -- Businesses ↔ towns (geo tags). Primary geographic association
            -- post-pivot — the admin picks which towns a business serves,
            -- capped at 10. Town pages render their "Local businesses"
            -- section directly from this join so they don't have to go
            -- lake → business_lakes transitively. business_lakes stays
            -- as a separate "pin to a specific lake page" admin tool.
            CREATE TABLE IF NOT EXISTS business_tags (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
                tag_id      UUID NOT NULL REFERENCES tags(id)       ON DELETE CASCADE,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (business_id, tag_id)
            );

            -- Simple first-party pageview analytics. No external services,
            -- no cookies — just a path + a timestamp + a referrer and a
            -- hashed visitor token. Lets us see traffic volumes, top
            -- pages, and referrers without handing data to GA4.
            CREATE TABLE IF NOT EXISTS page_views (
                id          BIGSERIAL PRIMARY KEY,
                path        TEXT NOT NULL,
                referrer    TEXT,
                visitor_hash TEXT,
                ua          TEXT,
                session_id  TEXT,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_page_views_created   ON page_views(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_page_views_path      ON page_views(path);
            CREATE INDEX IF NOT EXISTS idx_page_views_visitor   ON page_views(visitor_hash);
            CREATE INDEX IF NOT EXISTS idx_business_tags_tag      ON business_tags(tag_id);
            CREATE INDEX IF NOT EXISTS idx_business_tags_business ON business_tags(business_id);

            -- One-shot backfill: existing admin-linked businesses (via
            -- business_lakes) inherit town links from their lakes'
            -- lake_tags rows. ON CONFLICT makes this safe on every boot;
            -- admin edits to business_tags are never overwritten.
            INSERT INTO business_tags (business_id, tag_id)
            SELECT DISTINCT bl.business_id, lt.tag_id
            FROM business_lakes bl
            JOIN lake_tags lt ON lt.lake_id = bl.lake_id
            ON CONFLICT (business_id, tag_id) DO NOTHING;
        `);

        // Generic key/value app config (match radius lives here; more knobs
        // will follow). JSON-typed so future values can be objects.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_config (
                key VARCHAR(100) PRIMARY KEY,
                value JSONB NOT NULL,
                description TEXT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            INSERT INTO app_config (key, value, description) VALUES
                ('match_radius_miles',        '15'::jsonb, 'Default radius (miles) used to match leads to tagged users.'),
                ('signup_max_service_areas',  '10'::jsonb, 'Max service-area tags an agent can pick during self-signup. Admins are not capped.')
            ON CONFLICT (key) DO NOTHING;
        `);

        // Resources catalog — curated guides, tools, calculators, etc.
        // The public /pages/public/resources.html page and the admin
        // read-only view both read from this table. Indexes chosen for
        // the common list queries (filter by active+category, sort by
        // created_at, feature-pin sort).
        await pool.query(`
            CREATE TABLE IF NOT EXISTS resources (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug VARCHAR(120) UNIQUE NOT NULL,
                title VARCHAR(300) NOT NULL,
                description TEXT,
                category VARCHAR(80) NOT NULL,
                resource_type VARCHAR(40) NOT NULL,
                url TEXT NOT NULL,
                thumbnail_url TEXT,
                tags JSONB NOT NULL DEFAULT '[]'::jsonb,
                featured BOOLEAN NOT NULL DEFAULT FALSE,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_resources_active_category
                ON resources(active, category) WHERE active = TRUE;
            CREATE INDEX IF NOT EXISTS idx_resources_active_created
                ON resources(created_at DESC) WHERE active = TRUE;
            CREATE INDEX IF NOT EXISTS idx_resources_featured
                ON resources(featured, created_at DESC)
                WHERE active = TRUE AND featured = TRUE;
            CREATE INDEX IF NOT EXISTS idx_resources_title_lower
                ON resources(lower(title));
        `);

        // Seed resources catalog — same idempotent pattern as tags.
        const RESOURCES_SEED = require('./database/resources-seed');
        if (Array.isArray(RESOURCES_SEED) && RESOURCES_SEED.length) {
            const values = [];
            const params = [];
            RESOURCES_SEED.forEach((r, i) => {
                const base = i * 9;
                values.push(`($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}::jsonb, $${base+9})`);
                params.push(
                    r.slug, r.title, r.description || null, r.category,
                    r.resource_type, r.url, r.thumbnail_url || null,
                    JSON.stringify(r.tags || []), !!r.featured,
                );
            });
            await pool.query(
                `INSERT INTO resources (slug, title, description, category, resource_type, url, thumbnail_url, tags, featured)
                 VALUES ${values.join(', ')}
                 ON CONFLICT (slug) DO NOTHING`,
                params
            );
        }

        // Seed the geographic tags catalog. ON CONFLICT (slug) DO NOTHING
        // makes this safe to run on every boot — existing tags are left
        // alone (so admin tweaks aren't overwritten).
        const TAGS_SEED = require('./database/tags-seed');
        if (Array.isArray(TAGS_SEED) && TAGS_SEED.length) {
            const values = [];
            const params = [];
            TAGS_SEED.forEach((t, i) => {
                const base = i * 6;
                values.push(`($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6})`);
                params.push(t.slug, t.name, t.state, t.region, t.latitude, t.longitude);
            });
            await pool.query(
                `INSERT INTO tags (slug, name, state, region, latitude, longitude)
                 VALUES ${values.join(', ')}
                 ON CONFLICT (slug) DO NOTHING`,
                params
            );
        }

        // Seed the lakes catalog. Same idempotent ON CONFLICT (slug) DO
        // NOTHING pattern — admin edits to an existing lake are never
        // overwritten by a redeploy.
        const LAKES_SEED = require('./database/lakes-seed');
        if (Array.isArray(LAKES_SEED) && LAKES_SEED.length) {
            const values = [];
            const params = [];
            LAKES_SEED.forEach((l, i) => {
                const base = i * 17;
                values.push(`($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10}, $${base+11}, $${base+12}, $${base+13}, $${base+14}, $${base+15}, $${base+16}, $${base+17})`);
                params.push(
                    l.slug, l.name, l.state || 'MN', l.region || null, l.county || null,
                    l.latitude ?? null, l.longitude ?? null,
                    l.intro_text || null, l.seo_title || null, l.seo_description || null,
                    l.status || 'draft',
                    l.description || null,
                    l.hero_image_url || null,
                    l.featured_image_url || null,
                    l.hero_image_credit_name || null,
                    l.hero_image_credit_url  || null,
                    l.hero_image_license     || null,
                );
            });
            await pool.query(
                `INSERT INTO lakes
                   (slug, name, state, region, county, latitude, longitude,
                    intro_text, seo_title, seo_description, status, description,
                    hero_image_url, featured_image_url,
                    hero_image_credit_name, hero_image_credit_url, hero_image_license)
                 VALUES ${values.join(', ')}
                 ON CONFLICT (slug) DO NOTHING`,
                params
            );
        }

        // Sensible default lake ↔ town (geo tag) links. Each entry maps a
        // lake slug to the town slugs that live on or border that lake.
        // The seed only fires for lakes that have ZERO tags attached
        // (pristine defaults) — once an admin touches a lake's town set
        // in the admin UI, this seed stops touching that lake entirely.
        // So detachments stick, and new seeded lakes get populated.
        const LAKE_TOWN_SEED = {
            'lake-minnetonka':   ['wayzata','orono','excelsior','minnetonka-beach','minnetonka','shorewood','spring-park','tonka-bay','greenwood','deephaven','mound'],
            'gull-lake':         ['nisswa','brainerd','baxter'],
            'leech-lake':        ['walker','hackensack','cass-lake'],
            'lake-vermilion':    ['ely'],
            'lake-of-the-woods': ['baudette','roseau'],
            'detroit-lake':      ['detroit-lakes'],
            'pelican-lake':      ['pelican-rapids','detroit-lakes'],
            'cass-lake':         ['cass-lake','bemidji'],
            'white-bear-lake':   ['white-bear-lake','mahtomedi','lino-lakes'],
        };
        const seedPairs = [];
        Object.entries(LAKE_TOWN_SEED).forEach(([lakeSlug, townSlugs]) => {
            townSlugs.forEach(townSlug => seedPairs.push([lakeSlug, townSlug]));
        });
        if (seedPairs.length) {
            const values = seedPairs.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(', ');
            const params = seedPairs.flat();
            await pool.query(
                `INSERT INTO lake_tags (lake_id, tag_id)
                 SELECT l.id, t.id
                 FROM (VALUES ${values}) AS v(lake_slug, tag_slug)
                 JOIN lakes l ON l.slug = v.lake_slug
                 JOIN tags  t ON t.slug = v.tag_slug
                 WHERE NOT EXISTS (SELECT 1 FROM lake_tags lt WHERE lt.lake_id = l.id)
                 ON CONFLICT (lake_id, tag_id) DO NOTHING`,
                params
            );
        }

        // One-shot backfill of richer Lake Minnetonka copy. Only fills in
        // NULL fields so admin edits are never overwritten, and only
        // replaces the short original seeded intro_text if nobody has
        // touched it since the first deploy.
        await pool.query(`
            UPDATE lakes SET
                intro_text         = 'Discover the pinnacle of Minnesota luxury. Unmatched waterfront estates, private yacht clubs, and elite dining — just 30 minutes from the Twin Cities.',
                description        = COALESCE(description, $1),
                hero_image_url     = COALESCE(hero_image_url, '/assets/images/mn-winter-birch-chalet.jpg'),
                featured_image_url = COALESCE(featured_image_url, hero_image_url, '/assets/images/mn-winter-birch-chalet.jpg')
            WHERE slug = 'lake-minnetonka'
              AND (intro_text IS NULL
                   OR intro_text = 'Minnesota''s premier luxury lake — 14,528 acres of waterfront living across Wayzata, Orono, Excelsior, and Minnetonka Beach.')
        `, [
            "Lake Minnetonka isn't just a body of water — it's Minnesota's premier social and recreational playground. 14,528 acres of waterfront living stretch across Wayzata, Orono, Excelsior, and Minnetonka Beach, with a sprawling network of deep-water access, private docks, and transient slips at local institutions like Lord Fletcher's.\n\nOwn a lake home here and you get front-row VIP access to spectacular 4th of July fireworks, quiet morning paddle-boarding coves, and world-class walleye fishing 30 feet from your back patio. From historic generational estates overlooking Gray's Bay to ultra-modern glass marvels along Orono's shoreline, Lake Minnetonka's housing inventory represents the pinnacle of Midwestern architecture.",
        ]);

        // ── Marketing posts (social-media ideation calendar) ────────
        // Owned by the admin "Marketing" tab. One row per planned post or
        // idea, with an optional due_date powering the dashboard's 1-week
        // calendar strip and the Social Media tab's chronological view.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS marketing_posts (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title       VARCHAR(300) NOT NULL,
                description TEXT,
                due_date    DATE,
                channel     VARCHAR(40),
                status      VARCHAR(20) NOT NULL DEFAULT 'idea',
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_marketing_posts_due    ON marketing_posts(due_date);
            CREATE INDEX IF NOT EXISTS idx_marketing_posts_status ON marketing_posts(status);
        `);

        // Day-0 launch baselines + any subsequent snapshots. Each row is a
        // frozen JSON blob of counter values for every table that matters,
        // so the launch team can later say "we had X agents on day-0, Y on
        // day-30." Indexed by label so multiple named snapshots (e.g.
        // 'day_0_launch', 'pre_seo_push') can coexist.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS analytics_baselines (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                label       VARCHAR(80) NOT NULL,
                note        TEXT,
                counters    JSONB NOT NULL,
                created_by  UUID,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_analytics_baselines_label   ON analytics_baselines(label);
            CREATE INDEX IF NOT EXISTS idx_analytics_baselines_created ON analytics_baselines(created_at DESC);
        `);

        // Server-side mirror of every conversion event fired by the
        // frontend trackConversion() helper. GA4 + HubSpot already see
        // these client-side; this table exists so the admin can show
        // conversion counts and a live feed without needing to query
        // GA4 / HubSpot APIs. Rows are append-only and untrimmed — at
        // ~50 conversions/day this is a few thousand rows/year, well
        // under any concern threshold.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversion_events (
                id          BIGSERIAL PRIMARY KEY,
                event_name  VARCHAR(60) NOT NULL,
                form_name   VARCHAR(80),
                params      JSONB,
                path        TEXT,
                referrer    TEXT,
                session_id  TEXT,
                ua          TEXT,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_conversion_events_created  ON conversion_events(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_conversion_events_name     ON conversion_events(event_name);
            CREATE INDEX IF NOT EXISTS idx_conversion_events_formname ON conversion_events(form_name);
        `);

        // Site-wide image catalog — every <img src> + CSS background-image
        // discovered by scanning the static HTML files. Admin can set an
        // override_url and the frontend resolver in components.js swaps
        // any matching src at page load. NULL override = use original_src.
        // Rebuilt on every server boot by scripts/site-images-scan.js
        // (which only INSERTs new rows — it never overwrites overrides).
        await pool.query(`
            CREATE TABLE IF NOT EXISTS site_images (
                id              SERIAL PRIMARY KEY,
                original_src    TEXT UNIQUE NOT NULL,
                override_url    TEXT,
                page_paths      TEXT[] NOT NULL DEFAULT '{}',
                description     TEXT,
                first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_site_images_original_src ON site_images(original_src);
            CREATE INDEX IF NOT EXISTS idx_site_images_has_override ON site_images((override_url IS NOT NULL));
        `);

        // One-way admin → agent in-app messages. Admin sends from the
        // global Messages tab or from inside an agent's profile; the agent
        // reads them in their portal but can't reply. read_at powers the
        // agent's unread badge.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS agent_messages (
                id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                sender_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
                body              TEXT NOT NULL,
                read_at           TIMESTAMPTZ,
                created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_agent_messages_recipient ON agent_messages(recipient_user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_agent_messages_unread    ON agent_messages(recipient_user_id) WHERE read_at IS NULL;
        `);

        // Admin notes about an agent (internal CRM notes on the agent's
        // backend profile). hs_note_id holds the synced HubSpot note
        // engagement id once it's pushed to the agent's contact timeline.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS agent_notes (
                id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                agent_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                body           TEXT NOT NULL,
                hs_note_id     TEXT,
                created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_agent_notes_agent ON agent_notes(agent_user_id, created_at DESC);
        `);

        console.log(' Tables verified.');

        // Migrate default seeded cover images from Unsplash URLs to local /assets/images/ paths
        await pool.query(`
            UPDATE blog_posts SET cover_image_url = '/assets/images/mn-purple-sunset-marina.webp'
              WHERE slug = 'top-10-minnesota-lakes-for-boating'    AND cover_image_url LIKE 'https://images.unsplash.com/%';
            UPDATE blog_posts SET cover_image_url = '/assets/images/mn-rustic-modern-lake-house.jpg'
              WHERE slug = 'how-to-stage-your-cabin-for-maximum-value' AND cover_image_url LIKE 'https://images.unsplash.com/%';
            UPDATE blog_posts SET cover_image_url = '/assets/images/mn-canoe-shore.webp'
              WHERE slug = 'discovering-the-magic-of-northern-minnesota' AND cover_image_url LIKE 'https://images.unsplash.com/%';
            UPDATE blog_posts SET cover_image_url = '/assets/images/mn-canoe-shore.webp'
              WHERE slug = 'discovering-the-magic-of-northern-minnesota' AND cover_image_url = '/assets/images/mn-wilderness-lake-dock.jpg';
            UPDATE blog_posts SET cover_image_url = '/assets/images/mn-cape-cod-lakefront.jpg'
              WHERE slug = '5-things-to-look-for-in-a-lake-property'    AND cover_image_url LIKE 'https://images.unsplash.com/%';
        `);

        // Clear any broken local-filesystem agent photo URLs — these were lost on
        // every deploy before Cloudinary was wired up. Agents need to re-upload.
        await pool.query(`
            UPDATE agents
               SET profile_photo_url = NULL
             WHERE profile_photo_url LIKE '/assets/images/agents/%';
        `);

        await seedBlogPosts();
        await seedBlogRelatedLinks();
        await seedTownContent();
        await seedPartnerBusinesses();
    } catch (err) {
        console.error(' Table migration warning:', err.message);
    }
}

// Featured partner businesses we publish editorially (e.g. local-spotlight
// blog subjects). Source-of-truth: re-applied on every boot so the profile
// stays live and in sync with the spotlight that links to it.
async function seedPartnerBusinesses() {
    const partners = [
        {
            slug: 'granite-city-aerial-media',
            name: 'Granite City Aerial Media',
            type: 'photographer',
            description: 'Premium drone photography and cinematic video for Minnesota real estate — aerial stills, interior photography, and social content that shows a lake home (and its shoreline, frontage, and lot) the way buyers actually want to see it. Based near St. Cloud, traveling statewide.',
            phone: null,
            email: null,
            website_url: 'https://granitecityaerialmedia.com',
            instagram_url: 'https://www.instagram.com/granitecityaerial',
            // Exact Facebook page URL unverified — left null so we don't ship a
            // broken social link. Add it here once confirmed.
            facebook_url: null,
            city: 'St. Cloud',
            state: 'MN',
            featured_image_url: '/assets/images/blog/hero-local-spotlight-granite-city-aerial-media.jpg',
        },
    ];
    let n = 0;
    for (const b of partners) {
        const r = await pool.query(`
            INSERT INTO businesses
                (slug, name, type, description, phone, email, website_url,
                 instagram_url, facebook_url, city, state, featured_image_url, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active')
            ON CONFLICT (slug) DO UPDATE SET
                name = EXCLUDED.name, type = EXCLUDED.type,
                description = EXCLUDED.description, website_url = EXCLUDED.website_url,
                instagram_url = EXCLUDED.instagram_url, facebook_url = EXCLUDED.facebook_url,
                city = EXCLUDED.city, state = EXCLUDED.state,
                featured_image_url = EXCLUDED.featured_image_url,
                status = 'active', updated_at = NOW()
        `, [
            b.slug, b.name, b.type, b.description, b.phone, b.email, b.website_url,
            b.instagram_url, b.facebook_url, b.city, b.state, b.featured_image_url,
        ]);
        n += r.rowCount;
    }
    if (n > 0) console.log(` Seeded/updated ${n} partner business(es).`);
}

// ─── Backfill missing business coordinates ──────────────────────────────
// One-shot pass on every boot. Picks up any business that has an address
// or city but no lat/lng (most commonly: admin-created rows from before
// the PATCH auto-geocode fix landed) and geocodes them. Silent-per-row
// on geocode failure so a flaky Google response doesn't block startup.
async function backfillBusinessCoords() {
    try {
        const { rows } = await pool.query(`
            SELECT id, address, city, state, zip
            FROM businesses
            WHERE status = 'active'
              AND (latitude IS NULL OR longitude IS NULL)
              AND (address IS NOT NULL OR city IS NOT NULL)
            LIMIT 100
        `);
        if (!rows.length) return;
        const { geocodeAddress } = require('./services/geocoder');
        let filled = 0;
        for (const b of rows) {
            const addr = [b.address, b.city, b.state || 'MN', b.zip].filter(Boolean).join(', ');
            const g = await geocodeAddress(addr).catch(() => null);
            if (!g) continue;
            await pool.query(
                `UPDATE businesses SET latitude = $1, longitude = $2, updated_at = NOW() WHERE id = $3`,
                [g.lat, g.lng, b.id]
            );
            filled++;
        }
        if (filled) console.log(` Backfilled coordinates for ${filled}/${rows.length} active business(es).`);
    } catch (err) {
        console.warn(' Coord backfill skipped:', err.message);
    }
}

async function seedBlogPosts() {
    // Idempotent: inserts any canonical post from default-blog-posts.js whose
    // slug isn't already in the table — on EVERY startup, not just when the
    // table is empty. ON CONFLICT (slug) DO NOTHING means existing rows (admin
    // edits, separately-imported posts) are never touched; this only fills in
    // posts that are missing. That's what makes a git push of a new post in
    // default-blog-posts.js actually publish it on the next deploy.
    const { posts } = require('./data/default-blog-posts');
    // Staged drafts (is_published:false) — inserted so they appear in the admin
    // Blog list ready to publish, but stay off the public site until then.
    let drafts = [];
    try { drafts = require('./data/blog-drafts'); } catch (_) { drafts = []; }
    let added = 0;
    for (const p of [...posts, ...drafts]) {
        const r = await pool.query(`
            INSERT INTO blog_posts
                (title, slug, excerpt, body, cover_image_url, tag,
                 read_time_minutes, is_published, published_at, author_name,
                 seo_title, seo_description, featured_business_slug)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            ON CONFLICT (slug) DO NOTHING
        `, [
            p.title, p.slug, p.excerpt, p.body, p.cover_image_url, p.tag,
            p.read_time_minutes || 5, p.is_published !== false,
            p.published_at || new Date(), p.author_name || 'MN Lake Homes Team',
            p.seo_title || null, p.seo_description || null,
            p.featured_business_slug || null,
        ]);
        added += r.rowCount;
    }
    if (added > 0) console.log(` Seeded ${added} missing blog post(s).`);
}

// Internal-linking pass for ALREADY-PUBLISHED "island" posts that predate the
// current content library. seedBlogPosts() uses ON CONFLICT DO NOTHING, so it
// can't add links to existing rows — this appends a curated "Keep reading"
// block (2 contextual siblings + a tool/money page) via UPDATE. Idempotent: the
// `NOT LIKE '%kr-related%'` guard means it runs once per post and re-deploys are
// no-ops. All targets are live posts, so the links never 404.
async function seedBlogRelatedLinks() {
    const MAP = {
        '5-things-to-look-for-in-a-lake-property': [
            ['/blog/buying-a-cabin-in-minnesota-2026-guide', 'Buying a cabin in Minnesota'],
            ['/blog/minnesota-shoreland-rules-before-you-buy', 'Minnesota shoreland rules'],
            ['/lake-buyer-checklist', 'the buyer’s checklist'],
        ],
        'top-10-minnesota-lakes-for-boating': [
            ['/blog/best-minnesota-lakes-for-families', 'best lakes for families'],
            ['/blog/lake-minnetonka-vs-brainerd-lakes', 'Minnetonka vs. the Brainerd Lakes'],
            ['/find-your-lake', 'the Find Your Lake quiz'],
        ],
        'how-to-stage-your-cabin-for-maximum-value': [
            ['/blog/how-to-sell-a-lake-home-in-minnesota', 'how to sell a lake home'],
            ['/blog/true-cost-of-owning-a-minnesota-lake-cabin', 'the true cost of owning a cabin'],
            ['/pages/public/sell.html', 'get a free valuation'],
        ],
        'discovering-the-magic-of-northern-minnesota': [
            ['/blog/best-minnesota-lakes-for-families', 'best lakes for families'],
            ['/blog/lake-minnetonka-vs-brainerd-lakes', 'Minnetonka vs. the Brainerd Lakes'],
            ['/find-your-lake', 'find your lake'],
        ],
        'buying-lakefront-why-a-general-agent-isnt-enough': [
            ['/blog/5-things-to-look-for-in-a-lake-property', '5 things to look for in a lake property'],
            ['/blog/true-cost-of-owning-a-minnesota-lake-cabin', 'the true cost of owning a cabin'],
            ['/pages/public/buy.html', 'get matched with a specialist'],
        ],
        'how-lake-home-matching-works-and-why-its-free-to-you': [
            ['/blog/buying-lakefront-why-a-general-agent-isnt-enough', 'why a general agent isn’t enough'],
            ['/blog/best-minnesota-lakes-for-families', 'best lakes for families'],
            ['/pages/public/buy.html', 'get matched — free'],
        ],
        'questions-to-ask-before-you-pick-a-lake-agent': [
            ['/blog/buying-lakefront-why-a-general-agent-isnt-enough', 'why a general agent isn’t enough'],
            ['/blog/how-lake-home-matching-works-and-why-its-free-to-you', 'how matching works'],
            ['/pages/public/buy.html', 'get matched with a specialist'],
        ],
        'local-spotlight-granite-city-aerial-media': [
            ['/blog/how-to-sell-a-lake-home-in-minnesota', 'how to sell a lake home'],
            ['/blog/how-to-stage-your-cabin-for-maximum-value', 'staging your cabin for sale'],
            ['/pages/public/sell.html', 'get a free valuation'],
        ],
        'best-minnesota-lakes-for-families': [
            ['/blog/buying-a-cabin-in-minnesota-2026-guide', 'buying a cabin in Minnesota'],
            ['/blog/true-cost-of-owning-a-minnesota-lake-cabin', 'the true cost of owning a cabin'],
            ['/find-your-lake', 'the Find Your Lake quiz'],
        ],
        'lake-minnetonka-vs-brainerd-lakes': [
            ['/blog/best-minnesota-lakes-for-families', 'best lakes for families'],
            ['/blog/buying-a-cabin-in-minnesota-2026-guide', 'buying a cabin in Minnesota'],
            ['/find-your-lake', 'find your lake'],
        ],
        'minnesota-lakefront-property-taxes-explained': [
            ['/blog/true-cost-of-owning-a-minnesota-lake-cabin', 'the true cost of owning a cabin'],
            ['/blog/how-to-sell-a-lake-home-in-minnesota', 'how to sell a lake home'],
            ['/lake-mortgage-calculator', 'the cost calculator'],
        ],
        'minnesota-shoreland-rules-before-you-buy': [
            ['/blog/5-things-to-look-for-in-a-lake-property', '5 things to look for in a lake property'],
            ['/blog/buying-a-cabin-in-minnesota-2026-guide', 'buying a cabin in Minnesota'],
            ['/lake-buyer-checklist', 'the buyer’s checklist'],
        ],
        'best-walleye-lakes-in-minnesota': [
            ['/blog/lake-minnetonka-vs-brainerd-lakes', 'Minnetonka vs. the Brainerd Lakes'],
            ['/blog/best-minnesota-lakes-for-families', 'best lakes for families'],
            ['/find-your-lake', 'the Find Your Lake quiz'],
        ],
    };
    let n = 0;
    for (const [slug, links] of Object.entries(MAP)) {
        const inner = links.map(([href, label]) => `<a href="${href}">${label}</a>`).join(' &middot; ');
        const block = `\n<div class="kr-related" style="margin-top:2.5rem;padding-top:1.25rem;border-top:1px solid #edf2f7;font-size:0.95rem;color:#4a5568;"><strong>Keep reading:</strong> ${inner}</div>`;
        const r = await pool.query(
            `UPDATE blog_posts
                SET body = COALESCE(body, '') || $2, updated_at = NOW()
              WHERE slug = $1
                AND COALESCE(body, '') NOT LIKE '%kr-related%'
                AND deleted_at IS NULL`,
            [slug, block]
        );
        n += r.rowCount;
    }
    if (n > 0) console.log(` Added internal-link blocks to ${n} blog post(s).`);
}

async function seedTownContent() {
    // Curate individual town pages on deploy. Each town's tag row already
    // exists (from tags-seed.js); this fills in the hero + long-form content
    // and flips it active so the page actually renders at /towns/<slug>.
    //
    // These towns are treated as SOURCE-OF-TRUTH: src/data/town-content.js is
    // the canonical copy/hero, re-applied on every boot (so a launch town
    // can't be left inactive or half-curated). To change a listed town's copy
    // or hero, edit town-content.js — admin edits to these specific slugs are
    // re-applied on the next deploy. (Earlier versions guarded on an empty
    // hero, which silently skipped towns that already had a hero set but were
    // inactive — that's why Nisswa/Walker stayed 404.)
    const towns = require('./data/town-content');
    let curated = 0;
    for (const t of towns) {
        const r = await pool.query(`
            UPDATE tags
               SET intro_text      = $2,
                   description     = $3,
                   seo_title       = $4,
                   seo_description = $5,
                   hero_image_url  = $6,
                   active          = TRUE,
                   updated_at      = NOW()
             WHERE slug = $1
        `, [t.slug, t.intro_text, t.description, t.seo_title, t.seo_description, t.hero_image_url]);
        curated += r.rowCount;
    }
    if (curated > 0) console.log(` Curated ${curated} town page(s).`);

    // Refresh lake hero subtitles to the curated 20-25 word versions. Prod is
    // deploy-only, so this runs on boot rather than via a direct DB write.
    // Source of truth for these slugs (re-applied each deploy).
    const lakeIntros = require('./data/lake-intros');
    let lakeFixed = 0;
    for (const [slug, intro] of Object.entries(lakeIntros)) {
        const r = await pool.query(
            'UPDATE lakes SET intro_text = $2, updated_at = NOW() WHERE slug = $1',
            [slug, intro]
        );
        lakeFixed += r.rowCount;
    }
    if (lakeFixed > 0) console.log(` Refreshed ${lakeFixed} lake hero subtitle(s).`);

    // Unique "Life on…" / "Seasons" body copy for high-traffic lakes (replaces
    // the templated fallback). Source of truth for these slugs; re-applied each
    // boot. Batch 1 — extend src/data/lake-content.js to cover more lakes.
    const lakeContent = require('./data/lake-content');
    let lakeBodies = 0;
    for (const [slug, c] of Object.entries(lakeContent)) {
        const r = await pool.query(
            'UPDATE lakes SET lifestyle_text = $2, seasons_text = $3, updated_at = NOW() WHERE slug = $1',
            [slug, c.lifestyle, c.seasons]
        );
        lakeBodies += r.rowCount;
    }
    if (lakeBodies > 0) console.log(` Refreshed ${lakeBodies} lake body section(s).`);

    // Unique town body copy (description only — never touches hero/intro, so
    // the fully-curated towns in town-content.js are untouched). Replaces the
    // templated about-section fallback on every other rendering town.
    const townDescriptions = require('./data/town-descriptions');
    let townDescN = 0;
    for (const [slug, description] of Object.entries(townDescriptions)) {
        const r = await pool.query(
            'UPDATE tags SET description = $2, updated_at = NOW() WHERE slug = $1 AND active = TRUE',
            [slug, description]
        );
        townDescN += r.rowCount;
    }
    if (townDescN > 0) console.log(` Set ${townDescN} town description(s).`);
}

// ==========================================
// INITIALIZE
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`=======================================`);
    console.log(` MN LAKE HOMES PLATFORM ENGINE `);
    console.log(` Environment  : ${process.env.NODE_ENV || 'local'}`);
    console.log(` Listening on : http://localhost:${PORT}`);
    console.log(` Connected to : PostgreSQL Database`);
    console.log(`=======================================`);
    await ensureTables();
    await backfillBusinessCoords();

    // Push every existing contact (users / leads / inquiries) into HubSpot
    // in the background. Idempotent — only touches rows whose hs_contact_id
    // is still NULL. Throttled internally to respect rate limits. Runs as
    // fire-and-forget so a flaky HubSpot can't delay startup.
    (async () => {
        try {
            const hubspot = require('./services/hubspot');
            await hubspot.backfillExistingRecords(pool);
        } catch (err) {
            console.error('[hubspot.backfill] failed:', err.message);
        }
    })();

    // Site-image discovery — walks every public HTML/CSS file and upserts
    // each unique <img src> / background-image URL into site_images. Lets
    // the admin Images page show every image on the site even though the
    // HTML files are still plain static. Runs as fire-and-forget so a
    // scan error never delays startup.
    (async () => {
        try {
            const { scanAndSync } = require('./services/site-images-scan');
            await scanAndSync(pool);
        } catch (err) {
            console.error('[site-images.scan] failed:', err.message);
        }
    })();
});
