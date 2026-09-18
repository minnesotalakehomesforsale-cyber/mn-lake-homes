// One-off DOW resolver (SEOP07 prerequisite).
//
// Our lakes have names + counties but no DNR DOW numbers, so the enrichment
// backfill (scripts/backfill-dnr.js) has nothing to key on. This script asks the
// DNR LakeFinder search API for each lake by name, disambiguates by county
// (Minnesota has ~10 "Gull Lake"s), and stores the matched DOW on lakes.dow_number.
// Run this FIRST; then backfill-dnr.js can enrich.
//
// Matching is deliberately conservative: a DOW is only written when exactly one
// candidate matches the lake's normalized name AND its county. Anything ambiguous
// or countyless is reported and left NULL for a human to resolve — we never guess
// a DOW, because a wrong DOW would put another lake's depth/fish on this page.
//
// Throttled ~1 req/sec. DRY RUN by default (reports matches, writes nothing);
// pass --write to persist. Run on the Render shell where DATABASE_URL is set:
//   node scripts/resolve-dow.js            # preview matches
//   node scripts/resolve-dow.js --write    # persist matched DOWs

require('dotenv').config({ path: process.env.DOTENV_PATH || '.env.local' });

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.'); process.exit(1);
}

const pool = require('../src/database/pool');

const args = process.argv.slice(2);
const write = args.includes('--write');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Normalize a lake name for comparison: drop "lake", punctuation, case, extra
// spaces. "Gull Lake" and "Lake Gull" both → "gull".
const normName = s => String(s || '').toLowerCase().replace(/\blakes?\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Counties compare on bare name ("Cass" vs "Cass County" vs "cass").
const normCounty = s => String(s || '').toLowerCase().replace(/\bcounty\b/g, '').replace(/[^a-z0-9]+/g, '').trim();

// Curated overrides for lakes the name+county search can't auto-resolve. Two
// kinds, all DOWs verified against DNR LakeFinder search results:
//   • county-boundary lakes — DNR files them under the adjacent county, so the
//     county filter rejects the (correct) hit. Unambiguous.
//   • chain / split lakes — DNR has no plain "X Lake"; it splits into named
//     basins (Upper/Lower/East/West/Big). We map to the primary basin (largest
//     / the one the community sits on). Adjust if a different basin is wanted.
// Keyed by "<normName>|<normCounty>".
const OVERRIDES = {
    'cass|cass':            { dow: '04003000', note: 'Cass Lake — DNR files under Beltrami' },
    'rainy|koochiching':    { dow: '69069400', note: 'Rainy Lake — DNR county St. Louis' },
    'white bear|ramsey':    { dow: '82016700', note: 'White Bear Lake — DNR county Washington' },
    'sakatah|lesueur':      { dow: '40000200', note: 'Upper Sakatah (Le Sueur basin)' },
    'whitefish chain|crowwing': { dow: '18031000', note: 'main Whitefish basin of the Chain' },
    'battle|ottertail':     { dow: '56023900', note: 'West Battle Lake (city of Battle Lake)' },
    'sylvia|wright':        { dow: '86027900', note: 'West Lake Sylvia (larger basin)' },
    'prior|scott':          { dow: '70002600', note: 'Lower Prior (main basin)' },
    'island|stlouis':       { dow: '69037200', note: 'Island Lake Reservoir (Duluth)' },
    // Lake Superior has no DNR fisheries survey (Great Lake) — intentionally omitted.
};

async function searchDnr(name) {
    const url = `https://maps.dnr.state.mn.us/cgi-bin/lakefinder/search.cgi?context=desktop&name=${encodeURIComponent(name)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'MinnesotaLakeHomesForSale/1.0 (+https://minnesotalakehomesforsale.com)' } });
    if (!r.ok) throw new Error(`DNR search ${r.status}`);
    const data = await r.json();
    return Array.isArray(data && data.results) ? data.results : [];
}

// Choose the single unambiguous DOW for a lake, or null with a reason.
function pick(lake, results) {
    const wantName = normName(lake.name);
    const wantCounty = normCounty(lake.county);
    // Curated override wins first (boundary + chain lakes the search can't resolve).
    const ov = OVERRIDES[`${wantName}|${wantCounty}`];
    if (ov) return { dow: ov.dow, matched: { name: ov.note, county: lake.county }, override: true };
    // Candidates whose name matches ours exactly (normalized).
    const nameMatches = results.filter(r => normName(r.name) === wantName);
    if (nameMatches.length === 0) return { dow: null, reason: results.length ? 'name mismatch' : 'no results' };
    // Prefer the one in our county.
    if (wantCounty) {
        const inCounty = nameMatches.filter(r => normCounty(r.county) === wantCounty);
        if (inCounty.length === 1) return { dow: inCounty[0].id, matched: inCounty[0] };
        if (inCounty.length > 1) return { dow: null, reason: `ambiguous (${inCounty.length} in ${lake.county})` };
        // Name matches but none in our county.
        return { dow: null, reason: `no ${lake.county} match among ${nameMatches.length} name hits` };
    }
    // No county on our side: only accept a globally unique name match.
    if (nameMatches.length === 1) return { dow: nameMatches[0].id, matched: nameMatches[0] };
    return { dow: null, reason: `ambiguous (${nameMatches.length} statewide, no county to disambiguate)` };
}

(async () => {
    console.log(`\nDOW resolver — ${write ? 'WRITE (persisting matches)' : 'DRY RUN (no writes)'}\n`);
    let q = `SELECT id, name, county, dow_number FROM lakes
              WHERE status = 'published' AND (dow_number IS NULL OR dow_number = '')
              ORDER BY name`;
    if (limit) q += ` LIMIT ${limit}`;
    const { rows: lakes } = await pool.query(q);
    console.log(`${lakes.length} published lakes without a DOW.\n`);

    let matched = 0, ambiguous = 0, missing = 0;
    for (const lake of lakes) {
        let res = [];
        try { res = await searchDnr(lake.name); }
        catch (e) { console.log(`  ? ${lake.name} (${lake.county || '—'}) → search failed: ${e.message}`); missing++; await sleep(1100); continue; }
        const p = pick(lake, res);
        if (p.dow) {
            matched++;
            console.log(`  ✓ ${lake.name} (${lake.county || '—'}) → DOW ${p.dow}  [${p.matched.name}, ${p.matched.county}]`);
            if (write) await pool.query(`UPDATE lakes SET dow_number = $2 WHERE id = $1`, [lake.id, p.dow]);
        } else {
            if ((p.reason || '').startsWith('ambiguous') || (p.reason || '').includes('among')) ambiguous++; else missing++;
            console.log(`  ✗ ${lake.name} (${lake.county || '—'}) → ${p.reason}`);
        }
        await sleep(1100);
    }

    console.log(`\nResult: ${matched} matched, ${ambiguous} ambiguous, ${missing} no-match, of ${lakes.length}.`);
    if (!write && matched) console.log(`Re-run with --write to persist the ${matched} matched DOWs, then run scripts/backfill-dnr.js.`);
    if (write) console.log(`Wrote ${matched} DOWs. Next: node scripts/backfill-dnr.js  (enriches them from the DNR).`);
    console.log('');
    await pool.end().catch(() => {});
    process.exit(0);
})().catch(async e => { console.error('\nResolver FAILED:', e.message); await pool.end().catch(() => {}); process.exit(1); });
