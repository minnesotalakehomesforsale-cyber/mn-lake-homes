/**
 * admin-nav-badges.js — updates unread-inquiry count in the sidebar
 *
 * Runs on every admin page after auth succeeds. Polls the unread count
 * every 60s so fresh submissions surface without a page refresh.
 */
(function() {
    async function refreshBadge() {
        const badge = document.getElementById('nav-badge-inquiries');
        if (!badge) return;
        try {
            const res = await fetch('/api/inquiries/unread-count');
            if (!res.ok) return;
            const { count } = await res.json();
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        } catch (_) { /* silent — not critical */ }
    }

    // First fetch on load, then every 60 seconds
    document.addEventListener('DOMContentLoaded', () => {
        refreshBadge();
        setInterval(refreshBadge, 60_000);
    });
})();
