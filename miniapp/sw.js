const CACHE = 'ipse-v2';
const ASSETS = [
  '/ipse-app/miniapp/',
  '/ipse-app/miniapp/index.html',
  '/ipse-app/miniapp/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Borra todas las cachés antiguas (ipse-v1, etc.)
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;

  // Network-first: siempre intenta la red primero.
  // Solo usa caché si no hay conexión (modo offline).
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Actualiza la caché con la versión fresca
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
