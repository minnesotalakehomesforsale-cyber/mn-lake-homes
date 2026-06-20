# SEO Action Plan — MinnesotaLakeHomesForSale.com

Goal: rank #1 organically for Minnesota lake-home terms. On-page/technical SEO is
now in strong shape. What remains is mostly **off-page + measurement**, which
needs account access I don't have. Items are tagged **[YOU]** (needs your action)
or **[DEV]** (code — done or doable by me).

---

## ✅ Done (on-page / technical)
- Per-page titles, meta descriptions, canonicals, OG/Twitter.
- Structured data: Place + Geo (lakes/towns), Article (blog), RealEstateAgent
  (agents + homepage, now with logo/contactPoint/knowsAbout), LocalBusiness
  (businesses), FAQPage (/faq), BreadcrumbList sitewide, WebSite + SearchAction.
- Server-rendered blog bodies, clean `/agents/:slug` profiles, `/search`.
- Dynamic sitemap.xml + robots.txt; proper 404 status; clean 301s.
- **Unique body content on all 39 lake pages and all 54 town pages** (no more
  templated/duplicate copy — the biggest on-page gap).
- Images compressed 158 MB → 61 MB (Core Web Vitals).
- 20–25 word hero subtitles across lakes/towns; SSR hub link directories.

---

## 🔴 Priority 1 — Get it indexed (this week)
1. **[YOU] Deploy the latest batch.** All the above is on `main` but only goes
   live on deploy. Trigger it.
2. **[YOU] Google Search Console.** Create a property for the domain, grab the
   verification token, and send it to me — the site already injects it via the
   `GSC_VERIFICATION` env var, so it's a one-paste setup. Then **submit
   `/sitemap.xml`** and request indexing on the homepage + top lake pages.
3. **[YOU] Bing Webmaster Tools.** Same idea (free, fast). Import from GSC.
4. **[DEV, optional] IndexNow** — I can add an IndexNow key + ping so new/changed
   lake/town/blog URLs notify Bing instantly. Say the word.

## 🔴 Priority 2 — Local SEO (highest ROI for a geo business)
5. **[YOU] Google Business Profile.** This is the single biggest local-ranking
   lever and it's free. Create/claim it, category "Real Estate Agency," add
   photos, service areas, hours, the same NAP (name/phone) used on the site.
6. **[YOU] NAP consistency + citations.** List the business with identical
   name/phone on: Bing Places, Apple Maps, Yelp, Zillow/Realtor agent profiles,
   local chambers (Brainerd, Alexandria, Detroit Lakes, Bemidji, Wayzata, etc.).
7. **[YOU] Reviews.** Ask matched buyers/sellers and partner agents for Google
   reviews — volume + recency move local rankings hard.

## 🔴 Priority 3 — Backlinks (the off-page lever; can't be coded)
The new domain won't outrank Zillow/Realtor.com without earned links. Tactics,
roughly easiest→hardest:
8. **Partner/agent links** — every agent in your network links to their
   `/agents/:slug` profile from their own site/bio. Easiest wins, on-topic.
9. **Local directories & chambers** — chamber member listings, lake-association
   sites, regional tourism/"visit" sites (Visit Brainerd, Explore Minnesota
   partners). On-topic, geo-relevant.
10. **Linkable assets** — the buyer guides we published (septic/shoreline/dock
    rules, "questions to ask an agent") are exactly what local realtors, lake
    associations, and news sites link to. Pitch them.
11. **Digital PR** — local angle: "where lakefront is most/least affordable in
    MN," market data, seasonal trend pieces → pitch to MN news/business outlets.
    I can draft the data posts; you/an PR contact do the outreach.
12. **HARO / journalist requests** — answer real-estate/lake-life queries for a
    cited link.

## 🟠 Priority 4 — Keep publishing (compounds over time)
13. **[DEV+YOU] Content cadence.** Keep adding lake/town-specific and buyer-guide
    posts targeting long-tail terms ("homes for sale on <lake>", "<lake> real
    estate", "buying a cabin near <town>"). I can write these in batches; you
    deploy. 2–4/month sustained beats a one-time dump.
14. **[DEV] Internal linking** — add "nearby towns" links on lake pages (towns
    already link to lakes). I can do this next.

## 📊 Measurement
- **GA4** is wired (pageviews + lead events). 
- **GSC** (once verified) is the source of truth for queries, impressions,
  positions, and coverage. Check weekly: which queries are climbing, which pages
  get impressions but low CTR (improve titles), and any coverage errors.

## 🛠️ Optional technical follow-ups I can do
- **Cloudinary AVIF/WebP** — get hero images to ~150 KB. Currently `image/fetch`
  returns 401; **[YOU]** enable "Fetched URLs" (and unrestrict the origin) in the
  Cloudinary console, then **[DEV]** I'll wire transforms.
- **IndexNow** (see #4), **lake↔town internal links** (#14), and a real
  recent-sales/listings module if you add an MLS/IDX feed.

---

### Bottom line
On-site SEO is essentially complete. Ranking #1 now depends on **deploy →
Search Console → Google Business Profile → reviews → backlinks → sustained
content**, in that order. The first four are quick and free; backlinks + content
are the slow compounding work that ultimately decides it.
