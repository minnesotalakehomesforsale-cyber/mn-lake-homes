# Lake & Town Image Pack — MinnesotaLakeHomesForSale.com

37 places on the site had no image: 8 lakes + 29 towns.
(White Bear Lake appears twice on purpose — it's both a lake and a town.)
Every one now has a VERIFIED real photo. No AI images.

## Contents
- sourcing-manifest.csv — one row per place: the real photo (Commons file page +
  direct upload.wikimedia.org URL), license, attribution, what it shows, and notes.
- CREDITS.md — ready-to-paste attribution lines (required for CC BY / CC BY-SA).
- Placeholders/ — on-brand SVG hero per place (optional stopgap if you don't want
  to place the real photo immediately).

## The photos
All sourced from Wikimedia Commons and verified via the Commons API: the file
exists, the license is in the allowed set, and the image genuinely depicts that
Minnesota place. Licenses are Public Domain / CC0 / CC BY / CC BY-SA.

### Attribution (important)
CC BY and CC BY-SA REQUIRE a visible credit (author + license) — use CREDITS.md.
CC0 / Public Domain need none. CC BY-SA also means any derivative must stay
share-alike; using the photo as-is on the site is fine.

### Two notes to confirm
- Pelican Lake: the only free photo found is Pelican Lake in OTTER TAIL County,
  not the Crow Wing/Breezy Point lake. Confirm which one your page means.
- Detroit Lakes / Big Lake: filenames are generic but each was verified to show
  the right place.

## How to apply (for the dev)
- Download each real photo from its file page (or hotlink the upload.wikimedia.org
  URL, but self-hosting is better), then:
  - Lakes: set hero_image_url and featured_image_url on the lake row.
  - Towns: towns live in the tags table — set the town image field (add one if needed).
- Keep the CREDITS.md lines visible somewhere on the site.
