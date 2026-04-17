/**
 * admin-guard.js — Client-side auth guard for admin pages
 *
 * Include this as the FIRST script in every admin page's <head>:
 *   <script src="../../components/admin-guard.js"></script>
 *
 * Behavior:
 *   1. Hides the page body immediately so visitors never see admin
 *      content before the redirect fires.
 *   2. Calls /api/auth/session — if the viewer is signed in as
 *      admin / super_admin, reveals the page.
 *   3. Otherwise, redirects:
 *      - to /pages/public/login.html?redirect=<current-url> if not signed in
 *      - to /index.html if signed in but wrong role
 */
(function() {
    // Hide body until we know the viewer is allowed
    document.documentElement.style.visibility = 'hidden';

    function reveal() {
        document.documentElement.style.visibility = '';
    }

    function redirectToLogin() {
        const here = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace('/pages/public/login.html?redirect=' + here);
    }

    function redirectHome() {
        window.location.replace('/index.html');
    }

    fetch('/api/auth/session', { credentials: 'same-origin' })
        .then(r => {
            if (r.status === 401 || r.status === 403) {
                redirectToLogin();
                return null;
            }
            if (!r.ok) throw new Error('session check failed');
            return r.json();
        })
        .then(user => {
            if (!user) return;
            if (user.role === 'admin' || user.role === 'super_admin') {
                reveal();
            } else {
                redirectHome();
            }
        })
        .catch(() => {
            // Any network/server error — treat as unauthenticated
            redirectToLogin();
        });
})();
