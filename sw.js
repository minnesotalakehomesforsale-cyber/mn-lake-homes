// MN Lake Homes service worker — KILL SWITCH.
//
// The SW caused recurring stale-content bugs: blog cover images rendering blank,
// pages surviving a deploy, etc. The site is fully server-rendered behind
// Cloudflare and does not need offline caching, so the SW is being removed
// entirely. This version unregisters itself and deletes every cache the moment it
// activates, then reloads any open tab so it reloads fresh from the network.
//
// Existing installs update to this file on their next visit (the browser checks
// sw.js on navigation), run the cleanup once, and are left with NO service worker.
// New visitors never register one (the registration call was removed from
// components.js). There is deliberately NO fetch handler, so the browser always
// goes straight to the network.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        try {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        } catch (_) {}
        try { await self.registration.unregister(); } catch (_) {}
        try {
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach(c => { try { c.navigate(c.url); } catch (_) {} });
        } catch (_) {}
    })());
});
