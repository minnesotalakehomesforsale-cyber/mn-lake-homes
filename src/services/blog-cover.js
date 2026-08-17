// ─── Blog cover resolution ──────────────────────────────────────────────────
// A blog post shows whatever cover is set on it — a Cloudinary/external upload OR
// a curated /assets/images photo (our posts are seeded with specific, relevant
// site images, e.g. mn-gallery-020.jpg for the paddling post). A post with NO
// cover at all renders the generated colored cover (window.mnlhBlogCover),
// matching the blog cards, so it's never a bare headline.
//
// (Previously this stripped every /assets/images path as "recycled stock", which
// blanked the curated covers the seeder assigns — the covers never showed.)

// Does the post have a cover image set? Any non-empty URL counts.
function isRealImage(url) {
    return !!(url && String(url).trim());
}

// The effective cover URL for a post: its own real image, or null (render blank).
function coverUrlFor(post) {
    if (!post) return null;
    return isRealImage(post.cover_image_url) ? post.cover_image_url : null;
}

module.exports = { coverUrlFor, isRealImage };
