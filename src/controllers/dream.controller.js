// dream.controller.js — natural-language "describe your dream lake home" search.
// Parses a free-text description into structured filters (OpenAI when
// configured, heuristic fallback otherwise), returns matching listings, and
// gives the buyer a one-click "get matched with an agent" path.
const pool = require('../database/pool');

const LISTINGS_PUBLIC = process.env.LISTINGS_PUBLIC !== 'false';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const PROP_TYPES = ['Single Family', 'Condo', 'Townhouse', 'Cabin / Cottage', 'Land / Lot', 'Farm / Acreage', 'Multi-Family', 'Manufactured'];

let _openai = null;
function getClient() {
    if (_openai) return _openai;
    if (!process.env.OPENAI_API_KEY) return null;
    _openai = new (require('openai').OpenAI)({ apiKey: process.env.OPENAI_API_KEY });
    return _openai;
}

// Parse "$450k" / "$1.2m" / "450,000" → number.
function parseMoney(s) {
    if (!s) return null;
    const m = String(s).replace(/[, ]/g, '').match(/\$?(\d+(?:\.\d+)?)([km])?/i);
    if (!m) return null;
    let n = parseFloat(m[1]);
    if (/k/i.test(m[2] || '')) n *= 1000;
    else if (/m/i.test(m[2] || '')) n *= 1000000;
    return Math.round(n);
}

function heuristicParse(q) {
    const t = ' ' + q.toLowerCase() + ' ';
    const out = { min_price: null, max_price: null, min_beds: null, waterfront: null, property_type: null, place: null, keywords: null };
    const under = t.match(/(?:under|below|less than|up to|max(?:imum)?)\s*\$?([\d.,]+\s*[km]?)/i);
    if (under) out.max_price = parseMoney(under[1]);
    const over = t.match(/(?:over|above|at least|min(?:imum)?)\s*\$?([\d.,]+\s*[km]?)/i);
    if (over) out.min_price = parseMoney(over[1]);
    const beds = t.match(/(\d+)\s*(?:\+)?\s*(?:bed|bedroom|br|bd)\b/i);
    if (beds) out.min_beds = parseInt(beds[1], 10);
    if (/waterfront|lakefront|on the (?:lake|water)|water frontage|shoreline/i.test(t)) out.waterfront = true;
    if (/cabin|cottage/i.test(t)) out.property_type = 'Cabin / Cottage';
    else if (/condo/i.test(t)) out.property_type = 'Condo';
    else if (/townhouse|townhome/i.test(t)) out.property_type = 'Townhouse';
    else if (/\bland\b|\blot\b|acreage/i.test(t)) out.property_type = 'Land / Lot';
    const near = q.match(/\b(?:near|on|around|in)\s+((?:lake\s+)?[A-Z][a-zA-Z]+(?:\s+lake)?)/);
    if (near) out.place = near[1].trim();
    return out;
}

async function aiParse(q) {
    const client = getClient();
    if (!client) return null;
    try {
        const resp = await client.chat.completions.create({
            model: MODEL,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: `Extract Minnesota lake-home search filters from the buyer's description. Reply ONLY with JSON: {"min_price":number|null,"max_price":number|null,"min_beds":number|null,"waterfront":true|false|null,"property_type":one of ${JSON.stringify(PROP_TYPES)} or null,"place":"a lake/town/region name or null","keywords":"short free-text or null"}. Prices in whole dollars.` },
                { role: 'user', content: String(q).slice(0, 500) },
            ],
        });
        const parsed = JSON.parse(resp.choices[0].message.content);
        if (parsed.property_type && !PROP_TYPES.includes(parsed.property_type)) parsed.property_type = null;
        return parsed;
    } catch (e) { console.warn('[dream.aiParse]', e.message); return null; }
}

// POST /api/dream/search { query } — admin-only (AI usage kept off public surfaces).
exports.search = async (req, res) => {
    if (!['admin', 'super_admin'].includes(req.user?.role)) return res.status(403).json({ error: 'Admin only.' });
    if (!LISTINGS_PUBLIC) return res.json({ criteria: {}, listings: [] });
    const query = String(req.body?.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Describe the home you want.' });
    try {
        const ai = await aiParse(query);
        const heur = heuristicParse(query);
        // Merge: prefer AI, fall back to heuristic per field.
        const c = {
            min_price: ai?.min_price ?? heur.min_price,
            max_price: ai?.max_price ?? heur.max_price,
            min_beds: ai?.min_beds ?? heur.min_beds,
            waterfront: (ai?.waterfront ?? heur.waterfront) === true ? true : null,
            property_type: ai?.property_type ?? heur.property_type,
            place: (ai?.place || heur.place || '').toString().trim() || null,
        };
        const where = [`status = 'active'`];
        const params = [];
        if (c.max_price) { params.push(c.max_price); where.push(`price <= $${params.length}`); }
        if (c.min_price) { params.push(c.min_price); where.push(`price >= $${params.length}`); }
        if (c.min_beds) { params.push(c.min_beds); where.push(`beds >= $${params.length}`); }
        if (c.waterfront === true) where.push(`waterfront = TRUE`);
        if (c.property_type) { params.push(c.property_type); where.push(`property_type = $${params.length}`); }
        if (c.place) { params.push('%' + c.place.replace(/^lake\s+/i, '').replace(/\s+lake$/i, '') + '%'); const i = params.length; where.push(`(title ILIKE $${i} OR city ILIKE $${i} OR water_body ILIKE $${i} OR address ILIKE $${i})`); }

        const { rows } = await pool.query(
            `SELECT id, slug, title, price, city, beds, baths, sqft, featured_image_url, water_body,
                    (boosted_until > NOW()) AS boosted
               FROM listings WHERE ${where.join(' AND ')}
              ORDER BY (boosted_until > NOW()) DESC, created_at DESC LIMIT 24`, params);
        res.json({ criteria: c, count: rows.length, listings: rows });
    } catch (e) { console.error('[dream.search]', e.message); res.status(500).json({ error: 'Search failed. Please try again.' }); }
};
