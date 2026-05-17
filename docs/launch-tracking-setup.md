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

## HubSpot field mapping (current state + optional upgrade)

### What gets pushed to HubSpot today (standard properties only)

The backend syncs only HubSpot's built-in contact fields — this is by
design so the integration works without requiring any HubSpot setup
beyond creating the portal:

| HubSpot property | Filled from |
|---|---|
| `email`          | always |
| `firstname` / `lastname` | parsed from the name field |
| `phone`          | when provided |
| `address` / `city` / `state` / `zip` | seller leads (from property address); admin-created users via profile edit |
| `company`        | agent signups (brokerage name); business signups (business name) |
| `lifecyclestage` | per source: `subscriber` (newsletter), `lead` (everything else), `salesqualifiedlead` (cash offer) |

### Buyer/seller-specific fields that currently land in `notes`

The buyer form collects **budget range** + **timeline**; the seller form
collects **timeline**. These don't have standard HubSpot equivalents,
so they're currently captured in the lead's `notes` blob and visible on
the admin Lead Detail page, but they don't reach HubSpot as queryable
fields.

### Optional upgrade — create custom HubSpot properties

If Marketing wants to segment HubSpot workflows by budget/timeline
(e.g. "send the $1M+ buyers a different drip"), create these custom
properties in HubSpot first, then a one-line code change re-enables
them on the sync.

1. In HubSpot → **Settings → Properties → Create property** (object
   type: Contact). Suggested set:

   | Property name | Field type | Used by |
   |---|---|---|
   | `mnlh_budget_range` | Dropdown (Under $500K / $500K – $750K / …) | Buyer form |
   | `mnlh_timeline`     | Dropdown (ASAP / 1–3 months / 3–6 months / Exploring) | Buyer + seller forms |
   | `mnlh_lead_type`    | Dropdown (buyer / seller / agent_inquiry / …) | All form fills |
   | `mnlh_signup_source`| Single-line text | All sources |

2. In `src/services/hubspot.js`, extend the `ALLOWED_PROPS` set to
   include those four new property names.

3. In `src/controllers/lead.controller.js`, add the values to the
   `hubspot.syncContact({...})` call:
   ```js
   mnlh_lead_type:    enumType,
   mnlh_signup_source: source || enumType,
   // Parse budget/timeline out of the lead-modal payload — they're
   // currently dumped into `notes`. Forward as separate top-level
   // fields from components.js for cleanest mapping.
   ```

This stays optional because HubSpot rejects POSTs that reference
custom properties the portal doesn't have, so we don't ship the
field mapping until the user has created the properties.

---

## End-to-end form flow (buyer + seller)

For the two highest-intent public forms:

```
Visitor clicks CTA → lead-modal multi-step form
                          │
                          ▼
              POST /api/leads
                          │
                          ▼
              lead.controller.createLead:
                ├── INSERT into leads (full_name, email, phone, lead_type,
                │   lead_source, property_*, message, user_id)
                ├── Auto-link to user account by email if one exists
                ├── ↓ window.trackConversion('generate_lead', {form_name:…})
                │   fires from frontend right after the 201 response →
                │     ↳ GA4 (gtag): event 'generate_lead'
                │     ↳ HubSpot pixel: trackCustomBehavioralEvent
                │     ↳ /api/analytics/conversion: server-side mirror row
                ├── ↓ getLeadMagnetForType(enumType)
                │     ↳ Looks up LEAD_MAGNET_{BUYER|SELLER}_SLUG env var
                │     ↳ Joins to resources table → {title, url}
                ├── ↓ sendLeadConfirmation({email, lead_type, magnet})
                │     ↳ Branches body copy by lead_type
                │     ↳ Primary CTA = magnet download button
                ├── ↓ sendAdminLeadNotification (REPLY_TO inbox)
                ├── ↓ hubspot.syncContact({email, firstname, lastname,
                │     phone, address, city, state, zip,
                │     lifecyclestage:'lead', signup_source})
                │     ↳ Returns hs_contact_id → saved on leads row
                └── ↓ IF property_address provided:
                      geocodeAddress() → matchTagsAndUsers() → routeLead()
                      ├── Found agent → UPDATE leads SET agent_id,
                      │   assigned_user_id, status='contacted'
                      │   → sendMatchedAgentNotification(agent's email)
                      └── No agent → sendAdminLeadNotification with
                          subject "UNROUTED — needs manual assignment"
```

---

## Smoke testing the buyer/seller flow against prod

When you want to verify end-to-end after a deploy that touches forms:

```bash
BASE_URL=https://minnesotalakehomesforsale.com \
SMOKE_EMAIL=you+smoketest@yourdomain.com \
node scripts/smoke-test-forms.js
```

The script POSTs a buyer lead + seller lead + newsletter subscription
with the stamped name "Smoke Buyer <ISO>" / "Smoke Seller <ISO>" so
you can find and delete them later. It prints a verification checklist
with deep-links to admin, GA4 Realtime, and the HubSpot contact lookup.

Output also includes a one-line SQL hint to clean up the smoke rows
when you're done verifying.

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
