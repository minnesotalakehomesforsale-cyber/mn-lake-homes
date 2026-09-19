// SEOW3 internal-link booster (in-repo, no DB) — links genuine plain-text
// mentions of distinctive Minnesota lakes to their lake pages, in blog posts
// that are under the internal-link floor. This is real linking of real mentions,
// not keyword stuffing: it only touches thin posts, only links a name the post
// already uses in prose, once per lake, capped per post, and never inside a tag,
// heading, or an existing <a>. Re-parses each file as valid JS afterward.
//
//   node scripts/link-blog.js            # DRY RUN — reports what it would add
//   node scripts/link-blog.js --write    # apply
//
// Curated to DISTINCTIVE names only (no "Big Lake"/"Long Lake"/"Cedar Lake" etc.
// that collide with generic prose or multiple lakes), so every link is correct.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'src/data');
const write = process.argv.includes('--write');
const MIN_INTERNAL = 3;
const PER_POST_CAP = 4;

// name (as it appears in prose, case-sensitive) -> lake slug. Distinctive only.
const LAKES = {
    'Gull Lake': 'gull-lake', 'Leech Lake': 'leech-lake', 'Lake Minnetonka': 'lake-minnetonka',
    'Mille Lacs Lake': 'mille-lacs-lake', 'Mille Lacs': 'mille-lacs-lake', 'Lake Vermilion': 'lake-vermilion',
    'Whitefish Chain': 'whitefish-chain', 'Lake of the Woods': 'lake-of-the-woods',
    'Lake Winnibigoshish': 'lake-winnibigoshish', 'Otter Tail Lake': 'otter-tail-lake',
    'Bde Maka Ska': 'bde-maka-ska', 'Lake Bemidji': 'lake-bemidji', 'Lake Kabetogama': 'kabetogama-lake',
    'Rainy Lake': 'rainy-lake', 'Lake Pepin': 'lake-pepin', 'Lake Carlos': 'lake-carlos',
    'Burntside Lake': 'burntside-lake', 'Big Stone Lake': 'big-stone-lake', 'Lake Minnewaska': 'lake-minnewaska',
    'North Long Lake': 'north-long-lake', 'Pokegama Lake': 'pokegama-lake', 'Lake Osakis': 'lake-osakis',
    'Cass Lake': 'cass-lake', 'Medicine Lake': 'medicine-lake', 'Lake Shetek': 'lake-shetek',
    'Lake Waconia': 'lake-waconia', 'Lake Minnewashta': 'lake-minnewashta', 'Grindstone Lake': 'grindstone-lake',
};
// Longest names first so "Mille Lacs Lake" wins over "Mille Lacs".
const NAMES = Object.keys(LAKES).sort((a, b) => b.length - a.length);

const files = fs.readdirSync(DATA).filter(f => /^(blog|fall-blog|default-blog).*\.js$/.test(f));
const INTERNAL_RE = /href="((?:\/(?!\/)|https?:\/\/(?:www\.)?minnesotalakehomesforsale\.com)[^"]*)"/gi;
const countLinks = body => [...String(body || '').matchAll(INTERNAL_RE)].filter(m => !/lakefind|dnr\.state|google|facebook|instagram/i.test(m[1])).length;

// Link the first plain-text occurrence of `name` in `body`, skipping tag interiors,
// <a>…</a>, and <h1-6>…</h6>. Returns [newBody, linked?].
function linkOne(body, name, slug) {
    const parts = body.split(/(<[^>]*>)/);   // odd indices are tags
    let inAnchor = 0, inHeading = 0;
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    for (let i = 0; i < parts.length; i++) {
        const tok = parts[i];
        if (i % 2 === 1) { // a tag
            const t = tok.toLowerCase();
            if (/^<a\b/.test(t)) inAnchor++;
            else if (/^<\/a>/.test(t)) inAnchor = Math.max(0, inAnchor - 1);
            else if (/^<h[1-6]\b/.test(t)) inHeading++;
            else if (/^<\/h[1-6]>/.test(t)) inHeading = Math.max(0, inHeading - 1);
            continue;
        }
        if (inAnchor || inHeading) continue;
        if (re.test(tok)) {
            // Single-quoted href matches the site's in-body HTML convention and
            // stays valid inside the double-quoted JS string literals these data
            // files use. Any file where it wouldn't parse is caught by vm.Script.
            parts[i] = tok.replace(re, `<a href='/lakes/${slug}'>${name}</a>`);
            return [parts.join(''), true];
        }
    }
    return [body, false];
}

let totalAdded = 0, postsTouched = 0;
const samples = [];

for (const file of files) {
    const full = path.join(DATA, file);
    let src = fs.readFileSync(full, 'utf8');
    const mod = require(full);
    const posts = Array.isArray(mod) ? mod : (Array.isArray(mod.posts) ? mod.posts : []);
    let fileChanged = false;

    for (const p of posts) {
        if (!p || !p.body || !p.slug) continue;
        if (countLinks(p.body) >= MIN_INTERNAL) continue;   // only thin posts
        let body = p.body, added = 0;
        for (const name of NAMES) {
            if (added >= PER_POST_CAP) break;
            const slug = LAKES[name];
            if (body.includes(`/lakes/${slug}`)) continue;   // already linked
            const [nb, ok] = linkOne(body, name, slug);
            if (ok) { body = nb; added++; }
        }
        if (added > 0) {
            // Swap the body verbatim. split/join (NOT String.replace) so `$` in
            // prices/bodies is never interpreted as a replacement pattern.
            if (src.includes(p.body)) { src = src.split(p.body).join(body); fileChanged = true; }
            else { continue; }   // couldn't locate verbatim (escaping) — skip, never corrupt
            totalAdded += added; postsTouched++;
            if (samples.length < 8) samples.push(`  +${added}  ${p.slug}`);
        }
    }

    if (fileChanged) {
        // Validate the transformed source PARSES before writing — never emit a
        // corrupt file. vm.Script throws on a syntax error without executing.
        try { new vm.Script(src, { filename: full }); }
        catch (e) { console.error(`  ✗ ${file}: transform would break JS (${e.message}) — SKIPPED, left untouched`); continue; }
        if (write) fs.writeFileSync(full, src);
    }
}

console.log(`\nSEOW3 link booster — ${write ? 'WRITE' : 'DRY RUN'}`);
console.log(`  thin posts touched: ${postsTouched}`);
console.log(`  internal links added: ${totalAdded}`);
console.log('  sample:'); samples.forEach(s => console.log(s));
if (!write) console.log('\nRe-run with --write to apply.');
