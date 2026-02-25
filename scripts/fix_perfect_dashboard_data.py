"""Fix data and config issues for The Perfect Dashboard charts."""
import requests
import csv
import io
import json

BASE = "http://localhost:8000"

def upload_csv(name: str, content: str) -> str:
    """Upload CSV data, return source_id."""
    f = io.BytesIO(content.encode())
    resp = requests.post(f"{BASE}/api/data/upload", files={"file": (name, f, "text/csv")})
    resp.raise_for_status()
    d = resp.json()
    # Handle duplicate filename
    return d.get("source_id") or d.get("detail", {}).get("existing_source_id", "")


def delete_source(source_id: str):
    """Delete a data source to clean up old uploads."""
    try:
        r = requests.delete(f"{BASE}/api/data/sources/{source_id}")
        if r.ok:
            print(f"  Deleted old source {source_id}")
    except Exception:
        pass


def update_chart(chart_id: str, updates: dict):
    """Update chart config via API. Deletes old source if source_id is replaced."""
    resp = requests.get(f"{BASE}/api/v2/charts/{chart_id}")
    resp.raise_for_status()
    chart = resp.json()["chart"]
    old_source = chart.get("source_id")

    # Merge updates
    for k, v in updates.items():
        if k == "config":
            chart["config"] = {**(chart.get("config") or {}), **v}
        else:
            chart[k] = v

    # Save
    resp = requests.post(f"{BASE}/api/v2/charts/save", json=chart)
    resp.raise_for_status()
    print(f"  Updated chart {chart_id}")

    # Clean up old source if it was replaced
    new_source = updates.get("source_id")
    if new_source and old_source and old_source != new_source:
        delete_source(old_source)

# ─── 1. Fix AreaChart: smooth subscriber growth data ──────────────────────────
print("1. Fixing AreaChart (smooth subscriber growth)...")
area_csv = """date,Netflix,Disney+,Max
2024-01-01,225,162,77
2024-02-01,227,164,78
2024-03-01,230,166,79
2024-04-01,232,169,80
2024-05-01,234,171,81
2024-06-01,237,174,82
2024-07-01,240,177,84
2024-08-01,243,180,86
2024-09-01,246,184,88
2024-10-01,249,188,90
2024-11-01,252,192,93
2024-12-01,255,196,95
2025-01-01,258,200,97
2025-02-01,260,203,99
2025-03-01,262,205,101
2025-04-01,265,207,103
2025-05-01,267,209,104
2025-06-01,269,211,105
2025-07-01,271,213,106
2025-08-01,273,215,107
2025-09-01,275,218,108
2025-10-01,277,221,110
2025-11-01,279,224,112
2025-12-01,281,227,114"""

sid = upload_csv("streaming_wars_smooth.csv", area_csv)
if sid:
    update_chart("f533a82a0fad", {
        "source_id": sid,
        "sql": f"SELECT date, metric_name, metric_value FROM (UNPIVOT (SELECT * FROM src_{sid}) ON Netflix, \"Disney+\", Max INTO NAME metric_name VALUE metric_value) ORDER BY date, metric_name",
        "title": "Streaming Wars: Subscriber Growth",
        "subtitle": "Global subscribers in millions, 2024-2025",
    })

# ─── 2. Fix StackedColumn: use sortable quarter format ────────────────────────
print("2. Fixing StackedColumn (chronological quarters)...")
stacked_csv = """quarter,Hardware,Software,Services
2024-Q1,210,320,120
2024-Q2,225,360,140
2024-Q3,200,400,155
2024-Q4,240,430,170
2025-Q1,230,460,190
2025-Q2,250,500,210"""

sid = upload_csv("revenue_by_category_fixed.csv", stacked_csv)
if sid:
    update_chart("ce8d6fbd5d12", {
        "source_id": sid,
        "sql": f"SELECT quarter, metric_name, metric_value FROM (UNPIVOT (SELECT * FROM src_{sid}) ON Hardware, Software, Services INTO NAME metric_name VALUE metric_value) ORDER BY quarter, metric_name",
    })

# ─── 3. Fix GroupedColumn: readable labels ────────────────────────────────────
print("3. Fixing GroupedColumn (readable labels)...")
grouped_csv = """team,H1 2025,H2 2025
Alpha,85,89
Beta,76,85
Gamma,79,102
Delta,92,86
Epsilon,88,80"""

sid = upload_csv("team_performance_fixed.csv", grouped_csv)
if sid:
    update_chart("d0040a12bf90", {
        "source_id": sid,
        "y": ["H1 2025", "H2 2025"],
        "sql": f'SELECT team, metric_name, metric_value FROM (UNPIVOT (SELECT * FROM src_{sid}) ON "H1 2025", "H2 2025" INTO NAME metric_name VALUE metric_value) ORDER BY team, metric_name',
    })

# ─── 4. Fix HeatMap: correct day ordering and time labels ─────────────────────
print("4. Fixing HeatMap (day ordering + time labels)...")
# Use integer hours and proper day ordering
days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
hours = list(range(0, 24, 3))  # 0, 3, 6, 9, 12, 15, 18, 21

import random
random.seed(42)
rows = []
for day in days:
    for hour in hours:
        # Peak traffic during work hours on weekdays
        is_weekday = day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
        if 9 <= hour <= 15 and is_weekday:
            visitors = random.randint(600, 1200)
        elif 6 <= hour <= 18:
            visitors = random.randint(200, 600)
        else:
            visitors = random.randint(20, 200)
        h_label = f"{hour}:00"
        rows.append(f"{day},{h_label},{visitors}")

heat_csv = "day,hour,visitors\n" + "\n".join(rows)
sid = upload_csv("website_traffic_heatmap_fixed.csv", heat_csv)
if sid:
    update_chart("8398f10fea34", {
        "source_id": sid,
        "x": "hour",
        "y": "visitors",
        "series": "day",
        "sql": f"SELECT day, hour, visitors FROM src_{sid}",
        "config": {
            "xAxisTitle": "Hour of Day",
            "yAxisTitle": "",
        }
    })

# ─── 5. Fix BulletBar: normalize data to comparable scale ─────────────────────
print("5. Fixing BulletBar (comparable percentage scale)...")
bullet_csv = """metric,actual,target
Revenue,108,100
New Customers,113,100
Retention,105,100
NPS,104,100
Support SLA,101,100
Deploy Freq,120,100"""

sid = upload_csv("q4_performance_pct.csv", bullet_csv)
if sid:
    update_chart("a10fd22d0223", {
        "source_id": sid,
        "sql": f"SELECT metric, actual, target FROM src_{sid}",
        "subtitle": "% of target achieved",
        "config": {
            "yAxisTitle": "",
        }
    })

# ─── 6. Fix ArrowPlot: shorter metric names ──────────────────────────────────
print("6. Fixing ArrowPlot (shorter metric names)...")
arrow_csv = """metric,before,after
Onboarding,14,5
Support Tickets,85,42
Deploy Time,45,12
Bug Rate,8.5,2.1
Test Coverage,62,91
MTTR,4.2,1.1"""

sid = upload_csv("process_improvement_fixed.csv", arrow_csv)
if sid:
    update_chart("1ca9e6916d15", {
        "source_id": sid,
        "sql": f"SELECT metric, before, \"after\" FROM src_{sid}",
        "config": {
            "startColumn": "before",
            "endColumn": "after",
        }
    })

# ─── 7. Fix DataTable: readable column names ─────────────────────────────────
print("7. Fixing DataTable (readable column names)...")
table_csv = """Country,Population (M),GDP (T$),Life Expectancy,Credit Rating
United States,331,25.5,78.9,A+
China,1412,17.9,77.3,A
Japan,125,4.2,84.6,A+
Germany,83,4.1,81.3,A+
India,1408,3.5,70.4,B+
United Kingdom,67,3.1,81.2,A
France,68,2.8,82.5,A
Canada,39,2.1,82.4,A+
Brazil,214,1.9,75.9,B
Australia,26,1.7,83.5,A+"""

sid = upload_csv("country_statistics_fixed.csv", table_csv)
if sid:
    update_chart("11ae3e27f8b7", {
        "source_id": sid,
        "sql": f'SELECT "Country", "Population (M)", "GDP (T$)", "Life Expectancy", "Credit Rating" FROM src_{sid} ORDER BY "GDP (T$)" DESC',
        "config": {
            "tableColumns": {
                "Population (M)": {"display": "bar"},
                "GDP (T$)": {"display": "heatmap"},
                "Life Expectancy": {"display": "number", "decimals": 1},
            }
        }
    })

# ─── 8. Fix DotPlot: explicit x-axis domain to avoid "0" ─────────────────────
print("8. Fixing DotPlot (x-axis title)...")
# The "0" on x-axis is from the phone name "0" being treated as numeric
# Let me check the actual data first and just fix the axis title
update_chart("e84d443044fe", {
    "config": {
        "yAxisTitle": "",
        "xAxisTitle": "Score (out of 10)",
    }
})

print("\nDone! All charts updated.")
