'use strict';

// EM-23a / EM-03 — the exported EMAIL_TEMPLATES registry is the load-bearing
// source of truth (the CI compliance test AND the boot guard both read it). This
// asserts it stays in lockstep with the send call sites via the SAME
// auditTemplateClassification() the boot guard runs — one implementation, so CI
// and boot can't disagree — plus a couple of registry-shape invariants.

const { EMAIL_TEMPLATES, auditTemplateClassification } = require('../src/services/email');

let failures = 0;
const fail = (msg) => { failures++; console.error('  ✗ ' + msg); };

// Core: call sites ⟺ registry, and no unclassified sendEmail() branch.
const audit = auditTemplateClassification();
if (!audit.ok) audit.problems.forEach(fail);

// Shape: every class is one of the four known values, no duplicate keys.
const VALID = new Set(['transactional', 'lifecycle', 'content_ask', 'internal']);
for (const t of EMAIL_TEMPLATES) if (!VALID.has(t.class)) fail(`'${t.key}' has unknown class '${t.class}'`);
const keys = new Set(EMAIL_TEMPLATES.map(t => t.key));
if (keys.size !== EMAIL_TEMPLATES.length) fail('EMAIL_TEMPLATES contains duplicate keys');

if (failures) { console.error(`\nemail-registry: ${failures} FAIL`); process.exit(1); }
console.log(`email-registry: OK — ${EMAIL_TEMPLATES.length} templates in sync with call sites (via boot audit)`);
