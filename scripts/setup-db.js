const fs = require('fs');
const path = require('path');
const pool = require('../src/database/pool');

async function initializeDatabase() {
    console.log('============================================');
    console.log('MN LAKE HOMES - POSTGRESQL INITIALIZATION');
    console.log(`Environment: ${process.env.NODE_ENV || 'local'}`);
    console.log('============================================');

    try {
        const schemaPath = path.join(__dirname, '../database/schema.sql');
        console.log(`Reading Schema from: ${schemaPath}`);
        
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        console.log('Executing Schema Deployment...');
        await pool.query(schemaSql);
        
        console.log('✅ PostgreSQL Schema deployed successfully!');
        
    } catch (err) {
        console.error('❌ Failed to initialize database schema:');
        console.error(err);
    } finally {
        await pool.end();
        console.log('Database connection pool closed.');
    }
}

initializeDatabase();
