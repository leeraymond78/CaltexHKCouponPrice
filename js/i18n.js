import { trackEvent } from "./analytics.js";

const LANG_KEY = "app_lang";

const STRINGS = {
  en: {
    "meta.title": "HK Caltex StarCard Discount",
    "tab.prices": "Prices",
    "tab.map": "Stations",
    "tab.settings": "Settings",
    "nav.sections": "Sections",
    "update.banner": "Update available — tap to refresh",
    offline: "Offline",
    "prices.title": "HK Caltex StarCard Discount",
    "prices.warning":
      "⚠️ Could not load live prices. Enter board price manually.",
    "prices.grade": "Grade",
    "fuel.gold": "Gold",
    "fuel.platinum": "Platinum",
    "fuel.diesel": "Diesel",
    "fuel.autogas": "AutoGas",
    "fuel.ev": "EV",
    "fuel.all": "All",
    "fuel.map.gold": "Gold",
    "fuel.map.platinum": "Platinum",
    "fuel.map.diesel": "Diesel",
    "fuel.map.autogas": "AutoGas",
    "fuel.map.ev": "EV",
    "prices.card": "Price details",
    "prices.board": "Board Price",
    "prices.boardInput": "Board price per litre",
    "prices.starcard": "StarCard Discount",
    "prices.starcardInput": "StarCard discount",
    "prices.energyHint": "Enter a value between 0 and 30",
    "prices.couponCard": "Buy $300 Free $50 Coupons",
    "prices.couponLabel": "Buy $300 Free $50 Coupons",
    "prices.couponCount": "Coupon count",
    "calc.couponSummary":
      "{n} × ${face} = ${spend} total  •  ${rebate} discount",
    "prices.result": "Calculation result",
    "prices.net": "Net Payment",
    "prices.real": "Real Price",
    "prices.litres": "Litres",
    "prices.save": "You Save",
    "prices.loading": "Getting latest prices online…",
    "prices.loadingCached":
      "Getting latest prices online… (showing last saved for now)",
    "prices.lastUpdated": "Last updated: {time}",
    "prices.lastUpdatedEmpty": "Last updated: —",
    "prices.live": "Latest online · updated {time}",
    "prices.cached":
      "Couldn’t reach live data · using saved prices from {time}",
    "prices.loadError": "Couldn’t load live prices ({message})",
    "unit.price": "${amount} / L",
    "unit.priceEmpty": "— / L",
    "unit.litres": "{amount} L",
    "unit.litresEmpty": "— L",
    "unit.suffix": "/ L",
    "time.unknown": "unknown",
    "chart.title": "Price changes",
    "chart.sub": "Recent recorded changes",
    "chart.close": "Close",
    "chart.metric": "Chart metric",
    "chart.board": "Board Price",
    "chart.real": "Real Price",
    "chart.boardLower": "board price",
    "chart.realLower": "real price",
    "chart.heading": "{fuel} {metric}",
    "chart.noChanges": "No recorded changes yet",
    "chart.changeOne": "Last 1 recorded change",
    "chart.changes": "Last {n} recorded changes",
    "chart.withDiscount": "{count} · −${amount}/L",
    "chart.decreased": "decreased",
    "chart.increased": "increased",
    "chart.unchanged": "unchanged",
    "chart.changeAria":
      "{kind} {verb} from ${from} to ${to} on {date}. Show recent changes.",
    "map.title": "Stations",
    "map.loading": "Loading stations…",
    "map.searchPlaceholder": "Search name or street",
    "map.search": "Search stations",
    "map.locate": "Sort by my location",
    "map.filters": "Filter stations",
    "map.list": "Caltex petrol stations",
    "map.canvas": "Map of Caltex petrol stations",
    "map.loadingMap": "Loading map…",
    "map.mapFailed":
      "Map couldn’t load. The station list is still available.",
    "map.mapSlow": "Map is taking a while. The station list is ready below.",
    "map.noStations": "Couldn’t load stations",
    "map.noMatches": "No matches",
    "map.stationCount": "{n} stations",
    "map.stationCountOne": "1 station",
    "map.stationSubset": "{shown} of {total}",
    "map.emptySearch": "No stations match your search.",
    "map.emptyList": "Couldn’t load the station list.",
    "map.retry": "Try again",
    "map.navigate": "Navigate",
    "map.navigateTo": "Navigate to {name}",
    "map.hongKong": "Hong Kong",
    "map.you": "You",
    "map.locUnavailable": "Location isn’t available on this device",
    "map.locFailed": "Couldn’t use your location",
    "nav.title": "Navigate",
    "nav.apple": "Apple Maps",
    "nav.google": "Google Maps",
    "nav.amap": "Amap",
    "nav.cancel": "Cancel",
    "nav.close": "Close",
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.languageGroup": "Language",
    "settings.version": "Version",
    "settings.about": "About",
    "settings.creator": "Creator",
  },
  zh: {
    "meta.title": "加德士私人能源咭優惠",
    "tab.prices": "油價",
    "tab.map": "油站",
    "tab.settings": "設定",
    "nav.sections": "頁面",
    "update.banner": "有更新 — 點按以重新載入",
    offline: "離線",
    "prices.title": "加德士私人能源咭優惠",
    "prices.warning": "⚠️ 無法載入即時油價。請手動輸入牌價。",
    "prices.grade": "油品",
    "fuel.gold": "黃金汽油",
    "fuel.platinum": "白金汽油",
    "fuel.diesel": "柴油",
    "fuel.autogas": "石油氣",
    "fuel.ev": "電動",
    "fuel.all": "全部",
    "fuel.map.gold": "黃金汽油",
    "fuel.map.platinum": "白金汽油",
    "fuel.map.diesel": "柴油",
    "fuel.map.autogas": "汽車用石油氣",
    "fuel.map.ev": "電動車充電",
    "prices.card": "價格詳情",
    "prices.board": "牌價",
    "prices.boardInput": "每公升牌價",
    "prices.starcard": "私人能源咭折扣",
    "prices.starcardInput": "私人能源咭折扣",
    "prices.energyHint": "請輸入 0 至 30 之間的數值",
    "prices.couponCard": "買 $300 送 $50 優惠券",
    "prices.couponLabel": "買 $300 送 $50 優惠券",
    "prices.couponCount": "優惠券數量",
    "calc.couponSummary": "{n} × ${face} = 共 ${spend}  •  折扣 ${rebate}",
    "prices.result": "計算結果",
    "prices.net": "實付金額",
    "prices.real": "實際油價",
    "prices.litres": "公升",
    "prices.save": "節省",
    "prices.loading": "正在取得最新油價…",
    "prices.loadingCached": "正在取得最新油價…（暫時顯示上次儲存的價格）",
    "prices.lastUpdated": "最後更新：{time}",
    "prices.lastUpdatedEmpty": "最後更新：—",
    "prices.live": "已是最新 · 更新於 {time}",
    "prices.cached": "無法連接即時資料 · 使用 {time} 儲存的價格",
    "prices.loadError": "無法載入即時油價（{message}）",
    "unit.price": "${amount} / 公升",
    "unit.priceEmpty": "— / 公升",
    "unit.litres": "{amount} 公升",
    "unit.litresEmpty": "— 公升",
    "unit.suffix": "/ 公升",
    "time.unknown": "未知",
    "chart.title": "油價變動",
    "chart.sub": "最近紀錄的變動",
    "chart.close": "關閉",
    "chart.metric": "圖表項目",
    "chart.board": "牌價",
    "chart.real": "實際油價",
    "chart.boardLower": "牌價",
    "chart.realLower": "實際油價",
    "chart.heading": "{fuel}{metric}",
    "chart.noChanges": "尚未有紀錄變動",
    "chart.changeOne": "最近 1 次紀錄變動",
    "chart.changes": "最近 {n} 次紀錄變動",
    "chart.withDiscount": "{count} · −${amount}/公升",
    "chart.decreased": "已下跌",
    "chart.increased": "已上升",
    "chart.unchanged": "沒有變動",
    "chart.changeAria":
      "{kind}{verb}，由 ${from} 至 ${to}（{date}）。顯示最近變動。",
    "map.title": "油站",
    "map.loading": "正在載入油站…",
    "map.searchPlaceholder": "搜尋名稱或街道",
    "map.search": "搜尋油站",
    "map.locate": "按我的位置排序",
    "map.filters": "篩選油站",
    "map.list": "加德士油站",
    "map.canvas": "加德士油站地圖",
    "map.loadingMap": "正在載入地圖…",
    "map.mapFailed": "地圖無法載入。油站列表仍可使用。",
    "map.mapSlow": "地圖載入需時。油站列表已在下方。",
    "map.noStations": "無法載入油站",
    "map.noMatches": "沒有相符結果",
    "map.stationCount": "{n} 個油站",
    "map.stationCountOne": "1 個油站",
    "map.stationSubset": "{shown} / {total}",
    "map.emptySearch": "沒有符合搜尋的油站。",
    "map.emptyList": "無法載入油站列表。",
    "map.retry": "再試一次",
    "map.navigate": "導航",
    "map.navigateTo": "前往{name}",
    "map.hongKong": "香港",
    "map.you": "你",
    "map.locUnavailable": "此裝置無法使用定位",
    "map.locFailed": "無法使用你的位置",
    "nav.title": "導航",
    "nav.apple": "Apple 地圖",
    "nav.google": "Google 地圖",
    "nav.amap": "高德地圖",
    "nav.cancel": "取消",
    "nav.close": "關閉",
    "settings.title": "設定",
    "settings.language": "語言",
    "settings.languageGroup": "語言",
    "settings.version": "版本",
    "settings.about": "關於",
    "settings.creator": "作者",
  },
};

let lang = "en";
const listeners = new Set();

export function getLang() {
  return lang;
}

export function localeTag() {
  return lang === "zh" ? "zh-HK" : "en-GB";
}

export function t(key, vars) {
  const table = STRINGS[lang] || STRINGS.en;
  let text = table[key] ?? STRINGS.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readStoredLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* private mode */
  }
  return "en";
}

function applyPwaName() {
  const name = lang === "zh" ? "加德士優惠" : "Caltex Discount";
  const apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (apple) apple.content = name;
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) {
    manifest.href = lang === "zh" ? "manifest-zh.json" : "manifest.json";
  }
}

export function applyI18n() {
  document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
  document.title = t("meta.title");
  applyPwaName();
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("#langToggle button[data-lang]").forEach((el) => {
    el.setAttribute("aria-pressed", String(el.dataset.lang === lang));
  });
}

export function setLang(next) {
  const value = next === "zh" ? "zh" : "en";
  if (value === lang) return;
  lang = value;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* private mode */
  }
  applyI18n();
  trackEvent("change_language", { lang });
  for (const fn of listeners) fn(lang);
}

export function initI18n() {
  lang = readStoredLang();
  applyI18n();
  const toggle = document.getElementById("langToggle");
  toggle?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-lang]");
    if (!btn) return;
    setLang(btn.dataset.lang);
  });
}
