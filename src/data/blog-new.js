/**
 * blog-new.js — newest batch of SEO/lead-gen posts, staged as DRAFTS
 * (is_published:false). Merged from the part files each writer produced.
 * seedBlogPosts() inserts them ON CONFLICT (slug) DO NOTHING, so they show
 * up in the admin Blog list ready to publish, but stay off the public site
 * until an admin publishes them. They are NOT in the v2 refresh map, so the
 * publish-on-deploy step never touches them.
 */
module.exports = [
    ...require('./blog-new-part1'),
    ...require('./blog-new-part2'),
    ...require('./blog-new-part3'),
];
