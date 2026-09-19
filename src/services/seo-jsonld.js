'use strict';

// Shared JSON-LD builder for the programmatic hub/list pages (SEOP08 + AEO04).
// Emits up to three blocks: WebPage + SpeakableSpecification (the extractable
// answer for voice/AI), BreadcrumbList, and ItemList. This is the single builder
// behind the county/area/fishing/compare/homes pages, so schema integrity is
// tested in one place (test/seo-jsonld.test.js) — SEOCI test "schema integrity".
//
// Values are JSON-encoded AND `<`-escaped to <, so a lake or region name
// containing "</script>" cannot break out of the <script> tag it's embedded in.

const BASE = 'https://minnesotalakehomesforsale.com';

// JSON-encode, then neutralize any '<' so the string is safe inside <script>.
const enc = obj => JSON.stringify(obj).replace(/</g, '\\u003c');

function seoJsonLd({ crumbs = [], items = [], canonicalPath = '', name = '', speakable = true } = {}) {
    const blocks = [];
    if (speakable && canonicalPath) {
        blocks.push(enc({
            '@context': 'https://schema.org', '@type': 'WebPage',
            url: BASE + canonicalPath, ...(name ? { name } : {}),
            speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.cty-hero h1', '.cty-lede'] },
        }));
    }
    if (crumbs.length) {
        blocks.push(enc({
            '@context': 'https://schema.org', '@type': 'BreadcrumbList',
            itemListElement: crumbs.map((c, i) => ({
                '@type': 'ListItem', position: i + 1, name: c.name,
                ...(c.path ? { item: BASE + c.path } : {}),
            })),
        }));
    }
    if (items.length) {
        blocks.push(enc({
            '@context': 'https://schema.org', '@type': 'ItemList',
            ...(name ? { name } : {}), ...(canonicalPath ? { url: BASE + canonicalPath } : {}),
            numberOfItems: items.length,
            itemListElement: items.map((it, i) => ({
                '@type': 'ListItem', position: i + 1, name: it.name, url: BASE + it.path,
            })),
        }));
    }
    return blocks.map(b => `<script type="application/ld+json">${b}</script>`).join('');
}

module.exports = { seoJsonLd, BASE };
