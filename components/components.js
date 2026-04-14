const getDepth = () => window.location.pathname.includes("/pages/") ? "" : "pages/public/";
const getRoot = () => window.location.pathname.includes("/pages/") ? "../../" : "";

class GlobalHeader extends HTMLElement {
    connectedCallback() {
        const bp = getDepth();
        const rp = getRoot();
        
        const isLoggedIn = localStorage.getItem('auth_session') === 'active';
        const userType = localStorage.getItem('auth_type');
        
        let authHtml = `<a href="${bp}login.html" style="color: #fff; font-weight: 600; text-decoration: none; padding: 0.5rem 1rem; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">Login</a>`;

        if (isLoggedIn) {
            let dashLink = userType === 'agent' ? `${rp}pages/agent/dashboard.html` : `${rp}index.html`;
            
            authHtml = `
            <div class="profile-dropdown" style="position: relative; display: inline-block;">
                <button onclick="const menu = this.nextElementSibling; menu.style.display = menu.style.display === 'none' ? 'block' : 'none';" style="background: center/cover url('https://ui-avatars.com/api/?name=${encodeURIComponent(userType || 'User')}&background=e2e8f0&color=4a5568'); width: 44px; height: 44px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); cursor: pointer; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 0; transition: border-color 0.2s;" onmouseover="this.style.borderColor='var(--accent-blue)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.2)'">
                </button>
                <div class="dropdown-menu" style="display: none; position: absolute; right: 0; top: 60px; background: #fff; border: 1px solid #edf2f7; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); width: 240px; z-index: 1001; overflow: hidden; font-family: 'Inter', sans-serif;">
                    <div style="padding: 1.25rem 1rem; border-bottom: 1px solid #edf2f7; display: flex; align-items: center; gap: 0.75rem; background: #f7f9fa;">
                        <div style="background: center/cover url('https://ui-avatars.com/api/?name=${encodeURIComponent(userType || 'User')}&background=e2e8f0&color=4a5568'); width: 36px; height: 36px; border-radius: 50%;"></div>
                        <div style="flex-grow: 1;">
                            <div style="font-weight: 700; font-size: 0.95rem; color: #1a202c;">Your Profile</div>
                            <div style="font-size: 0.75rem; color: #718096; text-transform: capitalize; font-weight: 500;">${userType} Account</div>
                        </div>
                    </div>
                    <div style="padding: 0.5rem 0;">
                        <a href="${dashLink}" style="display: block; padding: 0.75rem 1.25rem; color: #4a5568; text-decoration: none; font-size: 0.9rem; font-weight: 500; transition: background 0.2s;" onmouseover="this.style.backgroundColor='#f7f9fa'" onmouseout="this.style.backgroundColor='transparent'">Dashboard</a>
                        <a href="${rp}pages/public/agent-profile.html?slug=david-chen" style="display: block; padding: 0.75rem 1.25rem; color: #4a5568; text-decoration: none; font-size: 0.9rem; font-weight: 500; transition: background 0.2s;" onmouseover="this.style.backgroundColor='#f7f9fa'" onmouseout="this.style.backgroundColor='transparent'">Public Site Profile</a>
                        <a href="#" style="display: block; padding: 0.75rem 1.25rem; color: #4a5568; text-decoration: none; font-size: 0.9rem; font-weight: 500; transition: background 0.2s;" onmouseover="this.style.backgroundColor='#f7f9fa'" onmouseout="this.style.backgroundColor='transparent'">Settings</a>
                    </div>
                    <div style="padding: 0.5rem 0; border-top: 1px solid #edf2f7;">
                        <a href="#" onclick="localStorage.clear(); window.location.href='${rp}index.html';" style="display: block; padding: 0.75rem 1.25rem; color: #e53e3e; text-decoration: none; font-size: 0.9rem; font-weight: 600; transition: background 0.2s;" onmouseover="this.style.backgroundColor='#fff5f5'" onmouseout="this.style.backgroundColor='transparent'">Sign Out</a>
                    </div>
                </div>
            </div>
            `;
        }

        this.innerHTML = `
        <header class="navbar" style="background-color: var(--bg-dark); border-bottom: 1px solid rgba(255,255,255,0.1); position: fixed; width: 100%; z-index: 1000; top: 0;">
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
        </header>
        `;
    }
}
customElements.define("global-header", GlobalHeader);

class GlobalFooter extends HTMLElement {
    connectedCallback() {
        const bp = getDepth();
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
                    <a href="${bp}blog.html">Blog & Resources</a>
                    <a href="${bp}join.html">Join the Network</a>
                    <a href="${bp}faq.html">FAQs</a>
                    <a href="${bp}agents.html">Our Agents</a>
                    <a href="${bp}contact.html">Contact Us</a>
                    <div style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 0.25rem;">
                        <a href="${rp}pages/admin/dashboard.html" style="color: #718096; font-size: 0.85rem;">Admin Portal</a>
                        <a href="${rp}pages/agent/dashboard.html" style="color: #718096; font-size: 0.85rem;">Agent Dashboard</a>
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
                Part of the <a href="#" style="color: #a0aab2; text-decoration: underline; transition: color 0.2s;">MN Lake Group</a> portfolio.
            </p>
        </div>
    </footer>`;
    }
}
customElements.define("global-footer", GlobalFooter);

class LeadModal extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `<div id="lead-modal" class="modal-overlay">
        <div class="modal-content">
            <div class="modal-close" onclick="closeModal()">
                <svg viewBox="0 0 24 24" width="24" height="24"><path d="M18 6L6 18M6 6l12 12" stroke="#000" stroke-width="2" stroke-linecap="round"/></svg>
            </div>

            <!-- Step 1: Basic Info -->
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

            <!-- Step 2: Goal Info -->
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

            <!-- Step 3: Success -->
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
customElements.define("lead-modal", LeadModal);
