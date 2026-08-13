const CACHE_NAME = "petrol-calc-v10";
const PRICE_CACHE = "petrol-calc-price-v10";
const PRICE_SOURCE_URL =
  "https://www.consumer.org.hk/pricewatch/oilwatch/opendata/oilprice.json";
const PRICE_URL =
  "https://corsproxy.io/?url=" + encodeURIComponent(PRICE_SOURCE_URL);
const PRICE_TTL_MS = 6 * 60 * 60 * 1000;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
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
        Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isPriceRequest(request) {
  try {
    const url = new URL(request.url);
    return (
      request.url === PRICE_URL ||
      url.href === PRICE_URL ||
      url.hostname === "corsproxy.io" ||
      url.pathname.endsWith("oilprice.json") ||
      url.pathname.includes("/oilwatch/opendata/")
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
 * Network-first for oil price JSON — always try live Consumer Council data first.
 * On network failure, fall back to cached JSON (prefer < 6h, else stale).
 */
async function networkFirstPrice(request) {
  const cache = await caches.open(PRICE_CACHE);
  try {
    const response = await fetch(PRICE_URL, { cache: "no-store", mode: "cors" });
    if (response && response.ok) {
      await putPriceCache(PRICE_URL, response);
      return response;
    }
    throw new Error("Bad network response");
  } catch (err) {
    const cached =
      (await cache.match(PRICE_URL)) ||
      (await cache.match(request)) ||
      (await cache.match(PRICE_SOURCE_URL));
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
