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
                        <a href="${rp}pages/public/login.html?admin=1" style="color: #718096; font-size: 0.85rem;">Admin Portal</a>
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
            { q: 'Who are we speaking with today?',         hint: "Let's start with your first name.",                                          field: { id: 'first',    type: 'text',    ph: 'Your first name',         ac: 'given-name'  } },
            { q: d => `Nice to meet you, ${d.first}! What's your last name?`,                                                                    field: { id: 'last',     type: 'text',    ph: 'Your last name',          ac: 'family-name' } },
            { q: d => `${d.first}, where is the property located?`,         hint: 'City, lake name, or general area.',                           field: { id: 'city',     type: 'text',    ph: 'e.g. Lake Minnetonka, Brainerd, Nisswa…' } },
            { q: 'When are you looking to sell?',                                                                                                 field: { id: 'timeline', type: 'select',  ph: 'Select a timeline…',      opts: ['As soon as possible','Within 3 months','3–6 months out','Just exploring options'] } },
            { q: d => `Great, ${d.first}. How can we reach you?`,           hint: "We'll send your free market analysis within one business day.", field: { id: 'contact', type: 'contact' } }
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
    }
};

let _lfs = { type: 'general', step: 0, data: {} }; // live state

function _lfQ(step) {
    const s = _LF_CFG[_lfs.type].steps[step];
    return typeof s.q === 'function' ? s.q(_lfs.data) : s.q;
}

function _lfInit() {
    if (document.getElementById('lf-overlay')) return;
    const el = document.createElement('div');
    el.id = 'lf-overlay';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:9000;background:#fff;font-family:"Inter",sans-serif;';
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
        <div id="lf-ok" style="display:none;position:absolute;inset:0;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center;">
            <div style="width:72px;height:72px;border-radius:50%;background:#f0fff4;display:flex;align-items:center;justify-content:center;margin:0 0 1.5rem;border:2px solid #c6f6d5;">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#38a169" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h3 id="lf-ok-title" style="font-size:2rem;font-weight:800;color:#1a202c;letter-spacing:-1px;margin:0 0 0.75rem;"></h3>
            <p  id="lf-ok-msg"   style="color:#718096;line-height:1.6;max-width:380px;margin:0 auto 2rem;"></p>
            <button onclick="closeForm()"
                style="padding:1rem 2.5rem;background:#1a202c;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:1rem;cursor:pointer;font-family:inherit;transition:background 0.2s;"
                onmouseover="this.style.background='#2d3748'" onmouseout="this.style.background='#1a202c'">Back to site</button>
        </div>
    `;
    document.body.appendChild(el);
}

function _lfRender() {
    const steps = _LF_CFG[_lfs.type].steps;
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
    }

    // next button
    const btn = document.getElementById('lf-next');
    btn.disabled      = false;
    btn.style.display = f.type === 'select' ? 'none' : 'block';
    btn.textContent   = _lfs.step === total - 1 ? 'Submit →' : 'Continue →';
    btn.style.background = '#1a202c';
}

function _lfSlide() {
    const body = document.getElementById('lf-body');
    body.style.opacity = '0'; body.style.transform = 'translateY(12px)';
    setTimeout(() => { _lfRender(); body.style.opacity = '1'; body.style.transform = 'translateY(0)'; }, 140);
}

window.openForm = function(type) {
    _lfInit();
    _lfs = { type: type || 'general', step: 0, data: {} };
    document.getElementById('lf-ok').style.display   = 'none';
    document.getElementById('lf-body').style.display = 'block';
    document.getElementById('lf-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    _lfRender();
};

window.closeForm = function() {
    const el = document.getElementById('lf-overlay');
    if (el) el.style.display = 'none';
    document.body.style.overflow = '';
};

window._lfBack = function() {
    if (_lfs.step > 0) { _lfs.step--; _lfSlide(); }
};

window._lfNext = function() {
    const steps = _LF_CFG[_lfs.type].steps;
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
    const skip = new Set(['first','last','email','phone']);
    const notes = Object.entries(d).filter(([k,v]) => !skip.has(k) && v)
        .map(([k,v]) => `${k[0].toUpperCase()+k.slice(1).replace(/_/g,' ')}: ${v}`).join('\n');

    const btn = document.getElementById('lf-next');
    btn.disabled = true; btn.textContent = 'Submitting…'; btn.style.background = '#a0aec0';
    document.getElementById('lf-err').style.display = 'none';

    try {
        const res = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email: d.email||null, phone: d.phone||null, notes: notes||null, source: cfg.source })
        });
        if (!res.ok) { const r = await res.json().catch(()=>({})); throw new Error(r.error || 'Submission failed.'); }

        document.getElementById('lf-bar').style.width  = '100%';
        document.getElementById('lf-body').style.display = 'none';
        document.getElementById('lf-back').style.visibility = 'hidden';
        const ok = document.getElementById('lf-ok');
        document.getElementById('lf-ok-title').textContent = `Thanks, ${d.first || 'you\'re all set'}!`;
        document.getElementById('lf-ok-msg').textContent   = 'Our team will review your request and reach out within one business day. We look forward to helping you.';
        ok.style.display = 'flex';
    } catch(err) {
        document.getElementById('lf-err').textContent = err.message;
        document.getElementById('lf-err').style.display = 'block';
        btn.disabled = false; btn.textContent = 'Submit →'; btn.style.background = '#1a202c';
    }
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
