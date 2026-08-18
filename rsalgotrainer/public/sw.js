// Custom Service Worker — AlgoTrainer
// Strategies:
//   Navigation (index.html) : cache-first + background-refresh → offline.html fallback
//   Static assets (hashed)  : cache-first (URLs are content-addressed, safe forever)
//   /store/** (API data)     : network-first (5 s) → cache fallback
//   /admin/**, /auth/**      : network-only, never cached

const CACHE   = 'algo-trainer-v1';
const API     = 'https://rsalgotrainerapi.gordlby.at';
const STATIC  = /\.(js|css|woff2?|ttf|otf|png|ico|webmanifest|svg|jpg|jpeg|gif|webp)(\?.*)?$/;

// ── Install: cache shell without blocking on errors ───────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled([c.add('/index.html'), c.add('/offline.html')])
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isApi      = url.origin === API;

  // ── Admin / auth: always go to network, never intercept ──────────────────
  if (isApi && (url.pathname.startsWith('/admin') || url.pathname.startsWith('/auth'))) {
    return; // let browser handle it normally
  }

  // ── Algorithm data: network-first, cache fallback ────────────────────────
  if (isApi && url.pathname.startsWith('/store/')) {
    e.respondWith(networkFirstCache(req));
    return;
  }

  // ── Navigation (HTML page load): cache-first + background refresh ─────────
  if (req.mode === 'navigate') {
    e.respondWith(serveNavigation(req));
    return;
  }

  // ── Static assets (same-origin, hashed URLs): cache-first ────────────────
  if (sameOrigin && STATIC.test(url.pathname)) {
    e.respondWith(cacheFirstStatic(req));
    return;
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function serveNavigation(req) {
  const cache  = await caches.open(CACHE);
  const cached = await cache.match('/index.html');

  if (cached) {
    // Serve instantly from cache; refresh in background so next load is fresh
    refreshInBackground('/index.html', cache);
    return cached;
  }

  // Not in cache yet — fetch, cache, serve
  try {
    const res = await fetch('/index.html');
    if (res.ok) await cache.put('/index.html', res.clone());
    return res;
  } catch {
    const offline = await cache.match('/offline.html');
    return offline ?? new Response('<h1>Offline</h1>', {
      status: 503,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

async function networkFirstCache(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetchWithTimeout(req, 5000);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached ?? new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirstStatic(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const cache = await caches.open(CACHE);
  const res   = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

function refreshInBackground(url, cache) {
  fetch(url).then(res => {
    if (res.ok) cache.put(url, res);
  }).catch(() => {});
}

function fetchWithTimeout(req, ms) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  return fetch(req, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}
