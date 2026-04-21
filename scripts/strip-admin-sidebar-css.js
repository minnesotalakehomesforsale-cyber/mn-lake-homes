#!/usr/bin/env node
/**
 * Follow-up cleanup to convert-admin-sidebars.js.
 *
 * The sidebar-specific CSS rules that now live in components/
 * admin-sidebar.js still exist as copy-pasted duplicates inside each
 * admin page's <style> block. They're harmless (same selectors, same
 * values) but they'll rot back into divergence the next time anyone
 * edits one of them.
 *
 * This script removes the duplicate rules. It keeps .admin-wrap and
 * .admin-main untouched since pages may set their own padding there.
 * Idempotent.
 */
const fs   = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'pages', 'admin');

// Exact single-line rule patterns to strip. Each regex matches at
// most one CSS rule block. Conservative on purpose — if a page has
// a quirky override the script leaves it alone.
const RULES_TO_STRIP = [
    /^\s*\.admin-side\s*\{[^}]*\}\s*$/gm,
    /^\s*\.admin-side\s+h1\s*\{[^}]*\}\s*$/gm,
    /^\s*\.admin-side\s+h1\s+span\s*\{[^}]*\}\s*$/gm,
    /^\s*\.side-label\s*\{[^}]*\}\s*$/gm,
    /^\s*\.side-nav\s*\{[^}]*\}\s*$/gm,
    /^\s*\.side-link\s*\{[^}]*\}\s*$/gm,
    /^\s*\.side-link:hover\s*\{[^}]*\}\s*$/gm,
    /^\s*\.side-link\.active\s*\{[^}]*\}\s*$/gm,
    /^\s*\.side-link\.dim\s*\{[^}]*\}\s*$/gm,
    /^\s*\.side-signout\s*\{[^}]*\}\s*$/gm,
    /^\s*\.side-signout:hover\s*\{[^}]*\}\s*$/gm,
    /^\s*\.cash-offer-badge\s*\{[^}]*\}\s*$/gm,
    /^\s*\.cash-offer-badge\.visible\s*\{[^}]*\}\s*$/gm,
];

function clean(file) {
    const full = path.join(DIR, file);
    if (!fs.existsSync(full)) return;
    const before = fs.readFileSync(full, 'utf8');
    let src = before;
    for (const re of RULES_TO_STRIP) src = src.replace(re, '');

    // Collapse 3+ blank lines that pile up after removal.
    src = src.replace(/\n{3,}/g, '\n\n');

    if (src !== before) {
        fs.writeFileSync(full, src);
        console.log('cleaned ', file, `(-${(before.length - src.length)} bytes)`);
    } else {
        console.log('unchanged', file);
    }
}

fs.readdirSync(DIR)
    .filter(f => f.endsWith('.html'))
    .forEach(clean);
