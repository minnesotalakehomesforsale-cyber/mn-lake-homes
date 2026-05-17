/**
 * site-images-scan.js — Walk every public HTML file and CSS file,
 * extract every `<img src="…">` and CSS `background-image: url(…)`,
 * and idempotently upsert each unique src into the site_images table
 * with the list of pages where it appears.
 *
 * Runs once per server boot from src/server.js after ensureTables().
 * Re-running is safe — INSERT … ON CONFLICT only updates page_paths +
 * last_seen_at, never overwrites an existing override_url.
 *
 * The admin Images page reads from this table to show every image on
 * the site; admin Replace uploads a new file and writes the Cloudinary
 * URL into override_url, which the frontend resolver in components.js
 * uses to swap any matching <img> src at page load.
 */

const fs   = require('fs').promises;
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Source files we scan. Index.html is the homepage; pages/public/* are
// all public pages. styles/* covers CSS background-image references.
// Admin pages, agent portal, and business portal are intentionally
// EXCLUDED — those images are internal and not shown to the public.
const SOURCE_GLOBS = [
    'index.html',
    'pages/public',
    'styles',
];

// Pull `<img src="…">` and `background-image: url(…)` URLs out of a string.
// Skips template tokens (`{{LAKE_HERO_IMAGE}}`), data: URLs, and anything
// that doesn't look like a real asset path (must start with `/` or `http`).
function extractImagesFromContent(content) {
    const found = new Set();

    // <img src="..."> (handles single + double quotes)
    const imgRe = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
    let m;
    while ((m = imgRe.exec(content)) !== null) {
        const src = (m[1] || m[2] || '').trim();
        if (isRealImageSrc(src)) found.add(src);
    }

    // CSS / inline-style background-image: url("…")
    const bgRe = /background(?:-image)?\s*:\s*[^;]*url\(\s*(?:"([^"]+)"|'([^']+)'|([^)]+))\s*\)/gi;
    while ((m = bgRe.exec(content)) !== null) {
        const src = (m[1] || m[2] || m[3] || '').trim();
        if (isRealImageSrc(src)) found.add(src);
    }

    return [...found];
}

function isRealImageSrc(src) {
    if (!src) return false;
    if (src.startsWith('{{')) return false;       // template token
    if (src.startsWith('data:')) return false;    // inline data URL
    if (src.startsWith('${')) return false;       // JS template literal
    if (src.startsWith('#')) return false;        // SVG fragment
    if (src.includes('${')) return false;         // dynamic
    if (!/\.(webp|jpe?g|png|svg|gif|avif)$/i.test(src.split('?')[0].split('#')[0])) return false;
    return src.startsWith('/') || src.startsWith('http://') || src.startsWith('https://');
}

async function walkFiles(rootRel) {
    const fullRoot = path.join(PROJECT_ROOT, rootRel);
    const stat = await fs.stat(fullRoot).catch(() => null);
    if (!stat) return [];
    if (stat.isFile()) return [{ abs: fullRoot, rel: rootRel }];
    const out = [];
    for (const name of await fs.readdir(fullRoot)) {
        if (name.startsWith('.')) continue;
        const abs = path.join(fullRoot, name);
        const rel = path.join(rootRel, name);
        const st  = await fs.stat(abs).catch(() => null);
        if (!st) continue;
        if (st.isDirectory()) {
            out.push(...await walkFiles(rel));
        } else if (/\.(html?|css)$/i.test(name)) {
            out.push({ abs, rel });
        }
    }
    return out;
}

// Turn a file path into a public-facing label for the admin UI.
// index.html → "/" ; pages/public/about.html → "/about" ; styles/x.css → "styles/x.css"
function publicPathFor(relPath) {
    if (relPath === 'index.html') return '/';
    const noPrefix = relPath.replace(/^pages\/public\//, '/').replace(/\.html$/, '');
    return noPrefix === '/index' ? '/' : noPrefix;
}

/**
 * Main entry point. Scans every source file, builds a map of
 * src → [pagePaths], then upserts into site_images.
 */
async function scanAndSync(pool) {
    if (!pool) return { scanned: 0, found: 0, inserted: 0, updated: 0 };

    const srcToPages = new Map(); // src → Set<publicPath>
    let scanned = 0;

    for (const root of SOURCE_GLOBS) {
        for (const file of await walkFiles(root)) {
            scanned++;
            let content;
            try { content = await fs.readFile(file.abs, 'utf8'); } catch (_) { continue; }
            const urls = extractImagesFromContent(content);
            if (!urls.length) continue;
            const pubPath = publicPathFor(file.rel);
            for (const url of urls) {
                if (!srcToPages.has(url)) srcToPages.set(url, new Set());
                srcToPages.get(url).add(pubPath);
            }
        }
    }

    if (!srcToPages.size) {
        console.log(`[site-images] scanned ${scanned} files, no images found`);
        return { scanned, found: 0, inserted: 0, updated: 0 };
    }

    let inserted = 0, updated = 0;
    for (const [src, pages] of srcToPages.entries()) {
        const pagesArr = [...pages].sort();
        try {
            const r = await pool.query(
                `INSERT INTO site_images (original_src, page_paths, last_seen_at, updated_at)
                 VALUES ($1, $2, NOW(), NOW())
                 ON CONFLICT (original_src) DO UPDATE
                   SET page_paths   = EXCLUDED.page_paths,
                       last_seen_at = NOW()
                 RETURNING (xmax = 0) AS inserted`,
                [src, pagesArr]
            );
            if (r.rows[0]?.inserted) inserted++; else updated++;
        } catch (err) {
            console.warn(`[site-images] upsert failed for "${src}":`, err.message);
        }
    }

    console.log(`[site-images] scanned ${scanned} files · ${srcToPages.size} unique images (${inserted} new, ${updated} refreshed)`);
    return { scanned, found: srcToPages.size, inserted, updated };
}

module.exports = { scanAndSync, extractImagesFromContent, publicPathFor };
