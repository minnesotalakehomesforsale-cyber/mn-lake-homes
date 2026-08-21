// Static asset serving — explicit allowlist (SEO-03 / security).
//
// This replaces a blanket `express.static(PROJECT_ROOT)`, which served the
// ENTIRE repository over HTTP: `src/server.js` (all backend logic + route/table
// names), the operator scripts (`reset-admin.js`, `pull-numbers.js`,
// `seo-audit.js`), `package.json`, and `lake-agent-prospects.csv` were every one
// of them publicly downloadable off prod. (`.env`/`.git` were already safe only
// because express.static ignores dotfiles by default — a thin margin.)
//
// Only the real front-end asset directories and a short, exact list of root
// files are served now. Anything else at the repo root 404s. Enforced by
// test/static-exposure.test.js so a new source/data file can't silently become
// world-readable again.
const path = require('path');
const express = require('express');

// Directories under the project root that are safe to serve wholesale. `pages`
// is included because the portal dashboards (pages/agent, pages/business,
// pages/admin) are served from there; they carry X-Robots-Tag: noindex, so
// serving them is intended, indexing them is not.
const ASSET_DIRS = ['assets', 'styles', 'components', 'pages'];

// Individual root-level files the front-end / PWA references by exact name.
// Kept deliberately tiny — every entry is a file we KNOW the browser requests.
const ROOT_FILES = new Set([
    'favicon.svg',
    'manifest.json',
    'sw.js',
    'index.html',
    'browserconfig.xml',
]);

// Freshness policy. HTML and the shared JS/CSS bundles all revalidate on every
// load: express.static sets a strong ETag + Last-Modified, so an unchanged file
// returns a cheap 304 and a changed file returns 200 immediately — no stale
// window, no hard-refresh needed to see a CSS/JS edit. (A content-hash
// fingerprint + immutable 1-year cache would save the revalidation roundtrip,
// but that needs a build step; at this scale the 304 is negligible.) Fingerprinted
// or hashed asset URLs, if introduced later, can opt into a long immutable cache.
function setHeaders(res, filePath) {
    if (/\.(html|js|css)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
    }
}

// Mount the allowlisted static layer onto an Express app. Pure w.r.t. its
// inputs so a test can mount it on a bare app and crawl it with no DB/boot.
function mountStaticAssets(app, projectRoot) {
    const opts = { setHeaders, dotfiles: 'ignore', index: false };
    for (const dir of ASSET_DIRS) {
        app.use('/' + dir, express.static(path.join(projectRoot, dir), opts));
    }
    // Exact-match root files ONLY — never a directory walk of the repo root.
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const name = decodeURIComponent(req.path.replace(/^\/+/, ''));
        if (!ROOT_FILES.has(name)) return next();
        res.sendFile(path.join(projectRoot, name), err => { if (err) next(); });
    });
}

module.exports = { mountStaticAssets, ASSET_DIRS, ROOT_FILES };
