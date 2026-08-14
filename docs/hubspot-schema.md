# HubSpot + Stripe schema (B1–B5 / T020, T022, T023, T025)

Single source of truth for the code: [`src/data/hubspot-schema.js`](../src/data/hubspot-schema.js).
Change options there and re-run the provisioning endpoint — this doc mirrors it
for anyone clicking in the HubSpot UI.

---

## How to provision (one click)

`POST /api/admin/hubspot/ensure-schema` (owner / super_admin only).

It idempotently creates — and on re-run patches, never duplicates — everything
in sections 1, 3, and 4 below via the HubSpot API. Requires
`HUBSPOT_ACCESS_TOKEN` + `HUBSPOT_PORTAL_ID` with the scopes
`crm.schemas.contacts.write`, `crm.schemas.deals.write`, `crm.objects.deals.write`.

Response is a report of `created` / `exists` / `options_added` / `stages_added`
per object. If a call 4xxs, the private-app token is missing a scope — add it in
HubSpot → Settings → Integrations → Private Apps.

---

## 1. Contact properties (B1) — group **Lead Qualification** (`lead_qualification`)

All four are **dropdowns (enumeration / select)** — never free-text — so
reporting stays clean (B3). `value` is the stored/reporting key (stable);
`label` is the display text.

### `target_lake`
15 Tier-1 lakes + Other + Statewide. (12 from the recruitment list + Lake Bemidji, Lake Pepin, Lake Carlos.)

| label | value |
|---|---|
| Lake Minnetonka | `lake_minnetonka` |
| Gull Lake | `gull_lake` |
| Whitefish Chain | `whitefish_chain` |
| Mille Lacs Lake | `mille_lacs_lake` |
| Lake Vermilion | `lake_vermilion` |
| Leech Lake | `leech_lake` |
| Lake of the Woods | `lake_of_the_woods` |
| Rainy Lake | `rainy_lake` |
| Detroit Lake | `detroit_lake` |
| Lake Sallie | `lake_sallie` |
| Lake Melissa | `lake_melissa` |
| Otter Tail Lake | `otter_tail_lake` |
| Lake Bemidji | `lake_bemidji` |
| Lake Pepin | `lake_pepin` |
| Lake Carlos | `lake_carlos` |
| Other | `other` |
| Statewide / Unsure | `statewide_unsure` |

### `intent_type`
Buyer `buyer` · Seller `seller` · Renter `renter` · Not sure `not_sure`

### `price_band`
Under $300k `under_300k` · $300k–$500k `300k_500k` · $500k–$750k `500k_750k` ·
$750k–$1M `750k_1m` · $1M–$1.5M `1m_1_5m` · $1.5M+ `1_5m_plus` · Unsure `unsure`

### `lead_source_detail_v2`  *(label: "Lead Source Detail")*
Organic `organic` · Lake page `lake_page` · Blog `blog` · Social `social` ·
Agent referral `agent_referral` · Direct `direct` · Other `other`
> Internal name is `lead_source_detail_v2`: the original `lead_source_detail`
> was created as a text prop and deleted, so HubSpot archived that name for 90
> days. The `_v2` name creates clean as a dropdown; the form field + validation
> still use `lead_source_detail` internally and map to this at the sync boundary.

---

## 2. Forms → properties (B2) + the retired duplicate

The public lead forms (`components/components.js`) are dropdown-driven and map
each selection to a fixed enum value, sent to `/api/leads`. The server
(`lead.controller.js`) re-validates every value (`validEnumValue`) and derives
`target_lake` from the lake page's slug, then mirrors all four onto the HubSpot
contact in `syncContact`.

| Property | Where it comes from |
|---|---|
| `target_lake` | Derived server-side from the lake page (`lake_slug` → lake name → enum). A lake not in the 15 → `other`. An explicit valid `target_lake` in the payload wins. |
| `intent_type` | Form type (`buy→buyer`, `sell→seller`, `rent→renter`, `cash_offer→seller`) or the "what do you need" dropdown. |
| `price_band` | Buyer budget dropdown (options are exactly the `price_band` bands). |
| `lead_source_detail_v2` | `lake_page` when the lead came from a lake page, else `direct`. |

**Retired duplicate:** `lake_name` is **not** a synced contact property and no
form posts it — `target_lake` is the single source of truth. `lake_name` remains
only as a SQL alias / display string for listing and lake pages (not CRM data).
**One property, not two.** ✅

**Safety net:** `syncContact` retries with built-in fields only if HubSpot
rejects an unprovisioned custom property, so a form submit is never lost even if
`ensure-schema` hasn't been run yet.

---

## 3. Field schema lock (B3 / T020)

- **Required core data (server-enforced, can't submit without it):** `name`
  **and** at least one of `email` / `phone`. Email + US-phone formats are
  validated server-side; invalid values are rejected with a field-specific error.
- **Dropdowns, not free-text, for reporting fields:** `intent_type`,
  `price_band`, `target_lake`, `lead_source_detail` are all `select`
  enumerations in HubSpot and dropdowns in the form. Free-text lives only on
  non-reporting fields (e.g. "where are you looking" nicety, notes).
- The four props are captured but **not hard-required** on the contact — a lead
  with an unknown budget is still a lead. "Required where appropriate" = required
  core contact data, optional-but-structured qualification data.

---

## 4. Agent Acquisition deal pipeline (B4 / T025)

Pipeline **Agent Acquisition**, 8 stages (in order):

| # | Stage | Closed? | Prob |
|---|---|---|---|
| 1 | Target | no | 0.05 |
| 2 | Contacted | no | 0.15 |
| 3 | Engaged | no | 0.30 |
| 4 | Spotlight Live | no | 0.45 |
| 5 | Free Profile Claimed | no | 0.60 |
| 6 | Pitch/Demo | no | 0.80 |
| 7 | Won–Paying | **yes** | 1.0 |
| 8 | Lost/Nurture | **yes** | 0.0 |

**Deal properties** (group *Deal information*):
- `deal_target_lake` — same 15 + Other + Statewide options as `target_lake`.
- `agent_tier_target` — Standard `standard` · Prime `prime` · Elite `elite`.
- `lost_reason` — Price/budget `price` · Went with competitor `competitor` ·
  Unresponsive `unresponsive` · Not a fit `not_a_fit` · Bad timing `timing` ·
  Other `other`.

### Automations

HubSpot **Workflows, Sequences, and stage-level required properties** all need
**Sales/Operations Hub _Professional_** — not on the current plan. So the
automations run from **our backend via the free CRM API** instead (reading deals
+ creating tasks is free). No HubSpot upgrade required.

| Automation | Where it lives | Status |
|---|---|---|
| **Stripe Prime+ subscription → deal Won–Paying** | **Our code** — `stripe.controller.js` `checkout.session.completed` → `hubspot.markAgentAcquisitionWon(email, {tier})`. Prime+ = `mn_lake_specialist` (prime) or `top_agent` (elite); Standard does not auto-win. | ✅ shipped |
| **Deal idle 14 days in stages 2–6 → follow-up task** | **Our code** — daily `hubspot.runAcquisitionMaintenance()` (server.js cron). Searches active-stage deals not modified in 14d and creates a HubSpot task, deduped via the `last_auto_task_at` deal prop. | ✅ shipped (backend) |
| **Lost/Nurture deal missing `lost_reason` → task** | **Our code** — same daily sweep. We can't hard-gate the stage in the UI without Pro, so instead we create a "set a lost reason" task on any Lost deal missing one (soft enforcement, deduped weekly). | ✅ shipped (backend) |
| **Contact replies → unenroll from sequence + Contacted→Engaged** | **Needs Pro OR an inbox integration.** Detecting an email *reply* requires HubSpot's connected inbox + workflow (Pro), and there's no Sequence to unenroll from without Pro. Not replicated — the closest free substitute would be moving the deal to Engaged when the contact takes another tracked action on our site (ask if wanted). | ⚠️ not replicated |

Disable the backend sweep with `ACQ_MAINTENANCE_ENABLED=false`. Re-run
`ensure-schema` after this change so the `last_auto_task_at` deal property is
created.

---

## 5. Stripe Prime verification (B5 / T022–T023)

**Display price** (pricing page): `STRIPE_PRICING_PRIME_MONTHLY` (default **39**)
+ `STRIPE_PRICING_PRIME_ANNUAL` (default **390**). ✅ matches $39/mo + $390/yr.

**Checkout price IDs** (the real Stripe price objects) — must be set on Render:
- `STRIPE_PRICE_PRIME_MONTHLY` = Stripe price ID for the $39/mo Prime price
- `STRIPE_PRICE_PRIME_ANNUAL` = Stripe price ID for the $390/yr Prime price

Flow: pricing page → `POST /api/stripe/checkout` `{ plan: 'prime_monthly' | 'prime_annual' }`
→ `PRICE_MAP` resolves the env var → Stripe Checkout. On completion the webhook
maps the price ID back to membership `mn_lake_specialist`, publishes the agent,
and (new) flips their Agent Acquisition deal to Won.

**To verify (owner action — can't be done from the codebase):**
1. In Stripe, confirm two active Prime prices exist: recurring $39/month and $390/year.
2. In Render, confirm `STRIPE_PRICE_PRIME_MONTHLY` / `STRIPE_PRICE_PRIME_ANNUAL`
   hold those exact price IDs (and the display `STRIPE_PRICING_PRIME_*` if overriding defaults).
3. Run a real checkout as a test agent (use a live card or Stripe test mode with test keys).
4. Confirm: subscription created in Stripe, agent published, and a payment row appears.

If checkout 400s with "plan not available," the `STRIPE_PRICE_PRIME_*` env var is unset.
