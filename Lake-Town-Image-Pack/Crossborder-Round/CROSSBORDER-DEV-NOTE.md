# Cross-border round — 19 ND/WI towns + Whitefish Chain

Real, verified, free-license photos (no AI). This closes all 19 missing ND/WI towns
and the Whitefish Chain flagship lake.

## Apply (same pipeline as before)
1. In `src/data/place-images.json`: append the `towns` entries below into the `towns`
   array, and the one `lakes` entry (whitefish-chain) into the `lakes` array.
   (Source file: `place-images-crossborder-addition.json` in this folder.)
2. `node scripts/download-place-images.js`
3. `node scripts/apply-place-images.js`
4. Commit + push.

## Confirm slugs first
I used kebab-case slugs. Make sure each matches the tag/lake `slug` already in your DB,
or `apply` will log "not in DB — skipped". Slugs used:
towns: bismarck, mandan, jamestown, valley-city, devils-lake, dickinson, minot, fargo,
horace, mapleton, grand-forks, wahpeton, hudson, new-richmond, ashland, hayward,
rice-lake, spooner, superior
lake: whitefish-chain

## Notes
- All licenses are CC0 / Public Domain / CC BY / CC BY-SA — the apply script writes the
  credit columns automatically, so attribution is handled.
- Whitefish Chain is a Flickr photo (CC BY-SA 2.0, ~1024px). It's verified to be the
  Crosslake chain. Fine for cards; swap for a higher-res shot later if one appears.
- Grand Forks/New Richmond/Hudson chose civic/landmark/river shots; alternates exist if
  you prefer a downtown street view.

## Lakes that STILL have no free photo (14) — need agent/partner or licensed stock
These have been searched exhaustively (Commons + Openverse + Flickr CC). No AI per policy.
- Lake Le Homme Dieu, Lake Miltona, Lake Osakis (Alexandria Lakes / Douglas-Todd)
- Lake Hubert, Lake Shamineau, Serpent Lake, Ten Mile Lake (Brainerd Lakes)
- Clearwater Lake, Lake Sylvia, Sugar Lake (Central / Wright Co.)
- Lake Sallie (T1, Becker Co.) — confirmed nothing across all sources
- Lake Okabena (Worthington), Forest Lake, Lake Riley (metro)
Fastest fix: ask the agents/partners on these lakes for a photo (+ a one-line permission
to use it). Until then they show the branded placeholder.
