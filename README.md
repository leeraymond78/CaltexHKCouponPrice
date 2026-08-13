# Petrol Coupon Calc

Offline-ready PWA to calculate Hong Kong petrol coupon savings.

## Features

- Caltex Regular / Premium board prices
- Energy card discount + coupon count (1–5) calculator
- Loads same-origin `data/oilprice.json` (no browser CORS)
- GitHub Actions refreshes prices daily at **05:00 HKT**
- Offline fallback via service worker + saved cache
- Installable Progressive Web App

## Data source

Pump price data from the
[Consumer Council Hong Kong Oil Watch open data JSON](https://www.consumer.org.hk/pricewatch/oilwatch/opendata/oilprice.json).

A scheduled workflow (`.github/workflows/update-oil-prices.yml`) downloads that feed every day at 05:00 HKT (`cron: 0 21 * * *` UTC) and commits `data/oilprice.json` when prices change. The PWA reads that file from the repo / GitHub Pages origin.

Manual run: **Actions → Update oil prices → Run workflow**.

## Local preview

Serve the folder over HTTP (service workers require a secure context / localhost):

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In the repo **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main`
   - Folder: `/ (root)`
3. Save, then wait for the Pages build to finish.
4. Visit `https://<user>.github.io/<repo>/`.

Or with GitHub CLI:

```bash
gh api -X POST "repos/<owner>/<repo>/pages" \
  -f build_type=legacy \
  -f source[branch]=main \
  -f source[path]=/
```

All asset paths in this project are relative (`./` + `<base href="./">`) so the app works from a project Pages URL.

## Lighthouse PWA checklist

- `manifest.json` with `name`, `short_name`, `start_url`, `display: standalone`, theme/background colors
- 192×192 and 512×512 icons (any + maskable)
- Service worker precaches the app shell and caches `data/oilprice.json`
- `theme-color`, viewport meta, and Apple touch icon for installability
