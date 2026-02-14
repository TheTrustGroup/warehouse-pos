/**
 * Service worker: static-asset caching only (Phase 1 stability — Safari/Brave/Chrome same build).
 * - HTML/document: never cached (NetworkOnly) so users always get latest shell.
 * - Static assets only: /assets/* and script/style/image/font. No API cache.
 * Bump CACHE_VERSION on each production deploy (see DEPLOYMENT.md).
 */

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

workbox.setConfig({ modulePathPrefix: 'https://storage.googleapis.com/workbox-cdn/releases/7.0.0/' });

// Bump CACHE_VERSION on each production deploy to invalidate old caches. Old caches are
// deleted in the 'activate' handler (eviction strategy).
const CACHE_VERSION = 3;
const CACHE_STATIC = `extremedept-static-v${CACHE_VERSION}`;

// --- HTML / document: never cache (ensure same build across Safari, Brave, Chrome) ---
workbox.routing.registerRoute(
  ({ request }) => request.mode === 'navigate' || request.destination === 'document',
  new workbox.strategies.NetworkOnly(),
  'GET'
);

// --- Caching: static assets only (CacheFirst); no API, no HTML ---
workbox.routing.registerRoute(
  ({ request, url }) => {
    if (url.origin !== self.location.origin) return false;
    const path = url.pathname;
    const dest = request.destination;
    return (
      (dest === 'script' || dest === 'style' || dest === 'image' || dest === 'font') ||
      path.startsWith('/assets/') ||
      /\.(js|css|png|jpg|jpeg|gif|webp|ico|svg|woff2?|ttf|eot)(\?.*)?$/i.test(path)
    );
  },
  new workbox.strategies.CacheFirst({ cacheName: CACHE_STATIC })
);

// --- Update handling: skip waiting and claim clients; delete old caches ---
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // Evict caches from previous versions (any cache not in current CACHE_* names)
      const names = await self.caches.keys();
      const current = [CACHE_STATIC];
      await Promise.all(
        names
          .filter((name) => name.startsWith('extremedept-') && !current.includes(name))
          .map((name) => self.caches.delete(name))
      );
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED' });
      });
    })()
  );
});

// --- Background Sync: when browser fires 'sync' with tag 'sync-inventory', tell clients to run processSyncQueue ---
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-inventory') {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => client.postMessage({ type: 'SYNC_INVENTORY' }));
      })()
    );
  }
});

// --- Periodic Background Sync: tell clients to sync (page must register periodicSync) ---
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'inventory-periodic') {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => client.postMessage({ type: 'SYNC_INVENTORY' }));
      })()
    );
  }
});

// --- Push / message from client: show "Inventory synced successfully" notification ---
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_SYNC_NOTIFICATION') {
    event.waitUntil(
      self.registration.showNotification('Inventory synced successfully', {
        body: 'Your changes have been synced to the server.',
        tag: 'sync-done',
        requireInteraction: false,
      })
    );
  }
});
