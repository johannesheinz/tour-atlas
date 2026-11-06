import { SKIP_WAITING_MESSAGE, cacheName, cachedFile, staleCaches, type Precache } from './offlineCache.ts';

/** The build (tools/vite/serviceWorker.ts) writes it as the first line of sw.js, so every build's worker differs. */
declare const PRECACHE: Precache;
declare const self: ServiceWorkerGlobalScope;

const currentCache = cacheName(PRECACHE.version);

self.addEventListener('install', (event) => {
  // Revalidates, so index.html and the icons, whose names carry no hash, match this build and not an older HTTP copy.
  const requests = PRECACHE.files.map((file) => new Request(file, { cache: 'no-cache' }));
  event.waitUntil(caches.open(currentCache).then((cache) => cache.addAll(requests)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(staleCaches(names, PRECACHE.version).map((name) => caches.delete(name)))));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const file = cachedFile(new URL(request.url), new URL(self.registration.scope), request.mode === 'navigate', PRECACHE.files);
  if (file === null) return;
  event.respondWith(
    caches.open(currentCache).then(async (cache) => (await cache.match(file)) ?? fetch(request)),
  );
});

/** The page asks once the viewer chose to reload into the new build (src/serviceWorkerUpdates.ts). */
self.addEventListener('message', (event) => {
  if (event.data === SKIP_WAITING_MESSAGE) event.waitUntil(self.skipWaiting());
});
