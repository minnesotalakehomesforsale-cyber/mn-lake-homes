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

/**
 * Public API — lookupProperty(formattedAddress)
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

    const url = `${API_BASE}/properties?address=${encodeURIComponent(formattedAddress)}`;

    try {
        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Api-Key': apiKey,
            },
        });

        if (!resp.ok) {
            console.error(`[cash-offer] RentCast HTTP ${resp.status} for "${formattedAddress}"`);
            return { propertyData: null, confidence: 'low' };
        }

        const payload = await resp.json();

        // RentCast returns an array; grab the best match (first element).
        const first = Array.isArray(payload) ? payload[0] : payload;
        if (!first) return { propertyData: null, confidence: 'low' };

        const record = normalizeRecord(first);
        const confidence = classifyConfidence(record);

        if (confidence === 'low') {
            return { propertyData: null, confidence: 'low' };
        }

        return { propertyData: record, confidence };
    } catch (err) {
        console.error('[cash-offer] RentCast lookup failed:', err.message);
        return { propertyData: null, confidence: 'low' };
    }
}

module.exports = { lookupProperty };
