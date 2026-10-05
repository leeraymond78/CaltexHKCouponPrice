# HK Caltex StarCard Discount

A mobile-friendly calculator for **Hong Kong Caltex StarCard** and **Buy $300 Free $50** coupons. It shows your net payment and real price per litre after StarCard and coupon discounts.

**Live app:** https://leeraymond78.github.io/CaltexHKCouponPrice/

## Features

- **English and Traditional Chinese**, chosen in **Settings** and remembered
- **Gold / Platinum** grades (黃金汽油 / 白金汽油), with separate StarCard discounts (私人能源咭)
- Live **board prices** from the Consumer Council Oil Watch feed (updated daily)
- **Price change** chip: previous → current, delta, and date (green down / red up)
- Tap for a **chart** of recent changes; toggle **Board Price** vs **Real Price**
- **StarCard Discount** (HK$/L), editable, limited to **0–30**
- **Buy $300 Free $50 Coupons** selector (1–5)
- Results: **Net Payment**, **Real Price** / L, **Litres**, **You Save**
- Remembers grade, coupon count, StarCard amounts, chart preference, and language
- **Stations** tab: Caltex Hong Kong stations on an [OpenFreeMap](https://openfreemap.org/) map, with a list underneath
- Chinese uses the Caltex Chinese station feed, including names such as **黃金汽油**, **白金汽油**, **柴油**, and **汽車用石油氣**
- Search stations, filter by fuel or **EV**, and sort by your location
- Tap a station to focus the map; navigate there with Apple Maps, Google Maps, or Amap
- **Settings** shows the app version, creator **Raymond Li**, and the [GitHub project](https://github.com/leeraymond78/CaltexHKCouponPrice)
- Installable **PWA** — home-screen name **Caltex Discount** / **加德士優惠**. Works offline with the last prices and station list it loaded

## How to use

1. Open the live app link above.
2. On **Prices**, choose **Gold** or **Platinum**. Board prices load automatically.
3. Set your **StarCard discount** (HK$ per litre).
4. Pick how many coupons you will use (1–5).
5. Read **Net Payment**, **Real Price**, litres, and how much you save.
6. Open **Stations** to find a Caltex station.
7. Open **Settings** to switch between English and 中文.

If live prices cannot load, enter the board price yourself.

On a phone: Share → **Add to Home Screen** (iOS), or Install / Add to Home screen (Android).

## Prices

Pump prices come from the [Consumer Council Hong Kong Oil Watch](https://www.consumer.org.hk/pricewatch/oilwatch/opendata/oilprice.json) open data feed and are refreshed daily via GitHub Actions.

All amounts are in **Hong Kong dollars (HK$)**.

## Stations

Station locations come from the Caltex Hong Kong find-us feeds and are refreshed daily via GitHub Actions:

- English: [find-us](https://www.caltex.com/bin/services/getStations.json?pagePath=/hk/en/find-us&siteType=b2c) → `data/stations.json`
- Chinese: [find-us](https://www.caltex.com/bin/services/getStations.json?pagePath=/hk/zh/find-us&siteType=b2c) → `data/stations-zh.json`

The map uses [OpenFreeMap](https://openfreemap.org/) tiles.

## Version

See `version.json` (currently **1.3.0**). Releases: https://github.com/leeraymond78/CaltexHKCouponPrice/releases
