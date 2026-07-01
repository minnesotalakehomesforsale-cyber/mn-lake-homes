/**
 * blog-content-v2.js — expanded, SEO-heavy blog bodies keyed by slug.
 *
 * The original blog-drafts.js posts were thin (~350 words). These v2 bodies
 * (700–1000 words, internal backlinks + lead CTAs) are pushed onto the existing
 * DB rows by seedBlogContentV2() in server.js, guarded by the '<!-- blog-v2 -->'
 * marker so it runs once per post and never re-clobbers admin edits.
 *
 * Written in parts (one per content batch) and merged here.
 */
function safe(path) {
    try { return require(path); } catch (_) { return {}; }
}

module.exports = Object.assign(
    {},
    safe('./blog-content-v2-part1'),
    safe('./blog-content-v2-part2'),
    safe('./blog-content-v2-part3'),
    safe('./blog-content-v2-part4'),
    safe('./blog-content-v2-part5'),
);
