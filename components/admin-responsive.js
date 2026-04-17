/**
 * admin-responsive.js — makes the admin backend mobile-friendly
 *
 * Drops a shared style block + hamburger toggle into every admin page so
 * we don't have to edit 11 inline <style> blocks. On screens <=900px:
 *  • The left sidebar slides in from the left on demand instead of taking
 *    a column; main content fills the full width
 *  • A fixed hamburger button (top-left) toggles the sidebar
 *  • Dark backdrop appears behind the sidebar and closes it on tap
 *  • Tapping any nav link in the sidebar also closes the panel
 *  • Admin-main padding, stat grids, and wide tables get mobile-friendly
 *    fallbacks so content doesn't overflow
 */
(function() {
    if (document.getElementById('admin-responsive-styles')) return;

    const css = `
        /* ─── Hamburger — ALWAYS position:fixed, visibility toggled by media query ─── */
        .admin-hamburger {
            position: fixed !important;
            top: 12px !important;
            left: 12px !important;
            z-index: 9999 !important;
            width: 42px;
            height: 42px;
            align-items: center;
            justify-content: center;
            background: #1a202c;
            color: #fff;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .admin-hamburger:hover { background: #2d3748; }

        /* ─── Mobile overrides for the shared admin shell ─── */
        @media (max-width: 900px) {
            html, body { overflow-x: hidden; max-width: 100vw; }

            /* Bulletproof scroll lock (iOS-safe) — applied via JS setting
               top:-scrollY. The class simply locks position:fixed. */
            body.admin-side-open {
                position: fixed !important;
                left: 0 !important;
                right: 0 !important;
                width: 100% !important;
                overflow: hidden !important;
            }

            .admin-wrap {
                grid-template-columns: 1fr !important;
                min-height: 100vh;
                width: 100%;
            }
            .admin-side {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                bottom: 0 !important;
                height: 100dvh !important;
                width: 100vw !important;
                max-width: 100vw !important;
                transform: translateX(-100%);
                transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                z-index: 1200;
                box-shadow: 4px 0 20px rgba(0,0,0,0.3);
                display: flex !important;
                flex-direction: column !important;
                padding-bottom: calc(1rem + env(safe-area-inset-bottom)) !important;
            }
            @supports not (height: 100dvh) {
                .admin-side { height: 100vh !important; }
            }
            body.admin-side-open .admin-side { transform: translateX(0); }

            /* Sidebar inner scrolling — nav takes remaining space, overflows
               to scroll itself while the View Live Site + Sign Out stay anchored */
            .admin-side .side-nav {
                flex: 1 1 auto !important;
                overflow-y: auto !important;
                -webkit-overflow-scrolling: touch;
                min-height: 0;
            }
            /* The anchor + sign-out at the bottom of every admin sidebar */
            .admin-side .side-signout,
            .admin-side > a[href^="/index.html"] { flex-shrink: 0; }

            /* Show hamburger (its base styles set position; just flip display) */
            .admin-hamburger { display: flex !important; }

            .admin-main {
                padding: 4.5rem 1rem 2rem !important;
                width: 100% !important;
                max-width: 100vw;
                overflow-x: hidden;
                box-sizing: border-box;
            }
            .admin-main > * { max-width: 100%; box-sizing: border-box; }

            /* Hide hamburger while sidebar is open — sidebar has its own
               close button, and keeping both visible obscures the header */
            body.admin-side-open .admin-hamburger {
                opacity: 0;
                pointer-events: none;
                transform: scale(0.9);
            }

            /* Close button injected inside the sidebar on mobile */
            .admin-side-close {
                position: absolute !important;
                top: 0.75rem;
                right: 0.75rem;
                width: 36px;
                height: 36px;
                display: flex !important;
                align-items: center;
                justify-content: center;
                background: rgba(255,255,255,0.08);
                border: none;
                border-radius: 8px;
                color: #fff;
                cursor: pointer;
                z-index: 10;
                transition: background 0.15s;
            }
            .admin-side-close:hover { background: rgba(255,255,255,0.18); }
            .admin-side { padding-top: 3.5rem !important; }

            /* Backdrop behind sidebar */
            .admin-side-backdrop {
                display: block !important;
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.5);
                z-index: 1100;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease;
            }
            body.admin-side-open .admin-side-backdrop {
                opacity: 1;
                pointer-events: auto;
            }

            /* Tighten common admin widgets */
            .stat-grid, .stat-strip, .stat-row, .lead-stats {
                grid-template-columns: 1fr 1fr !important;
                gap: 0.75rem !important;
            }
            .stat-grid > *, .stat-strip > *, .stat-row > *, .lead-stats > * {
                padding: 1rem !important;
                min-width: 0;
            }
            .dash-grid, .review-grid, .detail-grid, .layout, .lm-expert-inner {
                grid-template-columns: 1fr !important;
                gap: 1.5rem !important;
            }
            .admin-main header {
                flex-direction: column !important;
                align-items: flex-start !important;
                gap: 1rem !important;
            }
            .quick-actions { width: 100%; flex-wrap: wrap; }
            .quick-actions .qa-btn { flex: 1 1 auto; text-align: center; }
            .controls-bar, .toolbar, .filter-row, .filter-container, .filter-tabs {
                gap: 0.5rem;
                flex-wrap: wrap;
            }
            .controls-bar input, .search-box, .search-input { min-width: 0; width: 100%; }

            /* Tables get wrapped into .mobile-table-scroll by JS — scroll horizontally */
            .mobile-table-scroll {
                overflow-x: auto !important;
                -webkit-overflow-scrolling: touch;
                width: 100%;
                max-width: 100%;
                border-radius: 12px;
            }
            .mobile-table-scroll table,
            .mobile-table-scroll .ledger-table { min-width: 680px; }
            .table-card, .list-card { overflow-x: auto; -webkit-overflow-scrolling: touch; }
            .ledger-table { min-width: 680px; }

            /* Blog post row — the 72px thumb + title + buttons overflow; shrink */
            .post-row { grid-template-columns: 56px 1fr !important; gap: 0.75rem !important; padding: 1rem !important; }
            .post-row .post-actions { grid-column: 1 / -1; flex-wrap: wrap; }
            .post-thumb, .post-thumb-placeholder { width: 56px !important; height: 42px !important; }

            /* Inquiry rows — collapse the wide grid */
            .inq-row { grid-template-columns: 10px 1fr auto !important; gap: 0.6rem !important; padding: 0.9rem 1rem !important; }
            .inq-row .col-msg, .inq-row .col-src { display: none !important; }

            /* Detail modals — full width with margin on mobile */
            .ovl .modal, .blog-overlay .blog-modal, .editor-overlay .editor-panel,
            .modal-overlay-admin .modal-box {
                width: calc(100vw - 1rem) !important;
                max-width: calc(100vw - 1rem) !important;
            }
            .m-grid { grid-template-columns: 1fr !important; gap: 0.85rem !important; }
            .field-grid, .blog-form-row, .modal-grid { grid-template-columns: 1fr !important; }

            /* AI assistant bubble — stay out of the way of hamburger */
            .ai-asst-bubble { bottom: 16px; right: 16px; }

            /* Sidebar inner tweaks */
            .admin-side h1 { margin-bottom: 2rem; }
            .admin-side { padding: 1.5rem 1.25rem; }

            /* Inline action-cell row overflow */
            td .action-btn, td .btn, td button { font-size: 0.75rem; padding: 0.3rem 0.55rem; }

            /* Add-row buttons in table/page headers often overflow */
            .btn-add, .copy-btn, .export-btn { white-space: nowrap; }
        }
        @media (max-width: 500px) {
            .stat-grid, .stat-strip, .stat-row, .lead-stats {
                grid-template-columns: 1fr !important;
            }
            .admin-main { padding: 4.5rem 0.85rem 1.5rem !important; }
            .admin-main h1 { font-size: 1.6rem !important; }
            .m-hdr, .panel-body, .blog-modal-body, .editor-body { padding: 1.25rem !important; }
            .mobile-table-scroll table,
            .mobile-table-scroll .ledger-table,
            .ledger-table { min-width: 600px; }
        }
    `;
    const style = document.createElement('style');
    style.id = 'admin-responsive-styles';
    style.textContent = css;
    document.head.appendChild(style);

    // ── Wrap unwrapped tables so CSS overflow-x: auto can actually work ──
    function wrapTables() {
        document.querySelectorAll('table').forEach(tbl => {
            // Skip if already wrapped or already inside a scrolling container
            if (tbl.closest('.mobile-table-scroll')) return;
            if (tbl.closest('.table-card, .list-card')) return;
            const wrap = document.createElement('div');
            wrap.className = 'mobile-table-scroll';
            tbl.parentNode.insertBefore(wrap, tbl);
            wrap.appendChild(tbl);
        });
    }

    // ── Inject hamburger + backdrop once the body exists ──
    function inject() {
        if (document.querySelector('.admin-hamburger')) return;

        const btn = document.createElement('button');
        btn.className = 'admin-hamburger';
        btn.setAttribute('aria-label', 'Toggle navigation');
        btn.style.display = 'none';  // Hidden on desktop; mobile media query flips it
        btn.innerHTML = `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>`;

        const backdrop = document.createElement('div');
        backdrop.className = 'admin-side-backdrop';
        backdrop.style.display = 'none';

        document.body.appendChild(btn);
        document.body.appendChild(backdrop);

        // Scroll lock that survives iOS bounce: preserve scrollY, pin body,
        // restore on close. Uses body.style.top = -scrollY so the page
        // doesn't appear to jump.
        let lockedScrollY = 0;
        const open = () => {
            if (document.body.classList.contains('admin-side-open')) return;
            lockedScrollY = window.scrollY || window.pageYOffset || 0;
            document.body.style.top = `-${lockedScrollY}px`;
            document.body.classList.add('admin-side-open');
        };
        const close = () => {
            if (!document.body.classList.contains('admin-side-open')) return;
            document.body.classList.remove('admin-side-open');
            document.body.style.top = '';
            window.scrollTo(0, lockedScrollY);
        };
        const toggle = () => {
            if (document.body.classList.contains('admin-side-open')) close();
            else open();
        };

        btn.addEventListener('click', toggle);
        backdrop.addEventListener('click', close);

        // Close the mobile sidebar whenever a nav link inside it is tapped
        const sidebar = document.querySelector('.admin-side');
        if (sidebar) {
            // Inject close-X button inside the sidebar (mobile only; CSS hides on desktop)
            if (!sidebar.querySelector('.admin-side-close')) {
                const closeX = document.createElement('button');
                closeX.className = 'admin-side-close';
                closeX.setAttribute('aria-label', 'Close menu');
                closeX.style.display = 'none'; // media query flips to flex on mobile
                closeX.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                closeX.addEventListener('click', close);
                sidebar.insertBefore(closeX, sidebar.firstChild);
            }
            sidebar.querySelectorAll('a').forEach(a => {
                a.addEventListener('click', () => setTimeout(close, 50));
            });
        }

        // Esc closes
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });

        // Wrap tables now, and again after any dynamic data loads (observer)
        wrapTables();
        const mo = new MutationObserver(() => wrapTables());
        mo.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();
