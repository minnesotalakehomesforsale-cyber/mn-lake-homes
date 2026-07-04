// ─── MN DNR LakeFinder enrichment ───────────────────────────────────────────
// Pulls authoritative per-lake facts (depth, acreage, water clarity, fish
// species, public accesses) from the Minnesota DNR LakeFinder survey API and
// stores them on the lakes row. These facts make every lake page genuinely
// unique — the fix for thin/duplicate-content SEO risk — and give buyers the
// "should I buy HERE?" data Zillow's algorithmic pages never show.
//
// Source: Minnesota DNR (public data, MN Government Data Practices Act; provided
// "as is"). We attribute "Source: Minnesota DNR" on the page.
//
// The API changes only when a new fisheries survey posts (months apart), so we
// cache aggressively: enrich in a throttled nightly batch, never per page-view.

const pool = require('../database/pool');

// DNR survey fish-species codes → friendly names (the common MN game/pan fish).
// Surveys report 3-letter codes; anything unmapped is skipped from the display.
const SPECIES = {
    WAE: 'Walleye',        NOP: 'Northern Pike',   LMB: 'Largemouth Bass',
    SMB: 'Smallmouth Bass', BLC: 'Black Crappie',   WHC: 'White Crappie',
    BLG: 'Bluegill',       YEP: 'Yellow Perch',    MUE: 'Muskellunge',
    TME: 'Tiger Muskie',   CAP: 'Common Carp',     BLB: 'Black Bullhead',
    YEB: 'Yellow Bullhead', BRB: 'Brown Bullhead',  CCF: 'Channel Catfish',
    FLC: 'Flathead Catfish', RKB: 'Rock Bass',      PMK: 'Pumpkinseed',
    GSF: 'Green Sunfish',  HSF: 'Hybrid Sunfish',   BUB: 'Burbot',
    LKW: 'Lake Whitefish', CISCO: 'Cisco (Tullibee)', TLC: 'Cisco (Tullibee)',
    LAT: 'Lake Trout',     RBT: 'Rainbow Trout',   BNT: 'Brown Trout',
    BKT: 'Brook Trout',    WTS: 'White Sucker',    SHR: 'Shorthead Redhorse',
    GSG: 'Golden Shiner',  FRD: 'Freshwater Drum', SAR: 'Sauger',
};

const num = v => {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
};
const int = v => { const n = num(v); return n === null ? null : Math.round(n); };

// Fetch + parse one lake's survey by DOW number. Returns the field shape we
// store, or null when the DNR has no survey for that lake.
async function fetchLakeSurvey(dow) {
    const id = String(dow || '').trim();
    if (!id) return null;
    const url = `https://maps.dnr.state.mn.us/cgi-bin/lakefinder/detail.cgi`
        + `?type=lake_survey&callback=&id=${encodeURIComponent(id)}&_=${Date.now()}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'MinnesotaLakeHomesForSale/1.0 (+https://minnesotalakehomesforsale.com)' } });
    if (!r.ok) throw new Error(`DNR responded ${r.status} for DOW ${id}`);
    const data = await r.json();
    const res = data && data.result;
    if (!res || (data.status && data.status !== 'SUCCESS' && !res.areaAcres && !res.maxDepthFeet)) return null;

    // Water clarity: prefer the average; fall back to the latest Secchi reading.
    let clarity = num(res.averageWaterClarity);
    if (clarity === null && Array.isArray(res.waterClarity) && res.waterClarity.length) {
        clarity = num(res.waterClarity[0] && res.waterClarity[0][1]);
    }

    // Fish species: scan EVERY survey (most have empty catch summaries; the fish
    // data lives in whichever survey actually netted fish) and collect distinct
    // codes, mapped to friendly names.
    const codes = new Set();
    for (const s of (Array.isArray(res.surveys) ? res.surveys : [])) {
        for (const f of (Array.isArray(s.fishCatchSummaries) ? s.fishCatchSummaries : [])) {
            if (f && f.species) codes.add(String(f.species).toUpperCase());
        }
    }
    const fish = [...codes].map(c => SPECIES[c]).filter(Boolean);
    // Stable, useful ordering: game fish first, then the rest alphabetically.
    const PRIORITY = ['Walleye', 'Northern Pike', 'Largemouth Bass', 'Smallmouth Bass', 'Muskellunge', 'Black Crappie', 'Bluegill', 'Yellow Perch'];
    fish.sort((a, b) => {
        const ia = PRIORITY.indexOf(a), ib = PRIORITY.indexOf(b);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.localeCompare(b);
    });

    const accesses = Array.isArray(res.accesses) ? res.accesses.length : null;

    return {
        max_depth_ft:     int(res.maxDepthFeet),
        mean_depth_ft:    int(res.meanDepthFeet),
        surface_acres:    int(res.areaAcres),
        littoral_acres:   int(res.littoralAcres),
        water_clarity_ft: clarity === null ? null : Math.round(clarity * 10) / 10,
        shoreline_miles:  num(res.shoreLengthMiles) === null ? null : Math.round(num(res.shoreLengthMiles) * 10) / 10,
        public_accesses:  accesses,
        fish_species:     fish.length ? fish : null,
        dnr_survey_url:   `https://www.dnr.state.mn.us/lakefind/showreport.html?downum=${encodeURIComponent(id)}`,
    };
}

// Enrich a single lake row (must have a dow_number). Returns the stored fields
// or null if nothing came back. Best-effort — throws are the caller's to handle.
async function enrichLake(lake) {
    const facts = await fetchLakeSurvey(lake.dow_number);
    if (!facts) return null;
    await pool.query(
        `UPDATE lakes SET
            max_depth_ft = $2, mean_depth_ft = $3, surface_acres = $4, littoral_acres = $5,
            water_clarity_ft = $6, shoreline_miles = $7, public_accesses = $8,
            fish_species = $9, dnr_survey_url = $10, dnr_data_at = NOW()
          WHERE id = $1`,
        [lake.id, facts.max_depth_ft, facts.mean_depth_ft, facts.surface_acres, facts.littoral_acres,
         facts.water_clarity_ft, facts.shoreline_miles, facts.public_accesses,
         facts.fish_species ? JSON.stringify(facts.fish_species) : null, facts.dnr_survey_url]);
    return facts;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Batch-enrich lakes that have a DOW number and are missing/stale data.
// Throttled to ~1 req/sec to be a good citizen of state infrastructure.
// opts.force re-pulls even fresh lakes; opts.staleDays sets the refresh window.
async function enrichAllLakes(opts = {}) {
    const staleDays = opts.staleDays || 30;
    const { rows } = await pool.query(
        `SELECT id, dow_number FROM lakes
          WHERE dow_number IS NOT NULL AND dow_number <> ''
            AND ($1 = true OR dnr_data_at IS NULL OR dnr_data_at < NOW() - ($2 || ' days')::interval)
          ORDER BY dnr_data_at ASC NULLS FIRST`,
        [!!opts.force, String(staleDays)]);
    let enriched = 0, empty = 0, failed = 0;
    for (const lake of rows) {
        try {
            const f = await enrichLake(lake);
            if (f) enriched++; else empty++;
        } catch (e) {
            failed++;
            console.warn(`[dnr] DOW ${lake.dow_number} failed:`, e.message);
        }
        await sleep(1100);   // ~1 req/sec
    }
    return { candidates: rows.length, enriched, empty, failed };
}

module.exports = { fetchLakeSurvey, enrichLake, enrichAllLakes, SPECIES };
