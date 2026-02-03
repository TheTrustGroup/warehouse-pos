/* Service worker: cache app shell and static assets. Do not cache API. */
const CACHE_NAME = 'warehouse-pos-v1';

const isApiRequest = (url) => {
  try {
    const u = new URL(url);
    return u.pathname.startsWith('/api/') || u.pathname.startsWith('/admin/api/');
  } catch {
    return false;
  }
};

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  if (request.method !== 'GET') return;
  if (isApiRequest(url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            try {
              cache.put(request, response.clone());
            } catch (_) {}
          }
          return response;
        });
        return cached || fetchPromise;
      })
    )
  );
});
