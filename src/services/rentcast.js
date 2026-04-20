/**
 * rentcast.js — RentCast property lookup service
 *
 * Used by the AI-powered Cash Offer feature to pull baseline property facts
 * (beds, baths, sqft, year built, lot size, last sale, AVM) for a given
 * address before the user ever sees the offer screen.
 *
 * Endpoint:   GET https://api.rentcast.io/v1/properties?address=...
 * Auth:       X-Api-Key: <RENTCAST_API_KEY>
 *
 * Philosophy: this is a BEST-EFFORT enrichment step. If RentCast fails,
 * returns nothing, or returns low-confidence data, we surface that to the
 * caller and let the frontend fall back to manual entry. We NEVER throw —
 * the cash-offer flow must keep working even when RentCast is unavailable.
 */

const API_BASE = 'https://api.rentcast.io/v1';

/**
 * Attempt to extract a normalized property record from a RentCast payload.
 * RentCast returns an array; we take the first row and map its fields.
 */
function normalizeRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;

    // Numeric coercion helper — returns null if blank/undefined/NaN
    const num = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };

    const beds       = num(raw.bedrooms);
    const baths      = num(raw.bathrooms);
    const sqft       = num(raw.squareFootage);
    const yearBuilt  = num(raw.yearBuilt);
    const lotSize    = num(raw.lotSize);

    // AVM — RentCast may return it as `price`, `value`, or inside `priceEstimate`
    const avm = num(
        raw.price ??
        raw.value ??
        raw.avm ??
        raw.priceEstimate?.price ??
        raw.priceEstimate?.value ??
        null
    );

    // Last sale — `lastSaleDate` and `lastSalePrice` are typical
    const lastSaleDate  = raw.lastSaleDate || raw.saleDate || null;
    const lastSalePrice = num(raw.lastSalePrice || raw.salePrice);

    return {
        beds,
        baths,
        sqft,
        yearBuilt,
        lotSize,
        lastSaleDate,
        lastSalePrice,
        avm,
    };
}

/**
 * Classify confidence based on how complete the normalized record is and
 * whether we got a usable AVM.
 */
function classifyConfidence(record) {
    if (!record) return 'low';
    const coreFields = [record.beds, record.baths, record.sqft, record.yearBuilt];
    const present = coreFields.filter(v => v !== null && v !== undefined).length;

    if (record.avm && present >= 3) return 'high';
    if (record.avm && present >= 2) return 'medium';
    if (present >= 2) return 'medium';
    return 'low';
}

// Fetch helper — swallows network errors, returns parsed JSON or null.
async function rcFetch(path, apiKey) {
    try {
        const resp = await fetch(`${API_BASE}${path}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'X-Api-Key': apiKey },
        });
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            console.error(`[cash-offer] RentCast HTTP ${resp.status} ${path} — ${body.slice(0, 200)}`);
            return null;
        }
        return await resp.json();
    } catch (err) {
        console.error(`[cash-offer] RentCast fetch ${path} failed:`, err.message);
        return null;
    }
}

/**
 * Public API — lookupProperty(formattedAddress)
 *
 * Calls BOTH `/properties` (facts: beds/baths/sqft/yearBuilt/lotSize/lastSale)
 * AND `/avm/value` (the actual AVM). RentCast's `/properties` endpoint does
 * not return an AVM, so we must hit both and merge the results.
 *
 * @param {string} formattedAddress — full street address from Google Places
 * @returns {Promise<{ propertyData: Object|null, confidence: 'high'|'medium'|'low' }>}
 */
async function lookupProperty(formattedAddress) {
    const apiKey = process.env.RENTCAST_API_KEY;
    if (!apiKey) {
        console.error('[cash-offer] RENTCAST_API_KEY missing — skipping lookup');
        return { propertyData: null, confidence: 'low' };
    }
    if (!formattedAddress || typeof formattedAddress !== 'string') {
        return { propertyData: null, confidence: 'low' };
    }

    const addr = encodeURIComponent(formattedAddress);

    // Fire both requests in parallel — AVM endpoint does NOT return facts,
    // facts endpoint does NOT return AVM, so we need both.
    const [propsPayload, avmPayload] = await Promise.all([
        rcFetch(`/properties?address=${addr}`, apiKey),
        rcFetch(`/avm/value?address=${addr}`, apiKey),
    ]);

    // Properties endpoint returns an array; grab the first match.
    const propsFirst = Array.isArray(propsPayload) ? propsPayload[0] : propsPayload;
    const record = normalizeRecord(propsFirst) || {
        beds: null, baths: null, sqft: null, yearBuilt: null, lotSize: null,
        lastSaleDate: null, lastSalePrice: null, avm: null,
    };

    // Overlay the AVM from the dedicated AVM endpoint if present.
    // RentCast returns { price, priceRangeLow, priceRangeHigh, ... }.
    const num = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    const avmFromEndpoint = num(avmPayload?.price ?? avmPayload?.value);
    if (avmFromEndpoint) {
        record.avm = avmFromEndpoint;
    }

    const confidence = classifyConfidence(record);
    if (!record.avm && confidence === 'low') {
        return { propertyData: null, confidence: 'low' };
    }

    return { propertyData: record, confidence };
}

module.exports = { lookupProperty };
