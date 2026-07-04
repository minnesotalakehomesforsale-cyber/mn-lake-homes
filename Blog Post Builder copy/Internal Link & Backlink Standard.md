# Internal Link & Backlink Standard (v2)
**Source of truth for how many links every blog must carry, and where they point.**
_Owner: Director of Marketing · Read by the morning blog task and the Lake Page Builder blog spec._
_Updated 2026-06-17 — raised link density substantially (Hunter: "a lot more backlinks — to other blogs, to agents, to websites")._

---

## Why this exists
A blog network only compounds if the posts are densely linked — to the money pages they feed, to each other, and out to authority sources that build topical trust. The old standard (2-3 up + 1-2 related) was too thin. This doc replaces it.

**Hard floor per post: 8-12 contextual links**, distributed across the four buckets below. More is fine when natural; never stack links or pad with junk.

---

## The four buckets (every post hits all four)

### 1. UP to money pages — 3-5 links (internal)
- Link the **primary** lake/town money page at least **3x** across the body + closing CTA.
- Add **1-2** links to a **related/nearby** lake or town money page.
- PLURAL convention: `/lakes/<slug>/` and `/towns/<slug>/`.
- **Only link pages listed CONFIRMED LIVE** in `Live Money Pages Registry.md`. Never link a money page that isn't confirmed live (HARD RULE 1).

### 2. ACROSS to other blogs — 3-4 links (internal)
- Link **3-4 other posts**: the evergreen/trust anchors plus any place posts on the same or nearby lake/town.
- Eligible targets: posts in `Published Log.md` (already handed off) **or** other posts in **today's batch**. Never link a post that doesn't exist yet (HARD RULE 1).
- Build the cluster both ways: new place posts link UP to the evergreen anchors; evergreen/anchor posts link DOWN to relevant place posts as they publish.

### 3. AGENT / MATCHING — 1-2 links (internal, guardrail-safe)
- Always include the **get-matched CTA** (`/`) at least once.
- Where the dev confirms it exists, also link the money page's **"Trusted [Lake] Agents"** section anchor or a lake-specific agent landing page.
- **GUARDRAIL (CLAUDE.md):** do NOT name or deep-link specific paid agents, and never expose the paid-placement mechanism in consumer copy. "Links to agents" means the matching flow + the vetted-agents section, framed as "get matched with a vetted, licensed, local agent" — not an agent directory. If a future ask wants direct agent-profile links in consumer posts, flag it to Hunter first (it touches the defensible-claims + paid-placement guardrails and the Director of Agent Growth lane).

### 4. OUT to external authority — 2-4 links (outbound)
- Link **2-4 reputable, non-competitor** external sources from the **Approved External Sources** list below. Pick the ones that fit the post's angle (shoreland rules, fishing, water quality, schools, etc.).
- **Verify each URL resolves at build time** (web_fetch or search). If a source can't be verified, drop it or mark `[verify]` — never ship a guessed outbound URL.
- **NEVER link competitors** — no Zillow, Realtor.com, Redfin, LakePlace.com, LakeHomes.com, LakeHouse.com, or any other lake-listing portal/brokerage. Outbound goes to government, associations, and tourism/info sources only.
- Dev sets `target`/`rel` (suggest open-in-new-tab, `rel="noopener"`); we just supply URL + descriptive anchor.

---

## Approved External Sources (verified 2026-06-17 — re-verify at build)
Use the ones relevant to the post:

**Statewide / regulatory (good on almost any place post)**
- MN DNR LakeFinder (lake surveys, depth maps, water clarity): https://www.dnr.state.mn.us/lakefind/index.html
- MN DNR Fisheries Lake Surveys: https://www.dnr.state.mn.us/lakefind/surveys.html
- MN DNR Shoreland Regulations & Administration: https://www.dnr.state.mn.us/waters/watermgmt_section/shoreland/regulations.html
- MN DNR Shoreland info for property owners: https://www.dnr.state.mn.us/waters/watermgmt_section/shoreland/property-owners.html
- MN DNR Lake/shoreland classifications: https://www.dnr.state.mn.us/waters/watermgmt_section/shoreland/lake_shoreland_classifications.html
- MN DNR "Do I need a water permit?": https://www.dnr.state.mn.us/permits/water/needpermit.html
- MN DNR public water access / shoreline BMPs: https://www.dnr.state.mn.us/water_access/bmp/index.html
- MN Dept. of Commerce (real estate licensing — for "working with an agent" angles): https://mn.gov/commerce/
- MN Dept. of Health — wells & private water: https://www.health.state.mn.us/communities/environment/water/wells/
- MN Pollution Control Agency — lake water quality: https://www.pca.state.mn.us/

**Local (find + verify per place — county/city/chamber/schools)**
- The lake's **county** shoreland-zoning / planning page (e.g., Crow Wing, Cass, Hennepin, Otter Tail).
- The **town/city** official site and the local **chamber of commerce / tourism** bureau.
- The **school district** site (required for `Schools, dining & events` town posts).
- The lake's **lake association** site, if one exists (also flag as a partner target for Director of Partnerships).

Add new vetted sources here over time. Anything not on this list must be verified before use.

---

## Anchor-text rules
- Use **descriptive, natural anchors** with the place/topic in them ("buying on Gull Lake," "Minnesota shoreland setback rules") — never "click here" or bare URLs.
- Don't over-optimize: vary the anchor wording; don't repeat the exact-match keyword on every link.
- Spread links through the body where they're genuinely useful; don't cluster them all in one paragraph or dump a link list.

## Pre-publish link check (add to every handoff)
- [ ] 8-12 contextual links total, all four buckets represented
- [ ] Every internal target is CONFIRMED LIVE (registry) or in today's batch — zero dead links
- [ ] Every external URL verified to resolve; no competitors linked
- [ ] No specific paid-agent deep links; matching framed per guardrail
- [ ] Descriptive, varied anchor text
