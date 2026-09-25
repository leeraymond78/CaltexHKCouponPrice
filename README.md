# Caltex HK StarCard Discount

A mobile-friendly calculator for **Hong Kong Caltex StarCard** and **Buy $300 Free $50** coupons. It shows your net payment and real price per litre after StarCard and coupon discounts.

**Live app:** https://leeraymond78.github.io/CaltexHKCouponPrice/

## Features

- **Gold / Platinum** grades (green / orange), with separate StarCard discounts
- Live **board prices** from the Consumer Council Oil Watch feed (updated daily)
- **Price change** chip: previous → current, delta, and date (green down / red up)
- Tap for a **chart** of recent changes; toggle **Board Price** vs **Real Price**
- **StarCard Discount** (HK$/L), editable, limited to **0–30**
- **Buy $300 Free $50 Coupons** selector (1–5)
- Results: **Net Payment**, **Real Price** / L, **Litres**, **You Save**
- Remembers grade, coupon count, StarCard amounts, and Board/Real chart preference
- Installable **PWA** — works offline with the last prices it loaded

## How to use

1. Open the live app link above.
2. Choose **Gold** or **Platinum**. Board prices load automatically.
3. Set your **StarCard discount** (HK$ per litre).
4. Pick how many coupons you will use (1–5).
5. Read **Net Payment**, **Real Price**, litres, and how much you save.

If live prices cannot load, enter the board price yourself.

On a phone: Share → **Add to Home Screen** (iOS), or Install / Add to Home screen (Android).

## Prices

Pump prices come from the [Consumer Council Hong Kong Oil Watch](https://www.consumer.org.hk/pricewatch/oilwatch/opendata/oilprice.json) open data feed and are refreshed daily via GitHub Actions.

All amounts are in **Hong Kong dollars (HK$)**.

## Version

See `version.json` (currently **1.1.1**). Releases: https://github.com/leeraymond78/CaltexHKCouponPrice/releases
