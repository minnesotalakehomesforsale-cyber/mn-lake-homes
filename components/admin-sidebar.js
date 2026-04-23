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
 * Also keeps parity with the badge elements the rest of the admin
 * relies on: #nav-badge-inquiries, #nav-badge-tasks, .cash-offer-badge.
 * admin-nav-badges.js continues to poll and toggle them.
 */

(function () {
    // ── Base (desktop) sidebar styles, injected once ───────────────────
    // Keep these in lock-step with what admin-responsive.js overrides
    // at ≤900px. Single source means future tweaks land in one file.
    const BASE_CSS = `
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
        .admin-main { padding: 3rem 3.5rem; overflow-y: auto; }
    `;

    function injectStyles() {
        if (document.getElementById('admin-sidebar-styles')) return;
        const el = document.createElement('style');
        el.id = 'admin-sidebar-styles';
        el.textContent = BASE_CSS;
        document.head.appendChild(el);
    }

    // ── Canonical nav list ─────────────────────────────────────────────
    // Order, labels, href, and active-key all live here. Change once, ships
    // to every admin page. Add a new item by appending a row below.
    const NAV = [
        { key: 'dashboard',   href: 'dashboard.html',  label: 'Dashboard' },
        { key: 'metrics',     href: 'metrics.html',    label: 'Metrics' },
        { key: 'agents',      href: 'agents.html',     label: 'Agents Directory' },
        { key: 'leads',       href: 'leads.html',      label: 'Central Leads', badgeId: 'nav-badge-leads' },
        { key: 'inquiries',   href: 'inquiries.html',  label: 'Inquiries', badgeId: 'nav-badge-inquiries' },
        { key: 'blog',        href: 'blog.html',       label: 'Blog & Content' },
        { key: 'resources',   href: 'resources.html',  label: 'Resources' },
        { key: 'cash-offers', href: 'cash-offers.html',label: 'Cash Offers', cashBadge: true },
        { key: 'users',       href: 'users.html',      label: 'Users Management' },
        { key: 'tasks',       href: 'tasks.html',      label: 'Tasks', badgeId: 'nav-badge-tasks' },
        { key: 'tags',        href: 'tags.html',       label: 'Towns' },
        { key: 'lakes',       href: 'lakes.html',      label: 'Lakes' },
        { key: 'businesses',  href: 'businesses.html', label: 'Businesses' },
        { key: 'database',    href: 'database.html',   label: 'Database' },
    ];

    function renderNav(activeKey) {
        return NAV.map(item => {
            const activeCls = item.key === activeKey ? ' active' : '';
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
        }
    }

    if (!customElements.get('admin-sidebar')) {
        customElements.define('admin-sidebar', AdminSidebar);
    }
})();
