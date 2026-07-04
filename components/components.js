/**
 * components.js — Global Web Components
 * Handles <global-header>, <global-footer>, <lead-modal>
 *
 * Auth State:
 *   All auth-aware UI is driven by /api/auth/session (real HttpOnly JWT cookie).
 *   No localStorage is used for auth state.
 */

// Always use absolute paths so the header/footer hrefs work from every URL
// shape the server routes to: /, /pages/public/*, /pages/agent/*,
// /pages/user/*, /pages/business/*, /pages/admin/*, /towns/:slug,
// /lakes/:slug, /businesses/:slug, etc. The previous depth-aware logic
// returned '' on any /pages/* path, which made dashboard pages 404 on
// every nav link (e.g. 'buy.html' resolving to /pages/agent/buy.html).
const getDepth = () => '/pages/public/';
const getRoot  = () => '/';

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

            // Default landing per role. Business owners get their own
            // dashboard at /business/dashboard (Express route, not under
            // /pages/) — falling through to the agent dashboard 403s
            // them out via the role gate on /api/agents/me.
            let dashLink = rp + 'pages/agent/dashboard.html';
            if (user.role === 'admin' || user.role === 'super_admin') {
                dashLink = rp + 'pages/admin/dashboard.html';
            } else if (user.role === 'client') {
                dashLink = rp + 'pages/user/dashboard.html';
            } else if (user.role === 'business_owner') {
                dashLink = '/business/dashboard';
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
                        { label: 'Find Your Lake',   href: `${bp}find-your-lake.html` },
                        { label: 'Compare Lakes',    href: `${bp}compare-lakes.html` },
                    ]},
                    { heading: 'Buyer Resources', links: [
                        { label: 'Buyer Guides & Tools', href: `${bp}resources.html?category=Buyer%20Resources` },
                        { label: 'Cost Calculator',      href: `${bp}lake-mortgage-calculator.html` },
                        { label: "Buyer's Checklist",    href: `${bp}lake-buyer-checklist.html` },
                        { label: 'Blog',                 href: `${bp}blog.html` },
                    ]},
                ]
            },
            {
                id: 'sell', label: 'Sell', href: `${bp}sell.html`,
                columns: [
                    { heading: 'Sell Your Home', links: [
                        { label: 'Free Home Valuation', href: `${bp}sell.html` },
                        { label: 'List With an Agent', href: `${bp}sell.html#full-service` },
                        { label: 'List as a Rental', href: `${bp}rent.html` },
                    ]},
                    { heading: 'Skip the Hassle', links: [
                        { label: 'Get a Cash Offer', href: `${bp}cash-offer.html` },
                        { label: 'How Cash Offers Work', href: `${bp}cash-offer.html#how-it-works` },
                    ]},
                    { heading: 'Seller Resources', links: [
                        { label: 'Seller Guides & Tools', href: `${bp}resources.html?category=Seller%20Resources` },
                        { label: 'Cost Calculator',       href: `${bp}lake-mortgage-calculator.html` },
                        { label: 'Selling Articles',      href: `${bp}blog.html?tag=Seller%20Resources` },
                        { label: 'Blog',                  href: `${bp}blog.html` },
                    ]},
                ]
            },
            {
                id: 'lakes', label: 'Lakes & Towns', href: '/towns',
                columns: [
                    { heading: 'Browse', links: [
                        { label: 'Lakes & Towns map',    href: '/towns' },
                        { label: 'Lake Properties map',  href: '/towns?view=props' },
                        { label: 'Market Index',         href: '/market-index' },
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
            { id: 'listings', label: 'Properties', href: '/towns?view=props' },
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
                        { label: 'Agent Resource Library', href: `${bp}resources.html` },
                        { label: 'Working With Agents',    href: `${bp}blog.html?tag=Working%20With%20an%20Agent` },
                        { label: 'Training & Support',     href: `${bp}join.html` },
                        { label: 'Blog',                   href: `${bp}blog.html` },
                    ]},
                ]
            },
            {
                id: 'resources', label: 'Resources', href: `${bp}resources.html`,
                columns: [
                    { heading: 'For you', links: [
                        { label: 'Buyer Resources',   href: `${bp}resources.html?category=Buyer%20Resources` },
                        { label: 'Seller Resources',  href: `${bp}resources.html?category=Seller%20Resources` },
                        { label: 'Renter Resources',  href: `${bp}rent.html` },
                        { label: 'Cabin Owner Tools', href: `${bp}resources.html?category=Tools` },
                    ]},
                    { heading: 'By topic', links: [
                        { label: 'Valuation & Pricing', href: `${bp}sell.html` },
                        { label: 'Dock & Permits',      href: `${bp}lake-buyer-checklist.html` },
                        { label: 'Financing',           href: `${bp}lake-mortgage-calculator.html` },
                        { label: 'Find Your Lake',      href: `${bp}find-your-lake.html` },
                    ]},
                    { heading: 'Library', links: [
                        { label: 'All Resources',       href: `${bp}resources.html` },
                        { label: 'Buyer Guides',        href: `${bp}blog.html?tag=Buyer%20Guide` },
                        { label: 'Seller Guides',       href: `${bp}blog.html?tag=Seller%20Resources` },
                        { label: 'Tools & Calculators', href: `${bp}resources.html?category=Tools` },
                        { label: 'All Articles',        href: `${bp}blog.html` },
                    ]},
                    { heading: 'Company', links: [
                        { label: 'About Us',      href: `${bp}about.html` },
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

        const megamenusHtml = navItems.filter(item => item.columns && item.columns.length).map(item => `
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
                                ${(item.columns || []).map(col => `
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
                        <a href="${user.role === 'admin' || user.role === 'super_admin' ? rp + 'pages/admin/dashboard.html' : user.role === 'client' ? rp + 'pages/user/dashboard.html' : user.role === 'business_owner' ? '/business/dashboard' : rp + 'pages/agent/dashboard.html'}" class="mobile-menu-cta-outline">Dashboard</a>
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
                <a href="${user.role === 'admin' || user.role === 'super_admin' ? rp + 'pages/admin/dashboard.html' : user.role === 'client' ? rp + 'pages/user/dashboard.html' : user.role === 'business_owner' ? '/business/dashboard' : rp + 'pages/agent/dashboard.html'}"
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

        // (Removed) The sticky mobile "Get matched" bar used to be injected here.
        // Pulled per owner request — it read as intrusive on mobile. The hero,
        // "Discover" and final CTA bands already carry the match action.

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
                <a href="${bp}contact.html" class="btn btn-primary" style="font-size:0.85rem;padding:0.65rem 1.4rem;text-decoration:none;display:inline-block;">Get in Touch</a>
                <div class="footer-social" style="margin-top:1.25rem;display:flex;gap:0.6rem;">
                    <a href="https://www.instagram.com/mnlakehomes/" target="_blank" rel="noopener" aria-label="MN Lake Homes on Instagram" style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,0.08);color:#fff;text-decoration:none;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                    </a>
                    <a href="https://www.facebook.com/mnlakehomesforsale" target="_blank" rel="noopener" aria-label="MN Lake Homes on Facebook" style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,0.08);color:#fff;text-decoration:none;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                    </a>
                </div>
            </div>

            <div class="footer-links">
                <div class="link-column">
                    <h4>Real Estate</h4>
                    <a href="${bp}buy.html">Buy a Home</a>
                    <a href="${bp}sell.html">Sell a Home</a>
                    <a href="${bp}rent.html">Rent a Home</a>
                    <a href="${bp}cash-offer.html">Get a Cash Offer</a>
                    <a href="${bp}agents.html">Find an Agent</a>
                </div>
                <div class="link-column">
                    <h4>Explore</h4>
                    <a href="/towns">Lakes &amp; Towns</a>
                    <a href="/towns?view=props">Lake Properties Map</a>
                    <a href="/market-index">Market Index</a>
                    <a href="${bp}resources.html">Resource Library</a>
                    <a href="${bp}blog.html">Blog</a>
                    <a href="${bp}find-your-lake.html">Find Your Lake</a>
                </div>
                <div class="link-column">
                    <h4>Company</h4>
                    <a href="${bp}about.html">About Us</a>
                    <a href="${bp}contact.html">Contact Us</a>
                    <a href="${bp}faq.html">FAQ</a>
                    <a href="${bp}join.html">Join as an Agent</a>
                    <a href="/business-signup">List your Business</a>
                    ${isStaff ? `<a href="${rp}pages/admin/dashboard.html">Admin Portal</a>` : ''}
                </div>
            </div>

        </div>
        <div class="footer-bottom">
            <p class="footer-copyright">&copy; 2026 MinnesotaLakeHomesForSale.com. All rights reserved. <span style="margin:0 0.4rem;opacity:0.5;">·</span> <a href="/privacy" style="color:inherit;text-decoration:underline;">Privacy</a> <span style="margin:0 0.4rem;opacity:0.5;">·</span> <a href="/terms" style="color:inherit;text-decoration:underline;">Terms</a></p>
            <p class="footer-disclaimer">MinnesotaLakeHomesForSale.com is a real estate network and lead generation platform, not a licensed brokerage. We do not represent buyers or sellers directly. All transactions are facilitated by independently licensed real estate professionals. This platform is currently in beta &mdash; we are testing an agent match experience designed to enhance the real estate journey and Minnesota lake life. Results and agent availability may vary.</p>
        </div>
    </footer>`;
    }
}
customElements.define('global-footer', GlobalFooter);

// ─── Lead Modal (legacy alias — renders nothing, openForm() drives UI) ────────
class LeadModal extends HTMLElement { connectedCallback() {} }
customElements.define('lead-modal', LeadModal);

// ─── Reviews widget (agents + businesses) ─────────────────────────────────────
// <reviews-widget subject-type="agent" subject-id="..." subject-name="Jane">
// Renders the approved reviews + aggregate stars and a submit form. Pages that
// load their subject async can instead call el.load(type, id, name) once ready.
function ensureReviewStyles() {
    if (document.getElementById('rw-styles')) return;
    const s = document.createElement('style');
    s.id = 'rw-styles';
    s.textContent = `
      .rw { max-width:820px; margin:0 auto; }
      .rw-h2 { font-size:2rem; font-weight:700; color:#1a202c; letter-spacing:-0.5px; margin:0; }
      .rw-agg { display:flex; align-items:center; gap:0.55rem; margin-top:0.5rem; flex-wrap:wrap; }
      .rw-agg .v { font-weight:800; color:#1a202c; font-size:1.15rem; }
      .rw-agg .c { color:#718096; font-size:0.9rem; }
      .rw-none { color:#718096; margin:0.5rem 0 0; }
      .rw-list { margin:1.6rem 0; }
      .rw-card { background:#fff; border:1px solid #edf2f7; border-radius:12px; padding:1.1rem 1.3rem; margin-bottom:0.8rem; }
      .rw-card .top { display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap; }
      .rw-card .nm { font-weight:700; color:#1a202c; }
      .rw-verified { display:inline-block; background:#e6fffa; color:#0f766e; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.4px; border-radius:5px; padding:0.1rem 0.4rem; margin-left:0.3rem; vertical-align:middle; }
      .rw-card .ti { font-weight:700; color:#1a202c; margin-top:0.4rem; }
      .rw-card .bd { color:#4a5568; line-height:1.6; margin:0.3rem 0 0; }
      .rw-stars { white-space:nowrap; }
      .rw-leave { display:inline-flex; align-items:center; justify-content:center; gap:0.5rem; background:#1d6df2; color:#fff; border:0; border-radius:10px; padding:0.85rem 1.5rem; font-weight:700; font-size:1rem; cursor:pointer; font-family:inherit; }
      .rw-leave:hover { background:#155bc8; }

      .rw-modal { position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.55); display:none; align-items:center; justify-content:center; padding:1.5rem; }
      .rw-modal.open { display:flex; }
      .rw-sheet { background:#fff; border-radius:16px; width:100%; max-width:520px; max-height:92vh; overflow-y:auto; box-shadow:0 30px 60px rgba(0,0,0,0.3); }
      .rw-sheet-hd { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; padding:1.4rem 1.5rem 0.5rem; }
      .rw-sheet-hd h3 { margin:0; font-size:1.3rem; font-weight:800; color:#1a202c; }
      .rw-sheet-hd p { margin:0.25rem 0 0; color:#718096; font-size:0.86rem; }
      .rw-x { background:none; border:0; font-size:1.8rem; line-height:1; color:#a0aec0; cursor:pointer; padding:0 0.2rem; }
      .rw-body { padding:0.75rem 1.5rem 1.5rem; }
      .rw-msg { display:none; padding:0.8rem 1rem; border-radius:8px; margin-bottom:1rem; font-weight:600; font-size:0.9rem; }
      .rw-field { margin-bottom:1rem; }
      .rw-label { display:block; font-weight:700; color:#4a5568; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:0.4rem; }
      .rw-input, .rw-textarea { width:100%; padding:0.8rem 0.9rem; border:1px solid #e2e8f0; border-radius:9px; font:inherit; box-sizing:border-box; }
      .rw-textarea { resize:vertical; min-height:96px; }
      .rw-row { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
      .rw-stars-input { display:flex; gap:0.1rem; }
      .rw-star-btn { background:none; border:0; cursor:pointer; font-size:2.2rem; line-height:1; color:#e2e8f0; padding:0.1rem; -webkit-tap-highlight-color:transparent; }
      .rw-star-btn.on { color:#f6ad2b; }
      .rw-submit { width:100%; background:#1d6df2; color:#fff; border:0; border-radius:10px; padding:0.9rem; font-weight:700; font-size:1rem; cursor:pointer; font-family:inherit; }
      .rw-submit:disabled { opacity:0.6; }

      @media (max-width:600px){
        .rw-h2 { font-size:1.6rem; }
        .rw-modal { padding:0; align-items:flex-end; }
        .rw-sheet { max-width:none; border-radius:18px 18px 0 0; max-height:94vh; }
        .rw-row { grid-template-columns:1fr; }
        .rw-star-btn { font-size:2.5rem; padding:0.15rem 0.25rem; }
        .rw-leave { width:100%; }
      }`;
    document.head.appendChild(s);
}

// Bottom-sheet-on-mobile review submit modal, shared by all widgets on a page.
class ReviewsWidget extends HTMLElement {
    connectedCallback() {
        ensureReviewStyles();
        this._rating = 0;
        this._type = this.getAttribute('subject-type') || 'agent';
        this._id   = this.getAttribute('subject-id') || null;
        this._name = this.getAttribute('subject-name') || 'this profile';
        this.innerHTML = '<div style="color:#a0aec0;padding:1rem 0;">Loading reviews…</div>';
        if (this._id) this.load(this._type, this._id, this._name);
    }
    async load(type, id, name) {
        this._type = type; this._id = id; this._name = name || this._name;
        let data = { aggregate: { count: 0, average: 0 }, reviews: [] };
        try {
            const res = await fetch(`/api/reviews?subject_type=${encodeURIComponent(type)}&subject_id=${encodeURIComponent(id)}`);
            if (res.ok) data = await res.json();
        } catch (_) { /* empty state */ }
        this._render(data);
    }
    _esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    _starRow(value, size) {
        let out = '';
        for (let i = 1; i <= 5; i++) out += `<span style="color:${i <= Math.round(value) ? '#f6ad2b' : '#e2e8f0'};font-size:${size};line-height:1;">★</span>`;
        return `<span class="rw-stars" aria-label="${value} out of 5">${out}</span>`;
    }
    _render(data) {
        const agg = data.aggregate || { count: 0, average: 0 };
        const reviews = Array.isArray(data.reviews) ? data.reviews : [];
        const firstName = this._esc((this._name || '').split(' ')[0] || 'them');

        const aggregateHtml = agg.count > 0
            ? `<div class="rw-agg">${this._starRow(agg.average, '1.3rem')}
                   <span class="v">${agg.average.toFixed(1)}</span>
                   <span class="c">(${agg.count} review${agg.count === 1 ? '' : 's'})</span></div>`
            : `<p class="rw-none">No reviews yet — be the first to review ${firstName}.</p>`;

        const listHtml = reviews.map(r => `
            <div class="rw-card">
                <div class="top"><span class="nm">${this._esc(r.author_name)}${r.verified ? ' <span class="rw-verified" title="Reviewed after a completed purchase">✓ Verified</span>' : ''}</span>${this._starRow(r.rating, '0.95rem')}</div>
                ${r.title ? `<div class="ti">${this._esc(r.title)}</div>` : ''}
                ${r.body ? `<p class="bd">${this._esc(r.body)}</p>` : ''}
            </div>`).join('');

        this.innerHTML = `
            <div class="rw">
                <h2 class="rw-h2">Reviews</h2>
                ${aggregateHtml}
                <div class="rw-list">${listHtml}</div>
                <button type="button" class="rw-leave">★ Leave a review</button>
            </div>`;

        this.querySelector('.rw-leave').addEventListener('click', () => this.openModal());
    }
    // Public — lets an external button (e.g. under the contact form) open it.
    openModal() {
        if (!this._modal) this._buildModal();
        this._rating = 0;
        this._modal.querySelectorAll('.rw-star-btn').forEach(b => b.classList.remove('on'));
        this._modal.querySelector('.rw-form').reset();
        const msg = this._modal.querySelector('.rw-msg'); msg.style.display = 'none';
        this._modal.querySelector('.rw-subj').textContent = this._name || 'this profile';
        this._modal.classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(() => this._modal.querySelector('.rw-name').focus(), 50);
    }
    closeModal() {
        if (this._modal) this._modal.classList.remove('open');
        document.body.style.overflow = '';
    }
    _buildModal() {
        const stars = [1, 2, 3, 4, 5].map(n =>
            `<button type="button" class="rw-star-btn" data-n="${n}" aria-label="${n} star${n === 1 ? '' : 's'}">★</button>`).join('');
        const m = document.createElement('div');
        m.className = 'rw-modal';
        m.innerHTML = `
            <div class="rw-sheet" role="dialog" aria-modal="true" aria-label="Leave a review">
                <div class="rw-sheet-hd">
                    <div><h3>Leave a review</h3><p>Reviewing <strong class="rw-subj"></strong> · checked before it appears</p></div>
                    <button type="button" class="rw-x" aria-label="Close">×</button>
                </div>
                <div class="rw-body">
                    <div class="rw-msg"></div>
                    <form class="rw-form">
                        <input class="rw-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;">
                        <div class="rw-field">
                            <label class="rw-label">Your rating *</label>
                            <div class="rw-stars-input">${stars}</div>
                        </div>
                        <div class="rw-row" style="margin-bottom:1rem;">
                            <div><label class="rw-label">Your name *</label><input class="rw-input rw-name" type="text" placeholder="Jane D."></div>
                            <div><label class="rw-label">Email (optional)</label><input class="rw-input rw-email" type="email" placeholder="jane@email.com"></div>
                        </div>
                        <div class="rw-field"><label class="rw-label">Title (optional)</label><input class="rw-input rw-title" type="text" placeholder="Great experience"></div>
                        <div class="rw-field"><label class="rw-label">Your review</label><textarea class="rw-textarea rw-body-input" placeholder="Share your experience…"></textarea></div>
                        <button type="submit" class="rw-submit">Submit review</button>
                    </form>
                </div>
            </div>`;
        document.body.appendChild(m);
        this._modal = m;

        m.addEventListener('click', (e) => { if (e.target === m) this.closeModal(); });
        m.querySelector('.rw-x').addEventListener('click', () => this.closeModal());

        const paint = (val) => m.querySelectorAll('.rw-star-btn').forEach(b => b.classList.toggle('on', Number(b.dataset.n) <= val));
        m.querySelectorAll('.rw-star-btn').forEach(btn => {
            btn.addEventListener('mouseenter', () => paint(Number(btn.dataset.n)));
            btn.addEventListener('click', () => { this._rating = Number(btn.dataset.n); paint(this._rating); });
        });
        m.querySelector('.rw-stars-input').addEventListener('mouseleave', () => paint(this._rating));

        const form = m.querySelector('.rw-form');
        const msg  = m.querySelector('.rw-msg');
        const show = (text, ok) => {
            msg.textContent = text; msg.style.display = 'block';
            msg.style.background = ok ? '#f0fff4' : '#fff5f5';
            msg.style.color = ok ? '#276749' : '#c53030';
            msg.style.border = `1px solid ${ok ? '#9ae6b4' : '#feb2b2'}`;
        };
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = m.querySelector('.rw-name').value.trim();
            if (!this._rating) return show('Please pick a star rating.', false);
            if (!name)         return show('Please add your name.', false);
            const btn = m.querySelector('.rw-submit');
            btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Submitting…';
            try {
                const res = await fetch('/api/reviews', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subject_type: this._type, subject_id: this._id,
                        author_name: name, author_email: m.querySelector('.rw-email').value.trim(),
                        rating: this._rating, title: m.querySelector('.rw-title').value.trim(),
                        body: m.querySelector('.rw-body-input').value.trim(),
                        website: m.querySelector('.rw-hp').value || '',
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { show(data.error || 'Could not submit your review.', false); return; }
                show(data.message || 'Thanks! Your review will appear once approved.', true);
                form.reset(); this._rating = 0; paint(0);
                setTimeout(() => this.closeModal(), 2200);
            } catch (_) {
                show('Network error — please try again.', false);
            } finally {
                btn.disabled = false; btn.textContent = orig;
            }
        });
    }
}
customElements.define('reviews-widget', ReviewsWidget);

// ─── Multi-Step Conversational Lead Forms ─────────────────────────────────────

// One "name" step instead of separate first/last (fewer fields = higher
// completion). _lfNext derives d.first from the name for the conversational
// personalization that follows.
const _LF_CFG = {
    buy: {
        source: 'buyer',
        steps: [
            { q: 'Who are we speaking with?',               hint: 'Just your name to get started.',                                            field: { id: 'name',     type: 'text',    ph: 'Your full name',          ac: 'name' } },
            { q: d => `${d.first}, what's your budget range?`,              hint: 'Helps us match you with the right properties.',               field: { id: 'budget',   type: 'select',  ph: 'Select a range…',         opts: ['Under $500K','$500K – $750K','$750K – $1M','$1M – $2M','Over $2M'] } },
            { q: 'When are you hoping to buy?',                                                                                                   field: { id: 'timeline', type: 'select',  ph: 'Select a timeline…',      opts: ['ASAP — ready to move','Within 1–3 months','Within 3–6 months','Just exploring for now'] } },
            { q: d => `Almost done, ${d.first}. How can we reach you?`,      hint: "One contact method is all we need — a local specialist reaches out within one business day.",         field: { id: 'contact', type: 'contact' } }
        ]
    },
    sell: {
        source: 'seller',
        steps: [
            { q: "What's the property address?",             hint: 'Full street address so we can pull accurate comps.',                        field: { id: 'address',  type: 'text',    ph: 'e.g. 123 Shoreline Dr, Wayzata, MN' } },
            { q: 'Who are we speaking with?',                hint: 'Just your name to get started.',                                            field: { id: 'name',     type: 'text',    ph: 'Your full name',          ac: 'name' } },
            { q: 'When are you looking to sell?',                                                                                                 field: { id: 'timeline', type: 'select',  ph: 'Select a timeline…',      opts: ['As soon as possible','Within 3 months','3–6 months out','Just exploring options'] } },
            { q: d => `Great, ${d.first}. How can we reach you?`,            hint: "We'll send your free market analysis within one business day.",                                      field: { id: 'contact', type: 'contact' } }
        ]
    },
    rent: {
        source: 'general_contact',
        steps: [
            { q: 'Who are we speaking with?',               hint: 'Just your name to get started.',                                            field: { id: 'name',     type: 'text',    ph: 'Your full name',          ac: 'name' } },
            { q: 'When do you need it?',                    hint: 'Helps us check availability.',                                               field: { id: 'timeline', type: 'select',  ph: 'Select a timeframe…',     opts: ['This weekend','This month','Seasonal (summer or winter)','Year-round lease'] } },
            { q: d => `${d.first}, what's your monthly budget?`,                                                                                  field: { id: 'budget',   type: 'select',  ph: 'Select a range…',         opts: ['Under $1,500/mo','$1,500 – $3,000/mo','$3,000 – $5,000/mo','Over $5,000/mo'] } },
            { q: d => `Perfect, ${d.first}. How can we reach you?`,          hint: "We'll start finding your ideal rental right away.",                                                  field: { id: 'contact', type: 'contact' } }
        ]
    },
    agent: {
        source: 'agent_inquiry',
        steps: [
            { q: 'Who are we speaking with?',               hint: 'Just your name to get started.',                                            field: { id: 'name',     type: 'text',    ph: 'Your full name',          ac: 'name' } },
            { q: d => `${d.first}, what do you need help with?`,            hint: "We'll match you with the right specialist.",                  field: { id: 'intent',   type: 'select',  ph: 'Select one…',             opts: ['Buying a lake home','Selling my property','Finding a rental','Market information','General question'] } },
            { q: d => `Got it, ${d.first}. How can we reach you?`,           hint: 'A local specialist will be in touch within one business day.',                                        field: { id: 'contact', type: 'contact' } }
        ]
    },
    general: {
        source: 'general_contact',
        steps: [
            { q: 'Who are we speaking with?',               hint: 'Just your name to get started.',                                            field: { id: 'name',     type: 'text',    ph: 'Your full name',          ac: 'name' } },
            { q: d => `How can we help you, ${d.first}?`,                                                                                        field: { id: 'intent',   type: 'select',  ph: 'Select one…',             opts: ['I want to buy a home','I want to sell my property',"I'm looking for a rental",'I need to find an agent','General question'] } },
            { q: d => `Perfect, ${d.first}. How can we reach you?`,          hint: "We'll be in touch within one business day.",                                                         field: { id: 'contact', type: 'contact' } }
        ]
    },
    cash_offer: {
        source: 'cash_offer',
        steps: [
            { q: 'Let\'s get your cash offer started.',     hint: "First, what's your name?",                                                   field: { id: 'name',     type: 'text',    ph: 'Your full name',          ac: 'name' } },
            { q: d => `${d.first}, what's the property address?`,           hint: 'Full address or the lake + nearest city works too.',          field: { id: 'address',  type: 'text',    ph: 'e.g. 123 Shoreline Dr, Wayzata, MN' } },
            { q: 'What type of property is it?',                                                                                                  field: { id: 'property_type', type: 'select', ph: 'Select one…',       opts: ['Single-family lake home','Cabin / cottage','Condo or townhouse','Multi-family','Vacant lakefront land','Other'] } },
            { q: 'What condition is the home in?',          hint: 'A ballpark is fine — we\'ll confirm during the walkthrough.',                 field: { id: 'condition', type: 'select', ph: 'Select one…',            opts: ['Move-in ready','Light cosmetic updates needed','Major repairs needed','Tear-down / as-is'] } },
            { q: 'When would you like to close?',                                                                                                 field: { id: 'timeline', type: 'select',  ph: 'Select a timeline…',      opts: ['As soon as possible (7–14 days)','2–4 weeks','1–2 months','Just exploring options'] } },
            { q: d => `Last step, ${d.first}. How can we reach you?`,        hint: "Your cash offer will arrive within 48 hours.",                                                       field: { id: 'contact', type: 'contact' } }
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
                <p style="text-align:center;color:#718096;font-size:0.8rem;margin-top:1.1rem;font-weight:600;">✓ Free to you &nbsp;·&nbsp; ✓ No commission &nbsp;·&nbsp; ✓ Vetted local agents</p>
                <p style="text-align:center;color:#cbd5e0;font-size:0.72rem;margin-top:0.4rem;">No obligation. No spam, ever.</p>
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
        // Email + phone capture. No account required — the lead is linked
        // to a user account later, by email, if/when one exists.
        area.innerHTML = `
            <input type="email" id="lf-email" placeholder="Email address"
                autocomplete="email" style="${iStyle}" ${focus} value="${_lfs.data.email || ''}">
            <div style="height:0.6rem;"></div>
            <input type="tel" id="lf-phone" placeholder="Phone number (optional)"
                autocomplete="tel" style="${iStyle}" ${focus} value="${_lfs.data.phone || ''}">`;
        setTimeout(() => document.getElementById('lf-email')?.focus(), 60);
    } else if (f.type === 'select') {
        // Render each option as a clickable card. Clicking sets the value
        // and immediately advances the form (same UX as the old <select>
        // onchange but with a tap target sized for fingers + keyboards).
        const current = _lfs.data[f.id];
        const cards = f.opts.map((o, i) => {
            const sel = current === o;
            return `<button type="button" class="lf-opt-card${sel ? ' is-selected' : ''}"
                       data-value="${o.replace(/"/g, '&quot;')}"
                       onclick="window._lfPickOption(${JSON.stringify(o).replace(/"/g, '&quot;')})">
                       <span class="lf-opt-label">${o}</span>
                       <span class="lf-opt-arrow" aria-hidden="true">→</span>
                   </button>`;
        }).join('');
        area.innerHTML = `<div class="lf-opt-grid" id="lf-${f.id}-grid">${cards}</div>`;
        _lfEnsureOptCardStyles();
    } else {
        area.innerHTML = `
            <input type="${f.type}" id="lf-${f.id}" placeholder="${f.ph}" autocomplete="${f.ac||'off'}"
                style="${iStyle}text-align:center;" ${focus} value="${_lfs.data[f.id]||''}">`;
        setTimeout(() => document.getElementById('lf-' + f.id)?.focus(), 60);
        if (f.id === 'address') {
            _lfAddressInit();
        } else {
            _lfAddressTeardown();
        }
    }

    // next button
    const btn = document.getElementById('lf-next');
    btn.disabled      = false;
    btn.style.display = f.type === 'select' ? 'none' : 'block';
    btn.textContent   = _lfs.step === total - 1 ? 'Submit →' : 'Continue →';
    btn.style.background = '#1a202c';
}

// ── Card-based select option picker ────────────────────────────────────────
// Each option in a select-type step renders as a clickable card. Clicking
// stores the value in _lfs.data and immediately advances the form (same
// as the old <select> onchange behavior, just nicer to tap).
window._lfPickOption = function (value) {
    const steps = _lfSteps();
    const f = steps[_lfs.step].field;
    if (!f || f.type !== 'select') return;
    _lfs.data[f.id] = value;
    if (_lfs.step === steps.length - 1) { _lfDoSubmit(); return; }
    _lfs.step++;
    _lfSlide();
};

function _lfEnsureOptCardStyles() {
    if (document.getElementById('lf-opt-card-styles')) return;
    const s = document.createElement('style');
    s.id = 'lf-opt-card-styles';
    s.textContent = `
        .lf-opt-grid {
            display: grid; grid-template-columns: 1fr; gap: 0.6rem;
        }
        .lf-opt-card {
            display: flex; align-items: center; justify-content: space-between;
            width: 100%; padding: 1.05rem 1.25rem;
            background: #fff; border: 2px solid #e2e8f0; border-radius: 12px;
            font-family: inherit; font-size: 1.05rem; font-weight: 600;
            color: #1a202c; cursor: pointer; text-align: left;
            transition: border-color 0.15s, background 0.15s, transform 0.1s, box-shadow 0.15s;
        }
        .lf-opt-card:hover {
            border-color: #1d6df2; background: #f7fafc;
        }
        .lf-opt-card:active { transform: translateY(1px); }
        .lf-opt-card.is-selected {
            border-color: #1d6df2; background: #ebf4ff;
        }
        .lf-opt-card .lf-opt-arrow {
            color: #cbd5e0; font-weight: 700; font-size: 1.05rem; transition: color 0.15s, transform 0.15s;
        }
        .lf-opt-card:hover .lf-opt-arrow { color: #1d6df2; transform: translateX(3px); }
    `;
    document.head.appendChild(s);
}

// ── Address autocomplete on the lead form ───────────────────────────────────
// Uses the SAME google.maps.places.Autocomplete widget the sell hero uses.
// The pac-container z-index is bumped so it sits above the overlay (z=9000),
// and the form's scroll-lock now uses overflow:hidden instead of pinning body
// with position:fixed (the latter broke the widget's coordinate math).

let _lfMapsState = null; // 'loading' | 'ready' | 'failed'

function _lfEnsurePacContainerZ() {
    if (document.getElementById('lf-pac-z')) return;
    const style = document.createElement('style');
    style.id = 'lf-pac-z';
    style.textContent = '.pac-container { z-index: 10001 !important; }';
    document.head.appendChild(style);
}

function _lfLoadMaps() {
    if (window.google?.maps?.places) { _lfMapsState = 'ready'; return Promise.resolve(); }
    if (_lfMapsState === 'ready')   return Promise.resolve();
    if (_lfMapsState === 'failed')  return Promise.reject(new Error('maps_failed'));
    if (window.__lfMapsPromise)     return window.__lfMapsPromise;

    window.__lfMapsPromise = (async () => {
        if (document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) {
            await new Promise((resolve, reject) => {
                const t0 = Date.now();
                const tick = setInterval(() => {
                    if (window.google?.maps?.places) { clearInterval(tick); resolve(); }
                    else if (Date.now() - t0 > 10000) { clearInterval(tick); reject(new Error('timeout')); }
                }, 80);
            });
            _lfMapsState = 'ready';
            return;
        }
        const res = await fetch('/api/config/public');
        const cfg = await res.json().catch(() => ({}));
        const key = cfg?.googlePlacesKey;
        if (!key) throw new Error('no_key');
        await new Promise((resolve, reject) => {
            const cb = '__lfMapsCb_' + Math.random().toString(36).slice(2);
            window[cb] = () => { delete window[cb]; resolve(); };
            const s = document.createElement('script');
            s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&callback=${cb}`;
            s.async = true;
            s.onerror = () => { delete window[cb]; reject(new Error('script_load')); };
            document.head.appendChild(s);
        });
        _lfMapsState = 'ready';
    })().catch(err => {
        _lfMapsState = 'failed';
        console.warn('[lead-form] Maps load failed:', err.message);
        throw err;
    });
    return window.__lfMapsPromise;
}

function _lfAddressTeardown() {
    // No-op — the Autocomplete widget cleans itself up when its input is
    // removed from the DOM (which happens on every step navigation).
}

function _lfBindWidget() {
    const input = document.getElementById('lf-address');
    if (!input || input.dataset.lfBound === '1') return;
    if (!window.google?.maps?.places) return;
    input.dataset.lfBound = '1';

    const ac = new google.maps.places.Autocomplete(input, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
        fields: ['place_id', 'formatted_address', 'address_components', 'geometry'],
    });
    ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const addr = place?.formatted_address || input.value;
        if (addr) {
            input.value = addr;
            _lfs.data.address = addr;
        }
    });
    // Suppress Enter while a suggestion is highlighted — Google's dropdown
    // handles selection — so the form doesn't advance prematurely.
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && document.querySelector('.pac-container:not([style*="display: none"])')) {
            e.preventDefault();
        }
    });
}

async function _lfAddressInit() {
    _lfEnsurePacContainerZ();
    if (window.google?.maps?.places) { _lfBindWidget(); return; }
    try {
        await _lfLoadMaps();
        _lfBindWidget();
    } catch (_) {
        // Plain text fallback — input still works.
    }
}

function _lfSlide() {
    const body = document.getElementById('lf-body');
    body.style.opacity = '0'; body.style.transform = 'translateY(12px)';
    setTimeout(() => { _lfRender(); body.style.opacity = '1'; body.style.transform = 'translateY(0)'; }, 140);
}

// Scroll-lock: just disable scroll on html+body. The previous version pinned
// body with position:fixed (an iOS hack), which broke google.maps.places.Autocomplete
// inside the overlay — the widget silently returned zero results because its
// internal coordinate math relied on body being statically positioned.
function _lfLockScroll() {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
}
function _lfUnlockScroll() {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
}

// Fire a GA4/HubSpot funnel event (safe no-op when no tracking is configured).
function _lfTrack(event, params) {
    try { if (typeof window.trackConversion === 'function') window.trackConversion(event, params || {}); } catch (_) {}
}

window.openForm = function(type, prefill) {
    _lfInit();
    const t = type || 'general';
    const data = { ...(prefill && typeof prefill === 'object' ? prefill : {}) };
    // Attribution: an explicit prefill._source wins, else a ?ref= URL param
    // (so a tool/page can tag where the lead came from). Stored on _lfs and
    // appended to the lead notes at submit — never dumped as a form field.
    let leadRef = (data && data._source) || null;
    if (data && data._source) delete data._source;
    if (!leadRef) { try { leadRef = new URLSearchParams(window.location.search).get('ref') || null; } catch (_) {} }
    // Lake attribution: an explicit prefill._lake wins, else auto-detect from a
    // /lakes/<slug> page URL. Sent as lake_slug at submit so the lead routes to
    // that lake's founding agent. Never rendered as a form field.
    let lakeSlug = (data && data._lake) || null;
    if (data && data._lake) delete data._lake;
    if (!lakeSlug) { try { lakeSlug = (window.location.pathname.match(/^\/lakes\/([^\/?#]+)/) || [])[1] || null; } catch (_) {} }
    // Skip any step whose field id is already populated via prefill.
    const filtered = _LF_CFG[t].steps.filter(s => {
        if (s.field.type === 'contact') return true;
        const v = data[s.field.id];
        return v === undefined || v === null || v === '';
    });
    _lfs = { type: t, step: 0, data, steps: filtered, _leadref: leadRef, _lake: lakeSlug, _submitted: false };
    document.getElementById('lf-ok').style.display   = 'none';
    document.getElementById('lf-body').style.display = 'block';
    document.getElementById('lf-overlay').style.display = 'block';
    _lfLockScroll();
    _lfTrack('lead_form_open', { form_type: t, lead_ref: leadRef || undefined });
    _lfRender();
};

window.closeForm = function() {
    const el = document.getElementById('lf-overlay');
    const wasOpen = el && el.style.display !== 'none';
    // GA4: track drop-off (closed before submitting)
    if (wasOpen && _lfs && !_lfs._submitted) _lfTrack('lead_form_abandon', { form_type: _lfs.type, last_step: (_lfs.step || 0) + 1 });
    if (el) el.style.display = 'none';
    _lfAddressTeardown();
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
        if (!email && !phone)                          { err.textContent = 'Please enter at least one contact method.';  err.style.display = 'block'; return; }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Please enter a valid email address.'; err.style.display = 'block'; return; }
        _lfs.data.email = email || null;
        _lfs.data.phone = phone || null;
    } else if (f.type === 'select') {
        // Card-based selects write directly to _lfs.data via _lfPickOption,
        // so the value is already there if one was picked.
        if (!_lfs.data[f.id]) return;
    } else {
        const val = (document.getElementById('lf-' + f.id)?.value || '').trim();
        if (!val) { err.textContent = 'This field is required.'; err.style.display = 'block'; return; }
        _lfs.data[f.id] = val;
        // Derive the first name from the combined name field so the rest of
        // the conversational flow can keep personalizing (${d.first}).
        if (f.id === 'name') _lfs.data.first = val.split(/\s+/)[0] || val;
    }
    // GA4 funnel: step completed
    _lfTrack('lead_form_step', { step_index: _lfs.step + 1, step_field: f.id });

    if (_lfs.step === steps.length - 1) { _lfDoSubmit(); return; }
    _lfs.step++;
    _lfSlide();
};

async function _lfDoSubmit() {
    const cfg  = _LF_CFG[_lfs.type];
    const d    = _lfs.data;
    const name = (d.name || [d.first, d.last].filter(Boolean).join(' ')).trim();
    // address + placeId + property_* live on the lead record directly,
    // so exclude them from the free-form notes dump.
    const skip = new Set([
        'name','first','last','email','phone',
        'address','placeId',
        'property_street','property_city','property_state','property_zip',
    ]);
    let notes = Object.entries(d).filter(([k,v]) => !skip.has(k) && v)
        .map(([k,v]) => `${k[0].toUpperCase()+k.slice(1).replace(/_/g,' ')}: ${v}`).join('\n');
    // Attribution: where did this lead originate (a tool, a page, a campaign)?
    if (_lfs._leadref) notes = (notes ? notes + '\n' : '') + `Lead source: ${_lfs._leadref}`;

    const btn = document.getElementById('lf-next');
    const errEl = document.getElementById('lf-err');
    btn.disabled = true; btn.style.background = '#a0aec0';
    btn.textContent = 'Submitting…';
    errEl.style.display = 'none';

    try {
        // No account required. The server links this lead to a user_id by
        // email if an account already exists; otherwise it stays unassigned
        // until someone creates an account with the same email (then it's
        // backfilled). credentials:'include' so a logged-in user still gets
        // their session honored.
        const res = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                name,
                email: d.email||null,
                phone: d.phone||null,
                notes: notes||null,
                source: cfg.source,
                lake_slug:         _lfs._lake || null,
                property_address:  d.address || null,
                property_place_id: d.placeId || null,
                property_street:   d.property_street || null,
                property_city:     d.property_city   || null,
                property_state:    d.property_state  || null,
                property_zip:      d.property_zip    || null,
            })
        });
        if (!res.ok) { const r = await res.json().catch(()=>({})); throw new Error(r.error || 'Submission failed.'); }
        _lfs._submitted = true;

        // Fire conversion (GA4 + HubSpot tracking). Helper is a no-op when
        // no tracking IDs are configured yet, so this is safe pre-launch.
        if (typeof window.trackConversion === 'function') {
            window.trackConversion('generate_lead', {
                form_name: 'lead_modal',
                lead_source: cfg.source,
                lead_ref: _lfs._leadref || undefined,
                has_address: !!d.address,
            });
        }

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

// ─── Site image resolver ───────────────────────────────────────────────────
// Reads /api/site-images (cached 60s in sessionStorage) and swaps the src
// attribute on every <img> + the background-image of every element whose
// existing URL appears in the admin's override map. Lets the admin replace
// any image on the entire website from /pages/admin/images.html without
// modifying the HTML files at all.
(function siteImageResolver() {
    if (window.__siteImagesInit) return;
    window.__siteImagesInit = true;

    const CACHE_KEY = 'site_images_v1';
    const CACHE_TTL = 60 * 1000; // 60s — admin edits show up within a minute

    function readCache() {
        try {
            const raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed.ts || (Date.now() - parsed.ts) > CACHE_TTL) return null;
            return parsed.map || {};
        } catch (_) { return null; }
    }
    function writeCache(map) {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), map })); } catch (_) {}
    }

    function applyOverrides(map) {
        if (!map || !Object.keys(map).length) return;
        // <img src> swap. Compare both the raw attribute and the resolved
        // currentSrc-style URL to be safe with absolute vs relative paths.
        document.querySelectorAll('img').forEach(img => {
            const raw = img.getAttribute('src');
            if (raw && map[raw]) {
                img.src = map[raw];
                img.removeAttribute('srcset'); // srcset would re-fight us
            }
        });
        // background-image swap. Cheap heuristic: only inspect elements
        // that have an inline style with `background`, or a known class
        // that uses background-image (we skip the deep CSS-scan path).
        document.querySelectorAll('[style*="background"]').forEach(el => {
            const m = el.style.backgroundImage && el.style.backgroundImage.match(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)]+))\s*\)/);
            if (!m) return;
            const src = (m[1] || m[2] || m[3] || '').trim();
            if (src && map[src]) {
                el.style.backgroundImage = `url("${map[src]}")`;
            }
        });
    }

    function fetchAndApply() {
        fetch('/api/site-images', { credentials: 'omit' })
            .then(r => (r.ok ? r.json() : {}))
            .then(map => {
                writeCache(map);
                applyOverrides(map);
            })
            .catch(() => { /* silent — pages keep originals on failure */ });
    }

    // Run as early as possible. Apply cached overrides synchronously to
    // catch images that are already in the DOM; then re-apply after
    // DOMContentLoaded for any lazy-rendered images; then refresh in the
    // background so admin edits propagate within 60s of a session.
    const cached = readCache();
    if (cached) applyOverrides(cached);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (cached) applyOverrides(cached);
            fetchAndApply();
        });
    } else {
        fetchAndApply();
    }

    // Also rerun when components render new image-containing markup
    // (global-header / global-footer / lead-modal can inject <img> tags).
    // Cheap MutationObserver scoped to <body>.
    if (window.MutationObserver) {
        const obs = new MutationObserver(() => {
            const c = readCache();
            if (c) applyOverrides(c);
        });
        if (document.body) obs.observe(document.body, { childList: true, subtree: true });
        else document.addEventListener('DOMContentLoaded', () => obs.observe(document.body, { childList: true, subtree: true }));
    }
})();

// ─── Launch tracking layer ─────────────────────────────────────────────────
// Loads GA4 (gtag.js) and HubSpot's first-party tracking script (hs-scripts)
// driven entirely by /api/config/public — so the snippets activate the moment
// GA4_MEASUREMENT_ID / HUBSPOT_PORTAL_ID are set in Render and stay dormant
// otherwise. Also exposes window.trackConversion(eventName, params) which
// forms call on success to fire GA4 events + HubSpot custom behavioral
// events at the same time. If neither pixel is loaded, the helper is a
// no-op — forms keep working unchanged.
(function loadLaunchTracking() {
    if (window.__launchTrackingInit) return;
    window.__launchTrackingInit = true;

    // Helper available immediately even before scripts load — calls queue
    // into the gtag/hsq globals which buffer until the SDK boots. Also
    // mirrors the event to /api/analytics/conversion so the admin
    // dashboard can show counts/feed without needing GA4 or HubSpot
    // API access. The server-side mirror is fire-and-forget (sendBeacon
    // when available, fetch keepalive otherwise) so it survives a
    // page navigation that happens immediately after submit.
    window.trackConversion = function (eventName, params) {
        try {
            if (typeof window.gtag === 'function') {
                window.gtag('event', eventName, params || {});
            }
            if (Array.isArray(window._hsq)) {
                window._hsq.push(['trackCustomBehavioralEvent', {
                    name: eventName,
                    properties: params || {},
                }]);
            }
            // Server-side mirror (admin dashboard + metrics tab read from this).
            try {
                let sid = null;
                try { sid = sessionStorage.getItem('lt_sid'); } catch (_) {}
                const payload = JSON.stringify({
                    event_name: eventName,
                    params: params || {},
                    path: location.pathname + location.search,
                    referrer: document.referrer || null,
                    session_id: sid,
                });
                const url = '/api/analytics/conversion';
                if (navigator.sendBeacon) {
                    navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
                } else {
                    fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload,
                        keepalive: true,
                        credentials: 'omit',
                    }).catch(() => {});
                }
            } catch (_) { /* mirror is best-effort */ }
        } catch (_) { /* tracking must never break a flow */ }
    };

    // Pre-allocate the gtag/hsq globals so trackConversion calls fired
    // before the SDKs finish loading are queued and replayed.
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window._hsq = window._hsq || [];

    fetch('/api/config/public', { credentials: 'omit' })
        .then(r => (r.ok ? r.json() : null))
        .then(cfg => {
            if (!cfg) return;

            // ── GA4 (gtag.js) ──
            if (cfg.ga4_id) {
                const s = document.createElement('script');
                s.async = true;
                s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.ga4_id)}`;
                document.head.appendChild(s);
                window.gtag('js', new Date());
                // anonymize_ip stays on by default — same posture as Plausible.
                window.gtag('config', cfg.ga4_id, {
                    anonymize_ip: true,
                    send_page_view: true,
                });
            }

            // ── HubSpot tracking pixel ──
            if (cfg.hubspot_portal_id) {
                const h = document.createElement('script');
                h.async = true; h.defer = true;
                h.id = 'hs-script-loader';
                h.src = `//js.hs-scripts.com/${encodeURIComponent(cfg.hubspot_portal_id)}.js`;
                document.head.appendChild(h);
            }
        })
        .catch(() => { /* config endpoint unreachable — fall through silently */ });
})();

