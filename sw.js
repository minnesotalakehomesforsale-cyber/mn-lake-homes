// MN Lake Homes service worker — makes the site installable + a basic offline
// shell. Deliberately network-FIRST for pages, CSS and JS so a deploy is never
// hidden behind a stale cache; images/fonts are stale-while-revalidate; API is
// never cached. Bump CACHE to invalidate old entries.
const CACHE = 'mnlh-v2';
const CORE = ['/', '/styles/style.css', '/components/components.js', '/favicon.svg', '/assets/icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;        // ignore cross-origin
  if (url.pathname.startsWith('/api/')) return;      // never cache API
  const isMedia = /\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname);
  if (!isMedia) {
    // Pages + CSS + JS: network-first so deploys show (within the short 5-min
    // max-age), with the cache only as an offline fallback. No forced reload —
    // that re-downloaded CSS/JS on every navigation and slowed the site.
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('/') : undefined)))
    );
    return;
  }
  // Images/fonts: stale-while-revalidate.
  e.respondWith(caches.match(req).then(cached => {
    const net = fetch(req).then(res => {
      if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});
