// Tras `vite build`: genera dist/sw.js con la lista exacta de archivos para que la app abra sin conexión.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = 'dist';
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(root).filter((f) => !f.endsWith('sw.js')).map((f) => relative(root, f).replace(/\\/g, '/'));
const hash = createHash('sha1');
for (const f of files) hash.update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 10);

writeFileSync(join(root, 'sw.js'), `// Generado por scripts/build-sw.mjs — no editar a mano.
const CACHE = 'obras-${version}';
const PRECACHE = ${JSON.stringify(['./', ...files.map((f) => './' + f)])};

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
`);
console.log('sw.js', version, files.length, 'archivos');
