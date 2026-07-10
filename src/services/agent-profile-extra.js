// Rich, agent-editable profile sections stored in agents.profile_extra (JSONB).
// Everything here is agent-authored, so it is strictly sanitized: known keys
// only, lengths capped, arrays capped, and empty entries dropped. An empty
// section is simply omitted, so the public profile renders only what's filled.
//
// Phase 1 sections: stats ("By the numbers"), services_buyer / services_seller
// ("Services offered"), how_i_work, credentials + awards ("Credentials &
// recognition"). Keys are STABLE — renaming one orphans stored data.

const str = (v, max) => String(v ?? '').trim().slice(0, max);

// Cap how many entries a list section can hold, so one agent can't bloat a row.
const CAPS = { services: 12, steps: 10, credentials: 16, awards: 20 };

function cleanList(arr, max, mapper) {
    if (!Array.isArray(arr)) return [];
    return arr.map(mapper).filter(Boolean).slice(0, max);
}

function cleanProfileExtra(input) {
    const inp = (input && typeof input === 'object') ? input : {};
    const out = {};

    // ── By the numbers: four free-text stats (kept as strings so an agent can
    //    write "$96M" or "99.2%" without us guessing formats). ──
    if (inp.stats && typeof inp.stats === 'object') {
        const s = {};
        for (const k of ['homes_sold', 'total_volume', 'avg_days', 'sale_to_list']) {
            const v = str(inp.stats[k], 24);
            if (v) s[k] = v;
        }
        if (Object.keys(s).length) out.stats = s;
    }

    // ── Services offered: two plain string lists. ──
    const svcB = cleanList(inp.services_buyer,  CAPS.services, v => str(v, 80) || null);
    const svcS = cleanList(inp.services_seller, CAPS.services, v => str(v, 80) || null);
    if (svcB.length) out.services_buyer  = svcB;
    if (svcS.length) out.services_seller = svcS;

    // ── How I work: ordered {title, body} steps. Drop a step with no title. ──
    const steps = cleanList(inp.how_i_work, CAPS.steps, (row) => {
        if (!row || typeof row !== 'object') return null;
        const title = str(row.title, 90);
        if (!title) return null;
        return { title, body: str(row.body, 600) };
    });
    if (steps.length) out.how_i_work = steps;

    // ── Credentials & recognition ──
    const creds = cleanList(inp.credentials, CAPS.credentials, v => str(v, 120) || null);
    if (creds.length) out.credentials = creds;

    const awards = cleanList(inp.awards, CAPS.awards, (row) => {
        if (!row || typeof row !== 'object') return null;
        const title = str(row.title, 120);
        if (!title) return null;
        return { year: str(row.year, 8), title, org: str(row.org, 120) };
    });
    if (awards.length) out.awards = awards;

    return out;
}

// True when there's at least one populated section (controls whether the
// public profile shows any of this at all).
function hasAnyExtra(extra) {
    return !!(extra && typeof extra === 'object' && Object.keys(cleanProfileExtra(extra)).length);
}

module.exports = { cleanProfileExtra, hasAnyExtra };
