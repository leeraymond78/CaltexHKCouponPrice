const CACHE_NAME = "petrol-calc-v12";
const PRICE_CACHE = "petrol-calc-price-v12";
const PRICE_URL = "./data/oilprice.json";
const PRICE_TTL_MS = 6 * 60 * 60 * 1000;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./data/oilprice.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon-48.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  // Do not skipWaiting here — the page shows an update banner first.
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE_NAME, PRICE_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isPriceRequest(request) {
  try {
    const url = new URL(request.url);
    return (
      url.origin === self.location.origin &&
      url.pathname.endsWith("/data/oilprice.json")
    );
  } catch {
    return false;
  }
}

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

/** Cache-first for static app shell. */
async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

function cacheAgeMs(response) {
  const stamped = Number(response.headers.get("x-sw-cached-at") || 0);
  if (!Number.isFinite(stamped) || stamped <= 0) return Number.POSITIVE_INFINITY;
  return Date.now() - stamped;
}

async function putPriceCache(request, response) {
  const cache = await caches.open(PRICE_CACHE);
  const headers = new Headers(response.headers);
  headers.set("x-sw-cached-at", String(Date.now()));
  headers.set("x-sw-cache-ttl", String(PRICE_TTL_MS));
  const body = await response.clone().blob();
  await cache.put(
    request,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
}

/**
 * Network-first for bundled oilprice.json (updated by GitHub Actions).
 * Falls back to SW cache when offline.
 */
async function networkFirstPrice(request) {
  const cache = await caches.open(PRICE_CACHE);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      await putPriceCache(request, response);
      return response;
    }
    throw new Error("Bad network response");
  } catch (err) {
    const cached =
      (await cache.match(request)) ||
      (await caches.match(PRICE_URL, { ignoreSearch: true }));
    if (cached) {
      const age = cacheAgeMs(cached);
      if (age <= PRICE_TTL_MS) return cached;

      const headers = new Headers(cached.headers);
      headers.set("x-sw-cache-stale", "1");
      return new Response(await cached.clone().blob(), {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }

    return new Response(JSON.stringify({ error: String(err && err.message) }), {
      status: 504,
      headers: { "Content-Type": "application/json" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (isPriceRequest(event.request)) {
    event.respondWith(networkFirstPrice(event.request));
    return;
  }

  if (isSameOrigin(event.request)) {
    event.respondWith(cacheFirst(event.request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
