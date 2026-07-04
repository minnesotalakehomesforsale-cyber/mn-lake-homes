# 00 Publishing Pipeline — SOURCE OF TRUTH
**How blog posts actually get onto MinnesotaLakeHomesForSale.com. Read this before every batch.**
_Owner: Director of Marketing · Created 2026-06-19 · Supersedes the old "handoff folder" model._

> **Why this exists:** the morning task used to drop drafts + Pexels URLs into a `Handoff to Dev/` folder that the dev's machine can't see, using URL conventions that didn't match the live site (place-nested slugs, trailing slashes). That created rework every time. The blog is **database-backed and published by an import script committed to the site repo.** From now on the task writes directly into the repo. No handoff folder is required for publishing.

---

## 1. The site repo (where everything goes)

**Repo root:** `/Users/hunterburnside/Desktop/CommonRealtor-Test copy/`
(Connect this folder in Cowork at the start of each run. It is a real git repo.)

Key locations:
- **Hero images:** `assets/images/blog/` — file naming `hero-<slug>.jpg`
- **Import scripts (one per batch):** `scripts/import-blog-posts-YYYY-MM-DD.js`
- **Pattern to copy:** `scripts/import-blog-posts-2026-06-16.js` and `scripts/import-blog-posts-2026-06-19.js`
- **Live-page source of truth (lakes):** `src/database/lakes-seed.js`
- **Blog routes/controller:** `src/routes/blog.routes.js`, `src/controllers/blog.controller.js`

---

## 2. URL conventions (CONFIRMED against the live code — do not deviate)

- **Blog posts:** flat — `/blog/<slug>` (NO place nesting, NO trailing slash). Route is `/blog/:slug`.
- **Lake pages:** `/lakes/<slug>` (no trailing slash). Route is `/lakes/:slug`.
- **Towns:** ❌ **no town route is wired yet.** Do NOT link `/towns/...` until a town route exists in `src/routes/`. Mention towns in prose instead.
- **Get-matched / agent CTA:** `/pages/public/buy.html` (use the `ctaButton()` helper in the import script).
- **External links:** MN DNR / MN Dept. of Health / other gov + tourism only. Never competitors (Zillow, Realtor.com, Redfin, LakePlace, LakeHomes, LakeHouse, etc.). Add `target="_blank" rel="noopener"`.

---

## 3. What's LIVE right now (re-verify each run from the repo, don't trust this list blindly)

**Seeded lake pages (`/lakes/<slug>`) — from `src/database/lakes-seed.js`:**
`cass-lake`, `detroit-lake`, `gull-lake`, `lake-minnetonka`, `lake-of-the-woods`, `lake-vermilion`, `leech-lake`, `mille-lacs-lake`, `pelican-lake`, `white-bear-lake`

> ⚠️ This means the old `Live Money Pages Registry.md` was over-cautious — most Tier-1 lakes ARE live. **The real allow-list is `lakes-seed.js`.** Grep it each run: `grep -o "slug: '[a-z-]*'" src/database/lakes-seed.js`.

**Published blog slugs (cross-link targets) — grep the import scripts + `src/data/default-blog-posts.js`:**
- `why-a-local-lake-specialist-beats-a-national-portal`
- `how-to-work-with-a-lake-specialist-agent`
- `what-vetted-licensed-local-means`
- `buying-lakefront-why-a-general-agent-isnt-enough`
- `how-lake-home-matching-works-and-why-its-free-to-you`
- `questions-to-ask-before-you-pick-a-lake-agent`
- `mille-lacs-lake-buyers-guide-2026`, `living-on-mille-lacs-lake`, `mille-lacs-lake-vs-gull-lake` (2026-06-19)

**Not yet imported (do NOT cross-link until their import script exists & is run):** the 2026-06-18 Lake Minnetonka drafts in `Handoff to Dev/2026-06-18/` were never imported. Re-import them via a script or drop them.

---

## 4. The `blog_posts` table columns (what the import script sets)

`title, slug, excerpt, body (HTML), cover_image_url, tag, read_time_minutes, is_published, published_at, author_name, seo_title, seo_description`

- **`tag`** = the **reader-facing badge** on the page (HARD RULE 2). Pick a real consumer category per post (e.g. "Mille Lacs Buyer Guide", "Mille Lacs Lifestyle", "Choosing a Lake"). NEVER write internal buckets ("Tier-1", "Evergreen/Trust") to `tag`.
- **`body`** is **HTML** (`<p>`, `<h2>`, `<ul>`), not markdown.
- **`cover_image_url`** = `/assets/images/blog/hero-<slug>.jpg`.
- Upsert is **slug-keyed and idempotent** — re-running a script is safe.

---

## 5. Per-batch procedure (the repeatable system)

1. Connect the repo folder; `git pull` if needed.
2. Research + write each post per `01 Workflow & Outputs.md` (1,200–1,800 words, one angle, voice + guardrails from `CLAUDE.md`).
3. Convert each body to **HTML**; assign a flat `slug`, a reader-facing `tag`, `seo_title`, 145–160-char `seo_description`, `excerpt`.
4. **Links:** 8–12 per post — UP to live lake pages (verify in `lakes-seed.js`), ACROSS to live/in-batch blog slugs, the `ctaButton()` to `/pages/public/buy.html`, and 2–4 external gov sources. No town links. No competitors.
5. Download hero images into `assets/images/blog/hero-<slug>.jpg` (free-license; Pexels preferred — view before choosing).
6. Write `scripts/import-blog-posts-YYYY-MM-DD.js` (copy the latest sibling; swap the `POSTS` array + header comment).
7. **Verify:** `node --check scripts/import-blog-posts-YYYY-MM-DD.js`; grep every `/blog/` and `/lakes/` link against the live lists; confirm each `hero-*.jpg` exists.
8. Update `Production Queue.md` (check off) and `Published Log.md`.
9. Report with the one dev command: `node scripts/import-blog-posts-YYYY-MM-DD.js`.

**Dev runs one line, then deploys:**
```
node scripts/import-blog-posts-YYYY-MM-DD.js
```

That's the whole pipeline. Images committed + one idempotent script = published.
