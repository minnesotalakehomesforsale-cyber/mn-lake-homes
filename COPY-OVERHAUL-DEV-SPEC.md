# Copy Overhaul — Dev Spec (Buy / Sell / Rent / Lake / Town pages)

## Why this change
We are **not an MLS, brokerage, or property manager.** We do not hold listings, sell
homes, buy homes, or manage rentals. We are a **free agent-matching concierge for
Minnesota lakefront real estate**: buyers, sellers, and renters tell us what they want,
and we match them with a vetted local agent who specializes in their specific lake or
lake town.

Current copy repeatedly claims things that aren't true (live MLS feed, off-market
listings, "Sold With Us," an investor network that buys homes, rental "inventory").
Those are both off-strategy and legally risky (false advertising). This spec rewrites
the copy to the matching model.

## North-star message (apply everywhere)
- We **match** you with a local lake-specialist **agent** — free, no obligation.
- Hyper-local: agents who actually know *that* lake/town (shoreline rules, dock rights,
  water quality, seasonal access, true waterfront valuation).
- For consumers it's **free**; we make money from agents, with **no referral fees**.
- Speed + fit: the right local expert, fast.

### Language rules
- DO say: "get matched," "connect with," "a local lake specialist," "vetted agents,"
  "free, no obligation," "concierge."
- DON'T say (delete site-wide): "MLS feed," "our listings," "off-market listings,"
  "browse/search listings," "inventory," "Sold With Us," "homes we've sold," "our team
  marketed/closed," "investor network," "we buy," "Featured Properties" (as if ours).
- Never state fabricated metrics (e.g., "248 lake homes sold," "more than any local
  competitor," "growing inventory daily"). Use only true numbers, or cut the stat.

---

## A) Lake & Town detail pages — the 3-card CTA (from your screenshot)
Files: `pages/public/town-detail.html` (~lines 439-458) and
`pages/public/lake-detail.html` (~lines 446-465). Remove the **Browse listings** card
(we don't offer listings) and make all three cards agent-matching: Buy / Sell / Rent.

### town-detail.html — replace the `.discover-actions` block with:
```html
<div class="discover-actions">
    <a href="/pages/public/buy.html" class="discover-action">
        <span class="label">Looking to buy</span>
        <span class="title">Get matched with a {{TOWN_NAME}} agent</span>
        <span class="desc">We'll connect you with a vetted agent who specializes in {{TOWN_NAME}} and the {{TOWN_REGION}} lake market. Free, no obligation.</span>
    </a>
    <a href="/pages/public/sell.html" class="discover-action">
        <span class="label">Looking to sell</span>
        <span class="title">Get matched to sell</span>
        <span class="desc">Connect with a {{TOWN_NAME}} listing specialist who knows how lakefront and near-lake homes are really priced and marketed.</span>
    </a>
    <a href="/pages/public/rent.html" class="discover-action">
        <span class="label">Looking to rent</span>
        <span class="title">Find a lake rental specialist</span>
        <span class="desc">Get matched with a local agent for seasonal or year-round rentals around {{TOWN_NAME}}.</span>
    </a>
</div>
```
(`lake-detail.html` is identical — swap `{{TOWN_NAME}}`→`{{LAKE_NAME}}`,
`{{TOWN_REGION}}`→`{{LAKE_REGION}}`. For the buy card desc on a lake page:
"…specializes in {{LAKE_NAME}} and the {{LAKE_REGION}} lake market.")

> If you'd rather keep a cash-offer entry, see the cash-offer note at the bottom — but
> the default here is three clean matching paths.

### Final CTA on both pages ("Are you looking to buy or sell?")
- Keep heading **"Are you looking to buy or sell?"**
- Replace desc `Let's find the right property or buyer for your {{NAME}} home.`
  → **`We'll match you with the right local specialist for your {{NAME}} move — free.`**

---

## B) buy.html — new copy
### Meta (head)
- `<title>` → **Buy a Minnesota Lake Home | Get Matched With a Local Lake Agent**
- `meta description` → **Tell us your lake, budget, and timeline and we'll match you with a vetted Minnesota lakefront specialist — free, no obligation. We're a matching service, not a listing site.**
- og/twitter title/description → mirror the above.

### Hero (~line 111-114)
- Eyebrow `Next-Gen Home Buying` → **Find your lake home**
- H2 `Trusted by serious home buyers. Continuously.` →
  **Matched with a lake agent who actually knows the water.**
- Paragraph (line 113) →
  **Buyers across Minnesota use us to skip the generic-agent lottery. Tell us the lake, the budget, and the timeline — we connect you with a vetted local specialist who knows that shoreline. Free, no obligation.**
- Button `Get Started →` keep (opens the match form).

### Dark section "We actually care about your journey" (~line 122-147)
- Keep heading.
- Paragraph (line 128) keep first two sentences; end with: **"With the right local match, you get:"**
- Check items (lines 132-144) → replace with TRUE benefits:
  - **A local lake specialist who knows that specific shoreline and market**
  - **Honest guidance on dock rights, shoreline rules, and water quality**
  - **Help navigating appraisals, inspections, and negotiations**
  - **A free match with no obligation — you only continue if it clicks**
  - (DELETE "Access to exclusive off-market listings before they hit Zillow.")
- Keep button **Match Me With an Agent →**.

### Stat card (~line 157-162) — currently fabricated
Replace the whole card with a TRUE stat, or remove it. Suggested true framings (pick one
you can stand behind): **"Minnesota lake markets covered — 50+"**, or
**"Vetted lake specialists in our network — [real #]"**. Delete
`Lake homes sold this year / 248 / More than any local competitor`.

### Feature list (~line 165+) "Curated properties / Private seller network…"
- `Curated properties` → **The right agent, not a search bar.** Body:
  **We don't make you scroll listings. We match you to a specialist who brings you the lake homes that actually fit — and tells you the truth about each one.**
- `Private seller network … listings that haven't hit the MLS` →
  **Local market knowledge.** Body: **Our agents work these lakes every day and often know what's coming before it's public — so you hear about the right homes early.**
  (Reframe "we have pocket listings" → "our agents know the local market.")

### "Premium / luxury" split (~line 269-271)
- Keep the lake-luxury theme but strip brokerage claims. New body:
  **Buying in the luxury tier — Wayzata, Orono, Excelsior, Gull Lake, Lake Vermilion — takes an agent who lives in that market. We match you with a specialist who handles discreet, high-end lake transactions and represents you start to finish.**
- Button `Explore premium listings` → **Match me with a luxury lake agent**.

### "A cabin that pays for itself" (~line 282-283)
- Reframe to agent guidance (not "we identify properties"):
  **Want a place that's part retreat, part investment? We match you with an agent who knows the rental demand, carrying costs, and STR rules on your target lakes — so you buy with eyes open.**

### Photo gallery "Featured Properties" (~line 351-353)
- Eyebrow `Featured Properties` → **Minnesota lake communities we cover**
- Subtitle → **A look at the lakes and lake towns our specialist agents know best — from Lake Minnetonka to the Brainerd Lakes and the Arrowhead.**
- (Keep the lake-name labels; they're fine as place names, not "our properties.")

### Founder testimonial — keep, but ensure it reads as matching, not brokerage.
Suggested: **"Most buyers get handed whatever agent is up next. For something as specific as a Minnesota lake home, that's backwards. We built this to match you with someone who actually knows your lake."** — Hunter Burnside, Founder & CEO

### Financing line (~line 321) — fine ("we connect you with local lenders"); keep.

---

## C) sell.html — new copy
### Meta
- `<title>` → **Sell a Minnesota Lake Home | Get Matched With a Listing Specialist**
- description → **Get matched with a Minnesota lakefront listing specialist who knows how waterfront homes are valued and marketed. Free home-value estimate available. We match sellers with agents — we're not a brokerage.**

### Hero
- Lead with: **List with a lake specialist — matched to you, free.**
- Sub: **Selling a lake home isn't like selling a city house. We match you with a local agent who understands water frontage, dock rights, shoreline quality, and seasonal timing — and markets your home to the right buyers.**

### "List with a Minnesota lake specialist" (~line 296-297) — REMOVE first-person service claims
Current says "**We** handle everything from staging and drone photography to **MLS
listing**, showings, and closing." We don't — the agent does. Rewrite:
**The specialist we match you with handles it end to end — pricing, staging guidance, professional photography and drone tours, MLS exposure, showings, and negotiation — with a real feel for how waterfront actually gets valued.**

### "Close in days, not months" / cash offer (~line 309-310) — IMPORTANT, see flag
Current claims "**a competitive cash offer from our vetted investor network**." Unless a
real investor network exists, this is a false claim — remove it. Two options:
- **(Recommended)** Reframe as an estimate, not a purchase:
  **Want speed and certainty? Start with a free, instant estimate of your lake home's value, then get matched with an agent who can move fast — including cash-buyer options where they exist.**
- Or, if you truly have buyers lined up, keep but make the source accurate.

### Stats / "Faster than local averages" (~line 202) — remove unless you can prove it.

### Marketing/"weekly intelligence reports," "your listing is highly visible" (~225, 248)
Reframe from "we do this" to "your matched agent does this":
**Your matched agent keeps you posted on competing listings and recent comparable sales, and makes sure your home reaches qualified lake buyers.**

### Tabs (~line 289-297): `Full-Service Listing` — fine as a label, but the body must say
the **agent** provides it (see rewrite above), not "we."

### "Sold With Us" gallery (~line 378-380) — FALSE as written. Replace:
- Eyebrow `Sold With Us` → **Lakes our listing specialists know**
- Subtitle → **The waterfront markets our agents sell in every season — from Lake Minnetonka to the Brainerd Lakes and Greater Minnesota.**

### Founder quote (~line 332) — tweak ending:
**"…so sellers in this market get matched with a true lake specialist — the marketing, the comp data, and the local representation the home deserves — instead of being one listing in a feed of ten million."**

### Closing section (~line 366-368) "See how listing with us could drive new offers"
→ **See what your lake home is worth — then get matched with the right agent.** Body:
**A free, no-pressure conversation with a local specialist to talk value and strategy.**

---

## D) rent.html — new copy
### Meta
- `<title>` → **Rent a Minnesota Lake Home | Get Matched With a Local Rental Specialist**
- description → **Looking for a seasonal cabin or a year-round lake lease? Get matched with a local Minnesota agent who handles lake rentals. We're a matching service, not a listing site.**

### Hero / intro (~line 117-121)
- Replace "Tired of unresponsive landlords or inaccurate rental listings? … you get:" and
  the checks. New intro: **Finding a lake rental shouldn't mean scrolling dead listings.
  Tell us the lake, the season, and the budget — we match you with a local specialist who
  knows what's actually available.**
- Checks → true benefits: **A local agent who knows the lake rental market** /
  **Seasonal cabins and year-round leases** / **Free match, no obligation.**
  (DELETE "Verified, professionally managed waterfront properties" — we don't manage them.)
- Button `Explore properties` → **Match me with a rental specialist**.

### Stat "Growing inventory daily" (~line 150) — DELETE (we have no inventory). Replace
with a true line or remove the stat card.

### "Executive stays on the water" / corporate (~line 223-225)
Reframe from "our properties/inventory" to matching:
**Need a furnished lake home for an executive relocation or corporate retreat? We match
you with an agent who handles premium, longer-term lake rentals.**
- Buttons `Explore premium listings` / `View corporate inventory` →
  **Match me with a specialist**.

### "Verified Listings" block (~line 261-263) — FALSE (we don't inspect/photograph).
- Heading `Verified Listings` → **Local rental expertise**
- Body → **The agent we match you with knows the lakes, the seasons, and the realistic
  options — so you're not chasing listings that don't exist.**
- Link `Browse curated rentals →` → **Get matched →** (point to the rent form, not a feed).

### Leasing advisors (~line 282) — reframe "we'll curate a list of exclusive properties"
→ **Your matched agent will talk through your needs and bring you real options that fit.**

---

## E) Global search-and-replace checklist (all public pages)
Grep these and fix anywhere they appear (not just the pages above — also `about.html`,
`faq.html`, `commonrealtor.html`, `agents.html`, `components.js`, meta tags, JSON-LD):
- "MLS feed" / "our MLS" / "live feed" → remove or reframe ("MLS exposure via your agent" is OK on sell).
- "off-market listings" / "pocket listings (ours)" → "local market knowledge."
- "browse/search listings" / "inventory" / "curated rentals" → "get matched."
- "Sold With Us" / "homes we've sold" / "we marketed/closed" → "lakes our agents work."
- "investor network" / "we buy" → remove unless literally true.
- Fabricated stats (248 sold, more than any competitor, growing inventory daily, % faster) → remove or replace with true numbers.
- JSON-LD `serviceType`/`description` (e.g., sell.html ~45-56) → describe a
  **matching/referral concierge**, not "listing and seller representation" by us.

---

## Open items for Hunter (decide, then dev finalizes)
1. **Cash offer / "investor network":** do you actually have cash buyers, or is the
   cash-offer tool just an instant value estimate that routes to an agent? The spec
   assumes the latter (safer). Confirm so the dev sets the Sell copy + cash-offer card.
2. **Real numbers:** if you want any stat (markets covered, agents in network, avg match
   time), give the true figure and the dev will drop it in; otherwise those stats are cut.
3. **Rent:** confirmed all three (buy/sell/rent) are agent matches — rent copy reflects that.
