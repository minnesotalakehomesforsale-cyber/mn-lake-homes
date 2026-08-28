'use strict';

// Live-pass harness — one command fires every live template with sample data at
// a set of seed inboxes, so the three-client render/spam pass is triage of what
// landed wrong instead of an afternoon of sending 43 by hand (where the last ten
// get a glance). Re-running it after any template change costs nothing.
//
//   node test/live-pass.js                 → DRY RUN: coverage + what it would send
//   LIVE_PASS_TO="a@gmail.com,b@outlook.com,c@icloud.com" node test/live-pass.js --send
//
// Requires a real transport (RESEND_API_KEY or GMAIL_*) + EMAIL_FROM to actually
// send; refuses loudly rather than silently no-op'ing. Throttled so a provider
// rate limit can't drop the tail.

const { SAMPLES, EXCLUDED } = require('./email-samples');
const email = require('../src/services/email');
const { EMAIL_TEMPLATES } = email;

const send = process.argv.includes('--send') || process.env.LIVE_PASS_SEND === '1';
const seeds = (process.env.LIVE_PASS_TO || '').split(',').map(s => s.trim()).filter(Boolean);
const THROTTLE_MS = parseInt(process.env.LIVE_PASS_THROTTLE_MS, 10) || 700;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    // Coverage: every registry template must have a sample or be intentionally excluded.
    const covered = new Set(SAMPLES.map(s => s.key));
    const excluded = new Set(EXCLUDED);
    const missing = EMAIL_TEMPLATES.map(t => t.key).filter(k => !covered.has(k) && !excluded.has(k));
    console.log(`Templates: ${EMAIL_TEMPLATES.length} · samples: ${covered.size} · excluded (retired): ${excluded.size}`);
    if (missing.length) {
        console.error(`\n✖ ${missing.length} template(s) have NO sample — add them to email-samples.js before the pass:\n  ${missing.join('\n  ')}`);
        process.exit(1);
    }
    console.log('✓ every live template has a sample.\n');

    if (!send) {
        console.log('DRY RUN (no send). Would fire:');
        for (const s of SAMPLES) console.log(`  ${s.owner ? '[owner]' : '[to]   '} ${s.key.padEnd(28)} ${s.name}`);
        console.log(`\nTo send: LIVE_PASS_TO="you@gmail.com,you@outlook.com,you@icloud.com" node test/live-pass.js --send`);
        return;
    }

    // Guard: never "send" into a void.
    const transport = process.env.RESEND_API_KEY ? 'resend' : (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ? 'gmail' : null;
    if (!transport) { console.error('✖ No transport configured (RESEND_API_KEY or GMAIL_USER+GMAIL_APP_PASSWORD). Refusing to send.'); process.exit(1); }
    if (!seeds.length) { console.error('✖ No seed addresses. Set LIVE_PASS_TO="a@x,b@y,c@z".'); process.exit(1); }
    if (/onboarding@resend\.dev/i.test(process.env.EMAIL_FROM || '') || !process.env.EMAIL_FROM) {
        console.error('✖ EMAIL_FROM is unset or the Resend sandbox — real recipients will be rejected. Set a verified EMAIL_FROM first.'); process.exit(1);
    }

    console.log(`SENDING via ${transport} to ${seeds.length} seed(s): ${seeds.join(', ')}\n`);
    const origOwner = process.env.OWNER_EMAIL;
    let ok = 0, fail = 0;
    for (const seed of seeds) {
        for (const s of SAMPLES) {
            try {
                if (s.owner) process.env.OWNER_EMAIL = seed;   // route owner reports to the seed
                const res = await s.send(email, seed);
                if (res && (res.error || res.skipped || res.blocked)) { fail++; console.error(`  ✗ ${s.key} → ${seed}: ${res.error || res.skipped || res.blocked}`); }
                else { ok++; console.log(`  ✓ ${s.key} → ${seed}`); }
            } catch (e) { fail++; console.error(`  ✗ ${s.key} → ${seed}: ${e.message}`); }
            finally { if (s.owner) process.env.OWNER_EMAIL = origOwner; }
            await sleep(THROTTLE_MS);
        }
    }
    console.log(`\nDone — ${ok} sent, ${fail} failed. Now check render, text alternative, footer variant, and spam placement in each client.`);
    if (fail) process.exit(1);
})();
