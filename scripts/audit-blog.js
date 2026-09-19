// SEOW3 audit (read-only, no DB) — the ground truth before publishing any blog
// wave. Loads every src/data/blog*.js + fall-blog data file, then reports per
// post: publish state, whether its cover image actually resolves, and internal-
// link density (the two things SEOW3 says must be fixed BEFORE publishing).
//
//   node scripts/audit-blog.js            # summary + the problem lists
//   node scripts/audit-blog.js --verbose  # every post, one line each
//
// Nothing is written. Local cover paths are checked against the repo; Cloudinary/
// http covers are assumed served (spot-checkable separately). Internal links are
// hrefs pointing at our own routes (/lakes, /towns, /blog, /compare, /fishing…).

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'src/data');

const verbose = process.argv.includes('--verbose');

// Every blog data file. default-blog-posts exports {posts:[]}; the rest export [].
const files = fs.readdirSync(DATA).filter(f => /^(blog|fall-blog|default-blog).*\.js$/.test(f));

function loadPosts(file) {
    try {
        const m = require(path.join(DATA, file));
        const arr = Array.isArray(m) ? m : (Array.isArray(m.posts) ? m.posts : []);
        return arr.filter(p => p && p.slug && p.body);
    } catch (e) { console.warn(`  ! could not load ${file}: ${e.message}`); return []; }
}

const coverExists = url => {
    if (!url) return false;
    if (/^https?:\/\//i.test(url)) return true;               // external (Cloudinary etc.) — assume served
    const rel = url.replace(/^\//, '');
    return fs.existsSync(path.join(ROOT, rel)) || fs.existsSync(path.join(ROOT, 'public', rel));
};

// Internal links = hrefs to our own routes (relative, or our own domain).
const INTERNAL_RE = /href="((?:\/(?!\/)|https?:\/\/(?:www\.)?minnesotalakehomesforsale\.com)[^"]*)"/gi;
function linkStats(body) {
    const hrefs = [...String(body || '').matchAll(INTERNAL_RE)].map(m => m[1]);
    const internal = hrefs.filter(h => !/lakefind|dnr\.state|google|facebook|instagram/i.test(h));
    return {
        total: internal.length,
        lakes: internal.filter(h => /\/lakes\//.test(h)).length,
        towns: internal.filter(h => /\/towns\//.test(h)).length,
    };
}

const MIN_INTERNAL = 3;   // house standard is "heavy internal linking"; flag < 3
const seen = new Map();   // slug -> file (detect dupes across files)
const all = [];

for (const file of files) {
    for (const p of loadPosts(file)) {
        if (seen.has(p.slug)) { all.find(x => x.slug === p.slug).dupeIn ||= []; all.find(x => x.slug === p.slug).dupeIn.push(file); continue; }
        seen.set(p.slug, file);
        const ls = linkStats(p.body);
        all.push({ slug: p.slug, file, published: !!p.is_published, cover: p.cover_image_url || '',
            coverOk: coverExists(p.cover_image_url), links: ls.total, lakeLinks: ls.lakes, townLinks: ls.towns });
    }
}

const brokenCover = all.filter(p => p.cover && !p.coverOk);
const noCover = all.filter(p => !p.cover);
const thin = all.filter(p => p.links < MIN_INTERNAL);
const published = all.filter(p => p.published);
const readyToPublish = all.filter(p => !p.published && p.coverOk && p.cover && p.links >= MIN_INTERNAL);

console.log(`\n=== SEOW3 blog audit — ${all.length} unique posts across ${files.length} data files ===\n`);
console.log(`  published .......................... ${published.length}`);
console.log(`  unpublished (drafts) ............... ${all.length - published.length}`);
console.log(`  broken cover image (local, missing)  ${brokenCover.length}`);
console.log(`  no cover image at all .............. ${noCover.length}`);
console.log(`  thin internal linking (< ${MIN_INTERNAL}) ....... ${thin.length}`);
console.log(`  total internal lake links .......... ${all.reduce((s, p) => s + p.lakeLinks, 0)}`);
console.log(`  total internal town links .......... ${all.reduce((s, p) => s + p.townLinks, 0)}`);
console.log(`  ✅ draft + cover OK + >=${MIN_INTERNAL} links = ready ${readyToPublish.length}\n`);

if (brokenCover.length) {
    console.log(`Broken cover images (${brokenCover.length}):`);
    for (const p of brokenCover) console.log(`  ✗ ${p.slug}  → ${p.cover}  [${p.file}]`);
    console.log('');
}
if (verbose) {
    console.log('All posts (slug | pub | coverOk | links(lake/town)):');
    for (const p of all.sort((a, b) => a.links - b.links))
        console.log(`  ${p.published ? 'P' : 'd'} ${p.coverOk ? '✓' : '✗'} ${String(p.links).padStart(2)}(${p.lakeLinks}/${p.townLinks})  ${p.slug}`);
}
