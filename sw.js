/* Service worker — CDSS Apnea del prematuro y cafeína
   Dr. Jano Jaramillo · Sala de Neonatología, Hospital Dr. Cecilio Castillero
   Cambie VERSION en cada publicación para forzar la actualización. */
const VERSION = 'apnea-cafeina-v1.0.0';
const PREFIX = 'apnea-cafeina-';
const CORE = ['./', './index.html'];
const FONT_CACHE = PREFIX + 'fonts';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Cada recurso por separado: si uno falla, la instalación no se cae.
    await Promise.all(CORE.map(async url => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.ok) await cache.put(url, res);
      } catch (e) { /* sin red durante la instalación: se cacheará en la primera visita */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith(PREFIX) && k !== VERSION && k !== FONT_CACHE)
      .map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) Navegación: red primero (con límite de 4 s), caché como respaldo.
  //    Así nunca queda "cargando" con una versión vieja ni sin conexión.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const preload = event.preloadResponse ? await event.preloadResponse : null;
        const res = preload || await Promise.race([fetch(req), timeout(4000)]);
        if (res && res.ok) cache.put('./index.html', res.clone());
        return res;
      } catch (e) {
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               new Response('<!doctype html><meta charset="utf-8"><title>Sin conexión</title><body style="font-family:sans-serif;padding:2em">Sin conexión. Abra la app una vez con internet para guardarla en el dispositivo.</body>',
                 { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // 2) Tipografías de Google: caché primero (funcionan sin internet tras la primera carga).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // 3) Mismo origen: caché y actualización en segundo plano.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      const net = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
  }
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
