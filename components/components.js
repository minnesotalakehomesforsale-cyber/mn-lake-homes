/**
 * components.js — Global Web Components
 * Handles <global-header>, <global-footer>, <lead-modal>
 *
 * Auth State:
 *   All auth-aware UI is driven by /api/auth/session (real HttpOnly JWT cookie).
 *   No localStorage is used for auth state.
 */

// Absolute paths so the header works from every URL shape the server
// routes to — /, /pages/public/*.html, /towns/:slug, /lakes/:slug,
// /businesses/:slug, /business/dashboard, etc. Relative paths were
// resolving to nonsense like /towns/pages/public/sell.html.
const getDepth = () => window.location.pathname.startsWith('/pages/') ? '' : '/pages/public/';
const getRoot  = () => window.location.pathname.startsWith('/pages/') ? '../../' : '/';

// ─── Global Header ────────────────────────────────────────────────────────────

class GlobalHeader extends HTMLElement {
    connectedCallback() {
        const bp = getDepth();
        const rp = getRoot();

        // Render skeleton header immediately, then hydrate auth state asynchronously
        this.innerHTML = this._buildHeader(bp, rp, null);
        this._wireMegamenu();
        this._wireMobileMenu();

        // Check real session
        fetch('/api/auth/session')
            .then(r => { if (r.ok) return r.json(); throw new Error('not_logged_in'); })
            .then(data => {
                // Re-render with authenticated state
                this.innerHTML = this._buildHeader(bp, rp, data);
                this._wireMegamenu();
                this._wireMobileMenu();
            })
            .catch(() => {
                // Not logged in — already rendered guest state above
            });
    }

    _wireMobileMenu() {
        const toggle   = this.querySelector('#mobile-menu-toggle');
        const close    = this.querySelector('#mobile-menu-close');
        const menu     = this.querySelector('#mobile-menu');
        const backdrop = this.querySelector('#mobile-menu-backdrop');
        if (!toggle || !menu || !backdrop) return;

        const open = () => {
            menu.classList.add('open');
            backdrop.classList.add('open');
            toggle.setAttribute('aria-expanded', 'true');
            menu.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        };
        const closeMenu = () => {
            menu.classList.remove('open');
            backdrop.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
            menu.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        };

        toggle.addEventListener('click', open);
        if (close)    close.addEventListener('click', closeMenu);
        backdrop.addEventListener('click', closeMenu);
        // Close when any real link inside the panel is clicked (but not anchor-only "#")
        menu.querySelectorAll('a[href]').forEach(a => {
            if (a.getAttribute('href') === '#') return;
            a.addEventListener('click', () => setTimeout(closeMenu, 50));
        });
        // Accordion toggle on section titles
        menu.querySelectorAll('.mobile-menu-section-title').forEach(btn => {
            btn.addEventListener('click', () => {
                const section = btn.closest('.mobile-menu-section');
                const isOpen = section.classList.toggle('open');
                btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            });
        });
        // Esc key closes
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menu.classList.contains('open')) closeMenu();
        });
    }

    _wireMegamenu() {
        const triggers = this.querySelectorAll('[data-nav-id]');
        if (!triggers.length) return;

        const header = this.querySelector('.navbar');
        const menus = {};
        this.querySelectorAll('.nav-megamenu[data-nav-id]').forEach(m => {
            menus[m.getAttribute('data-nav-id')] = m;
        });

        let activeMenu = null;

        const hideAll = () => {
            Object.values(menus).forEach(m => { m.style.display = 'none'; });
            activeMenu = null;
        };

        const showMenu = (id) => {
            if (activeMenu === id) return;
            Object.values(menus).forEach(m => { m.style.display = 'none'; });
            if (menus[id]) menus[id].style.display = 'block';
            activeMenu = id;
        };

        // Hovering a trigger shows its menu immediately
        triggers.forEach(trigger => {
            const id = trigger.getAttribute('data-nav-id');
            trigger.addEventListener('mouseenter', () => showMenu(id));
        });

        // The menu stays open while cursor is anywhere inside the header OR the dropdown.
        // It only closes when the cursor leaves BOTH the header and all menus.
        const isInsideNav = (e) => {
            const related = e.relatedTarget;
            if (!related) return false;
            if (header && header.contains(related)) return true;
            for (const m of Object.values(menus)) {
                if (m.contains(related)) return true;
            }
            return false;
        };

        if (header) {
            header.addEventListener('mouseleave', (e) => {
                if (!isInsideNav(e)) hideAll();
            });
        }

        Object.values(menus).forEach(menu => {
            menu.addEventListener('mouseleave', (e) => {
                if (!isInsideNav(e)) hideAll();
            });
        });
    }

    _buildHeader(bp, rp, user) {
        let authHtml;

        if (user) {
            const initials = (user.display_name || user.email || 'U')
                .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

            let dashLink = rp + 'pages/agent/dashboard.html';
            if (user.role === 'admin' || user.role === 'super_admin') {
                dashLink = rp + 'pages/admin/dashboard.html';
            } else if (user.role === 'client') {
                dashLink = rp + 'pages/user/dashboard.html';
            }

            authHtml = `
            <div class="profile-dropdown" style="position: relative; display: inline-block;">
                <button id="profile-avatar-btn"
                    onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block';"
                    style="width: 44px; height: 44px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25);
                           cursor: pointer; background: #2d3748; color: #fff; font-weight: 700; font-size: 0.9rem;
                           display: flex; align-items: center; justify-content: center; overflow: hidden;
                           padding: 0; transition: border-color 0.2s; font-family: inherit;"
                    onmouseover="this.style.borderColor='rgba(255,255,255,0.7)'"
                    onmouseout="this.style.borderColor='rgba(255,255,255,0.25)'"
                    aria-label="Account menu">
                    ${initials}
                </button>
                <div class="dropdown-menu" style="display: none; position: absolute; right: 0; top: 58px;
                     background: #fff; border: 1px solid #edf2f7; border-radius: 12px;
                     box-shadow: 0 10px 40px rgba(0,0,0,0.12); width: 248px; z-index: 1001;
                     overflow: hidden; font-family: 'Inter', sans-serif;">
                    <!-- Header -->
                    <div style="padding: 1.25rem; border-bottom: 1px solid #edf2f7; background: #f7f9fa;">
                        <div style="font-weight: 700; font-size: 0.95rem; color: #1a202c;">${user.display_name || user.email}</div>
                        <div style="font-size: 0.75rem; color: #718096; text-transform: capitalize; margin-top: 2px;">${user.role.replace('_', ' ')} Account</div>
                    </div>
                    <!-- Links -->
                    <div style="padding: 0.4rem 0;">
                        <a href="${dashLink}" style="display: block; padding: 0.7rem 1.25rem; color: #2d3748;
                           text-decoration: none; font-size: 0.9rem; font-weight: 500;"
                           onmouseover="this.style.background='#f7f9fa'" onmouseout="this.style.background='transparent'">
                           Dashboard
                        </a>
                        ${user.role === 'agent' && user.slug ? `
                        <a href="${rp}pages/public/agent-profile.html?slug=${user.slug}" style="display: block; padding: 0.7rem 1.25rem; color: #2d3748;
                           text-decoration: none; font-size: 0.9rem; font-weight: 500;"
                           onmouseover="this.style.background='#f7f9fa'" onmouseout="this.style.background='transparent'">
                           My Public Profile
                        </a>` : ''}
                    </div>
                    <!-- Sign Out -->
                    <div style="padding: 0.4rem 0; border-top: 1px solid #edf2f7;">
                        <a href="#" id="signout-link" onclick="window._signOut(event)"
                           style="display: block; padding: 0.7rem 1.25rem; color: #e53e3e;
                           text-decoration: none; font-size: 0.9rem; font-weight: 600;"
                           onmouseover="this.style.background='#fff5f5'" onmouseout="this.style.background='transparent'">
                           Sign Out
                        </a>
                    </div>
                </div>
            </div>`;
        } else {
            authHtml = `<div style="display: flex; gap: 0.6rem; align-items: center;">
                <a href="${rp}pages/public/login.html" style="color: #fff; font-weight: 600;
                    font-size: 0.9rem; font-family: inherit; text-decoration: none;
                    padding: 0.55rem 1.4rem; border: 1px solid rgba(255,255,255,0.35);
                    border-radius: 999px; transition: background 0.2s, border-color 0.2s;"
                    onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(255,255,255,0.6)'"
                    onmouseout="this.style.background='transparent'; this.style.borderColor='rgba(255,255,255,0.35)'">Log In</a>
                <button onclick="window.openForm('agent')" style="background: #1d6df2; color: #fff; font-weight: 600;
                    border: none; padding: 0.6rem 1.5rem; border-radius: 999px; cursor: pointer; font-size: 0.9rem;
                    font-family: inherit; transition: background 0.2s;"
                    onmouseover="this.style.background='#1558c7'"
                    onmouseout="this.style.background='#1d6df2'">Get Started</button>
            </div>`;
        }

        // ── Nav data model ─────────────────────────────────────────────────
        // Each nav item: { id, label, href, columns: [{ heading, links: [{label, href, starIcon?}] }] }
        const starIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#1d6df2" stroke="#1d6df2" stroke-width="1.5" stroke-linejoin="round" style="vertical-align:-2px;margin-right:0.35rem;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

        const navItems = [
            {
                id: 'buy', label: 'Buy', href: `${bp}buy.html`,
                columns: [
                    { heading: 'Browse Properties', links: [
                        { label: 'All Listings', href: `${bp}buy.html` },
                        { label: 'Lake Minnetonka Homes', href: '/lakes/lake-minnetonka' },
                        { label: 'Rent a Home', href: `${bp}rent.html` },
                    ]},
                    { heading: 'Tools', links: [
                        { label: 'Get a Cash Offer', href: `${bp}cash-offer.html` },
                        { label: 'How It Works', href: `${bp}buy.html` },
                    ]},
                    { heading: 'Buyer Resources', links: [
                        { label: 'Buyer Guides & Tools',      href: `${bp}resources.html?search=buyer` },
                        { label: 'Property Value Calculator', href: `${bp}resources.html?search=valuation` },
                        { label: 'Dock & Permits',            href: `${bp}resources.html?search=permit` },
                        { label: 'Blog',                      href: `${bp}blog.html` },
                    ]},
                ]
            },
            {
                id: 'sell', label: 'Sell', href: `${bp}sell.html`,
                columns: [
                    { heading: 'Sell Your Home', links: [
                        { label: 'List With an Agent', href: `${bp}sell.html` },
                        { label: 'Free Home Valuation', href: `${bp}sell.html` },
                        { label: 'List as a Rental', href: `${bp}rent.html` },
                    ]},
                    { heading: 'Skip the Hassle', links: [
                        { label: 'Get a Cash Offer', href: `${bp}cash-offer.html` },
                        { label: 'How Cash Offers Work', href: `${bp}cash-offer.html` },
                    ]},
                    { heading: 'Seller Resources', links: [
                        { label: 'Seller Guides & Tools', href: `${bp}resources.html?search=seller` },
                        { label: 'Pricing & Valuation',   href: `${bp}resources.html?search=valuation` },
                        { label: 'Market Reports',        href: `${bp}resources.html?category=Market%20Reports` },
                        { label: 'Blog',                  href: `${bp}blog.html` },
                    ]},
                ]
            },
            {
                id: 'lakes', label: 'Lakes & Towns', href: '/towns',
                columns: [
                    { heading: 'Browse', links: [
                        { label: 'Lakes & Towns map',    href: '/towns' },
                        { label: 'Featured Agents',      href: `${bp}agents.html?featured=1` },
                        { label: 'List your Business',   href: '/business-signup' },
                    ]},
                    { heading: 'Featured Towns', links: [
                        { label: 'Wayzata',        href: '/towns/wayzata' },
                        { label: 'Excelsior',      href: '/towns/excelsior' },
                        { label: 'Nisswa',         href: '/towns/nisswa' },
                        { label: 'Walker',         href: '/towns/walker' },
                        { label: 'Detroit Lakes',  href: '/towns/detroit-lakes' },
                    ]},
                    { heading: 'Featured Lakes', links: [
                        { label: 'Lake Minnetonka', href: '/lakes/lake-minnetonka' },
                        { label: 'Gull Lake',       href: '/lakes/gull-lake' },
                        { label: 'Mille Lacs Lake', href: '/lakes/mille-lacs-lake' },
                        { label: 'Lake Vermilion',  href: '/lakes/lake-vermilion' },
                    ]},
                ]
            },
            {
                id: 'agents', label: 'Agents', href: `${bp}agents.html`,
                columns: [
                    { heading: 'Browse', links: [
                        { label: 'All Agents', href: `${bp}agents.html` },
                        { label: 'Featured Agents', href: `${bp}agents.html?featured=1`, prefixIcon: starIcon },
                    ]},
                    { heading: 'Become a Partner', links: [
                        { label: 'Join the Network', href: `${bp}join.html` },
                        { label: 'Agent Login', href: `${bp}agent-login.html` },
                        { label: 'Contact Us', href: `${bp}contact.html` },
                    ]},
                    { heading: 'Agent Resources', links: [
                        { label: 'Agent Resource Library', href: `${bp}resources.html?search=agent` },
                        { label: 'Market Reports',         href: `${bp}resources.html?category=Market%20Reports` },
                        { label: 'Training & Scripts',     href: `${bp}resources.html?search=training` },
                        { label: 'Blog',                   href: `${bp}blog.html` },
                    ]},
                ]
            },
            {
                id: 'resources', label: 'Resources', href: `${bp}resources.html`,
                columns: [
                    { heading: 'For you', links: [
                        { label: 'Buyer Resources',   href: `${bp}resources.html?search=buyer` },
                        { label: 'Seller Resources',  href: `${bp}resources.html?search=seller` },
                        { label: 'Renter Resources',  href: `${bp}resources.html?search=rental` },
                        { label: 'Cabin Owner Tools', href: `${bp}resources.html?search=cabin` },
                    ]},
                    { heading: 'By topic', links: [
                        { label: 'Valuation & Pricing', href: `${bp}resources.html?search=valuation` },
                        { label: 'Dock & Permits',      href: `${bp}resources.html?search=permit` },
                        { label: 'Financing',           href: `${bp}resources.html?search=financing` },
                        { label: 'Summertime Buying',   href: `${bp}resources.html?search=summer` },
                    ]},
                    { heading: 'Library', links: [
                        { label: 'All Resources',       href: `${bp}resources.html` },
                        { label: 'Guides',              href: `${bp}resources.html?category=Guides` },
                        { label: 'Tools & Calculators', href: `${bp}resources.html?category=Tools` },
                        { label: 'Market Reports',      href: `${bp}resources.html?category=Market%20Reports` },
                        { label: 'Blog',                href: `${bp}blog.html` },
                    ]},
                    { heading: 'Company', links: [
                        { label: 'About Us',      href: `${bp}about.html` },
                        { label: 'CommonRealtor', href: `${bp}commonrealtor.html` },
                        { label: 'FAQ',           href: `${bp}faq.html` },
                        { label: 'Contact Us',    href: `${bp}contact.html` },
                        { label: 'Careers',       href: `${bp}careers.html` },
                        { label: 'Advertise',     href: '/business-signup' },
                    ]},
                ]
            },
        ];

        const navLinksHtml = navItems.map(item => `
            <a href="${item.href}" id="nav-${item.id}-trigger" data-nav-id="${item.id}" style="display:inline-flex; align-items:center;">
                ${item.label}
            </a>
        `).join('');

        const megamenusHtml = navItems.map(item => `
            <div id="nav-${item.id}-megamenu" class="nav-megamenu" data-nav-id="${item.id}" style="display:none;">
                <div class="nav-megamenu-inner">
                    ${item.columns.map(col => `
                        <div class="nav-megamenu-col">
                            <h4 class="nav-megamenu-heading">${col.heading}</h4>
                            ${col.links.map(lnk => `
                                <a href="${lnk.href}">${lnk.prefixIcon || ''}${lnk.label}</a>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        // Mobile menu — collapses the megamenu into scrollable accordion-ish sections
        const mobileMenuHtml = `
            <div class="mobile-menu-backdrop" id="mobile-menu-backdrop"></div>
            <aside class="mobile-menu" id="mobile-menu" aria-hidden="true">
                <div class="mobile-menu-hdr">
                    <a href="${rp}index.html" style="display:flex;align-items:center;gap:0.5rem;text-decoration:none;color:#fff;font-weight:700;font-size:1rem;">
                        <svg width="26" height="24" viewBox="0 0 100 88" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="4,52 50,10 96,52"/>
                            <polyline points="72,28 72,16 84,16 84,42"/>
                            <polyline points="17,52 17,82 83,82 83,52"/>
                        </svg>
                        MN Lake Homes
                    </a>
                    <button class="mobile-menu-close" id="mobile-menu-close" aria-label="Close menu">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="mobile-menu-body">
                    ${navItems.map(item => `
                        <div class="mobile-menu-section">
                            <button class="mobile-menu-section-title" type="button" aria-expanded="false">
                                <span>${item.label}</span>
                                <svg class="mobile-menu-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>
                            <div class="mobile-menu-section-body">
                                <a href="${item.href}" class="mobile-menu-link mobile-menu-link-primary">All ${item.label} &rarr;</a>
                                ${item.columns.map(col => `
                                    <div class="mobile-menu-col">
                                        <div class="mobile-menu-col-heading">${col.heading}</div>
                                        ${col.links.map(lnk => `<a href="${lnk.href}" class="mobile-menu-link">${lnk.prefixIcon || ''}${lnk.label}</a>`).join('')}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="mobile-menu-footer">
                    ${user ? `
                        <div style="color:#94a3b8;font-size:0.8rem;margin-bottom:0.75rem;">Signed in as <strong style="color:#fff;">${user.display_name || user.email}</strong></div>
                        <a href="${user.role === 'admin' || user.role === 'super_admin' ? rp + 'pages/admin/dashboard.html' : user.role === 'client' ? rp + 'pages/user/dashboard.html' : rp + 'pages/agent/dashboard.html'}" class="mobile-menu-cta-outline">Dashboard</a>
                        <a href="#" onclick="window._signOut(event)" class="mobile-menu-cta-outline" style="color:#fc8181;border-color:rgba(252,129,129,0.3);">Sign Out</a>
                    ` : `
                        <a href="${rp}pages/public/login.html" class="mobile-menu-cta-outline">Log In</a>
                        <button onclick="window.openForm && window.openForm('agent')" class="mobile-menu-cta-primary">Get Started</button>
                    `}
                </div>
            </aside>
        `;

        return `
        <header class="navbar" style="background-color: var(--bg-dark); border-bottom: 1px solid rgba(255,255,255,0.08);
                position: fixed; width: 100%; z-index: 1000; top: 0;">
            <div class="logo">
                <a href="${rp}index.html" class="brand-wordmark" aria-label="Minnesota Lake Homes For Sale">
                    <svg class="brand-icon" width="40" height="36" viewBox="0 0 100 88" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="4,52 50,10 96,52"/>
                        <polyline points="72,28 72,16 84,16 84,42"/>
                        <polyline points="17,52 17,82 83,82 83,52"/>
                    </svg>
                </a>
            </div>
            <nav class="nav-links">
                ${navLinksHtml}
            </nav>
            <div class="nav-actions">
                ${authHtml}
            </div>
            ${user ? `
                <a href="${user.role === 'admin' || user.role === 'super_admin' ? rp + 'pages/admin/dashboard.html' : user.role === 'client' ? rp + 'pages/user/dashboard.html' : rp + 'pages/agent/dashboard.html'}"
                   class="mobile-auth-inline" aria-label="Dashboard">Dashboard</a>
            ` : `
                <a href="${rp}pages/public/login.html" class="mobile-auth-inline">Sign in</a>
            `}
            <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Open menu" aria-expanded="false">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            </button>

            ${megamenusHtml}
            ${mobileMenuHtml}
        </header>`;
    }
}
customElements.define('global-header', GlobalHeader);

// Global sign out function — called from header dropdown
window._signOut = async function(e) {
    e.preventDefault();
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) { /* Proceed regardless */ }
    window.location.href = '/index.html';
};

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const btn = document.getElementById('profile-avatar-btn');
    if (!btn) return;
    const dropdown = btn.nextElementSibling;
    if (!dropdown) return;
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// ─── Global Footer ────────────────────────────────────────────────────────────

class GlobalFooter extends HTMLElement {
    connectedCallback() {
        const bp = getDepth();
        const rp = getRoot();

        // Render skeleton footer immediately (guest view), then hydrate with
        // admin-only staff links once we confirm the session role.
        this.innerHTML = this._buildFooter(bp, rp, null);

        fetch('/api/auth/session')
            .then(r => { if (r.ok) return r.json(); throw new Error('not_logged_in'); })
            .then(data => {
                // Only admin / super_admin see the staff links
                if (data.role === 'admin' || data.role === 'super_admin') {
                    this.innerHTML = this._buildFooter(bp, rp, data);
                }
            })
            .catch(() => { /* guest — already rendered */ });
    }

    _buildFooter(bp, rp, user) {
        const isStaff = user && (user.role === 'admin' || user.role === 'super_admin');

        const networkLinks = `
            <a href="${bp}join.html">Join the Network</a>
            <a href="${bp}contact.html">Contact Us</a>
            ${isStaff ? `
                <a href="${rp}pages/public/login.html" style="color:#4b5563;">Agent Login</a>
                <a href="${rp}pages/admin/dashboard.html" style="color:#4b5563;">Admin Portal</a>
            ` : ''}
        `;

        return `<footer class="site-footer">
        <div class="footer-container">

            <div class="footer-brand">
                <div class="logo">
                    <a href="${rp}index.html" style="display:flex;align-items:center;gap:0.6rem;text-decoration:none;">
                        <svg width="28" height="26" viewBox="0 0 100 88" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="4,52 50,10 96,52"/>
                            <polyline points="72,28 72,16 84,16 84,42"/>
                            <polyline points="17,52 17,82 83,82 83,52"/>
                        </svg>
                        <span>MinnesotaLakeHomesForSale.com</span>
                    </a>
                </div>
                <p class="footer-desc">Minnesota's premier lakefront real estate network — connecting buyers, sellers, and agents across the state's finest waterfront communities.</p>
                <button class="btn btn-primary" onclick="window.openForm('general')" style="font-size:0.85rem;padding:0.65rem 1.4rem;border:none;cursor:pointer;">Get in Touch</button>
            </div>

            <div class="footer-links">
                <div class="link-column">
                    <h4>Real Estate</h4>
                    <a href="${bp}buy.html">Buy a Home</a>
                    <a href="${bp}sell.html">Sell a Home</a>
                    <a href="${bp}rent.html">Rent a Home</a>
                    <a href="${bp}agents.html">Find an Agent</a>
                </div>
                <div class="link-column">
                    <h4>Explore</h4>
                    <a href="${bp}resources.html">Resources Library</a>
                    <a href="${bp}blog.html">Blog</a>
                    <a href="/lakes/lake-minnetonka">Lake Minnetonka</a>
                    <a href="${bp}about.html">About Us</a>
                    <a href="${bp}faq.html">FAQs</a>
                </div>
                <div class="link-column">
                    <h4>Network</h4>
                    ${networkLinks}
                </div>
            </div>

        </div>
        <div class="footer-bottom">
            <p class="footer-copyright">&copy; 2026 MinnesotaLakeHomesForSale.com &mdash; Part of the <a href="/commonrealtor" style="color:inherit;text-decoration:underline;">CommonRealtor</a> portfolio. All rights reserved. <span style="margin:0 0.4rem;opacity:0.5;">·</span> <a href="/privacy" style="color:inherit;text-decoration:underline;">Privacy</a> <span style="margin:0 0.4rem;opacity:0.5;">·</span> <a href="/terms" style="color:inherit;text-decoration:underline;">Terms</a></p>
            <p class="footer-disclaimer">MinnesotaLakeHomesForSale.com is a real estate network and lead generation platform, not a licensed brokerage. We do not represent buyers or sellers directly. All transactions are facilitated by independently licensed real estate professionals. This platform is currently in beta &mdash; we are testing an agent match experience designed to enhance the real estate journey and Minnesota lake life. Results and agent availability may vary.</p>
        </div>
    </footer>`;
    }
}
customElements.define('global-footer', GlobalFooter);

// ─── Lead Modal (legacy alias — renders nothing, openForm() drives UI) ────────
class LeadModal extends HTMLElement { connectedCallback() {} }
customElements.define('lead-modal', LeadModal);

// ─── Multi-Step Conversational Lead Forms ─────────────────────────────────────

const _LF_CFG = {
    buy: {
        source: 'buyer',
        steps: [
            { q: 'Who are we speaking with today?',         hint: "Let's start with your first name.",                                          field: { id: 'first',    type: 'text',    ph: 'Your first name',         ac: 'given-name'  } },
            { q: d => `Nice to meet you, ${d.first}! What's your last name?`,                                                                    field: { id: 'last',     type: 'text',    ph: 'Your last name',          ac: 'family-name' } },
            { q: d => `${d.first}, what's your budget range?`,              hint: 'Helps us match you with the right properties.',               field: { id: 'budget',   type: 'select',  ph: 'Select a range…',         opts: ['Under $500K','$500K – $750K','$750K – $1M','$1M – $2M','Over $2M'] } },
            { q: 'When are you hoping to buy?',                                                                                                   field: { id: 'timeline', type: 'select',  ph: 'Select a timeline…',      opts: ['ASAP — ready to move','Within 1–3 months','Within 3–6 months','Just exploring for now'] } },
            { q: d => `Almost done, ${d.first}. How can we reach you?`,     hint: "Enter at least one contact method and we'll be in touch within one business day.", field: { id: 'contact', type: 'contact' } }
        ]
    },
    sell: {
        source: 'seller',
        steps: [
            { q: "What's the property address?",             hint: 'Full street address so we can pull accurate comps.',                        field: { id: 'address',  type: 'text',    ph: 'e.g. 123 Shoreline Dr, Wayzata, MN' } },
            { q: 'Who are we speaking with today?',          hint: "Let's start with your first name.",                                         field: { id: 'first',    type: 'text',    ph: 'Your first name',         ac: 'given-name'  } },
            { q: d => `Nice to meet you, ${d.first}! What's your last name?`,                                                                    field: { id: 'last',     type: 'text',    ph: 'Your last name',          ac: 'family-name' } },
            { q: 'When are you looking to sell?',                                                                                                 field: { id: 'timeline', type: 'select',  ph: 'Select a timeline…',      opts: ['As soon as possible','Within 3 months','3–6 months out','Just exploring options'] } },
            { q: d => `Great, ${d.first}. How can we reach you?`,            hint: "We'll send your free market analysis within one business day.", field: { id: 'contact', type: 'contact' } }
        ]
    },
    rent: {
        source: 'general_contact',
        steps: [
            { q: 'Who are we speaking with today?',         hint: "Let's start with your first name.",                                          field: { id: 'first',    type: 'text',    ph: 'Your first name',         ac: 'given-name'  } },
            { q: d => `Nice to meet you, ${d.first}! What's your last name?`,                                                                    field: { id: 'last',     type: 'text',    ph: 'Your last name',          ac: 'family-name' } },
            { q: 'When do you need it?',                    hint: 'Helps us check availability.',                                               field: { id: 'timeline', type: 'select',  ph: 'Select a timeframe…',     opts: ['This weekend','This month','Seasonal (summer or winter)','Year-round lease'] } },
            { q: d => `${d.first}, what's your monthly budget?`,                                                                                  field: { id: 'budget',   type: 'select',  ph: 'Select a range…',         opts: ['Under $1,500/mo','$1,500 – $3,000/mo','$3,000 – $5,000/mo','Over $5,000/mo'] } },
            { q: d => `Perfect, ${d.first}. How can we reach you?`,         hint: "We'll start finding your ideal rental right away.",           field: { id: 'contact', type: 'contact' } }
        ]
    },
    agent: {
        source: 'agent_inquiry',
        steps: [
            { q: 'Who are we speaking with today?',         hint: "Let's start with your first name.",                                          field: { id: 'first',    type: 'text',    ph: 'Your first name',         ac: 'given-name'  } },
            { q: d => `Nice to meet you, ${d.first}! What's your last name?`,                                                                    field: { id: 'last',     type: 'text',    ph: 'Your last name',          ac: 'family-name' } },
            { q: d => `${d.first}, what do you need help with?`,            hint: "We'll match you with the right specialist.",                  field: { id: 'intent',   type: 'select',  ph: 'Select one…',             opts: ['Buying a lake home','Selling my property','Finding a rental','Market information','General question'] } },
            { q: d => `Got it, ${d.first}. How can we reach you?`,          hint: 'A local specialist will be in touch within one business day.', field: { id: 'contact', type: 'contact' } }
        ]
    },
    general: {
        source: 'general_contact',
        steps: [
            { q: 'Who are we speaking with today?',         hint: "Let's start with your first name.",                                          field: { id: 'first',    type: 'text',    ph: 'Your first name',         ac: 'given-name'  } },
            { q: d => `Nice to meet you, ${d.first}! What's your last name?`,                                                                    field: { id: 'last',     type: 'text',    ph: 'Your last name',          ac: 'family-name' } },
            { q: d => `How can we help you, ${d.first}?`,                                                                                        field: { id: 'intent',   type: 'select',  ph: 'Select one…',             opts: ['I want to buy a home','I want to sell my property',"I'm looking for a rental",'I need to find an agent','General question'] } },
            { q: d => `Perfect, ${d.first}. How can we reach you?`,         hint: "We'll be in touch within one business day.",                  field: { id: 'contact', type: 'contact' } }
        ]
    },
    cash_offer: {
        source: 'cash_offer',
        steps: [
            { q: 'Let\'s get your cash offer started.',     hint: "First, what's your first name?",                                             field: { id: 'first',    type: 'text',    ph: 'Your first name',         ac: 'given-name'  } },
            { q: d => `Thanks, ${d.first}! What's your last name?`,                                                                              field: { id: 'last',     type: 'text',    ph: 'Your last name',          ac: 'family-name' } },
            { q: d => `${d.first}, what's the property address?`,           hint: 'Full address or the lake + nearest city works too.',          field: { id: 'address',  type: 'text',    ph: 'e.g. 123 Shoreline Dr, Wayzata, MN' } },
            { q: 'What type of property is it?',                                                                                                  field: { id: 'property_type', type: 'select', ph: 'Select one…',       opts: ['Single-family lake home','Cabin / cottage','Condo or townhouse','Multi-family','Vacant lakefront land','Other'] } },
            { q: 'What condition is the home in?',          hint: 'A ballpark is fine — we\'ll confirm during the walkthrough.',                 field: { id: 'condition', type: 'select', ph: 'Select one…',            opts: ['Move-in ready','Light cosmetic updates needed','Major repairs needed','Tear-down / as-is'] } },
            { q: 'When would you like to close?',                                                                                                 field: { id: 'timeline', type: 'select',  ph: 'Select a timeline…',      opts: ['As soon as possible (7–14 days)','2–4 weeks','1–2 months','Just exploring options'] } },
            { q: d => `Last step, ${d.first}. How can we reach you?`,       hint: "Your cash offer will arrive within 48 hours.",                 field: { id: 'contact', type: 'contact' } }
        ]
    }
};

let _lfs = { type: 'general', step: 0, data: {}, steps: null }; // live state

function _lfSteps() {
    return _lfs.steps || _LF_CFG[_lfs.type].steps;
}

function _lfQ(step) {
    const s = _lfSteps()[step];
    return typeof s.q === 'function' ? s.q(_lfs.data) : s.q;
}

function _lfInit() {
    if (document.getElementById('lf-overlay')) return;
    const el = document.createElement('div');
    el.id = 'lf-overlay';
    // Full viewport — explicit 100vw/100vh and 100dvh covers iOS Safari's
    // dynamic viewport (address-bar collapse/expand) so the overlay never
    // falls short of the visible area.
    el.style.cssText = [
        'display:none',
        'position:fixed',
        'top:0','left:0','right:0','bottom:0',
        'width:100vw','height:100vh','height:100dvh',
        'z-index:9000',
        'background:#fff',
        'font-family:"Inter",sans-serif',
        'overflow-y:auto',
        'overscroll-behavior:contain',
        '-webkit-overflow-scrolling:touch',
    ].join(';') + ';';
    el.innerHTML = `
        <!-- Progress bar -->
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:#f0f4f8;">
            <div id="lf-bar" style="height:100%;background:#1d6df2;width:0%;transition:width 0.4s ease;border-radius:0 99px 99px 0;"></div>
        </div>

        <!-- Top chrome: back | logo | close -->
        <div style="position:absolute;top:0;left:0;right:0;padding:1.25rem 1.75rem;display:flex;justify-content:space-between;align-items:center;z-index:10;">
            <button id="lf-back" onclick="window._lfBack()"
                style="background:none;border:none;cursor:pointer;font-size:0.875rem;font-weight:600;color:#a0aec0;font-family:inherit;padding:0.4rem 0;visibility:hidden;transition:color 0.15s;"
                onmouseover="this.style.color='#1a202c'" onmouseout="this.style.color='#a0aec0'">&#8592; Back</button>
            <div style="display:flex;align-items:center;gap:0.45rem;">
                <div style="width:8px;height:8px;border-radius:50%;background:#1d6df2;"></div>
                <span style="font-weight:700;font-size:0.875rem;color:#1a202c;letter-spacing:-0.2px;">MN Lake Homes</span>
            </div>
            <button onclick="closeForm()"
                style="width:36px;height:36px;border-radius:50%;border:1px solid #e2e8f0;background:#fff;cursor:pointer;font-size:1rem;color:#718096;display:flex;align-items:center;justify-content:center;transition:all 0.15s;"
                onmouseover="this.style.background='#f7f9fa'" onmouseout="this.style.background='#fff'" aria-label="Close">&#x2715;</button>
        </div>

        <!-- Step content (centered) -->
        <div style="display:flex;align-items:center;justify-content:center;height:100%;padding:5rem 1.5rem 3rem;">
            <div id="lf-body" style="width:100%;max-width:520px;transition:opacity 0.15s ease,transform 0.15s ease;">
                <h2 id="lf-q" style="font-size:clamp(1.6rem,4vw,2.4rem);font-weight:800;color:#1a202c;letter-spacing:-1px;line-height:1.2;margin:0 0 0.75rem;text-align:center;"></h2>
                <p  id="lf-hint" style="color:#a0aec0;font-size:0.95rem;margin:0 0 2rem;text-align:center;line-height:1.5;"></p>
                <div id="lf-field" style="margin-bottom:1.25rem;"></div>
                <div id="lf-err" style="display:none;color:#c53030;font-size:0.85rem;margin-bottom:1rem;padding:0.75rem 1rem;background:#fff5f5;border-radius:10px;border:1px solid #fed7d7;text-align:center;"></div>
                <button id="lf-next" onclick="window._lfNext()"
                    style="width:100%;padding:1rem 1.5rem;background:#1a202c;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:1rem;cursor:pointer;font-family:inherit;transition:background 0.2s;"
                    onmouseover="if(!this.disabled)this.style.background='#2d3748'" onmouseout="if(!this.disabled)this.style.background='#1a202c'">Continue &#8594;</button>
                <p style="text-align:center;color:#cbd5e0;font-size:0.75rem;margin-top:0.9rem;">We respect your privacy. No spam, ever.</p>
            </div>
        </div>

        <!-- Success screen -->
        <div id="lf-ok" style="display:none;position:absolute;inset:0;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center;overflow-y:auto;">
            <div style="width:72px;height:72px;border-radius:50%;background:#f0fff4;display:flex;align-items:center;justify-content:center;margin:0 0 1.5rem;border:2px solid #c6f6d5;">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#38a169" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h3 id="lf-ok-title" style="font-size:2rem;font-weight:800;color:#1a202c;letter-spacing:-1px;margin:0 0 0.75rem;"></h3>
            <p  id="lf-ok-msg"   style="color:#718096;line-height:1.6;max-width:380px;margin:0 auto 2rem;"></p>

            <!-- Sell-only upsell: offer to also prepare a cash offer -->
            <div id="lf-cash-upsell" style="display:none;width:100%;max-width:460px;margin:0 auto 1.5rem;padding:1.5rem;background:#f7f9fa;border:1px solid #edf2f7;border-radius:14px;text-align:left;">
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
                    <div style="width:34px;height:34px;border-radius:10px;background:#ebf4ff;color:#1d6df2;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                    </div>
                    <div>
                        <div style="font-weight:800;color:#1a202c;font-size:1rem;line-height:1.25;">Also want a cash offer on this home?</div>
                        <div style="font-size:0.82rem;color:#718096;margin-top:0.15rem;">No obligation &middot; no showings &middot; under 48 hours.</div>
                    </div>
                </div>
                <div id="lf-cash-inline" style="display:none;margin:0.75rem 0 0.75rem;"></div>
                <div id="lf-cash-err" style="display:none;color:#c53030;font-size:0.82rem;margin:0.25rem 0 0.75rem;"></div>
                <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
                    <button id="lf-cash-yes" type="button"
                        style="flex:1 1 auto;min-width:140px;padding:0.8rem 1rem;background:#1d6df2;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:0.92rem;cursor:pointer;font-family:inherit;transition:background 0.15s;"
                        onmouseover="this.style.background='#155bc8'" onmouseout="this.style.background='#1d6df2'">Yes, send my cash offer</button>
                    <button id="lf-cash-no" type="button"
                        style="flex:0 0 auto;padding:0.8rem 1rem;background:#fff;color:#4a5568;border:1px solid #e2e8f0;border-radius:10px;font-weight:600;font-size:0.92rem;cursor:pointer;font-family:inherit;transition:border-color 0.15s;"
                        onmouseover="this.style.borderColor='#cbd5e0'" onmouseout="this.style.borderColor='#e2e8f0'">No thanks</button>
                </div>
            </div>

            <!-- Confirmation after the upsell is accepted -->
            <div id="lf-cash-done" style="display:none;width:100%;max-width:460px;margin:0 auto 1.5rem;padding:1.25rem 1.5rem;background:#f0fff4;border:1px solid #c6f6d5;border-radius:14px;color:#276749;font-weight:600;text-align:left;line-height:1.5;">
                ✓ Your cash offer request is in. We'll email a no-obligation offer within 48 hours.
            </div>

            <button onclick="closeForm()"
                style="padding:1rem 2.5rem;background:#1a202c;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:1rem;cursor:pointer;font-family:inherit;transition:background 0.2s;"
                onmouseover="this.style.background='#2d3748'" onmouseout="this.style.background='#1a202c'">Back to site</button>
        </div>
    `;
    document.body.appendChild(el);
}

function _lfRender() {
    const steps = _lfSteps();
    const s     = steps[_lfs.step];
    const total = steps.length;

    document.getElementById('lf-bar').style.width  = Math.round((_lfs.step / total) * 100) + '%';
    document.getElementById('lf-back').style.visibility = _lfs.step === 0 ? 'hidden' : 'visible';
    document.getElementById('lf-q').textContent    = _lfQ(_lfs.step);
    document.getElementById('lf-err').style.display = 'none';

    const hint = document.getElementById('lf-hint');
    hint.textContent   = s.hint || '';
    hint.style.display = s.hint ? 'block' : 'none';

    const f = s.field;
    const iStyle = 'width:100%;padding:1rem 1.25rem;border:2px solid #e2e8f0;border-radius:12px;font-family:inherit;font-size:1.15rem;box-sizing:border-box;outline:none;transition:border-color 0.2s;background:#fff;';
    const focus  = `onfocus="this.style.borderColor='#1d6df2'" onblur="this.style.borderColor='#e2e8f0'"`;
    const area   = document.getElementById('lf-field');

    if (f.type === 'contact') {
        area.innerHTML = `
            <input type="email" id="lf-email" placeholder="Email address"
                style="${iStyle}" ${focus} value="${_lfs.data.email || ''}">
            <div style="height:0.75rem;"></div>
            <input type="tel"   id="lf-phone" placeholder="Phone number (optional)"
                style="${iStyle}" ${focus} value="${_lfs.data.phone || ''}">`;
        setTimeout(() => document.getElementById('lf-email')?.focus(), 60);
    } else if (f.type === 'select') {
        const opts = f.opts.map(o => `<option value="${o}" ${_lfs.data[f.id]===o?'selected':''}>${o}</option>`).join('');
        area.innerHTML = `
            <select id="lf-${f.id}" style="${iStyle}color:#1a202c;appearance:none;cursor:pointer;"
                ${focus} onchange="window._lfNext()">
                <option value="" disabled ${_lfs.data[f.id]?'':'selected'}>${f.ph}</option>${opts}
            </select>`;
    } else {
        area.innerHTML = `
            <input type="${f.type}" id="lf-${f.id}" placeholder="${f.ph}" autocomplete="${f.ac||'off'}"
                style="${iStyle}text-align:center;" ${focus} value="${_lfs.data[f.id]||''}">`;
        setTimeout(() => document.getElementById('lf-' + f.id)?.focus(), 60);
        // Wire up Google Places Autocomplete on the address question.
        // Loads the Maps JS lazily (once per session) and attaches a US-only
        // address autocomplete to the input. Failures fall back to a plain
        // text field so the form is never blocked if Places is unavailable.
        if (f.id === 'address') {
            _lfAttachAddressAutocomplete();
        }
    }

    // next button
    const btn = document.getElementById('lf-next');
    btn.disabled      = false;
    btn.style.display = f.type === 'select' ? 'none' : 'block';
    btn.textContent   = _lfs.step === total - 1 ? 'Submit →' : 'Continue →';
    btn.style.background = '#1a202c';
}

// ── Google Places autocomplete on the address step ──────────────────────────
// Mirrors the cash-offer overlay's loader: pulls the public Places key from
// /api/config/public, injects maps.googleapis.com once, and attaches an
// Autocomplete to the lead-form's address input. Stays fire-and-forget — if
// the key is missing or the script fails, the input still works as plain text.
let _lfPlacesState = null; // 'loading' | 'ready' | 'failed'

function _lfEnsurePacContainerZ() {
    // The lead-form overlay sits at z-index 9000. Google's .pac-container
    // suggestion dropdown defaults to z-index 1000, so without this bump the
    // suggestions render BEHIND the overlay. Inject once per session.
    if (document.getElementById('lf-pac-z')) return;
    const style = document.createElement('style');
    style.id = 'lf-pac-z';
    style.textContent = '.pac-container { z-index: 10001 !important; }';
    document.head.appendChild(style);
}

function _lfBindAutocomplete() {
    const input = document.getElementById('lf-address');
    if (!input || !window.google || !window.google.maps || !window.google.maps.places) return;
    if (input.dataset.lfAutocomplete === '1') return;          // idempotent
    input.dataset.lfAutocomplete = '1';
    const ac = new google.maps.places.Autocomplete(input, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
        fields: ['place_id', 'formatted_address', 'address_components', 'geometry'],
    });
    ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const addr  = place?.formatted_address || input.value;
        if (addr) {
            input.value = addr;
            _lfs.data.address = addr;
        }
    });
    // Suppress Enter (Google's dropdown handles it) so the form doesn't
    // advance to the next step before the user picks a suggestion.
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && document.querySelector('.pac-container:not([style*="display: none"])')) e.preventDefault(); });
}

async function _lfAttachAddressAutocomplete() {
    _lfEnsurePacContainerZ();
    if (window.google && window.google.maps && window.google.maps.places) {
        _lfPlacesState = 'ready';
        _lfBindAutocomplete();
        return;
    }
    if (_lfPlacesState === 'loading') {
        // Another step already kicked off the load. Bind once it's ready.
        const t = setInterval(() => {
            if (window.google?.maps?.places) { clearInterval(t); _lfBindAutocomplete(); }
        }, 100);
        setTimeout(() => clearInterval(t), 8000);
        return;
    }
    if (_lfPlacesState === 'failed') return;

    _lfPlacesState = 'loading';
    try {
        const res = await fetch('/api/config/public');
        const cfg = await res.json().catch(() => ({}));
        const key = cfg?.googlePlacesKey;
        if (!key) { _lfPlacesState = 'failed'; return; }
        window._lfGoogleReady = () => { _lfPlacesState = 'ready'; _lfBindAutocomplete(); };
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&callback=_lfGoogleReady`;
        s.defer = true;
        s.onerror = () => { _lfPlacesState = 'failed'; };
        document.head.appendChild(s);
    } catch (err) {
        console.warn('[lead-form] Google Places disabled:', err.message);
        _lfPlacesState = 'failed';
    }
}

function _lfSlide() {
    const body = document.getElementById('lf-body');
    body.style.opacity = '0'; body.style.transform = 'translateY(12px)';
    setTimeout(() => { _lfRender(); body.style.opacity = '1'; body.style.transform = 'translateY(0)'; }, 140);
}

// iOS Safari ignores `body { overflow: hidden }` for scroll-lock; pin the
// body with position:fixed instead and restore scroll on close.
function _lfLockScroll() {
    const y = window.scrollY || window.pageYOffset || 0;
    document.body.dataset.lfSavedY = String(y);
    document.body.style.position = 'fixed';
    document.body.style.top = `-${y}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
}
function _lfUnlockScroll() {
    const saved = Number(document.body.dataset.lfSavedY || 0);
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    delete document.body.dataset.lfSavedY;
    window.scrollTo(0, saved);
}

window.openForm = function(type, prefill) {
    _lfInit();
    const t = type || 'general';
    const data = { ...(prefill && typeof prefill === 'object' ? prefill : {}) };
    // Skip any step whose field id is already populated via prefill.
    const filtered = _LF_CFG[t].steps.filter(s => {
        if (s.field.type === 'contact') return true;
        const v = data[s.field.id];
        return v === undefined || v === null || v === '';
    });
    _lfs = { type: t, step: 0, data, steps: filtered };
    document.getElementById('lf-ok').style.display   = 'none';
    document.getElementById('lf-body').style.display = 'block';
    document.getElementById('lf-overlay').style.display = 'block';
    _lfLockScroll();
    _lfRender();
};

window.closeForm = function() {
    const el = document.getElementById('lf-overlay');
    if (el) el.style.display = 'none';
    _lfUnlockScroll();
};

window._lfBack = function() {
    if (_lfs.step > 0) { _lfs.step--; _lfSlide(); }
};

window._lfNext = function() {
    const steps = _lfSteps();
    const f     = steps[_lfs.step].field;
    const err   = document.getElementById('lf-err');

    if (f.type === 'contact') {
        const email = (document.getElementById('lf-email')?.value || '').trim();
        const phone = (document.getElementById('lf-phone')?.value || '').trim();
        if (!email && !phone) { err.textContent = 'Please enter at least one contact method.'; err.style.display = 'block'; return; }
        _lfs.data.email = email || null;
        _lfs.data.phone = phone || null;
    } else if (f.type === 'select') {
        const val = document.getElementById('lf-' + f.id)?.value;
        if (!val) return;
        _lfs.data[f.id] = val;
    } else {
        const val = (document.getElementById('lf-' + f.id)?.value || '').trim();
        if (!val) { err.textContent = 'This field is required.'; err.style.display = 'block'; return; }
        _lfs.data[f.id] = val;
    }

    if (_lfs.step === steps.length - 1) { _lfDoSubmit(); return; }
    _lfs.step++;
    _lfSlide();
};

async function _lfDoSubmit() {
    const cfg  = _LF_CFG[_lfs.type];
    const d    = _lfs.data;
    const name = [d.first, d.last].filter(Boolean).join(' ');
    // address + placeId + property_* live on the lead record directly,
    // so exclude them from the free-form notes dump.
    const skip = new Set([
        'first','last','email','phone',
        'address','placeId',
        'property_street','property_city','property_state','property_zip',
    ]);
    const notes = Object.entries(d).filter(([k,v]) => !skip.has(k) && v)
        .map(([k,v]) => `${k[0].toUpperCase()+k.slice(1).replace(/_/g,' ')}: ${v}`).join('\n');

    const btn = document.getElementById('lf-next');
    btn.disabled = true; btn.textContent = 'Submitting…'; btn.style.background = '#a0aec0';
    document.getElementById('lf-err').style.display = 'none';

    try {
        const res = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                email: d.email||null,
                phone: d.phone||null,
                notes: notes||null,
                source: cfg.source,
                property_address:  d.address || null,
                property_place_id: d.placeId || null,
                property_street:   d.property_street || null,
                property_city:     d.property_city   || null,
                property_state:    d.property_state  || null,
                property_zip:      d.property_zip    || null,
            })
        });
        if (!res.ok) { const r = await res.json().catch(()=>({})); throw new Error(r.error || 'Submission failed.'); }

        document.getElementById('lf-bar').style.width  = '100%';
        document.getElementById('lf-body').style.display = 'none';
        document.getElementById('lf-back').style.visibility = 'hidden';
        const ok = document.getElementById('lf-ok');
        document.getElementById('lf-ok-title').textContent = `Thanks, ${d.first || 'you\'re all set'}!`;
        document.getElementById('lf-ok-msg').textContent   = 'Our team will review your request and reach out within one business day. We look forward to helping you.';
        ok.style.display = 'flex';

        // Sell-path upsell: offer to also create a cash_offer_lead for
        // the same property. The regular seller lead has already been
        // written above — this just adds a second, hotter record on the
        // admin-facing Cash Offers page.
        _lfMaybeShowSellUpsell(d, name);
    } catch(err) {
        document.getElementById('lf-err').textContent = err.message;
        document.getElementById('lf-err').style.display = 'block';
        btn.disabled = false; btn.textContent = 'Submit →'; btn.style.background = '#1a202c';
    }
}

// ─── Sell success → cash-offer upsell ───────────────────────────────────────
// After a /sell lead is written, show a single-click path to also file a
// cash_offer_lead for the same property. If the sell form only collected
// one of (email, phone), we prompt inline for the missing piece since
// /api/cash-offer/submit requires both.
function _lfMaybeShowSellUpsell(d, name) {
    if (!d || !d.address) return;                       // no captured address → skip
    if (_LF_CFG[_lfs.type]?.source !== 'seller') return; // only on the sell flow

    const panel    = document.getElementById('lf-cash-upsell');
    const yesBtn   = document.getElementById('lf-cash-yes');
    const noBtn    = document.getElementById('lf-cash-no');
    const errEl    = document.getElementById('lf-cash-err');
    const inlineEl = document.getElementById('lf-cash-inline');
    const doneEl   = document.getElementById('lf-cash-done');
    if (!panel || !yesBtn || !noBtn) return;

    // Reset from any prior render
    panel.style.display = 'block';
    doneEl.style.display = 'none';
    inlineEl.style.display = 'none';
    inlineEl.innerHTML = '';
    errEl.style.display = 'none';
    yesBtn.disabled = false;
    yesBtn.textContent = 'Yes, send my cash offer';

    // If either email or phone is missing, inject a quick capture field —
    // /api/cash-offer/submit requires both.
    const needsEmail = !d.email;
    const needsPhone = !d.phone;
    if (needsEmail || needsPhone) {
        const iStyle = 'width:100%;padding:0.7rem 0.9rem;border:1px solid #e2e8f0;border-radius:10px;font-family:inherit;font-size:0.95rem;box-sizing:border-box;outline:none;margin-top:0.25rem;';
        inlineEl.innerHTML = [
            needsEmail ? `<label style="display:block;font-size:0.75rem;font-weight:700;color:#4a5568;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:0.15rem;">Email</label><input id="lf-cash-email" type="email" placeholder="you@email.com" style="${iStyle}">` : '',
            needsPhone ? `<label style="display:block;font-size:0.75rem;font-weight:700;color:#4a5568;text-transform:uppercase;letter-spacing:0.4px;margin:${needsEmail ? '0.6rem' : '0'} 0 0.15rem;">Phone</label><input id="lf-cash-phone" type="tel" placeholder="(555) 555-5555" style="${iStyle}">` : '',
        ].join('');
        inlineEl.style.display = 'block';
    }

    noBtn.onclick = () => {
        panel.style.display = 'none';
    };

    yesBtn.onclick = async () => {
        errEl.style.display = 'none';
        let email = d.email || (document.getElementById('lf-cash-email')?.value || '').trim();
        let phone = d.phone || (document.getElementById('lf-cash-phone')?.value || '').trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errEl.textContent = 'Please enter a valid email to receive your offer.';
            errEl.style.display = 'block';
            return;
        }
        if (!phone || phone.replace(/\D/g, '').length < 10) {
            errEl.textContent = 'Please enter a valid phone number.';
            errEl.style.display = 'block';
            return;
        }

        yesBtn.disabled = true;
        yesBtn.textContent = 'Sending…';
        try {
            const res = await fetch('/api/cash-offer/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: name || [d.first, d.last].filter(Boolean).join(' '),
                    email,
                    phone,
                    formattedAddress: d.address,
                    placeId: d.placeId || null,
                    source_site: 'mn_lake',
                    // No property details / AVM yet — backend will persist
                    // the lead with status='new' and our team will follow
                    // up to complete the offer calc.
                }),
            });
            if (!res.ok) {
                const r = await res.json().catch(() => ({}));
                throw new Error(r.error || 'Could not submit cash offer request.');
            }
            panel.style.display = 'none';
            doneEl.style.display = 'block';
        } catch (err) {
            errEl.textContent = err.message || 'Something went wrong. Please try again.';
            errEl.style.display = 'block';
            yesBtn.disabled = false;
            yesBtn.textContent = 'Yes, send my cash offer';
        }
    };
}

// Backward-compat aliases
window.openModal     = function() { openForm('general'); };
window.closeModal    = function() { closeForm(); };
window.nextModalStep = function() {};

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeForm(); return; }
    if (e.key === 'Enter') {
        const ov = document.getElementById('lf-overlay');
        if (ov && ov.style.display !== 'none') { e.preventDefault(); window._lfNext(); }
    }
});

// ─── First-party pageview beacon ────────────────────────────────────────────
// Fires once per page load. Skips the admin + business-owner dashboards
// (the server-side handler also filters them out as a belt-and-suspenders).
// Uses sendBeacon when available so it survives the unload cycle on SPA-
// style navigations; falls back to fetch keepalive otherwise.
(function trackPageview() {
    try {
        const path = location.pathname + (location.search || '');
        if (/^\/(pages\/admin|api|business\/dashboard|admin)\b/.test(location.pathname)) return;

        // Per-tab session id so we can later compute sessions-to-views ratios.
        let sid = null;
        try {
            sid = sessionStorage.getItem('_mnlh_sid');
            if (!sid) {
                sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
                sessionStorage.setItem('_mnlh_sid', sid);
            }
        } catch (_) { /* private-browsing can block sessionStorage */ }

        const payload = JSON.stringify({
            path,
            referrer: document.referrer || null,
            session_id: sid,
        });
        const url = '/api/analytics/track';
        if (navigator.sendBeacon) {
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
        } else {
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true,
                credentials: 'omit',
            }).catch(() => {});
        }
    } catch (_) { /* analytics must never break a page */ }
})();

