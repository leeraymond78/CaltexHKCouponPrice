const PWA_INSTALL_TRACKED_KEY = "pwa_install_tracked";
const UMAMI_READY_TIMEOUT_MS = 10000;

/** @type {Array<(api: { track: Function }) => void>} */
const umamiQueue = [];
let umamiReadyTimer = 0;

function isRunningAsPwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true
  );
}

function flushUmamiQueue() {
  if (typeof umami === "undefined" || typeof umami.track !== "function") {
    return false;
  }
  while (umamiQueue.length) {
    const job = umamiQueue.shift();
    try {
      job(umami);
    } catch {
      /* analytics must never break the app */
    }
  }
  return true;
}

function whenUmamiReady(job) {
  umamiQueue.push(job);
  if (flushUmamiQueue()) return;

  if (umamiReadyTimer) return;
  const started = Date.now();
  umamiReadyTimer = window.setInterval(() => {
    if (flushUmamiQueue() || Date.now() - started > UMAMI_READY_TIMEOUT_MS) {
      window.clearInterval(umamiReadyTimer);
      umamiReadyTimer = 0;
    }
  }, 100);
}

export function trackEvent(name, data) {
  whenUmamiReady((api) => {
    if (data == null) api.track(name);
    else api.track(name, data);
  });
}

/** Pageviews: auto-track can miss PWA standalone opens; send explicitly once ready. */
export function trackPageView() {
  whenUmamiReady((api) => {
    api.track((props) => {
      if (!isRunningAsPwa()) return props;
      try {
        const parsed = new URL(props.url, location.href);
        parsed.searchParams.set("utm_medium", "pwa");
        return {
          ...props,
          url: parsed.pathname + parsed.search + parsed.hash,
        };
      } catch {
        return props;
      }
    });
  });
}

function trackPwaInstall(source) {
  try {
    if (localStorage.getItem(PWA_INSTALL_TRACKED_KEY) === "1") return;
    localStorage.setItem(PWA_INSTALL_TRACKED_KEY, "1");
  } catch {
    /* still send once this session */
  }
  trackEvent("pwa_installed", { source });
}

export function setupPwaInstallTracking() {
  window.addEventListener("appinstalled", () => {
    trackPwaInstall("appinstalled");
  });
  if (isRunningAsPwa()) {
    trackPwaInstall("standalone");
  }
}
