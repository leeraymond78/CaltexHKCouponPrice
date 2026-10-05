import {
  setupPwaInstallTracking,
  trackEvent,
  trackPageView,
} from "./analytics.js";
import {
  bindPrices,
  closeChart,
  loadPrices,
  restorePrices,
  syncPageScrollLock,
  updateOnlineUi,
} from "./prices.js";
import {
  closeNav,
  initMap,
  isNavOpen,
  openMapPage,
  resizeMap,
} from "./map.js";

const VERSION_URL = "version.json";
/** Must match version.json at deploy time — detects stale HTML shells. */
const APP_BUILD_VERSION = String(window.APP_BUILD_VERSION || "1.2.0");
const FORCE_RELOAD_KEY = "pwa_force_reload";
const CACHE_MIGRATE_KEY = "pwa_cache_migrate_1_1_5";

const updateBanner = document.getElementById("updateBanner");
const appVersionEl = document.getElementById("appVersion");
const viewCalc = document.getElementById("viewCalc");
const viewMap = document.getElementById("viewMap");
const tabPrices = document.getElementById("tabPrices");
const tabMap = document.getElementById("tabMap");

let waitingWorker = null;
let mapTracked = false;

function normalizeSemver(value) {
  return String(value ?? "")
    .trim()
    .replace(/^v/i, "");
}

function showBuildVersion() {
  appVersionEl.textContent = `v${normalizeSemver(APP_BUILD_VERSION)}`;
  appVersionEl.hidden = false;
}

async function clearAppCaches() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

async function unregisterServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs.map(async (reg) => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      if (reg.active) {
        reg.active.postMessage({ type: "CLEAR_CACHES" });
      }
      await reg.unregister();
    }),
  );
}

/** One-shot wipe of legacy versioned SW caches. */
async function migrateLegacyCaches() {
  try {
    if (localStorage.getItem(CACHE_MIGRATE_KEY) === "1") return false;
    localStorage.setItem(CACHE_MIGRATE_KEY, "1");
  } catch {
    /* continue wipe even if storage is unavailable */
  }

  try {
    await clearAppCaches();
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs.map(async (reg) => {
          reg.active?.postMessage({ type: "CLEAR_CACHES" });
          reg.waiting?.postMessage({ type: "SKIP_WAITING" });
          await reg.unregister();
        }),
      );
    }
  } catch {
    /* still reload */
  }

  const url = new URL(location.href);
  url.searchParams.set("v", normalizeSemver(APP_BUILD_VERSION));
  url.searchParams.set("_", String(Date.now()));
  location.replace(url.toString());
  return true;
}

/** Stale HTML can show a fresh version.json; wipe caches and hard-reload once. */
async function forceFreshApp(remoteVersion) {
  const token = `v${remoteVersion}`;
  if (sessionStorage.getItem(FORCE_RELOAD_KEY) === token) {
    return false;
  }
  sessionStorage.setItem(FORCE_RELOAD_KEY, token);

  try {
    await clearAppCaches();
    await unregisterServiceWorkers();
  } catch {
    /* still attempt reload */
  }

  const url = new URL(location.href);
  url.searchParams.set("v", remoteVersion);
  url.searchParams.set("_", String(Date.now()));
  location.replace(url.toString());
  return true;
}

function scrubCacheBustParams() {
  const url = new URL(location.href);
  if (!url.searchParams.has("v") && !url.searchParams.has("_")) return;
  url.searchParams.delete("v");
  url.searchParams.delete("_");
  const clean =
    url.pathname +
    (url.searchParams.toString() ? `?${url.searchParams}` : "") +
    url.hash;
  history.replaceState(null, "", clean);
}

async function loadAppVersion() {
  showBuildVersion();
  const build = normalizeSemver(APP_BUILD_VERSION);

  try {
    const response = await fetch(VERSION_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const remote = normalizeSemver(data?.version);
    if (!remote) throw new Error("missing version");

    if (remote !== build) {
      const reloading = await forceFreshApp(remote);
      if (reloading) return;
    } else {
      sessionStorage.removeItem(FORCE_RELOAD_KEY);
      scrubCacheBustParams();
    }
  } catch {
    /* keep showing embedded build version */
  }
}

function showUpdateBanner(worker) {
  waitingWorker = worker;
  updateBanner.hidden = false;
  updateBanner.classList.add("is-visible");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // Bust the SW script URL whenever the build changes (iOS is aggressive about SW caching).
  const swUrl = `sw.js?v=${encodeURIComponent(normalizeSemver(APP_BUILD_VERSION))}`;

  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      const checkUpdate = () => registration.update().catch(() => {});
      checkUpdate();

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkUpdate();
      });

      // Always activate waiting workers immediately — no manual tap required.
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state !== "installed") return;
          worker.postMessage({ type: "SKIP_WAITING" });
        });
      });
    })
    .catch(() => {});

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function syncAppHeight() {
  const viewport = window.visualViewport;
  const height = Math.round(viewport ? viewport.height : window.innerHeight);
  const top = viewport ? viewport.offsetTop : 0;
  document.documentElement.style.setProperty("--app-height", `${height}px`);
  document.body.style.top = `${top}px`;
  document.body.style.height = `${height}px`;
  if (document.body.dataset.tab === "map") resizeMap();
}

function setActiveTab(tab) {
  const showMap = tab === "map";
  const next = showMap ? "map" : "prices";
  if (document.body.dataset.tab === next) {
    if (showMap) openMapPage();
    return;
  }
  document.body.dataset.tab = next;
  viewCalc.hidden = showMap;
  viewMap.hidden = !showMap;
  viewCalc.classList.toggle("is-active", !showMap);
  viewMap.classList.toggle("is-active", showMap);
  tabPrices.setAttribute("aria-selected", String(!showMap));
  tabMap.setAttribute("aria-selected", String(showMap));
  const url = new URL(location.href);
  history.replaceState(
    null,
    "",
    url.pathname + url.search + (showMap ? "#map" : ""),
  );
  if (!showMap) closeNav();
  if (showMap) {
    if (!mapTracked) {
      mapTracked = true;
      trackEvent("open_map");
    }
    openMapPage();
  }
}

function setupTabs() {
  tabPrices.addEventListener("click", () => setActiveTab("prices"));
  tabMap.addEventListener("click", () => setActiveTab("map"));
  tabPrices.parentElement.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = document.body.dataset.tab === "map" ? "prices" : "map";
    setActiveTab(next);
    (next === "map" ? tabMap : tabPrices).focus();
  });
  window.addEventListener("hashchange", () => {
    const want = location.hash === "#map" ? "map" : "prices";
    if (document.body.dataset.tab !== want) setActiveTab(want);
  });
  if (location.hash === "#map") setActiveTab("map");
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (isNavOpen()) {
    closeNav();
    return;
  }
  closeChart();
});

updateBanner.addEventListener("click", () => {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
});

window.addEventListener("online", () => {
  updateOnlineUi();
  loadPrices();
});
window.addEventListener("offline", updateOnlineUi);
window.addEventListener("resize", () => {
  syncAppHeight();
  syncPageScrollLock();
});
window.addEventListener("orientationchange", () => {
  window.setTimeout(() => {
    syncAppHeight();
    syncPageScrollLock();
  }, 100);
});
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncAppHeight);
  window.visualViewport.addEventListener("scroll", syncAppHeight);
}
syncAppHeight();
if (typeof ResizeObserver === "function") {
  const appEl = document.getElementById("app");
  if (appEl) new ResizeObserver(syncPageScrollLock).observe(appEl);
}

bindPrices();
initMap();
setupPwaInstallTracking();
setupTabs();
trackPageView();
restorePrices();
window.setTimeout(() => {
  migrateLegacyCaches().then((reloading) => {
    if (reloading) return;
    registerServiceWorker();
    loadAppVersion().finally(syncPageScrollLock);
    loadPrices();
    syncPageScrollLock();
  });
}, 400);
syncPageScrollLock();
