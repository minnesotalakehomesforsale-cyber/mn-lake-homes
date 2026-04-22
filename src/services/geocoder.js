/**
 * geocoder.js — Thin wrapper around Google's Geocoding API.
 *
 * Key selection: prefers GOOGLE_SERVER_KEY (a backend-only key that is
 * either IP-restricted to Render or unrestricted, and scoped to just
 * the Geocoding API). Falls back to GOOGLE_PLACES_API_KEY for
 * backwards compat with single-key setups. The two-key split matters
 * because the *frontend* key usually has HTTP-referrer restrictions
 * that Google rejects on server-to-server calls:
 *
 *     "API keys with referer restrictions cannot be used with this API."
 *
 * Results are cached in-process so repeat geocodes of the same address
 * don't burn quota — especially useful during tag admin work where a
 * single admin may save the same city several times.
 *
 * Philosophy: NEVER throw. If the API fails, return null — callers are
 * expected to degrade gracefully (tag saves with null coords and an
 * admin warning; lead match still works if the submitted point is
 * provided directly as lat/lng).
 */

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h — city centroids don't move
const MAX_CACHE = 2000;

const _cache = new Map(); // key → { lat, lng, placeId, ts }

function _keyFor(address) {
    return (address || '').trim().toLowerCase();
}

function _touch(key, value) {
    // Simple LRU-ish trim — delete oldest when oversized.
    if (_cache.size >= MAX_CACHE) {
        const firstKey = _cache.keys().next().value;
        if (firstKey) _cache.delete(firstKey);
    }
    _cache.set(key, { ...value, ts: Date.now() });
}

/**
 * geocodeAddress(address) → { lat, lng, placeId, formattedAddress } | null
 */
async function geocodeAddress(address) {
    const key = _keyFor(address);
    if (!key) return null;

    const cached = _cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return { lat: cached.lat, lng: cached.lng, placeId: cached.placeId, formattedAddress: cached.formattedAddress };
    }

    // Prefer the server-only key if present; fall back to the shared
    // frontend key for backwards compat. Setting GOOGLE_SERVER_KEY in
    // Render lets you keep the frontend key referer-locked without
    // breaking server-side geocoding.
    const apiKey = process.env.GOOGLE_SERVER_KEY || process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        console.warn('[geocoder] GOOGLE_SERVER_KEY and GOOGLE_PLACES_API_KEY both missing — geocoding disabled');
        return null;
    }

    try {
        const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url);
        if (!res.ok) {
            console.warn(`[geocoder] HTTP ${res.status} for "${address}"`);
            return null;
        }
        const data = await res.json();
        if (data.status !== 'OK' || !data.results?.length) {
            console.warn(`[geocoder] status=${data.status} for "${address}"`);
            return null;
        }
        const r = data.results[0];
        const out = {
            lat: r.geometry?.location?.lat ?? null,
            lng: r.geometry?.location?.lng ?? null,
            placeId: r.place_id || null,
            formattedAddress: r.formatted_address || address,
        };
        if (out.lat == null || out.lng == null) return null;
        _touch(key, out);
        return out;
    } catch (err) {
        console.warn('[geocoder] fetch failed:', err.message);
        return null;
    }
}

module.exports = { geocodeAddress };
