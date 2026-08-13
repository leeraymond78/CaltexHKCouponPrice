# Petrol Coupon Calc

Offline-ready PWA to calculate Hong Kong petrol coupon savings.

## Features

- Live board prices for Caltex, Shell, Esso, Sinopec, and PetroChina
- Standard / Premium / Diesel toggle
- Energy card discount + coupon count (1–5) calculator
- Fetches the latest Consumer Council oil price JSON on every app open
- Offline fallback via service worker + saved cache when live fetch fails
- Installable Progressive Web App

## Data source

Pump price data from the
[Consumer Council Hong Kong Oil Watch open data JSON](https://www.consumer.org.hk/pricewatch/oilwatch/opendata/oilprice.json).

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
- Service worker precaches the app shell and caches oil-price JSON runtime data
- `theme-color`, viewport meta, and Apple touch icon for installability
