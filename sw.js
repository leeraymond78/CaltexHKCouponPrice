const CACHE_NAME = "petrol-calc-v8";
const CSV_CACHE = "petrol-calc-csv-v8";
const CSV_URL =
  "https://www.consumer.org.hk/pricewatch/oilwatch/opendata/oilprice_en.csv";
const CSV_TTL_MS = 6 * 60 * 60 * 1000;

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
  const keep = new Set([CACHE_NAME, CSV_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isCsvRequest(request) {
  try {
    const url = new URL(request.url);
    return (
      request.url === CSV_URL ||
      url.href === CSV_URL ||
      url.pathname.endsWith("oilprice_en.csv") ||
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

async function putCsvCache(request, response) {
  const cache = await caches.open(CSV_CACHE);
  const headers = new Headers(response.headers);
  headers.set("x-sw-cached-at", String(Date.now()));
  headers.set("x-sw-cache-ttl", String(CSV_TTL_MS));
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
 * Network-first for CSV — always try live Consumer Council data first.
 * On network failure, fall back to cached CSV (prefer < 6h, else stale).
 */
async function networkFirstCsv(request) {
  const cache = await caches.open(CSV_CACHE);
  try {
    const response = await fetch(request, { cache: "no-store", mode: "cors" });
    if (response && response.ok) {
      await putCsvCache(request, response);
      return response;
    }
    throw new Error("Bad network response");
  } catch (err) {
    const cached = (await cache.match(request)) || (await cache.match(CSV_URL));
    if (!cached) throw err;

    const age = cacheAgeMs(cached);
    if (age <= CSV_TTL_MS) return cached;

    // Stale-but-present fallback for fully offline clients.
    const headers = new Headers(cached.headers);
    headers.set("x-sw-cache-stale", "1");
    return new Response(await cached.clone().blob(), {
      status: cached.status,
      statusText: cached.statusText,
      headers,
    });
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (isCsvRequest(event.request)) {
    event.respondWith(networkFirstCsv(event.request));
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
