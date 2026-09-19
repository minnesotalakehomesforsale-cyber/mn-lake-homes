'use strict';

// GATEPAR — single source of truth for lake-page indexability.
//
// A lake page is index,follow (and belongs in the sitemap) exactly when it has
// real content: editorial copy (intro_text/description) OR enough DNR facts to
// carry a fact-grounded intro ([[lake-dnr-intro]]'s fact floor). This rule lived
// in TWO places — the /lakes/:slug robots gate (JS) and the sitemap query (SQL)
// — and had to be hand-kept in sync. Any drift silently breaks the index ==
// sitemap invariant (orphaned indexables or "Discovered, not indexed" in GSC).
//
// So both now derive from here: `lakeIsIndexable(lake)` for the route, and
// `INDEXABLE_SQL` for the sitemap. test/lake-gate-parity runs the same fixtures
// through both and asserts they agree row-for-row.
//
// Note: this is the CONTENT rule only; callers gate status = 'published'
// separately (the route 404s non-published; the sitemap query filters status).

const { hasFacts, HAS_FACTS_SQL } = require('./lake-dnr-intro');

const hasEditorial = lake => !!((lake && lake.intro_text || '').trim() || (lake && lake.description || '').trim());

// True when a published lake has enough content to be indexable.
function lakeIsIndexable(lake) {
    return hasEditorial(lake) || hasFacts(lake);
}

// SQL WHERE fragment matching lakeIsIndexable(), to AND with status = 'published'.
// TRIM mirrors the JS .trim() so whitespace-only copy is not treated as content.
const INDEXABLE_SQL =
    `(COALESCE(TRIM(intro_text),'') <> '' OR COALESCE(TRIM(description),'') <> '' OR (${HAS_FACTS_SQL}))`;

module.exports = { lakeIsIndexable, hasEditorial, INDEXABLE_SQL };
