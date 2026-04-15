const { Pool } = require('pg');

// Determine environment — Render/Railway inject NODE_ENV at runtime.
// Fall back to .env.local for local development.
const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.local';
require('dotenv').config({ path: envFile });

if (!process.env.DATABASE_URL) {
    console.error('CRITICAL: DATABASE_URL is not set in environment config.');
    process.exit(1);
}

// Automatically use SSL for any cloud-hosted database URL (Neon, Render, Railway, Supabase, etc.)
// This allows local development to connect to a cloud DB without extra config.
const dbUrl = process.env.DATABASE_URL || '';
const isCloudDb = ['neon.tech', 'render.com', 'railway.app', 'supabase.co', 'amazonaws.com'].some(h => dbUrl.includes(h));

const pool = new Pool({
    connectionString: dbUrl,
    ssl: isCloudDb ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
    process.exit(-1);
});

module.exports = pool;
