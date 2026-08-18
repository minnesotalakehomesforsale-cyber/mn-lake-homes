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
        // Log the full response body so 400s from missing custom properties,
        // schema mismatches, etc. are debuggable in Render logs.
        console.error(`[hubspot] HTTP ${res.status} ${method} ${path} ::`, text.slice(0, 500));
        const msg = data?.message || text || `HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.body = data;
        throw err;
    }
    return data;
}

// HubSpot rejects POSTs with unknown property names. Restrict every sync
// to standard built-in contact fields so the integration works without
// requiring custom properties to be provisioned in the user's HubSpot
// account first. If/when the user adds custom properties (user_type,
// signup_source, etc.) they can be re-enabled here.
const BUILTIN_PROPS = [
    'email', 'firstname', 'lastname', 'phone', 'company',
    'city', 'state', 'zip', 'address', 'website',
    'jobtitle', 'lifecyclestage',
];
// The B1 lead-qualification properties (provisioned via ensureSchema). Safe to
// send: syncContact retries built-in-only if HubSpot rejects an unknown prop,
// so forms never break even if the schema hasn't been provisioned yet.
const QUAL_PROPS = ['target_lake', 'intent_type', 'price_band', 'lead_source_detail_v2', 'lead_grade', 'unqualified_reason'];
// DEV-01 attribution props (first-touch UTM + landing context). gclid/fbclid map
// to HubSpot's built-in hs_google_click_id / hs_facebook_click_id (see remap in syncContact).
const ATTR_PROPS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'landing_page', 'landing_page_lake', 'landing_page_town', 'referrer', 'hs_google_click_id', 'hs_facebook_click_id'];
// Billing state mirrored from Stripe (T074 / A2).
const BILLING_PROPS = ['subscription_status', 'churned_at', 'lifecycle_state'];
const ALLOWED_PROPS = new Set([...BUILTIN_PROPS, ...QUAL_PROPS, ...ATTR_PROPS, ...BILLING_PROPS]);

function whitelistProps(props, allowed = ALLOWED_PROPS) {
    const out = {};
    for (const [k, v] of Object.entries(props || {})) {
        if (allowed.has(k)) out[k] = v;
    }
    return out;
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

    const cleaned = cleanProps(payload);
    // Map raw ad-click IDs onto HubSpot's built-in properties (its Google/Meta
    // ad integrations read these) rather than custom gclid/fbclid props.
    if (cleaned.gclid)  cleaned.hs_google_click_id   = cleaned.gclid;
    if (cleaned.fbclid) cleaned.hs_facebook_click_id = cleaned.fbclid;
    delete cleaned.gclid; delete cleaned.fbclid;
    const props = whitelistProps(cleaned);
    const email = ((payload?.email) || '').toLowerCase();
    if (!email) { logSkip('no email'); return null; }
    props.email = email;
    // Cross-reference our lead UUID onto the HubSpot contact (T017) — sent ONLY
    // when the custom property has been provisioned and named here, so we never
    // break a sync by POSTing a property HubSpot doesn't recognize. To enable:
    // create a single-line-text contact property in HubSpot, then set
    // HUBSPOT_LEAD_ID_PROPERTY to its internal name (e.g. "lead_id").
    const leadIdProp = process.env.HUBSPOT_LEAD_ID_PROPERTY;
    if (leadIdProp && payload?.lead_id) props[leadIdProp] = String(payload.lead_id);

    // POST (create), falling back to PATCH-by-email on 409 (already exists).
    async function upsert(propsBag) {
        try {
            const created = await hsFetch('/crm/v3/objects/contacts', { method: 'POST', body: { properties: propsBag } });
            console.log(`[hubspot] created contact ${created.id} · ${email}`);
            return { id: created.id };
        } catch (err) {
            if (err.status === 409) {
                const updated = await hsFetch(
                    `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
                    { method: 'PATCH', body: { properties: propsBag } });
                console.log(`[hubspot] updated contact ${updated.id} · ${email}`);
                return { id: updated.id };
            }
            throw err;
        }
    }

    try {
        return await upsert(props);
    } catch (err) {
        // 400 = HubSpot rejected a property (e.g. a custom prop not yet
        // provisioned). Never lose the contact over it: retry with built-in
        // fields only so the sync still succeeds.
        if (err.status === 400) {
            const hadCustom = Object.keys(props).some(k => !BUILTIN_PROPS.includes(k));
            if (hadCustom) {
                console.warn(`[hubspot] 400 with custom props · ${email} — retrying built-in only:`, err.message);
                try {
                    const builtin = whitelistProps(props, new Set([...BUILTIN_PROPS, 'email']));
                    builtin.email = email;
                    return await upsert(builtin);
                } catch (retryErr) {
                    console.error(`[hubspot] FAILED built-in retry · ${email}:`, retryErr.message);
                    return null;
                }
            }
        }
        console.error(`[hubspot] FAILED upsert · ${email}:`, err.message);
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

    const cleaned = whitelistProps(cleanProps(props));
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
 * Mark a HubSpot contact as a Customer (lifecyclestage = "customer").
 * Used on first successful Stripe charge so paying agents/businesses stop
 * showing as Leads in the pipeline.
 *
 * HubSpot's lifecyclestage is one-way by default — once advanced it can't
 * be downgraded via the API (HubSpot's workflow rules re-promote it on
 * the next contact update). That's the right behavior for us: cancellation
 * doesn't reverse "they paid us". Reading the current value first so we
 * don't issue no-op patches for contacts that are already marked.
 */
async function markContactAsCustomer(hsContactId) {
    if (!ENABLED)        { logSkip('HUBSPOT_ENABLE_SYNC=false'); return null; }
    if (!isConfigured()) { logSkip('HUBSPOT_ACCESS_TOKEN/PORTAL_ID not set'); return null; }
    if (!hsContactId)    { logSkip('no hs_contact_id for customer flip'); return null; }

    try {
        // Cheap read first — avoid a PATCH when the contact is already a
        // customer (HubSpot still triggers workflow re-evaluation on no-op
        // patches, which is noisy if we do it on every renewal invoice).
        const cur = await hsFetch(`/crm/v3/objects/contacts/${hsContactId}?properties=lifecyclestage`);
        const stage = cur?.properties?.lifecyclestage || '';
        if (stage === 'customer' || stage === 'evangelist') {
            return { id: hsContactId, unchanged: true, stage };
        }
        const updated = await hsFetch(`/crm/v3/objects/contacts/${hsContactId}`, {
            method: 'PATCH',
            body: { properties: { lifecyclestage: 'customer' } },
        });
        console.log(`[hubspot] flipped contact ${updated.id} to customer (was ${stage || 'unset'})`);
        return { id: updated.id, fromStage: stage || null };
    } catch (err) {
        console.error(`[hubspot] FAILED customer flip ${hsContactId}:`, err.message);
        return null;
    }
}

/**
 * Mirror Stripe subscription state onto the HubSpot contact (T074) so the CRM
 * and billing never disagree about who's a paying / at-risk / lapsed customer.
 * Upserts by email and sets the `subscription_status` property. Unlike
 * lifecyclestage (which we never downgrade), this property moves both ways:
 * active → past_due → canceled → active. Fire-and-forget; no-ops when HubSpot
 * isn't configured or the property hasn't been provisioned yet.
 *
 * @param {string} email  contact email
 * @param {'active'|'past_due'|'canceled'|'none'} status
 */
async function syncSubscriptionStatus(email, status) {
    if (!ENABLED)        { logSkip('HUBSPOT_ENABLE_SYNC=false'); return null; }
    if (!isConfigured()) { logSkip('HUBSPOT_ACCESS_TOKEN/PORTAL_ID not set'); return null; }
    const addr = String(email || '').toLowerCase().trim();
    if (!addr)   { logSkip('no email for subscription_status'); return null; }
    const allowed = new Set(['active', 'past_due', 'canceled', 'none']);
    const val = allowed.has(status) ? status : 'none';
    // Reuse syncContact's upsert-by-email + graceful 400 fallback (which drops
    // the custom prop and retries built-in-only if the property is missing).
    return syncContact({ email: addr, subscription_status: val });
}

/**
 * markContactChurned(email) — A2. When a paying contact cancels, move their
 * lifecyclestage back to "lead" (so they leave the Customer segment and re-enter
 * nurture/win-back) and stamp `churned_at`. Stripe is the source of truth;
 * HubSpot only mirrors. Fire-and-forget.
 *
 * Note: HubSpot can block moving lifecyclestage *backwards* unless the portal's
 * "Set lifecycle stage backwards" setting is on. We clear it first, then set it,
 * which reliably reseats the stage via the API.
 */
async function markContactChurned(email) {
    if (!ENABLED)        { logSkip('HUBSPOT_ENABLE_SYNC=false'); return null; }
    if (!isConfigured()) { logSkip('HUBSPOT_ACCESS_TOKEN/PORTAL_ID not set'); return null; }
    const addr = String(email || '').toLowerCase().trim();
    if (!addr) return null;
    try {
        // Clear then set lifecyclestage so the backwards move sticks.
        await syncContact({ email: addr, lifecyclestage: '' });
        return await syncContact({ email: addr, lifecyclestage: 'lead', churned_at: Date.now(), subscription_status: 'canceled' });
    } catch (e) {
        console.warn('[hubspot.churned]', e.message);
        return null;
    }
}

/**
 * Create a Note engagement on a contact's timeline. Used to mirror admin
 * notes about an agent into HubSpot so they show up against the contact.
 * Fire-and-forget like the rest of this module — returns { id } on success,
 * null on skip/failure. associationTypeId 202 = Note → Contact (HubSpot
 * default).
 */
async function createContactNote(hsContactId, body) {
    if (!ENABLED)        { logSkip('HUBSPOT_ENABLE_SYNC=false'); return null; }
    if (!isConfigured()) { logSkip('HUBSPOT_ACCESS_TOKEN/PORTAL_ID not set'); return null; }
    if (!hsContactId)    { logSkip('no hs_contact_id for note'); return null; }
    const text = (body || '').trim();
    if (!text) return null;

    try {
        const note = await hsFetch('/crm/v3/objects/notes', {
            method: 'POST',
            body: {
                properties: { hs_note_body: text, hs_timestamp: Date.now() },
                associations: [{
                    to: { id: String(hsContactId) },
                    types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
                }],
            },
        });
        console.log(`[hubspot] created note ${note.id} on contact ${hsContactId}`);
        return { id: note.id };
    } catch (err) {
        console.error(`[hubspot] FAILED note on contact ${hsContactId}:`, err.message);
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
 * Backfill loop: sweep every users / leads / contact_inquiries row whose
 * hs_contact_id is still NULL and push them to HubSpot. Runs once on
 * server boot, after `ensureTables()`. Throttled to ~5 contacts/sec to
 * stay well under HubSpot's 100/10s rate limit.
 *
 * `pool` is passed in (rather than required at the top of this file) so
 * we don't introduce a circular dependency with database/pool.js.
 */
async function backfillExistingRecords(pool) {
    if (!ENABLED || !isConfigured()) return;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const tables = [
        {
            name: 'users',
            select: `SELECT id, email, first_name AS firstname, last_name AS lastname, phone
                       FROM users
                      WHERE hs_contact_id IS NULL AND email IS NOT NULL AND email <> ''
                        AND deleted_at IS NULL
                      LIMIT 500`,
        },
        {
            name: 'leads',
            // Leads store the full name in one column; split it cheaply.
            select: `SELECT id, email, full_name, phone, property_city AS city, property_state AS state
                       FROM leads
                      WHERE hs_contact_id IS NULL AND email IS NOT NULL AND email <> ''
                        AND deleted_at IS NULL
                      LIMIT 500`,
        },
        {
            name: 'contact_inquiries',
            select: `SELECT id, email, name, phone
                       FROM contact_inquiries
                      WHERE hs_contact_id IS NULL AND email IS NOT NULL AND email <> ''
                        AND deleted_at IS NULL
                      LIMIT 500`,
        },
        {
            // cash_offer_leads has no deleted_at column — it uses archived_at.
            // Skip archived so we don't push stale leads back into HubSpot.
            name: 'cash_offer_leads',
            select: `SELECT id, email, full_name, phone, address_raw AS address
                       FROM cash_offer_leads
                      WHERE hs_contact_id IS NULL AND email IS NOT NULL AND email <> ''
                        AND archived_at IS NULL
                      LIMIT 500`,
        },
    ];

    let totalSynced = 0;
    for (const t of tables) {
        let rows;
        try {
            ({ rows } = await pool.query(t.select));
        } catch (e) {
            console.warn(`[hubspot.backfill] skip ${t.name} — ${e.message}`);
            continue;
        }
        if (!rows.length) continue;
        console.log(`[hubspot.backfill] ${t.name}: ${rows.length} rows pending`);

        for (const row of rows) {
            const props = (() => {
                if (t.name === 'users') {
                    return { email: row.email, firstname: row.firstname, lastname: row.lastname, phone: row.phone };
                }
                if (t.name === 'leads') {
                    const [first, ...rest] = String(row.full_name || '').split(' ');
                    return {
                        email: row.email, firstname: first, lastname: rest.join(' '),
                        phone: row.phone, city: row.city, state: row.state,
                    };
                }
                if (t.name === 'cash_offer_leads') {
                    const [first, ...rest] = String(row.full_name || '').split(' ');
                    return {
                        email: row.email, firstname: first, lastname: rest.join(' '),
                        phone: row.phone, address: row.address || undefined,
                    };
                }
                // contact_inquiries
                const [first, ...rest] = String(row.name || '').split(' ');
                return { email: row.email, firstname: first, lastname: rest.join(' '), phone: row.phone };
            })();

            const r = await syncContact(props);
            if (r?.id) {
                try {
                    await pool.query(`UPDATE ${t.name} SET hs_contact_id = $1 WHERE id = $2`, [r.id, row.id]);
                    totalSynced++;
                } catch (e) {
                    console.error(`[hubspot.backfill] save id failed for ${t.name}.${row.id}:`, e.message);
                }
            }
            await sleep(200); // ~5 contacts/sec — well under HubSpot's 100/10s
        }
    }
    if (totalSynced) console.log(`[hubspot.backfill] complete · ${totalSynced} synced`);
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

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA PROVISIONING (B1 / B4 / T020 / T025)
// Idempotently create the contact properties, deal pipeline, and deal
// properties defined in src/data/hubspot-schema.js. Safe to re-run: existing
// objects are patched (missing enum options added), never duplicated.
// ─────────────────────────────────────────────────────────────────────────────

// Ensure a property GROUP exists (holds related properties together in the UI).
async function ensurePropertyGroup(objectType, group) {
    try {
        await hsFetch(`/crm/v3/properties/${objectType}/groups/${encodeURIComponent(group.name)}`);
        return { name: group.name, action: 'exists' };
    } catch (err) {
        if (err.status !== 404) throw err;
        await hsFetch(`/crm/v3/properties/${objectType}/groups`, {
            method: 'POST',
            body: { name: group.name, label: group.label, displayOrder: group.displayOrder || 0 },
        });
        return { name: group.name, action: 'created' };
    }
}

// Ensure a single property exists with (at least) the given enum options.
async function ensureProperty(objectType, def) {
    let existing = null;
    try {
        existing = await hsFetch(`/crm/v3/properties/${objectType}/${encodeURIComponent(def.name)}`);
    } catch (err) {
        if (err.status !== 404) throw err;
    }
    const body = {
        name: def.name, label: def.label, type: def.type, fieldType: def.fieldType,
        groupName: def.groupName,
        ...(def.options ? { options: def.options } : {}),
    };
    if (!existing) {
        await hsFetch(`/crm/v3/properties/${objectType}`, { method: 'POST', body });
        return { name: def.name, action: 'created' };
    }
    // Exists → for enumerations, union in any missing options (never remove).
    if (def.options) {
        const have = new Set((existing.options || []).map(o => o.value));
        const missing = def.options.filter(o => !have.has(o.value));
        if (missing.length) {
            const merged = [...(existing.options || []), ...missing];
            await hsFetch(`/crm/v3/properties/${objectType}/${encodeURIComponent(def.name)}`, {
                method: 'PATCH', body: { options: merged },
            });
            return { name: def.name, action: 'options_added', added: missing.map(o => o.value) };
        }
    }
    return { name: def.name, action: 'exists' };
}

// Ensure the Agent Acquisition deal pipeline exists with all 8 stages.
async function ensureDealPipeline(pipelineDef) {
    const all = await hsFetch('/crm/v3/pipelines/deals');
    let pipe = (all.results || []).find(p => p.label === pipelineDef.label);
    if (!pipe) {
        pipe = await hsFetch('/crm/v3/pipelines/deals', {
            method: 'POST',
            body: {
                label: pipelineDef.label,
                displayOrder: (all.results || []).length,
                stages: pipelineDef.stages.map(s => ({ label: s.label, displayOrder: s.displayOrder, metadata: s.metadata })),
            },
        });
        return { pipelineId: pipe.id, action: 'created', stages: pipe.stages.map(s => ({ id: s.id, label: s.label })) };
    }
    // Exists → add any stages missing by label (keeps existing stage ids stable).
    const haveLabels = new Set((pipe.stages || []).map(s => s.label));
    const added = [];
    for (const s of pipelineDef.stages) {
        if (!haveLabels.has(s.label)) {
            const created = await hsFetch(`/crm/v3/pipelines/deals/${pipe.id}/stages`, {
                method: 'POST', body: { label: s.label, displayOrder: s.displayOrder, metadata: s.metadata },
            });
            added.push(created.label);
        }
    }
    const fresh = await hsFetch(`/crm/v3/pipelines/deals/${pipe.id}`);
    return { pipelineId: pipe.id, action: added.length ? 'stages_added' : 'exists', added,
             stages: fresh.stages.map(s => ({ id: s.id, label: s.label })) };
}

// Provision the entire schema. Returns a structured report (safe to show admin).
// Each step is fault-tolerant: one failing property (e.g. a pre-existing prop of
// the wrong type that "cannot have options", or a name archived by HubSpot for
// 90 days after deletion) is recorded as an error and the run CONTINUES, so a
// bad contact property never blocks the deal pipeline + deal properties.
async function ensureSchema() {
    if (!isConfigured()) throw new Error('HubSpot not configured (HUBSPOT_ACCESS_TOKEN / HUBSPOT_PORTAL_ID).');
    const schema = require('../data/hubspot-schema');
    const report = { contact_group: null, contact_properties: [], deal_pipeline: null, deal_properties: [], errors: [] };

    const safe = async (label, fn) => {
        try { return await fn(); }
        catch (e) {
            console.error(`[hubspot.ensureSchema] ${label} failed:`, e.message);
            report.errors.push({ step: label, error: e.message });
            return { name: label.replace(/^(contact|deal):/, ''), action: 'error', error: e.message };
        }
    };

    report.contact_group = await safe('contact_group', () => ensurePropertyGroup('contacts', schema.CONTACT_PROPERTY_GROUP));
    for (const def of schema.CONTACT_PROPERTIES) {
        report.contact_properties.push(await safe(`contact:${def.name}`, () => ensureProperty('contacts', def)));
    }
    report.deal_pipeline = await safe('deal_pipeline', () => ensureDealPipeline(schema.DEAL_PIPELINE));
    for (const def of schema.DEAL_PROPERTIES) {
        report.deal_properties.push(await safe(`deal:${def.name}`, () => ensureProperty('deals', def)));
    }
    return report;
}

// ── Deal automation used by the Stripe webhook (B4 automation #2) ────────────
// Cache pipeline/stage id resolution (labels are stable in our schema).
let _acqPipelineCache = null;
async function resolveAcquisitionPipeline() {
    if (_acqPipelineCache) return _acqPipelineCache;
    const all = await hsFetch('/crm/v3/pipelines/deals');
    const pipe = (all.results || []).find(p => p.label === 'Agent Acquisition');
    if (!pipe) return null;
    const wonStage = (pipe.stages || []).find(s => s.label === 'Won–Paying');
    _acqPipelineCache = { pipelineId: pipe.id, wonStageId: wonStage ? wonStage.id : null };
    return _acqPipelineCache;
}

// Find a contact id by email (search API).
async function findContactIdByEmail(email) {
    const r = await hsFetch('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body: { filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: String(email).toLowerCase() }] }], properties: ['email'], limit: 1 },
    });
    return r.results && r.results[0] ? r.results[0].id : null;
}

/**
 * B4: a paying (Prime+) Stripe subscription flips the agent's Agent Acquisition
 * deal to Won–Paying. Finds the contact by email, moves their pipeline deal to
 * the Won stage (or creates one there, associated to the contact). Best-effort:
 * returns a small result object and never throws into the caller (the webhook).
 */
async function markAgentAcquisitionWon(email, opts = {}) {
    try {
        if (!isActiveFn()) return { ok: false, reason: 'not_active' };
        if (!email) return { ok: false, reason: 'no_email' };
        const pipe = await resolveAcquisitionPipeline();
        if (!pipe || !pipe.wonStageId) return { ok: false, reason: 'pipeline_missing' };

        const contactId = await findContactIdByEmail(email);
        const props = {};
        if (opts.tier) props.agent_tier_target = opts.tier;
        if (opts.targetLake) props.deal_target_lake = opts.targetLake;

        // Look for an existing deal on this contact already in our pipeline.
        let dealId = null;
        if (contactId) {
            try {
                const assoc = await hsFetch(`/crm/v3/objects/contacts/${contactId}/associations/deals`);
                for (const a of (assoc.results || [])) {
                    const d = await hsFetch(`/crm/v3/objects/deals/${a.id || a.toObjectId}?properties=pipeline,dealstage`);
                    if (d.properties && d.properties.pipeline === pipe.pipelineId) { dealId = d.id; break; }
                }
            } catch (e) { /* fall through to create */ }
        }

        if (dealId) {
            await hsFetch(`/crm/v3/objects/deals/${dealId}`, {
                method: 'PATCH', body: { properties: { pipeline: pipe.pipelineId, dealstage: pipe.wonStageId, ...props } },
            });
            return { ok: true, action: 'moved', dealId };
        }

        // No existing deal → create one already Won, associated to the contact.
        const body = {
            properties: {
                dealname: `${email} — paying agent`,
                pipeline: pipe.pipelineId, dealstage: pipe.wonStageId, ...props,
            },
        };
        if (contactId) body.associations = [{
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }], // deal→contact
        }];
        const created = await hsFetch('/crm/v3/objects/deals', { method: 'POST', body });
        return { ok: true, action: 'created', dealId: created.id };
    } catch (e) {
        console.error('[hubspot] markAgentAcquisitionWon failed:', e.message);
        return { ok: false, reason: e.message };
    }
}

// ── Backend-driven deal maintenance (B4 automations, free-tier friendly) ─────
// HubSpot Workflows/Sequences need Sales/Ops Hub Professional. We replicate the
// two achievable automations with the FREE CRM API instead: (1) a deal idle
// 14 days in stages 2–6 → create a follow-up task; (2) a Lost/Nurture deal with
// no lost_reason → create a "set a lost reason" task (soft enforcement, since we
// can't gate the stage in the UI without Pro). Reply-detection is the one piece
// that genuinely needs Pro (connected inbox + workflow) and isn't replicated.
const ACQ_ACTIVE_STAGE_LABELS = ['Contacted', 'Engaged', 'Spotlight Live', 'Free Profile Claimed', 'Pitch/Demo'];

async function getAcqPipeline() {
    const all = await hsFetch('/crm/v3/pipelines/deals');
    const pipe = (all.results || []).find(p => p.label === 'Agent Acquisition');
    if (!pipe) return null;
    const byLabel = {};
    for (const s of (pipe.stages || [])) byLabel[s.label] = s.id;
    return { id: pipe.id, byLabel };
}

async function createDealTask(dealId, { title, notes }) {
    const task = await hsFetch('/crm/v3/objects/tasks', {
        method: 'POST',
        body: { properties: {
            hs_task_subject: title, hs_task_body: notes || '',
            hs_task_status: 'NOT_STARTED', hs_task_priority: 'MEDIUM',
            hs_timestamp: Date.now(),
        } },
    });
    // Associate task → deal using the v4 "default" endpoint (no association-type
    // id needed — HubSpot picks the primary type).
    try {
        await hsFetch(`/crm/v4/objects/tasks/${task.id}/associations/default/deals/${dealId}`, { method: 'PUT' });
    } catch (e) { console.warn('[hubspot] task→deal assoc failed:', e.message); }
    return task;
}

async function _searchDeals(filters, properties) {
    const r = await hsFetch('/crm/v3/objects/deals/search', {
        method: 'POST', body: { filterGroups: filters, properties, limit: 100 },
    });
    return r.results || [];
}

async function runAcquisitionMaintenance({ idleDays = 14 } = {}) {
    try {
        if (!isActiveFn()) return { ok: false, reason: 'not_active' };
        const pipe = await getAcqPipeline();
        if (!pipe) return { ok: false, reason: 'pipeline_missing' };
        const now = Date.now();
        const cutoff = now - idleDays * 86400000;
        let idleTasks = 0, lostTasks = 0;

        // (1) Idle deals: in an active stage, not modified in `idleDays`.
        const activeStageIds = ACQ_ACTIVE_STAGE_LABELS.map(l => pipe.byLabel[l]).filter(Boolean);
        if (activeStageIds.length) {
            const filters = activeStageIds.map(id => ({ filters: [
                { propertyName: 'pipeline', operator: 'EQ', value: pipe.id },
                { propertyName: 'dealstage', operator: 'EQ', value: id },
                { propertyName: 'hs_lastmodifieddate', operator: 'LT', value: String(cutoff) },
            ] }));
            const deals = await _searchDeals(filters, ['dealname', 'last_auto_task_at']);
            for (const d of deals) {
                const last = d.properties.last_auto_task_at ? Date.parse(d.properties.last_auto_task_at) : 0;
                if (last && last > cutoff) continue; // tasked within the window already
                await createDealTask(d.id, {
                    title: `Follow up — ${d.properties.dealname || 'agent deal'} idle ${idleDays}d`,
                    notes: `No activity for ${idleDays}+ days. Nudge the prospect or move the deal stage.`,
                });
                await hsFetch(`/crm/v3/objects/deals/${d.id}`, { method: 'PATCH', body: { properties: { last_auto_task_at: new Date().toISOString() } } });
                idleTasks++;
            }
        }

        // (2) Lost/Nurture deals missing a lost_reason → task to fill it in.
        const lostStageId = pipe.byLabel['Lost/Nurture'];
        if (lostStageId) {
            const deals = await _searchDeals([{ filters: [
                { propertyName: 'pipeline', operator: 'EQ', value: pipe.id },
                { propertyName: 'dealstage', operator: 'EQ', value: lostStageId },
                { propertyName: 'lost_reason', operator: 'NOT_HAS_PROPERTY' },
            ] }], ['dealname', 'last_auto_task_at']);
            const weekAgo = now - 7 * 86400000;
            for (const d of deals) {
                const last = d.properties.last_auto_task_at ? Date.parse(d.properties.last_auto_task_at) : 0;
                if (last && last > weekAgo) continue;
                await createDealTask(d.id, {
                    title: `Set a lost reason — ${d.properties.dealname || 'deal'}`,
                    notes: 'This deal is in Lost/Nurture with no lost_reason. Please pick one so reporting stays clean.',
                });
                await hsFetch(`/crm/v3/objects/deals/${d.id}`, { method: 'PATCH', body: { properties: { last_auto_task_at: new Date().toISOString() } } });
                lostTasks++;
            }
        }

        if (idleTasks || lostTasks) console.log(`[acq-maint] created ${idleTasks} idle + ${lostTasks} lost-reason task(s)`);
        return { ok: true, idleTasks, lostTasks };
    } catch (e) {
        console.error('[hubspot] runAcquisitionMaintenance failed:', e.message);
        return { ok: false, reason: e.message };
    }
}

const isActiveFn = () => ENABLED && isConfigured();

module.exports = {
    syncContact,
    updateContact,
    createContactNote,
    markContactAsCustomer,
    syncSubscriptionStatus,
    markContactChurned,
    getPortalContactUrl,
    isConfigured,
    // T018: true only when sync is enabled AND credentials are present, so the
    // retry queue can tell "HubSpot is down" from "not configured / disabled".
    isActive: isActiveFn,
    ping,
    backfillExistingRecords,
    // B1/B4 schema provisioning + deal automation
    ensureSchema,
    ensurePropertyGroup,
    ensureProperty,
    ensureDealPipeline,
    markAgentAcquisitionWon,
    runAcquisitionMaintenance,
};
