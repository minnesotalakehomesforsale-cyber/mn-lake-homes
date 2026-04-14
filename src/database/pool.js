const { Pool } = require('pg');

// Determine environment — Render/Railway inject NODE_ENV at runtime.
// Fall back to .env.local for local development.
const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.local';
require('dotenv').config({ path: envFile });

if (!process.env.DATABASE_URL) {
    console.error('CRITICAL: DATABASE_URL is not set in environment config.');
    process.exit(1);
}

// SSL is required for all cloud-hosted PostgreSQL providers (Render, Railway, Supabase, etc.)
// rejectUnauthorized: false allows self-signed certs used by managed DB services.
const isLocal = !process.env.NODE_ENV || process.env.NODE_ENV === 'local';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
    process.exit(-1);
});

module.exports = pool;
