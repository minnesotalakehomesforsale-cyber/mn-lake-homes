/**
 * admin-nav-badges.js — updates unread-inquiry + task attention counts in the sidebar
 *
 * Runs on every admin page after auth succeeds. Polls each endpoint every 60s
 * so fresh items surface without a page refresh.
 */
(function() {
    async function refreshInquiriesBadge() {
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

    async function refreshTasksBadge() {
        const badge = document.getElementById('nav-badge-tasks');
        if (!badge) return;
        try {
            const res = await fetch('/api/tasks/counts');
            if (!res.ok) return;
            const { attention } = await res.json();
            if (attention > 0) {
                badge.textContent = attention > 99 ? '99+' : attention;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        } catch (_) { /* silent — not critical */ }
    }

    function refreshAll() {
        refreshInquiriesBadge();
        refreshTasksBadge();
    }

    // Expose so pages can trigger an immediate refresh after user actions
    window.refreshTaskBadge = refreshTasksBadge;
    window.refreshInquiriesBadge = refreshInquiriesBadge;

    // First fetch on load, then every 60 seconds
    document.addEventListener('DOMContentLoaded', () => {
        refreshAll();
        setInterval(refreshAll, 60_000);
    });
})();
