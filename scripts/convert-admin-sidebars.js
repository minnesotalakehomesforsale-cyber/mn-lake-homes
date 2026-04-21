#!/usr/bin/env node
/**
 * One-shot migration: swap each pages/admin/*.html's hand-coded
 * <aside class="admin-side">...</aside> for the shared
 * <admin-sidebar active="..."></admin-sidebar> web component,
 * and make sure components/admin-sidebar.js is loaded.
 *
 * Idempotent — re-running is a no-op for files already migrated.
 */
const fs   = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'pages', 'admin');

// Map filename → active nav key (see components/admin-sidebar.js NAV list).
// Page -> key:
const MAP = {
    'dashboard.html':    'dashboard',
    'agents.html':       'agents',
    'agent-review.html': 'agents',
    'leads.html':        'leads',
    'lead-review.html':  'leads',
    'inquiries.html':    'inquiries',
    'blog.html':         'blog',
    'cash-offers.html':  'cash-offers',
    'users.html':        'users',
    'user-review.html':  'users',
    'tasks.html':        'tasks',
    'tags.html':         'tags',
    'database.html':     'database',
    'marketing.html':    '',
};

function migrate(file) {
    const fullPath = path.join(DIR, file);
    if (!fs.existsSync(fullPath)) return { file, status: 'skip-missing' };
    let src = fs.readFileSync(fullPath, 'utf8');
    const before = src;
    const activeKey = MAP[file] || '';

    // 1. Replace the first <aside class="admin-side"> ... </aside> block.
    //    We use a non-greedy match across newlines. There's only one per page.
    const asideRe = /<aside class="admin-side"[\s\S]*?<\/aside>/;
    if (asideRe.test(src)) {
        src = src.replace(asideRe, `<admin-sidebar active="${activeKey}"></admin-sidebar>`);
    }

    // 2. Make sure components/admin-sidebar.js is loaded. Prefer to drop
    //    the tag next to existing admin-responsive.js include if present,
    //    otherwise prepend to </head>.
    if (!/admin-sidebar\.js/.test(src)) {
        if (/admin-responsive\.js["'][^>]*>\s*<\/script>/.test(src)) {
            src = src.replace(
                /(<script[^>]*admin-responsive\.js["'][^>]*>\s*<\/script>)/,
                `$1\n    <script src="../../components/admin-sidebar.js" defer></script>`
            );
        } else if (/<\/head>/i.test(src)) {
            src = src.replace(
                /<\/head>/i,
                `    <script src="../../components/admin-sidebar.js" defer></script>\n</head>`
            );
        }
    }

    if (src === before) return { file, status: 'already-migrated' };
    fs.writeFileSync(fullPath, src);
    return { file, status: 'migrated', activeKey };
}

const results = Object.keys(MAP).map(migrate);
for (const r of results) {
    console.log(
        r.status.padEnd(20),
        r.file.padEnd(24),
        r.activeKey !== undefined ? `active="${r.activeKey}"` : ''
    );
}
