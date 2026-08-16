# Publishing a Lake Page (no developer needed)

**Goal:** a non-developer can create and publish a new lake page in under 90 minutes.
**Who this is for:** content/marketing staff with an admin login.
**Audience of the page:** buyers searching "<lake> mn homes for sale" — so the page must be complete and never render heroless.

---

## The one hard rule

**A lake page must never go live without a hero image.** Heroless lake pages are excluded from the sitemap and are treated as a 404 for SEO. If you can't source a real photo yet, leave the lake in **draft** — do not publish it.

---

## Step-by-step

### 1. Open the lake editor
Admin portal → **Lakes & Towns → Lakes**. Search for the lake. If it doesn't exist, click **+ New lake**.

### 2. Fill the required fields
| Field | What it's for | Notes |
|---|---|---|
| **Name** | Page title + `<h1>` | e.g. "Lake Vermilion" |
| **Slug** | URL (`/lakes/<slug>`) | auto-generated; keep it clean, lowercase, hyphenated |
| **Region / County / State** | breadcrumb + location schema | |
| **Hero image** | the required banner | see §3 — this is the gate |
| **Intro text** | one punchy line under the H1 | 1 sentence |
| **Description** | the long-form overview | 600–1,500 words, factual, no invented stats |
| **SEO title / SEO description** | search snippet | title ≈ "<Lake> Homes for Sale \| MN Lake Homes" |

### 3. Set the hero image (the gate)
Upload a real photo or pick from the image library. If none exists, use a representative placeholder from `assets/images/` (e.g. `mn-lakefront-sunset-dock.jpg`) **only as a stopgap** — a real photo always wins. The page will not be allowed into the sitemap until `hero_image_url` is set.

### 4. Add the DNR facts (optional but recommended)
Enter the lake's **DNR ID (`dow_number`)** and run **Enrich from DNR** — this auto-fills acreage, depth, clarity, public accesses, and the fish survey. These power the on-page fact panel, the FAQ schema, and the agent-branded fact sheet.

### 5. Link nearby towns & agents (optional)
- **Nearby towns:** attach town tags so the "Discover more around <lake>" cards populate.
- **Agents/businesses** auto-appear from their own service-area assignments — you don't set these here.

### 6. Preview, then publish
Click **Preview** to see the live render. Check: hero shows, no `{{TOKENS}}` visible, FAQ accordion renders, facts panel populated. Then set **Status → Published**.

### 7. Verify it's indexable
- Visit `/lakes/<slug>` — it should load with the hero.
- Confirm it appears in `/sitemap.xml` (published + hero present = included automatically).

---

## What happens automatically (don't do these by hand)
- **FAQ + FAQPage schema** — generated from templates per lake; no manual entry.
- **BreadcrumbList / Place / RealEstateListing / LocalBusiness schema** — injected at render.
- **Sitemap inclusion** — automatic once published *and* a hero is set.
- **Curated Tier-1 content** — the 15 Tier-1 lakes are seeded from `src/data/tier1-content.js` on deploy; edit that file (a dev task) rather than the admin editor for those, or your admin edits get re-applied on next deploy.

---

## Common mistakes
- **Publishing without a hero** → page 404s for SEO. Leave it draft instead.
- **Inventing stats** (acreage/depth) → only use DNR-enriched or verified numbers; omit if unsure.
- **Editing a Tier-1 lake's copy in the admin UI** → gets overwritten on the next deploy; change `tier1-content.js` instead.
- **Thin description** → aim for 600+ words; short pages don't rank.

---

## Time budget
- New lake, photo in hand, DNR ID known: **~30 min.**
- Writing a fresh 600–1,000 word description: **+45 min.**
- Total: **well under 90 minutes.**
