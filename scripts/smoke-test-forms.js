/**
 * scripts/smoke-test-forms.js — Real submission smoke test for the buyer +
 * seller lead flows. Run this against prod after a deploy that changes any
 * of: lead.controller, sendLeadConfirmation, HubSpot sync, lead routing.
 *
 *   Usage:
 *     BASE_URL=https://minnesotalakehomesforsale.com \
 *     SMOKE_EMAIL=you+smoketest@yourdomain.com \
 *     node scripts/smoke-test-forms.js
 *
 *   Env:
 *     BASE_URL       (required)  e.g. https://minnesotalakehomesforsale.com
 *     SMOKE_EMAIL    (required)  must be an inbox YOU can read — receives
 *                                the confirmation + magnet download link
 *     SMOKE_PHONE    (optional)  used on both leads, default 612-555-0000
 *     SMOKE_KEEP     (optional)  set to "1" to keep the smoke leads in the
 *                                DB. Default is to print a manual cleanup
 *                                hint after the run.
 *
 *   Output:
 *     - HTTP status of each POST
 *     - Lead IDs the server returned
 *     - A printable verification checklist with deep-links to admin pages,
 *       the GA4 Realtime URL, and the HubSpot contact lookup URL
 *
 *   What it does NOT verify (you have to eyeball these):
 *     - The actual email arrives in the inbox
 *     - The magnet download link inside the email works
 *     - The HubSpot contact was created/updated (check HubSpot UI)
 *     - GA4 saw the trackConversion event (check GA4 Realtime)
 *
 *   This is a pragmatic smoke test, not a full integration test — it
 *   exercises the POST path and gives you the visible markers to confirm
 *   the rest landed.
 */

const BASE_URL    = process.env.BASE_URL;
const SMOKE_EMAIL = process.env.SMOKE_EMAIL;
const SMOKE_PHONE = process.env.SMOKE_PHONE || '612-555-0000';
const KEEP        = process.env.SMOKE_KEEP === '1';

if (!BASE_URL || !SMOKE_EMAIL) {
    console.error('Missing BASE_URL or SMOKE_EMAIL env var. See header comment.');
    process.exit(1);
}
if (!/^https?:\/\//.test(BASE_URL)) {
    console.error('BASE_URL must start with http(s)://');
    process.exit(1);
}

const stamp     = new Date().toISOString().replace(/[:.]/g, '-');
const buyerName = `Smoke Buyer ${stamp}`;
const sellerName= `Smoke Seller ${stamp}`;

const buyerPayload = {
    name:  buyerName,
    email: SMOKE_EMAIL,
    phone: SMOKE_PHONE,
    notes: `Budget: $750K – $1M\nTimeline: Within 1–3 months\n\n[automated smoke test ${stamp}]`,
    source: 'buyer',
};

const sellerPayload = {
    name:  sellerName,
    email: SMOKE_EMAIL,
    phone: SMOKE_PHONE,
    notes: `Timeline: Within 3 months\n\n[automated smoke test ${stamp}]`,
    source: 'seller',
    property_address: '123 Shoreline Dr, Wayzata, MN 55391',
    property_street:  '123 Shoreline Dr',
    property_city:    'Wayzata',
    property_state:   'MN',
    property_zip:     '55391',
};

async function post(path, payload, label) {
    const url = `${BASE_URL}${path}`;
    process.stdout.write(`→ ${label.padEnd(28)} POST ${path}  …  `);
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) { /* leave as text */ }
    if (!res.ok) {
        console.log(`HTTP ${res.status}  FAILED`);
        console.log('   body:', text.slice(0, 300));
        return null;
    }
    console.log(`HTTP ${res.status}  OK`);
    return json;
}

(async () => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' Lead flow smoke test');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(` base url:  ${BASE_URL}`);
    console.log(` recipient: ${SMOKE_EMAIL}`);
    console.log(` stamp:     ${stamp}`);
    console.log('');

    // 1. Config sanity check — confirms the tracking IDs are in place.
    process.stdout.write(`→ ${'Config endpoint'.padEnd(28)} GET  /api/config/public  …  `);
    let cfg = null;
    try {
        const r = await fetch(`${BASE_URL}/api/config/public?_=${Date.now()}`);
        cfg = await r.json();
        console.log(`HTTP ${r.status}  OK`);
        console.log(`   GA4: ${cfg.ga4_id || '(not set)'} · HubSpot: ${cfg.hubspot_portal_id || '(not set)'} · env: ${cfg.environment}`);
    } catch (e) {
        console.log('FAILED', e.message);
    }
    console.log('');

    // 2. Buyer lead.
    const buyer  = await post('/api/leads', buyerPayload, 'Buyer lead');
    // 3. Seller lead.
    const seller = await post('/api/leads', sellerPayload, 'Seller lead');
    // 4. Newsletter (sign_up path).
    const news   = await post('/api/marketing/subscribe', { email: SMOKE_EMAIL, source: 'commonrealtor' }, 'Newsletter subscribe');
    console.log('');

    // ── Verification checklist ─────────────────────────────────────────
    const adminBase = BASE_URL.replace(/\/$/, '');
    const ga4Id     = cfg?.ga4_id;
    const hsId      = cfg?.hubspot_portal_id;
    const ga4Url    = ga4Id ? `https://analytics.google.com/analytics/web/#/p${ga4Id.replace(/^G-/, '')}/reports/realtime` : null;
    const hsContactUrl = hsId
        ? `https://app-na2.hubspot.com/contacts/${hsId}/objects/0-1/views/all/list?query=${encodeURIComponent(SMOKE_EMAIL)}`
        : null;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' Manual verification checklist');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(' [1] Email inbox — confirm 2 confirmation emails landed:');
    console.log(`     - "${buyerName}"   subject: Your Minnesota lake-home buying journey starts here`);
    console.log(`     - "${sellerName}"  subject: Your Minnesota lake-home seller toolkit is ready`);
    console.log('     Each should have a "Download \\"...\\""\\ button at the top.');
    console.log('');
    console.log(' [2] Click the magnet download button in each email.');
    console.log('     - Buyer  → should open the First-Time Lake Buyer Roadmap PDF');
    console.log('     - Seller → should open the Minnesota Lake Home Seller Guide PDF');
    console.log('');
    console.log(' [3] Admin leads queue (find the 2 smoke leads):');
    console.log(`     ${adminBase}/pages/admin/leads.html`);
    if (buyer?.id || seller?.id) {
        if (buyer)  console.log(`     Buyer  lead id: ${buyer.id  || '(not returned)'}`);
        if (seller) console.log(`     Seller lead id: ${seller.id || '(not returned)'}`);
    }
    console.log('');
    console.log(' [4] HubSpot contact (the smoke email should appear as a contact):');
    if (hsContactUrl) console.log(`     ${hsContactUrl}`);
    else              console.log('     HubSpot portal id not configured — skip.');
    console.log('     Expected lifecyclestage = "lead".');
    console.log('');
    console.log(' [5] GA4 Realtime — confirm 2 generate_lead events fired:');
    if (ga4Url) console.log(`     ${ga4Url}`);
    else        console.log('     GA4 not configured — skip.');
    console.log('     NOTE: this script POSTs directly to /api/leads so it');
    console.log('     skips the browser trackConversion() helper. To see the');
    console.log('     GA4 event, submit a real form via the website UI.');
    console.log('');
    console.log(' [6] Conversion mirror — server-side feed in admin:');
    console.log(`     ${adminBase}/pages/admin/dashboard.html  →  Launch tracking → Recent conversions`);
    console.log(`     ${adminBase}/pages/admin/system.html?tab=metrics  →  Conversions tab`);
    console.log('');
    if (!KEEP) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(' Cleanup (manual)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(' The 2 smoke leads + 1 newsletter row are now in your DB. To');
        console.log(' remove them after verification, run in psql or the Render shell:');
        console.log('');
        console.log(`   DELETE FROM leads WHERE email = '${SMOKE_EMAIL.toLowerCase()}'`);
        console.log(`     AND notes LIKE '%[automated smoke test%';`);
        console.log('');
        console.log(' (Pass SMOKE_KEEP=1 to skip this hint on future runs.)');
    }
    console.log('');
})().catch(err => {
    console.error('Smoke test crashed:', err);
    process.exit(1);
});
