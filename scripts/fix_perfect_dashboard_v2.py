#!/usr/bin/env python3
"""
Fix data and config for The Perfect Dashboard charts.
Directly modifies chart JSON files and uploads new data sources.
"""

import csv
import io
import json
import os
import random
import tempfile
from pathlib import Path

import requests

BASE = "http://localhost:8000"
CHARTS_DIR = Path(__file__).resolve().parent.parent / "data" / "charts"


def load_chart(chart_id: str) -> dict:
    with open(CHARTS_DIR / f"{chart_id}.json") as f:
        return json.load(f)


def save_chart(chart_id: str, chart: dict):
    with open(CHARTS_DIR / f"{chart_id}.json", "w") as f:
        json.dump(chart, f, indent=2, default=str)
    print(f"  Saved {chart_id}.json")


def upload_csv(filename: str, rows: list[dict]) -> str:
    """Upload CSV data and return source_id."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, prefix=filename + "_") as f:
        f.write(buf.getvalue().encode())
        tmp = f.name

    try:
        with open(tmp, "rb") as fh:
            r = requests.post(
                f"{BASE}/api/data/upload",
                files={"file": (f"{filename}_{int(__import__('time').time())}.csv", fh, "text/csv")},
            )
            r.raise_for_status()
            data = r.json()
            source_id = data.get("source_id") or data.get("id")
            print(f"  Uploaded {filename}.csv → {source_id}")
            return source_id
    finally:
        os.unlink(tmp)


# ─────────────────────────────────────────────────────────────────────────────
# 1. AreaChart — set stacked=true
# ─────────────────────────────────────────────────────────────────────────────
def fix_area_chart():
    print("\n1. AreaChart — set stacked=true")
    chart_id = "f533a82a0fad"
    chart = load_chart(chart_id)
    chart.setdefault("config", {})["stacked"] = True
    save_chart(chart_id, chart)


# ─────────────────────────────────────────────────────────────────────────────
# 2. StackedColumn — fix quarter sort order
# ─────────────────────────────────────────────────────────────────────────────
def fix_stacked_column():
    print("\n2. StackedColumn — fix quarter sort order")
    chart_id = "ce8d6fbd5d12"

    random.seed(42)
    categories = ["Hardware", "Software", "Services"]
    quarters = ["2024-Q1", "2024-Q2", "2024-Q3", "2024-Q4", "2025-Q1", "2025-Q2"]
    base = {"Hardware": 200, "Software": 350, "Services": 300}
    growth = {"Hardware": 15, "Software": 40, "Services": 25}

    wide_rows = []
    for q_idx, q in enumerate(quarters):
        row = {"quarter": q}
        for cat in categories:
            row[cat] = base[cat] + growth[cat] * q_idx + random.randint(-15, 15)
        wide_rows.append(row)

    sid = upload_csv("stacked_column_v2", wide_rows)

    chart = load_chart(chart_id)
    chart["source_id"] = sid
    chart["sql"] = (
        f'SELECT quarter, metric_name, metric_value '
        f'FROM (SELECT quarter, "Hardware", "Software", "Services" FROM src_{sid}) '
        f'UNPIVOT (metric_value FOR metric_name IN ("Hardware", "Software", "Services")) '
        f'ORDER BY quarter LIMIT 5000'
    )
    save_chart(chart_id, chart)


# ─────────────────────────────────────────────────────────────────────────────
# 3. GroupedColumn — fix underscore labels, show team names
# ─────────────────────────────────────────────────────────────────────────────
def fix_grouped_column():
    print("\n3. GroupedColumn — fix underscore labels")
    chart_id = "d0040a12bf90"

    random.seed(42)
    teams = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]

    wide_rows = []
    for team in teams:
        wide_rows.append({
            "team": team,
            "H1 2025": random.randint(70, 98),
            "H2 2025": random.randint(70, 98),
        })

    sid = upload_csv("grouped_column_v2", wide_rows)

    chart = load_chart(chart_id)
    chart["source_id"] = sid
    chart["sql"] = (
        f'SELECT team, metric_name, metric_value '
        f'FROM (SELECT team, "H1 2025", "H2 2025" FROM src_{sid}) '
        f'UNPIVOT (metric_value FOR metric_name IN ("H1 2025", "H2 2025")) '
        f'ORDER BY team LIMIT 5000'
    )
    chart["title"] = "Team Performance: H1 vs H2"
    chart["subtitle"] = "Completion rate (%) by team and half-year"
    save_chart(chart_id, chart)


# ─────────────────────────────────────────────────────────────────────────────
# 4. HeatMap — fix day ordering and time format
# ─────────────────────────────────────────────────────────────────────────────
def fix_heatmap():
    print("\n4. HeatMap — fix day order and hour format")
    chart_id = "8398f10fea34"

    random.seed(99)
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    hours = ["6am", "9am", "12pm", "3pm", "6pm", "9pm"]

    rows = []
    for day in days:
        for hour in hours:
            is_weekend = day in ("Sat", "Sun")
            is_peak = hour in ("9am", "12pm", "3pm")
            if is_peak and not is_weekend:
                val = 120 + random.randint(0, 60)
            elif is_peak and is_weekend:
                val = 60 + random.randint(0, 30)
            elif is_weekend:
                val = 20 + random.randint(0, 20)
            else:
                val = 40 + random.randint(0, 30)
            rows.append({"day": day, "hour": hour, "visitors": val})

    sid = upload_csv("heatmap_v2", rows)

    chart = load_chart(chart_id)
    chart["source_id"] = sid
    chart["sql"] = f'SELECT day, hour, visitors FROM src_{sid} LIMIT 5000'
    chart["x"] = "hour"
    chart["y"] = "visitors"
    chart["series"] = "day"
    save_chart(chart_id, chart)


# ─────────────────────────────────────────────────────────────────────────────
# 5. BulletBar — normalize to percentage of target
# ─────────────────────────────────────────────────────────────────────────────
def fix_bullet_bar():
    print("\n5. BulletBar — normalize to % of target")
    chart_id = "a10fd22d0223"

    raw = [
        ("Revenue", 920, 850),
        ("Customers", 1240, 1100),
        ("Retention", 94, 90),
        ("NPS", 68, 60),
        ("SLA", 97, 95),
        ("Deploys", 48, 40),
    ]
    rows = [
        {"metric": name, "actual": round(a / t * 100, 1), "target": 100}
        for name, a, t in raw
    ]

    sid = upload_csv("bullet_bar_v2", rows)

    chart = load_chart(chart_id)
    chart["source_id"] = sid
    chart["sql"] = f'SELECT metric, actual, target FROM src_{sid} LIMIT 5000'
    chart["subtitle"] = "All key metrics exceeded their targets"
    chart.setdefault("config", {})["xAxisTitle"] = "% of Target"
    save_chart(chart_id, chart)


# ─────────────────────────────────────────────────────────────────────────────
# 6. ArrowPlot — shorten metric names
# ─────────────────────────────────────────────────────────────────────────────
def fix_arrow_plot():
    print("\n6. ArrowPlot — shorten metric names")
    chart_id = "1ca9e6916d15"

    rows = [
        {"metric": "Onboarding", "before": 5, "after": 12},
        {"metric": "Tickets/Day", "before": 45, "after": 82},
        {"metric": "Deploy Time", "before": 30, "after": 42},
        {"metric": "Bug Rate", "before": 3, "after": 6},
        {"metric": "Coverage", "before": 60, "after": 88},
        {"metric": "MTTR", "before": 4, "after": 6},
    ]

    sid = upload_csv("arrow_plot_v2", rows)

    chart = load_chart(chart_id)
    chart["source_id"] = sid
    chart["sql"] = f'SELECT metric, "before", "after" FROM src_{sid} LIMIT 5000'
    save_chart(chart_id, chart)


# ─────────────────────────────────────────────────────────────────────────────
# 7. SplitBars — shorten topic names
# ─────────────────────────────────────────────────────────────────────────────
def fix_split_bars():
    print("\n7. SplitBars — shorten topic names")
    chart_id = "b1d5a31030cb"

    rows = [
        {"topic": "Balance", "male_pct": 45, "female_pct": 78},
        {"topic": "Growth", "male_pct": 68, "female_pct": 78},
        {"topic": "Pay", "male_pct": 85, "female_pct": 68},
        {"topic": "Culture", "male_pct": 35, "female_pct": 82},
        {"topic": "Mgmt", "male_pct": 42, "female_pct": 55},
        {"topic": "Benefits", "male_pct": 72, "female_pct": 80},
    ]

    sid = upload_csv("split_bars_v2", rows)

    chart = load_chart(chart_id)
    chart["source_id"] = sid
    chart["sql"] = f'SELECT topic, male_pct, female_pct FROM src_{sid} LIMIT 5000'
    save_chart(chart_id, chart)


# ─────────────────────────────────────────────────────────────────────────────
# 8. SmallMultiples — shorten region names
# ─────────────────────────────────────────────────────────────────────────────
def fix_small_multiples():
    print("\n8. SmallMultiples — shorten region names")
    chart_id = "4f60c7927f6a"

    random.seed(77)
    regions = ["N. America", "Europe", "Asia", "LATAM"]
    months = [f"2025-{m:02d}-01" for m in range(1, 13)]
    base = {"N. America": 100, "Europe": 100, "Asia": 120, "LATAM": 75}
    growth = {"N. America": 3, "Europe": 5, "Asia": 4, "LATAM": 2}

    rows = []
    for region in regions:
        for i, month in enumerate(months):
            val = base[region] + growth[region] * i + random.randint(-3, 3)
            rows.append({"month": month, "region": region, "revenue": val})

    sid = upload_csv("small_multiples_v2", rows)

    chart = load_chart(chart_id)
    chart["source_id"] = sid
    chart["sql"] = f'SELECT month, region, revenue FROM src_{sid} ORDER BY region, month LIMIT 5000'
    save_chart(chart_id, chart)


# ─────────────────────────────────────────────────────────────────────────────
# 9. DataTable — rename columns to readable headers
# ─────────────────────────────────────────────────────────────────────────────
def fix_data_table():
    print("\n9. DataTable — readable column headers")
    chart_id = "11ae3e27f8b7"

    # Get existing data via API
    r = requests.get(f"{BASE}/api/v2/charts/{chart_id}")
    data = r.json()["data"]

    rows = []
    for d in data:
        rows.append({
            "Country": d.get("country", ""),
            "Population (M)": d.get("population_m", ""),
            "GDP ($T)": d.get("gdp_t", ""),
            "Life Expectancy": d.get("life_expectancy", ""),
            "Credit Rating": d.get("credit_rating", ""),
        })

    sid = upload_csv("data_table_v2", rows)

    chart = load_chart(chart_id)
    chart["source_id"] = sid
    chart["sql"] = (
        f'SELECT "Country", "Population (M)", "GDP ($T)", '
        f'"Life Expectancy", "Credit Rating" FROM src_{sid} LIMIT 5000'
    )
    save_chart(chart_id, chart)


# ─────────────────────────────────────────────────────────────────────────────
# 10. DotPlot — set horizontal=true
# ─────────────────────────────────────────────────────────────────────────────
def fix_dot_plot():
    print("\n10. DotPlot — set horizontal=true")
    chart_id = "e84d443044fe"
    chart = load_chart(chart_id)
    # DotPlot: x=score (numeric), y=product (categorical)
    # Setting horizontal=true routes ordinal domain to y-axis
    chart["x"] = "product"
    chart["y"] = "score"
    chart["horizontal"] = True
    save_chart(chart_id, chart)


if __name__ == "__main__":
    print("Fixing Perfect Dashboard charts...")
    fix_area_chart()
    fix_stacked_column()
    fix_grouped_column()
    fix_heatmap()
    fix_bullet_bar()
    fix_arrow_plot()
    fix_split_bars()
    fix_small_multiples()
    fix_data_table()
    fix_dot_plot()
    print("\nDone! All fixes applied.")
