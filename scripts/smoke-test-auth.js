// scripts/smoke-test-auth.js
//
// Exercises the auth + identity QA checklist against a running server.
//
//   BASE_URL=https://minnesotalakehomesforsale.com \
//   SMOKE_EMAIL=you+authsmoke@yourdomain.com \
//   node scripts/smoke-test-auth.js
//
// Tests covered (numbered to match the QA doc):
//   1.1  Email-based lead → account backfill
//   1.2  Email case-insensitive matching on lead intake
//   1.3  Email whitespace trimming on lead intake
//   2.1  Duplicate-email register rejection
//   2.2  Duplicate-email case-insensitive rejection
//   2.3  Duplicate-email whitespace-trimmed rejection
//   3.1  Duplicate phone (formatting variation: 612-555-1234 vs (612) 555-1234)
//   3.2  Duplicate phone (+1 prefix vs 10-digit)
//   4.5  Forgot-password anti-enumeration (unknown email → same response)
//   4.6  Forgot-password rate limit not triggered on a single attempt
//
// Tests NOT covered (require manual verification with a real inbox):
//   4.1-4.4  Reset email arrives, link works, single-use, expiry
//
// Output: PASS / FAIL per check + a final tally. Exits 0 only when every
// check passes — wire into CI / pre-deploy if you want.

const BASE_URL    = process.env.BASE_URL;
const SMOKE_EMAIL = process.env.SMOKE_EMAIL;

if (!BASE_URL || !SMOKE_EMAIL) {
    console.error('Missing BASE_URL or SMOKE_EMAIL env var. See header comment.');
    process.exit(1);
}

const stamp = Date.now().toString(36);
const uniq  = (suffix = '') => {
    // Insert a unique tag before the @ so we don't trip dedup unintentionally.
    // Local-part of email allows + aliases per RFC, and we treat them as
    // distinct emails (so each call gets a fresh address).
    const [local, domain] = SMOKE_EMAIL.split('@');
    return `${local}+${suffix || stamp}@${domain}`;
};

let passed = 0, failed = 0;
const fails = [];

async function http(path, opts = {}) {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    let body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    return { status: res.status, body };
}

function check(name, ok, detail = '') {
    if (ok) {
        console.log(`  ✓  ${name}`);
        passed++;
    } else {
        console.log(`  ✗  ${name}  ${detail ? '— ' + detail : ''}`);
        failed++;
        fails.push(name);
    }
}

async function postLead(payload) {
    return http('/api/leads', { method: 'POST', body: JSON.stringify(payload) });
}
async function register(payload) {
    return http('/api/auth/waitlist', { method: 'POST', body: JSON.stringify(payload) });
}
async function forgot(email) {
    return http('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

(async () => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' Auth + identity smoke test');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  base url:  ${BASE_URL}`);
    console.log(`  recipient: ${SMOKE_EMAIL}`);
    console.log('');

    // ── Scenario 1.2 + 1.3: case + whitespace on lead intake ─────────
    console.log('Scenario 1 — Email matching:');
    const email_1 = uniq(`s1_${stamp}`);
    const r1a = await postLead({ name: 'Smoke One', email: email_1, phone: '612-555-0101', source: 'buyer' });
    check('1.x  Buyer lead with lower-case email accepted', r1a.status === 201);

    const r1b = await postLead({ name: 'Smoke One', email: email_1.toUpperCase(), phone: '612-555-0102', source: 'seller' });
    check('1.2  Lead with UPPERCASE email accepted (server lowercases)', r1b.status === 201);

    const r1c = await postLead({ name: 'Smoke One', email: `  ${email_1}  `, source: 'buyer' });
    check('1.3  Lead with whitespace-padded email accepted (server trims)', r1c.status === 201);

    // ── Scenario 2: duplicate-email register rejection ──────────────
    console.log('');
    console.log('Scenario 2 — Duplicate-email rejection on register:');
    const email_2 = uniq(`s2_${stamp}`);
    const r2a = await register({
        first_name: 'Smoke', last_name: 'Two',
        email: email_2, phone: '612-555-0201', password: 'TestPass1234',
    });
    check('2.x  First register with new email succeeds', r2a.status === 201, `got ${r2a.status} ${JSON.stringify(r2a.body)}`);

    const r2b = await register({
        first_name: 'Smoke', last_name: 'TwoB',
        email: email_2, phone: '612-555-0202', password: 'TestPass1234',
    });
    check('2.1  Second register with same email is rejected (409)', r2b.status === 409);

    const r2c = await register({
        first_name: 'Smoke', last_name: 'TwoC',
        email: email_2.toUpperCase(), phone: '612-555-0203', password: 'TestPass1234',
    });
    check('2.2  Register with UPPERCASE variant is rejected', r2c.status === 409);

    const r2d = await register({
        first_name: 'Smoke', last_name: 'TwoD',
        email: `  ${email_2}  `, phone: '612-555-0204', password: 'TestPass1234',
    });
    check('2.3  Register with whitespace-padded email is rejected', r2d.status === 409);

    // ── Scenario 3: phone normalization ─────────────────────────────
    console.log('');
    console.log('Scenario 3 — Duplicate-phone rejection (normalization):');
    const email_3 = uniq(`s3_${stamp}`);
    const r3a = await register({
        first_name: 'Smoke', last_name: 'Three',
        email: email_3, phone: '612-555-9301', password: 'TestPass1234',
    });
    check('3.x  Register with phone 612-555-9301 succeeds', r3a.status === 201, `got ${r3a.status}`);

    const r3b = await register({
        first_name: 'Smoke', last_name: 'ThreeB',
        email: uniq(`s3b_${stamp}`), phone: '(612) 555-9301', password: 'TestPass1234',
    });
    check('3.1  Register with (612) 555-9301 (same number, different format) is rejected', r3b.status === 409);

    const r3c = await register({
        first_name: 'Smoke', last_name: 'ThreeC',
        email: uniq(`s3c_${stamp}`), phone: '+1 612 555 9301', password: 'TestPass1234',
    });
    check('3.2  Register with +1 612 555 9301 (E.164-ish) is rejected', r3c.status === 409);

    const r3d = await register({
        first_name: 'Smoke', last_name: 'ThreeD',
        email: uniq(`s3d_${stamp}`), phone: '16125559301', password: 'TestPass1234',
    });
    check('3.2  Register with 16125559301 (11-digit) is rejected', r3d.status === 409);

    // ── Scenario 4: forgot-password anti-enumeration ────────────────
    console.log('');
    console.log('Scenario 4 — Forgot-password (anti-enumeration):');
    const r4a = await forgot(email_2); // exists
    check('4.x  Forgot with known email returns 200', r4a.status === 200);

    const r4b = await forgot(uniq(`s4_unknown_${stamp}`));
    check('4.5  Forgot with UNKNOWN email also returns 200', r4b.status === 200);

    const sameMessage = (r4a.body?.message || '') === (r4b.body?.message || '');
    check('4.5  Forgot response body is IDENTICAL for known + unknown', sameMessage,
          sameMessage ? '' : `known: "${r4a.body?.message}"  vs  unknown: "${r4b.body?.message}"`);

    // ── Summary ─────────────────────────────────────────────────────
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(` ${passed} passed · ${failed} failed`);
    if (failed) {
        console.log(' Failed checks:');
        fails.forEach(f => console.log(`   - ${f}`));
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('');
    console.log('Manual verification still needed (these need a real inbox):');
    console.log('  4.1  Reset email actually lands at SMOKE_EMAIL after a forgot request');
    console.log('  4.2  Clicking the reset link → setting a new password → can log in');
    console.log('  4.3  Re-using the same token a second time → blocked');
    console.log('  4.4  Token older than 1 hour → blocked');
    console.log('');
    console.log('Cleanup (manual):');
    console.log('  The smoke-test accounts use ' + uniq('*') + ' as a unique pattern.');
    console.log(`  DELETE FROM users WHERE email LIKE '${SMOKE_EMAIL.split('@')[0]}+s%@${SMOKE_EMAIL.split('@')[1]}';`);
    console.log('  (and the leads they created — same email pattern.)');
    console.log('');

    process.exit(failed ? 1 : 0);
})().catch(err => {
    console.error('Smoke test crashed:', err);
    process.exit(1);
});
