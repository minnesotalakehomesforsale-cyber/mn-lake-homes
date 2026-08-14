// claim-widget.js — DEV-10 self-claim entry point. Drop-in for any public
// agent/business detail page. Renders a subtle "Is this your listing? Claim it
// free" link + a modal that collects an email and POSTs /api/claim/start. The
// server decides claimability (unclaimed only) and emails a verification link,
// so this widget can render everywhere without leaking who owns what.
//
// Usage: window.mountClaimWidget({ type: 'agent'|'business', id, name, mountEl })
(function () {
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    window.mountClaimWidget = function (opts) {
        var type = opts.type, id = opts.id, name = opts.name || 'this listing';
        var mount = opts.mountEl || document.body;
        if (!type || !id) return;

        var bar = document.createElement('div');
        bar.style.cssText = 'text-align:center;padding:1.25rem 1rem;font-size:0.9rem;color:#718096;';
        bar.innerHTML = 'Is this your ' + (type === 'agent' ? 'profile' : 'business') + '? ' +
            '<a href="#" id="claim-open" style="color:#1d6df2;font-weight:700;text-decoration:none;">Claim it free →</a>';
        mount.appendChild(bar);

        var modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;z-index:9700;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,0.55);padding:1rem;';
        modal.innerHTML =
            '<div style="background:#fff;border-radius:16px;max-width:440px;width:100%;padding:1.75rem;box-shadow:0 24px 70px rgba(0,0,0,0.3);font-family:inherit;">' +
              '<h3 style="font-size:1.25rem;font-weight:800;margin:0 0 0.4rem;color:#0f172a;">Claim ' + esc(name) + '</h3>' +
              '<p style="color:#475569;font-size:0.92rem;line-height:1.55;margin:0 0 1.25rem;">Free to claim — no card required. We\'ll email you a link to confirm, then you can edit your listing. It stays private until our team reviews it.</p>' +
              '<form id="claim-form">' +
                '<input id="claim-email" type="email" required placeholder="you@business.com" style="width:100%;box-sizing:border-box;padding:0.7rem 0.85rem;border:1px solid #e2e8f0;border-radius:9px;font:inherit;margin-bottom:0.85rem;">' +
                '<input type="text" id="claim-hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;" aria-hidden="true">' +
                '<div id="claim-msg" style="font-size:0.85rem;margin-bottom:0.75rem;"></div>' +
                '<div style="display:flex;gap:0.6rem;justify-content:flex-end;">' +
                  '<button type="button" id="claim-cancel" style="background:transparent;border:1px solid #e2e8f0;border-radius:9px;padding:0.6rem 1rem;font:inherit;font-weight:700;color:#475569;cursor:pointer;">Cancel</button>' +
                  '<button type="submit" id="claim-submit" style="background:#1d6df2;border:0;border-radius:9px;padding:0.6rem 1.25rem;font:inherit;font-weight:700;color:#fff;cursor:pointer;">Send link</button>' +
                '</div>' +
              '</form>' +
            '</div>';
        document.body.appendChild(modal);

        function open(e) { if (e) e.preventDefault(); modal.style.display = 'flex'; document.getElementById('claim-email').focus(); }
        function close() { modal.style.display = 'none'; }
        bar.querySelector('#claim-open').addEventListener('click', open);
        modal.querySelector('#claim-cancel').addEventListener('click', close);
        modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

        modal.querySelector('#claim-form').addEventListener('submit', function (e) {
            e.preventDefault();
            if (document.getElementById('claim-hp').value) return; // honeypot
            var email = document.getElementById('claim-email').value.trim();
            var msg = document.getElementById('claim-msg');
            var btn = document.getElementById('claim-submit');
            var tok = (window.turnstile && document.querySelector('[name="cf-turnstile-response"]')) ? document.querySelector('[name="cf-turnstile-response"]').value : '';
            btn.disabled = true; btn.textContent = 'Sending…'; msg.textContent = '';
            fetch('/api/claim/start', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_type: type, target_id: id, email: email, turnstile_token: tok }),
            }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
              .then(function (res) {
                  if (!res.ok) { msg.style.color = '#dc2626'; msg.textContent = res.d.error || 'Something went wrong.'; btn.disabled = false; btn.textContent = 'Send link'; return; }
                  msg.style.color = '#16a34a'; msg.textContent = res.d.message || 'Check your email for the verification link.';
                  btn.textContent = 'Sent ✓';
              }).catch(function () { msg.style.color = '#dc2626'; msg.textContent = 'Network error — try again.'; btn.disabled = false; btn.textContent = 'Send link'; });
        });
    };
})();
