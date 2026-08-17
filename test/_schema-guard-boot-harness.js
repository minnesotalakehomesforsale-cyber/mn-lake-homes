// Child target for test/schema-guard.test.js. Reproduces src/server.js's boot
// sequence with the REAL guard, REAL console.error, and REAL process.exit — no
// injection — against an in-memory Postgres whose lakes table is complete
// (MODE=healthy) or missing notable_features (MODE=broken, the exact incident
// that took all 69 lake pages down). Proves the guard exits before the HTTP port
// is ever opened.
const http = require('http');
const path = require('path');
const { newDb } = require('pg-mem');
const { REQUIRED_COLUMNS, assertCriticalSchema } = require(path.join(__dirname, '..', 'src/services/schema-guard.js'));

const MODE = process.env.MODE || 'healthy';
const PORT = Number(process.env.HARNESS_PORT);

const db = newDb();
const ALL = REQUIRED_COLUMNS.lakes;
const cols = MODE === 'broken' ? ALL.filter(c => c !== 'notable_features') : ALL;
db.public.none(`CREATE TABLE lakes (id int, ${cols.map(c => c + ' text').join(', ')})`);
const { Pool } = db.adapters.createPg();
const pool = new Pool();

async function ensureTables() { /* migrations are reflected in the table built above */ }

// ---- boot order copied from src/server.js ----
(async () => {
    try {
        await ensureTables();
        await assertCriticalSchema(pool);
    } catch (e) {
        console.error('FATAL: schema initialization failed, refusing to serve:', e.message);
        process.exit(1);
    }
    http.createServer((req, res) => res.end('ok')).listen(PORT, () => console.log('LISTENING:' + PORT));
})();
