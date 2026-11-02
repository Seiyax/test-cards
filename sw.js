'use strict';
/*
  Service worker for the Lyric Card Generator.
  - App shell (this page, manifest, icons): cache-first, refreshed in the background.
  - Google Fonts CSS + font files: cache-first.
  - EVERYTHING else (iTunes, Spotify, lyrics.ovh, LRCLIB, cover images, Spotify Codes) is NOT intercepted,
    so it always goes straight to the network and is never cached as part of the shell.
  Bump VERSION to force clients to drop the old caches.
*/
const VERSION = 'v1';
const SHELL_CACHE = 'lyric-cards-shell-' + VERSION;
const FONT_CACHE = 'lyric-cards-fonts-' + VERSION;
const SHELL = ['./', 'spotifylyric.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];
const SHELL_PATHS = new Set(SHELL.map((u) => new URL(u, self.registration.scope).pathname));
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Playfair+Display:wght@700&family=Caveat:wght@700&family=Oswald:wght@600&family=Archivo+Black&display=swap';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    // allSettled: a missing optional file (e.g. an icon) must not break the install
    await Promise.allSettled(SHELL.map((u) => shell.add(new Request(u, { cache: 'reload' }))));
    try {
      const fonts = await caches.open(FONT_CACHE);
      const res = await fetch(FONT_CSS, { mode: 'cors' });
      if (res.ok) {
        const css = await res.clone().text();
        await fonts.put(FONT_CSS, res);
        const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g) || [])];
        await Promise.allSettled(urls.map((u) => fonts.add(new Request(u, { mode: 'cors' }))));
      }
    } catch (e) { /* offline during install: fonts get cached on first use instead */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, FONT_CACHE]);
    for (const k of await caches.keys()) if (k.startsWith('lyric-cards-') && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function shellResponse(event) {
  const req = event.request;
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const refresh = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; });
  event.waitUntil(refresh.catch(() => {}));
  if (hit) return hit;
  try { return await refresh; } catch (e) {
    if (req.mode === 'navigate') {
      const page = (await cache.match('spotifylyric.html')) || (await cache.match('./'));
      if (page) return page;
    }
    return Response.error();
  }
}

async function fontResponse(req) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (e) { return Response.error(); }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' || SHELL_PATHS.has(url.pathname)) event.respondWith(shellResponse(event));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') event.respondWith(fontResponse(req));
  // anything else: no respondWith = plain network request
});
