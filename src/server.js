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
// INITIALIZE
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=======================================`);
    console.log(` MN LAKE HOMES PLATFORM ENGINE `);
    console.log(` Environment  : ${process.env.NODE_ENV || 'local'}`);
    console.log(` Listening on : http://localhost:${PORT}`);
    console.log(` Connected to : PostgreSQL Database`);
    console.log(`=======================================`);
});
