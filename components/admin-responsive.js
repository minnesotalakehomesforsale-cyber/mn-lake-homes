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
        /* ─── Mobile overrides for the shared admin shell ─── */
        @media (max-width: 900px) {
            html, body { overflow-x: hidden; }
            .admin-wrap {
                grid-template-columns: 1fr !important;
                min-height: 100vh;
            }
            .admin-side {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                bottom: 0 !important;
                height: 100vh !important;
                width: 280px !important;
                max-width: 85vw;
                transform: translateX(-100%);
                transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                z-index: 1200;
                box-shadow: 4px 0 20px rgba(0,0,0,0.3);
            }
            body.admin-side-open .admin-side { transform: translateX(0); }

            .admin-main {
                padding: 4.5rem 1.25rem 2rem !important;
                width: 100% !important;
                max-width: 100vw;
                overflow-x: hidden;
            }

            /* Hamburger toggle — fixed top-left */
            .admin-hamburger {
                display: flex !important;
                position: fixed;
                top: 0.85rem;
                left: 0.85rem;
                z-index: 1300;
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
            }
            .admin-hamburger:hover { background: #2d3748; }

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
            .dash-grid, .review-grid, .detail-grid, .layout, .lm-expert-inner {
                grid-template-columns: 1fr !important;
                gap: 1.5rem !important;
            }
            .admin-main header { flex-direction: column; align-items: flex-start !important; gap: 1rem; }
            .quick-actions { width: 100%; }
            .quick-actions .qa-btn { flex: 1; text-align: center; }
            .controls-bar, .toolbar, .filter-row { gap: 0.5rem; }

            /* Wide tables — horizontal scroll instead of overflow */
            .table-card, .list-card, .ledger-table {
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }
            .ledger-table { display: block; }
            table { min-width: 600px; }

            /* Detail modals — full width with margin on mobile */
            .ovl .modal, .blog-overlay .blog-modal, .editor-overlay .editor-panel,
            .modal-overlay-admin .modal-box {
                width: calc(100vw - 1.5rem) !important;
                max-width: calc(100vw - 1.5rem) !important;
            }

            /* AI assistant bubble moves up so hamburger doesn't collide if both are visible */
            .ai-asst-bubble { bottom: 16px; right: 16px; }

            /* Sidebar inner tweaks */
            .admin-side h1 { margin-bottom: 2rem; }
            .admin-side { padding: 1.5rem 1.25rem; }
        }
        @media (max-width: 500px) {
            .stat-grid, .stat-strip, .stat-row, .lead-stats {
                grid-template-columns: 1fr !important;
            }
            .admin-main { padding: 4.5rem 1rem 1.5rem !important; }
            h1 { font-size: 1.6rem !important; }
        }
    `;
    const style = document.createElement('style');
    style.id = 'admin-responsive-styles';
    style.textContent = css;
    document.head.appendChild(style);

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

        const close = () => document.body.classList.remove('admin-side-open');
        const open  = () => document.body.classList.add('admin-side-open');
        const toggle = () => document.body.classList.toggle('admin-side-open');

        btn.addEventListener('click', toggle);
        backdrop.addEventListener('click', close);

        // Close the mobile sidebar whenever a nav link inside it is tapped
        const sidebar = document.querySelector('.admin-side');
        if (sidebar) {
            sidebar.querySelectorAll('a').forEach(a => {
                a.addEventListener('click', () => setTimeout(close, 50));
            });
        }

        // Esc closes
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();
