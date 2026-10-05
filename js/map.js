import { isChartOpen } from "./prices.js";

const STATIONS_LIVE_URL =
  "https://www.caltex.com/bin/services/getStations.json?pagePath=/hk/en/find-us&siteType=b2c";
const STATIONS_LOCAL_URL = "data/stations.json";
const STATIONS_CACHE_KEY = "stations_cache_v1";
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

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function motionDuration(ms) {
  return prefersReducedMotion() ? 0 : ms;
}

function fuelKey(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("platinum")) return "platinum";
  if (n.includes("gold")) return "gold";
  if (n.includes("diesel")) return "diesel";
  if (n.includes("gas")) return "autogas";
  return "other";
}

function fuelLabelShort(name) {
  const key = fuelKey(name);
  if (key === "platinum") return "Platinum";
  if (key === "gold") return "Gold";
  if (key === "diesel") return "Diesel";
  if (key === "autogas") return "AutoGas";
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
        ? row.fuelsName.map((item) => String(item))
        : [],
      amenities: Array.isArray(row?.amenitiesName)
        ? row.amenitiesName.map((item) => String(item))
        : [],
    });
  }
  return out;
}

function readStationsCache() {
  try {
    const raw = localStorage.getItem(STATIONS_CACHE_KEY);
    if (!raw) return [];
    return normalizeStations(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeStationsCache(data) {
  try {
    localStorage.setItem(STATIONS_CACHE_KEY, JSON.stringify(data));
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
    return station.amenities.some((item) => /ev/i.test(item));
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

function statusForList(shown) {
  if (!stations.length) return "Couldn’t load stations";
  if (!shown) return "No matches";
  if (shown === stations.length) return `${shown} stations`;
  return `${shown} of ${stations.length}`;
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

function showMapFallback(message) {
  mapFallback.hidden = false;
  mapFallback.textContent = message;
}

function hideMapFallback() {
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
  street.textContent = station.street || "Hong Kong";
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
    el.title = "You";
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

function renderStationList() {
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
      ? "No stations match your search."
      : "Couldn’t load the station list.";
    item.appendChild(msg);
    if (!stations.length) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "station-retry";
      retry.textContent = "Try again";
      retry.addEventListener("click", () => {
        reloadStations();
      });
      item.appendChild(retry);
    }
    stationScroll.appendChild(item);
    setStationStatus(statusForList(0), !stations.length);
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
    street.textContent = station.street || "Hong Kong";

    const chips = document.createElement("span");
    chips.className = "station-chips";
    const seen = new Set();
    for (const fuel of station.fuels) {
      const label = fuelLabelShort(fuel);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      appendChip(chips, label, fuelKey(fuel));
    }
    if (station.amenities.some((item) => /ev/i.test(item))) {
      appendChip(chips, "EV", "ev");
    }

    open.append(nameRow, street, chips);
    row.appendChild(open);

    const nav = document.createElement("button");
    nav.type = "button";
    nav.className = "station-nav";
    nav.textContent = "Navigate";
    nav.setAttribute("aria-label", `Navigate to ${station.name}`);
    nav.addEventListener("click", () => {
      openNav(station, nav);
    });
    row.appendChild(nav);
    stationScroll.appendChild(row);
  }

  setStationStatus(statusForList(list.length));
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

async function loadLocalStations() {
  try {
    const response = await fetch(STATIONS_LOCAL_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return normalizeStations(await response.json());
  } catch {
    return [];
  }
}

async function loadLiveStations() {
  try {
    const response = await fetch(STATIONS_LIVE_URL, {
      headers: { accept: "application/json, text/plain, */*" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const next = normalizeStations(data);
    if (next.length) writeStationsCache(data);
    return next;
  } catch {
    /* Caltex does not send CORS headers, so the bundled list is used. */
    return [];
  }
}

async function reloadStations() {
  setStationStatus("Loading stations…");
  const local = await loadLocalStations();
  const live = await loadLiveStations();
  stations = live.length ? live : local.length ? local : readStationsCache();
  userMovedMap = false;
  renderStationList();
  placeMarkers();
  placeUserMarker();
  fitVisible();
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
  setStationStatus("Loading stations…");
  showMapFallback("Loading map…");
  await new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  const localPromise = loadLocalStations();
  const livePromise = loadLiveStations();
  const mapPromise = ensureMapLibre()
    .then(() => true)
    .catch(() => false);
  const local = await localPromise;
  if (local.length) {
    stations = local;
    renderStationList();
  } else {
    const cached = readStationsCache();
    if (cached.length) {
      stations = cached;
      renderStationList();
    }
  }
  const mapOk = await mapPromise;
  if (!mapOk || !window.maplibregl) {
    showMapFallback(
      "Map couldn’t load. The station list is still available.",
    );
  } else {
    createMap();
  }
  const live = await livePromise;
  if (live.length) {
    stations = live;
    renderStationList();
    placeMarkers();
    placeUserMarker();
    fitVisible();
  } else if (!stations.length) {
    renderStationList();
  }
  window.setTimeout(() => {
    if (!mapReady && mapOk) {
      showMapFallback(
        "Map is taking a while. The station list is ready below.",
      );
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
    setStationStatus("Location isn’t available on this device", true);
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
      setStationStatus("Couldn’t use your location", true);
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
  });
  stationSearch.addEventListener("input", () => {
    stationQuery = stationSearch.value;
    userMovedMap = false;
    renderStationList();
    scheduleFit();
  });
  locateBtn.addEventListener("click", locateUser);
  navClose.addEventListener("click", closeNav);
  navCancel.addEventListener("click", closeNav);
  navBackdrop.addEventListener("click", (event) => {
    if (event.target === navBackdrop) closeNav();
  });
  for (const link of [navApple, navGoogle, navAmap]) {
    link.addEventListener("click", () => {
      window.setTimeout(closeNav, 0);
    });
  }
  stationScroll.addEventListener("click", (event) => {
    const btn = event.target.closest(".station-open");
    if (!btn) return;
    selectStation(btn.dataset.id, { fly: true, scroll: false });
  });
}
