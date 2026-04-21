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
app.use('/api/businesses', require('./routes/business.routes'));
app.use('/api/resources', require('./routes/resource.routes'));

app.get('/api/health', (req, res) => {
    res.json({
        status: 'live',
        environment: process.env.NODE_ENV || 'local',
        deploy_time: process.env.RENDER_DEPLOY_TIME || new Date().toISOString(),
        commit: process.env.RENDER_GIT_COMMIT || 'unknown',
        node: process.version
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

// ==========================================
// PUBLIC CONFIG (safe-to-expose env values for the frontend)
// ==========================================
app.get('/api/config/public', async (req, res) => {
    // Pull a few admin-tunable knobs from app_config. Safe defaults if
    // the table doesn't exist yet (first boot on a stale DB).
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
        googlePlacesKey: process.env.GOOGLE_PLACES_API_KEY || '',
        signupMaxServiceAreas,
    });
});

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
app.get('/lakes', (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'pages/public/lakes-index.html'));
});
app.get('/lakes/:slug', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, slug, name, state, region, county, latitude, longitude,
                    intro_text, description, hero_image_url, featured_image_url,
                    seo_title, seo_description, status
             FROM lakes WHERE slug = $1 LIMIT 1`,
            [req.params.slug]
        );
        const lake = rows[0];
        if (!lake || lake.status !== 'published') {
            res.status(404).sendFile(path.join(PROJECT_ROOT, 'pages/public/404.html'), (err) => {
                if (err) res.status(404).send('Lake not found');
            });
            return;
        }

        const templatePath = path.join(PROJECT_ROOT, 'pages/public/lake-detail.html');
        fs.readFile(templatePath, 'utf8', (err, html) => {
            if (err) return next(err);
            const title = lake.seo_title || `${lake.name} Homes for Sale | ${lake.state} Waterfront Real Estate`;
            const desc  = lake.seo_description || lake.intro_text || `${lake.name} real estate — waterfront homes and cabins on ${lake.name}, ${lake.state}.`;
            const canonical = `/lakes/${lake.slug}`;
            const hero     = lake.hero_image_url     || '/assets/images/mn-winter-birch-chalet.jpg';
            const featured = lake.featured_image_url || lake.hero_image_url || '/assets/images/mn-canoe-shore.webp';
            const replacements = {
                '{{LAKE_SEO_TITLE}}':       escapeHtml(title),
                '{{LAKE_SEO_DESCRIPTION}}': escapeHtml(desc),
                '{{LAKE_NAME}}':            escapeHtml(lake.name),
                '{{LAKE_SLUG}}':            escapeHtml(lake.slug),
                '{{LAKE_CANONICAL_PATH}}':  escapeHtml(canonical),
                '{{LAKE_ID}}':              escapeHtml(lake.id),
                '{{LAKE_HERO_IMAGE}}':      escapeHtml(hero),
                '{{LAKE_FEATURED_IMAGE}}':  escapeHtml(featured),
                '{{LAKE_INTRO_TEXT}}':      escapeHtml(lake.intro_text || desc),
                '{{LAKE_LATITUDE}}':        escapeHtml(lake.latitude ?? ''),
                '{{LAKE_LONGITUDE}}':       escapeHtml(lake.longitude ?? ''),
                '{{LAKE_REGION}}':          escapeHtml(lake.region || ''),
                '{{LAKE_COUNTY}}':          escapeHtml(lake.county || ''),
                '{{LAKE_STATE}}':           escapeHtml(lake.state || ''),
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

// ─── Towns: public dynamic page per geo-tag ────────────────────────────
// Server-renders SEO tokens into the initial HTML (matches the /lakes/:slug
// pattern). The page itself fetches lakes/agents/businesses client-side.
app.get('/towns/:slug', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT t.id, t.slug, t.name, t.state, t.region, t.latitude, t.longitude
             FROM tags t
             WHERE t.slug = $1 AND t.active = TRUE
             LIMIT 1`,
            [req.params.slug]
        );
        const tag = rows[0];
        if (!tag) {
            res.status(404).sendFile(path.join(PROJECT_ROOT, 'pages/public/404.html'), (err) => {
                if (err) res.status(404).send('Town not found');
            });
            return;
        }
        const templatePath = path.join(PROJECT_ROOT, 'pages/public/town-detail.html');
        fs.readFile(templatePath, 'utf8', (err, html) => {
            if (err) return next(err);
            const title = `${tag.name}, ${tag.state} — Lake Homes, Agents & Local Businesses`;
            const desc  = `Browse lake homes for sale, top local agents, and trusted businesses serving ${tag.name}, ${tag.state}.`;
            const canonical = `/towns/${tag.slug}`;
            const replacements = {
                '{{TOWN_SEO_TITLE}}':       escapeHtml(title),
                '{{TOWN_SEO_DESCRIPTION}}': escapeHtml(desc),
                '{{TOWN_NAME}}':            escapeHtml(tag.name),
                '{{TOWN_SLUG}}':            escapeHtml(tag.slug),
                '{{TOWN_ID}}':              escapeHtml(tag.id),
                '{{TOWN_STATE}}':           escapeHtml(tag.state || ''),
                '{{TOWN_REGION}}':          escapeHtml(tag.region || ''),
                '{{TOWN_CANONICAL_PATH}}':  escapeHtml(canonical),
                '{{TOWN_LATITUDE}}':        escapeHtml(tag.latitude ?? ''),
                '{{TOWN_LONGITUDE}}':       escapeHtml(tag.longitude ?? ''),
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

app.use(express.static(PROJECT_ROOT));

// Fallback for Next.js-style clean URL resolution (e.g. /buy maps to /buy.html)
app.get('/:page', (req, res, next) => {
    if (!req.params.page.includes('.')) {
        res.sendFile(path.join(PROJECT_ROOT, `${req.params.page}.html`), (err) => {
            if (err) next();
        });
    } else {
        next();
    }
});

// ==========================================
// AUTO-MIGRATE: ensure any new tables exist
// ==========================================
const pool = require('./database/pool');
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
        // Add deleted_at to blog_posts if it doesn't exist yet (migration for existing tables)
        await pool.query(`
            ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
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
            ALTER TABLE cash_offer_leads ADD COLUMN IF NOT EXISTS source_site VARCHAR(40);
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
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
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
                const base = i * 12;
                values.push(`($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10}, $${base+11}, $${base+12})`);
                params.push(
                    l.slug, l.name, l.state || 'MN', l.region || null, l.county || null,
                    l.latitude ?? null, l.longitude ?? null,
                    l.intro_text || null, l.seo_title || null, l.seo_description || null,
                    l.status || 'draft',
                    l.description || null,
                );
            });
            await pool.query(
                `INSERT INTO lakes
                   (slug, name, state, region, county, latitude, longitude,
                    intro_text, seo_title, seo_description, status, description)
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
                featured_image_url = COALESCE(featured_image_url, '/assets/images/mn-aerial-small-town.jpg')
            WHERE slug = 'lake-minnetonka'
              AND (intro_text IS NULL
                   OR intro_text = 'Minnesota''s premier luxury lake — 14,528 acres of waterfront living across Wayzata, Orono, Excelsior, and Minnetonka Beach.')
        `, [
            "Lake Minnetonka isn't just a body of water — it's Minnesota's premier social and recreational playground. 14,528 acres of waterfront living stretch across Wayzata, Orono, Excelsior, and Minnetonka Beach, with a sprawling network of deep-water access, private docks, and transient slips at local institutions like Lord Fletcher's.\n\nOwn a lake home here and you get front-row VIP access to spectacular 4th of July fireworks, quiet morning paddle-boarding coves, and world-class walleye fishing 30 feet from your back patio. From historic generational estates overlooking Gray's Bay to ultra-modern glass marvels along Orono's shoreline, Lake Minnetonka's housing inventory represents the pinnacle of Midwestern architecture.",
        ]);

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

        await seedBlogIfEmpty();
    } catch (err) {
        console.error(' Table migration warning:', err.message);
    }
}

async function seedBlogIfEmpty() {
    const { rows } = await pool.query('SELECT COUNT(*) FROM blog_posts');
    if (parseInt(rows[0].count) > 0) return;
    console.log(' Seeding default blog posts...');
    const { posts } = require('./data/default-blog-posts');
    for (const p of posts) {
        await pool.query(`
            INSERT INTO blog_posts (title, slug, excerpt, body, cover_image_url, tag, read_time_minutes, is_published, published_at, author_name)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'MN Lake Homes Team')
            ON CONFLICT (slug) DO NOTHING
        `, [p.title, p.slug, p.excerpt, p.body, p.cover_image_url, p.tag, p.read_time_minutes, !!p.is_published, p.published_at || new Date()]);
    }
    console.log(' Default blog posts seeded.');
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
});
