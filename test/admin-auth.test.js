// T146 — auth smoke test for the entire /api/admin/* surface.
//
// Same class of failure as the migration that took the site down: a copy-paste
// omission nobody catches by reading. Auth was added to admin routes one at a
// time, and a whole category (agent ledger, users incl. password-reset +
// delete, leads incl. hard-delete, agent detail) shipped to prod with NO
// session required — consumer PII behind a URL and unauthenticated destructive
// deletes.
//
// This enumerates EVERY route mounted under /api/admin/* (the main admin router
// + the two cash-offer routers, exactly as server.js mounts them) and asserts
// each one rejects an anonymous request with 401/403. A new admin route that
// forgets auth makes this go red. Runs offline: verifyToken returns 401 before
// any DB call when there's no token, so no database is needed — we only set a
// dummy DATABASE_URL/JWT_SECRET so pool.js loads without exiting.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dummy:dummy@127.0.0.1:1/dummy';
process.env.JWT_SECRET   = process.env.JWT_SECRET   || 'test-secret';

const path = require('path');
const http = require('http');
const express = require('express');
const PROJECT = path.join(__dirname, '..');

// Mount the admin surface exactly as src/server.js does.
const app = express();
app.use('/api/admin/cash-offers',         require(path.join(PROJECT, 'src/routes/admin-cash-offer.routes')));
app.use('/api/admin/cash-offer-partners', require(path.join(PROJECT, 'src/routes/admin-cash-offer-partner.routes')));
app.use('/api/admin/partner-perks',       require(path.join(PROJECT, 'src/routes/partner.routes')));
app.use('/api/admin',                     require(path.join(PROJECT, 'src/routes/admin.routes')));

// Walk a router's layer stack into concrete {method, path} routes.
function collect(router, prefix) {
    const out = [];
    for (const layer of router.stack) {
        if (!layer.route) continue;
        const p = prefix + layer.route.path;
        for (const m of Object.keys(layer.route.methods)) {
            if (layer.route.methods[m]) out.push({ method: m.toUpperCase(), path: p });
        }
    }
    return out;
}

const routes = [
    ...collect(require(path.join(PROJECT, 'src/routes/admin.routes')), '/api/admin'),
    ...collect(require(path.join(PROJECT, 'src/routes/admin-cash-offer.routes')), '/api/admin/cash-offers'),
    ...collect(require(path.join(PROJECT, 'src/routes/admin-cash-offer-partner.routes')), '/api/admin/cash-offer-partners'),
    ...collect(require(path.join(PROJECT, 'src/routes/partner.routes')), '/api/admin/partner-perks'),
];

// Concrete request path: fill :params with a dummy value.
const concrete = p => p.replace(/:[^/]+/g, 'x');

function probe(server, method, urlPath) {
    return new Promise(resolve => {
        const { port } = server.address();
        const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, timeout: 4000 }, res => {
            res.resume(); // drain
            resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
        req.on('timeout', () => { req.destroy(); resolve(0); });
        req.end();
    });
}

(async () => {
    let failures = 0;
    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));

    console.log(`Auditing ${routes.length} routes under /api/admin/* (anonymous → must be 401/403):\n`);
    for (const { method, path: p } of routes) {
        const code = await probe(server, method, concrete(p));
        const ok = code === 401 || code === 403;
        if (!ok) { failures++; console.log(`✗ FAIL  ${method} ${p} → ${code} (expected 401/403 — UNAUTHENTICATED)`); }
    }
    if (!failures) console.log(`✓ all ${routes.length} routes reject anonymous requests (401/403)`);

    // Sanity: the enumeration actually found the routes we care about, so an
    // empty/broken walk can't pass vacuously.
    const mustInclude = ['DELETE /api/admin/:id', 'DELETE /api/admin/leads/:id', 'PATCH /api/admin/users/:id/password', 'GET /api/admin/users'];
    const found = new Set(routes.map(r => `${r.method} ${r.path}`));
    for (const key of mustInclude) {
        if (!found.has(key)) { failures++; console.log(`✗ FAIL  enumeration missing expected route: ${key}`); }
    }

    server.close();
    console.log(`\n${failures === 0 ? `ALL PASSED (${routes.length} routes gated)` : failures + ' FAILED'}`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('test error:', e); process.exit(2); });
