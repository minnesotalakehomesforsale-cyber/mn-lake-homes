'use strict';

// SEOCI "schema integrity" — the shared JSON-LD builder for hub/list pages must
// always emit well-formed, valid schema.org blocks, and must never let page data
// break out of the <script> tag. Pure unit test, no DB/app boot.

const { seoJsonLd, BASE } = require('../src/services/seo-jsonld');

let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };

// Pull the JSON out of each <script type="application/ld+json">…</script> block.
function parseBlocks(html) {
    const out = [];
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) out.push(JSON.parse(m[1]));  // throws if invalid JSON
    return out;
}

// Full hub page: breadcrumbs + items + speakable.
const full = seoJsonLd({
    crumbs: [{ name: 'Home', path: '/' }, { name: 'Fishing', path: '/fishing' }, { name: 'Walleye' }],
    items: [{ name: 'Gull Lake', path: '/lakes/gull-lake' }, { name: 'Leech Lake', path: '/lakes/leech-lake' }],
    canonicalPath: '/fishing/walleye', name: 'Best Walleye Lakes in Minnesota',
});
let blocks;
try { blocks = parseBlocks(full); ok(true, 'all blocks are valid, parseable JSON'); }
catch (e) { ok(false, 'valid JSON — ' + e.message); blocks = []; }

const byType = t => blocks.find(b => b['@type'] === t);
ok(blocks.every(b => b['@context'] === 'https://schema.org'), 'every block has @context schema.org');
ok(byType('WebPage') && byType('WebPage').speakable['@type'] === 'SpeakableSpecification', 'WebPage carries SpeakableSpecification');
ok(byType('WebPage').speakable.cssSelector.includes('.cty-hero h1'), 'speakable targets the H1');
const bc = byType('BreadcrumbList');
ok(bc && bc.itemListElement.length === 3 && bc.itemListElement[0].position === 1, 'BreadcrumbList has positioned items');
ok(bc.itemListElement[2].item === undefined, 'last breadcrumb (current page) has no item URL');
const il = byType('ItemList');
ok(il && il.numberOfItems === 2 && il.itemListElement[0].url === BASE + '/lakes/gull-lake', 'ItemList lists items with absolute URLs');

// Escaping: a name containing "</script>" must NOT break out of the tag.
const evil = seoJsonLd({ canonicalPath: '/x', name: 'Evil </script><img src=x onerror=alert(1)>',
    items: [{ name: '</script>hax', path: '/lakes/x' }] });
ok(!/<\/script><script/.test(evil.replace(/<script type="application\/ld\+json">/g, '')) , 'no raw </script> breakout in output');
ok(evil.includes('\\u003c'), 'angle brackets are escaped to \\u003c');
try { parseBlocks(evil); ok(true, 'escaped payload still parses as valid JSON'); }
catch (e) { ok(false, 'escaped payload parses — ' + e.message); }

// Empty input → empty string (no stray tags).
ok(seoJsonLd() === '', 'no args → empty string');
ok(seoJsonLd({ items: [{ name: 'x', path: '/x' }] }).includes('ItemList'), 'items without canonicalPath still emit ItemList');
ok(!seoJsonLd({ items: [{ name: 'x', path: '/x' }] }).includes('WebPage'), 'no canonicalPath → no WebPage/speakable block');

if (failures) { console.error(`\nseo-jsonld: ${failures} FAIL`); process.exit(1); }
console.log('\nseo-jsonld: ALL PASSED');
