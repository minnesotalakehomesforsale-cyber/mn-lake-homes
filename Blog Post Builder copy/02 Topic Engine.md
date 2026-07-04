# Topic Engine — Blog Post Builder

How to pick what to write when Hunter says "I need a blog" without specifying a topic. This is the SEO brain of the project.

The job is **not** to write a blog post. The job is to write the post that, on a given day in a given season with a given coverage gap, gives MN Lake Homes the most ranking-and-conversion lift per hour of work.

---

## Topic categories (the menu)

Every post fits one of these categories. They're ranked roughly by SEO leverage in Phase 1.

### Tier A — direct ranking lift for Tier-1 lakes

Highest SEO leverage. Each one feeds traffic to a Tier-1 lake page through internal links.

1. **Lake Buyer Guide** — "Buying a home on [Lake]: 2026 guide." Targets `[Lake] homes for sale`, `buy home on [Lake]`. Long, evergreen, dense in internal links to the lake page.
2. **Lake Market Report** — "[Lake] market report: [Quarter] [Year]." Quarterly. Targets `[Lake] real estate prices`, `[Lake] market trends`. Repeatable + timely (Google rewards freshness on real estate).
3. **Lake Deep-Dive** — "What it's like to live on [Lake]." Lifestyle + buyer-aware. Targets `living on [Lake]`, `[Lake] community`.
4. **Lake Lifestyle Best-Of** — "Best fishing on [Lake]," "Best resorts on [Lake]," "Best things to do on [Lake]." Targets long-tail recreational queries that pull non-real-estate traffic into the funnel. Strong link target for the lake page.
5. **Lake Comparison** — "[Lake A] vs [Lake B]: which is right for you?" Targets comparison queries with high intent. Doubles internal-link load.

### Tier B — buyer/seller intent across lakes

Strong conversion content even when not lake-specific.

6. **Statewide Buyer Guide** — "First-time MN lake home buyer's guide," "Cabin vs. lake home: what's the difference?"
7. **Statewide Seller Guide** — "When to list your MN lake home," "Prepping your cabin for sale."
8. **MN Lake Market Report** — quarterly. Statewide rollup, links out to Tier-1 lake reports.
9. **Buyer Education / How-To** — "Septic systems on lake homes 101," "What to ask about docks and lifts," "Lakeshore vs. lakefront: what's the difference?"
10. **Seller Education / How-To** — "How to price a lakefront listing," "Photos that sell a cabin."

### Tier C — seasonal & topical (high freshness signals to Google)

Lower evergreen value but excellent for short bursts of seasonal traffic and shareability.

11. **Seasonal Content** — ice-out predictions (March–April), dock prep (April–May), boat launch tips (May), peak summer lifestyle (June–August), fall closing checklist (Sept–Oct), winterization (Oct–Nov), planning content (Dec–Feb).
12. **Holiday / Cultural** — "Up north Fourth of July traditions," "MOA vs. the lake: a Minnesotan summer weekend."

### Tier D — partnership and cross-Director compounding

Lower ranking impact directly, but high strategic leverage.

13. **Vendor Spotlight** (with Partnerships) — "Meet the dock builder behind half of Gull Lake." Backlink from the partner, content for them to share.
14. **Agent Spotlight** (with Agent Growth, eventually) — paying agents only, lake-specific.
15. **Lake Association Profile** — "Inside the [Lake] Association: how a 1,200-member group keeps the water clean." Builds local authority and partnership warmth.

---

## Seasonal calendar

Approximate windows. Use as a guide, not a rule. Adjust to actual weather and search trends.

| Window | Primary themes | Avoid |
|---|---|---|
| Jan–early Mar | Buyer planning, "best lakes for X" longform, market year-in-review, refinance/financing topics | Anything dock/water-active |
| Mar–Apr | Ice-out, spring market opening, dock prep, boat launch, "is this the year to buy?" | Snow/ice content |
| May | Cabin season opens, peak buyer shopping, "what's hitting the market," summer rental angle for sellers | Fall content |
| Jun–Jul | Peak lifestyle, "in season" deep-dives, market reports for Q2, family-on-the-lake angles | Closing-season urgency |
| Aug | End-of-summer rush, "last-chance buys," cabin handoff stories, prepping kids for school + lake | Pure spring content |
| Sep–Oct | Fall closing, winterization, market reports for Q3, "should I sell before snow?" | Spring buyer content |
| Nov–Dec | Year-in-review, holiday content, planning for next year, gift guides for cabin owners | Anything urgent / spring-only |

**A pattern that works year-round:** ~50% Tier A (Tier-1 lake content), ~25% Tier B (statewide intent), ~25% Tier C/D (seasonal + partnerships). Adjust if a Tier-1 lake is severely under-covered.

---

## Scoring rubric (when picking from candidates)

Score each candidate 0–10 on each axis. Highest total wins.

1. **Tier-1 lake coverage gap.** Does this fill a coverage gap on a high-priority lake? (10 = the lake has zero or stale content; 0 = saturated.)
2. **Seasonal relevance.** Does it match what users are actually searching this week/month? (10 = perfect match; 0 = wrong season.)
3. **SEO opportunity.** Is the keyword winnable (decent volume, beatable competitors)? (10 = clear path to top 3; 0 = competing with Zillow/Realtor.com on a head term.)
4. **Internal linking.** Will this post drive internal links into 2+ lake pages? (10 = naturally links into 3+ Tier-1 lakes; 0 = isolated.)
5. **Conversion intent.** Does the searcher show buyer/seller signal? (10 = "homes for sale on [Lake]"; 0 = pure lifestyle browsing.)
6. **Templatability.** Will this format work for any other geography (Common Realtor)? (10 = pure template; 0 = hyper-MN-specific in a non-translatable way.)

If two candidates tie, pick the one **the blog hasn't covered in the last 60 days**.

---

## Duplication avoidance

Before writing, scan `/Department Heads/Director of Marketing/Sub-projects/Blog Post Builder/Posts/` for:
- Any post in the last 60 days with the same primary lake.
- Any post ever with the same primary keyword.
- Any post in the last 30 days in the same category.

If a near-duplicate exists, either pivot the angle or pick the second-place candidate.

Also scan `/Department Heads/Director of Marketing/Sub-projects/Lake Page Builder/Lakes/[Lake]/02 Blog Post.md` — the Lake Page Builder also produces blog posts when launching a lake. Don't repeat.

---

## When Hunter gives partial input

- **"I need a blog"** → propose 3 candidates from highest-scoring topics, let Hunter pick (or auto-pick #1 if Hunter says "you pick" or "go").
- **"I need a blog about [Lake X]"** → use the lake; pick the best Tier-A category for that lake based on coverage gap and season.
- **"I need a blog about [topic]"** → write that topic; if it's not in the menu, fit it into the closest category and apply the standards.
- **"I need a blog for [season/event]"** → seasonal content from Tier C; pick the angle with best SEO opportunity.

If Hunter says **"go"** with no detail at all, don't ask. Pick the highest-scoring candidate, write it, save it, return it. Note the topic-selection logic at the top of the post so Hunter can see why this one and not another.

---

## Topic generation for "I need a blog"

When Hunter doesn't specify, the project should:

1. Check the current date (use bash `date` if needed).
2. Pull the seasonal window from the table above.
3. Identify Tier-1 lakes with thin or no recent coverage by scanning `/Posts/` and `/Lakes/`.
4. Generate 3–5 candidate topics, each scored using the rubric.
5. Either propose the top 3 (if Hunter wants to choose) or write the top 1 (if Hunter said "go").

Show the candidate list and scores at the top of the output so Hunter can see the reasoning. He may want to override.
