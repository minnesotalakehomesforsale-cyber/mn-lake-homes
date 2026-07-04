// card-carousel.js — Zillow-style swipeable image carousel for listing cards.
// Usage: drop `cardCarouselHTML(images, { alt })` into a card, include this
// script once on the page. Arrows + dots + touch-swipe work via a single
// delegated listener, and clicks on the controls never trigger the card link.
(function () {
    if (window.__cardCarouselInit) return;
    window.__cardCarouselInit = true;

    // Cloudinary resize for light, fast card images.
    const thumb = (u, w) => (typeof u === 'string' && u.includes('/upload/'))
        ? u.replace('/upload/', `/upload/w_${w},h_${Math.round(w * 0.66)},c_fill,q_auto,f_auto/`)
        : u;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Build the markup. `images` = array of URL strings (or {url}). Falls back to
    // a single placeholder when empty.
    window.cardCarouselHTML = function (images, opts) {
        opts = opts || {};
        const alt = esc(opts.alt || 'Property photo');
        const w = opts.width || 600;
        let imgs = (Array.isArray(images) ? images : [])
            .map(x => typeof x === 'string' ? x : (x && x.url) || '').filter(Boolean);
        if (!imgs.length) imgs = [opts.placeholder || '/assets/images/agent-placeholder.svg'];
        const slides = imgs.map((u, i) => `<img src="${esc(thumb(u, w))}" alt="${alt}" loading="${i === 0 ? 'eager' : 'lazy'}" draggable="false">`).join('');
        const multi = imgs.length > 1;
        const dots = multi ? `<div class="cc-dots">${imgs.map((_, i) => `<span class="${i === 0 ? 'on' : ''}"></span>`).join('')}</div>` : '';
        const arrows = multi
            ? `<button class="cc-arrow cc-prev" aria-label="Previous photo" tabindex="-1">‹</button><button class="cc-arrow cc-next" aria-label="Next photo" tabindex="-1">›</button>`
            : '';
        const counter = multi ? `<div class="cc-count">1/${imgs.length}</div>` : '';
        return `<div class="cc" data-idx="0" data-n="${imgs.length}"><div class="cc-track">${slides}</div>${arrows}${dots}${counter}</div>`;
    };

    function go(cc, dir, abs) {
        const n = parseInt(cc.dataset.n, 10) || 1;
        let idx = parseInt(cc.dataset.idx, 10) || 0;
        idx = abs != null ? abs : (idx + dir + n) % n;
        cc.dataset.idx = idx;
        const track = cc.querySelector('.cc-track');
        if (track) track.style.transform = `translateX(-${idx * 100}%)`;
        const dots = cc.querySelectorAll('.cc-dots span');
        dots.forEach((d, i) => d.classList.toggle('on', i === idx));
        const count = cc.querySelector('.cc-count');
        if (count) count.textContent = `${idx + 1}/${n}`;
    }

    // Arrow clicks — swallow so the surrounding <a> card doesn't navigate.
    document.addEventListener('click', function (e) {
        const arrow = e.target.closest('.cc-arrow');
        if (!arrow) return;
        e.preventDefault(); e.stopPropagation();
        const cc = arrow.closest('.cc');
        if (cc) go(cc, arrow.classList.contains('cc-next') ? 1 : -1);
    });

    // Touch swipe.
    let sx = 0, sy = 0, active = null;
    document.addEventListener('touchstart', function (e) {
        const cc = e.target.closest('.cc');
        if (!cc || (parseInt(cc.dataset.n, 10) || 1) < 2) return;
        active = cc; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
        if (!active) return;
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) { go(active, dx < 0 ? 1 : -1); }
        active = null;
    }, { passive: true });

    // One-time CSS.
    const css = `
        .cc { position:relative; width:100%; height:100%; overflow:hidden; background:#eef2f7; }
        .cc-track { display:flex; height:100%; transition:transform .28s ease; will-change:transform; }
        .cc-track img { flex:0 0 100%; width:100%; height:100%; object-fit:cover; display:block; user-select:none; }
        .cc-arrow { position:absolute; top:50%; transform:translateY(-50%); width:30px; height:30px; border:none; border-radius:50%; background:rgba(255,255,255,0.9); color:#1a202c; font-size:1.2rem; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .15s; box-shadow:0 1px 4px rgba(16,24,40,0.3); z-index:2; padding:0; }
        .cc:hover .cc-arrow { opacity:1; }
        .cc-prev { left:8px; } .cc-next { right:8px; }
        .cc-dots { position:absolute; bottom:8px; left:0; right:0; display:flex; gap:5px; justify-content:center; z-index:2; }
        .cc-dots span { width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,0.55); box-shadow:0 0 2px rgba(0,0,0,0.4); transition:background .15s; }
        .cc-dots span.on { background:#fff; }
        .cc-count { position:absolute; top:8px; right:8px; background:rgba(15,43,70,0.72); color:#fff; font-size:0.7rem; font-weight:700; padding:2px 7px; border-radius:99px; z-index:2; }
        @media (hover:none) { .cc-arrow { opacity:0.85; } }`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
})();
