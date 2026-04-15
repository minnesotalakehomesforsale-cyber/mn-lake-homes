/**
 * components.js — Global Web Components
 * Handles <global-header>, <global-footer>, <lead-modal>
 *
 * Auth State:
 *   All auth-aware UI is driven by /api/auth/session (real HttpOnly JWT cookie).
 *   No localStorage is used for auth state.
 */

const getDepth = () => window.location.pathname.includes('/pages/') ? '' : 'pages/public/';
const getRoot  = () => window.location.pathname.includes('/pages/') ? '../../' : '';

// ─── Global Header ────────────────────────────────────────────────────────────

class GlobalHeader extends HTMLElement {
    connectedCallback() {
        const bp = getDepth();
        const rp = getRoot();

        // Render skeleton header immediately, then hydrate auth state asynchronously
        this.innerHTML = this._buildHeader(bp, rp, null);

        // Check real session
        fetch('/api/auth/session')
            .then(r => { if (r.ok) return r.json(); throw new Error('not_logged_in'); })
            .then(data => {
                // Re-render with authenticated state
                this.innerHTML = this._buildHeader(bp, rp, data);
            })
            .catch(() => {
                // Not logged in — already rendered guest state above
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
            authHtml = `<a href="${bp}login.html" style="color: #fff; font-weight: 600; text-decoration: none;
                padding: 0.5rem 1rem; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; transition: all 0.2s;"
                onmouseover="this.style.background='rgba(255,255,255,0.1)'"
                onmouseout="this.style.background='transparent'">Login</a>`;
        }

        return `
        <header class="navbar" style="background-color: var(--bg-dark); border-bottom: 1px solid rgba(255,255,255,0.08);
                position: fixed; width: 100%; z-index: 1000; top: 0;">
            <div class="logo">
                <div class="logo-icon"></div>
                <span><a href="${rp}index.html" style="color:#fff; text-decoration:none;">MN Lake Homes</a></span>
            </div>
            <nav class="nav-links">
                <a href="${bp}buy.html">Buy</a>
                <a href="${bp}sell.html">Sell</a>
                <a href="${bp}rent.html">Rent</a>
                <a href="${bp}agents.html">Find an Agent</a>
                <a href="${bp}about.html">About</a>
            </nav>
            <div class="nav-actions">
                ${authHtml}
            </div>
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

        this.innerHTML = `<footer class="site-footer">
        <div class="footer-container">
            <div class="footer-brand">
                <div class="logo">
                    <div class="logo-icon" style="background-color: var(--accent-blue);"></div>
                    <span>MN Lake Homes</span>
                </div>
                <p class="footer-desc">Minnesota's premier real estate platform, dedicated to connecting buyers and sellers of the state's finest lakeside properties.</p>
            </div>
            <div class="footer-links">
                <div class="link-column">
                    <h4>Real Estate</h4>
                    <a href="${bp}buy.html">Buy a Home</a>
                    <a href="${bp}sell.html">Sell a Home</a>
                    <a href="${bp}rent.html">Rent a Home</a>
                </div>
                <div class="link-column">
                    <h4>Top Lakes</h4>
                    <a href="${bp}lake-minnetonka.html">Lake Minnetonka</a>
                </div>
                <div class="link-column">
                    <h4>Company</h4>
                    <a href="${bp}blog.html">Blog &amp; Resources</a>
                    <a href="${bp}join.html">Join the Network</a>
                    <a href="${bp}faq.html">FAQs</a>
                    <a href="${bp}agents.html">Our Agents</a>
                    <a href="${bp}contact.html">Contact Us</a>
                    <div style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 0.25rem;">
                        <a href="${rp}pages/public/login.html" style="color: #718096; font-size: 0.85rem;">Agent Login</a>
                        <a href="${rp}pages/admin/dashboard.html" style="color: #718096; font-size: 0.85rem;">Admin Portal</a>
                    </div>
                </div>
            </div>
            <div class="footer-cta">
                <button class="btn btn-primary" style="padding: 1rem 2rem;" onclick="openModal()">Get in touch</button>
            </div>
        </div>
        <div class="footer-bottom">
            <p>&copy; 2026 MN Lake Homes. All rights reserved.</p>
            <p class="group-disclaimer" style="margin-top: 1rem; color: #666; font-size: 0.85rem;">
                Part of the <a href="#" style="color: #a0aab2; text-decoration: underline;">MN Lake Group</a> portfolio.
            </p>
        </div>
    </footer>`;
    }
}
customElements.define('global-footer', GlobalFooter);

// ─── Lead Modal ───────────────────────────────────────────────────────────────

class LeadModal extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `<div id="lead-modal" class="modal-overlay">
        <div class="modal-content">
            <div class="modal-close" onclick="closeModal()">
                <svg viewBox="0 0 24 24" width="24" height="24"><path d="M18 6L6 18M6 6l12 12" stroke="#000" stroke-width="2" stroke-linecap="round"/></svg>
            </div>

            <div id="modal-step-1" class="modal-step active">
                <h2>Tell us a bit about yourself</h2>
                <p>We need a little more information to point you in the right direction.</p>
                <div class="form-group-sys">
                    <input type="text" id="modal-name" class="input-sys" placeholder="Full Name">
                </div>
                <div class="form-group-sys">
                    <input type="email" id="modal-email" class="input-sys" placeholder="Email Address">
                </div>
                <div class="form-group-sys">
                    <input type="tel" id="modal-phone" class="input-sys" placeholder="Phone Number">
                </div>
                <button class="btn btn-primary modal-next-btn" style="border:none;" onclick="nextModalStep(2)">Continue</button>
            </div>

            <div id="modal-step-2" class="modal-step">
                <h2>How can we help?</h2>
                <p>Help us customize your real estate experience.</p>
                <div class="form-group-sys">
                    <div class="select-wrapper">
                        <select id="modal-package">
                            <option value="" disabled selected>What are you looking to do?</option>
                            <option value="buy">Buy a Lake Home</option>
                            <option value="sell">Sell a Lake Property</option>
                            <option value="rent">Find a Rental</option>
                            <option value="appraisal">Get a Home Appraisal</option>
                            <option value="talk">Speak to an Agent</option>
                        </select>
                    </div>
                </div>
                <button class="btn btn-primary modal-next-btn" style="border:none;" onclick="nextModalStep(3)">Submit Request</button>
            </div>

            <div id="modal-step-3" class="modal-step">
                <div class="success-icon">✓</div>
                <h2>You're all set!</h2>
                <p>Our team will reach out shortly to discuss your real estate needs.</p>
                <button class="btn btn-primary modal-next-btn" style="border:none;" onclick="closeModal()">Back to site</button>
            </div>

        </div>
    </div>`;
    }
}
customElements.define('lead-modal', LeadModal);
