import { trackEvent } from "./analytics.js";
import { localeTag, onLangChange, t } from "./i18n.js";

const PRICE_URL = "data/oilprice.json";
const HISTORY_URL = "data/price-history.json";
const DEFAULTS_URL = "defaults.json";
const CACHE_KEY = "price_cache";
const CACHE_TIME_KEY = "price_cache_time";
const HISTORY_CACHE_KEY = "price_history_cache";
const CHART_METRIC_KEY = "chart_metric";
const SELECTED_FUEL_KEY = "selected_fuel";
const SELECTED_COUPONS_KEY = "selected_coupons";
const CHART_CHANGES = 7;
const COUPON_COUNTS = [1, 2, 3, 4, 5];
const ENERGY_KEYS = {
  "Standard Petrol": "starcard_discount_gold",
  "Premium Petrol": "starcard_discount_platinum",
};
/** One-time: blank discounts were saved as 0. Drop those so defaults apply. */
const STARCARD_BLANK_ZERO_MIGRATE_KEY = "starcard_blank_zero_migrated_v1";
const LEGACY_ENERGY_KEYS = {
  "Standard Petrol": "energy_discount_regular",
  "Premium Petrol": "energy_discount_premium",
};
/** Fallback until defaults.json loads; Gold = 11, Platinum = 12. */
let DEFAULT_ENERGY = {
  "Standard Petrol": 11,
  "Premium Petrol": 12,
};
const COMPANY = "Caltex";
const FUEL_TYPES = ["Standard Petrol", "Premium Petrol"];
const COUPON_VALUE = 300;
const REBATE_PER_COUPON = 50;
const updatedEl = document.getElementById("updated");
const offlinePill = document.getElementById("offlinePill");
const priceWarning = document.getElementById("priceWarning");
const fuelToggle = document.getElementById("fuelToggle");
const energyDiscountEl = document.getElementById("energyDiscount");
const energyHint = document.getElementById("energyHint");
const couponGrid = document.getElementById("couponGrid");
const boardPriceDisplay = document.getElementById("boardPriceDisplay");
const boardEdit = document.getElementById("boardEdit");
const boardPriceInput = document.getElementById("boardPriceInput");
const couponSummary = document.getElementById("couponSummary");
const resultCard = document.getElementById("resultCard");
const netPaymentEl = document.getElementById("netPayment");
const realPriceEl = document.getElementById("realPrice");
const litresEl = document.getElementById("litres");
const youSaveEl = document.getElementById("youSave");
const priceChangeBtn = document.getElementById("priceChangeBtn");
const priceChangeIcon = document.getElementById("priceChangeIcon");
const priceChangeFrom = document.getElementById("priceChangeFrom");
const priceChangeTo = document.getElementById("priceChangeTo");
const priceChangeDelta = document.getElementById("priceChangeDelta");
const priceChangeDate = document.getElementById("priceChangeDate");
const chartBackdrop = document.getElementById("chartBackdrop");
const chartTitle = document.getElementById("chartTitle");
const chartSub = document.getElementById("chartSub");
const priceChart = document.getElementById("priceChart");
const changeList = document.getElementById("changeList");
const chartClose = document.getElementById("chartClose");
const chartMetricToggle = document.getElementById("chartMetricToggle");

/** @type {Record<string, Record<string, number>>} */
let prices = {};
/** @type {Record<string, Array<{date: string, price: number}>>} */
let priceHistory = {
  "Standard Petrol": [],
  "Premium Petrol": [],
};
let selectedFuel = readSelectedFuel();
let selectedCoupons = readSelectedCoupons();
let boardPrice = NaN;
let manualBoardMode = false;
let lastResultSignature = "";
let chartOpen = false;
let lastFocus = null;
let chartMetric = readChartMetric();
let priceNotice = { state: "loading", key: "prices.loading", vars: null };
function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculate(params) {
  const board = Number(params.boardPrice);
  const energyDiscount = Number(params.energyDiscount);
  const couponCount = Number(params.couponCount);
  const couponValue = Number(params.couponValue ?? COUPON_VALUE);
  const rebatePerCoupon = Number(
    params.rebatePerCoupon ?? REBATE_PER_COUPON,
  );

  // Per spreadsheet (平油):
  // litres = (300 + 50) * n / boardPrice
  // netPayment = 300 * n - energyDiscount * (300 * n / boardPrice)
  // realPrice = netPayment / litres
  // actualDiscount/L = boardPrice - realPrice
  const totalSpend = couponCount * couponValue;
  const totalRebate = couponCount * rebatePerCoupon;
  const fuelCredit = totalSpend + totalRebate; // 300n + 50n
  const effectivePrice = board - energyDiscount;
  const litresObtained = board > 0 ? fuelCredit / board : NaN;
  const paidLitresAtBoard = board > 0 ? totalSpend / board : NaN;
  const netPayment = Number.isFinite(paidLitresAtBoard)
    ? totalSpend - energyDiscount * paidLitresAtBoard
    : NaN;
  const realPricePerLitre =
    litresObtained > 0 ? netPayment / litresObtained : NaN;
  const actualDiscount = board - realPricePerLitre;

  return {
    boardPrice: round2(board),
    energyDiscount: round2(energyDiscount),
    couponCount: round2(couponCount),
    couponValue: round2(couponValue),
    rebatePerCoupon: round2(rebatePerCoupon),
    totalSpend: round2(totalSpend),
    totalRebate: round2(totalRebate),
    effectivePrice: round2(effectivePrice),
    litresObtained: round2(litresObtained),
    netPayment: round2(netPayment),
    realPricePerLitre: round2(realPricePerLitre),
    actualDiscount: round2(actualDiscount),
  };
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString(localeTag(), {
      timeZone: "Asia/Hong_Kong",
    });
  } catch {
    return t("time.unknown");
  }
}

function money(value) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function signedMoney(value) {
  if (!Number.isFinite(value) || value === 0) return "$0.00";
  const abs = money(Math.abs(value));
  return value > 0 ? `+$${abs}` : `−$${abs}`;
}

function hkToday() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Hong_Kong",
  });
}

function formatShortDate(iso) {
  if (!iso) return "—";
  const date = new Date(`${iso}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(localeTag(), {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Hong_Kong",
  });
}

function formatAxisDate(iso) {
  const date = new Date(`${iso}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    timeZone: "Asia/Hong_Kong",
  });
  const month = date.toLocaleDateString("en-GB", {
    month: "numeric",
    timeZone: "Asia/Hong_Kong",
  });
  return `${day}/${month}`;
}

function fuelLabel(fuel = selectedFuel) {
  return t(fuel === "Premium Petrol" ? "fuel.platinum" : "fuel.gold");
}

function fuelTrackLabel(fuel = selectedFuel) {
  return fuel === "Premium Petrol" ? "Platinum" : "Gold";
}

function emptyHistory() {
  return { "Standard Petrol": [], "Premium Petrol": [] };
}

function parseHistory(data) {
  const out = emptyHistory();
  if (!data || typeof data !== "object") return out;
  for (const fuel of FUEL_TYPES) {
    const rows = Array.isArray(data[fuel]) ? data[fuel] : [];
    out[fuel] = rows
      .map((row) => ({
        date: String(row?.date ?? "").trim(),
        price: round2(Number(row?.price)),
      }))
      .filter((row) => row.date && Number.isFinite(row.price))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}

function readHistoryCache() {
  const raw = localStorage.getItem(HISTORY_CACHE_KEY);
  if (!raw) return null;
  try {
    return parseHistory(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeHistoryCache(data) {
  localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(data));
}

async function fetchHistory() {
  const response = await fetch(HISTORY_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseHistory(await response.json());
}

function readChartMetric() {
  try {
    return localStorage.getItem(CHART_METRIC_KEY) === "real"
      ? "real"
      : "board";
  } catch {
    return "board";
  }
}

function writeChartMetric(metric) {
  chartMetric = metric === "real" ? "real" : "board";
  try {
    localStorage.setItem(CHART_METRIC_KEY, chartMetric);
  } catch {
    /* ignore quota / private mode */
  }
}

function readSelectedFuel() {
  try {
    const saved = localStorage.getItem(SELECTED_FUEL_KEY);
    return FUEL_TYPES.includes(saved) ? saved : "Standard Petrol";
  } catch {
    return "Standard Petrol";
  }
}

function writeSelectedFuel(fuel) {
  selectedFuel = FUEL_TYPES.includes(fuel) ? fuel : "Standard Petrol";
  try {
    localStorage.setItem(SELECTED_FUEL_KEY, selectedFuel);
  } catch {
    /* ignore quota / private mode */
  }
}

function syncFuelToggle() {
  fuelToggle.querySelectorAll("button[data-fuel]").forEach((el) => {
    el.setAttribute(
      "aria-pressed",
      String(el.dataset.fuel === selectedFuel),
    );
  });
}

function readSelectedCoupons() {
  try {
    const saved = Number(localStorage.getItem(SELECTED_COUPONS_KEY));
    return COUPON_COUNTS.includes(saved) ? saved : 2;
  } catch {
    return 2;
  }
}

function writeSelectedCoupons(count) {
  const next = Number(count);
  selectedCoupons = COUPON_COUNTS.includes(next) ? next : 2;
  try {
    localStorage.setItem(SELECTED_COUPONS_KEY, String(selectedCoupons));
  } catch {
    /* ignore quota / private mode */
  }
}

function syncCouponGrid() {
  couponGrid.querySelectorAll("button[data-count]").forEach((el) => {
    el.setAttribute(
      "aria-pressed",
      String(Number(el.dataset.count) === selectedCoupons),
    );
  });
}

function boardSeriesForChart() {
  const series = [...(priceHistory[selectedFuel] || [])];
  const live = prices?.[COMPANY]?.[selectedFuel];
  if (Number.isFinite(live)) {
    const last = series[series.length - 1];
    if (!last || round2(last.price) !== round2(live)) {
      series.push({ date: hkToday(), price: round2(live) });
    }
  }
  return series.slice(-(CHART_CHANGES + 1));
}

function currentEnergyDiscount() {
  const raw = String(energyDiscountEl.value ?? "").trim();
  const value = Number(raw);
  if (raw !== "" && inStarCardRange(value)) return round2(value);
  return NaN;
}

function realPriceForBoard(board) {
  const result = calculate({
    boardPrice: board,
    energyDiscount: currentEnergyDiscount(),
    couponCount: selectedCoupons,
    couponValue: COUPON_VALUE,
    rebatePerCoupon: REBATE_PER_COUPON,
  });
  return result.realPricePerLitre;
}

function seriesForChart() {
  const board = boardSeriesForChart();
  if (chartMetric !== "real") return board;
  return board
    .map((row) => ({
      date: row.date,
      price: realPriceForBoard(row.price),
    }))
    .filter((row) => Number.isFinite(row.price));
}

function latestChange() {
  const series = seriesForChart();
  if (series.length < 2) return null;
  const prev = series[series.length - 2];
  const curr = series[series.length - 1];
  return {
    prev,
    curr,
    delta: round2(curr.price - prev.price),
  };
}

function dirClass(delta) {
  if (delta < 0) return "down";
  if (delta > 0) return "up";
  return "flat";
}

function svgEl(name, attrs = {}, text) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  if (text != null) el.textContent = text;
  return el;
}

function syncChartMetricToggle() {
  chartMetricToggle.querySelectorAll("button[data-metric]").forEach((el) => {
    el.setAttribute(
      "aria-pressed",
      String(el.dataset.metric === chartMetric),
    );
  });
}

function changeCountText(changeCount) {
  if (changeCount === 0) return t("chart.noChanges");
  if (changeCount === 1) return t("chart.changeOne");
  return t("chart.changes", { n: changeCount });
}

function renderChartSheet() {
  const points = seriesForChart();
  const metricLabel =
    chartMetric === "real" ? t("chart.realLower") : t("chart.boardLower");
  chartTitle.textContent = t("chart.heading", {
    fuel: fuelLabel(),
    metric: metricLabel,
  });
  const changeCount = Math.max(0, points.length - 1);
  const countText = changeCountText(changeCount);
  chartSub.textContent =
    chartMetric === "real"
      ? t("chart.withDiscount", {
          count: countText,
          amount: money(currentEnergyDiscount()),
        })
      : countText;

  priceChart.replaceChildren();
  changeList.replaceChildren();
  if (points.length === 0) return;

  const w = 320;
  const h = 188;
  const pad = { t: 18, r: 14, b: 36, l: 40 };
  const values = points.map((point) => point.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 0.4;
  const yMin = min - span * 0.18;
  const yMax = max + span * 0.18;
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const xAt = (i) =>
    pad.l +
    (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (price) =>
    pad.t + (1 - (price - yMin) / (yMax - yMin)) * innerH;

  for (const tick of [min, max]) {
    const y = yAt(tick);
    priceChart.appendChild(
      svgEl("line", {
        x1: pad.l,
        x2: w - pad.r,
        y1: y,
        y2: y,
        stroke: "rgba(255,255,255,0.08)",
        "stroke-width": 1,
      }),
    );
    priceChart.appendChild(
      svgEl(
        "text",
        {
          x: pad.l - 6,
          y: y + 3,
          fill: "#888888",
          "font-size": 9,
          "text-anchor": "end",
          "font-family": "-apple-system, sans-serif",
        },
        tick.toFixed(2),
      ),
    );
  }

  for (let i = 1; i < points.length; i += 1) {
    const up = points[i].price > points[i - 1].price;
    const down = points[i].price < points[i - 1].price;
    const color = down ? "#4ade80" : up ? "#ff6b4a" : "#888888";
    priceChart.appendChild(
      svgEl("line", {
        x1: xAt(i - 1),
        y1: yAt(points[i - 1].price),
        x2: xAt(i),
        y2: yAt(points[i].price),
        stroke: color,
        "stroke-width": 2.4,
        "stroke-linecap": "round",
      }),
    );
  }

  points.forEach((point, i) => {
    const prev = points[i - 1];
    const color =
      i === 0
        ? "#ffffff"
        : point.price < prev.price
          ? "#4ade80"
          : point.price > prev.price
            ? "#ff6b4a"
            : "#ffffff";
    priceChart.appendChild(
      svgEl("circle", {
        cx: xAt(i),
        cy: yAt(point.price),
        r: i === points.length - 1 ? 4.2 : 3.2,
        fill: color,
        stroke: "#141414",
        "stroke-width": 1.5,
      }),
    );
    priceChart.appendChild(
      svgEl(
        "text",
        {
          x: xAt(i),
          y: h - 12,
          fill: "#888888",
          "font-size": 9,
          "text-anchor": "middle",
          "font-family": "-apple-system, sans-serif",
        },
        formatAxisDate(point.date),
      ),
    );
  });

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const delta = round2(curr.price - prev.price);
    const dir = dirClass(delta);
    const li = document.createElement("li");
    const when = document.createElement("span");
    when.className = "when";
    when.textContent = formatShortDate(curr.date);
    const path = document.createElement("span");
    path.className = "path";
    path.textContent = `$${money(prev.price)} → $${money(curr.price)}`;
    const deltaEl = document.createElement("span");
    deltaEl.className = `delta ${dir}`;
    deltaEl.textContent = signedMoney(delta);
    li.append(when, path, deltaEl);
    changeList.appendChild(li);
  }
}

function renderPriceChange() {
  const change = manualBoardMode ? null : latestChange();
  if (!change) {
    priceChangeBtn.hidden = true;
    priceChangeBtn.setAttribute("aria-expanded", "false");
    return;
  }
  const dir = dirClass(change.delta);
  priceChangeBtn.hidden = false;
  priceChangeBtn.dataset.dir = dir;
  priceChangeIcon.textContent = dir === "down" ? "▼" : "▲";
  priceChangeFrom.textContent = `$${money(change.prev.price)}`;
  priceChangeTo.textContent = `$${money(change.curr.price)}`;
  priceChangeDelta.textContent = signedMoney(change.delta);
  priceChangeDate.textContent = formatShortDate(change.curr.date);
  const verb =
    dir === "down"
      ? t("chart.decreased")
      : dir === "up"
        ? t("chart.increased")
        : t("chart.unchanged");
  const kind = chartMetric === "real" ? t("chart.real") : t("chart.board");
  priceChangeBtn.setAttribute(
    "aria-label",
    t("chart.changeAria", {
      kind,
      verb,
      from: money(change.prev.price),
      to: money(change.curr.price),
      date: formatShortDate(change.curr.date),
    }),
  );
}

function openChart() {
  if (priceChangeBtn.hidden) return;
  lastFocus = document.activeElement;
  chartOpen = true;
  syncChartMetricToggle();
  renderChartSheet();
  chartBackdrop.hidden = false;
  chartBackdrop.classList.add("is-open");
  priceChangeBtn.setAttribute("aria-expanded", "true");
  document.body.classList.add("sheet-open");
  trackEvent("open_price_chart", {
    grade: fuelTrackLabel(),
    metric: chartMetric,
  });
  chartClose.focus();
}

export function closeChart() {
  if (!chartOpen) return;
  chartOpen = false;
  chartBackdrop.classList.remove("is-open");
  chartBackdrop.hidden = true;
  priceChangeBtn.setAttribute("aria-expanded", "false");
  document.body.classList.remove("sheet-open");
  syncPageScrollLock();
  if (lastFocus && typeof lastFocus.focus === "function") {
    lastFocus.focus();
  }
}

function setTextWithFlip(el, next) {
  if (el.textContent === next) return;
  el.textContent = next;
  el.classList.remove("is-updating");
  void el.offsetWidth;
  el.classList.add("is-updating");
}

function setUpdated(state, text) {
  updatedEl.dataset.state = state;
  updatedEl.textContent = text;
}

function priceNoticeVars() {
  const vars = priceNotice.vars;
  if (!vars || typeof vars.time !== "number") return vars;
  return { ...vars, time: formatTime(vars.time) };
}

function showPriceNotice(state, key, vars = null) {
  priceNotice = { state, key, vars };
  setUpdated(state, t(key, priceNoticeVars()));
}

function setManualBoardMode(enabled) {
  manualBoardMode = enabled;
  priceWarning.classList.toggle("is-visible", enabled);
  boardEdit.classList.toggle("is-visible", enabled);
  boardPriceDisplay.classList.toggle("is-hidden", enabled);
  if (enabled && Number.isFinite(boardPrice) && boardPrice > 0) {
    boardPriceInput.value = String(boardPrice);
  }
}

export function updateOnlineUi() {
  offlinePill.classList.toggle("is-visible", !navigator.onLine);
}

export function syncPageScrollLock() {
  const calcView = document.getElementById("viewCalc");
  if (!calcView) return;
  calcView.classList.toggle("is-locked", chartOpen);
}
function defaultEnergyFor(fuel = selectedFuel) {
  return DEFAULT_ENERGY[fuel] ?? DEFAULT_ENERGY["Standard Petrol"] ?? 11;
}

async function loadDefaults() {
  try {
    const response = await fetch(DEFAULTS_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const gold = Number(data?.starCardDiscount?.gold);
    const platinum = Number(data?.starCardDiscount?.platinum);
    const next = { ...DEFAULT_ENERGY };
    if (Number.isFinite(gold)) next["Standard Petrol"] = round2(gold);
    if (Number.isFinite(platinum)) next["Premium Petrol"] = round2(platinum);
    DEFAULT_ENERGY = next;
  } catch {
    /* keep built-in Gold 11 / Platinum 12 fallbacks */
  }
}

function inStarCardRange(value) {
  return Number.isFinite(value) && value >= 0 && value <= 30;
}

function isBlankZero(raw) {
  if (raw == null) return false;
  const value = Number(String(raw).trim());
  return Number.isFinite(value) && value === 0;
}

/** Missing discounts were stored as 0. Clear those once so 11 / 12 show. */
function migrateBlankStarCardZeros() {
  try {
    if (localStorage.getItem(STARCARD_BLANK_ZERO_MIGRATE_KEY) === "1") return;
    for (const key of [
      ...Object.values(ENERGY_KEYS),
      ...Object.values(LEGACY_ENERGY_KEYS),
      "energy_discount",
    ]) {
      if (isBlankZero(localStorage.getItem(key))) localStorage.removeItem(key);
    }
    localStorage.setItem(STARCARD_BLANK_ZERO_MIGRATE_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

function clampStarCardDiscount(value, fuel = selectedFuel) {
  if (!Number.isFinite(value)) return defaultEnergyFor(fuel);
  return round2(Math.min(30, Math.max(0, value)));
}

function readStoredStarCard(fuel = selectedFuel) {
  const key = ENERGY_KEYS[fuel];
  const legacyKey = LEGACY_ENERGY_KEYS[fuel];
  let raw = key ? localStorage.getItem(key) : null;
  if ((raw == null || String(raw).trim() === "") && legacyKey) {
    raw = localStorage.getItem(legacyKey);
    if (raw != null && String(raw).trim() !== "") {
      const migrated = Number(raw);
      if (key && inStarCardRange(migrated)) {
        localStorage.setItem(key, String(round2(migrated)));
      }
    }
    localStorage.removeItem(legacyKey);
  }
  if (raw == null || String(raw).trim() === "") return null;
  const value = Number(raw);
  return inStarCardRange(value) ? round2(value) : null;
}

function loadEnergyDiscountFor(fuel = selectedFuel) {
  localStorage.removeItem("energy_discount");
  const stored = readStoredStarCard(fuel);
  const next = stored == null ? defaultEnergyFor(fuel) : stored;
  energyDiscountEl.value = String(next);
  energyDiscountEl.dataset.lastTracked = `${fuel}:${next}`;
  validateEnergyDiscount();
}

function saveEnergyDiscount(value, fuel = selectedFuel) {
  const key = ENERGY_KEYS[fuel];
  if (!key) return;
  const clamped = clampStarCardDiscount(value, fuel);
  try {
    localStorage.setItem(key, String(clamped));
  } catch {
    /* ignore quota / private mode */
  }
}

function persistCurrentStarCard(fuel = selectedFuel) {
  const raw = String(energyDiscountEl.value ?? "").trim();
  const clamped = clampStarCardDiscount(raw === "" ? NaN : Number(raw), fuel);
  energyDiscountEl.value = String(clamped);
  saveEnergyDiscount(clamped, fuel);
  validateEnergyDiscount();
}

function parseJsonToPrices(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { [COMPANY]: {} };
  }

  const result = { [COMPANY]: {} };
  const fuelSet = new Set(FUEL_TYPES);
  if (!Array.isArray(data)) return result;

  for (const entry of data) {
    const fuelType = entry?.type?.en?.trim?.() || "";
    if (!fuelSet.has(fuelType) || !Array.isArray(entry.prices)) continue;

    for (const row of entry.prices) {
      const company = row?.vendor?.en?.trim?.() || "";
      if (company !== COMPANY) continue;
      const price = Number(String(row.price ?? "").replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(price)) continue;
      result[COMPANY][fuelType] = price;
    }
  }

  return result;
}

function readLocalCache() {
  const raw = localStorage.getItem(CACHE_KEY);
  const timeRaw = localStorage.getItem(CACHE_TIME_KEY);
  if (!raw || !timeRaw) return null;
  const time = Number(timeRaw);
  if (!Number.isFinite(time)) return null;
  // Ignore legacy CSV cache payloads.
  if (!raw.trim().startsWith("[")) return null;
  return { text: raw, time };
}

function writeLocalCache(text) {
  const now = Date.now();
  localStorage.setItem(CACHE_KEY, text);
  localStorage.setItem(CACHE_TIME_KEY, String(now));
  return now;
}

async function fetchLivePrices() {
  const response = await fetch(PRICE_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function syncBoardPriceFromSelection() {
  if (manualBoardMode) {
    const typed = Number(boardPriceInput.value);
    boardPrice = Number.isFinite(typed) && typed > 0 ? typed : NaN;
    return;
  }
  const value = prices?.[COMPANY]?.[selectedFuel];
  boardPrice = Number.isFinite(value) ? value : NaN;
  setTextWithFlip(
    boardPriceDisplay,
    Number.isFinite(boardPrice)
      ? t("unit.price", { amount: money(boardPrice) })
      : t("unit.priceEmpty"),
  );
}

function validateEnergyDiscount() {
  const raw = energyDiscountEl.value;
  if (raw === "") {
    energyDiscountEl.classList.add("is-invalid");
    energyHint.classList.add("is-visible");
    return false;
  }
  const value = Number(raw);
  const ok = Number.isFinite(value) && value >= 0 && value <= 30;
  energyDiscountEl.classList.toggle("is-invalid", !ok);
  energyHint.classList.toggle("is-visible", !ok);
  return ok;
}

function clampEnergyOnBlur() {
  persistCurrentStarCard();
  const value = Number(energyDiscountEl.value);
  renderCalculation();
  const signature = `${selectedFuel}:${value}`;
  if (energyDiscountEl.dataset.lastTracked === signature) return;
  energyDiscountEl.dataset.lastTracked = signature;
  trackEvent("change_starcard_discount", {
    grade: fuelTrackLabel(),
    value,
  });
}

function pulseResult() {
  resultCard.classList.remove("is-pulsing");
  void resultCard.offsetWidth;
  resultCard.classList.add("is-pulsing");
}

function renderCalculation() {
  const energyOk = validateEnergyDiscount();
  const energyDiscount = energyOk ? Number(energyDiscountEl.value) : NaN;
  const totalSpend = selectedCoupons * COUPON_VALUE;
  const totalRebate = selectedCoupons * REBATE_PER_COUPON;

  setTextWithFlip(
    couponSummary,
    t("calc.couponSummary", {
      n: selectedCoupons,
      face: COUPON_VALUE,
      spend: totalSpend,
      rebate: totalRebate,
    }),
  );

  if (
    !Number.isFinite(boardPrice) ||
    boardPrice <= 0 ||
    !Number.isFinite(energyDiscount)
  ) {
    setTextWithFlip(netPaymentEl, "$—");
    setTextWithFlip(realPriceEl, t("unit.priceEmpty"));
    setTextWithFlip(litresEl, t("unit.litresEmpty"));
    setTextWithFlip(youSaveEl, "$—");
    if (chartMetric === "real") renderPriceChange();
    if (chartOpen) renderChartSheet();
    return;
  }

  const result = calculate({
    boardPrice,
    energyDiscount,
    couponCount: selectedCoupons,
    couponValue: COUPON_VALUE,
    rebatePerCoupon: REBATE_PER_COUPON,
  });

  const signature = [
    result.netPayment,
    result.realPricePerLitre,
    result.litresObtained,
    result.actualDiscount,
  ].join("|");

  setTextWithFlip(netPaymentEl, `$${money(result.netPayment)}`);
  setTextWithFlip(
    realPriceEl,
    t("unit.price", { amount: money(result.realPricePerLitre) }),
  );
  setTextWithFlip(
    litresEl,
    t("unit.litres", { amount: money(result.litresObtained) }),
  );
  setTextWithFlip(
    youSaveEl,
    Number.isFinite(result.actualDiscount)
      ? `-$${money(result.actualDiscount)}`
      : "$—",
  );

  if (signature !== lastResultSignature) {
    if (lastResultSignature) pulseResult();
    lastResultSignature = signature;
  }
  if (chartMetric === "real") renderPriceChange();
  if (chartOpen) renderChartSheet();
}

function refreshUi() {
  syncBoardPriceFromSelection();
  renderPriceChange();
  renderCalculation();
  syncPageScrollLock();
}

function applyPrices(nextPrices, time, state, notice) {
  prices = nextPrices;
  setManualBoardMode(false);
  if (notice) showPriceNotice(state, notice.key, notice.vars);
  else if (time) {
    showPriceNotice(state, "prices.lastUpdated", { time });
  } else showPriceNotice(state, "prices.lastUpdatedEmpty");
  refreshUi();
}

export async function loadPrices() {
  const cached = readLocalCache();
  const cachedHistory = readHistoryCache();
  if (cachedHistory) priceHistory = cachedHistory;

  if (cached) {
    prices = parseJsonToPrices(cached.text);
    setManualBoardMode(false);
    showPriceNotice("loading", "prices.loadingCached");
    refreshUi();
  } else {
    showPriceNotice("loading", "prices.loading");
  }

  const [priceResult, historyResult] = await Promise.allSettled([
    fetchLivePrices(),
    fetchHistory(),
  ]);

  if (historyResult.status === "fulfilled") {
    priceHistory = historyResult.value;
    writeHistoryCache(priceHistory);
  }

  if (priceResult.status === "fulfilled") {
    const text = priceResult.value;
    const time = writeLocalCache(text);
    applyPrices(
      parseJsonToPrices(text),
      time,
      "live",
      {
        key: "prices.live",
        vars: { time },
      },
    );
    return;
  }

  const liveError = priceResult.reason || new Error("error");
  if (cached) {
    applyPrices(
      parseJsonToPrices(cached.text),
      cached.time,
      "cached",
      {
        key: "prices.cached",
        vars: { time: cached.time },
      },
    );
    return;
  }

  prices = {};
  setManualBoardMode(true);
  showPriceNotice("error", "prices.loadError", {
    message: liveError.message || "error",
  });
  refreshUi();
}
priceChangeBtn.addEventListener("click", openChart);
chartClose.addEventListener("click", closeChart);
chartBackdrop.addEventListener("click", (event) => {
  if (event.target === chartBackdrop) closeChart();
});
chartMetricToggle.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-metric]");
  if (!btn) return;
  chartMetric = btn.dataset.metric === "real" ? "real" : "board";
  writeChartMetric(chartMetric);
  syncChartMetricToggle();
  renderChartSheet();
  renderPriceChange();
});

fuelToggle.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-fuel]");
  if (!btn) return;
  const nextFuel = btn.dataset.fuel;
  if (nextFuel === selectedFuel) return;
  persistCurrentStarCard(selectedFuel);
  selectedFuel = nextFuel;
  writeSelectedFuel(selectedFuel);
  syncFuelToggle();
  loadEnergyDiscountFor(selectedFuel);
  refreshUi();
  trackEvent("select_grade", { grade: fuelTrackLabel(selectedFuel) });
});

couponGrid.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-count]");
  if (!btn) return;
  const nextCount = Number(btn.dataset.count);
  if (nextCount === selectedCoupons) return;
  writeSelectedCoupons(btn.dataset.count);
  syncCouponGrid();
  renderCalculation();
  trackEvent("select_coupons", { count: selectedCoupons });
});

energyDiscountEl.addEventListener("input", () => {
  const raw = String(energyDiscountEl.value ?? "").trim();
  if (raw !== "" && validateEnergyDiscount()) {
    saveEnergyDiscount(Number(raw));
  }
  renderCalculation();
});
energyDiscountEl.addEventListener("change", clampEnergyOnBlur);
energyDiscountEl.addEventListener("blur", clampEnergyOnBlur);
window.addEventListener("pagehide", () => persistCurrentStarCard());

boardPriceInput.addEventListener("input", () => {
  syncBoardPriceFromSelection();
  renderCalculation();
});

export function isChartOpen() {
  return chartOpen;
}

export function bindPrices() {
  updateOnlineUi();
  syncFuelToggle();
  syncCouponGrid();
  syncChartMetricToggle();
  window.calculate = calculate;
  window.getPrices = () => prices;
}

onLangChange(() => {
  setUpdated(priceNotice.state, t(priceNotice.key, priceNoticeVars()));
  refreshUi();
});

export function restorePrices() {
  return loadDefaults().then(() => {
    migrateBlankStarCardZeros();
    loadEnergyDiscountFor(selectedFuel);
    renderCalculation();
    syncPageScrollLock();
  });
}
