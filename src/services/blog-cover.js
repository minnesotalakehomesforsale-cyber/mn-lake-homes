// ─── Per-post blog cover generator ──────────────────────────────────────────
// Every blog post gets its OWN unique, on-brand cover — never a recycled site
// photo. The image is generated deterministically from the post's slug, so it's
// stable (same slug → same art) yet distinct for every post: a lake-themed
// gradient + layered wave motif seeded by the slug, with the category eyebrow
// and the title set over it. Rendered as an SVG at /blog/cover/<slug>.svg.
//
// If a post has a REAL image (an admin upload / external URL — anything not from
// the shared /assets/images stock pool), that always wins. Drop in an image API
// later and coverUrlFor() is the single place to swap generation for real photos.

// Cheap deterministic 32-bit hash of a string → used to seed all the art.
function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Wrap a title into <=maxLines lines of roughly maxChars each (SVG has no
// auto-wrap). Long words are kept whole; overflow past maxLines is truncated
// with an ellipsis so the art never spills.
function wrapTitle(title, maxChars, maxLines) {
    const words = String(title || '').trim().split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
        if (!line) { line = w; continue; }
        if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
        else { lines.push(line); line = w; if (lines.length === maxLines) break; }
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
        lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,;:]?$/, '') + '…';
    }
    return lines;
}

// A curated set of on-brand (blue → teal → deep-lake) gradient pairs. The slug
// hash picks one, so covers vary but always feel like the same site.
const PALETTES = [
    ['#1d6df2', '#0d9488'], // brand blue → teal
    ['#0e7490', '#155e75'], // cyan → deep teal
    ['#1e3a8a', '#0d9488'], // indigo → teal
    ['#0f766e', '#065f46'], // teal → forest
    ['#2563eb', '#1e40af'], // blue → deep blue
    ['#0891b2', '#0e7490'], // sky → cyan
    ['#134e4a', '#115e59'], // dark teal duo
    ['#1d4ed8', '#0e7490'], // royal → cyan
];

// Generate the SVG string for a post's cover. 1200×630 (OG/social ratio).
function renderCoverSvg({ title, tag, slug }) {
    const seed = hash(slug || title || 'mn-lake-homes');
    const [c1, c2] = PALETTES[seed % PALETTES.length];
    const W = 1200, H = 630;

    // Three layered wave bands across the lower half, offsets seeded by slug.
    const bands = [0, 1, 2].map(i => {
        const s = hash((slug || '') + 'w' + i);
        const baseY = 300 + i * 78;
        const amp = 26 + (s % 34);
        const shift = (s >> 3) % 240;
        const y = (x) => baseY + Math.round(Math.sin((x + shift) / 150) * amp);
        let d = `M0 ${y(0)}`;
        for (let x = 120; x <= W; x += 120) d += ` Q ${x - 60} ${y(x - 60) - 22} ${x} ${y(x)}`;
        d += ` L ${W} ${H} L 0 ${H} Z`;
        const op = (0.10 + i * 0.07).toFixed(2);
        return `<path d="${d}" fill="#ffffff" fill-opacity="${op}"/>`;
    }).join('');

    // A few "sun/moon" dots up top for texture, seeded so they differ per post.
    const dots = [0, 1, 2].map(i => {
        const s = hash((slug || '') + 'd' + i);
        const cx = 120 + (s % (W - 240));
        const cy = 70 + ((s >> 4) % 150);
        const r = 5 + (s % 10);
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" fill-opacity="0.12"/>`;
    }).join('');

    const lines = wrapTitle(title, 24, 3);
    const lineH = 74;
    const startY = 348 - (lines.length - 1) * (lineH / 2);
    const titleTspans = lines.map((ln, i) =>
        `<tspan x="90" y="${startY + i * lineH}">${esc(ln)}</tspan>`).join('');

    const eyebrow = esc((tag || 'Lake Living').toUpperCase());

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  ${dots}
  ${bands}
  <text x="90" y="120" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="26" font-weight="800" letter-spacing="3" fill="#ffffff" fill-opacity="0.9">${eyebrow}</text>
  <rect x="90" y="150" width="64" height="5" rx="2.5" fill="#ffffff" fill-opacity="0.85"/>
  <text font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="60" font-weight="800" fill="#ffffff" letter-spacing="-1">${titleTspans}</text>
  <text x="90" y="580" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="#ffffff" fill-opacity="0.9">MinnesotaLakeHomesForSale.com</text>
</svg>`;
}

// Is this cover a real, post-specific image? Anything not empty and not from the
// shared /assets/images stock pool counts (admin uploads land on Cloudinary/
// external URLs). Stock or empty → we generate a unique cover instead.
function isRealImage(url) {
    if (!url || !String(url).trim()) return false;
    const u = String(url).trim();
    if (u.startsWith('/assets/images/')) return false;   // shared site stock — not blog-specific
    return true;
}

// The effective cover URL for a post: its own real image if it has one, else the
// unique generated cover for its slug.
function coverUrlFor(post) {
    if (!post) return null;
    return isRealImage(post.cover_image_url)
        ? post.cover_image_url
        : `/blog/cover/${encodeURIComponent(post.slug)}.svg`;
}

module.exports = { renderCoverSvg, coverUrlFor, isRealImage };
