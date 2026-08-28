'use strict';

// EM-22 / EM-03 behavioural test — consent integrity + logging.
//
// Unsubscribe one address, then attempt a send from every class. Assert:
//   • transactional + internal LAND (exempt from suppression)
//   • lifecycle + content_ask + UNCLASSIFIED are SUPPRESSED (fail-closed)
//   • every attempt is written to email_log with its email_class + status
//
// No real transport and no real DB: the pool is stubbed so isSuppressed()
// returns a hit for the unsubscribed address and every email_log INSERT is
// captured for inspection.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.UNSUB_SECRET = process.env.UNSUB_SECRET || 'test-unsub';
process.env.EMAIL_PHYSICAL_ADDRESS = 'MN Lake Homes, 123 Real St, Brainerd, MN 56401';
// Make sure no transport is configured — we assert on the log, not delivery.
delete process.env.RESEND_API_KEY;
delete process.env.GMAIL_USER;
delete process.env.GMAIL_APP_PASSWORD;

const assert = require('assert');
const pool = require('../src/database/pool');

const SUPPRESSED = 'blocked@example.com';
const CLEAN = 'ok@example.com';
const logged = [];

// Stub the pool so the service talks to memory, not Postgres.
pool.query = async (sql, params) => {
    if (/email_unsubscribes/i.test(sql)) {
        const email = String(params[0] || '').toLowerCase();
        return { rows: email === SUPPRESSED ? [{ '?column?': 1 }] : [] };
    }
    if (/INSERT INTO email_log/i.test(sql)) {
        // columns: to_email, subject, category, status, detail, email_class, template_key, provider_message_id, sent_at
        logged.push({ to: params[0], status: params[3], email_class: params[5], template_key: params[6], sent_at: params[8] });
        return { rows: [] };
    }
    return { rows: [] };
};

const { sendEmail } = require('../src/services/email');

// One row per class. `to` is the suppressed address for the commercial classes
// (that's the whole point) and a clean address for the exempt ones.
const CASES = [
    { emailClass: 'transactional', templateKey: 't_txn',  to: SUPPRESSED, expect: 'sent-path' },
    { emailClass: 'internal',      templateKey: 't_int',  to: SUPPRESSED, expect: 'sent-path' },
    { emailClass: 'lifecycle',     templateKey: 't_life', to: SUPPRESSED, expect: 'suppressed' },
    { emailClass: 'content_ask',   templateKey: 't_ask',  to: SUPPRESSED, expect: 'suppressed' },
    { emailClass: undefined,       templateKey: 't_none', to: SUPPRESSED, expect: 'suppressed' }, // fail-closed
];

(async () => {
    let failures = 0;
    for (const c of CASES) {
        const res = await sendEmail({ to: c.to, subject: `probe ${c.templateKey}`, html: '<p>x</p>', emailClass: c.emailClass, templateKey: c.templateKey });
        const row = logged.find(l => l.template_key === c.templateKey);
        try {
            assert.ok(row, `expected an email_log row for ${c.templateKey}`);
            assert.strictEqual(row.email_class, c.emailClass ?? null, `class logged for ${c.templateKey}`);
            if (c.expect === 'suppressed') {
                assert.strictEqual(res.suppressed, true, `${c.emailClass || 'unclassified'} to a suppressed address must be blocked`);
                assert.strictEqual(row.status, 'suppressed', `${c.templateKey} must log status=suppressed`);
            } else {
                // Exempt class: NOT suppressed. With no transport it lands on the
                // 'no transport' path (status 'skipped') — the point is it got past
                // the suppression gate, which a suppressed send never would.
                assert.notStrictEqual(res.suppressed, true, `${c.emailClass} must NOT be suppressed`);
                assert.notStrictEqual(row.status, 'suppressed', `${c.templateKey} must not log status=suppressed`);
            }
            console.log(`  ✓ ${(c.emailClass || 'unclassified').padEnd(13)} → res=${JSON.stringify(res).slice(0, 40)} log.status=${row.status}`);
        } catch (e) {
            failures++;
            console.error(`  ✗ ${c.emailClass || 'unclassified'}: ${e.message}`);
        }
    }

    // Address-block path: a lifecycle send with NO physical address must refuse.
    const saved = process.env.EMAIL_PHYSICAL_ADDRESS;
    delete process.env.EMAIL_PHYSICAL_ADDRESS;
    const blockedRes = await sendEmail({ to: CLEAN, subject: 'no-addr', html: '<p>x</p>', emailClass: 'lifecycle', templateKey: 't_noaddr' });
    process.env.EMAIL_PHYSICAL_ADDRESS = saved;
    try {
        assert.strictEqual(blockedRes.blocked, 'no_physical_address', 'commercial send with no address must be blocked');
        console.log('  ✓ no-address     → blocked (CAN-SPAM)');
    } catch (e) { failures++; console.error(`  ✗ no-address: ${e.message}`); }

    if (failures) { console.error(`\nEM-22/EM-03 behavioural test: ${failures} FAIL`); process.exit(1); }
    console.log('\nEM-22/EM-03 behavioural test: ALL PASSED');
})();
