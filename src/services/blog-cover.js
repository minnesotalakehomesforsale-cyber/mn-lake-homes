// ─── Blog cover resolution ──────────────────────────────────────────────────
// A blog post shows a cover ONLY if it has its own post-specific image — either
// an admin/generated upload (hosted on Cloudinary / an external URL) or nothing.
// It never falls back to a recycled /assets/images site stock photo: posts
// without their own image simply render blank (text-first).

// Is this cover a real, post-specific image? Anything not empty and not from the
// shared /assets/images stock pool counts (uploads land on Cloudinary/external).
function isRealImage(url) {
    if (!url || !String(url).trim()) return false;
    const u = String(url).trim();
    if (u.startsWith('/assets/images/')) return false;   // shared site stock — not blog-specific
    return true;
}

// The effective cover URL for a post: its own real image, or null (render blank).
function coverUrlFor(post) {
    if (!post) return null;
    return isRealImage(post.cover_image_url) ? post.cover_image_url : null;
}

module.exports = { coverUrlFor, isRealImage };
