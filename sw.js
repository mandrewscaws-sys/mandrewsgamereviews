/* Lets the app open without internet and remember pictures it has already seen. */
const APP = 'gr-app-v1';
const PICS = 'gr-pics-v1';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => ![APP, PICS].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // the Google Sheet is never cached here
  const isPicture = /\.(png|jpe?g|webp|gif|ico)$/i.test(url.pathname) && !/^\/?(icon-)/.test(url.pathname.split('/').pop());
  if (isPicture) {                                       // pictures: use the saved copy, refresh quietly
    e.respondWith(caches.open(PICS).then(async cache => {
      const saved = await cache.match(req);
      const fresh = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => saved);
      return saved || fresh;
    }));
  } else {                                               // the app itself: newest first, saved copy if offline
    e.respondWith(fetch(req).then(r => {
      if (r.ok) caches.open(APP).then(c => c.put(req, r.clone()));
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./'))));
  }
});
