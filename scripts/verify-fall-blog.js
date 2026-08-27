/**
 * verify-fall-blog.js — local, read-only QA for the fall posts.
 * Checks each post: word count 700-1000, starts with the fall marker, >=4 <h2>,
 * has a <ul>, a CTA to /buy or /sell, no `${` in body, and — critically — that
 * EVERY internal link points to a real allowlisted URL (so nothing 404s).
 *
 * Run: node scripts/verify-fall-blog.js
 */
const fs = require('fs');
const path = require('path');

const CORE = new Set(['/', '/buy', '/sell', '/rent', '/cash-offer', '/agents', '/towns', '/lakes',
    '/find-your-lake', '/compare-lakes', '/lake-mortgage-calculator', '/lake-buyer-checklist', '/blog']);
const LAKES = new Set('bald-eagle-lake battle-lake bde-maka-ska big-lake big-sandy-lake big-stone-lake budd-lake buffalo-lake burntside-lake cannon-lake cass-lake cedar-lake-minneapolis chisago-lake christmas-lake detroit-lake fish-hook-lake forest-lake fountain-lake green-lake grindstone-lake gull-lake island-lake kabetogama-lake lake-bemidji lake-carlos lake-harriet lake-independence lake-le-homme-dieu lake-lida lake-melissa lake-miltona lake-minnetonka lake-minnewashta lake-minnewaska lake-nokomis lake-of-the-woods lake-osakis lake-pepin lake-phalen lake-sakatah lake-sallie lake-superior lake-vermilion lake-waconia lake-winnibigoshish leech-lake medicine-lake mille-lacs-lake otter-lake-hutchinson otter-tail-lake pelican-lake pokegama-lake prior-lake rainy-lake ten-mile-lake white-bear-lake whitefish-chain'.split(' '));
const TOWNS = new Set('aitkin albert-lea alexandria battle-lake baxter bemidji big-lake brainerd breezy-point buffalo cass-lake chanhassen chisago-city crosby crosslake deephaven excelsior fairmont faribault fergus-falls forest-lake glenwood grand-rapids hackensack hutchinson lakeville lindstrom lino-lakes minnetonka-beach minnetrista monticello mound new-london nisswa orono osakis ottertail park-rapids pelican-rapids pequot-lakes perham pine-river prior-lake shoreview shorewood spicer spring-park tonka-bay waconia walker wayzata white-bear-lake willmar worthington'.split(' '));
const BLOG_EXISTING = '5-things-to-look-for-in-a-lake-property first-time-lake-home-buyer-guide minnesota-lake-home-financing-guide best-minnesota-lakes-first-time-buyers building-a-dock-permits-materials-costs-minnesota how-to-winterize-a-lake-cabin brainerd-lakes-area-cabin-guide best-quiet-lakes-minnesota raising-kids-at-the-lake-in-minnesota best-time-to-buy-lake-home-minnesota whitefish-chain-buyers-guide alexandria-lakes-area-guide top-10-minnesota-lakes-for-boating how-to-stage-your-cabin-for-maximum-value'.split(' ');
const FALL_SLUGS = 'why-fall-is-the-best-time-to-buy-a-minnesota-lake-home best-minnesota-lakes-for-fall-color closing-on-a-lake-cabin-before-winter fall-dock-removal-and-shoreline-prep-minnesota winterizing-your-minnesota-lake-cabin-fall-checklist fall-fishing-minnesota-lakes selling-your-lake-home-in-fall-staging-guide brainerd-lakes-area-fall-buyers-guide minnesota-lake-market-in-fall buying-a-fall-hunting-cabin-minnesota preparing-your-dock-and-boat-for-minnesota-winter fall-on-lake-minnetonka heating-your-lake-cabin-fall-prep-minnesota best-quiet-minnesota-lakes-to-buy-this-fall fall-foliage-drives-minnesota-lake-country alexandria-lakes-area-fall-buyers-guide lake-superior-north-shore-in-autumn fall-maintenance-checklist-minnesota-lakefront year-round-vs-seasonal-cabin-fall-decision-guide thanksgiving-at-the-lake-minnesota-cabins'.split(' ');
const BLOG = new Set([...BLOG_EXISTING, ...FALL_SLUGS]);

function linkOk(href) {
    const clean = href.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';
    if (CORE.has(clean)) return true;
    let m;
    if ((m = clean.match(/^\/lakes\/(.+)$/))) return LAKES.has(m[1]);
    if ((m = clean.match(/^\/towns\/(.+)$/))) return TOWNS.has(m[1]);
    if ((m = clean.match(/^\/blog\/(.+)$/)))  return BLOG.has(m[1]);
    return false;
}

let posts = [];
for (const n of [1, 2, 3, 4, 5]) {
    const abs = path.join(__dirname, `../src/data/fall-blog-posts-2026-part${n}.js`);
    if (!fs.existsSync(abs)) { console.log(`part${n}: MISSING`); continue; }
    posts = posts.concat(require(abs));
}

let problems = 0;
const seen = new Set();
console.log(`\nVerifying ${posts.length} posts...\n`);
for (const p of posts) {
    const issues = [];
    const body = String(p.body || '');
    const words = body.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').split(/\s+/).filter(Boolean).length;
    if (words < 700 || words > 1000) issues.push(`words=${words}`);
    if (!body.startsWith('<!-- fall-2026 -->')) issues.push('no marker');
    if ((body.match(/<h2/gi) || []).length < 4) issues.push('<4 h2');
    if (!/<ul/i.test(body)) issues.push('no <ul>');
    if (!/href="\/(buy|sell)"/.test(body)) issues.push('no CTA to /buy|/sell');
    if (body.includes('${')) issues.push('contains ${');
    if (seen.has(p.slug)) issues.push('DUP slug'); seen.add(p.slug);
    if (!FALL_SLUGS.includes(p.slug)) issues.push('slug not in plan');
    const hrefs = [...body.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(h => h.startsWith('/'));
    const bad = hrefs.filter(h => !linkOk(h));
    if (bad.length) issues.push(`BAD LINKS: ${[...new Set(bad)].join(', ')}`);
    const status = issues.length ? '✗ ' + issues.join(' | ') : `✓ ${words}w, ${hrefs.length} links`;
    if (issues.length) problems++;
    console.log(`  ${issues.length ? '✗' : '✓'} ${p.slug.padEnd(50)} ${status}`);
}
console.log(`\n${problems ? '✗ ' + problems + ' post(s) need fixes' : '✅ ALL ' + posts.length + ' POSTS PASS'}`);
process.exit(problems ? 1 : 0);
