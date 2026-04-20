/**
 * join-form.js — Shared "Apply to join the network" full-screen form.
 *
 * Exposes window.openJoinForm() / window.closeJoinForm() on any page that
 * includes this script. The overlay markup is injected lazily on first
 * open so pages don't pay the DOM cost unless the form is actually used.
 *
 * Used on:
 *   - /pages/public/join.html (the dedicated recruitment page)
 *   - /pages/public/agent-login.html ("New to the network? Apply to join →")
 *
 * Posts to POST /api/auth/register and redirects to the agent dashboard
 * on success. All copy and step order mirrors the original inline form.
 */
(function () {
    if (window.__joinFormBooted) return;
    window.__joinFormBooted = true;

    const JOIN_STEPS = [
        { q: "Who are we speaking with today?",                    hint: "Let's start with your first name.",                                                              field: 'first',    type: 'text',     ph: 'Your first name',         required: true },
        { q: d => `Great, ${d.first}! What's your last name?`,     hint: '',                                                                                               field: 'last',     type: 'text',     ph: 'Your last name',          required: true },
        { q: d => `Nice to meet you, ${d.first}. Best email?`,     hint: 'This becomes your login email.',                                                                 field: 'email',    type: 'email',    ph: 'you@brokerage.com',       required: true },
        { q: "Best phone number to reach you?",                    hint: 'For our team to follow up on your application.',                                                 field: 'phone',    type: 'tel',      ph: '(612) 555-0000',          required: true },
        { q: "Which brokerage are you with?",                      hint: 'Independent? No worries — just press Continue.',                                                 field: 'brokerage',type: 'text',     ph: "e.g. Keller Williams, Sotheby's", required: false },
        { q: "Do you have a real estate license number?",          hint: 'Optional — you can update this later in your profile.',                                          field: 'license',  type: 'text',     ph: 'e.g. MN-40012345',        required: false },
        { q: "Which areas do you serve?",                          hint: 'Pick up to 10 cities or towns. We route leads near these areas to you. You can change this later.', field: 'service_area_tag_ids', type: 'tags',     required: true },
        { q: "Create a password for your account.",                hint: 'Needed for the upcoming agent portal — this site is launching as the beta. Min 8 characters.', field: 'password', type: 'password', ph: '••••••••',                required: true, minlength: 8 },
        { q: "One more — confirm your password.",                  hint: 'Must match the password above.',                                                                 field: 'confirm',  type: 'password', ph: '••••••••',                required: true },
    ];

    const MAX_SERVICE_AREAS = 10;

    const iStyle = 'width:100%;padding:1rem 1.25rem;border:2px solid #e2e8f0;border-radius:12px;font-family:inherit;font-size:1.15rem;box-sizing:border-box;outline:none;transition:border-color 0.2s;background:#fff;text-align:center;';
    const focus  = `onfocus="this.style.borderColor='#1d6df2'" onblur="this.style.borderColor='#e2e8f0'"`;

    let _js = { step: 0, data: {} };

    function _injectStyles() {
        if (document.getElementById('join-form-styles')) return;
        const s = document.createElement('style');
        s.id = 'join-form-styles';
        s.textContent = `
            @media (max-width: 600px) {
                #join-overlay > div:nth-child(3) { padding: 4.5rem 1rem 2rem !important; }
                #join-overlay [data-role="close"] { width: 44px !important; height: 44px !important; }
                #join-question { font-size: 1.75rem !important; }
            }
            @media (max-width: 400px) {
                #join-question { font-size: 1.5rem !important; }
            }
        `;
        document.head.appendChild(s);
    }

    function _injectOverlay() {
        if (document.getElementById('join-overlay')) return;
        _injectStyles();
        const el = document.createElement('div');
        el.id = 'join-overlay';
        // Explicit 100vw/100vh + 100dvh so iOS Safari's dynamic viewport
        // (address-bar collapse/expand) can't leave a gap.
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
                <div id="join-bar" style="height:100%;background:#1d6df2;width:0%;transition:width 0.4s ease;border-radius:0 99px 99px 0;"></div>
            </div>
            <!-- Top chrome -->
            <div style="position:absolute;top:0;left:0;right:0;padding:1.25rem 1.75rem;display:flex;justify-content:space-between;align-items:center;z-index:10;">
                <button id="join-back" type="button"
                    style="background:none;border:none;cursor:pointer;font-size:0.875rem;font-weight:600;color:#a0aec0;font-family:inherit;padding:0.4rem 0;visibility:hidden;transition:color 0.15s;"
                    onmouseover="this.style.color='#1a202c'" onmouseout="this.style.color='#a0aec0'">&#8592; Back</button>
                <div style="display:flex;align-items:center;gap:0.45rem;">
                    <div style="width:8px;height:8px;border-radius:50%;background:#1d6df2;"></div>
                    <span style="font-weight:700;font-size:0.875rem;color:#1a202c;letter-spacing:-0.2px;">MN Lake Homes</span>
                </div>
                <button type="button" data-role="close"
                    style="width:36px;height:36px;border-radius:50%;border:1px solid #e2e8f0;background:#fff;cursor:pointer;font-size:1rem;color:#718096;display:flex;align-items:center;justify-content:center;transition:all 0.15s;"
                    onmouseover="this.style.background='#f7f9fa'" onmouseout="this.style.background='#fff'" aria-label="Close">&#x2715;</button>
            </div>
            <!-- Step content -->
            <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;padding:5rem 1.5rem 3rem;">
                <div id="join-body" style="width:100%;max-width:520px;transition:opacity 0.15s ease,transform 0.15s ease;">
                    <h2 id="join-question" style="font-size:clamp(1.6rem,4vw,2.4rem);font-weight:800;color:#1a202c;letter-spacing:-1px;line-height:1.2;margin:0 0 0.75rem;text-align:center;"></h2>
                    <p  id="join-hint"     style="color:#a0aec0;font-size:0.95rem;margin:0 0 2rem;text-align:center;line-height:1.5;display:none;"></p>
                    <div id="join-field"   style="margin-bottom:1.25rem;"></div>
                    <div id="join-error"   style="display:none;color:#c53030;font-size:0.85rem;margin-bottom:1rem;padding:0.75rem 1rem;background:#fff5f5;border-radius:10px;border:1px solid #fed7d7;text-align:center;"></div>
                    <button id="join-btn" type="button"
                        style="width:100%;padding:1rem 1.5rem;background:#1a202c;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:1rem;cursor:pointer;font-family:inherit;transition:background 0.2s;"
                        onmouseover="if(!this.disabled)this.style.background='#2d3748'" onmouseout="if(!this.disabled)this.style.background='#1a202c'">Continue &#8594;</button>
                    <p style="text-align:center;color:#cbd5e0;font-size:0.75rem;margin-top:0.9rem;">We respect your privacy. No spam, ever.</p>
                </div>
            </div>
            <!-- Success screen -->
            <div id="join-success" style="display:none;position:absolute;inset:0;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center;">
                <div style="width:72px;height:72px;border-radius:50%;background:#f0fff4;display:flex;align-items:center;justify-content:center;margin:0 0 1.5rem;border:2px solid #c6f6d5;">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#38a169" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <h3 style="font-size:2rem;font-weight:800;color:#1a202c;letter-spacing:-1px;margin:0 0 0.75rem;">Welcome to the network!</h3>
                <p  style="color:#718096;line-height:1.6;max-width:380px;margin:0 auto;">Your agent profile is being set up. Redirecting to your dashboard…</p>
            </div>
        `;
        document.body.appendChild(el);

        el.querySelector('#join-back').addEventListener('click', joinGoBack);
        el.querySelector('[data-role="close"]').addEventListener('click', closeJoinForm);
        el.querySelector('#join-btn').addEventListener('click', joinNext);
    }

    // iOS-safe scroll lock (body { overflow: hidden } alone doesn't stop
    // touch-scroll behind the overlay on Safari — pin body position instead).
    function _lockScroll() {
        const y = window.scrollY || window.pageYOffset || 0;
        document.body.dataset.joinSavedY = String(y);
        document.body.style.position = 'fixed';
        document.body.style.top = `-${y}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
    }
    function _unlockScroll() {
        const saved = Number(document.body.dataset.joinSavedY || 0);
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        delete document.body.dataset.joinSavedY;
        window.scrollTo(0, saved);
    }

    function openJoinForm() {
        _injectOverlay();
        _js = { step: 0, data: {} };
        document.getElementById('join-success').style.display = 'none';
        document.getElementById('join-body').style.display = 'block';
        document.getElementById('join-back').style.visibility = 'hidden';
        document.getElementById('join-overlay').style.display = 'block';
        _lockScroll();
        _joinRender();
    }

    function closeJoinForm() {
        const ov = document.getElementById('join-overlay');
        if (ov) ov.style.display = 'none';
        _unlockScroll();
    }

    function joinGoBack() {
        if (_js.step > 0) { _js.step--; _joinSlide(); }
    }

    function _joinRender() {
        const s     = JOIN_STEPS[_js.step];
        const total = JOIN_STEPS.length;
        const q     = typeof s.q === 'function' ? s.q(_js.data) : s.q;

        document.getElementById('join-bar').style.width = Math.round((_js.step / total) * 100) + '%';
        document.getElementById('join-back').style.visibility = _js.step === 0 ? 'hidden' : 'visible';
        document.getElementById('join-question').textContent = q;
        document.getElementById('join-error').style.display = 'none';

        const hint = document.getElementById('join-hint');
        hint.textContent = s.hint || '';
        hint.style.display = s.hint ? 'block' : 'none';

        const area = document.getElementById('join-field');
        if (s.type === 'tags') {
            _renderTagsStep(area);
        } else {
            area.innerHTML = `<input id="join-input" type="${s.type}" placeholder="${s.ph}" autocomplete="off"
                style="${iStyle}" ${focus} value="${(_js.data[s.field] || '').toString().replace(/"/g, '&quot;')}">`;
            const input = document.getElementById('join-input');
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); joinNext(); } });
            setTimeout(() => input?.focus(), 60);
        }

        const btn = document.getElementById('join-btn');
        btn.disabled = false;
        btn.style.background = '#1a202c';
        btn.textContent = _js.step === total - 1 ? 'Create My Account →' : 'Continue →';
    }

    // ── Tags-picker step (service areas) ─────────────────────────────────
    let _tagsCatalog = null;
    let _tagsCatalogPromise = null;

    async function _loadTagsCatalog() {
        if (_tagsCatalog) return _tagsCatalog;
        if (_tagsCatalogPromise) return _tagsCatalogPromise;
        _tagsCatalogPromise = fetch('/api/tags?active=true')
            .then(r => r.ok ? r.json() : [])
            .then(list => { _tagsCatalog = Array.isArray(list) ? list : []; return _tagsCatalog; })
            .catch(() => { _tagsCatalog = []; return _tagsCatalog; });
        return _tagsCatalogPromise;
    }

    function _escHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    function _renderTagsStep(container) {
        const selected = new Set(Array.isArray(_js.data.service_area_tag_ids) ? _js.data.service_area_tag_ids : []);

        container.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:0.75rem;">
                <div id="tags-counter" style="font-size:0.8rem;font-weight:700;color:#718096;letter-spacing:0.5px;text-transform:uppercase;text-align:center;"></div>
                <div id="tags-pills" style="display:flex;flex-wrap:wrap;gap:0.4rem;justify-content:center;min-height:32px;"></div>
                <div style="position:relative;">
                    <svg style="position:absolute;left:1rem;top:50%;transform:translateY(-50%);color:#a0aec0;pointer-events:none;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input id="tags-search" type="search" placeholder="Search cities or regions…" autocomplete="off"
                        style="width:100%;padding:0.9rem 1rem 0.9rem 2.75rem;border:2px solid #e2e8f0;border-radius:12px;font-family:inherit;font-size:1rem;background:#fff;box-sizing:border-box;outline:none;transition:border-color 0.2s;"
                        onfocus="this.style.borderColor='#1d6df2'" onblur="this.style.borderColor='#e2e8f0'">
                </div>
                <div id="tags-list" style="max-height:320px;overflow-y:auto;border:1px solid #edf2f7;border-radius:12px;background:#fff;padding:0.25rem;">
                    <div style="padding:2rem;text-align:center;color:#a0aec0;font-size:0.9rem;">Loading areas…</div>
                </div>
            </div>
        `;

        const searchEl = document.getElementById('tags-search');
        const listEl   = document.getElementById('tags-list');

        const renderPills = () => {
            const host = document.getElementById('tags-pills');
            const counter = document.getElementById('tags-counter');
            counter.textContent = `${selected.size} of ${MAX_SERVICE_AREAS} selected`;
            counter.style.color = selected.size >= MAX_SERVICE_AREAS ? '#b45309' : '#718096';
            if (!selected.size) {
                host.innerHTML = '<span style="color:#a0aec0;font-size:0.88rem;">No areas picked yet.</span>';
                return;
            }
            if (!_tagsCatalog) return;
            const byId = new Map(_tagsCatalog.map(t => [t.id, t]));
            host.innerHTML = [...selected].map(id => {
                const t = byId.get(id);
                if (!t) return '';
                return `<span data-id="${t.id}" style="display:inline-flex;align-items:center;gap:0.35rem;background:#ebf4ff;color:#1d6df2;padding:0.35rem 0.65rem;border-radius:999px;font-size:0.82rem;font-weight:700;">
                    ${_escHtml(t.name)}, ${_escHtml(t.state)}
                    <button type="button" data-remove="${t.id}" aria-label="Remove" style="background:none;border:none;color:#1d6df2;cursor:pointer;padding:0;font-size:1rem;line-height:1;">×</button>
                </span>`;
            }).join('');
            host.querySelectorAll('[data-remove]').forEach(b => {
                b.addEventListener('click', () => {
                    selected.delete(b.getAttribute('data-remove'));
                    _js.data.service_area_tag_ids = [...selected];
                    renderPills();
                    renderList();
                });
            });
        };

        const renderList = () => {
            if (!_tagsCatalog) return;
            const q = (searchEl.value || '').toLowerCase().trim();
            let rows = _tagsCatalog;
            if (q) {
                rows = rows.filter(t =>
                    t.name.toLowerCase().includes(q) ||
                    (t.region && t.region.toLowerCase().includes(q)) ||
                    (t.state && t.state.toLowerCase() === q)
                );
            }
            rows = rows.slice(0, 120);
            if (!rows.length) {
                listEl.innerHTML = '<div style="padding:2rem;text-align:center;color:#a0aec0;font-size:0.9rem;">No matches.</div>';
                return;
            }
            listEl.innerHTML = rows.map(t => {
                const on = selected.has(t.id);
                const atCap = !on && selected.size >= MAX_SERVICE_AREAS;
                return `<button type="button" data-id="${t.id}" ${atCap ? 'disabled' : ''}
                    style="display:flex;justify-content:space-between;align-items:center;width:100%;padding:0.65rem 0.9rem;border:none;border-bottom:1px solid #f7f9fa;background:${on ? '#ebf4ff' : '#fff'};cursor:${atCap ? 'not-allowed' : 'pointer'};opacity:${atCap ? '0.45' : '1'};font-family:inherit;font-size:0.9rem;text-align:left;">
                    <span>
                        <strong style="color:#1a202c;font-weight:700;">${_escHtml(t.name)}</strong>
                        <span style="color:#718096;font-size:0.78rem;margin-left:0.4rem;">${_escHtml(t.state)}${t.region ? ' · ' + _escHtml(t.region) : ''}</span>
                    </span>
                    <span style="color:${on ? '#1d6df2' : '#cbd5e0'};font-weight:800;font-size:1rem;">${on ? '✓' : '+'}</span>
                </button>`;
            }).join('');
            listEl.querySelectorAll('[data-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    if (selected.has(id)) selected.delete(id);
                    else if (selected.size < MAX_SERVICE_AREAS) selected.add(id);
                    _js.data.service_area_tag_ids = [...selected];
                    renderPills();
                    renderList();
                });
            });
        };

        searchEl.addEventListener('input', renderList);

        _loadTagsCatalog().then(() => {
            renderPills();
            renderList();
            setTimeout(() => searchEl.focus(), 80);
        });
    }

    function _joinSlide() {
        const body = document.getElementById('join-body');
        body.style.opacity = '0'; body.style.transform = 'translateY(12px)';
        setTimeout(() => { _joinRender(); body.style.opacity = '1'; body.style.transform = 'translateY(0)'; }, 140);
    }

    async function joinNext() {
        const s   = JOIN_STEPS[_js.step];
        const err = document.getElementById('join-error');

        // Tags step: already kept in _js.data.service_area_tag_ids as
        // user clicks; just enforce the minimum-1 requirement.
        if (s.type === 'tags') {
            const picks = Array.isArray(_js.data.service_area_tag_ids) ? _js.data.service_area_tag_ids : [];
            if (s.required && picks.length === 0) {
                err.textContent = 'Pick at least one service area — leads route based on these.';
                err.style.display = 'block';
                return;
            }
            if (_js.step < JOIN_STEPS.length - 1) { _js.step++; _joinSlide(); }
            else await _joinSubmit();
            return;
        }

        const val = (document.getElementById('join-input')?.value || '').trim();

        if (s.required && !val) { err.textContent = 'This field is required.'; err.style.display = 'block'; return; }
        if (s.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { err.textContent = 'Please enter a valid email address.'; err.style.display = 'block'; return; }
        if (s.minlength && val.length < s.minlength) { err.textContent = `Password must be at least ${s.minlength} characters.`; err.style.display = 'block'; return; }
        if (s.field === 'confirm' && val !== _js.data.password) { err.textContent = 'Passwords do not match.'; err.style.display = 'block'; return; }

        _js.data[s.field] = val;

        if (_js.step < JOIN_STEPS.length - 1) { _js.step++; _joinSlide(); }
        else await _joinSubmit();
    }

    async function _joinSubmit() {
        const btn = document.getElementById('join-btn');
        btn.disabled = true; btn.textContent = 'Creating your account…'; btn.style.background = '#a0aec0';

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email:          _js.data.email,
                    password:       _js.data.password,
                    display_name:   `${_js.data.first} ${_js.data.last}`.trim(),
                    license_number: _js.data.license   || null,
                    brokerage_name: _js.data.brokerage || null,
                    service_area_tag_ids: Array.isArray(_js.data.service_area_tag_ids) ? _js.data.service_area_tag_ids : [],
                })
            });
            const result = await res.json();
            if (!res.ok || result.error) {
                const err = document.getElementById('join-error');
                err.textContent = result.error || 'Something went wrong. Please try again.';
                err.style.display = 'block';
                btn.disabled = false; btn.textContent = 'Create My Account →'; btn.style.background = '#1a202c';
                return;
            }
            document.getElementById('join-bar').style.width = '100%';
            document.getElementById('join-body').style.display = 'none';
            document.getElementById('join-back').style.visibility = 'hidden';
            document.getElementById('join-success').style.display = 'flex';
            setTimeout(() => { window.location.href = '/pages/agent/dashboard.html'; }, 2200);
        } catch (e) {
            const err = document.getElementById('join-error');
            err.textContent = 'Connection error. Please try again.';
            err.style.display = 'block';
            btn.disabled = false; btn.textContent = 'Create My Account →'; btn.style.background = '#1a202c';
        }
    }

    // Escape to close
    document.addEventListener('keydown', e => {
        const ov = document.getElementById('join-overlay');
        if (e.key === 'Escape' && ov && ov.style.display === 'block') closeJoinForm();
    });

    window.openJoinForm  = openJoinForm;
    window.closeJoinForm = closeJoinForm;
})();
