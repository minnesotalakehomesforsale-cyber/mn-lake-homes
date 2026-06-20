# Lead Nurture Drip — HubSpot Setup

The site **already** does two things automatically when a lead comes in:

1. **Immediate confirmation/welcome email** to the lead (with a relevant lead-magnet
   PDF) — sent from the app (`emailService.sendLeadConfirmation`).
2. **Sync to HubSpot** as a contact with `lifecyclestage = lead` and a
   `signup_source` (the flow type, plus the tool/page `ref` it came from).

The multi-day **drip** belongs in HubSpot Workflows (the right tool for timed
automation — don't rebuild it in the app). Everything HubSpot needs is already
being fed to it. Here's the exact setup (~20 minutes).

---

## Workflow: "New Lead Nurture"

**HubSpot → Automation → Workflows → Create → Contact-based → From scratch.**

### Enrollment trigger
- `Lifecycle stage` **is** `Lead`
  — optionally also `Create date is known` so only new leads enroll.
- (Re-enrollment: off.)

### Steps

**Day 0 — (skip the email; the app already sent the welcome).**
Add a **Delay**: `2 days`.

**Day 2 — Email: "Your Minnesota lake guide"**
- Subject: `Your Minnesota lake starting point, {{contact.firstname}}`
- Body (key points):
  - Recap that they're matched/being matched with a vetted local agent.
  - 3 links: the **Find Your Lake quiz** (`/find-your-lake`), the **buyer's
    checklist** (`/lake-buyer-checklist`), and a top buyer guide (`/blog`).
  - Soft CTA button → `/pages/public/buy.html` ("Talk to your specialist").

Add a **Delay**: `3 days`.

**Day 5 — Email: "Still looking?"**
- Subject: `Still thinking about a lake place, {{contact.firstname}}?`
- Body: short, human check-in; offer to narrow the search; CTA → get matched.
- **If/then branch:** if `Lifecycle stage` has moved past `Lead` (they replied /
  became an opportunity), **unenroll** (don't keep emailing engaged leads).

**(Optional) Day 12 — Email: market / value content**
- A lake-market note or "most affordable MN lakefront" piece → keeps you
  top-of-mind without being salesy.

### Branching by intent (optional, recommended)
Use the `signup_source` property to fork copy:
- contains `seller` → seller drip ("what your lake home is worth", staging guide).
- contains `buyer` / a tool ref → buyer drip (above).

### Suppression / good hygiene
- Add an **unsubscribe** link (HubSpot adds one automatically on marketing email).
- Goal: `Lifecycle stage = Opportunity` (or a deal created) → exit the workflow.
- Don't enroll contacts who already have an open deal.

---

## What's already wired (no action needed)
- `lifecyclestage = lead` and `signup_source` set on every lead → drives the
  trigger + branching above. (`src/controllers/lead.controller.js` → `hubspot.syncContact`.)
- Tool/page origin is captured in the lead notes and `signup_source` (the `ref`).
- Immediate welcome email handled by the app.

## If you'd rather not use HubSpot for the drip
The app could send day-2/day-5 follow-ups via a scheduled job, but that means
rebuilding scheduling, suppression, and unsubscribe handling that HubSpot already
does well. Recommended path is the workflow above.
