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
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [`http://localhost:${process.env.PORT || 3000}`];

app.use(cors({
    origin: (origin, callback) => {
        // Allow server-to-server requests (no origin) and whitelisted origins
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: origin '${origin}' not allowed`));
        }
    },
    credentials: true
}));
app.use(express.json());
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

app.get('/api/health', (req, res) => {
    res.json({ status: 'live', environment: process.env.NODE_ENV || 'local' });
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
        // Add deleted_at to blog_posts if it doesn't exist yet (migration for existing tables)
        await pool.query(`
            ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
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
    const posts = [
        {
            title: '5 Things to Look For in a Lake Property',
            slug: '5-things-to-look-for-in-a-lake-property',
            tag: 'Buyer Guide', read_time_minutes: 4,
            cover_image_url: '/assets/images/mn-cape-cod-lakefront.jpg',
            excerpt: "Buying a lake home is one of the most exciting purchases you'll ever make — but it comes with unique considerations that a traditional home purchase doesn't.",
            body: `<p>Buying a lake home is one of the most exciting purchases you'll ever make. Whether it's a weekend retreat or a permanent residence, lakefront property comes with a lifestyle unlike anything else. But it also comes with considerations that most buyers overlook.</p><h2>1. Water Frontage and Bottom Quality</h2><p>Not all lake frontage is created equal. The amount of usable shoreline you own directly affects your enjoyment and resale value. Walk into the water if you can — check for weed density, water clarity, and bottom firmness.</p><h2>2. Dock Rights and Existing Structures</h2><p>In Minnesota, not every lakefront property automatically grants you the right to install a permanent dock. Dock permits are issued at the county level. Always ask for the current dock permit status and whether it transfers at closing.</p><h2>3. Septic System Age and Capacity</h2><p>The majority of lake homes in Minnesota are on private septic systems. A failing septic system is one of the most expensive surprises a buyer can face — with replacement costs often running $15,000–$40,000 or more.</p><h2>4. Flood Zone and Shoreline Setback Rules</h2><p>Minnesota has strong shoreland zoning regulations that dictate how close to the water you can build. Always pull the county zoning rules before you commit.</p><h2>5. Off-Season Access and Road Maintenance</h2><p>That gorgeous private road you drove down in July might be impassable by February. Ask who maintains the road — the county, a lake association, or individual owners?</p><p>Work with an agent who specializes in lake properties. They'll know which questions to ask and which red flags most general agents miss.</p>`,
        },
        {
            title: 'Top 10 Lakes in Minnesota for Boating Enthusiasts',
            slug: 'top-10-minnesota-lakes-for-boating',
            tag: 'Local Life', read_time_minutes: 3,
            cover_image_url: '/assets/images/mn-purple-sunset-marina.webp',
            excerpt: "Minnesota is home to over 11,000 lakes, but not all are created equal for boating. Here's our ranked list of the best lakes for powerboaters, pontoon cruisers, and watersport lovers.",
            body: `<p>Minnesota is called the "Land of 10,000 Lakes" — though the real count is closer to 11,842. With so many options, choosing where to boat can feel overwhelming. We've narrowed it down to the top 10 lakes that consistently rank best for boating.</p><h2>1. Lake Minnetonka</h2><p>The undisputed king of Twin Cities boating. With 14,528 acres and 110 miles of shoreline, Minnetonka offers everything: marinas, restaurants accessible by boat, sandbars, and deep water for wake sports.</p><h2>2. Mille Lacs Lake</h2><p>The second-largest lake entirely within Minnesota at 132,516 acres. Mille Lacs is famous for walleye fishing, but its sheer size makes it excellent for long-range cruising.</p><h2>3. Gull Lake (Brainerd)</h2><p>One of the most popular resort lakes in the state, known for clear water and a lively boating scene near the Brainerd Lakes area.</p><h2>4. Leech Lake</h2><p>At 112,000 acres, Leech Lake is Minnesota's third-largest lake — a serious boater's destination known for walleye, northern pike, and muskie fishing.</p><h2>5. Lake Vermilion</h2><p>Northeastern Minnesota's crown jewel. Vermilion has over 1,200 miles of shoreline and 365 islands, making it endlessly explorable.</p><h2>6–10</h2><p>Prior Lake, Lake Kabetogama, White Bear Lake, Lake of the Woods, and Big Birch Lake round out our list — each offering a unique boating experience for different styles and budgets.</p>`,
        },
        {
            title: 'How to Stage Your Cabin for Maximum Value',
            slug: 'how-to-stage-your-cabin-for-maximum-value',
            tag: 'Seller Resources', read_time_minutes: 5,
            cover_image_url: '/assets/images/mn-rustic-modern-lake-house.jpg',
            excerpt: "Staging a lakefront cabin is different from staging a suburban home. Buyers are purchasing a lifestyle. Here's how to show them exactly what that looks like at its best.",
            body: `<p>Selling a lakefront cabin is a fundamentally different sales process than selling a suburban house. Buyers aren't just evaluating square footage — they're buying into a lifestyle. Your job is to make that vision as vivid as possible.</p><h2>1. Lead With the Water View</h2><p>Every room should point toward the water, conceptually and physically. Remove anything that blocks sightlines — overgrown shrubs, cluttered decks, dark window treatments.</p><h2>2. Declutter Ruthlessly</h2><p>Lake cabins accumulate decades of stuff. Clear it all out before photos and showings, then add back selectively. Keep what tells the story, eliminate what distracts from it.</p><h2>3. The Dock Is Part of the Showing</h2><p>Power-wash the boards, replace any rotted planks, add a couple of Adirondack chairs. A clean, inviting dock adds measurable perceived value.</p><h2>4. Address the Smells</h2><p>Lake cabins often have a characteristic smell buyers will notice immediately. Air the cabin out for several days before showings. Avoid heavy artificial scents — they signal you're hiding something.</p><h2>5. Professional Photography Is Non-Negotiable</h2><p>Hire a photographer who can come at golden hour. Drone photography of the waterfront is worth every penny for lakefront properties specifically.</p>`,
        },
        {
            title: 'Discovering the Magic of Northern Minnesota',
            slug: 'discovering-the-magic-of-northern-minnesota',
            tag: 'Community', read_time_minutes: 4,
            cover_image_url: '/assets/images/mn-wilderness-lake-dock.jpg',
            excerpt: "Northern Minnesota is more than a destination — it's a mindset. For those who've experienced it, no explanation is needed. For those who haven't, here's what you're missing.",
            body: `<p>There's a particular kind of quiet that only exists in northern Minnesota. It's not the absence of sound — the loons call, the pines creak in the wind — it's the absence of urgency. Time moves differently up north.</p><h2>The Boundary Waters</h2><p>The Boundary Waters Canoe Area Wilderness is one of the most visited wilderness areas in the United States — and one of the most pristine. Over a million acres of interconnected lakes, rivers, and forest, accessible only by paddle and portage.</p><h2>Ely: The Gateway Town</h2><p>Ely is a town of about 3,000 people that manages to feel like both a working-class mining community and a sophisticated outdoor destination simultaneously. The International Wolf Center and the North American Bear Center draw visitors from around the world.</p><h2>Grand Marais and the North Shore</h2><p>The North Shore of Lake Superior stretches 150 miles from Duluth to the Canadian border. Grand Marais sits near its northern end — a town seemingly designed for people who appreciate good coffee, fresh fish, and hiking trails with extraordinary views.</p><h2>Why People Don't Just Visit — They Move</h2><p>We talk to buyers every week who started with "we're thinking about a cabin" and ended with "we're thinking about making this our permanent home." Remote work has made it more possible than ever. If northern Minnesota is calling to you, it's worth a conversation.</p>`,
        },
    ];
    for (const p of posts) {
        await pool.query(`
            INSERT INTO blog_posts (title, slug, excerpt, body, cover_image_url, tag, read_time_minutes, is_published, published_at, author_name)
            VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),'MN Lake Homes Team')
            ON CONFLICT (slug) DO NOTHING
        `, [p.title, p.slug, p.excerpt, p.body, p.cover_image_url, p.tag, p.read_time_minutes]);
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
