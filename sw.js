const CACHE_NAME = "petrol-calc-v1";
const PRICE_CACHE = "petrol-calc-price-v1";
const VERSION_URL = "./version.json";
const PRICE_URL = "./data/oilprice.json";
const PRICE_TTL_MS = 6 * 60 * 60 * 1000;

/** Offline fallback only — never precache HTML (avoids old SW poisoning install). */
const STATIC_ASSETS = [
  "./manifest.json",
  "./defaults.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon-48.png",
];

async function deleteOtherCaches() {
  const keep = new Set([CACHE_NAME, PRICE_CACHE]);
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)),
  );
}

async function deleteAllCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

async function precacheAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    STATIC_ASSETS.map(async (path) => {
      try {
        const response = await fetch(path, { cache: "no-store" });
        if (response.ok) await cache.put(path, response);
      } catch {
        /* ignore individual asset failures */
      }
    }),
  );
}

/** Bypass HTTP / navigation request cache quirks (esp. iOS Safari). */
function networkFetch(request) {
  const url = typeof request === "string" ? request : request.url;
  return fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "follow",
  });
}

self.addEventListener("install", (event) => {
  // Activate ASAP. Do not precache HTML here — addAll can be intercepted by the
  // old controlling worker and poison the cache with a stale shell.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await deleteOtherCaches();
      await precacheAssets();
      await self.clients.claim();
    })(),
  );
});

function isPriceRequest(request) {
  try {
    const url = new URL(request.url);
    return (
      url.origin === self.location.origin &&
      (url.pathname.endsWith("/data/oilprice.json") ||
        url.pathname.endsWith("/data/price-history.json"))
    );
  } catch {
    return false;
  }
}

function isVersionRequest(request) {
  try {
    const url = new URL(request.url);
    return (
      url.origin === self.location.origin &&
      url.pathname.endsWith("/version.json")
    );
  } catch {
    return false;
  }
}

function isShellDocumentRequest(request) {
  if (request.mode === "navigate") return true;
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;
    const path = url.pathname;
    return (
      path.endsWith("/") ||
      path.endsWith("/index.html") ||
      /\/index\.html$/i.test(path)
    );
  } catch {
    return false;
  }
}

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
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

/** Always prefer network for HTML. */
async function networkFirstDocument(request) {
  const cache = await caches.open(CACHE_NAME);
  const storeUrl = new URL(request.url);
  storeUrl.search = "";
  const storeKey = storeUrl.href;

  try {
    const response = await networkFetch(request);
    if (response && response.ok) {
      cache.put(storeKey, response.clone()).catch(() => {});
      return response;
    }
    throw new Error("Bad network response");
  } catch (err) {
    const cached =
      (await cache.match(storeKey)) ||
      (await cache.match("./index.html")) ||
      (await cache.match("./"));
    if (cached) return cached;
    return new Response("Offline", {
      status: 504,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

async function networkFirstVersion(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await networkFetch(request);
    if (response && response.ok) {
      cache.put(VERSION_URL, response.clone()).catch(() => {});
      return response;
    }
    throw new Error("Bad network response");
  } catch (err) {
    const cached = await cache.match(VERSION_URL);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: String(err && err.message) }), {
      status: 504,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await networkFetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function networkFirstPrice(request) {
  const cache = await caches.open(PRICE_CACHE);
  try {
    const response = await networkFetch(request);
    if (response && response.ok) {
      await putPriceCache(request, response);
      return response;
    }
    throw new Error("Bad network response");
  } catch (err) {
    const cached = await cache.match(request);
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

  if (isVersionRequest(event.request)) {
    event.respondWith(networkFirstVersion(event.request));
    return;
  }

  if (isPriceRequest(event.request)) {
    event.respondWith(networkFirstPrice(event.request));
    return;
  }

  if (isShellDocumentRequest(event.request)) {
    event.respondWith(networkFirstDocument(event.request));
    return;
  }

  if (isSameOrigin(event.request)) {
    event.respondWith(cacheFirst(event.request));
  }
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (type === "CLEAR_CACHES") {
    event.waitUntil(deleteAllCaches());
  }
});
