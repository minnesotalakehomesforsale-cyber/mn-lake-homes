/**
 * places-autocomplete.js — Single-function Google Places helper.
 *
 *   <script src="/components/places-autocomplete.js" defer></script>
 *
 *   attachPlacesAutocomplete(addressInput, {
 *       onPlace({ address, city, state, zip, lat, lng, formatted, placeId }) { … },
 *   });
 *
 * Handles the Maps-JS loader, attaches google.maps.places.Autocomplete,
 * parses address_components into flat fields, and invokes the caller's
 * onPlace handler. Loader is idempotent — multiple calls on the same
 * page only add the script tag once. Degrades silently if the API key
 * or network is unavailable; typing still saves, the server falls back
 * to its own geocodeAddress() pass on PATCH.
 */

(function () {
    // ── Loader state: promise so concurrent callers all await the
    //                  same single load attempt. ─────────────────────
    let _loaderPromise = null;

    function loadGoogleMaps() {
        if (_loaderPromise) return _loaderPromise;

        if (window.google && window.google.maps && window.google.maps.places) {
            _loaderPromise = Promise.resolve(true);
            return _loaderPromise;
        }

        _loaderPromise = (async () => {
            try {
                const cfgRes = await fetch('/api/config/public');
                if (!cfgRes.ok) return false;
                const cfg = await cfgRes.json();
                const key = cfg.googlePlacesKey;
                if (!key) return false;

                await new Promise((resolve, reject) => {
                    const cbName = `_placesReady_${Math.random().toString(36).slice(2)}`;
                    window[cbName] = () => { delete window[cbName]; resolve(true); };
                    const s = document.createElement('script');
                    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&callback=${cbName}`;
                    s.defer = true;
                    s.onerror = () => { delete window[cbName]; reject(new Error('Google Maps script failed')); };
                    document.head.appendChild(s);
                });
                return !!(window.google && window.google.maps && window.google.maps.places);
            } catch (err) {
                console.warn('[places-autocomplete] disabled:', err.message);
                return false;
            }
        })();

        return _loaderPromise;
    }

    // Google's address_components is an array of { long_name, short_name, types: [...] }.
    // Flatten into the tidy { street, city, state, zip } shape callers need.
    function parsePlace(place) {
        const comps = place?.address_components || [];
        const get = (type, useShort = false) => {
            const c = comps.find(c => c.types.includes(type));
            if (!c) return '';
            return useShort ? c.short_name : c.long_name;
        };
        const streetNumber = get('street_number');
        const route        = get('route');
        const street       = [streetNumber, route].filter(Boolean).join(' ');
        // "locality" is a real city. Fall back to sublocality / admin_level_3
        // for unincorporated areas (common around MN lakes).
        const city = get('locality') || get('sublocality') || get('administrative_area_level_3');
        return {
            address:  street || place?.name || '',
            city,
            state:    get('administrative_area_level_1', true),
            zip:      get('postal_code'),
            lat:      place?.geometry?.location?.lat?.() ?? null,
            lng:      place?.geometry?.location?.lng?.() ?? null,
            formatted: place?.formatted_address || '',
            placeId:   place?.place_id || null,
        };
    }

    /**
     * Attach Places Autocomplete to an input. Returns a cleanup function
     * that detaches the listener (for single-page-app-style unmounts;
     * the admin modal uses single-use so this is rarely needed).
     */
    async function attachPlacesAutocomplete(input, opts = {}) {
        if (!input) return () => {};
        const onPlace = typeof opts.onPlace === 'function' ? opts.onPlace : () => {};
        const country = opts.country || 'us';

        // Press-Enter-in-autocomplete normally submits the parent form.
        // Swallow it while the dropdown is open so selecting a suggestion
        // with Enter works as expected.
        input.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });

        const ok = await loadGoogleMaps();
        if (!ok) return () => {};

        const ac = new google.maps.places.Autocomplete(input, {
            types: ['address'],
            componentRestrictions: { country },
            fields: ['place_id', 'formatted_address', 'address_components', 'geometry', 'name'],
        });
        const listener = ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            if (!place || !place.address_components) return;
            onPlace(parsePlace(place));
        });

        return () => { try { google.maps.event.removeListener(listener); } catch (_) {} };
    }

    // Expose on window so any admin/owner page can call it after loading
    // the script (no module system here).
    window.attachPlacesAutocomplete = attachPlacesAutocomplete;
})();
