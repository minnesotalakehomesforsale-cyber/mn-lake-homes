# Launch tracking setup runbook

This is the one-time setup the launch team needs to complete to make the
tracking layer actually emit data. The code is already deployed and is
**dormant by default** — the snippets only activate when the matching
environment variables are set in Render.

> **Owner**: P&E lead. **Validates**: Marketing. **ETA**: ~1 day (most time
> is waiting on Google verification + propagation).

---

## What's already wired (no action needed)

- `GET /api/config/public` — env-driven config endpoint the frontend reads
- `components/components.js` — auto-injects GA4 (gtag.js) and HubSpot
  tracking when their IDs are set; otherwise a no-op
- `window.trackConversion(eventName, params)` — global helper, fires GA4
  events + HubSpot custom behavioral events at once. **No-op** when no
  pixel is loaded
- Conversion events on every form (see "Form → Event mapping" below)
- `<meta name="google-site-verification">` injected into `/` and
  `/index.html` server-side from `GSC_VERIFICATION` env var
- `/sitemap.xml` (dynamic, regenerated per request from DB) and
  `/robots.txt` (already points at the sitemap)
- `analytics_baselines` table + admin button to snapshot day-0 metrics

## What you have to do

### 1. Create a GA4 property

1. Go to <https://analytics.google.com/> → Admin → Create Property.
2. Property name: "Minnesota Lake Homes" · Reporting time zone: Central · USD.
3. Pick "Web" as the data stream → enter `https://minnesotalakehomesforsale.com` → stream name "Production".
4. Copy the **Measurement ID** (format `G-XXXXXXXXXX`).
5. In Render → Environment, add:
   ```
   GA4_MEASUREMENT_ID = G-XXXXXXXXXX
   ```
6. Trigger a redeploy. Open the site in an incognito window, then check
   GA4 → Reports → Realtime — you should see your own visit within ~30s.

### 2. Verify Google Search Console

1. Go to <https://search.google.com/search-console> → Add Property →
   URL prefix → `https://minnesotalakehomesforsale.com`.
2. Choose **HTML tag** verification. Copy the `content="..."` value
   from the meta tag Google shows you (e.g. `abc123def456...`).
3. In Render → Environment, add:
   ```
   GSC_VERIFICATION = abc123def456...
   ```
4. Trigger a redeploy.
5. Back in Search Console, click **Verify**. Should pass immediately.
6. Once verified, in Search Console → Sitemaps, submit:
   ```
   https://minnesotalakehomesforsale.com/sitemap.xml
   ```
   Status will move from "Couldn't fetch" → "Success" within a few minutes.

### 3. HubSpot tracking pixel

Already wired — uses the existing `HUBSPOT_PORTAL_ID` env var that the
backend HubSpot contact sync uses. If `HUBSPOT_PORTAL_ID` is set, the
script `//js.hs-scripts.com/{portalId}.js` loads automatically on every
public page. Confirm in HubSpot → Reports → Analytics Tools → Traffic
Analytics that the "Sources" report starts showing data within an hour.

If `HUBSPOT_PORTAL_ID` is not yet set:
1. Find it in HubSpot — top right corner shows "Hub ID: NNNNNNNN" or
   in Settings → Account Setup → Account Defaults.
2. Add to Render: `HUBSPOT_PORTAL_ID = NNNNNNNN`.

### 4. Take the day-0 baseline snapshot

1. Open `/pages/admin/dashboard.html` (Admin → Dashboard).
2. Scroll to **Launch baselines** card.
3. Click **Snapshot day-0 baseline**.
4. Label: `day_0_launch` (default). Optional note: e.g. `"v1.0.0,
   pre-press-release, post-final-seed-data"`.
5. Confirm. The snapshot is durable in Postgres (`analytics_baselines`
   table). Future snapshots ("day_30", "post_press") can be taken from
   the same button and will show in the list.

---

## Form → GA4 event mapping

| Form | GA4 Event | Parameters |
|------|-----------|------------|
| Lead modal (buy / sell / rent) | `generate_lead` | `form_name=lead_modal`, `lead_source`, `has_address` |
| Cash offer (step 4 submit) | `generate_lead` | `form_name=cash_offer`, `lead_source=cash_offer`, `offer_amount`, `site` |
| Agent profile inquiry | `generate_lead` | `form_name=agent_profile_inquiry`, `agent_id` |
| Careers application | `generate_lead` | `form_name=careers`, `lead_source=careers_application`, `role` |
| Contact (MN Lake Homes) | `generate_lead` | `form_name=contact_mnlh`, `lead_source=mnlakehomes_contact` |
| Contact (CommonRealtor) | `generate_lead` | `form_name=contact_commonrealtor`, `lead_source=commonrealtor_contact` |
| Resource download | `generate_lead` | `form_name=resource_download`, `lead_source=resource:<slug>`, `resource_title` |
| User signup | `sign_up` | `form_name=user_signup`, `signup_source=waitlist`, `method=email` |
| Agent join | `sign_up` | `form_name=agent_join`, `signup_source=agent_register` |
| Business signup | `sign_up` | `form_name=business_signup`, `signup_source=business_owner`, `business_type` |
| Newsletter | `sign_up` | `form_name=newsletter`, `signup_source=newsletter_commonrealtor` |

Both `generate_lead` and `sign_up` are **GA4 recommended events** — they
show up automatically in standard reports and can be marked as
conversions in GA4 → Admin → Conversions without any custom setup.

---

## Validating the install end-to-end

Once env vars are set and the deploy is live:

| Check | Where | Expected |
|-------|-------|----------|
| GA4 script loaded | DevTools → Network → search `gtag/js` | One 200 response per page load |
| HubSpot script loaded | DevTools → Network → search `hs-scripts.com` | One 200 response per page load |
| GSC verification tag | View source on `/` | `<meta name="google-site-verification" content="...">` in `<head>` |
| Pageview fires | GA4 → Realtime | Your visit appears within 30s |
| Conversion fires | Submit any form, then GA4 → Realtime → Events | `generate_lead` or `sign_up` event appears |
| HubSpot identifies the visitor | HubSpot → Contacts → Activity | Pageview shows under the contact after they submit a form |
| Sitemap reachable | `https://minnesotalakehomesforsale.com/sitemap.xml` | Returns 200, XML body lists every public URL |
| Sitemap submitted | GSC → Sitemaps | Status: "Success" |
| Day-0 baseline saved | Admin → Dashboard → Launch baselines | Lists 1 row labeled `day_0_launch` |

---

## What's NOT done by this work (out of scope, follow-ups)

- Google Tag Manager — we wired `gtag.js` directly instead. If marketing
  later wants GTM-based event management, swap the gtag block in
  `components/components.js` for a GTM container snippet.
- Facebook / TikTok / LinkedIn pixels — none requested. Easy to add by
  extending the `loadLaunchTracking()` block in `components/components.js`.
- A/B testing framework — not in scope.
- Server-side conversion API (CAPI) for HubSpot / Meta — current setup
  is browser-side only.
