import { trackEvent } from "./analytics.js";
import { getLang, onLangChange, t } from "./i18n.js";
import { isChartOpen } from "./prices.js";

const STATIONS_LIVE = {
  en: "https://www.caltex.com/bin/services/getStations.json?pagePath=/hk/en/find-us&siteType=b2c",
  zh: "https://www.caltex.com/bin/services/getStations.json?pagePath=/hk/zh/find-us&siteType=b2c",
};
const STATIONS_LOCAL = {
  en: "data/stations.json",
  zh: "data/stations-zh.json",
};
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const MAPLIBRE_JS =
  "https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.js";
const MAPLIBRE_CSS =
  "https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.css";

const viewMap = document.getElementById("viewMap");
const stationMapEl = document.getElementById("stationMap");
const mapFallback = document.getElementById("mapFallback");
const stationScroll = document.getElementById("stationScroll");
const navBackdrop = document.getElementById("navBackdrop");
const navSub = document.getElementById("navSub");
const navApple = document.getElementById("navApple");
const navGoogle = document.getElementById("navGoogle");
const navAmap = document.getElementById("navAmap");
const navClose = document.getElementById("navClose");
const navCancel = document.getElementById("navCancel");
const stationStatus = document.getElementById("stationStatus");
const stationSearch = document.getElementById("stationSearch");
const stationFilters = document.getElementById("stationFilters");
const locateBtn = document.getElementById("locateBtn");

/** @type {Array<{id:string,name:string,street:string,phone:string,lat:number,lng:number,fuels:string[],amenities:string[]}>} */
let stations = [];
let stationQuery = "";
let fuelFilter = "all";
let selectedStationId = null;
/** @type {{lat:number,lng:number}|null} */
let userLoc = null;
let stationMap = null;
let mapReady = false;
let mapBooted = false;
let userMovedMap = false;
let ignorePopupClose = false;
let fitTimer = 0;
/** @type {Map<string, any>} */
const markerById = new Map();
let userMarker = null;
let stationPopup = null;
let stationStatusMode = "message";
let stationStatusKey = "map.loading";
let stationStatusError = false;
let fallbackKey = null;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function motionDuration(ms) {
  return prefersReducedMotion() ? 0 : ms;
}

function stationLang() {
  return getLang() === "zh" ? "zh" : "en";
}

function stationsCacheKey(lang) {
  return `stations_cache_v2_${lang}`;
}

function fuelKey(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("platinum") || n.includes("白金")) return "platinum";
  if (n.includes("gold") || n.includes("黃金")) return "gold";
  if (n.includes("diesel") || n.includes("柴油")) return "diesel";
  if (n.includes("autogas") || n.includes("石油氣") || n.includes("gas")) {
    return "autogas";
  }
  return "other";
}

function isEvAmenity(name) {
  const n = String(name || "");
  return /ev/i.test(n) || n.includes("電動");
}

function fuelLabelShort(name) {
  const key = fuelKey(name);
  if (key === "platinum") return t("fuel.map.platinum");
  if (key === "gold") return t("fuel.map.gold");
  if (key === "diesel") return t("fuel.map.diesel");
  if (key === "autogas") return t("fuel.map.autogas");
  return String(name || "").trim();
}

function normalizeStations(data) {
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const row of data) {
    const lat = Number(row?.latitude);
    const lng = Number(row?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      id: String(row?.id || row?.siteId || row?.name || out.length),
      name: String(row?.name || "Station").trim(),
      street: String(row?.street || "").trim(),
      phone: String(row?.phoneNumber || "").trim(),
      lat,
      lng,
      fuels: Array.isArray(row?.fuelsName)
        ? row.fuelsName.map((item) => String(item).trim()).filter(Boolean)
        : [],
      amenities: Array.isArray(row?.amenitiesName)
        ? row.amenitiesName.map((item) => String(item).trim()).filter(Boolean)
        : [],
    });
  }
  return out;
}

function readStationsCache(lang) {
  try {
    const raw = localStorage.getItem(stationsCacheKey(lang));
    if (!raw) return [];
    return normalizeStations(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeStationsCache(data, lang) {
  try {
    localStorage.setItem(stationsCacheKey(lang), JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const sLat = Math.sin(dLat / 2);
  const sLng = Math.sin(dLng / 2);
  const a =
    sLat * sLat +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      sLng *
      sLng;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

function formatDistance(km) {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function stationDistance(station) {
  if (!userLoc) return NaN;
  return haversineKm(userLoc.lat, userLoc.lng, station.lat, station.lng);
}

function stationMatches(station) {
  const q = stationQuery.trim().toLowerCase();
  if (q) {
    const blob =
      `${station.name} ${station.street} ${station.phone}`.toLowerCase();
    if (!blob.includes(q)) return false;
  }
  if (fuelFilter === "ev") {
    return station.amenities.some((item) => isEvAmenity(item));
  }
  if (fuelFilter !== "all") {
    return station.fuels.some((item) => fuelKey(item) === fuelFilter);
  }
  return true;
}

function visibleStations() {
  const list = stations.filter(stationMatches);
  if (!userLoc) return list;
  return list.sort((a, b) => stationDistance(a) - stationDistance(b));
}

function setStationStatus(text, isError = false) {
  stationStatus.textContent = text;
  stationStatus.dataset.state = isError ? "error" : "";
}

function showStationMessage(key, isError = false) {
  stationStatusMode = "message";
  stationStatusKey = key;
  stationStatusError = isError;
  setStationStatus(t(key), isError);
}

function showListStatus(shown) {
  stationStatusMode = "list";
  if (!stations.length) {
    stationStatusKey = "map.noStations";
    stationStatusError = true;
    setStationStatus(t("map.noStations"), true);
    return;
  }
  stationStatusError = false;
  if (!shown) {
    stationStatusKey = "map.noMatches";
    setStationStatus(t("map.noMatches"), false);
    return;
  }
  if (shown === stations.length) {
    stationStatusKey = shown === 1 ? "map.stationCountOne" : "map.stationCount";
    setStationStatus(
      shown === 1
        ? t("map.stationCountOne")
        : t("map.stationCount", { n: shown }),
      false,
    );
    return;
  }
  stationStatusKey = "map.stationSubset";
  setStationStatus(
    t("map.stationSubset", { shown, total: stations.length }),
    false,
  );
}

function telHref(phone) {
  const compact = String(phone || "").replace(/[^\d+]/g, "");
  return compact ? `tel:${compact}` : "";
}

function mapDirectionLinks(station) {
  const lat = station.lat;
  const lng = station.lng;
  const name = String(station.name || "").trim();
  const label = name ? `Caltex ${name}` : "";
  const encoded = encodeURIComponent(label);
  const apple =
    `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d` +
    (label ? `&q=${encoded}` : "");
  const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  let amap = `iosamap://path?sourceApplication=MikeBilliOS&dlat=${lat}&dlon=${lng}`;
  if (label) amap += `&dname=${encoded}`;
  amap += "&dev=1&t=0";
  return { apple, google, amap, label };
}

let navReturnFocus = null;

function openNav(station, trigger) {
  trackEvent("open_navigation");
  const links = mapDirectionLinks(station);
  navApple.href = links.apple;
  navGoogle.href = links.google;
  navAmap.href = links.amap;
  navSub.textContent = links.label || station.name;
  navReturnFocus = trigger || null;
  navBackdrop.hidden = false;
  navBackdrop.classList.add("is-open");
  document.body.classList.add("sheet-open");
  navApple.focus();
}

export function closeNav() {
  if (navBackdrop.hidden) return;
  navBackdrop.classList.remove("is-open");
  navBackdrop.hidden = true;
  if (!isChartOpen()) document.body.classList.remove("sheet-open");
  const back = navReturnFocus;
  navReturnFocus = null;
  if (back && typeof back.focus === "function") back.focus();
}

function appendChip(parent, label, key) {
  const chip = document.createElement("span");
  chip.className = "fuel-chip";
  chip.dataset.fuel = key;
  chip.textContent = label;
  parent.appendChild(chip);
}

function showMapFallback(key) {
  fallbackKey = key;
  mapFallback.hidden = false;
  mapFallback.textContent = t(key);
}

function hideMapFallback() {
  fallbackKey = null;
  mapFallback.hidden = true;
}

function syncMarkerVisibility() {
  const visible = new Set(visibleStations().map((station) => station.id));
  for (const [id, marker] of markerById) {
    marker.getElement().hidden = !visible.has(id);
  }
}

function syncMarkerSelection() {
  for (const [id, marker] of markerById) {
    const el = marker.getElement();
    const on = id === selectedStationId;
    el.classList.toggle("is-selected", on);
    el.style.zIndex = on ? "3" : "1";
  }
}

function syncListSelection(scroll) {
  stationScroll.querySelectorAll(".station-row").forEach((row) => {
    const on = row.dataset.id === selectedStationId;
    row.classList.toggle("is-selected", on);
    const btn = row.querySelector(".station-open");
    if (btn) btn.setAttribute("aria-pressed", String(on));
    if (on && scroll) row.scrollIntoView({ block: "nearest" });
  });
}

function closePopup(silent) {
  if (!stationPopup) return;
  ignorePopupClose = silent;
  stationPopup.remove();
  ignorePopupClose = false;
}

function showPopup(station) {
  if (!stationMap || !mapReady || !window.maplibregl) return;
  const root = document.createElement("div");
  const name = document.createElement("strong");
  name.className = "popup-name";
  name.textContent = station.name;
  const street = document.createElement("span");
  street.className = "popup-street";
  street.textContent = station.street || t("map.hongKong");
  root.append(name, street);
  const href = telHref(station.phone);
  if (href) {
    const phone = document.createElement("a");
    phone.className = "popup-phone";
    phone.href = href;
    phone.textContent = station.phone;
    root.appendChild(phone);
  }
  if (!stationPopup) {
    stationPopup = new maplibregl.Popup({
      offset: 18,
      closeButton: false,
      closeOnClick: true,
      className: "station-popup",
      maxWidth: "240px",
    });
    stationPopup.on("close", () => {
      if (ignorePopupClose) return;
      selectedStationId = null;
      syncMarkerSelection();
      syncListSelection(false);
    });
  }
  stationPopup
    .setLngLat([station.lng, station.lat])
    .setDOMContent(root)
    .addTo(stationMap);
}

function fitVisible() {
  if (!stationMap || !mapReady || userMovedMap || !window.maplibregl) return;
  const list = visibleStations();
  if (!list.length) return;
  if (list.length === 1) {
    stationMap.flyTo({
      center: [list[0].lng, list[0].lat],
      zoom: 14,
      duration: motionDuration(600),
      essential: true,
    });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  list.forEach((station) => bounds.extend([station.lng, station.lat]));
  stationMap.fitBounds(bounds, {
    padding: { top: 36, right: 32, bottom: 40, left: 32 },
    duration: motionDuration(600),
    maxZoom: 13,
  });
}

function scheduleFit() {
  window.clearTimeout(fitTimer);
  fitTimer = window.setTimeout(fitVisible, 220);
}

function placeUserMarker() {
  if (!stationMap || !mapReady || !userLoc || !window.maplibregl) return;
  if (!userMarker) {
    const el = document.createElement("div");
    el.className = "user-dot";
    el.title = t("map.you");
    userMarker = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([userLoc.lng, userLoc.lat])
      .addTo(stationMap);
    return;
  }
  userMarker.setLngLat([userLoc.lng, userLoc.lat]);
}

function placeMarkers() {
  if (!stationMap || !mapReady || !window.maplibregl) return;
  const seen = new Set();
  for (const station of stations) {
    seen.add(station.id);
    if (markerById.has(station.id)) continue;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "station-pin";
    el.dataset.id = station.id;
    el.setAttribute("aria-label", station.name);
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      selectStation(station.id, { fly: false, scroll: true });
    });
    const marker = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([station.lng, station.lat])
      .addTo(stationMap);
    markerById.set(station.id, marker);
  }
  for (const [id, marker] of markerById) {
    if (seen.has(id)) continue;
    marker.remove();
    markerById.delete(id);
  }
  syncMarkerVisibility();
  syncMarkerSelection();
}

function renderStationList(options = {}) {
  const list = visibleStations();
  if (
    selectedStationId &&
    !list.some((station) => station.id === selectedStationId)
  ) {
    selectedStationId = null;
    closePopup(true);
    syncMarkerSelection();
  }

  stationScroll.replaceChildren();
  if (!list.length) {
    const item = document.createElement("li");
    item.className = "station-empty";
    const msg = document.createElement("p");
    msg.textContent = stations.length
      ? t("map.emptySearch")
      : t("map.emptyList");
    item.appendChild(msg);
    if (!stations.length) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "station-retry";
      retry.textContent = t("map.retry");
      retry.addEventListener("click", () => {
        reloadStations();
      });
      item.appendChild(retry);
    }
    stationScroll.appendChild(item);
    if (!options.keepStatus) showListStatus(0);
    syncMarkerVisibility();
    return;
  }

  for (const station of list) {
    const row = document.createElement("li");
    row.className = "station-row";
    row.dataset.id = station.id;
    if (station.id === selectedStationId) row.classList.add("is-selected");

    const open = document.createElement("button");
    open.type = "button";
    open.className = "station-open";
    open.dataset.id = station.id;
    open.setAttribute(
      "aria-pressed",
      String(station.id === selectedStationId),
    );

    const nameRow = document.createElement("span");
    nameRow.className = "station-name-row";
    const name = document.createElement("span");
    name.className = "station-name";
    name.textContent = station.name;
    nameRow.appendChild(name);
    const km = stationDistance(station);
    if (Number.isFinite(km)) {
      const dist = document.createElement("span");
      dist.className = "station-dist";
      dist.textContent = formatDistance(km);
      nameRow.appendChild(dist);
    }

    const street = document.createElement("span");
    street.className = "station-street";
    street.textContent = station.street || t("map.hongKong");

    const chips = document.createElement("span");
    chips.className = "station-chips";
    const seen = new Set();
    for (const fuel of station.fuels) {
      const label = fuelLabelShort(fuel);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      appendChip(chips, label, fuelKey(fuel));
    }
    if (station.amenities.some((item) => isEvAmenity(item))) {
      appendChip(chips, t("fuel.map.ev"), "ev");
    }

    open.append(nameRow, street, chips);
    row.appendChild(open);

    const nav = document.createElement("button");
    nav.type = "button";
    nav.className = "station-nav";
    nav.textContent = t("map.navigate");
    nav.setAttribute("aria-label", t("map.navigateTo", { name: station.name }));
    nav.addEventListener("click", () => {
      openNav(station, nav);
    });
    row.appendChild(nav);
    stationScroll.appendChild(row);
  }

  if (!options.keepStatus) showListStatus(list.length);
  syncMarkerVisibility();
}

function selectStation(id, opts = {}) {
  const station = stations.find((item) => item.id === id);
  if (!station) return;
  window.clearTimeout(fitTimer);
  selectedStationId = id;
  userMovedMap = true;
  syncMarkerSelection();
  syncListSelection(Boolean(opts.scroll));
  if (opts.fly && stationMap && mapReady) {
    stationMap.flyTo({
      center: [station.lng, station.lat],
      zoom: Math.max(stationMap.getZoom(), 14.2),
      duration: motionDuration(700),
      essential: true,
    });
  }
  showPopup(station);
}

async function loadLocalStations(lang) {
  try {
    const response = await fetch(STATIONS_LOCAL[lang], { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return normalizeStations(await response.json());
  } catch {
    return [];
  }
}

async function loadLiveStations(lang) {
  try {
    const response = await fetch(STATIONS_LIVE[lang], {
      headers: { accept: "application/json, text/plain, */*" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const next = normalizeStations(data);
    if (next.length) writeStationsCache(data, lang);
    return next;
  } catch {
    /* Caltex does not send CORS headers, so the bundled list is used. */
    return [];
  }
}

let stationsRequest = 0;

function publishStations(next, { refit }) {
  stations = next;
  renderStationList();
  placeMarkers();
  placeUserMarker();
  if (refit) {
    userMovedMap = false;
    fitVisible();
  }
  const selected = stations.find((station) => station.id === selectedStationId);
  if (selected && stationPopup) showPopup(selected);
  else if (!selected && selectedStationId) {
    selectedStationId = null;
    closePopup(true);
  }
}

async function loadStationsForCurrentLang({ refit = false } = {}) {
  const token = ++stationsRequest;
  const lang = stationLang();
  showStationMessage("map.loading");
  const localPromise = loadLocalStations(lang);
  const livePromise = loadLiveStations(lang);
  const local = await localPromise;
  if (token !== stationsRequest) return;
  if (local.length) publishStations(local, { refit });
  else {
    const cached = readStationsCache(lang);
    if (token !== stationsRequest) return;
    if (cached.length) publishStations(cached, { refit });
  }
  const live = await livePromise;
  if (token !== stationsRequest) return;
  if (live.length) {
    publishStations(live, { refit });
    return;
  }
  if (!stations.length) renderStationList();
}

function reloadStations() {
  return loadStationsForCurrentLang({ refit: true });
}

function ensureMapLibre() {
  if (window.maplibregl) return Promise.resolve();
  if (!document.querySelector("link[data-maplibre]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MAPLIBRE_CSS;
    link.dataset.maplibre = "1";
    document.head.appendChild(link);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MAPLIBRE_JS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("maplibre"));
    document.head.appendChild(script);
  });
}

function createMap() {
  if (stationMap || !window.maplibregl) return;
  stationMap = new maplibregl.Map({
    container: stationMapEl,
    style: MAP_STYLE_URL,
    center: [114.15, 22.34],
    zoom: 10.2,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxBounds: [
      [113.75, 22.08],
      [114.5, 22.62],
    ],
  });
  stationMap.addControl(
    new maplibregl.AttributionControl({ compact: true }),
    "bottom-right",
  );
  stationMap
    .getContainer()
    .querySelector(".maplibregl-ctrl-attrib")
    ?.classList.remove("maplibregl-compact-show");
  stationMap.on("load", () => {
    mapReady = true;
    hideMapFallback();
    placeMarkers();
    placeUserMarker();
    fitVisible();
    stationMap.resize();
    stationMap
      .getContainer()
      .querySelector(".maplibregl-ctrl-attrib")
      ?.classList.remove("maplibregl-compact-show");
  });
  stationMap.on("dragstart", () => {
    userMovedMap = true;
  });
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      if (document.body.dataset.tab === "map") stationMap.resize();
    }).observe(viewMap);
  }
}

async function bootMap() {
  showMapFallback("map.loadingMap");
  await new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  const stationsPromise = loadStationsForCurrentLang({ refit: true });
  const mapOk = await ensureMapLibre()
    .then(() => true)
    .catch(() => false);
  if (!mapOk || !window.maplibregl) {
    showMapFallback("map.mapFailed");
  } else {
    createMap();
  }
  await stationsPromise;
  window.setTimeout(() => {
    if (!mapReady && mapOk) {
      showMapFallback("map.mapSlow");
    }
  }, 12000);
}

export function openMapPage() {
  if (!mapBooted) {
    mapBooted = true;
    bootMap();
    return;
  }
  if (stationMap) {
    stationMap.resize();
    window.setTimeout(() => {
      if (stationMap) stationMap.resize();
    }, 60);
  }
}
function locateUser() {
  if (!navigator.geolocation) {
    showStationMessage("map.locUnavailable", true);
    return;
  }
  locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locateBtn.disabled = false;
      userLoc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      locateBtn.classList.add("is-on");
      locateBtn.setAttribute("aria-pressed", "true");
      window.clearTimeout(fitTimer);
      userMovedMap = true;
      renderStationList();
      placeUserMarker();
      if (stationMap && mapReady) {
        stationMap.flyTo({
          center: [userLoc.lng, userLoc.lat],
          zoom: 13,
          duration: motionDuration(700),
          essential: true,
        });
      }
    },
    () => {
      locateBtn.disabled = false;
      showStationMessage("map.locFailed", true);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
  );
}

export function isNavOpen() {
  return !navBackdrop.hidden;
}

export function resizeMap() {
  if (stationMap) stationMap.resize();
}

onLangChange(() => {
  if (fallbackKey) showMapFallback(fallbackKey);
  if (userMarker) {
    const el = userMarker.getElement?.();
    if (el) el.title = t("map.you");
  }
  if (mapBooted) loadStationsForCurrentLang();
});

export function initMap() {
  stationFilters.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-filter]");
    if (!btn || btn.dataset.filter === fuelFilter) return;
    fuelFilter = btn.dataset.filter;
    stationFilters.querySelectorAll("button[data-filter]").forEach((el) => {
      el.setAttribute("aria-pressed", String(el === btn));
    });
    userMovedMap = false;
    renderStationList();
    fitVisible();
    trackEvent("filter_stations", { filter: fuelFilter });
  });
  stationSearch.addEventListener("input", () => {
    stationQuery = stationSearch.value;
    userMovedMap = false;
    renderStationList();
    scheduleFit();
  });
  locateBtn.addEventListener("click", () => {
    trackEvent("locate_station");
    locateUser();
  });
  navClose.addEventListener("click", closeNav);
  navCancel.addEventListener("click", closeNav);
  navBackdrop.addEventListener("click", (event) => {
    if (event.target === navBackdrop) closeNav();
  });
  for (const [app, link] of [
    ["apple", navApple],
    ["google", navGoogle],
    ["amap", navAmap],
  ]) {
    link.addEventListener("click", () => {
      trackEvent("choose_navigation", { app });
      window.setTimeout(closeNav, 0);
    });
  }
  stationScroll.addEventListener("click", (event) => {
    const btn = event.target.closest(".station-open");
    if (!btn) return;
    trackEvent("select_station");
    selectStation(btn.dataset.id, { fly: true, scroll: false });
  });
}
