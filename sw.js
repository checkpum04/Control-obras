// Generado por scripts/build-sw.mjs — no editar a mano.
const CACHE = 'obras-c801d1e5c8';
const PRECACHE = ["./","./assets/index-BuWhokv_.css","./assets/index-ChA_SLbz.js","./icon-192.png","./icon-512.png","./icon.svg","./index.html","./manifest.webmanifest"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('obras-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!sameOrigin && !isFont) return; // la nube (Supabase) nunca pasa por la caché
  if (req.mode === 'navigate') {
    // La página: primero la red (para recibir versiones nuevas); sin cobertura, la guardada.
    e.respondWith(fetch(req).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))));
    return;
  }
  // Archivos de la app y fuentes: primero lo guardado (no cambian nunca para una misma versión).
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
