# B0 — Sitemap Baseline Reconciliation (pre-seal)

**Question:** an independent 8/16 crawl counted the sitemap at ~335 URLs (incl. 67 lakes); today it is **202** (single flat `<urlset>`). Account for the ~133 delta before sealing the baseline floor, so a later recovery isn't misread as growth.

## Verdict: no content was lost. Two corrections + one real bug.

### Blog — no loss (the ~120 I first mis-bucketed)
- The blog sitemap predicate (`is_published = TRUE AND deleted_at IS NULL`) is **git-unchanged since 8/14**, and blog publish state **did not move**: `/api/blog` publish history shows a steady editorial cadence — ~33 live on 8 Jul (matching an independent Master Blog Inventory snapshot), 57 by 20 Jul, +3 on 8/14, +5 on 8/20 = **65**; largest same-minute burst ever = 9. **No mass publish, no unpublish.** The live blog count was always ~65 and never near 185.
- **Divergence check:** the data files mark 7 published / 212 draft; 65 are live. That 58-post gap *disproves* a "script reset publish state from file flags" theory — had that happened, 7 would survive, not 65.
- **~335 "state-split double-count" theory: not supported.** Git shows the sitemap route never emitted a `<sitemapindex>` or child files; all `sitemap-*.xml` / `sitemap-index.xml` URLs 404. The ~335 is a **miscount of unidentified origin — but provably not a blog loss.**

### Lakes — 67 → 54, and here's the real finding (my "by construction" claim was WRONG)
15 lakes render (HTTP 200) and are linked from `/lakes`, but are `noindex` + absent from the sitemap. The gate — sitemap (`server.js:661`) and robots (`server.js:885`) — checks **`intro_text OR description` columns only**, while the page also renders `lifestyle_text` / `seasons_text` (`server.js:865`). So the gate does **not** track rendered content. Confirmed: `lake-hubert` renders 1,602 words yet is NOINDEX; `cannon-lake` renders 1,516 and is indexed — word count is not the discriminator, the two columns are.

**8 CORRECTLY excluded** (no unique copy; shared stock hero — templated lifestyle/seasons only):
`lake-hubert · lake-shamineau · serpent-lake · clearwater-lake · lake-sylvia · sugar-lake · lake-okabena · lake-riley`

**7 WRONGLY excluded** — ⚠️ **known-wrong exclusion, do not count their Wave-1 return as growth:**
`bay-lake · big-marine-lake · north-long-lake · lake-shetek · south-long-lake · lake-zumbro · lake-koronis`
All 7 have **unique copy in `lifestyle_text`/`seasons_text` (via `lake-content.js`) + `lake-seo.js` + a unique hero**, but empty `intro_text`/`description` — so the gate can't see their content. Verified: all 7 are present in `src/data/lake-content.js`.

**Gate-parity break:** `/lakes` link surface = YES, robots = NO, sitemap = NO. This is the **exact inverse of the Brainerd/Alexandria/Bemidji town-orphan bug** (there: link surface NO, robots/sitemap YES). Same root cause — a predicate that doesn't match the page — from the other side.

### Towns / agents — corrected
- Towns: **55** (matches the 8/16 record; lakeville/shoreview/monticello added by `54b9949`). **Dropped 0**, not 1.
- Agents: **4 profiles** + the `/agents` index. (−1 profile today = the bio-less-agent noindex, deliberate.)

## Baseline decisions (seal-time)
1. **Sitemap floor = 202** (single flat file, internally consistent). The 8/16 ~335 is a miscount and is **not** the floor.
2. **~119 URLs currently return 404** — staged-calendar drafts, formerly briefly in the sitemap. Transient-correct (not 410). Wave 3 republishing flips them to 200. A later 404 dip here is **expected, not regression.**
3. **The 7 wrongly-excluded content lakes are recorded here as a known-wrong exclusion.** When Wave 1 fixes the shared lake predicate and they re-enter the sitemap, that is a **correction, not growth** — do not attribute it to the program.
4. **13→15 note:** the "13 dark lakes" from the prior turn is actually **15** (the 8 templated + the 7 content-bearing). The 8 go on the content backlog (owe copy); the 7 are a **predicate bug**, not a content backlog.

## Town gate — checked in the same pass (read-only, 2026-08-21)
The town gate has the **same family of mismatch, and a second one** — a lake-only fix would pass the parity test and leave towns broken:
1. **Column-vs-template, latent.** The town template renders `tag.lifestyle_text`/`tag.seasons_text` when set (`server.js:2102-2107`) — same pattern as lakes — while the predicate reads only `intro_text OR description`. Masked today only because the town route SELECT (`server.js:2002`) doesn't fetch those columns, so they're always templated. Activates the moment a town gets curated lifestyle/seasons + the SELECT is fixed (a planned town-content improvement).
2. **Link-surface-vs-predicate, ACTIVE.** Link surfaces are hero-gated (`COALESCE(hero_image_url,'')<>''` at `server.js:1820` /towns nav, `2027` lake→nearby-towns) while robots/sitemap are content-gated → content-rich heroless towns indexed with zero SSR links (Brainerd/Alexandria orphan).

## Fix (Wave 1 — where the predicate work already lives)
**One shared predicate per entity, for lakes AND towns**, reflecting **every content column the template can render** (intro_text / description / lifestyle_text / seasons_text), consumed by **all three surfaces — the sitemap query, the `/:slug` route robots, AND the link surfaces** (drop the hero-gating on links). Extract `src/services/lake-visibility.js` mirroring the existing `town-visibility.js`, and extend `town-visibility.js` to read the lifestyle/seasons columns too. Add a **gate-parity test asserting sitemap-gate == robots-gate == link-surface-gate for BOTH entity types**, so neither the orphan (town, link-surface side) nor the linked-but-noindex (lake, column side) direction can recur — and so the test can't pass on lakes while towns stay broken.
