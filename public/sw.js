const STATIC_CACHE = 'barcode-audit-static-v8';
const API_CACHE    = 'barcode-audit-api-v8';

const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/vendor/html5-qrcode.min.js',
  '/fonts/fonts.css',
  '/fonts/LibreBarcode39.woff2',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/dhl-logo.png'
];

// API GET paths whose responses are cached for offline use
const CACHEABLE_API = [
  '/api/stations',
  '/api/items',
  '/api/sub-locations',
  '/api/distribution',
  '/api/dashboard',
  '/api/version'
];

// ── Install: pre-cache entire app shell ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: routing logic ──────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // App shell — cache-first (always available offline after first visit)
  if (APP_SHELL.includes(path) || path === '/') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Cacheable API GETs — stale-while-revalidate (serve cache, refresh in bg)
  const isCacheableApi = request.method === 'GET' &&
    CACHEABLE_API.some(p => path === p || path.startsWith(p + '?'));

  if (isCacheableApi) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // Everything else (auth, writes, reports) — network only
  // Offline writes are queued by app.js; we just let them fail here
  event.respondWith(
    fetch(request).catch(() => offlineFallback(path))
  );
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  // Return cached immediately if available; otherwise wait for network
  return cached || await networkFetch || new Response('[]', {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function offlineFallback(path) {
  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return caches.match('/index.html');
}
