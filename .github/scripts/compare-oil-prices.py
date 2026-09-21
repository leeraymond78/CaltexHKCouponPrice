#!/usr/bin/env python3
"""Compare two Consumer Council oilprice.json files and print a summary."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


def load_prices(path: Path) -> dict[str, dict[str, str]]:
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, dict[str, str]] = {}
    for entry in data:
        fuel = entry.get("type", {}).get("en", "").strip()
        if not fuel:
            continue
        out[fuel] = {}
        for row in entry.get("prices", []):
            vendor = row.get("vendor", {}).get("en", "").strip()
            price = str(row.get("price", "")).strip()
            if vendor and price:
                out[fuel][vendor] = price
    return out


APP_FUELS = ("Standard Petrol", "Premium Petrol")
APP_VENDOR = "Caltex"
MAX_HISTORY_POINTS = 30


def _price_number(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return round(float(value), 2)
    except ValueError:
        return None


def load_price_history(path: Path) -> dict[str, list[dict]]:
    empty = {fuel: [] for fuel in APP_FUELS}
    if not path.is_file():
        return empty
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return empty
    if not isinstance(data, dict):
        return empty
    out: dict[str, list[dict]] = {}
    for fuel in APP_FUELS:
        rows = data.get(fuel, [])
        series: list[dict] = []
        if isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue
                date = str(row.get("date", "")).strip()
                price = _price_number(str(row.get("price", "")).strip())
                if date and price is not None:
                    series.append({"date": date, "price": price})
        out[fuel] = series
    return out


def update_price_history(path: Path, old: dict, new: dict, date_str: str) -> bool:
    """Append Caltex prices that changed so the app can chart recent moves."""
    history = load_price_history(path)
    changed = False
    for fuel in APP_FUELS:
        new_price = _price_number(new.get(fuel, {}).get(APP_VENDOR))
        if new_price is None:
            continue
        series = history.setdefault(fuel, [])
        last = series[-1]["price"] if series else None
        if last == new_price:
            continue
        old_price = _price_number(old.get(fuel, {}).get(APP_VENDOR))
        if last is None and old_price is not None and old_price != new_price:
            series.append({"date": date_str, "price": old_price})
        series.append({"date": date_str, "price": new_price})
        history[fuel] = series[-MAX_HISTORY_POINTS:]
        changed = True
    if changed:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(history, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return changed


def format_summary(old: dict, new: dict) -> tuple[str, bool, list[str]]:
    fuels = sorted(set(old) | set(new))
    vendors = sorted({v for f in fuels for v in set(old.get(f, {})) | set(new.get(f, {}))})

    lines = ["## Oil price update", ""]
    changes: list[str] = []
    rows: list[str] = []

    for fuel in fuels:
        for vendor in vendors:
            old_price = old.get(fuel, {}).get(vendor)
            new_price = new.get(fuel, {}).get(vendor)
            if old_price is None and new_price is None:
                continue
            if old_price == new_price:
                rows.append(f"| {vendor} | {fuel} | {new_price} | — |")
                continue
            if old_price is None:
                change = f"new → **{new_price}**"
                changes.append(f"- **{vendor}** · {fuel}: new price **${new_price}**")
            elif new_price is None:
                change = f"**{old_price}** → removed"
                changes.append(f"- **{vendor}** · {fuel}: removed (was **${old_price}**)")
            else:
                change = f"**{old_price} → {new_price}**"
                changes.append(
                    f"- **{vendor}** · {fuel}: **${old_price}** → **${new_price}**"
                )
            rows.append(f"| {vendor} | {fuel} | {new_price or '—'} | {change} |")

    if not old:
        lines.append("First recorded fetch — no previous file to compare.")
        lines.append("")
    elif not changes:
        lines.append("**No price changes.** All values match the previous commit.")
        lines.append("")
    else:
        lines.append(f"**{len(changes)} price change(s):**")
        lines.append("")
        lines.extend(changes)
        lines.append("")

    lines.append("| Vendor | Fuel | Price (HKD/L) | Change |")
    lines.append("| --- | --- | ---: | --- |")
    lines.extend(rows)

    caltex = []
    app_changes: list[str] = []
    for fuel in APP_FUELS:
        o = old.get(fuel, {}).get("Caltex")
        n = new.get(fuel, {}).get("Caltex")
        if o is None and n is None:
            continue
        label = "Regular" if fuel == "Standard Petrol" else "Premium"
        if o == n:
            caltex.append(f"- Caltex {label}: ${n} (unchanged)")
        else:
            line = f"- Caltex {label}: ${o or '—'} → **${n or '—'}**"
            caltex.append(line)
            app_changes.append(line)

    if caltex:
        lines.extend(["", "### Caltex (app)", ""])
        lines.extend(caltex)

    return "\n".join(lines), bool(changes), app_changes


def main() -> int:
    old_path = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/oilprice.old.json")
    new_path = Path(sys.argv[2] if len(sys.argv) > 2 else "data/oilprice.json")
    summary_path = Path(
        sys.argv[3] if len(sys.argv) > 3 else os.environ.get("SUMMARY_FILE", "/tmp/price-summary.md")
    )
    changes_file = Path(
        sys.argv[4] if len(sys.argv) > 4 else os.environ.get("CHANGES_FILE", "/tmp/price-changes.txt")
    )

    old = load_prices(old_path)
    new = load_prices(new_path)
    summary, has_changes, app_changes = format_summary(old, new)

    history_path = Path(
        os.environ.get("HISTORY_FILE", "data/price-history.json")
    )
    history_date = os.environ.get("HISTORY_DATE") or datetime.now(
        ZoneInfo("Asia/Hong_Kong")
    ).strftime("%Y-%m-%d")
    if app_changes:
        update_price_history(history_path, old, new, history_date)

    summary_path.write_text(summary + "\n", encoding="utf-8")

    change_lines = [
        line[2:]
        for line in summary.splitlines()
        if line.startswith("- **")
    ]
    if change_lines:
        changes_file.write_text("\n".join(change_lines) + "\n", encoding="utf-8")
    else:
        changes_file.write_text("", encoding="utf-8")

    app_changes_file = Path(
        os.environ.get("APP_CHANGES_FILE", "/tmp/app-price-changes.txt")
    )
    if app_changes:
        app_changes_file.write_text(
            "\n".join(line[2:].replace("**", "") for line in app_changes) + "\n",
            encoding="utf-8",
        )
    else:
        app_changes_file.write_text("", encoding="utf-8")

    print(summary)
    print(f"has_changes={'true' if has_changes else 'false'}")
    print(f"has_app_changes={'true' if bool(app_changes) else 'false'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
