'use strict';

// EM-05 — frequency cap + plain-text alternative + per-class footers.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.UNSUB_SECRET = process.env.UNSUB_SECRET || 'test-unsub';
process.env.EMAIL_PHYSICAL_ADDRESS = '123 Real St, Brainerd, MN 56401';
delete process.env.RESEND_API_KEY;   // no transport — assert on return + log, not delivery
delete process.env.GMAIL_USER;
delete process.env.GMAIL_APP_PASSWORD;

const assert = require('assert');
const pool = require('../src/database/pool');

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failures++; console.error('  ✗ ' + msg); } };

// ── Pure helpers ─────────────────────────────────────────────────────────────
const { htmlToText, footerHtml } = require('../src/services/email');

const text = htmlToText('<html><head><style>x{}</style></head><body><h1>Hi</h1><p>See <a href="https://x.com/a">our page</a> &amp; more.</p><ul><li>one</li><li>two</li></ul></body></html>');
ok(!/</.test(text) && !/>/.test(text), 'htmlToText strips all tags');
ok(/our page \(https:\/\/x\.com\/a\)/.test(text), 'htmlToText renders links as "text (url)"');
ok(/&/.test(text) && !/&amp;/.test(text), 'htmlToText decodes entities');
ok(/• one/.test(text) && /• two/.test(text), 'htmlToText bullets list items');

ok(footerHtml('a@b.com', 'internal') === '', 'internal footer is empty');
const txF = footerHtml('a@b.com', 'transactional');
ok(/service message/i.test(txF) && !/Unsubscribe/i.test(txF) && /Brainerd/.test(txF), 'transactional footer: address, no unsubscribe');
const lcF = footerHtml('a@b.com', 'lifecycle');
ok(/Unsubscribe/i.test(lcF) && /unsubscribe\?e=a%40b\.com/i.test(lcF) && /Brainerd/.test(lcF), 'lifecycle footer: unsubscribe link + address');
const caF = footerHtml('a@b.com', 'content_ask');
ok(/Unsubscribe/i.test(caF) && /network/i.test(caF), 'content_ask footer: unsubscribe + its own lead-in');

// ── Frequency cap via sendEmail ──────────────────────────────────────────────
let capCount = 0;                    // what the cap COUNT query returns
const logged = [];
pool.query = async (sql, params) => {
    if (/email_unsubscribes/i.test(sql)) return { rows: [] };                    // never suppressed here
    if (/COUNT\(\*\)::int AS n/i.test(sql) && /email_class IN/i.test(sql)) return { rows: [{ n: capCount }] };
    if (/INSERT INTO email_log/i.test(sql)) { logged.push({ status: params[3], class: params[5], key: params[6] }); return { rows: [] }; }
    return { rows: [] };
};

const { sendEmail } = require('../src/services/email');

(async () => {
    // Under the cap → proceeds past the cap gate (no transport → not 'capped').
    capCount = 0;
    const r1 = await sendEmail({ to: 'agent@example.com', subject: 'nudge 1', html: '<p>x</p>', emailClass: 'lifecycle', templateKey: 'agent_profile_nudge' });
    ok(r1.capped !== true, 'lifecycle under cap is NOT capped');
    ok(!logged.some(l => l.key === 'agent_profile_nudge' && l.status === 'capped'), 'under-cap send logs no capped row');

    // At/over the cap → capped, logged, not sent.
    capCount = 1;
    logged.length = 0;
    const r2 = await sendEmail({ to: 'agent@example.com', subject: 'nudge 2', html: '<p>x</p>', emailClass: 'lifecycle', templateKey: 'agent_profile_nudge' });
    ok(r2.capped === true && r2.skipped === true, 'lifecycle over cap is capped + skipped');
    ok(logged.some(l => l.status === 'capped' && l.class === 'lifecycle'), 'capped send logs status=capped');

    // Transactional is exempt from the cap even when the window is full.
    capCount = 99;
    logged.length = 0;
    const r3 = await sendEmail({ to: 'agent@example.com', subject: 'receipt', html: '<p>x</p>', emailClass: 'transactional', templateKey: 'business_payment_received' });
    ok(r3.capped !== true, 'transactional is never capped');

    if (failures) { console.error(`\nEM-05 test: ${failures} FAIL`); process.exit(1); }
    console.log('\nEM-05 test: ALL PASSED');
})();
