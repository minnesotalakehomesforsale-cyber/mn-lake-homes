# Dev work-ticket - add real images to all lakes & towns

37 places had no image (8 lakes + 29 towns). This pack supplies a verified, free-license
real photo for every one. Goal: download each photo, self-host it, set the image field.

## Files in this folder
- `sourcing-manifest.csv` - every place: photo file page, direct download URL, license, attribution, what it shows.
- `CREDITS.md` - paste-ready attribution lines (required for CC BY / CC BY-SA; not for CC0/PD).
- `Placeholders/` - on-brand SVG per place (optional stopgap only).

## Steps
1. Download each photo from its direct URL (column `real_photo_direct_url` in the CSV). Self-host it
   (e.g. `/assets/images/lakes/<slug>.jpg`, `/assets/images/towns/<slug>.jpg`) or push to Cloudinary.
   Do not hotlink upload.wikimedia.org in production.
2. Lakes (8): set BOTH `hero_image_url` and `featured_image_url` on the lake row (match by `slug`)
   in `src/database/lakes-seed.js` and the live `lakes` table.
3. Towns (29): towns live in the `tags` table with no image populated. Set the town image field
   (add an `image_url` column to `tags` if one does not exist), match by `slug`.
4. Attribution: add the `CREDITS.md` lines to the site (credits page or per-image caption).
   CC BY / CC BY-SA legally require a visible credit.

## Confirm before publishing
- Pelican Lake (Lake): HEADS UP: this is Pelican Lake in OTTER TAIL County, not the Crow Wing/Breezy Point lake. No free photo of the Crow Wing one was found. Confirm which Pelican Lake your page means.
- White Bear Lake (Lake): White Bear Lake exists as both a lake and a town - this is the LAKE.
- White Bear Lake (Lake Town): White Bear Lake exists as both a lake and a town - this is the TOWN.
- Big Lake (Lake Town): Generic filename but verified to depict Big Lake, MN.

## Lakes (set hero_image_url + featured_image_url)
| Slug | Photo (direct download) | License | Attribution |
|---|---|---|---|
| `gull-lake` | [The_island_in_East_Gull_Lake%2C_Minnesota.jpg](https://upload.wikimedia.org/wikipedia/commons/9/93/The_island_in_East_Gull_Lake%2C_Minnesota.jpg) | CC BY 4.0 | James Postema, CC BY 4.0, via Wikimedia Commons |
| `leech-lake` | [Leech_Lake_-_Walker%2C_Minnesota_%2828652808757%29.jpg](https://upload.wikimedia.org/wikipedia/commons/f/f0/Leech_Lake_-_Walker%2C_Minnesota_%2828652808757%29.jpg) | CC BY-SA 2.0 | Tony Webster, CC BY-SA 2.0, via Wikimedia Commons |
| `mille-lacs-lake` | [A_beautiful%2C_scenic_sunset_on_Mille_Lacs_Lake%2C_Minnesota_%2828982171863%29.jpg](https://upload.wikimedia.org/wikipedia/commons/e/e1/A_beautiful%2C_scenic_sunset_on_Mille_Lacs_Lake%2C_Minnesota_%2828982171863%29.jpg) | CC BY 2.0 | Tony Webster, CC BY 2.0, via Wikimedia Commons |
| `lake-vermilion` | [Everett_Bay_-_Lake_Vermilion%2C_Minnesota_%2836766022173%29.jpg](https://upload.wikimedia.org/wikipedia/commons/5/54/Everett_Bay_-_Lake_Vermilion%2C_Minnesota_%2836766022173%29.jpg) | CC BY-SA 2.0 | Tony Webster, CC BY-SA 2.0, via Wikimedia Commons |
| `lake-of-the-woods` | [Lake_of_the_Woods_Beach_at_Zippel_Bay_State_Park%2C_Minnesota_%2838845944862%29.jpg](https://upload.wikimedia.org/wikipedia/commons/3/34/Lake_of_the_Woods_Beach_at_Zippel_Bay_State_Park%2C_Minnesota_%2838845944862%29.jpg) | CC BY 2.0 | Tony Webster, CC BY 2.0, via Wikimedia Commons |
| `pelican-lake` | [Pelican_Lake%2C_Minnesota_July_3%2C_2022.jpg](https://upload.wikimedia.org/wikipedia/commons/9/98/Pelican_Lake%2C_Minnesota_July_3%2C_2022.jpg) | CC BY-SA 4.0 | Richard N Horne, CC BY-SA 4.0, via Wikimedia Commons |
| `cass-lake` | [South_Pike_Bay.jpg](https://upload.wikimedia.org/wikipedia/commons/6/67/South_Pike_Bay.jpg) | CC BY-SA 4.0 | McGhiever, CC BY-SA 4.0, via Wikimedia Commons |
| `white-bear-lake` | [Matoska_Park_-_White_Bear_Lake%2C_Minnesota_%2830670681208%29.jpg](https://upload.wikimedia.org/wikipedia/commons/6/64/Matoska_Park_-_White_Bear_Lake%2C_Minnesota_%2830670681208%29.jpg) | CC BY 2.0 | Tony Webster, CC BY 2.0, via Wikimedia Commons |

## Towns (set the tags image field)
| Slug | Photo (direct download) | License | Attribution |
|---|---|---|---|
| `brainerd` | [Laurel_District.JPG](https://upload.wikimedia.org/wikipedia/commons/e/e0/Laurel_District.JPG) | CC BY-SA 3.0 | Jjmusgrove, CC BY-SA 3.0, via Wikimedia Commons |
| `baxter` | [Minnesota_Fishing_Hall_of_Fame.jpg](https://upload.wikimedia.org/wikipedia/commons/c/c4/Minnesota_Fishing_Hall_of_Fame.jpg) | CC BY-SA 4.0 | McGhiever, CC BY-SA 4.0, via Wikimedia Commons |
| `alexandria` | [Big_Ole_Statue_2.jpg](https://upload.wikimedia.org/wikipedia/commons/f/fd/Big_Ole_Statue_2.jpg) | Public Domain | Beachie2k, Public Domain, via Wikimedia Commons |
| `detroit-lakes` | [Becker_county_Detroit_Lakes_MN_IMG_1268.JPG](https://upload.wikimedia.org/wikipedia/commons/3/3a/Becker_county_Detroit_Lakes_MN_IMG_1268.JPG) | CC BY-SA 3.0 | Bjoertvedt, CC BY-SA 3.0, via Wikimedia Commons |
| `bemidji` | [Bemidji%2C_Minnesota_aerial.jpg](https://upload.wikimedia.org/wikipedia/commons/c/cd/Bemidji%2C_Minnesota_aerial.jpg) | CC BY 2.0 | Doc Searls, CC BY 2.0, via Wikimedia Commons |
| `fergus-falls` | [Fergus_Falls%2C_Minnesota_Montage.jpg](https://upload.wikimedia.org/wikipedia/commons/d/d8/Fergus_Falls%2C_Minnesota_Montage.jpg) | CC BY-SA 4.0 | Farragutful, CC BY-SA 4.0, via Wikimedia Commons |
| `grand-rapids` | [3rd_Street%2C_Grand_Rapids%2C_MN-02.jpg](https://upload.wikimedia.org/wikipedia/commons/5/52/3rd_Street%2C_Grand_Rapids%2C_MN-02.jpg) | CC BY 4.0 | Myotus, CC BY 4.0, via Wikimedia Commons |
| `willmar` | [Litchfield_Avenue%2C_Willmar%2C_MN.jpg](https://upload.wikimedia.org/wikipedia/commons/9/9b/Litchfield_Avenue%2C_Willmar%2C_MN.jpg) | CC BY 4.0 | Myotus, CC BY 4.0, via Wikimedia Commons |
| `spicer` | [Green_Lake_-_Spicer%2C_Minnesota_%2835386515466%29.jpg](https://upload.wikimedia.org/wikipedia/commons/b/b5/Green_Lake_-_Spicer%2C_Minnesota_%2835386515466%29.jpg) | CC BY-SA 2.0 | Tony Webster, CC BY-SA 2.0, via Wikimedia Commons |
| `new-london` | [New_London_spillway_in_Minnesota_%286149421170%29.jpg](https://upload.wikimedia.org/wikipedia/commons/6/68/New_London_spillway_in_Minnesota_%286149421170%29.jpg) | CC BY-SA 2.0 | Dorian Wallender, CC BY-SA 2.0, via Wikimedia Commons |
| `forest-lake` | [Downtown_Forest_Lake.jpg](https://upload.wikimedia.org/wikipedia/commons/6/69/Downtown_Forest_Lake.jpg) | CC BY-SA 4.0 | Lectrician2, CC BY-SA 4.0, via Wikimedia Commons |
| `white-bear-lake` | [Business_district%2C_White_Bear_Lake%2C_Minnesota-01.jpg](https://upload.wikimedia.org/wikipedia/commons/7/75/Business_district%2C_White_Bear_Lake%2C_Minnesota-01.jpg) | CC BY 4.0 | Myotus, CC BY 4.0, via Wikimedia Commons |
| `prior-lake` | [Priorlakebridge.jpg](https://upload.wikimedia.org/wikipedia/commons/3/34/Priorlakebridge.jpg) | CC BY-SA 4.0 | Jeanqueq, CC BY-SA 4.0, via Wikimedia Commons |
| `waconia` | [Coney_Island_of_the_West.jpg](https://upload.wikimedia.org/wikipedia/commons/9/94/Coney_Island_of_the_West.jpg) | CC BY-SA 4.0 | McGhiever, CC BY-SA 4.0, via Wikimedia Commons |
| `fairmont` | [Downtown_Fairmont_-_panoramio.jpg](https://upload.wikimedia.org/wikipedia/commons/6/63/Downtown_Fairmont_-_panoramio.jpg) | CC BY-SA 3.0 | Jon Platek, CC BY-SA 3.0, via Wikimedia Commons |
| `albert-lea` | [Albert_Lea%2C_Minnesota.jpg](https://upload.wikimedia.org/wikipedia/commons/c/c2/Albert_Lea%2C_Minnesota.jpg) | CC0 | Wikideas1, CC0 / Public Domain, via Wikimedia Commons |
| `buffalo` | [Central_Ave_at_1st_Street_NE%2C_Buffalo%2C_MN-01.jpg](https://upload.wikimedia.org/wikipedia/commons/c/c6/Central_Ave_at_1st_Street_NE%2C_Buffalo%2C_MN-01.jpg) | CC BY 4.0 | Myotus, CC BY 4.0, via Wikimedia Commons |
| `chisago-city` | [Chisago_City_1996.jpg](https://upload.wikimedia.org/wikipedia/commons/6/64/Chisago_City_1996.jpg) | CC BY-SA 4.0 | Hyby2015, CC BY-SA 4.0, via Wikimedia Commons |
| `lindstrom` | [V%C3%A4lkommen_till_Lindstr%C3%B6m_-_Swedish_Coffee_Pot_Water_Tower_%2824721592494%29.jpg](https://upload.wikimedia.org/wikipedia/commons/e/ee/V%C3%A4lkommen_till_Lindstr%C3%B6m_-_Swedish_Coffee_Pot_Water_Tower_%2824721592494%29.jpg) | CC BY-SA 2.0 | Tony Webster, CC BY-SA 2.0, via Wikimedia Commons |
| `lakeville` | [Lakevillestores.jpg](https://upload.wikimedia.org/wikipedia/commons/3/34/Lakevillestores.jpg) | CC BY-SA 3.0 | William Wesen (User:Appraiser), CC BY-SA 3.0, via Wikimedia Commons |
| `chanhassen` | [Paisley_Park-Pano.jpg](https://upload.wikimedia.org/wikipedia/commons/1/19/Paisley_Park-Pano.jpg) | CC BY-SA 4.0 | Chris.Schiemann, CC BY-SA 4.0, via Wikimedia Commons |
| `mound` | [Dakota_Rail_Regional_Trail_in_Mound.jpg](https://upload.wikimedia.org/wikipedia/commons/4/40/Dakota_Rail_Regional_Trail_in_Mound.jpg) | CC BY-SA 4.0 | TheRoadDudeMN, CC BY-SA 4.0, via Wikimedia Commons |
| `lino-lakes` | [Centerville_Lake_Dock_Lino_Lakes_Minnesota_%2828980931634%29.jpg](https://upload.wikimedia.org/wikipedia/commons/a/a7/Centerville_Lake_Dock_Lino_Lakes_Minnesota_%2828980931634%29.jpg) | CC BY-SA 2.0 | Tony Webster, CC BY-SA 2.0, via Wikimedia Commons |
| `big-lake` | [Lakeside_Park_2018.jpg](https://upload.wikimedia.org/wikipedia/commons/2/28/Lakeside_Park_2018.jpg) | CC BY-SA 4.0 | KAM32296, CC BY-SA 4.0, via Wikimedia Commons |
| `hutchinson` | [Main_Street_businesses%2C_Hutchinson%2C_MN.jpg](https://upload.wikimedia.org/wikipedia/commons/d/d5/Main_Street_businesses%2C_Hutchinson%2C_MN.jpg) | CC BY 4.0 | Myotus, CC BY 4.0, via Wikimedia Commons |
| `faribault` | [Central_Avenue_N._and_Second_Street_NE.%2C_looking_south_west%2C_Faribault%2C_MN.jpg](https://upload.wikimedia.org/wikipedia/commons/4/42/Central_Avenue_N._and_Second_Street_NE.%2C_looking_south_west%2C_Faribault%2C_MN.jpg) | CC BY 4.0 | Myotus, CC BY 4.0, via Wikimedia Commons |
| `shoreview` | [Shoreview%2C_MN_-_panoramio.jpg](https://upload.wikimedia.org/wikipedia/commons/1/1a/Shoreview%2C_MN_-_panoramio.jpg) | CC BY 3.0 | Gabriel Vanslette, CC BY 3.0, via Wikimedia Commons |
| `monticello` | [Businesses_on_Broadway_Street%2C_Monticello%2C_Minnesota.jpg](https://upload.wikimedia.org/wikipedia/commons/4/44/Businesses_on_Broadway_Street%2C_Monticello%2C_Minnesota.jpg) | CC BY 4.0 | Myotus, CC BY 4.0, via Wikimedia Commons |
| `worthington` | [Worthington_Minnesota.jpg](https://upload.wikimedia.org/wikipedia/commons/8/88/Worthington_Minnesota.jpg) | CC BY-SA 2.5 | Tim Kiser (User:Malepheasant), CC BY-SA 2.5, via Wikimedia Commons |
