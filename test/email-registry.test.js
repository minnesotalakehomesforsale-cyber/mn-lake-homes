'use strict';

// EM-23a — the exported EMAIL_TEMPLATES registry is the source of truth for the
// oversight slice + (later) the frequency cap. It must stay in lockstep with the
// emailClass/templateKey pairs the send calls actually carry. This walks the
// source, extracts every (templateKey, emailClass) pair from the call sites, and
// asserts the registry matches it exactly — no missing, extra, or mis-classed row.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'services', 'email.js');
const src = fs.readFileSync(SRC, 'utf8');
const { EMAIL_TEMPLATES } = require('../src/services/email');

// Pull pairs regardless of which key is written first in the object literal.
const call = new Map();
const reA = /emailClass:\s*['"]([a-z_]+)['"][\s\S]{0,200}?templateKey:\s*['"]([a-z0-9_]+)['"]/g;
const reB = /templateKey:\s*['"]([a-z0-9_]+)['"][\s\S]{0,200}?emailClass:\s*['"]([a-z_]+)['"]/g;
let m;
while ((m = reA.exec(src))) call.set(m[2], m[1]);
while ((m = reB.exec(src))) if (!call.has(m[1])) call.set(m[1], m[2]);

const reg = new Map(EMAIL_TEMPLATES.map(t => [t.key, t.class]));
let failures = 0;
const fail = (msg) => { failures++; console.error('  ✗ ' + msg); };

for (const [key, cls] of call) {
    if (!reg.has(key)) fail(`call site '${key}' (${cls}) is missing from EMAIL_TEMPLATES`);
    else if (reg.get(key) !== cls) fail(`'${key}': call site says ${cls}, registry says ${reg.get(key)}`);
}
for (const [key, cls] of reg) {
    if (!call.has(key)) fail(`registry key '${key}' (${cls}) matches no send call site`);
}

// Every registry class must be one of the four known values.
const VALID = new Set(['transactional', 'lifecycle', 'content_ask', 'internal']);
for (const t of EMAIL_TEMPLATES) if (!VALID.has(t.class)) fail(`'${t.key}' has unknown class '${t.class}'`);

// No duplicate keys.
if (reg.size !== EMAIL_TEMPLATES.length) fail('EMAIL_TEMPLATES contains duplicate keys');

if (failures) { console.error(`\nemail-registry: ${failures} FAIL`); process.exit(1); }
console.log(`email-registry: OK — registry matches all ${call.size} send call sites`);
