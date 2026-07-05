// ─── Admin embedded-editor host fix ─────────────────────────────────────────
// Several admin pages (blog, lakes, businesses, tags, images, resources) render
// inside an <iframe class="lt-frame"> on a parent tab page, and the parent grows
// the iframe to the child's full content height so there's no nested scrollbar.
//
// The side effect: a child's `position: fixed` modal is fixed to the iframe's
// viewport — which, on an auto-grown iframe, is the ENTIRE tall content — so the
// modal lands at the top of a 4,000px frame and the user has to scroll to find
// it (and the page looks broken).
//
// This host script fixes it generically. Because the iframes are same-origin, the
// parent can look inside each one; when it sees a full-size fixed/absolute overlay
// (a modal), it PINS that frame to the viewport height and scrolls it into view,
// so the modal appears exactly where the user is looking. When the modal closes,
// the frame returns to its auto-grown height. No per-editor wiring required.
//
// It also owns the height auto-grow (listening for the child's {lt:'height'}
// messages), so parent pages can drop their own inline height handler.

(function () {
    if (window.__adminEmbedHost) return;
    window.__adminEmbedHost = true;

    const contentH = {};   // last reported content height, per frame id
    // Every embedded editor frame has id="frame-<name>" (class lt-frame or sys-frame).
    const frames = () => document.querySelectorAll('iframe[id^="frame-"]');

    // Return the open modal element inside a frame, or null. "Open" = a visible,
    // roughly full-width fixed/absolute overlay (the backdrop of a modal).
    function openModalIn(f) {
        let doc;
        try { doc = f.contentDocument; } catch (_) { return null; }   // cross-origin → skip
        if (!doc || !doc.body) return null;
        const view = doc.defaultView;
        const cands = doc.querySelectorAll(
            '.editor-overlay, .modal-overlay, .modal, [class*="overlay"], [class*="modal"], [id*="modal"], [id*="overlay"]');
        for (const el of cands) {
            let cs; try { cs = view.getComputedStyle(el); } catch (_) { continue; }
            if ((cs.position !== 'fixed' && cs.position !== 'absolute')) continue;
            if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
            const r = el.getBoundingClientRect();
            // A real modal backdrop is wide and tall; ignore chips/toasts/menus.
            if (r.width > f.clientWidth * 0.5 && r.height > 220) return el;
        }
        return null;
    }

    function apply() {
        frames().forEach(f => {
            const modal = openModalIn(f);
            if (modal) {
                if (f.dataset.modalOpen !== '1') {
                    f.dataset.modalOpen = '1';
                    // Bring the frame under the sticky chrome, then pin to viewport.
                    const y = f.getBoundingClientRect().top + window.scrollY - 12;
                    window.scrollTo(0, Math.max(0, y));
                    document.body.style.overflow = 'hidden';
                }
                // Keep it viewport-sized (adapts to window resize while open).
                const target = window.innerHeight + 'px';
                if (f.style.height !== target) f.style.height = target;
            } else if (f.dataset.modalOpen === '1') {
                delete f.dataset.modalOpen;
                document.body.style.overflow = '';
                f.style.height = (contentH[f.id] || 700) + 'px';
            }
        });
    }

    // Height auto-grow (unless a modal is currently pinning the frame).
    window.addEventListener('message', (e) => {
        const m = e.data;
        if (!m || m.lt !== 'height' || typeof m.h !== 'number') return;
        const f = m.frame ? document.getElementById('frame-' + m.frame) : null;
        if (!f) return;
        contentH[f.id] = Math.max(700, m.h + 8);
        if (f.dataset.modalOpen !== '1') f.style.height = contentH[f.id] + 'px';
    });

    // Poll for modal state (cheap: a handful of elements per frame). 150ms is
    // responsive without being wasteful.
    setInterval(apply, 150);
    document.addEventListener('DOMContentLoaded', apply);
})();
