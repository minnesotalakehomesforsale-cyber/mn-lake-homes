'use strict';

// Boot-order guard for the schema. ensureTables() deliberately swallows
// per-statement migration warnings (most ALTERs are idempotent no-ops on a live
// DB), which means a genuinely broken migration — e.g. a column added to the
// WRONG table — can leave the app booting and then 500'ing every request that
// SELECTs the missing column. That is exactly what took all 69 lake pages down:
// notable_features/real_estate_context/faq were ALTERed onto `tags` instead of
// `lakes`, so the lake SSR SELECT threw "column does not exist" forever while
// the process kept happily serving.
//
// This module asserts, AFTER migrations run and BEFORE the port opens, that the
// columns the hot public SSR routes depend on actually exist. If any are
// missing it logs loudly and exits the process, so the deploy fails its health
// check and the orchestrator (Render) keeps the last healthy version live.
// Refusing to serve beats serving 500s.

// Columns the hot public SSR routes SELECT. If any is missing the route 500s for
// every row, so their existence is a boot invariant. Keep in sync with the
// corresponding SELECTs.
const REQUIRED_COLUMNS = {
    // lake-detail SSR SELECT (GET /lakes/:slug)
    lakes: [
        'intro_text', 'description', 'lifestyle_text', 'seasons_text',
        'notable_features', 'real_estate_context', 'faq',
        'dow_number', 'max_depth_ft', 'mean_depth_ft', 'surface_acres', 'littoral_acres',
        'water_clarity_ft', 'shoreline_miles', 'public_accesses', 'fish_species', 'dnr_survey_url',
        'gallery', 'hero_image_credit_name', 'hero_image_credit_url', 'hero_image_license',
    ],
};

// Pure check: returns [{ table, missing: [...] }] for every table missing one or
// more required columns. Empty array = schema is healthy. No logging, no exit —
// so it is trivially unit-testable.
async function findMissingColumns(pool, required = REQUIRED_COLUMNS) {
    const problems = [];
    for (const [table, cols] of Object.entries(required)) {
        const { rows } = await pool.query(
            `SELECT column_name FROM information_schema.columns
              WHERE table_name = $1 AND column_name = ANY($2::text[])`,
            [table, cols]);
        const have = new Set(rows.map(r => r.column_name));
        const missing = cols.filter(c => !have.has(c));
        if (missing.length) problems.push({ table, missing });
    }
    return problems;
}

// The guard itself. `log` and `exit` are injectable so tests can observe the
// decision without killing the test runner; production uses console.error and
// process.exit(1).
async function assertCriticalSchema(pool, opts = {}) {
    const { required = REQUIRED_COLUMNS, log = console.error, exit = process.exit } = opts;
    const problems = await findMissingColumns(pool, required);
    for (const { table, missing } of problems) {
        log(`FATAL: table "${table}" is missing required column(s): ${missing.join(', ')}. Refusing to serve.`);
    }
    if (problems.length) exit(1);
    return problems;
}

module.exports = { REQUIRED_COLUMNS, findMissingColumns, assertCriticalSchema };
