/*
 * Viwantica service worker: makes the home-screen app open fast and still
 * show the last catalog without a connection. Only same-origin GET requests
 * are handled; Telegram, Yandex and Google requests go straight to the network.
 *
 * - Pages: network first, the cached page when offline (a new release is
 *   picked up on the next launch).
 * - /assets/*: hashed build files, cache first.
 * - /data/*.json: network first, cached copy when offline.
 * - Photos (/catalog-images, /catalog-cutouts, /events, /icons): served from
 *   the cache; a copy older than a day is refreshed in the background, because
 *   a re-shot photo keeps its file name. The cache is trimmed now and then.
 */
const VERSION = "2026-10-23b";
const PAGES = `viwantica-pages-${VERSION}`;
const ASSETS = `viwantica-assets-${VERSION}`;
const DATA = `viwantica-data-${VERSION}`;
const PHOTOS = `viwantica-photos-${VERSION}`;
const LIMITS = { [ASSETS]: 60, [PHOTOS]: 400 };
const PHOTO_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let writesSinceTrim = 0;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icons/icon-192.png"])).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("viwantica-") && !key.endsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function trimAll() {
  for (const [cacheName, limit] of Object.entries(LIMITS)) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    for (const request of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(request);
  }
}

async function store(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  writesSinceTrim += 1;
  if (writesSinceTrim >= 40) {
    writesSinceTrim = 0;
    await trimAll();
  }
}

async function networkFirst(request, cacheName, cacheKey) {
  try {
    const response = await fetch(request);
    if (response.ok) store(cacheName, cacheKey || request, response.clone());
    return response;
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(cacheKey || request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) store(cacheName, request, response.clone());
  return response;
}

function isStale(response) {
  const date = Date.parse(response.headers.get("date") || "");
  return !Number.isFinite(date) || Date.now() - date > PHOTO_MAX_AGE_MS;
}

async function photo(request, event) {
  const cache = await caches.open(PHOTOS);
  const cached = await cache.match(request);
  if (cached) {
    if (isStale(cached)) {
      event.waitUntil(fetch(request).then((response) => (response.ok ? store(PHOTOS, request, response) : undefined)).catch(() => undefined));
    }
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) store(PHOTOS, request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGES, "/"));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(networkFirst(request, DATA));
    return;
  }
  if (/^\/(?:catalog-images|catalog-cutouts|events|icons)\//.test(url.pathname)) {
    event.respondWith(photo(request, event));
  }
});
