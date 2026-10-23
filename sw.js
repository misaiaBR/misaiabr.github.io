// Service worker: instala o app completo e deixa tudo funcionando sem internet.
const VERSION = 'ipe-banco-1.5.23-2026.10.23-2';
const CACHE = `ipe-${VERSION}`;

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/logic/rules.js',
  './js/logic/money.js',
  './js/logic/card.js',
  './js/logic/security.js',
  './js/logic/pix.js',
  './js/logic/boleto.js',
  './js/logic/fx.js',
  './js/logic/limits.js',
  './js/logic/boxes.js',
  './js/logic/store.js',
  './js/ui/icons.js',
  './js/ui/kit.js',
  './js/ui/qr.js',
  './js/ui/shared.js',
  './js/ui/statement-pdf.js',
  './js/ui/router.js',
  './js/vendor/qrcode.js',
  './js/vendor/jsqr.js',
  './js/screens/auth.js',
  './js/screens/home.js',
  './js/screens/statement.js',
  './js/screens/pix.js',
  './js/screens/pay.js',
  './js/screens/card.js',
  './js/screens/fx.js',
  './js/screens/boxes.js',
  './js/screens/notifications.js',
  './js/screens/profile.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/maskable-512.png',
  './assets/apple-touch-icon.png',
  './assets/apple-touch-icon-v2.png',
  './assets/splash-1284x2778.png',
  './assets/splash-dark-1284x2778.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch((err) => {
        // itens opcionais (splash) não podem impedir a instalação
        console.warn('[sw] instalação parcial', err);
        return caches.open(CACHE).then((cache) => cache.addAll(CORE.filter((p) => !p.includes('splash'))));
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // nunca intercepta rotas da plataforma
  if (url.pathname.includes('/__qoder') || url.pathname.includes('/functions/')) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: false }).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate' || request.destination === 'document') {
            return caches.match('./index.html');
          }
          return new Response('offline', { status: 503, statusText: 'offline', headers: { 'content-type': 'text/plain' } });
        });
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
