// Auth smoke test for the /api/agents/* and /api/leads/* surfaces.
//
// Companion to admin-auth.test.js. That test only walked /api/admin/*, which is
// exactly why two unauthenticated endpoints shipped elsewhere and went unnoticed:
//   - GET  /api/leads/admin/inbox  (returned the whole leads table incl. PII)
//   - POST /api/agents/upload-photo (open image upload to our Cloudinary account)
//
// This enumerates EVERY route on the agent + lead routers, subtracts a small,
// explicit allowlist of intentionally-public routes, and asserts every remaining
// route rejects an anonymous request with 401/403. A new /me/* (or admin) route
// that forgets its guard — or anything newly added to the public block by
// mistake — makes this go red.
//
// Runs offline: verifyToken returns 401 before any DB call when there's no token,
// so no database is needed; we only set dummy env so the modules load.
process.env.DATABASE_URL   = process.env.DATABASE_URL   || 'postgresql://dummy:dummy@127.0.0.1:1/dummy';
process.env.JWT_SECRET     = process.env.JWT_SECRET     || 'test-secret';

const path = require('path');
const http = require('http');
const express = require('express');
const PROJECT = path.join(__dirname, '..');

// Mount exactly as src/server.js does.
const app = express();
app.use('/api/agents', require(path.join(PROJECT, 'src/routes/agent.routes')));
app.use('/api/leads',  require(path.join(PROJECT, 'src/routes/lead.routes')));

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
    ...collect(require(path.join(PROJECT, 'src/routes/agent.routes')), '/api/agents'),
    ...collect(require(path.join(PROJECT, 'src/routes/lead.routes')),  '/api/leads'),
];

// The ONLY routes allowed to answer an anonymous caller. Everything else must
// reject with 401/403. Keep this list tight — adding to it is a deliberate
// decision to expose a route publicly, reviewable in the diff.
const PUBLIC = new Set([
    'GET /api/agents/public',
    'GET /api/agents/faq-questions',
    'GET /api/agents/public/:slug',
    'GET /api/agents/public/:slug/blog-posts',
    'POST /api/leads/',        // public lead submit (rate-limited + spam-guarded)
    'POST /api/leads/partial', // progressive capture; never routed
]);

// Concrete request path: fill :params with a dummy value.
const concrete = p => p.replace(/:[^/]+/g, 'x');

function probe(server, method, urlPath) {
    return new Promise(resolve => {
        const { port } = server.address();
        const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, timeout: 4000 }, res => {
            res.resume();
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

    const protectedRoutes = routes.filter(r => !PUBLIC.has(`${r.method} ${r.path}`));
    console.log(`Auditing ${protectedRoutes.length} protected routes on /api/agents + /api/leads (anonymous → must be 401/403):\n`);
    for (const { method, path: p } of protectedRoutes) {
        const code = await probe(server, method, concrete(p));
        const ok = code === 401 || code === 403;
        if (!ok) { failures++; console.log(`✗ FAIL  ${method} ${p} → ${code} (expected 401/403 — UNAUTHENTICATED)`); }
    }
    if (!failures) console.log(`✓ all ${protectedRoutes.length} protected routes reject anonymous requests (401/403)`);

    // Sanity: the two endpoints this test was written for must be present AND
    // outside the public allowlist, so the walk can't pass vacuously.
    const found = new Set(routes.map(r => `${r.method} ${r.path}`));
    const mustGuard = [
        'GET /api/leads/admin/inbox',
        'POST /api/agents/upload-photo',
        'GET /api/agents/me',
        'GET /api/agents/admin/at-risk',
        'GET /api/leads/mine',
    ];
    for (const key of mustGuard) {
        if (!found.has(key)) { failures++; console.log(`✗ FAIL  enumeration missing expected route: ${key}`); }
        else if (PUBLIC.has(key)) { failures++; console.log(`✗ FAIL  route must not be public: ${key}`); }
    }

    server.close();
    console.log(`\n${failures === 0 ? `ALL PASSED (${protectedRoutes.length} routes gated)` : failures + ' FAILED'}`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('test error:', e); process.exit(2); });
