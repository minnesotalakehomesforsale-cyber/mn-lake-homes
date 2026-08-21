# SEO — Roadmap to A+
**MinnesotaLakeHomesForSale.com · the living SEO doc**
*Written 2026-08-21, off the back of the dev's technical audit dated 2026-08-20. Owner: Hunter. Executor: dev, full-time, ~3 weeks.*
*This is the one doc for SEO. Update it in place — do not spawn a second SEO doc.*

---

## 0. Read this first

The audit graded us **B+**. That grade is honest and it is also good news: a B+ that comes from *hiding good work from crawlers* is much cheaper to fix than a B+ that comes from having nothing to rank. Almost every finding is "the content exists, the crawler can't see it" or "the gate on page A disagrees with the gate on page B." That is plumbing, not authorship.

**The one filter, unchanged:** does this move high-intent traffic toward a captured lead, or a captured lead toward a paying agent? Every ticket below is there because it moves organic entrances onto lake and town pages, which are the pages that carry the lead form.

---

## 0.1 Status log

*Newest first. Keep this current — it is how anyone picking the doc up knows where we actually are.*

### 2026-08-21 · SEO-03 uncovered a production exposure, not a crawl problem

While scoping `express.static` off the repo root, the dev confirmed the following were returning **HTTP 200 on production**:

- `src/server.js` — the entire backend source
- `package.json`
- all three operator scripts (`seo-audit.js`, `reset-admin.js`, `pull-numbers.js`)
- `lake-agent-prospects.csv` — a prospect contact list

`.env` and `.git` were **not** exposed (dotfiles ignored) — a thin margin, now moot.

**Reclassified from a Wave-0 SEO ticket to a production incident.** The preview→crawl→prod gate is waived for SEO-03; the fix merges straight to `main` on the strength of its deterministic CI test (`test/static-exposure.test.js`). Continuing to serve backend source and a contact list publicly is a larger risk than an asset path breaking, which is recoverable in minutes.

**Follow-ups that are not the deploy** (tracked as SEC-01…04, owner: dev unless noted):

| # | Action |
|---|---|
| **SEC-01** | Remove `lake-agent-prospects.csv` from the prod filesystem. Confirm it never entered git history (`git log --all -- '*lake-agent-prospects*'`). Hunter reviews the columns to determine whether it holds personal contact details as opposed to public business listings. |
| **SEC-02** | **Root cause: the file is untracked in git yet reached prod disk.** Whatever deploy path put it there will put the next one there too. Identify the mechanism and inventory everything currently sitting at the prod repo root. |
| **SEC-03** | Pull prod access logs for GETs on all five exposed paths. Determine whether anything actually fetched them, and how often. Source disclosure with no retrieval is a near-miss; with retrieval it's an incident with a scope. |
| **SEC-04** | Grep `src/server.js` for hardcoded secrets or fallback credentials before concluding "`.env` was safe" means nothing leaked. Rotate anything found. Note that route map, table names and auth approach are disclosed regardless. |

### 2026-08-21 (late) · SEC-05 was the real finding — two live vulnerabilities, now fixed (`d24d49a`)

`NODE_ENV=staging` on the production service wasn't cosmetic. Two things it was actively causing:

- **Session JWTs were being set without the `Secure` flag** on four cookie sites.
- **Unhandled 500s returned full stack traces to the client** — no terminal error handler existed.

Both fixed, and fixed **independent of the `NODE_ENV` string** — cookies now driven by `SECURE_COOKIES` (true for any deployed env, gated by `test/secure-cookies.test.js`), and the terminal handler never emits a stack regardless of environment. That is the right call: security should not hinge on one env name matching `'production'`, which is exactly what bit here. `app.set('trust proxy', 1)` also added, so `req.secure`/`req.ip` are correct behind Render's TLS.

**Also shipped:** operator scripts relocated to `scripts/` (kept, unservable) · CSV and stray HTML untracked non-destructively (local copies kept) · `.gitignore` guards root-level `/*.csv` · the `'mnlakehomes-unsub'` literal dropped for a dedicated `UNSUB_SECRET` · demo-agent password log removed. Full suite green including the 117 admin and 43 agent/lead auth-route audits.

**Still open:**

| # | Item | Owner | Decision |
|---|---|---|---|
| **SEC-05a** | `NODE_ENV=staging` on prod | Hunter | **Set it to `production`** — but first confirm whether any `.env.*` file actually exists on the Render instance. If config comes from Render's dashboard vars (likely), the flip is nearly free. If `.env.staging` is real, diff it against `.env.production` before flipping and do it in a low-traffic window with a rollback ready. A stale `.env.production` is the one thing that could take the site down. |
| **SEC-05b** | CORS is `origin: true` + `credentials: true` | Hunter → dev | Allowlist: apex + `www` prod domain, plus localhost. **Do not hard-enforce on day one.** Ship the allowlist in log-and-allow mode for 48h first, then enforce. If any HubSpot landing page or embed calls the API cross-origin, hard enforcement silently kills lead capture — and not losing leads is rule #1. The log tells us instead of guessing. |
| **SEC-05c** | Confirm HSTS is present on prod | dev | If HSTS + forced HTTPS redirect are in place, the missing `Secure` flag was far less exploitable, which materially narrows SEC-03's blast radius. One header check. |
| **SEC-04b** | Rotate `JWT_SECRET` on Render | Hunter | **Set `UNSUB_SECRET` to the *current* `JWT_SECRET` value first** — not a new random one. Every unsubscribe link already in an inbox is signed with the old value, and breaking them is a compliance problem, not just a UX one. Then rotate `JWT_SECRET`. ~5 agents get logged out; already called cheap. |
| **SEC-01** | Repo public/private check | Hunter | Decides history purge vs. the `--cached` removal already done. The CSV remains in git history either way. |
| **SEC-03** | Render access-log pull, Aug 14–21 | Hunter | Retention is expiring. Dev does the scanner-vs-real-client split once delivered. |
| — | Roadmap file to `docs/` | Hunter | Four failed attachment attempts. Copy the file into the repo and push, or paste the text. |

**Sequencing call: do not batch CORS with the current pass.** The 48h logging window has to start before enforcement anyway, and holding index-safe work behind an infra decision burns sprint days for nothing. Dev proceeds to the baseline-snapshot script and the pixel/consent rip-out now; ships the origin-logging middleware alongside so the clock starts today.

### 2026-08-21 (evening) · Incident closed acutely; four open items

**SEO-03 is live on prod** (`7e6f82a`), crawl-verified: backend source, all three operator scripts, the CSV and `package.json` return 404; every asset still 200. The static-exposure test is now a standing CI gate — even a newly-committed root file cannot serve unless explicitly allowlisted.

**SEC-02 root cause — the premise was wrong, and the truth is better.** Nothing mysteriously reached prod disk. All five files were **committed to git** in `0d5dc59` ("brokerage combobox", Aug 14) and are in `origin/main`, with no `.gitignore` rule. The repo root is the web root, so committing an operator script publishes it. No hidden injection pathway exists. Exposure window: **Aug 14 14:18 PT → Aug 21**, ~7 days.

Prod repo-root inventory (git-tracked, i.e. what deploys): `.env.example` · `COPY-OVERHAUL-DEV-SPEC.md` · `Procfile` · `SEO-ACTION-PLAN.md` · `favicon.svg` · `image-library.html` · `index.html` · `lake-agent-prospects.csv` · `manifest.json` · `package.json` · `package-lock.json` · `property-page-standalone.html` · `pull-numbers.js` · `reset-admin.js` · `robots.txt` · `seo-audit.js` · `sitemap.xml` · `sw.js`

**SEC-04 — no secrets in source.** All credentials come from `process.env`; the `.env`-was-safe conclusion holds. Two cleanups: `src/services/email.js:45` has `UNSUB_SECRET = process.env.JWT_SECRET || 'mnlakehomes-unsub'` — the literal is now public and reusing `JWT_SECRET` for unsub HMAC is a smell (give it its own env var, drop the literal); `server.js:4841` logs a demo-agent password to console behind the `SEED_DEMO_FREE_AGENT` flag (remove the log). Auth doesn't depend on secrecy, so the published route map doesn't break the model — but **rotate `JWT_SECRET` anyway**. With ~5 agents the forced re-login costs nothing and the signing approach is now public.

**SEC-05 (new) — `environment: "staging"` on the production domain.** The health endpoint reports staging on prod. `NODE_ENV` drives error verbosity, cookie `secure` flags, CORS and logging. Confirm what Render's service is actually set to and what each of those resolves to in prod. Treat as its own ticket.

**Open, in priority order:**

| # | Item | Owner | Note |
|---|---|---|---|
| **SEC-03** | Pull Render access logs for GETs on `/src/server.js`, `/reset-admin.js`, `/pull-numbers.js`, `/seo-audit.js`, `/lake-agent-prospects.csv`, `/package.json`, `/src/*` across Aug 14–21. Split known scanners from real clients. | **Hunter** | **Render retention is ~7 days — the front of the window is expiring now.** This is the only item with a deadline. |
| **SEC-01** | Is the repo public or private, now or ever? That decides remediation: public → git-history purge (filter-repo/BFG + coordinated force-push). Private, single dev → `git rm` + `.gitignore` is sufficient, purge optional hygiene. | **Hunter** | CSV headers: `Lake, Region, Tier, Prospect, Type, Contact, Source, Notes, Status`, 90 rows. **Default assumption: `Contact` holds personal cell numbers** — that is the norm for agent prospecting. Treat as personal data unless every value is a published office line. |
| **SEC-02b** | Execute the cleanup: `git rm` the operator scripts, CSV and stray HTML; add `.gitignore` rules; move operator tooling out of the web root. | Dev | **Green-lit — do not hold for SEC-01.** The `git rm` is identical either way; only the history purge depends on the decision. |
| **SEC-04b** | Dedicated `UNSUB_SECRET` env, drop the literal, remove the demo-password log, rotate `JWT_SECRET`. | Dev | |

### 2026-08-21 · Wave 0 decisions settled

- **Search Console:** treat as unverified. Wiring is ready — `{{GSC_META}}` substitution at `server.js:1946`, driven by `GSC_VERIFICATION`, currently unset in prod. Verification via the env-var meta-tag path, dev-owned end to end; no DNS record. **Blocked on Hunter creating the property.** Bing the same way.
- **No historical baseline exists.** GSC does not backfill. Day-one baseline = sitemap URL count + a per-page-type indexable crawl snapshot, re-runnable at 30/60/90. The 72h Coverage populate is **not** on the critical path — seal W0 and start W1 without it.
- **Analytics: delete the dead pixel code.** No GA4, Meta or Ads IDs are coming. GSC + the first-party cookieless stack + HubSpot covers Phase 1. Remove `CONSENT_BANNER_ENABLED` rather than leaving it as a false promise.
- **Baseline export:** Hunter adds the dev as a GSC user; dev pulls from the UI. No service-account credential.
- **W0 target: code-complete 2026-08-22, sealed 2026-08-25**, contingent on the GSC property.
- **Doc hygiene:** the repo's `SEO-ACTION-PLAN.md` is a superseded predecessor (39 lakes / 54 towns, `[YOU]`/`[DEV]` tags, no SEO-## IDs). Retire it — this doc is the single SEO plan of record.

---

## 1. What "A+" actually means

A+ is not "all 31 audit items are closed." Items get closed and then quietly re-break — that is exactly how we got a B+ from an A-grade foundation. A+ is a **state the codebase can be held to**, defined by five sentences:

1. **Every indexable page carries unique, server-rendered body copy** — visible in raw HTML with JavaScript off.
2. **Every indexable page is reachable from at least one server-rendered internal link**, within three hops of the homepage.
3. **Index gates, robots gates and link-surface gates all derive from one shared predicate per entity type**, with a test that fails the build when they disagree.
4. **Nothing thin or near-duplicate is indexable** — the gate holds the page back until it earns unique copy, rather than shipping a templated page and hoping.
5. **All of it is measurable** — Search Console verified, a baseline captured before we changed anything, and organic entrances traceable through to lead-form conversions by lake.

Sentences 1–4 are enforced by an automated test suite (§5). That suite is the real deliverable of this program. Everything else is a one-time fix; the suite is what keeps the grade.

### Grade targets

| Layer | Now | Target | What closes the gap |
|---|---|---|---|
| Sitemap & robots | A− | A | Lake gate extracted to a shared service; priority/changefreq emitted or deleted |
| Indexability logic | B | A | One predicate per entity, parity test across all four town surfaces |
| Structured data | A− | A | Curated-only FAQPage; `/towns` CollectionPage; duplicate Place node removed |
| Titles & meta | B+ | A | Home description ≤160; unique meta reaches only indexable pages |
| SSR for crawlers | C+ | A | Lake description, town About, blog hub, agent/blog links all move into the token pipeline |
| Lake pages | B | A | Money-keyword H1, SSR description, template-only lakes gated, buy-side intent headings |
| Town pages | B− | A | Orphan drift fixed, heroes shipped, curated lifestyle/seasons copy, county in schema |
| Content & internal linking | C+ | A | 220 posts published into a fixed link graph, auto-linked to lake/town pages |
| Measurement | D+ | A | GSC verified, baseline captured, analytics decision made, organic → lead attribution live |
| Performance & crawl | B | A | Static root scoped to an allowlist, CSS fingerprinted and immutable |

---

## 2. Two places where I'm changing the audit's order — and why

The audit's own "do first" list is right about *what*. It's slightly wrong about *when*, in two places. These are the only two judgment calls in this document, so they're worth stating plainly.

### Correction 1 — Search Console is not #7. It is #1, on day one, before anything ships.

The audit ranks GSC verification seventh. But the moment we start changing 200+ pages, the "before" picture is gone forever. We will be six weeks in, unable to answer "did this work?", and reduced to arguing from intuition. **Verify GSC and export a baseline before a single ticket in Wave 1 lands.** It costs an hour. Skipping it costs us the ability to evaluate the whole program.

Second reason: the agent portal's differentiator — the Lake Intel panel showing agents the actual queries bringing buyers to their lake — is blocked on Search Console data existing. Every day GSC isn't verified is a day that history isn't accumulating.

### Correction 2 — publish the blog *into a fixed graph*, not before one.

The audit calls the 213 unpublished drafts the biggest lever, and it is. But publishing them first is the wrong move:

- Across all 220 posts there are only **52 lake links and 22 town links**. If we publish as-is, we flood the index with 213 pages that barely link the money pages — and then have to rewrite and re-crawl all of them once auto-linking ships.
- Those posts will point at lake and town pages that are currently orphaned, near-duplicate, and half-invisible. First crawl is when Google forms its quality read. We only get one.

So the order is: **build the auto-link layer and fix the destination pages first, then publish.** Concretely, the blog rollout starts at the end of Wave 2 as a 30-post canary and runs through Wave 4 as a drip. Nothing about the asset gets less valuable by waiting nine days; it gets considerably more valuable.

---

## 3. The five waves

Full-time, roughly three weeks. Each wave has a hard exit gate — do not start the next wave until the current one's gate passes. Ticket numbers are stable; use them in commits and PRs.

### WAVE 0 · Baseline & seal — Days 1–2
*Nothing can be trusted or measured until this lands. Smallest wave, non-negotiable first.*

| # | Ticket | Where |
|---|---|---|
| **SEO-01** | Confirm Search Console verification is actually live — `{{GSC_META}}` token present in `index.html` **and** the env var set. Submit the sitemap. **Export a full baseline: indexed page count, impressions, clicks, top queries, top pages.** Add Bing Webmaster Tools (currently no verification exists). | `index.html` · env |
| **SEO-02** | Make the analytics decision, one way or the other. Either set the GA4 / HubSpot / Meta / Ads env IDs and enable a consent path (`CONSENT_BANNER_ENABLED` is hard-disabled), or delete the dead pixel code. No third state — half-wired pixels are a maintenance tax that measures nothing. | consent gate · env |
| **SEO-03** | Scope `express.static` off the repo root onto an allowlist (`assets/`, `styles/`, `components/`, `pages/public/`). Audit what is currently reachable — `property-page-standalone.html`, `image-library.html`, `seo-audit.js`, `reset-admin.js`, `pull-numbers.js` are all servable today. Separately, confirm no public `/pages/user/` dashboard is reachable; add a disallow/noindex if it is. | `server.js:2614` |
| **SEO-04** | Content-gate and `noindex, follow` thin/free agent profiles — mirror exactly what lakes and towns already do. Add a content predicate to the sitemap agent query and emit robots from the route below a content floor. | `server.js:654-655`, `:2383` |
| **SEO-05** | Fingerprint `style.css` (`?v=<hash>`) and set `max-age=31536000, immutable`. Kills the 5-minute revalidate and the recurring "I don't see the CSS change" problem. Verify the interaction with the existing service worker. | asset refs |

**Exit gate:** GSC verified and baseline exported to a file · nothing outside the allowlist is servable · a free empty agent profile returns `noindex` and is absent from the sitemap.

---

### WAVE 1 · Un-hide — Days 3–7
*Theme: everything we already wrote becomes something a crawler can read. No new copy in this wave.*

| # | Ticket | Where |
|---|---|---|
| **SEO-06** | Extract `lake-visibility.js` (`lakeIndexableSql` + `lakeRobots`) and route both the sitemap query and the route's robots meta through it. Add a parity test mirroring the town one. Ends the hand-copied predicate that is one edit away from desyncing sitemap from meta. | `server.js:637-639` vs `:858-861` |
| **SEO-07** | **Fix the town orphan drift.** Route every town surface through one shared helper in `town-visibility.js` using the *content* predicate. Move the `/towns` nav query and the lake page's "nearby towns" query off `hero_image_url` and onto content. Extend the test to assert sitemap-gate == nav-gate == robots-gate. This alone un-orphans Brainerd, Alexandria and Bemidji. | `town-visibility.js` · `server.js:1793`, `:870` |
| **SEO-08** | SSR the lake description. Add a `{{LAKE_DESCRIPTION_BODY}}` token, render `lake.description` server-side into the three `#ld-description-*` sections, delete the client injection. Remove the duplicate static `Place` JSON-LD node while you're in the template. | `server.js:1162` · `lake-detail.html` |
| **SEO-09** | SSR the town "About" prose, and add `lifestyle_text`, `seasons_text` and `county` to the town route SELECT. Today the SELECT omits them, so curated copy can never render and the `Place` schema's county is always blank — it's dead code for curation. | `server.js:1975` |
| **SEO-10** | Change the lake H1 to **`[Lake Name] Homes for Sale`**; demote "Explore" to an eyebrow. Right now the only heading with the money keyword is the listings `<h2>`, which is `display:none` until JS and hidden entirely while `LISTINGS_PUBLIC=false` — so in production, no visible server-rendered heading says "homes for sale." Guarantee one SSR heading carries the head term regardless of the flag. | `lake-detail.html:311` |
| **SEO-11** | SSR the `/blog` hub — inject post links server-side into `blog.html` (mirror the hidden-directory pattern already used for `/agents`) and add pagination. A single unpaginated JS fetch of 220 posts is both a UX and a crawl problem. | new `/blog` route · `blog.html` |
| **SEO-12** | Wire the SSR link mesh: add agent + blog anchors to `seoDirectory`; drop the `hero_image_url <> ''` filter on the region-lake mesh so indexable-but-heroless lakes aren't orphaned; render "Lakes in [town]" as real anchors; add an SSR town→town nearby nav; convert agent service-area pills from `<span>` to real links; replace legacy `/blog-post?slug=` links with clean URLs. | `server.js:1197` · `agent-profile.html:263` |

**Exit gate:** fetch one page of every type with JavaScript disabled — full body copy and every internal link present in raw HTML · zero URLs in `sitemap.xml` unreachable from server-rendered links (test T2 below goes green).

---

### WAVE 2 · De-duplicate & gate — Days 8–12
*Theme: nothing thin or near-identical is indexable. Expect the indexed page count to fall here. That is the point.*

| # | Ticket | Where |
|---|---|---|
| **SEO-13** | Restrict `FAQPage` JSON-LD to lakes with a curated FAQ. Template-FAQ lakes still render the accordion for users — they just don't emit schema. Identical FAQ structured data across dozens of pages is the single riskiest thing on the site right now. | `server.js:985` |
| **SEO-14** | Tighten the lake index gate so template-only lakes stay `noindex, follow` until they have unique copy. They keep passing link equity; they stop diluting quality. | `server.js:637-639` |
| **SEO-15** | `lake-content-templates.js` generates lifestyle/seasons copy from **four** region flavors with the name swapped in — same-flavor lakes render near-identical multi-paragraph blocks. Either expand well beyond four flavors, or leave those lakes gated by SEO-14 until real copy exists. Do not ship four flavors across sixty pages. | `lake-content-templates.js` |
| **SEO-16** | Same problem on towns, and worse: every resort town (Nisswa, Walker, Crosslake, Breezy Point, Pequot Lakes) renders byte-identical lifestyle + seasons blocks. With SEO-09 landed, write unique copy for the top towns and expand the template for the tail. | `town-content.js` |
| **SEO-17** | 14 slugs live in both `town-content.js` and `town-descriptions.js`; the latter runs second and silently overrides the file documented as canonical. Dedupe to one source and put a comment at the top of each file saying which one wins. | seeders |
| **SEO-18** | Cleanup batch: home meta description ~200 chars → ≤160 · move `faq.html`'s client-injected `FAQPage` JSON-LD to SSR · emit the sitemap's computed `priority`/`changefreq` or delete the dead code. | assorted |

**Exit gate:** the near-duplicate test (T4) passes at <80% similarity between any two indexable pages · `FAQPage` schema appears only on curated pages · index count drop is understood and expected, not investigated as a bug.

---

### WAVE 3 · Publish & connect — Days 10–18 *(overlaps Wave 2)*
*Theme: activate the dormant asset — into the graph we just fixed.*

| # | Ticket | Where |
|---|---|---|
| **SEO-19** | Fix or null the **10 blog drafts referencing cover images that don't exist** in `assets/images/blog/`. Publishing them as-is ships 404ing `og:image` tags. Add a CI check so it can't recur. | `blog-*.js` |
| **SEO-20** | **Auto-link the first mention of each known lake and town name in blog SSR** to its page. Ships *before* any drafts publish, so the 213 go live already linking the money pages. | blog SSR |
| **SEO-21** | Render a "vetted agents on this lake" block with real `/agents/:slug` anchors. **This is the same work as C7 in the Sprint-2 hand-off — do it once.** No-agent state renders the matching CTA as primary content, never an empty roster. | lake SSR · `server.js` |
| **SEO-22** | **Publish the 213 drafts on a drip: ~15/day.** Batch 1 = 30 posts, then pause 72 hours and check crawl/index rate in GSC before continuing. Prioritize posts whose target lake or town page is already curated and indexable — they arrive with a working destination. | admin Blog list |
| **SEO-23** | Hero images for the ~14 heroless launch towns via a `town-heroes.js` seeder, mirroring the `town-content.js` pattern. **Brainerd and Alexandria first** — biggest lake markets in the state, currently rendering a gradient placeholder. | new seeder |
| **SEO-24** | `CollectionPage` + `ItemList` JSON-LD on `/towns` (priority 0.9 hub, currently zero structured data), mirroring the agents hub. Region-cluster the `/towns` SSR nav instead of a flat alphabetical list. | `towns-index.html` |
| **SEO-25** | Default OG image + twitter card on the six indexable tool pages — `commonrealtor`, `compare-lakes`, `find-your-lake`, `lake-mortgage-calculator`, `market-index`, `pricing`. They're in the sitemap and share as blank cards today. | tool pages |

**Exit gate:** 220 posts indexable and in the sitemap · every published post links at least one lake or town page · zero `og:image` 404s across the site.

---

### WAVE 4 · Compound — Days 18–21 and ongoing
*Theme: the work that makes the A+ durable and hard for a competitor to copy. This wave never fully "finishes" — it becomes the standing content backlog.*

| # | Ticket |
|---|---|
| **SEO-26** | **Lean on the DNR data moat.** Expand stats coverage to more lakes, then derive superlatives Zillow structurally cannot produce — clearest water, deepest, best walleye, most public accesses. Each superlative is a long-tail target *and* an internal-link hub. |
| **SEO-27** | Add buy-side intent to lake pages: headings and FAQ entries for "how much do [Lake] homes cost," "[Lake] cabins for sale," "lakefront lots on [Lake]." High commercial intent, zero current coverage. |
| **SEO-28** | Promote bay and neighborhood names out of the Tier-1 descriptions into SSR headings and anchors. Opens a whole tier of hyper-local queries we already have the copy for. |
| **SEO-29** | Quick-facts strip on every town, not just Detroit Lakes (lake count, region, nearby lakes with acreage — snippet bait). Static map thumbnail from the lat/lng already loaded. Visible breadcrumbs on lake/town/agent/business templates; fix the lake breadcrumb "Lakes" → `/towns` label mismatch. |
| **SEO-30** | Durability batch: templatize or schedule a re-date for the 29 blog titles hardcoding "2026" · add a `/businesses` hub with parent back-links (business detail pages are hierarchy dead-ends today) · add the tracking script to the six auth pages that omit it · extend the admin SEO audit tool to cover agents, businesses and blog. |
| **SEO-32** | **The standing content backlog** — three gaps the audit named that aren't tickets, they're a cadence. (a) Every published lake and town without a matching guide post is a missed internal-link target; pair one as each is published. (b) A recurring per-region market/price-trend post, which owns "MN lake market" queries *and* gives the `/market-index` tool page a content engine. (c) Link the mortgage calculator and comparison tools from the financing and comparison posts that should be funnelling into them. |
| **SEO-31** | **The listings compromise.** `LISTINGS_PUBLIC` stays **off** — that's a business decision, not an SEO one. But hiding it removes our freshest, most-unique content. Build a server-rendered "market snapshot" for lake pages instead: median price, active count, 90-day trend. Restores the ranking and buy-intent signal without exposing the listing UI. |

---

## 4. Dependencies with the existing sprints — read before scheduling

| This program | Collides with | Resolution |
|---|---|---|
| SEO-01 / SEO-02 (GSC + analytics) | Sprint-1 DEV-02 / DEV-04 (GA4 + UTM capture, schema/CWV verification) | Same work. Do it once, in Wave 0, and mark the Sprint-1 tickets closed by it. |
| SEO-21 (agents-on-this-lake anchors) | Sprint-2 **C7** (empty agent/vendor blocks on lake pages) | Same ticket. C7's empty-state rules govern; SEO-21 adds the SSR-anchor requirement. |
| SEO-01 | Sprint-2 **C4** (Lake Intel panel — the agent-portal differentiator) | C4 is blocked until Search Console data exists and has accumulated history. Another reason Wave 0 goes first. |
| SEO-31 | Sprint-2 "explicitly not this sprint: `LISTINGS_PUBLIC` stays off" | No conflict. The flag stays off. SEO-31 is the SEO-safe substitute. |

---

## 5. The A+ test suite — the actual deliverable

Six tests, in CI, failing the build. This is what converts a one-time cleanup into a grade we hold. **A wave is not done until its test is green and wired.**

| Test | Asserts | Wave |
|---|---|---|
| **T1 · Gate parity** | For lakes *and* towns: sitemap gate == robots gate == every SSR link-surface gate. Extends the existing town test, which today only checks the MN/lake predicate and stays green while the hero-vs-content drift persists. | 1 |
| **T2 · No orphans** | Every URL in `sitemap.xml` is reachable via a server-rendered `<a href>` within 3 hops of `/`. This is the test that would have caught Brainerd. | 1 |
| **T3 · No-JS content floor** | For a sample of each page type: raw HTML contains an `<h1>`, that `<h1>` carries the head term where applicable, and the body has ≥300 words of real copy — with JavaScript off. | 1 |
| **T4 · Near-duplicate ceiling** | Shingle-hash the SSR body text of every indexable page; fail if any pair exceeds 80% similarity. This is the one that keeps templated copy honest forever. | 2 |
| **T5 · Schema integrity** | Every JSON-LD block validates · `FAQPage` only on curated pages · `AggregateRating` never emitted with 0 reviews · no duplicate `Place` nodes. | 2 |
| **T6 · Asset integrity** | No `og:image`, hero image or canonical resolves to a 404. | 3 |

---

## 6. Risks, and what I want us to not panic about

1. **The indexed page count will drop before it rises.** Wave 2 deliberately pulls thin lakes, thin towns and empty agent profiles out of the index. Expect a dip in "pages indexed" in GSC. Judge the program on impressions and entrances to lake/town pages, not raw indexed count.
2. **Scoping `express.static` can break asset paths.** SEO-03 is a one-line change with a wide blast radius. Run a full asset/link crawl immediately after it lands, on a preview deploy, not prod.
3. **Publishing 213 posts at once is a crawl-budget and quality-signal risk.** Hence the drip and the 72-hour canary. If the canary indexes slowly, slow the drip — don't push through it.
4. **The H1 change will cause a week or two of ranking flux** on lake pages. Normal. Don't revert it on day four.
5. **Copy volume is the schedule risk, not code.** SEO-15 and SEO-16 are the only tickets whose size is genuinely unknown. If unique copy slips, ship the *gate* (SEO-14) and leave those pages `noindex` — a gated page costs us nothing; a duplicate indexed page costs us everything the rest of this program is buying.
6. **CSS fingerprinting interacts with the existing service worker.** Verify hard-refresh behavior before calling SEO-05 done.

---

## 7. How we'll know it worked

**Day 0 (must exist before Wave 1 ships):** GSC baseline exported — indexed pages, impressions, clicks, top 50 queries, top 50 pages.

| Horizon | What we look for |
|---|---|
| **30 days** | Zero orphaned indexable URLs (T2 green) · 220 blog posts indexed · first impressions appearing on "[lake] homes for sale" query patterns · every Tier-1 and Tier-2 lake page showing SSR body copy in the GSC-rendered view |
| **60 days** | Clicks growing on lake and town pages specifically, not just the homepage · Brainerd, Alexandria and Bemidji ranking for their own town + real-estate terms · organic entrances → lead-form conversion rate established as a number we can quote |
| **90 days** | Leads attributable to organic **by lake**. This is the number that sells agent subscriptions: *"your lake got 1,400 views and 6 leads last month."* It is also what feeds the C4 Lake Intel panel. |

The trunk metric is unchanged: organic entrances → captured leads → paying agents. Rankings are a leading indicator, not the goal.

---

## 8. Explicitly not in this program

`LISTINGS_PUBLIC` going live (SEO-31 is the substitute) · founder seats · paid ads (Phase 2) · any new page type · Common Realtor multi-tenant fork · rebuilding anything the audit graded A− or above.

---

## Appendix — the note sent to the dev, 2026-08-21

*(Kept here so the brief and the spec never drift apart.)*

> Audit received — it's the most useful document anyone's written about this site, and I'm treating it as the plan of record. Full ticketed roadmap attached; here's the shape of it and the two places I've changed your order.
>
> **The goal I'm holding us to.** Not "close all 31 findings" — findings close and quietly re-break, which is how an A-grade foundation ended up a B+. A+ means five things are permanently true: every indexable page has unique server-rendered copy; every indexable page is reachable from a server-rendered link within 3 hops; index/robots/link gates all come from one shared predicate per entity type; nothing thin or duplicate is indexable; and we can measure all of it. The real deliverable of this program is the six-test CI suite in §5 that enforces those. Please treat those tests as tickets, not as nice-to-haves.
>
> **Change 1 — Search Console moves from #7 to #1, day one, before anything else ships.** The moment we start editing 200 pages the "before" picture is gone and we can't evaluate any of this. Verify it, submit the sitemap, and export a baseline — indexed count, impressions, clicks, top 50 queries and pages — to a file. Add Bing while you're there. It also unblocks the Lake Intel panel in the portal backlog, which can't exist without query history accumulating.
>
> **Change 2 — the blog publishes into a fixed graph, not before one.** You're right that it's the biggest lever. But across 220 posts there are only 52 lake links and 22 town links, and they'd be pointing at pages that are still orphaned and near-duplicate. First crawl is when Google forms its quality read and we get one. So: auto-linking (SEO-20) and the destination fixes ship first, then 30 posts as a canary, then ~15/day. Nine days of waiting makes the asset worth more, not less.
>
> **Five waves, hard exit gates, don't start the next until the current one's gate passes.**
> **W0 Baseline & seal (d1–2):** GSC + baseline · analytics decision · `express.static` allowlist · noindex thin agent profiles · CSS fingerprint.
> **W1 Un-hide (d3–7):** the town orphan fix · `lake-visibility.js` extraction · SSR the lake description and town About · lake H1 → "[Lake] Homes for Sale" · SSR blog hub · SSR the agent/blog/town link mesh. No new copy in this wave — it's all content that already exists.
> **W2 De-duplicate & gate (d8–12):** curated-only FAQPage schema · gate template-only lakes · kill the 4-flavor duplicate bodies on lakes and towns · dedupe the 14 double-sourced slugs.
> **W3 Publish & connect (d10–18):** fix the 10 missing covers · auto-link blog→lake/town · agents-on-this-lake anchors · drip the 213 drafts · Brainerd + Alexandria hero images · `/towns` schema · OG images on the six tool pages.
> **W4 Compound (d18+):** DNR superlatives · buy-side intent headings · bay/neighborhood headings · quick facts + maps + breadcrumbs · the SSR market snapshot.
>
> **Three things to know before you schedule it.** SEO-01/02 are the same work as Sprint-1 DEV-02/DEV-04 — do it once and close both. SEO-21 is the same ticket as C7 in the Sprint-2 hand-off — do it once. `LISTINGS_PUBLIC` stays off; SEO-31 (a server-rendered market snapshot) is the compromise, so don't read the audit's "reconsider listings" as approval to flip it.
>
> **And one thing not to panic about:** indexed page count will drop in Wave 2. That's the gates doing their job. Judge it on impressions and entrances to lake and town pages.
>
> **What I need back:** an ETA per wave (or at minimum a Wave 0 date), a flag on anything bigger than it looks — I expect that to be SEO-15/16, the copy-volume tickets — the verification artifact named in each exit gate, and if you find something broken that isn't on this list, note it and tell me, don't fix it.
