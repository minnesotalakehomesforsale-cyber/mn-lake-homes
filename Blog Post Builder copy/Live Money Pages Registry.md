# Live Money Pages Registry
**The ONLY pages the blog task may link to. If a page isn't in "CONFIRMED LIVE," do not link it (HARD RULE 1).**
_Owner: Director of Marketing · Maintained with the dev (Product & Eng owns the pages + geo tags)._
_Updated 2026-06-19._

> ⚠️ **2026-06-19 — the REAL allow-list now lives in the repo, not this file.** We connected the site repo (`~/Desktop/CommonRealtor-Test copy/`) and the live lake pages are whatever is seeded in **`src/database/lakes-seed.js`**. This file had been over-cautious — most Tier-1 lakes are in fact live. See `00 Publishing Pipeline (SOURCE OF TRUTH).md`. Verify each run: `grep -o "slug: '[a-z0-9-]*'" src/database/lakes-seed.js`.
> **Confirmed seeded live (2026-06-19):** `cass-lake`, `detroit-lake`, `gull-lake`, `lake-minnetonka`, `lake-of-the-woods`, `lake-vermilion`, `leech-lake`, `mille-lacs-lake`, `pelican-lake`, `white-bear-lake`. URL form is `/lakes/<slug>` (no trailing slash). Blogs are flat `/blog/<slug>`. **No town route exists yet — do not link `/towns/...`.**

Why this exists: the blog task now uses **a lot more internal links** (see `Internal Link & Backlink Standard.md`). More links = more chances to 404. This registry is the allow-list. Hunter confirms with the dev which `/lakes/` and `/towns/` pages are actually live (and that their **geo tags resolve to the correct lake/town**), then we move slugs into CONFIRMED LIVE.

URL convention (confirmed with dev): money pages are **PLURAL** — `/lakes/<slug>/`, `/towns/<slug>/`. Blogs: `/blog/<slug>/`.

---

## CONFIRMED LIVE — safe to link now
Used in shipped handoffs and confirmed with dev on the plural convention.

| Type | URL | Notes |
|---|---|---|
| Home / get-matched | `/` | always linkable |
| Lake | `/lakes/lake-minnetonka/` | linked in 06-15 & 06-16 batches |
| Lake | `/lakes/gull-lake/` | linked in 06-15 & 06-16 batches |
| Lake | `/lakes/whitefish-chain/` | linked in 06-15 & 06-16 batches |
| Town | `/towns/brainerd/` | linked in 06-15 & 06-16 batches |

**Published blog posts (linkable as cross-links):**
- `/blog/why-a-local-lake-specialist-beats-a-national-portal/`
- `/blog/how-to-work-with-a-lake-specialist-agent/`
- `/blog/what-vetted-licensed-local-means/`
- `/blog/buying-lakefront-why-a-general-agent-isnt-enough/`
- `/blog/how-lake-home-matching-works-and-why-its-free-to-you/`
- `/blog/questions-to-ask-before-you-pick-a-lake-agent/`

---

## BUILT IN COWORK — confirm live + geo with dev before linking
- `/lakes/detroit-lake/` — Detroit Lake page content was built in `Lake Page Builder/Lakes/Detroit Lake/`. Confirm the dev has shipped it live and the geo tag is correct, then move to CONFIRMED LIVE.

---

## PENDING DEV CONFIRMATION — do NOT link until confirmed
Expected Tier-1 slugs from the Production Queue. The 6-Month Plan assumes these money pages are already live, but we have not individually confirmed each slug **or** that its geo tag points to the right place. Hunter to confirm the full list with the dev (see dev questions below), then promote.

**Lakes (expected slugs):** `/lakes/mille-lacs-lake/`, `/lakes/leech-lake/`, `/lakes/lake-vermilion/`, `/lakes/otter-tail-lake/`, `/lakes/pelican-lake-crow-wing/`, `/lakes/cross-lake/`, `/lakes/lake-of-the-woods/`, `/lakes/rainy-lake/`, `/lakes/lake-pepin/`, `/lakes/lake-winnibigoshish/`, `/lakes/cass-lake/`

**Towns (expected slugs):** `/towns/crosslake/`, `/towns/nisswa/`, `/towns/pequot-lakes/`, `/towns/detroit-lakes/`, `/towns/walker/`, `/towns/park-rapids/`, `/towns/alexandria/`, `/towns/wayzata/`, `/towns/bemidji/`

(Slugs above are the *expected* kebab-case form; the dev confirms exact live slugs.)

---

## Questions for the dev (Hunter copy-pastes) — geo tags + page allow-list
1. **Which `/lakes/<slug>/` and `/towns/<slug>/` pages are live right now?** Please send the exact slug list so we only internal-link real pages.
2. **Are the geo tags working on each money page** — is the `Place` + `GeoCoordinates` (and any local-business/geo meta) present, and do the coordinates resolve to the **correct** lake/town? Any page where the geo tag is missing or points to the wrong spot?
3. Do the money pages expose a **"Trusted [Lake] Agents"** section with a linkable anchor (e.g., `#agents`), so blogs can deep-link the matching/agents block?
4. For internal links, anything we should know about **trailing slashes / canonical** so links don't redirect or 404?
5. As you ship new lake/town pages, can you ping the slug so we keep this registry current?

When the dev answers #1–#2, move every confirmed slug into **CONFIRMED LIVE** and note geo = OK.
