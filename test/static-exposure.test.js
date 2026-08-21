// SEO-03 / security gate: the static layer serves real front-end assets and
// serves NOTHING else off the repo root.
//
// Background: prod was serving the entire repository — src/server.js,
// reset-admin.js, pull-numbers.js, seo-audit.js, package.json, and
// lake-agent-prospects.csv were all HTTP 200 and downloadable. This test mounts
// the real static middleware (src/middleware/static-assets.js) on a bare app —
// no DB, no full server boot — and asserts:
//   • front-end assets (styles/components/assets/pages/root icons) → 200
//   • source, operator scripts, config, and data files → 404
//
// Adding a new script or data file at the repo root, or widening the allowlist
// to leak source, turns this red. Run: `node test/static-exposure.test.js`.
const path = require('path');
const http = require('http');
const express = require('express');
const { mountStaticAssets } = require('../src/middleware/static-assets');

const PROJECT = path.join(__dirname, '..');
let failures = 0;
const check = (name, cond) => { console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${name}`); if (!cond) failures++; };

// Files that MUST remain publicly servable (real front-end assets that exist).
const ALLOW = [
    '/styles/style.css',
    '/components/components.js',
    '/favicon.svg',
    '/manifest.json',
    '/pages/public/blog.html',
];
// Files that MUST NOT be servable — source, scripts, config, data.
const DENY = [
    '/src/server.js',
    '/src/middleware/static-assets.js',
    '/reset-admin.js',
    '/pull-numbers.js',
    '/seo-audit.js',
    '/package.json',
    '/package-lock.json',
    '/lake-agent-prospects.csv',
    '/Procfile',
    '/SEO-ACTION-PLAN.md',
    '/database/pool.js',
];

function status(server, p) {
    return new Promise((resolve) => {
        const { port } = server.address();
        http.get({ host: '127.0.0.1', port, path: p }, (res) => {
            res.resume();
            resolve(res.statusCode);
        }).on('error', () => resolve(0));
    });
}

(async () => {
    const app = express();
    mountStaticAssets(app, PROJECT);
    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));

    console.log('Allowlisted assets must serve (200):');
    for (const p of ALLOW) {
        const code = await status(server, p);
        check(`${p} → ${code}`, code === 200);
    }
    console.log('\nSource / scripts / config / data must NOT serve (404):');
    for (const p of DENY) {
        const code = await status(server, p);
        check(`${p} → ${code}`, code === 404);
    }

    server.close();
    console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('test error:', e); process.exit(2); });
