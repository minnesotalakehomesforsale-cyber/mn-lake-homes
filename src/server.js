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
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/leads', require('./routes/lead.routes'));
app.use('/api/blog', require('./routes/blog.routes'));
app.use('/api/tasks', require('./routes/task.routes'));
app.use('/api/stripe', require('./routes/stripe.routes'));
app.use('/api/inquiries', require('./routes/inquiry.routes'));
app.use('/api/assistant', require('./routes/assistant.routes'));
app.use('/api/activity', require('./routes/activity.routes'));

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
// STATIC FRONTEND DELIVERY
// ==========================================
// Serve the existing HTML/CSS UI layer exactly as it was.
const PROJECT_ROOT = path.join(__dirname, '..');
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

        console.log(' Tables verified.');

        // Migrate default seeded cover images from Unsplash URLs to local /assets/images/ paths
        await pool.query(`
            UPDATE blog_posts SET cover_image_url = '/assets/images/mn-purple-sunset-marina.webp'
              WHERE slug = 'top-10-minnesota-lakes-for-boating'    AND cover_image_url LIKE 'https://images.unsplash.com/%';
            UPDATE blog_posts SET cover_image_url = '/assets/images/mn-rustic-modern-lake-house.jpg'
              WHERE slug = 'how-to-stage-your-cabin-for-maximum-value' AND cover_image_url LIKE 'https://images.unsplash.com/%';
            UPDATE blog_posts SET cover_image_url = '/assets/images/mn-wilderness-lake-dock.jpg'
              WHERE slug = 'discovering-the-magic-of-northern-minnesota' AND cover_image_url LIKE 'https://images.unsplash.com/%';
            UPDATE blog_posts SET cover_image_url = '/assets/images/mn-cape-cod-lakefront.jpg'
              WHERE slug = '5-things-to-look-for-in-a-lake-property'    AND cover_image_url LIKE 'https://images.unsplash.com/%';
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
