'use strict';

// Enum-integrity guard. Three enum bugs shipped in this project, all identical in
// shape: a string literal the code writes to an enum column that the DB enum does
// not accept, so Postgres throws "invalid input value for enum" — at boot, in a
// swallowed log line, discovered weeks later.
//   1. action-dispatch mark_contacted wrote lead_status IN ('received','routed')
//      ('received'/'routed' are pipeline_status values, not lead_status).
//   2. 'held_no_agent' written to lead_status before the ALTER TYPE ADD VALUE.
//   3. lead_type IN ('seller','cash_offer') aborted the lead-score backfill
//      ('cash_offer' is not a lead_request_type — cash offers live in their own
//      table).
//
// This asserts, statically, that every enum-column literal the code writes is a
// value the enum actually DEFINES. The contract is read from the DDL the code
// ships — base CREATE TYPE in database/schema.sql plus every ALTER TYPE ADD VALUE
// migration in src — so it needs no live DB and can't drift from what deploys.
//
// Same shape as email-compliance.test.js: framework-free, greps source, exits
// non-zero on any offender. Run: `node test/enum-integrity.test.js`.
//
// SCOPE: catches the drift-prone SQL forms where a literal is bound to the column
// —  `col = 'x'`, `col <>/!= 'x'`, `col IN (...)`, `col = CASE … END`, and
// `'x'::enum_type` casts — which is exactly where all three bugs lived. It does
// NOT map positional INSERT ... VALUES literals to columns (those are constant and
// separately covered); if a future bug hides there, add an explicit case here.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── walk src for .js, plus the schema file ───────────────────────────────────
function walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') out.push(...walk(p)); }
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}
const srcFiles = walk(path.join(ROOT, 'src'));

// ── 1) build the enum contract from the DDL the code actually ships ──────────
const enums = {};                                   // typeName -> Set(values)
function ingestDDL(text) {
    for (const m of text.matchAll(/CREATE TYPE\s+(\w+)\s+AS ENUM\s*\(([^)]*)\)/gi)) {
        enums[m[1]] = new Set([...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]));
    }
    for (const m of text.matchAll(/ALTER TYPE\s+(\w+)\s+ADD VALUE(?:\s+IF NOT EXISTS)?\s+'([^']+)'/gi)) {
        (enums[m[1]] = enums[m[1]] || new Set()).add(m[2]);
    }
}
ingestDDL(fs.readFileSync(path.join(ROOT, 'database', 'schema.sql'), 'utf8'));
for (const f of srcFiles) ingestDDL(fs.readFileSync(f, 'utf8'));   // ALTER migrations

// ── 2) enum COLUMNS → their enum type (the DB's 5 enum-typed columns) ────────
// If a new enum column is added, add it here so its writes are guarded too.
const COLUMNS = {
    account_status: 'account_status_type',
    lead_type:      'lead_request_type',
    lead_status:    'lead_status_type',
    profile_status: 'profile_status_type',
    role:           'role_type',
};

// Sanity: every mapped type must have been found in the DDL, or the contract is
// silently empty and the test would pass vacuously.
let failures = 0;
const fail = (m) => { console.error('  ✗ ' + m); failures++; };
for (const [col, type] of Object.entries(COLUMNS)) {
    if (!enums[type] || enums[type].size === 0) fail(`contract MISSING: no DDL found defining ${type} (for column ${col})`);
}

// ── 3) scan source for literals bound to each enum column ────────────────────
// Strip line + block comments so commentary can't false-positive, and collapse
// to make the column-bound patterns easy to match. We match SQL assignment /
// comparison forms only (`=`, `<>`, `!=`, `IN`, `CASE…END`) — never the JS
// object-literal `col: 'x'` form, which is how LLM message arrays ({role:'system'})
// appear and must not be treated as DB writes.
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}
function litsIn(str) { return [...str.matchAll(/'([^']+)'/g)].map(m => m[1]); }

const offenders = [];   // {file, col, type, value, form}
for (const f of srcFiles) {
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    const rel = path.relative(ROOT, f);
    for (const [col, type] of Object.entries(COLUMNS)) {
        const valid = enums[type] || new Set();
        const record = (value, form) => {
            // Only alphanumeric/underscore literals are candidate enum values; a
            // literal with spaces/punctuation is some other string near the column.
            if (!/^[a-z0-9_]+$/i.test(value)) return;
            if (!valid.has(value)) offenders.push({ rel, col, type, value, form });
        };
        // a) col IN ( ... )
        for (const m of src.matchAll(new RegExp(`\\b${col}\\s+IN\\s*\\(([^)]*)\\)`, 'gi')))
            litsIn(m[1]).forEach(v => record(v, 'IN'));
        // b) col =/<>/!= CASE ... END  — only the THEN/ELSE *results* land in the
        //    column, so only those must be valid enum values. Literals in WHEN
        //    conditions compare other operands ($1 = 'none') and are NOT captured;
        //    any `col IN (...)` inside the condition is still caught by (a) above.
        for (const m of src.matchAll(new RegExp(`\\b${col}\\s*(?:=|<>|!=)\\s*CASE\\b([\\s\\S]*?)\\bEND\\b`, 'gi')))
            for (const r of m[1].matchAll(/\b(?:THEN|ELSE)\s+'([^']+)'/gi)) record(r[1], 'CASE');
        // c) col =/<>/!= 'literal'   (simple, non-CASE)
        for (const m of src.matchAll(new RegExp(`\\b${col}\\s*(?:=|<>|!=)\\s*'([^']+)'`, 'gi')))
            record(m[1], 'compare');
        // d) 'literal'::enum_type    (explicit cast anywhere)
        for (const m of src.matchAll(new RegExp(`'([^']+)'::${type}\\b`, 'gi')))
            record(m[1], 'cast');
    }
}

// ── report ───────────────────────────────────────────────────────────────────
console.log('Enum contract (from schema.sql + ALTER migrations):');
for (const [type, set] of Object.entries(enums))
    if (Object.values(COLUMNS).includes(type)) console.log(`  ${type}: ${[...set].join(', ')}`);
console.log(`\nScanned ${srcFiles.length} source files across ${Object.keys(COLUMNS).length} enum columns.`);

for (const o of offenders)
    fail(`${o.rel}: ${o.col} ${o.form} '${o.value}' — not a valid ${o.type} value (allowed: ${[...enums[o.type]].join(', ')})`);

if (failures) { console.error(`\nenum-integrity: ${failures} FAIL`); process.exit(1); }
console.log('\nenum-integrity: OK — every enum-column literal the code writes exists in the enum');
