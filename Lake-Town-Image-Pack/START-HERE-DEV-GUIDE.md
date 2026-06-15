# START HERE — Lake & Town hero images (dev guide)

This folder supplies real, free-license hero photos for every launch lake and town.
All photos are genuine Wikimedia Commons images, verified for license and that they
show the actual place. No AI images.

## Status (82 launch places)
- **Towns: 29 / 29 done** — already in `src/data/place-images.json` and applied to the DB.
- **Lakes: 32 / 53 have a real photo.** 9 were already done; this pack adds **23 more**.
- **21 lakes have no free photo yet** — see `Lakes-Addendum/LAKES-STILL-NEEDED.md`.
  They display the branded placeholder until a real photo is supplied.

## How images are wired (existing system — don't reinvent it)
`src/data/place-images.json` is the source of truth. Two repo scripts consume it:

- `scripts/download-place-images.js` — downloads each `source_url` and self-hosts it at
  `/assets/images/lakes/<slug>.jpg` or `/assets/images/towns/<slug>.jpg`
  (sets a Wikimedia-friendly User-Agent; re-running skips existing files, `--force` to refetch).
- `scripts/apply-place-images.js` — UPDATEs the DB:
  `lakes.hero_image_url` + `featured_image_url` + `hero_image_credit_{name,url,license}`,
  and `tags.hero_image_url` + the same credit columns for towns. Idempotent.

So **attribution is stored on each row automatically** by the apply script — the CREDITS
files in this pack are just human-readable reference, not something you paste by hand.

## To add the 23 new lakes — do this
1. Open `Lakes-Addendum/place-images-lakes-addition.json`. Append its 23 objects to the
   `"lakes"` array in `src/data/place-images.json` (keep the existing 7).
2. `node scripts/download-place-images.js`  (fetches the 23 new photos into `/assets/images/lakes/`)
3. `node scripts/apply-place-images.js`  (writes image paths + credits to the DB — needs `DATABASE_URL`; run from the Render shell or with the prod URL)
4. Spot-check a few lake pages, then commit + push (deploys).

Heads-up on a few picks (all noted in the CSV): Lake Koronis is a winter/ice shot and
Lake Zumbro is a dam view — fine for now, swap the `source_url` later if you find better.
Otter Tail Lake: confirm the photographer on its file page before publishing (`credit_name`
is a placeholder).

## The 21 lakes still needing a photo
Listed in `Lakes-Addendum/LAKES-STILL-NEEDED.md`. They have no free-license photo on
Commons (mostly smaller lakes; some only had wrong-place look-alikes, which we did NOT use).
When you get a real photo (e.g. from an agent/partner on that lake, or licensed stock):
- add a `lakes` entry to `src/data/place-images.json` (`slug`, `source_url`, `credit_name`,
  `license`, `credit_url`) and re-run the two scripts — or drop the file straight into
  `/assets/images/lakes/<slug>.jpg`.
Until then each shows `Lakes-Addendum/Placeholders/lake-<slug>.svg`.

## Everything in this folder
- `START-HERE-DEV-GUIDE.md` — this file (the only instructions you need).
- `Lakes-Addendum/place-images-lakes-addition.json` — the 23 new lakes, ready to merge.
- `Lakes-Addendum/lakes-round2-manifest.csv` — full detail: photo URL, license, attribution, what it shows.
- `Lakes-Addendum/CREDITS-lakes-round2.md` — credit lines (reference; scripts write these to the DB).
- `Lakes-Addendum/LAKES-STILL-NEEDED.md` — the 21 lakes with no free photo + how to fill them.
- `Lakes-Addendum/Placeholders/` — branded SVG fallback for all 44 lakes.
- `sourcing-manifest.csv`, `CREDITS.md`, `Placeholders/` — round 1 (7 lakes + 29 towns), already applied.
