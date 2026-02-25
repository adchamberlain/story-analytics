#!/usr/bin/env python3
"""Create 'The Perfect Dashboard' with all 25 chart types."""

import csv
import io
import json
import math
import random
import requests
import time

BASE = "http://localhost:8000/api"
random.seed(42)

# ── helpers ──────────────────────────────────────────────────────────────
def upload_csv(name: str, rows: list[dict]) -> str:
    """Upload CSV data and return source_id."""
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)
    buf.seek(0)
    resp = requests.post(
        f"{BASE}/data/upload",
        files={"file": (name, buf.getvalue(), "text/csv")},
    )
    resp.raise_for_status()
    sid = resp.json()["source_id"]
    print(f"  ✓ Uploaded {name} → {sid}")
    return sid


def save_chart(payload: dict) -> str:
    """Save a chart and return its ID."""
    resp = requests.post(f"{BASE}/v2/charts/save", json=payload)
    resp.raise_for_status()
    cid = resp.json()["id"]
    print(f"  ✓ Chart '{payload['title']}' → {cid}")
    return cid


def create_dashboard(title, description, chart_ids):
    """Create a dashboard from chart IDs, arranging in a 2-column grid."""
    charts = []
    for i, cid in enumerate(chart_ids):
        col = i % 2          # 0 = left, 1 = right
        row = (i // 2) * 5   # each row is 5 units tall
        charts.append({
            "chart_id": cid,
            "width": "half",
            "layout": {"x": col, "y": row, "w": 1, "h": 5},
        })
    resp = requests.post(f"{BASE}/v2/dashboards/", json={
        "title": title,
        "description": description,
        "charts": charts,
    })
    resp.raise_for_status()
    did = resp.json()["id"]
    print(f"\n✓ Dashboard '{title}' → {did}")
    return did


def base_config(**overrides):
    cfg = {
        "stacked": False,
        "showGrid": True,
        "showLegend": True,
        "showValues": False,
        "palette": "default",
        "xAxisTitle": "",
        "yAxisTitle": "",
        "aggregation": "none",
        "timeGrain": "none",
        "dataMode": "table",
        "annotations": {"lines": [], "texts": [], "ranges": []},
    }
    cfg.update(overrides)
    return cfg


# ── 1. LineChart ─────────────────────────────────────────────────────────
def make_line_chart():
    print("\n1. LineChart – Monthly S&P 500 closing price")
    base = 4200
    rows = []
    for m in range(24):
        y = 2024 + m // 12
        mo = (m % 12) + 1
        base += random.gauss(35, 60)
        rows.append({"date": f"{y}-{mo:02d}-01", "sp500": round(base, 1)})
    sid = upload_csv("sp500-monthly.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "LineChart",
        "title": "S&P 500 Monthly Close",
        "subtitle": "Steady growth with volatility, 2024–2025",
        "sql": f'SELECT date, sp500 FROM src_{sid} ORDER BY date LIMIT 5000',
        "x": "date", "y": "sp500", "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(yAxisTitle="Index Value", lineWidth=2.5),
    })


# ── 2. BarChart ──────────────────────────────────────────────────────────
def make_bar_chart():
    print("\n2. BarChart – Top programming languages")
    langs = [
        ("Python", 31.5), ("JavaScript", 18.2), ("Java", 12.4),
        ("TypeScript", 9.8), ("C++", 8.1), ("Go", 5.6),
        ("Rust", 4.3), ("PHP", 3.9),
    ]
    rows = [{"language": l, "popularity": v} for l, v in langs]
    sid = upload_csv("lang-popularity.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "BarChart",
        "title": "Top Programming Languages 2025",
        "subtitle": "% of developers using each language",
        "sql": f'SELECT language, popularity FROM src_{sid} ORDER BY popularity DESC LIMIT 5000',
        "x": "language", "y": "popularity", "series": None,
        "horizontal": False, "sort": True,
        "config": base_config(yAxisTitle="Popularity (%)", palette="bold"),
    })


# ── 3. AreaChart ─────────────────────────────────────────────────────────
def make_area_chart():
    print("\n3. AreaChart – Streaming platform subscribers")
    rows = []
    netflix, disney, hbo = 220, 160, 75
    for m in range(24):
        y = 2024 + m // 12
        mo = (m % 12) + 1
        netflix += random.gauss(2, 3)
        disney += random.gauss(3, 2.5)
        hbo += random.gauss(1, 2)
        d = f"{y}-{mo:02d}-01"
        rows.append({"date": d, "Netflix": round(netflix, 1),
                      "Disney+": round(disney, 1), "Max": round(hbo, 1)})
    sid = upload_csv("streaming-subs.csv", rows)
    sql = (
        f'SELECT date, metric_name, metric_value '
        f'FROM (SELECT date, "Netflix", "Disney+", "Max" FROM src_{sid}) '
        f'UNPIVOT (metric_value FOR metric_name IN ("Netflix", "Disney+", "Max")) '
        f'ORDER BY date LIMIT 5000'
    )
    return save_chart({
        "source_id": sid, "chart_type": "AreaChart",
        "title": "Streaming Wars: Subscriber Growth",
        "subtitle": "Global subscribers in millions, 2024–2025",
        "sql": sql,
        "x": "date", "y": ["Netflix", "Disney+", "Max"], "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(yAxisTitle="Subscribers (M)", stacked=False, palette="vivid"),
    })


# ── 4. ScatterPlot ───────────────────────────────────────────────────────
def make_scatter_plot():
    print("\n4. ScatterPlot – Study hours vs exam score")
    rows = []
    for _ in range(80):
        hours = round(random.uniform(0.5, 12), 1)
        score = round(min(100, max(20, 30 + hours * 5.5 + random.gauss(0, 8))), 1)
        rows.append({"study_hours": hours, "exam_score": score})
    sid = upload_csv("study-vs-score.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "ScatterPlot",
        "title": "Study Hours vs. Exam Score",
        "subtitle": "Clear positive correlation (r ≈ 0.87)",
        "sql": f'SELECT study_hours, exam_score FROM src_{sid} LIMIT 5000',
        "x": "study_hours", "y": "exam_score", "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(xAxisTitle="Hours Studied", yAxisTitle="Exam Score", markerSize=5),
    })


# ── 5. Histogram ─────────────────────────────────────────────────────────
def make_histogram():
    print("\n5. Histogram – API response times")
    rows = [{"response_ms": round(random.lognormvariate(4.5, 0.6), 1)} for _ in range(500)]
    sid = upload_csv("api-response-times.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "Histogram",
        "title": "API Response Time Distribution",
        "subtitle": "Log-normal distribution, median ≈ 90ms",
        "sql": f'SELECT response_ms FROM src_{sid} LIMIT 5000',
        "x": "response_ms", "y": None, "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(xAxisTitle="Response Time (ms)", yAxisTitle="Frequency"),
    })


# ── 6. HeatMap ───────────────────────────────────────────────────────────
def make_heatmap():
    print("\n6. HeatMap – Website traffic by day × hour")
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    rows = []
    for d in days:
        for h in range(0, 24, 3):
            is_weekend = d in ("Saturday", "Sunday")
            base_val = 40 if is_weekend else 80
            peak = 1.8 if 9 <= h <= 17 and not is_weekend else (1.3 if 12 <= h <= 20 and is_weekend else 0.5)
            val = round(base_val * peak + random.gauss(0, 10))
            rows.append({"day": d, "hour": f"{h:02d}:00", "visitors": max(5, val)})
    sid = upload_csv("website-traffic-heatmap.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "HeatMap",
        "title": "Website Traffic Heatmap",
        "subtitle": "Average visitors per 3-hour block",
        "sql": f'SELECT hour, visitors, day FROM src_{sid} LIMIT 5000',
        "x": "hour", "y": "visitors", "series": "day",
        "horizontal": False, "sort": False,
        "config": base_config(xAxisTitle="Hour of Day", yAxisTitle="Visitors"),
    })


# ── 7. BoxPlot ───────────────────────────────────────────────────────────
def make_boxplot():
    print("\n7. BoxPlot – Salary distribution by department")
    depts = {"Engineering": (130, 30), "Marketing": (95, 20), "Sales": (85, 25),
             "Design": (105, 22), "Finance": (115, 28)}
    rows = []
    for dept, (mu, sigma) in depts.items():
        for _ in range(40):
            rows.append({"department": dept, "salary_k": round(random.gauss(mu, sigma), 1)})
    sid = upload_csv("salary-by-dept.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "BoxPlot",
        "title": "Salary Distribution by Department",
        "subtitle": "Engineering leads in both median and variance",
        "sql": f'SELECT department, salary_k FROM src_{sid} LIMIT 5000',
        "x": "department", "y": "salary_k", "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(yAxisTitle="Salary ($K)"),
    })


# ── 8. PieChart ──────────────────────────────────────────────────────────
def make_pie_chart():
    print("\n8. PieChart – Cloud market share")
    data = [("AWS", 31), ("Azure", 25), ("Google Cloud", 11),
            ("Alibaba", 5), ("Others", 28)]
    rows = [{"provider": p, "share": v} for p, v in data]
    sid = upload_csv("cloud-market-share.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "PieChart",
        "title": "Cloud Infrastructure Market Share",
        "subtitle": "AWS maintains lead, Azure closing gap",
        "sql": f'SELECT provider, share FROM src_{sid} LIMIT 5000',
        "x": "provider", "y": "share", "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(palette="vivid"),
    })


# ── 9. Treemap ───────────────────────────────────────────────────────────
def make_treemap():
    print("\n9. Treemap – Federal budget allocation")
    items = [
        ("Social Security", 1340), ("Healthcare", 1090), ("Defense", 886),
        ("Interest on Debt", 640), ("Income Security", 520),
        ("Veterans Benefits", 302), ("Education", 238), ("Transportation", 134),
        ("Science & Tech", 98), ("International Affairs", 72),
    ]
    rows = [{"category": c, "spending_b": v} for c, v in items]
    sid = upload_csv("federal-budget.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "Treemap",
        "title": "U.S. Federal Budget Allocation",
        "subtitle": "FY 2025 spending in billions of dollars",
        "sql": f'SELECT category, spending_b FROM src_{sid} LIMIT 5000',
        "x": "category", "y": "spending_b", "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(palette="bold"),
    })


# ── 10. DataTable ────────────────────────────────────────────────────────
def make_data_table():
    print("\n10. DataTable – Country statistics")
    countries = [
        ("United States", 331, 25.5, 78.9, "A+"),
        ("China", 1412, 17.9, 77.3, "A"),
        ("Japan", 125, 4.2, 84.6, "A+"),
        ("Germany", 83, 4.1, 81.3, "A+"),
        ("India", 1408, 3.5, 70.4, "B+"),
        ("United Kingdom", 67, 3.1, 81.2, "A"),
        ("France", 68, 2.8, 82.5, "A"),
        ("Brazil", 214, 1.9, 75.9, "B"),
        ("Canada", 39, 2.1, 82.4, "A+"),
        ("Australia", 26, 1.7, 83.5, "A+"),
    ]
    rows = [{"country": c, "population_m": p, "gdp_t": g, "life_expectancy": le, "credit_rating": cr}
            for c, p, g, le, cr in countries]
    sid = upload_csv("country-stats.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "DataTable",
        "title": "Global Country Statistics",
        "subtitle": "Key metrics for top 10 economies",
        "sql": f'SELECT country, population_m, gdp_t, life_expectancy, credit_rating FROM src_{sid} ORDER BY gdp_t DESC LIMIT 5000',
        "x": None, "y": None, "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(
            tableColumns={
                "population_m": {"type": "bar", "barColor": "#6366f1"},
                "gdp_t": {"type": "heatmap", "format": "number", "heatmapColors": ["#dbeafe", "#1d4ed8"]},
                "life_expectancy": {"type": "number", "format": "number"},
            }
        ),
    })


# ── 11. BigValue ─────────────────────────────────────────────────────────
def make_big_value():
    print("\n11. BigValue – SaaS KPI metrics")
    rows = [
        {"metric": "Monthly Revenue", "value": 2450000, "target": 2300000},
        {"metric": "Active Users", "value": 184500, "target": 175000},
        {"metric": "Churn Rate", "value": 2.1, "target": 3.0},
        {"metric": "NPS Score", "value": 72, "target": 65},
    ]
    sid = upload_csv("saas-kpis.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "BigValue",
        "title": "SaaS Dashboard KPIs",
        "subtitle": "All metrics trending above target",
        "sql": f'SELECT * FROM src_{sid}',
        "x": None, "y": None, "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(
            value="value", metricLabel="metric",
            comparisonValue="target", comparisonLabel="vs. target",
            positiveIsGood=True,
        ),
    })


# ── 12. DotPlot ──────────────────────────────────────────────────────────
def make_dot_plot():
    print("\n12. DotPlot – Customer satisfaction scores")
    products = ["iPhone 16", "Pixel 9", "Galaxy S25", "OnePlus 13", "Nothing Phone 3"]
    rows = []
    for p in products:
        for cat in ["Design", "Performance", "Camera"]:
            rows.append({"product": p, "category": cat,
                         "score": round(random.uniform(6.5, 9.8), 1)})
    sid = upload_csv("phone-satisfaction.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "DotPlot",
        "title": "Smartphone Satisfaction Scores",
        "subtitle": "Ratings out of 10 across key dimensions",
        "sql": f'SELECT product, score, category FROM src_{sid} LIMIT 5000',
        "x": "score", "y": "product", "series": "category",
        "horizontal": False, "sort": False,
        "config": base_config(xAxisTitle="Score (out of 10)", markerSize=7, palette="vivid"),
    })


# ── 13. RangePlot ────────────────────────────────────────────────────────
def make_range_plot():
    print("\n13. RangePlot – Temperature ranges by city")
    cities = [
        ("Phoenix", 13, 42), ("Miami", 18, 35), ("Chicago", -5, 33),
        ("New York", -2, 32), ("Seattle", 3, 27), ("Denver", -7, 34),
        ("Anchorage", -15, 18), ("Honolulu", 20, 32),
    ]
    rows = [{"city": c, "min_temp_c": lo, "max_temp_c": hi} for c, lo, hi in cities]
    sid = upload_csv("city-temp-ranges.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "RangePlot",
        "title": "Annual Temperature Ranges by City",
        "subtitle": "Min to max temperatures in °C",
        "sql": f'SELECT city, min_temp_c, max_temp_c FROM src_{sid} LIMIT 5000',
        "x": "city", "y": None, "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(
            minColumn="min_temp_c", maxColumn="max_temp_c",
            yAxisTitle="Temperature (°C)",
        ),
    })


# ── 14. BulletBar ────────────────────────────────────────────────────────
def make_bullet_bar():
    print("\n14. BulletBar – Q4 targets vs actuals")
    metrics = [
        ("Revenue", 920, 850), ("New Customers", 1240, 1100),
        ("Retention", 94, 90), ("NPS", 68, 60),
        ("Support SLA", 97, 95), ("Deploy Freq", 48, 40),
    ]
    rows = [{"metric": m, "actual": a, "target": t} for m, a, t in metrics]
    sid = upload_csv("q4-targets.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "BulletBar",
        "title": "Q4 Performance vs. Targets",
        "subtitle": "All key metrics exceeded their targets",
        "sql": f'SELECT metric, actual, target FROM src_{sid} LIMIT 5000',
        "x": "metric", "y": "actual", "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(targetColumn="target", palette="bold"),
    })


# ── 15. SmallMultiples ───────────────────────────────────────────────────
def make_small_multiples():
    print("\n15. SmallMultiples – Regional sales trends")
    regions = ["North America", "Europe", "Asia Pacific", "Latin America"]
    rows = []
    for reg in regions:
        base = random.uniform(50, 120)
        for m in range(12):
            base += random.gauss(3, 5)
            rows.append({
                "month": f"2025-{m+1:02d}-01",
                "revenue_m": round(max(20, base), 1),
                "region": reg,
            })
    sid = upload_csv("regional-sales.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "SmallMultiples",
        "title": "Sales Trends by Region",
        "subtitle": "Monthly revenue in millions, 2025",
        "sql": f'SELECT month, revenue_m, region FROM src_{sid} ORDER BY month LIMIT 5000',
        "x": "month", "y": "revenue_m", "series": "region",
        "horizontal": False, "sort": False,
        "config": base_config(
            facetColumn="region", chartSubtype="line",
            yAxisTitle="Revenue ($M)",
        ),
    })


# ── 16. ChoroplethMap ────────────────────────────────────────────────────
def make_choropleth():
    print("\n16. ChoroplethMap – US population by state")
    states = {
        "California": 39.5, "Texas": 30.0, "Florida": 22.2, "New York": 19.7,
        "Pennsylvania": 13.0, "Illinois": 12.5, "Ohio": 11.8, "Georgia": 10.9,
        "North Carolina": 10.7, "Michigan": 10.0, "New Jersey": 9.3,
        "Virginia": 8.6, "Washington": 7.8, "Arizona": 7.4, "Tennessee": 7.1,
        "Massachusetts": 7.0, "Indiana": 6.8, "Missouri": 6.2, "Maryland": 6.2,
        "Wisconsin": 5.9, "Colorado": 5.8, "Minnesota": 5.7, "South Carolina": 5.2,
        "Alabama": 5.0, "Louisiana": 4.6, "Kentucky": 4.5, "Oregon": 4.2,
        "Oklahoma": 4.0, "Connecticut": 3.6, "Utah": 3.4, "Iowa": 3.2,
        "Nevada": 3.2, "Arkansas": 3.0, "Mississippi": 2.9, "Kansas": 2.9,
        "New Mexico": 2.1, "Nebraska": 2.0, "Idaho": 2.0, "West Virginia": 1.8,
        "Hawaii": 1.4, "New Hampshire": 1.4, "Maine": 1.4, "Montana": 1.1,
        "Rhode Island": 1.1, "Delaware": 1.0, "South Dakota": 0.9,
        "North Dakota": 0.8, "Alaska": 0.7, "Vermont": 0.6, "Wyoming": 0.6,
        "District of Columbia": 0.7,
    }
    rows = [{"state": s, "population_m": p} for s, p in states.items()]
    sid = upload_csv("us-population.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "ChoroplethMap",
        "title": "U.S. Population by State",
        "subtitle": "Millions of residents, 2025 estimate",
        "sql": f'SELECT state, population_m FROM src_{sid} LIMIT 5000',
        "x": "state", "y": "population_m", "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(
            basemap="us-states",
            geoJoinColumn="state", geoValueColumn="population_m",
            geoColorScale="sequential",
        ),
    })


# ── 17. SymbolMap ────────────────────────────────────────────────────────
def make_symbol_map():
    print("\n17. SymbolMap – World's largest cities")
    cities = [
        ("Tokyo", 35.68, 139.69, 37.4), ("Delhi", 28.61, 77.21, 32.9),
        ("Shanghai", 31.23, 121.47, 29.2), ("São Paulo", -23.55, -46.63, 22.4),
        ("Mexico City", 19.43, -99.13, 21.8), ("Cairo", 30.04, 31.24, 21.3),
        ("Mumbai", 19.08, 72.88, 21.0), ("Beijing", 39.90, 116.40, 20.9),
        ("Dhaka", 23.81, 90.41, 22.5), ("Osaka", 34.69, 135.50, 19.1),
        ("New York", 40.71, -74.01, 18.8), ("Karachi", 24.86, 67.01, 16.8),
        ("Istanbul", 41.01, 28.98, 15.6), ("Buenos Aires", -34.60, -58.38, 15.4),
        ("Lagos", 6.52, 3.38, 15.3),
    ]
    rows = [{"city": c, "lat": la, "lon": lo, "population_m": p} for c, la, lo, p in cities]
    sid = upload_csv("world-cities.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "SymbolMap",
        "title": "World's Largest Metropolitan Areas",
        "subtitle": "Population in millions, circle size proportional",
        "sql": f'SELECT city, lat, lon, population_m FROM src_{sid} LIMIT 5000',
        "x": None, "y": None, "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(
            basemap="world",
            geoLatColumn="lat", geoLonColumn="lon",
            geoSizeColumn="population_m",
            geoSizeRange=[4, 28],
        ),
    })


# ── 18. LocatorMap ───────────────────────────────────────────────────────
def make_locator_map():
    print("\n18. LocatorMap – Famous world landmarks")
    lm = [
        ("Eiffel Tower", 48.858, 2.295), ("Statue of Liberty", 40.689, -74.045),
        ("Colosseum", 41.890, 12.492), ("Taj Mahal", 27.175, 78.042),
        ("Great Wall", 40.432, 116.570), ("Machu Picchu", -13.163, -72.545),
        ("Sydney Opera", -33.857, 151.215), ("Christ Redeemer", -22.952, -43.211),
        ("Big Ben", 51.501, -0.125), ("Pyramids of Giza", 29.979, 31.134),
    ]
    rows = [{"landmark": n, "lat": la, "lon": lo} for n, la, lo in lm]
    sid = upload_csv("world-landmarks.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "LocatorMap",
        "title": "Famous World Landmarks",
        "subtitle": "10 iconic sites across the globe",
        "sql": f'SELECT landmark, lat, lon FROM src_{sid} LIMIT 5000',
        "x": None, "y": None, "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(
            basemap="world",
            geoLatColumn="lat", geoLonColumn="lon",
            geoLabelColumn="landmark",
        ),
    })


# ── 19. SpikeMap ─────────────────────────────────────────────────────────
def make_spike_map():
    print("\n19. SpikeMap – US earthquake magnitudes")
    quakes = [
        (61.22, -149.90, 7.1), (34.05, -118.24, 6.4), (36.23, -120.31, 5.8),
        (47.61, -122.33, 5.2), (19.90, -155.58, 6.9), (35.69, -97.35, 5.6),
        (38.58, -121.49, 4.7), (40.71, -74.01, 3.2), (33.45, -111.95, 4.1),
        (32.72, -117.16, 5.0), (37.77, -122.42, 4.8), (45.52, -122.68, 3.9),
        (39.74, -104.99, 3.5), (30.27, -97.74, 3.8), (29.76, -95.37, 4.2),
    ]
    rows = [{"lat": la, "lon": lo, "magnitude": m} for la, lo, m in quakes]
    sid = upload_csv("us-earthquakes.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "SpikeMap",
        "title": "Notable U.S. Earthquakes",
        "subtitle": "Spike height represents magnitude",
        "sql": f'SELECT lat, lon, magnitude FROM src_{sid} LIMIT 5000',
        "x": None, "y": None, "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(
            basemap="us-states",
            geoLatColumn="lat", geoLonColumn="lon",
            geoSizeColumn="magnitude",
        ),
    })


# ── 20. StackedColumn ───────────────────────────────────────────────────
def make_stacked_column():
    print("\n20. StackedColumn – Revenue by product category")
    quarters = ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024", "Q1 2025", "Q2 2025"]
    rows = []
    for q in quarters:
        rows.append({"quarter": q, "Hardware": random.randint(200, 350),
                      "Software": random.randint(400, 600),
                      "Services": random.randint(150, 280)})
    sid = upload_csv("revenue-by-category.csv", rows)
    sql = (
        f'SELECT quarter, metric_name, metric_value '
        f'FROM (SELECT quarter, "Hardware", "Software", "Services" FROM src_{sid}) '
        f'UNPIVOT (metric_value FOR metric_name IN ("Hardware", "Software", "Services")) '
        f'ORDER BY quarter LIMIT 5000'
    )
    return save_chart({
        "source_id": sid, "chart_type": "StackedColumn",
        "title": "Revenue by Product Category",
        "subtitle": "Software drives growth, services accelerating",
        "sql": sql,
        "x": "quarter", "y": ["Hardware", "Software", "Services"], "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(stacked=True, yAxisTitle="Revenue ($M)", palette="bold"),
    })


# ── 21. GroupedColumn ────────────────────────────────────────────────────
def make_grouped_column():
    print("\n21. GroupedColumn – Team performance H1 vs H2")
    teams = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]
    rows = []
    for t in teams:
        rows.append({"team": t,
                      "H1_2025": random.randint(70, 100),
                      "H2_2025": random.randint(75, 105)})
    sid = upload_csv("team-performance.csv", rows)
    sql = (
        f'SELECT team, metric_name, metric_value '
        f'FROM (SELECT team, "H1_2025", "H2_2025" FROM src_{sid}) '
        f'UNPIVOT (metric_value FOR metric_name IN ("H1_2025", "H2_2025")) '
        f'LIMIT 5000'
    )
    return save_chart({
        "source_id": sid, "chart_type": "GroupedColumn",
        "title": "Team Performance: H1 vs H2",
        "subtitle": "Completion rate (%) by team and half-year",
        "sql": sql,
        "x": "team", "y": ["H1_2025", "H2_2025"], "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(yAxisTitle="Completion Rate (%)", palette="vivid"),
    })


# ── 22. SplitBars ───────────────────────────────────────────────────────
def make_split_bars():
    print("\n22. SplitBars – Survey: Male vs Female responses")
    topics = ["Work-Life Balance", "Career Growth", "Compensation",
              "Company Culture", "Management", "Benefits"]
    rows = [{"topic": t, "male_pct": random.randint(40, 92), "female_pct": random.randint(45, 95)}
            for t in topics]
    sid = upload_csv("survey-gender.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "SplitBars",
        "title": "Employee Survey: Response by Gender",
        "subtitle": "% satisfied, male (left) vs female (right)",
        "sql": f'SELECT topic, male_pct, female_pct FROM src_{sid} LIMIT 5000',
        "x": "topic", "y": None, "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(
            leftColumn="male_pct", rightColumn="female_pct",
        ),
    })


# ── 23. ArrowPlot ────────────────────────────────────────────────────────
def make_arrow_plot():
    print("\n23. ArrowPlot – Before/After process improvement")
    metrics = [
        ("Onboarding Time", 14, 5), ("Support Tickets/Day", 85, 42),
        ("Deploy Time (min)", 45, 12), ("Bug Escape Rate (%)", 8.5, 3.2),
        ("Test Coverage (%)", 62, 89), ("MTTR (hours)", 4.2, 1.1),
    ]
    rows = [{"metric": m, "before": b, "after": a} for m, b, a in metrics]
    sid = upload_csv("process-improvement.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "ArrowPlot",
        "title": "Process Improvement Results",
        "subtitle": "Before → After values showing dramatic gains",
        "sql": f'SELECT metric, before, after FROM src_{sid} LIMIT 5000',
        "x": "metric", "y": None, "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(startColumn="before", endColumn="after"),
    })


# ── 24. ElectionDonut ────────────────────────────────────────────────────
def make_election_donut():
    print("\n24. ElectionDonut – Parliament seats")
    parties = [
        ("Progressive Alliance", 187), ("Conservative Union", 163),
        ("Liberal Democrats", 52), ("Green Party", 38),
        ("National Front", 29), ("Independents", 16),
    ]
    rows = [{"party": p, "seats": s} for p, s in parties]
    sid = upload_csv("parliament-seats.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "ElectionDonut",
        "title": "Parliament Composition",
        "subtitle": "485 total seats — no single majority",
        "sql": f'SELECT party, seats FROM src_{sid} LIMIT 5000',
        "x": "party", "y": "seats", "series": None,
        "horizontal": False, "sort": False,
        "config": base_config(palette="vivid"),
    })


# ── 25. MultiplePies ─────────────────────────────────────────────────────
def make_multiple_pies():
    print("\n25. MultiplePies – Market share by region")
    regions = ["North America", "Europe", "Asia"]
    companies = ["Acme Corp", "GlobalTech", "NovaSoft", "Others"]
    rows = []
    for reg in regions:
        shares = [random.randint(15, 40) for _ in companies]
        total = sum(shares)
        for comp, s in zip(companies, shares):
            rows.append({"region": reg, "company": comp, "share": round(s / total * 100, 1)})
    sid = upload_csv("market-share-regional.csv", rows)
    return save_chart({
        "source_id": sid, "chart_type": "MultiplePies",
        "title": "Market Share by Region",
        "subtitle": "Regional breakdown shows varying competitive landscapes",
        "sql": f'SELECT company, share, region FROM src_{sid} LIMIT 5000',
        "x": "company", "y": "share", "series": "region",
        "horizontal": False, "sort": False,
        "config": base_config(facetColumn="region", palette="vivid"),
    })


# ── main ─────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("Creating 'The Perfect Dashboard'")
    print("=" * 60)

    chart_ids = []
    makers = [
        make_big_value,        # KPIs up top
        make_line_chart,       # Time series
        make_bar_chart,        # Categorical
        make_area_chart,       # Multi-series area
        make_scatter_plot,     # Correlation
        make_histogram,        # Distribution
        make_stacked_column,   # Stacked
        make_grouped_column,   # Grouped
        make_pie_chart,        # Proportions
        make_treemap,          # Hierarchical
        make_heatmap,          # 2D intensity
        make_boxplot,          # Statistical
        make_dot_plot,         # Dot comparison
        make_range_plot,       # Ranges
        make_bullet_bar,       # Target vs actual
        make_arrow_plot,       # Before/after
        make_split_bars,       # Split comparison
        make_election_donut,   # Donut
        make_multiple_pies,    # Multiple pies
        make_small_multiples,  # Faceted
        make_choropleth,       # Map: choropleth
        make_symbol_map,       # Map: symbols
        make_locator_map,      # Map: locator pins
        make_spike_map,        # Map: spikes
        make_data_table,       # Table
    ]

    for maker in makers:
        cid = maker()
        chart_ids.append(cid)

    print(f"\nTotal charts created: {len(chart_ids)}")

    did = create_dashboard(
        "The Perfect Dashboard",
        "A comprehensive showcase of all 25 chart types — from KPIs and time series to maps and tables.",
        chart_ids,
    )

    print(f"\n{'=' * 60}")
    print(f"🎉 Done! Dashboard ID: {did}")
    print(f"   View at: http://localhost:3001/dashboard/{did}")
    print(f"{'=' * 60}")
    return did


if __name__ == "__main__":
    main()
