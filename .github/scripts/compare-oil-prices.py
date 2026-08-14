#!/usr/bin/env python3
"""Compare two Consumer Council oilprice.json files and print a summary."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


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


def format_summary(old: dict, new: dict) -> tuple[str, bool]:
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
    for fuel in ("Standard Petrol", "Premium Petrol"):
        o = old.get(fuel, {}).get("Caltex")
        n = new.get(fuel, {}).get("Caltex")
        if o is None and n is None:
            continue
        label = "Regular" if fuel == "Standard Petrol" else "Premium"
        if o == n:
            caltex.append(f"- Caltex {label}: ${n} (unchanged)")
        else:
            caltex.append(f"- Caltex {label}: ${o or '—'} → **${n or '—'}**")

    if caltex:
        lines.extend(["", "### Caltex (app)", ""])
        lines.extend(caltex)

    return "\n".join(lines), bool(changes)


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
    summary, has_changes = format_summary(old, new)

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

    print(summary)
    print(f"has_changes={'true' if has_changes else 'false'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
