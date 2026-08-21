#!/usr/bin/env node
// SEO baseline snapshot (W0). Captures what is snapshot-able on day one — BEFORE
// we start editing 200 pages — so we can measure the program against a fixed
// "before". Search Console does not backfill, so the query/impressions/clicks
// side starts accumulating the day the property is verified; this script fills
// what we CAN capture now and leaves GSC fields to be pasted in at 30/60/90.
//
// What it captures (no DB, no auth — pure crawl-side):
//   • sitemap URL count, bucketed by page type (the indexable set, by design)
//   • a sampled robots-meta check per type (index vs noindex) to confirm the
//     sitemap==index invariant holds on the live pages
//   • security-surface spot check (source/scripts/csv must be 404)
//
// Writes a timestamped JSON + Markdown to scripts/baselines/. Re-run at
// 30/60/90 days and diff; paste GSC/Bing numbers into the JSON's `gsc` block
// when they exist.
//
// Usage:  node scripts/seo-baseline.js [baseUrl]
//         node scripts/seo-baseline.js https://minnesotalakehomesforsale.com
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'https://minnesotalakehomesforsale.com').replace(/\/$/, '');
const OUT_DIR = path.join(__dirname, 'baselines');
const SAMPLE_PER_TYPE = 3;   // how many URLs per type to spot-check for robots meta

function get(url) {
    return new Promise((resolve) => {
        const req = https.get(url, { timeout: 15000, headers: { 'User-Agent': 'mlh-seo-baseline/1.0' } }, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', () => resolve({ status: 0, headers: {}, body: '' }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, headers: {}, body: '' }); });
    });
}

function bucketOf(loc) {
    const p = loc.replace(BASE, '');
    if (/^\/lakes\//.test(p)) return 'lakes';
    if (/^\/towns\//.test(p)) return 'towns';
    if (/^\/agents\//.test(p)) return 'agents';
    if (/^\/blog\//.test(p)) return 'blog';
    if (/^\/businesses\//.test(p)) return 'businesses';
    if (/^\/listings\//.test(p)) return 'listings';
    return 'static/other';
}

function robotsOf(html) {
    const m = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)["']/i);
    if (!m) return 'none';
    return /noindex/i.test(m[1]) ? 'noindex' : 'index';
}

(async () => {
    const stamp = new Date().toISOString();
    const dayKey = stamp.slice(0, 10);
    console.log(`SEO baseline for ${BASE} @ ${stamp}\n`);

    // 1. Sitemap URL inventory by type.
    const sm = await get(`${BASE}/sitemap.xml`);
    const locs = (sm.body.match(/<loc>([^<]+)<\/loc>/g) || []).map(l => l.replace(/<\/?loc>/g, '').trim());
    const byType = {};
    for (const loc of locs) { const b = bucketOf(loc); (byType[b] = byType[b] || []).push(loc); }
    const counts = Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length]));
    console.log(`Sitemap: ${locs.length} URLs`);
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));

    // 2. Robots-meta spot check per type (sitemap URLs SHOULD be index,follow).
    console.log('\nRobots-meta spot check (sitemap URLs should read "index"):');
    const robotsSample = {};
    for (const [type, list] of Object.entries(byType)) {
        robotsSample[type] = [];
        for (const loc of list.slice(0, SAMPLE_PER_TYPE)) {
            const r = await get(loc);
            const verdict = robotsOf(r.body);
            robotsSample[type].push({ url: loc.replace(BASE, ''), status: r.status, robots: verdict });
            const flag = verdict === 'noindex' ? '  ⚠ NOINDEX in sitemap' : '';
            console.log(`  [${type}] ${r.status} ${verdict}  ${loc.replace(BASE, '')}${flag}`);
        }
    }

    // 3. Security-surface spot check (must be 404 after SEO-03).
    console.log('\nSecurity surface (must be 404):');
    const secPaths = ['/src/server.js', '/lake-agent-prospects.csv', '/package.json'];
    const security = {};
    for (const p of secPaths) {
        const r = await get(`${BASE}${p}`);
        security[p] = r.status;
        console.log(`  ${r.status === 404 ? 'OK ' : '⚠  '} ${p} → ${r.status}`);
    }

    // 4. HSTS / security headers snapshot.
    const home = await get(`${BASE}/`);
    const secHeaders = {
        hsts: home.headers['strict-transport-security'] || null,
        xcto: home.headers['x-content-type-options'] || null,
        xfo: home.headers['x-frame-options'] || null,
        referrer: home.headers['referrer-policy'] || null,
    };

    const snapshot = {
        capturedAt: stamp,
        base: BASE,
        sitemap: { total: locs.length, byType: counts },
        robotsSample,
        security,
        securityHeaders: secHeaders,
        // Paste these in from Search Console / Bing at the 30/60/90 re-runs —
        // GSC does not backfill, so day-0 has no query history to capture.
        gsc: {
            note: 'Populate at 30/60/90 from Search Console once the property has history.',
            indexedPages: null, impressions: null, clicks: null,
            top50Queries: null, top50Pages: null,
        },
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const jsonPath = path.join(OUT_DIR, `seo-baseline-${dayKey}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2));

    const md = [
        `# SEO Baseline — ${dayKey}`,
        ``,
        `Captured ${stamp} against ${BASE}.`,
        ``,
        `## Sitemap (indexable set): ${locs.length} URLs`,
        ``,
        `| Type | Count |`,
        `|---|---|`,
        ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`),
        ``,
        `## Security surface`,
        ``,
        ...secPaths.map(p => `- \`${p}\` → ${security[p]}${security[p] === 404 ? ' ✅' : ' ⚠️'}`),
        ``,
        `## Security headers`,
        ``,
        `- HSTS: \`${secHeaders.hsts || 'MISSING'}\``,
        `- X-Content-Type-Options: \`${secHeaders.xcto || 'MISSING'}\``,
        `- X-Frame-Options: \`${secHeaders.xfo || 'MISSING'}\``,
        ``,
        `## Search Console / Bing`,
        ``,
        `_GSC does not backfill — populate indexed count, impressions, clicks, top-50 queries/pages at the 30/60/90 re-runs._`,
        ``,
    ].join('\n');
    const mdPath = path.join(OUT_DIR, `seo-baseline-${dayKey}.md`);
    fs.writeFileSync(mdPath, md);

    console.log(`\nWrote:\n  ${path.relative(process.cwd(), jsonPath)}\n  ${path.relative(process.cwd(), mdPath)}`);
    console.log('\nRe-run at 30/60/90 days and paste GSC/Bing numbers into the JSON gsc block.');
})();
