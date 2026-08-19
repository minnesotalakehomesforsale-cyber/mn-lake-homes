# Retention & sweep flags — current state

**Last reviewed:** 2026-08-18 · ~5 listed agents, near-zero lead volume.

This file exists so nobody mistakes **"off on purpose"** for **"broken."** Several
retention/automation sweeps are gated behind env flags. Their *code default* and
their *intended state at current scale* are recorded below. The **actual runtime
value lives in Render env vars** — confirm there; this doc records intent.

## The flags

| Flag (env var) | Polarity | Code default | What it drives | Intended now |
|---|---|---|---|---|
| `AGENT_ROI_EMAIL_ENABLED` | opt-in (`=== 'true'`) | **OFF** | Monthly "your plan earned you $X" recap | **Leave OFF** |
| `CHURN_SWEEP_ENABLED` | opt-in | **OFF** | Churn nudge (free) / personal-call task (paying) | **Leave OFF** |
| `WIN_BACK_ENABLED` | opt-in | **OFF** | Post-cancellation win-back sequence | **Leave OFF** |
| `BUYER_DIGEST_ENABLED` | opt-in | **OFF** | Buyer-side digest email | Leave OFF |
| `CONTACT_DIGEST_ENABLED` | opt-in | **OFF** | Agent contact-reminder digest | Leave OFF |
| `NURTURE_ENABLED` | opt-in | **OFF** | Buyer nurture sequence | Leave OFF |
| `PROFILE_NUDGE_ENABLED` | opt-**out** (`!== 'false'`) | **ON** | New-agent profile-completion nudge (≤3) | **Keep ON** |
| _(dunning)_ | none — always on | **ON** | Failed-payment day 0/3/7 + downgrade | Keep ON |

The diagnostic panel (`/api/_diagnostic` → `checks.sweeps`) reports these
correctly — an "OFF" reading there is accurate, not a display bug.

## Why the retention set is intentionally OFF right now

At ~5 agents and effectively zero lead volume, these do more harm than good:

- **ROI recap** would email "$0 estimated value" — a *churn cause*, not retention.
- **Win-back** needs someone to win back; there's no cancelled paying base yet.
- **Churn nudge** fires on ghosting/dormancy that isn't meaningful at this size.

`PROFILE_NUDGE_ENABLED` stays **ON** because it helps brand-new signups finish
their profile — directly useful during the acquisition push. Dunning stays ON
because a real failed payment always needs handling.

## When to turn the retention set ON

Turn `CHURN_SWEEP_ENABLED`, `WIN_BACK_ENABLED`, and `AGENT_ROI_EMAIL_ENABLED` to
`true` in Render once there is **a paying base to retain and real lead volume** —
i.e. the ROI recap would show a real number and win-back has real cancellations
to act on. Revisit at the next scale checkpoint.

> Note: the underlying `lifecycle_state` machine is still "dark" (written but no
> sweep filters on it). Wiring the sweeps onto it is tracked separately (AL-03
> slice 2b) and is prerequisite work before leaning on these at scale.
