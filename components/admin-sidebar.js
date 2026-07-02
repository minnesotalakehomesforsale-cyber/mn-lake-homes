/**
 * admin-sidebar.js — Shared admin sidebar, single source of truth.
 *
 * Usage (drop-in replacement for the ~25 lines of copy-pasted <aside>
 * markup on every admin page):
 *
 *   <admin-sidebar active="dashboard"></admin-sidebar>
 *
 * The `active` attribute values match each nav key: dashboard, agents,
 * leads, inquiries, blog, cash-offers, users, tasks, tags, database.
 * If omitted or unknown, no item is highlighted.
 *
 * Light DOM (no shadow) so the mobile overrides injected by
 * components/admin-responsive.js — which target .admin-side /
 * .side-link selectors — keep working unchanged.
 *
 * Also keeps parity with the badge elements the rest of the admin relies on:
 *   #nav-badge-leads, #nav-badge-inquiries, #nav-badge-messages,
 *   #nav-badge-tasks, #nav-badge-system, .cash-offer-badge.
 * admin-nav-badges.js continues to poll and toggle them.
 */

(function () {
    // ── Base (desktop) sidebar styles, injected once ───────────────────
    // Keep these in lock-step with what admin-responsive.js overrides
    // at ≤900px. Single source means future tweaks land in one file.
    const BASE_CSS = `
        /* Reserve scrollbar gutter so pages with taller content don't shift
           the sidebar horizontally when you navigate between admin pages. */
        html { scrollbar-gutter: stable; }
        .admin-wrap { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
        .admin-side {
            background: #1a202c; color: #fff;
            padding: 2rem 1.5rem;
            position: sticky; top: 0; height: 100vh;
            overflow-y: auto;
            display: flex; flex-direction: column;
        }
        .admin-side h1 {
            font-size: 1.3rem; font-weight: 800; letter-spacing: -0.5px;
            margin: 0 0 0.25rem; padding-left: 0.5rem; color: #fff;
        }
        .admin-side h1 span { color: #1d6df2; }
        .admin-side .side-sub {
            font-size: 0.72rem; color: #a0aec0;
            padding-left: 0.5rem; margin: 0 0 2.25rem; letter-spacing: 0.2px;
        }
        .side-label {
            font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px;
            color: #4a5568; margin: 0 0 0.75rem;
            padding-left: 0.5rem; font-weight: 700;
        }
        .side-nav { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; }
        .side-link {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.75rem 1rem; border-radius: 8px;
            color: #a0aec0; text-decoration: none;
            font-size: 0.9rem; font-weight: 500;
            transition: all 0.15s;
        }
        .side-link:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .side-link.active { background: rgba(255,255,255,0.1); color: #fff; font-weight: 600; }
        .side-link.dim { opacity: 0.35; cursor: default; pointer-events: none; }
        .side-view-live {
            display: block;
            padding: 0.75rem 1rem; border-radius: 8px;
            color: #a0aec0; text-decoration: none;
            font-size: 0.85rem; font-weight: 500;
            margin-top: 0.5rem;
            border: 1px solid rgba(255,255,255,0.08);
            transition: background 0.15s;
        }
        .side-view-live:hover { background: rgba(255,255,255,0.05); }
        .side-signout {
            display: block;
            padding: 0.75rem 1rem; border-radius: 8px;
            color: #fc8181; text-decoration: none;
            font-size: 0.9rem; font-weight: 500;
            margin-top: 1rem;
            transition: all 0.15s;
        }
        .side-signout:hover { background: rgba(252,129,129,0.1); }
        .side-badge {
            background: #ef4444; color: #fff;
            font-size: 0.68rem; font-weight: 800;
            padding: 0.1rem 0.45rem; border-radius: 99px;
            min-width: 18px; text-align: center; line-height: 1.3;
            display: none;
        }
        .cash-offer-badge {
            display: none; background: #dc2626; color: #fff;
            font-size: 0.68rem; font-weight: 700;
            padding: 0.1rem 0.45rem; border-radius: 99px;
            margin-left: auto; min-width: 18px; text-align: center;
        }
        .cash-offer-badge.visible { display: inline-block; }
        .admin-main { padding: 3rem 3.5rem; background: #f7f9fa; overflow-y: auto; }
    `;

    // ── Shared admin design system (cohesive polish) ───────────────────
    // One source of truth for how CONTENT looks on every admin page:
    // headers, cards/panels, tables, buttons, inputs, badges, modals. This
    // is injected on every page (via the sidebar, which is everywhere) and
    // loads after each page's own <style>, so it normalizes the historically
    // divergent per-page styling (.ledger-table vs .biz-table, .btn-add vs
    // .btn-primary, two modal systems, etc.) into one look. Keeps the existing
    // identity: #1a202c chrome, #1d6df2 accent, #f7f9fa canvas. Visual-only —
    // no layout/structure props — so it can't break existing page layouts.
    const DESIGN_CSS = `
        .admin-main { color: #1a202c; font-family: 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .admin-main ::selection { background: rgba(29,109,242,0.18); }

        /* Page title weight/tracking only — NOT color, so dark-hero headings
           (e.g. the dashboard welcome banner) keep their light text. Normal
           headings inherit the dark body color on the light canvas. */
        .admin-main h1 { font-weight: 800; letter-spacing: -0.8px; }

        /* Cards — one soft, elevated surface. (.panel is intentionally left
           alone: it's a card on some pages but a tab-content wrapper on
           others, and those card-panels are already styled consistently.) */
        .admin-main .card {
            background: #fff; border: 1px solid #edf2f7; border-radius: 14px;
            box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 10px 26px rgba(16,24,40,0.05);
        }

        /* Tables — normalize the divergent table classes into one look */
        .admin-main .ledger-table, .admin-main .biz-table, .admin-main .data-table {
            width: 100%; border-collapse: separate; border-spacing: 0;
            background: #fff; border: 1px solid #edf2f7; border-radius: 14px; overflow: hidden;
            box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 10px 26px rgba(16,24,40,0.05);
        }
        .admin-main .ledger-table th, .admin-main .biz-table th, .admin-main .data-table th {
            background: #f9fafb; text-align: left; padding: 0.95rem 1.35rem;
            font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;
            color: #718096; border-bottom: 1px solid #edf2f7;
        }
        .admin-main .ledger-table td, .admin-main .biz-table td, .admin-main .data-table td {
            padding: 0.95rem 1.35rem; border-bottom: 1px solid #f2f5f8;
            font-size: 0.9rem; color: #2d3748; vertical-align: middle;
        }
        .admin-main .ledger-table tr:last-child td, .admin-main .biz-table tr:last-child td, .admin-main .data-table tr:last-child td { border-bottom: none; }
        .admin-main .ledger-table tr.data-row:hover, .admin-main .biz-table tbody tr:hover, .admin-main .data-table tr.data-row:hover { background: #f6faff; cursor: pointer; }

        /* Buttons — one primary + one ghost, with a subtle lift */
        .admin-main .btn-primary, .admin-main .btn-add {
            background: #1d6df2; color: #fff; border: none; border-radius: 10px;
            padding: 0.7rem 1.4rem; font-weight: 700; font-size: 0.9rem; font-family: inherit; cursor: pointer;
            box-shadow: 0 2px 6px rgba(29,109,242,0.25); transition: transform .12s, box-shadow .12s, background .12s;
        }
        .admin-main .btn-primary:hover, .admin-main .btn-add:hover { background: #155bc8; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(29,109,242,0.32); }
        .admin-main .btn-ghost {
            background: #fff; color: #2d3748; border: 1px solid #e2e8f0; border-radius: 10px;
            padding: 0.7rem 1.25rem; font-weight: 600; font-size: 0.9rem; font-family: inherit; cursor: pointer; transition: all .12s;
        }
        .admin-main .btn-ghost:hover { border-color: #cbd5e0; background: #f7f9fa; }

        /* Inputs — one field style + one accent focus ring */
        .admin-main .field-inp, .admin-main .search-input, .admin-main .filter-select,
        .admin-main .field input, .admin-main .field select, .admin-main .field textarea {
            font-family: inherit; font-size: 0.9rem; border: 1px solid #e2e8f0; border-radius: 10px;
            background-color: #fff; color: #1a202c; outline: none; transition: border-color .12s, box-shadow .12s;
        }
        .admin-main .field-inp:focus, .admin-main .search-input:focus, .admin-main .filter-select:focus,
        .admin-main .field input:focus, .admin-main .field select:focus, .admin-main .field textarea:focus {
            border-color: #1d6df2; box-shadow: 0 0 0 3px rgba(29,109,242,0.12);
        }

        /* Status pills — consistent shape */
        .admin-main .s-badge { border-radius: 99px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; padding: 0.28rem 0.7rem; }

        /* Modals — both systems (.ovl/.modal + .modal-overlay-admin/.modal-box)
           get one elevated container. Only loads on admin pages, so safe. */
        .modal, .modal-box { border-radius: 16px; box-shadow: 0 30px 60px rgba(16,24,40,0.25); }
        .m-hdr { border-bottom: 1px solid #edf2f7; }
    `;

    function injectStyles() {
        if (!document.getElementById('admin-sidebar-styles')) {
            const el = document.createElement('style');
            el.id = 'admin-sidebar-styles';
            el.textContent = BASE_CSS;
            document.head.appendChild(el);
        }
        // Shared design system — appended AFTER the page's own inline <style>
        // (which lives in <head>), so it wins the cascade and unifies the
        // divergent per-page component styles into one cohesive look. Scoped
        // to admin content classes only; the sidebar is untouched.
        if (!document.getElementById('admin-ui-styles')) {
            const ds = document.createElement('style');
            ds.id = 'admin-ui-styles';
            ds.textContent = DESIGN_CSS;
            document.head.appendChild(ds);
        }
    }

    // ── Canonical nav list ─────────────────────────────────────────────
    // Order, labels, href, and active-key all live here. Change once, ships
    // to every admin page. Add a new item by appending a row below.
    const NAV = [
        { key: 'dashboard',   href: 'dashboard.html',  label: 'Dashboard' },
        { key: 'agents',      href: 'agents.html',     label: 'Agents Directory' },
        { key: 'leads',       href: 'leads.html',      label: 'Central Leads', badgeId: 'nav-badge-leads' },
        { key: 'inquiries',   href: 'inquiries.html',  label: 'Inquiries', badgeId: 'nav-badge-inquiries' },
        { key: 'messages',    href: 'messages.html',   label: 'Messages', badgeId: 'nav-badge-messages' },
        // Marketing rolls up Blog & Content along with three new tabs
        // (Dashboard, Newsletter, Social Media). Blog stays accessible at
        // its old URL too — the alias keeps the highlight working.
        { key: 'marketing',   href: 'marketing.html',  label: 'Marketing', aliases: ['blog'] },
        { key: 'resources',   href: 'resources.html',  label: 'Resources' },
        { key: 'cash-offers', href: 'cash-offers.html',label: 'Cash Offers', cashBadge: true },
        { key: 'users',       href: 'users.html',      label: 'Users Management' },
        { key: 'tasks',       href: 'tasks.html',      label: 'Tasks', badgeId: 'nav-badge-tasks' },
        // Lakes + Towns + Businesses share one page (lakes-towns.html) with
        // an Overview tab plus one tab per section. Each section tab is the
        // existing standalone admin page in embed-mode iframe form, so all
        // pre-existing logic keeps working unchanged. The standalone slugs
        // are aliased so direct hits on lakes.html / tags.html /
        // businesses.html still highlight this entry in the sidebar.
        { key: 'lakes-towns', href: 'lakes-towns.html', label: 'Lakes, Towns & Businesses', aliases: ['lakes', 'tags', 'businesses'] },
        { key: 'listings',    href: 'listings.html',   label: 'Listings' },
        { key: 'reviews',     href: 'reviews.html',    label: 'Reviews' },
        // Site-wide image manager — every DB-backed image (lakes/towns/
        // businesses/agents/blog/resources) in one grid with one-click
        // replace. Hardcoded HTML/CSS images aren't editable here yet.
        { key: 'images',      href: 'images.html',     label: 'Images' },
        // Metrics + Database share one page (system.html) with a tab per
        // section. Standalone slugs are aliased so direct hits on
        // metrics.html / database.html still highlight this entry.
        { key: 'system',      href: 'system.html',     label: 'Metrics & Database', aliases: ['metrics', 'database'], badgeId: 'nav-badge-system' },
    ];

    function renderNav(activeKey) {
        return NAV.map(item => {
            const matches = item.key === activeKey
                || (Array.isArray(item.aliases) && item.aliases.includes(activeKey));
            const activeCls = matches ? ' active' : '';
            let badge = '';
            if (item.badgeId) {
                badge = `<span id="${item.badgeId}" class="side-badge">0</span>`;
            } else if (item.cashBadge) {
                badge = `<span class="cash-offer-badge">0</span>`;
            }
            return `<a href="${item.href}" class="side-link${activeCls}" id="nav-link-${item.key}">
                <span>${item.label}</span>${badge}
            </a>`;
        }).join('');
    }

    class AdminSidebar extends HTMLElement {
        connectedCallback() {
            injectStyles();
            const active = (this.getAttribute('active') || '').trim();
            this.innerHTML = `
                <aside class="admin-side">
                    <h1>MNLH <span>ADMIN</span></h1>
                    <p class="side-sub">Platform Admin</p>
                    <p class="side-label">Platform Operations</p>
                    <nav class="side-nav">
                        ${renderNav(active)}
                    </nav>
                    <a href="/index.html" target="_blank" class="side-view-live">↗ View Live Site</a>
                    <a href="#" class="side-signout"
                       onclick="event.preventDefault(); fetch('/api/auth/logout',{method:'POST',credentials:'include'}).finally(() => { window.location.href='/index.html'; });">
                       Sign Out
                    </a>
                </aside>
            `;
            // Apply per-admin tab permissions. super_admin (owner) sees all
            // tabs; a regular admin with admin_tab_permissions = [...keys]
            // only sees those nav items. allowed_tabs === null means full
            // access (default for existing admins — no breakage). Fail open
            // on a network error so an admin never gets locked out of the UI.
            this.applyPermissions();
        }

        async applyPermissions() {
            try {
                const r = await fetch('/api/auth/session', { credentials: 'include' });
                if (!r.ok) return;
                const sess = await r.json();
                if (sess.role === 'super_admin') return;            // owner: all tabs
                if (!Array.isArray(sess.allowed_tabs)) return;       // null: all tabs
                const allow = new Set(sess.allowed_tabs);
                this.querySelectorAll('.side-link').forEach(link => {
                    const id = link.id || '';                        // nav-link-<key>
                    const key = id.replace(/^nav-link-/, '');
                    if (key && !allow.has(key)) link.style.display = 'none';
                });
            } catch (_) { /* keep everything visible on failure */ }
        }
    }

    if (!customElements.get('admin-sidebar')) {
        customElements.define('admin-sidebar', AdminSidebar);
    }
})();

// ── Universal click-to-sort for admin tables ───────────────────────────────
// Makes every admin table (.ledger-table / .biz-table / .data-table, or any
// table[data-sortable]) sortable by clicking a column header — like a HubSpot
// sheet. Works on the already-rendered DOM, so no per-page data code changes.
// Auto-detects number / date / text per column; toggles asc↔desc; shows an
// indicator. Columns can opt out with `data-nosort` on the <th>; a cell can
// provide an explicit sort key with `data-sort-value`.
(function () {
    const SORTABLE = '.ledger-table, .biz-table, .data-table, table[data-sortable]';
    const SKIP_HEADERS = /^(actions?|manage|edit|options|controls|—|)$/i;

    function cellValue(row, idx) {
        const cell = row.children[idx];
        if (!cell) return '';
        if (cell.dataset && cell.dataset.sortValue != null) return cell.dataset.sortValue;
        return (cell.textContent || '').trim();
    }
    function compare(a, b) {
        const cleanA = a.replace(/[\s,$%]/g, ''), cleanB = b.replace(/[\s,$%]/g, '');
        const numA = parseFloat(cleanA), numB = parseFloat(cleanB);
        const isNumA = cleanA !== '' && !isNaN(numA) && /^-?[\d.]+$/.test(cleanA);
        const isNumB = cleanB !== '' && !isNaN(numB) && /^-?[\d.]+$/.test(cleanB);
        if (isNumA && isNumB) return numA - numB;
        const dA = Date.parse(a), dB = Date.parse(b);
        if (!isNaN(dA) && !isNaN(dB)) return dA - dB;
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    }
    function makeSortable(table) {
        if (table.__adminSortable || !table.tHead || !table.tBodies.length) return;
        const headRow = table.tHead.rows[0];
        if (!headRow) return;
        table.__adminSortable = true;
        [...headRow.cells].forEach((th, idx) => {
            const label = (th.textContent || '').trim();
            if (th.hasAttribute('data-nosort') || SKIP_HEADERS.test(label)) return;
            th.style.cursor = 'pointer';
            th.style.userSelect = 'none';
            th.title = 'Sort by ' + label;
            const ind = document.createElement('span');
            ind.className = 'th-sort-ind';
            ind.textContent = ' ↕';
            ind.style.cssText = 'opacity:0.3;font-size:0.85em;';
            th.appendChild(ind);
            th.addEventListener('click', () => {
                const tbody = table.tBodies[0];
                const rows = [...tbody.rows].filter(r => r.children.length > 1);
                if (rows.length < 2) return;
                const asc = table.__sortCol === idx ? !table.__sortAsc : true;
                table.__sortCol = idx; table.__sortAsc = asc;
                rows.sort((r1, r2) => { const c = compare(cellValue(r1, idx), cellValue(r2, idx)); return asc ? c : -c; });
                rows.forEach(r => tbody.appendChild(r));
                headRow.querySelectorAll('.th-sort-ind').forEach(i => { i.textContent = ' ↕'; i.style.opacity = '0.3'; });
                ind.textContent = asc ? ' ▲' : ' ▼'; ind.style.opacity = '1';
            });
        });
    }
    function enhanceAll() { document.querySelectorAll(SORTABLE).forEach(makeSortable); }
    // Catch tables that render synchronously AND those fetched async by the page.
    if (document.readyState !== 'loading') enhanceAll();
    document.addEventListener('DOMContentLoaded', enhanceAll);
    [300, 800, 1500, 3000].forEach(ms => setTimeout(enhanceAll, ms));
    window.enhanceAdminTables = enhanceAll;   // pages can call after a re-render
})();
