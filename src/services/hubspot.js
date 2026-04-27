/**
 * hubspot.js — One-way contact sync (backend → HubSpot)
 *
 * The internal Postgres DB stays the source of truth for everything the app
 * reads/writes (auth, subscriptions, leads, listings). HubSpot is a mirror
 * used purely for marketing/sales outreach: newsletters, sequences, sales
 * pipeline. Activity (opens, replies, etc.) lives in HubSpot — we don't
 * pull it back, we just deep-link to the contact's HubSpot timeline from
 * the admin UI.
 *
 * Env:
 *   HUBSPOT_ACCESS_TOKEN   — Private App access token (pat-na2-...)
 *   HUBSPOT_PORTAL_ID      — numeric account ID, used to build the
 *                            "View in HubSpot" deep link in admin UI
 *   HUBSPOT_REGION         — defaults to 'na2'; switches the app subdomain
 *                            for the deep link (e.g. app-na2.hubspot.com)
 *   HUBSPOT_ENABLE_SYNC    — 'false' to disable all outbound calls without
 *                            redeploying (e.g. during incident response)
 *
 * Public surface:
 *   syncContact({ email, ... })  — upsert by email, returns { id } or null
 *   updateContact(id, props)     — patch existing record by HubSpot id
 *   getPortalContactUrl(id)      — deep link for admin "View in HubSpot"
 *   isConfigured()               — true if token + portal id are present
 *   ping()                       — round-trip API check for /_diagnostic
 *
 * Fire-and-forget: every public function is async but never throws. Sync
 * failures are logged and swallowed so a flaky HubSpot can't break signup
 * or contact-form responses. Mirrors the email.js convention.
 */

const TOKEN     = process.env.HUBSPOT_ACCESS_TOKEN || '';
const PORTAL_ID = process.env.HUBSPOT_PORTAL_ID || '';
const REGION    = (process.env.HUBSPOT_REGION || 'na2').toLowerCase();
const ENABLED   = (process.env.HUBSPOT_ENABLE_SYNC || 'true').toLowerCase() !== 'false';

const API_BASE = 'https://api.hubapi.com';

function isConfigured() {
    return Boolean(TOKEN && PORTAL_ID);
}

function logSkip(reason) {
    console.log(`[hubspot] skipped — ${reason}`);
}

// Sweep undefined/null/empty values out of the property bag — HubSpot will
// happily overwrite a real value with an empty string otherwise.
function cleanProps(props) {
    const out = {};
    for (const [k, v] of Object.entries(props || {})) {
        if (v === undefined || v === null) continue;
        if (typeof v === 'string' && v.trim() === '') continue;
        out[k] = typeof v === 'string' ? v.trim() : v;
    }
    return out;
}

async function hsFetch(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type':  'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { /* leave as text */ }
    if (!res.ok) {
        const msg = data?.message || text || `HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.body = data;
        throw err;
    }
    return data;
}

/**
 * Upsert a contact by email. HubSpot's v3 API doesn't have a native upsert
 * for contacts, so we POST first and on 409 (conflict — already exists)
 * fall back to a PATCH-by-email. Returns { id } on success, null on
 * skip/failure.
 *
 * `payload` is the same property bag accepted by HubSpot's v3 contacts
 * endpoint. `email` is required — it's the canonical identifier.
 */
async function syncContact(payload) {
    if (!ENABLED)        { logSkip('HUBSPOT_ENABLE_SYNC=false'); return null; }
    if (!isConfigured()) { logSkip('HUBSPOT_ACCESS_TOKEN/PORTAL_ID not set'); return null; }

    const props = cleanProps(payload);
    const email = (props.email || '').toLowerCase();
    if (!email) { logSkip('no email'); return null; }
    props.email = email;

    try {
        const created = await hsFetch('/crm/v3/objects/contacts', {
            method: 'POST',
            body: { properties: props },
        });
        console.log(`[hubspot] created contact ${created.id} · ${email}`);
        return { id: created.id };
    } catch (err) {
        // 409 = contact already exists. Patch by email identifier instead.
        if (err.status === 409) {
            try {
                const updated = await hsFetch(
                    `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
                    { method: 'PATCH', body: { properties: props } }
                );
                console.log(`[hubspot] updated contact ${updated.id} · ${email}`);
                return { id: updated.id };
            } catch (patchErr) {
                console.error(`[hubspot] FAILED patch · ${email}:`, patchErr.message);
                return null;
            }
        }
        console.error(`[hubspot] FAILED create · ${email}:`, err.message);
        return null;
    }
}

/**
 * Patch an existing contact by HubSpot id. Use when we already have the
 * id stored locally and don't want to round-trip through email lookup.
 */
async function updateContact(hsContactId, props) {
    if (!ENABLED)        { logSkip('HUBSPOT_ENABLE_SYNC=false'); return null; }
    if (!isConfigured()) { logSkip('HUBSPOT_ACCESS_TOKEN/PORTAL_ID not set'); return null; }
    if (!hsContactId)    { logSkip('no hs_contact_id'); return null; }

    const cleaned = cleanProps(props);
    if (!Object.keys(cleaned).length) return { id: hsContactId, unchanged: true };

    try {
        const updated = await hsFetch(`/crm/v3/objects/contacts/${hsContactId}`, {
            method: 'PATCH',
            body: { properties: cleaned },
        });
        console.log(`[hubspot] patched contact ${updated.id}`);
        return { id: updated.id };
    } catch (err) {
        console.error(`[hubspot] FAILED patch ${hsContactId}:`, err.message);
        return null;
    }
}

/**
 * Build a deep link to a specific contact's HubSpot timeline. Honors
 * HUBSPOT_REGION so na2/eu1/etc. accounts don't end up on the wrong
 * subdomain (which 404s instead of redirecting).
 */
function getPortalContactUrl(hsContactId) {
    if (!PORTAL_ID || !hsContactId) return null;
    const sub = REGION && REGION !== 'na1' ? `app-${REGION}` : 'app';
    return `https://${sub}.hubspot.com/contacts/${PORTAL_ID}/contact/${hsContactId}`;
}

/**
 * Cheap round-trip used by /api/_diagnostic. Lists 1 contact — confirms
 * the token, scopes, and network path all work without creating data.
 */
async function ping() {
    if (!isConfigured()) return { ok: false, reason: 'not_configured' };
    try {
        await hsFetch('/crm/v3/objects/contacts?limit=1');
        return { ok: true };
    } catch (err) {
        return { ok: false, reason: err.message, status: err.status };
    }
}

if (!isConfigured()) {
    console.warn('[hubspot] not configured — sync disabled (set HUBSPOT_ACCESS_TOKEN + HUBSPOT_PORTAL_ID)');
} else if (!ENABLED) {
    console.warn('[hubspot] HUBSPOT_ENABLE_SYNC=false — sync disabled');
} else {
    console.log(`[hubspot] sync enabled · portal=${PORTAL_ID} · region=${REGION}`);
}

module.exports = {
    syncContact,
    updateContact,
    getPortalContactUrl,
    isConfigured,
    ping,
};
