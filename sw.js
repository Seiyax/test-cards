/* Offline support. Bump VERSION whenever any file below changes so installed copies refresh. */
const VERSION = 'v3';
const APP = 'lyric-card-app-' + VERSION;
const FONTS = 'lyric-card-fonts-v1';
const PAGE = 'spotifylyric.html';
const SHELL = ['./', PAGE, 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Playfair+Display:wght@700&family=Caveat:wght@700&family=Oswald:wght@600&family=Archivo+Black&display=swap';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    await c.addAll(SHELL);                                   // required: install fails if the page itself can't be cached
    try {                                                    // best effort: pre-download the web fonts so themes look right offline
      const fc = await caches.open(FONTS);
      const res = await fetch(FONT_CSS, { mode: 'cors' });
      const css = await res.clone().text();
      await fc.put(FONT_CSS, res);
      const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
      await Promise.all(urls.map((u) => fetch(u, { mode: 'cors' }).then((r) => r.ok && fc.put(u, r)).catch(() => {})));
    } catch (err) { /* offline fonts are optional */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('lyric-card-app-') && k !== APP) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;

  // Fonts: cache first, fill the cache as they are used
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (fc) => {
      const hit = await fc.match(req, { ignoreVary: true });
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok) fc.put(req, r.clone()); return r; } catch (err) { return Response.error(); }
    }));
    return;
  }

  // Everything else cross-origin (iTunes, Spotify, lyrics APIs, cover art) always goes to the network, never cached
  if (url.origin !== location.origin) return;

  // The page: network first (so updates arrive), cached copy when offline
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) { const c = await caches.open(APP); c.put(PAGE, r.clone()); }
        return r;
      } catch (err) {
        return (await caches.match(PAGE, { ignoreSearch: true })) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Same-origin assets: cache first
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { const r = await fetch(req); if (r.ok) { const c = await caches.open(APP); c.put(req, r.clone()); } return r; } catch (err) { return Response.error(); }
  })());
});
