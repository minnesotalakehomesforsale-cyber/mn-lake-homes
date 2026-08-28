'use strict';

// EM-21 — copy-compliance guard. Sweeps every template function in email.js for
// the four banned claim classes so they can't silently regress into the copy:
//   (a) lead / match / routing promises that reach FREE or DRAFT agents
//   (b) "Founder" and lake-exclusivity language
//   (c) unbiased / guaranteed / free-trial / rate-lock — plus paraphrases a
//       literal test would miss (perfect agent, best fit guaranteed, we'll find
//       you the best, top agent, hand-picked as a quality guarantee)
//   (d) "Basic" as an AGENT tier (agents are Standard $9; Basic $29 is a business tier)
//
// EXEMPTIONS: EM-11 rewrote sendAgentProfileLive to its verbatim copy (paid/free
// variants), clearing the live "leads still reach you" (a) + "founder" (b) lines,
// so its exemption is removed. ACCEPTANCE (Block C): this list must be EMPTY at
// the end of Block C — it is. Add an entry only with a ticketed removal condition.
const EXEMPTIONS = {};

const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'services', 'email.js');
const src = fs.readFileSync(SRC, 'utf8');

// Banned-claim patterns. Each may set agentOnly to scope it to agent-facing copy.
const CHECKS = [
    { id: 'a-free-leads', label: '(a) implies free/draft agents receive leads',
      re: /leads still reach you|you'?ll still (?:get|receive|be sent) leads|leads (?:still )?(?:come|flow|reach|go) to you/i },
    { id: 'b-founder', label: '(b) "Founder" / lake-exclusivity language',
      re: /\bfounder\b|exclusiv\w*\s+(?:\w+\s+){0,3}lake|lake\s+(?:\w+\s+){0,2}exclusiv|only agent (?:on|for) (?:this|your|the) lake|\bsole agent\b/i },
    { id: 'c-claims', label: '(c) unbiased / guaranteed / free-trial / rate-lock',
      re: /\bunbiased\b|\bguarantee(?:d|s)?\b|free[-\s]?trial|rate[-\s]?lock/i },
    { id: 'c-paraphrase', label: '(c) banned quality-guarantee paraphrase',
      re: /perfect agent|best fit guaranteed|we'?ll find you the best|top agent|hand[-\s]?picked/i },
    { id: 'd-basic-tier', label: '(d) "Basic" used as an agent tier', agentOnly: true,
      re: /\bbasic\b/i },
];

// Split the file into top-level template functions (all named sendX).
const fnRe = /\nfunction\s+(send\w+)\s*\(/g;
const marks = [];
let m;
while ((m = fnRe.exec(src))) marks.push({ name: m[1], start: m.index });
const chunks = marks.map((mk, i) => ({
    name: mk.name,
    body: src.slice(mk.start, i + 1 < marks.length ? marks[i + 1].start : src.length),
}));

const violations = [];        // non-exempt → fail
const exemptedHits = [];      // exempt → reported, allowed

for (const fn of chunks) {
    // Only the low-level sender + generic passthrough carry no marketing copy.
    if (fn.name === 'sendEmail' || fn.name === 'sendCustom') continue;
    // Scan the USER-FACING copy only — strip block + full-line code comments so a
    // comment like "membership_code 'basic'" or a doc block can't false-positive.
    // (Full-line only, so inline https:// URLs in the copy stay intact.)
    const body = fn.body
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');
    const isAgent = /agent/i.test(fn.name) && !/business/i.test(fn.name);
    for (const c of CHECKS) {
        if (c.agentOnly && !isAgent) continue;
        const hit = body.match(c.re);
        if (!hit) continue;
        const rec = { fn: fn.name, check: c.id, label: c.label, match: hit[0] };
        if (EXEMPTIONS[fn.name]) exemptedHits.push(rec); else violations.push(rec);
    }
}

console.log(`Scanned ${chunks.length} template functions.`);
if (exemptedHits.length) {
    console.log(`\nExempted (known, tracked) — ${exemptedHits.length}:`);
    for (const v of exemptedHits) console.log(`  ~ ${v.fn} · ${v.label} · "${v.match}" — ${EXEMPTIONS[v.fn]}`);
}
if (Object.keys(EXEMPTIONS).length) {
    console.log(`\n⚠ ${Object.keys(EXEMPTIONS).length} exemption(s) outstanding — must be EMPTY by end of Block C: ${Object.keys(EXEMPTIONS).join(', ')}`);
}

if (violations.length) {
    console.error(`\nemail-compliance: ${violations.length} FAIL`);
    for (const v of violations) console.error(`  ✗ ${v.fn} · ${v.label} · matched "${v.match}"`);
    process.exit(1);
}
console.log('\nemail-compliance: OK — no un-exempted banned-claim copy');
