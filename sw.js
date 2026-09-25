const VERSION_URL = "./version.json";
const PRICE_URL = "./data/oilprice.json";
const PRICE_TTL_MS = 6 * 60 * 60 * 1000;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./version.json",
  "./data/oilprice.json",
  "./data/price-history.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon-48.png",
];

/** @type {string | null} */
let activeVersion = null;

function normalizeVersion(value) {
  const version = String(value ?? "")
    .trim()
    .replace(/^v/i, "");
  return version || "0";
}

function shellCacheName(version) {
  return `petrol-calc-${version}`;
}

function priceCacheName(version) {
  return `petrol-calc-price-${version}`;
}

async function fetchAppVersion() {
  const response = await fetch(VERSION_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return normalizeVersion(data.version);
}

async function resolveVersion() {
  try {
    activeVersion = await fetchAppVersion();
  } catch {
    if (!activeVersion) {
      const keys = await caches.keys();
      const match = keys
        .map((key) => key.match(/^petrol-calc-(\d+\.\d+\.\d+)$/))
        .find(Boolean);
      activeVersion = match ? match[1] : "0";
    }
  }
  return activeVersion;
}

async function pruneOtherCaches(version) {
  const keep = new Set([shellCacheName(version), priceCacheName(version)]);
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)),
  );
}

async function precacheShell(version) {
  const cache = await caches.open(shellCacheName(version));
  await cache.addAll(STATIC_ASSETS);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const version = await resolveVersion();
      await precacheShell(version);
      // Activate immediately so iOS PWAs do not keep serving a waiting worker.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const version = await resolveVersion();
      await pruneOtherCaches(version);
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

async function putPriceCache(request, response, version) {
  const cache = await caches.open(priceCacheName(version));
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

/** Network-first for HTML shell so version bumps apply without editing this file. */
async function networkFirstDocument(request) {
  const version = await resolveVersion();
  const cache = await caches.open(shellCacheName(version));
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      cache.put(request, response.clone());
      return response;
    }
    throw new Error("Bad network response");
  } catch (err) {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (await caches.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    return new Response("Offline", {
      status: 504,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

/** Network-first for version.json; switches cache names when the version changes. */
async function networkFirstVersion(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      const data = await response.clone().json();
      const version = normalizeVersion(data.version);
      if (version !== activeVersion) {
        activeVersion = version;
        await pruneOtherCaches(version);
        await precacheShell(version).catch(() => {});
      }
      const cache = await caches.open(shellCacheName(version));
      cache.put(request, response.clone());
      return response;
    }
    throw new Error("Bad network response");
  } catch (err) {
    const version = activeVersion || (await resolveVersion());
    const cached =
      (await caches.open(shellCacheName(version)).then((c) => c.match(request))) ||
      (await caches.match(VERSION_URL, { ignoreSearch: true }));
    if (cached) return cached;
    return new Response(JSON.stringify({ error: String(err && err.message) }), {
      status: 504,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/** Cache-first for other static assets. */
async function cacheFirst(request) {
  const version = activeVersion || (await resolveVersion());
  const cache = await caches.open(shellCacheName(version));
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Network-first for oilprice / price-history (updated by GitHub Actions).
 * Falls back to SW cache when offline.
 */
async function networkFirstPrice(request) {
  const version = activeVersion || (await resolveVersion());
  const cache = await caches.open(priceCacheName(version));
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      await putPriceCache(request, response, version);
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
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
