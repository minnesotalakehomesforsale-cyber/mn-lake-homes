'use strict';

// EM-07 acceptance guard: no code path emails the owner on a routine business
// event. The registry rule catches an unclassified sendEmail; it CANNOT catch a
// valid call to a retired admin-notification template. This scans the source for
// callers of the retired functions and fails if a new one reappears — the exact
// six-months-later regression the ticket warns about.
//
// Retired (must have ZERO callers outside their own definition/export in email.js):
//   sendAgentAdminNotification · sendBusinessAdminNotification
//   sendAdminSubscriptionCancelled · sendAdminLeadNotification
// NOT listed: sendInquiryNotification — it still legitimately serves the
// commonrealtor PARTNER inbox (a different person), so it keeps a caller by design.

const fs = require('fs');
const path = require('path');

const RETIRED = ['sendAgentAdminNotification', 'sendBusinessAdminNotification', 'sendAdminSubscriptionCancelled', 'sendAdminLeadNotification'];
const SRC = path.join(__dirname, '..', 'src');
const EMAIL_JS = path.join(SRC, 'services', 'email.js');

function walk(dir, out = []) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) walk(full, out);
        else if (full.endsWith('.js')) out.push(full);
    }
    return out;
}

let failures = 0;
for (const file of walk(SRC)) {
    if (file === EMAIL_JS) continue;                 // definitions + module.exports live here
    const src = fs.readFileSync(file, 'utf8');
    for (const fn of RETIRED) {
        const re = new RegExp(`\\.${fn}\\s*\\(`);    // a CALL, e.g. emailService.sendAdminLeadNotification(
        if (re.test(src)) {
            failures++;
            console.error(`  ✗ ${path.relative(SRC, file)} calls retired ${fn}() — route it through the incident router (P2/P3), not a direct owner email`);
        }
    }
}

if (failures) { console.error(`\nno-owner-email: ${failures} FAIL`); process.exit(1); }
console.log(`no-owner-email: OK — no caller of ${RETIRED.length} retired owner-email templates`);
