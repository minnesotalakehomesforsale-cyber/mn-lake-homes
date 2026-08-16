# Product & Engineering Intake Framework

**Why this exists:** every Director will ask for things. Without a triage rule the queue jams and the highest-leverage work stalls behind whoever asked loudest. This is the rule for what gets built, in what order, and what gets said "no" to.

---

## The one filter (applies to every request)

> **Is this useful on day one, to an agent with zero leads and zero listings — or does it protect revenue we already have?**

- **Yes →** it's eligible for the near-term queue.
- **No →** it's Phase 3, no matter how good it sounds.

The tell that we've drifted off-strategy: someone asks for a **power dialer or email sequencing**. That's Direction A (become a worse Follow Up Boss). Say no. We win by owning the **lake layer**, not by rebuilding a CRM agents already pay their brokerage for.

---

## Intake form (required for any request)

Every request must answer, in one paragraph each:

1. **Who is it for?** (agent / buyer / partner / admin / us)
2. **What can't they do today?** (the concrete gap)
3. **Day-one useful with zero leads/listings?** (yes/no + why)
4. **Does it protect existing revenue?** (billing, churn, trust)
5. **Does it deepen the lake moat or copy a competitor?**
6. **Rough size?** (S / M / L)

Requests without answers to 1–3 are sent back, not queued.

---

## Priority tiers (build top-down)

**P0 — Revenue protection.** Anything where a bug mis-charges, mis-routes, or churns a paying customer. Billing webhooks, dunning, subscription state. *Cheapest to fix before there are subscriptions to corrupt.*

**P1 — Day-one retention.** Value an agent sees before we send a single lead: reach stats, fact sheets, empty-state teaching, setup checklist, their own contact list. *This is what stops week-two churn.*

**P2 — The moat.** Lake intelligence and marketing assets no competitor can copy because they don't own the lake pages: Lake Intel (search demand), branded fact sheets, spotlight graphics.

**P3 — Everything else.** Full CRM features, integrations, "nice to have." Includes the whole Direction-A temptation. Default answer: **later**.

---

## Scoring (when two things tie)

`score = (reach × confidence) / effort`

- **reach:** how many users it helps × how often.
- **confidence:** do we *know* it's needed (data/complaints) or are we guessing?
- **effort:** S=1, M=3, L=8.

Build the higher score. When still tied, build the one that protects revenue.

---

## Auto-answers (so you don't re-litigate)

| Request | Answer |
|---|---|
| Power dialer | **No** — Direction A. |
| Email sequencing / drip campaigns | **No** — Direction A. |
| "Make it a full CRM" | **No** — keep the contact layer deliberately shallow. |
| Anything touching live billing state | **P0**, fast-track. |
| "Can an agent do X before we send leads?" | If yes → **P1**. |
| A new lake/partner data view we uniquely own | **P2**, prioritize. |
| Net-new integration with a 3rd-party tool | **P3** unless it protects revenue. |

---

## Cadence

- **Weekly triage:** new intake items scored and slotted; no item enters the sprint without passing the one filter.
- **Say no in writing:** every declined request gets the tier + one-line reason (usually "Phase 3 — not day-one useful"). Silent backlogs rot.
- **Re-score monthly:** confidence changes as real usage data arrives; a P3 can become a P1 when the data shows it.
