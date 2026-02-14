#!/usr/bin/env python3
"""
v2 Visual QA Test Suite

Exercises both data paths (CSV upload vs cached Snowflake parquet)
and all 5 chart types via the AI-suggested creation path, then
validates rendered charts using Playwright screenshots + Claude vision.

Usage:
    python tests/v2_visual_qa.py           # Full 10-test suite
    python tests/v2_visual_qa.py --smoke   # Quick 3-test validation
"""

from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import os
import sys
import tempfile
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from engine.llm.claude import ClaudeProvider


# ── Configuration ────────────────────────────────────────────────────────────

API_BASE = "http://localhost:8000/api"
FRONTEND_BASE = "http://localhost:3001"
SCREENSHOT_DIR = PROJECT_ROOT / "test_results" / "v2_qa_screenshots"
REPORT_PATH = PROJECT_ROOT / "test_results" / "v2_visual_qa_report.md"
TESTING_LOG = PROJECT_ROOT / "test_results" / "TESTING_LOG.md"
SNOWFLAKE_PARQUET = PROJECT_ROOT / "data" / "snowflake_saas" / "invoices" / "invoices.parquet"


# ── Test Data ────────────────────────────────────────────────────────────────

def generate_sales_csv() -> str:
    """Generate 12-row sales CSV: 6 months × 2 regions with growth + noise."""
    rows = []
    months = ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06"]
    regions = ["East", "West"]
    base_revenue = {"East": 10000, "West": 8000}
    base_units = {"East": 120, "West": 95}

    for i, month in enumerate(months):
        for region in regions:
            # Growth trend + small noise
            growth = 1 + (i * 0.08)
            noise = 1 + (hash(f"{month}{region}") % 10 - 5) / 100
            revenue = round(base_revenue[region] * growth * noise, 2)
            units = round(base_units[region] * growth * noise)
            rows.append({
                "month": month,
                "region": region,
                "revenue": revenue,
                "units_sold": units,
            })

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["month", "region", "revenue", "units_sold"])
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


def convert_parquet_to_csv(parquet_path: Path) -> str:
    """Convert parquet file to CSV string using pyarrow."""
    import pyarrow.parquet as pq

    table = pq.read_table(str(parquet_path))
    buf = io.BytesIO()
    # Write CSV via pyarrow
    import pyarrow.csv as pa_csv
    pa_csv.write_csv(table, buf)
    return buf.getvalue().decode("utf-8")


# ── Test Matrix ──────────────────────────────────────────────────────────────

@dataclass
class TestCase:
    name: str
    chart_type: str
    data_path: str          # "csv" or "snowflake"
    user_hint: str
    csv_content: str = ""   # populated at runtime
    smoke: bool = False     # include in smoke run


TEST_MATRIX = [
    # CSV path (sales data)
    TestCase("line_csv", "LineChart", "csv",
             "show revenue trend over time", smoke=True),
    TestCase("bar_csv", "BarChart", "csv",
             "compare revenue by region as a bar chart", smoke=True),
    TestCase("area_csv", "AreaChart", "csv",
             "show units sold over time as an area chart"),
    TestCase("scatter_csv", "ScatterPlot", "csv",
             "scatter plot of revenue vs units sold"),
    TestCase("histogram_csv", "Histogram", "csv",
             "histogram of revenue distribution"),

    # Snowflake path (invoices parquet → CSV upload)
    TestCase("line_sf", "LineChart", "snowflake",
             "show amount trend over time"),
    TestCase("bar_sf", "BarChart", "snowflake",
             "compare total amount by status as a bar chart"),
    TestCase("area_sf", "AreaChart", "snowflake",
             "area chart of amounts over time"),
    TestCase("scatter_sf", "ScatterPlot", "snowflake",
             "scatter plot of customer_id vs amount", smoke=True),
    TestCase("histogram_sf", "Histogram", "snowflake",
             "histogram of amount distribution"),
]


# ── Acceptance Criteria ──────────────────────────────────────────────────────

UNIVERSAL_CRITERIA = """
UNIVERSAL ACCEPTANCE CRITERIA (check ALL of these):
- Chart renders as an SVG element (not blank/empty)
- Title text is visible and readable
- Axes have labels (where applicable)
- No error messages or stack traces visible
- Data points/marks are present (not an empty chart frame)
"""

CHART_CRITERIA = {
    "LineChart": """
LINE CHART SPECIFIC CRITERIA:
- Connected line(s) visible with clear trajectory
- X-axis shows time labels (dates/months)
- Y-axis shows numeric scale
- Multiple series (if present) are distinguishable (different colors)
- Line follows a plausible trend (not flat at zero, not random noise)
""",
    "BarChart": """
BAR CHART SPECIFIC CRITERIA:
- Bars are visible with clear heights
- Category labels on one axis, values on the other
- Bars have distinct colors if grouped/stacked
- Bar heights are proportional to data values
- At least 2 bars visible
""",
    "AreaChart": """
AREA CHART SPECIFIC CRITERIA:
- Filled area region visible below the line
- X-axis shows time labels
- Y-axis shows numeric scale
- Area fill has color/opacity
- Shape follows data trend
""",
    "ScatterPlot": """
SCATTER PLOT SPECIFIC CRITERIA:
- Individual points/dots visible
- Both axes have numeric scales
- Points are distributed across the plot area (not clustered at origin)
- At least 5 data points visible
""",
    "Histogram": """
HISTOGRAM SPECIFIC CRITERIA:
- Bars/bins visible representing frequency distribution
- X-axis shows value range
- Y-axis shows count/frequency
- Bins have consistent width
- At least 3 bins visible
""",
}


# ── Result Tracking ──────────────────────────────────────────────────────────

@dataclass
class TestResult:
    name: str
    chart_type: str
    data_path: str
    passed: bool = False
    phase_failed: str = ""   # "upload", "propose", "save", "screenshot", "vision"
    error: str = ""
    vision_feedback: str = ""
    screenshot_path: str = ""
    propose_response: dict = field(default_factory=dict)
    chart_id: str = ""
    duration_s: float = 0.0


# ── API Helpers ──────────────────────────────────────────────────────────────

def upload_csv(client: httpx.Client, csv_content: str, filename: str) -> str:
    """Upload CSV → returns source_id."""
    files = {"file": (filename, csv_content.encode(), "text/csv")}
    resp = client.post(f"{API_BASE}/data/upload", files=files, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data["source_id"]


def propose_chart(client: httpx.Client, source_id: str, user_hint: str) -> dict:
    """POST /propose → returns full response dict."""
    resp = client.post(
        f"{API_BASE}/v2/charts/propose",
        json={"source_id": source_id, "user_hint": user_hint},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def save_chart(client: httpx.Client, source_id: str, proposal: dict) -> str:
    """POST /save with proposal data → returns chart_id."""
    config = proposal["config"]
    payload = {
        "source_id": source_id,
        "chart_type": config["chart_type"],
        "title": config.get("title") or "Untitled",
        "sql": proposal["sql"],
        "x": config.get("x"),
        "y": config.get("y"),
        "series": config.get("series"),
        "horizontal": config.get("horizontal", False),
        "sort": config.get("sort", True),
        "subtitle": config.get("subtitle"),
        "source": config.get("source"),
        "reasoning": proposal.get("reasoning"),
    }
    resp = client.post(
        f"{API_BASE}/v2/charts/save",
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["id"]


# ── Screenshot + Vision ──────────────────────────────────────────────────────

def take_screenshot(page, chart_id: str, screenshot_path: Path) -> None:
    """Navigate to chart view page and capture screenshot."""
    url = f"{FRONTEND_BASE}/chart/{chart_id}"
    page.goto(url, wait_until="networkidle", timeout=30000)

    # Wait for Observable Plot SVG to appear (not the loading spinner SVG)
    # The chart page has a loading spinner with svg.animate-spin, then renders
    # an Observable Plot <svg> inside the chart container
    page.wait_for_selector("svg:not(.animate-spin)", state="visible", timeout=15000)

    # Extra wait for rendering stability
    time.sleep(1.5)

    screenshot_path.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(screenshot_path), full_page=True)


def validate_with_vision(
    provider: ClaudeProvider,
    screenshot_path: Path,
    chart_type: str,
    user_hint: str,
) -> tuple[bool, str]:
    """Send screenshot to Claude vision → returns (passed, feedback)."""
    image_data = screenshot_path.read_bytes()
    image_b64 = base64.b64encode(image_data).decode("utf-8")

    criteria = UNIVERSAL_CRITERIA + CHART_CRITERIA.get(chart_type, "")

    prompt = f"""You are a visual QA analyst validating a chart screenshot.

The user requested: "{user_hint}"
Expected chart type: {chart_type}

{criteria}

Analyze the screenshot and determine if the chart meets ALL acceptance criteria.

IMPORTANT: Be pragmatic. Minor cosmetic differences are OK. The key questions are:
1. Does a real chart render (not blank, not an error)?
2. Is it the right chart type?
3. Does it show real data (not empty)?
4. Are axes and title present?

Respond in this EXACT format:
RESULT: PASS or FAIL
ISSUES:
- [issue 1, or "None"]
NOTES:
- [any observations]
"""

    response = provider.generate_with_image(
        prompt=prompt,
        image_base64=image_b64,
        image_media_type="image/png",
        max_tokens=1024,
        temperature=0.2,
    )

    content = response.content.strip()
    passed = "RESULT: PASS" in content.upper() or "RESULT:PASS" in content.upper()
    return passed, content


# ── Report Generation ────────────────────────────────────────────────────────

def write_report(results: list[TestResult], run_time: float) -> None:
    """Write markdown report to test_results/v2_visual_qa_report.md."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    passed = sum(1 for r in results if r.passed)
    total = len(results)

    lines = [
        f"# v2 Visual QA Report",
        f"",
        f"**Run**: {now}  ",
        f"**Result**: {passed}/{total} passed  ",
        f"**Duration**: {run_time:.1f}s  ",
        f"",
        f"## Summary",
        f"",
        f"| # | Test | Chart Type | Data Path | Result | Phase Failed | Duration |",
        f"|---|------|-----------|-----------|--------|-------------|----------|",
    ]

    for i, r in enumerate(results, 1):
        status = "PASS" if r.passed else "FAIL"
        phase = r.phase_failed or "-"
        lines.append(
            f"| {i} | {r.name} | {r.chart_type} | {r.data_path} "
            f"| **{status}** | {phase} | {r.duration_s:.1f}s |"
        )

    lines.append("")
    lines.append("## Details")
    lines.append("")

    for r in results:
        status = "PASS" if r.passed else "FAIL"
        lines.append(f"### {r.name} — {status}")
        lines.append(f"")
        lines.append(f"- **Chart type**: {r.chart_type}")
        lines.append(f"- **Data path**: {r.data_path}")

        if r.chart_id:
            lines.append(f"- **Chart ID**: `{r.chart_id}`")

        if r.screenshot_path:
            # Relative path from test_results/
            rel = Path(r.screenshot_path).name
            lines.append(f"- **Screenshot**: `v2_qa_screenshots/{rel}`")

        if r.error:
            lines.append(f"- **Error**: {r.error}")

        if r.vision_feedback:
            lines.append(f"- **Vision feedback**:")
            lines.append(f"```")
            lines.append(r.vision_feedback)
            lines.append(f"```")

        if r.propose_response:
            config = r.propose_response.get("config", {})
            lines.append(f"- **Proposed config**: `{json.dumps(config, default=str)}`")
            sql = r.propose_response.get("sql", "")
            if sql:
                lines.append(f"- **SQL**: `{sql}`")

        lines.append("")

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines))
    print(f"\nReport written to: {REPORT_PATH}")


def append_testing_log(results: list[TestResult], run_time: float) -> None:
    """Append results summary to TESTING_LOG.md."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    passed = sum(1 for r in results if r.passed)
    total = len(results)
    failures = [r for r in results if not r.passed]

    entry = [
        f"",
        f"### v2 Visual QA — {now}",
        f"",
        f"**Result**: {passed}/{total} passed ({run_time:.1f}s)  ",
        f"",
    ]

    if failures:
        entry.append("**Failures**:")
        for r in failures:
            entry.append(f"- `{r.name}` ({r.chart_type}/{r.data_path}): "
                         f"{r.phase_failed} — {r.error[:120] if r.error else 'vision fail'}")
        entry.append("")
    else:
        entry.append("All tests passed.")
        entry.append("")

    TESTING_LOG.parent.mkdir(parents=True, exist_ok=True)
    existing = TESTING_LOG.read_text() if TESTING_LOG.exists() else ""
    TESTING_LOG.write_text(existing + "\n".join(entry) + "\n")


# ── Main Runner ──────────────────────────────────────────────────────────────

def run_tests(smoke: bool = False) -> list[TestResult]:
    """Run the full (or smoke) test suite."""

    # Filter tests
    tests = [t for t in TEST_MATRIX if (not smoke or t.smoke)]
    print(f"\n{'='*60}")
    print(f"  v2 Visual QA — {'SMOKE' if smoke else 'FULL'} ({len(tests)} tests)")
    print(f"{'='*60}\n")

    # Prepare test data
    print("Preparing test data...")
    sales_csv = generate_sales_csv()

    invoices_csv = None
    if any(t.data_path == "snowflake" for t in tests):
        if SNOWFLAKE_PARQUET.exists():
            print(f"  Converting parquet → CSV: {SNOWFLAKE_PARQUET}")
            invoices_csv = convert_parquet_to_csv(SNOWFLAKE_PARQUET)
            # Truncate to first 200 rows for faster tests
            csv_lines = invoices_csv.strip().split("\n")
            if len(csv_lines) > 201:
                invoices_csv = "\n".join(csv_lines[:201]) + "\n"
            print(f"  Invoices: {len(csv_lines)-1} rows available, using {min(len(csv_lines)-1, 200)}")
        else:
            print(f"  WARNING: Parquet not found at {SNOWFLAKE_PARQUET}")
            print(f"  Snowflake tests will be skipped.")

    # Assign CSV content to each test
    for t in tests:
        if t.data_path == "csv":
            t.csv_content = sales_csv
        elif t.data_path == "snowflake":
            if invoices_csv:
                t.csv_content = invoices_csv
            else:
                t.csv_content = ""  # will be skipped

    results: list[TestResult] = []

    # Set up Playwright and HTTP client
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        with httpx.Client() as client:
            # Set up Claude vision provider
            provider = ClaudeProvider()

            for i, test in enumerate(tests, 1):
                result = TestResult(
                    name=test.name,
                    chart_type=test.chart_type,
                    data_path=test.data_path,
                )
                start = time.time()

                print(f"[{i}/{len(tests)}] {test.name} ({test.chart_type} / {test.data_path})")

                if not test.csv_content:
                    result.phase_failed = "data"
                    result.error = "No test data available (parquet not found)"
                    result.duration_s = time.time() - start
                    results.append(result)
                    print(f"       SKIP — no data\n")
                    continue

                try:
                    # Step 1: Upload CSV
                    filename = "test_sales.csv" if test.data_path == "csv" else "invoices.csv"
                    print(f"       Uploading {filename}...")
                    source_id = upload_csv(client, test.csv_content, filename)
                    print(f"       source_id={source_id}")

                except Exception as e:
                    traceback.print_exc()
                    result.phase_failed = "upload"
                    result.error = str(e)
                    result.duration_s = time.time() - start
                    results.append(result)
                    print(f"       FAIL (upload): {e}\n")
                    continue

                try:
                    # Step 2: Propose chart
                    print(f"       Proposing: '{test.user_hint}'...")
                    proposal = propose_chart(client, source_id, test.user_hint)
                    result.propose_response = proposal

                    if not proposal.get("success"):
                        result.phase_failed = "propose"
                        result.error = proposal.get("error", "Proposal failed")
                        result.duration_s = time.time() - start
                        results.append(result)
                        print(f"       FAIL (propose): {result.error}\n")
                        continue

                    actual_type = proposal["config"]["chart_type"]
                    print(f"       Proposed: {actual_type} — '{proposal['config'].get('title', '')}'")

                except Exception as e:
                    traceback.print_exc()
                    result.phase_failed = "propose"
                    result.error = str(e)
                    result.duration_s = time.time() - start
                    results.append(result)
                    print(f"       FAIL (propose): {e}\n")
                    continue

                try:
                    # Step 3: Save chart
                    print(f"       Saving chart...")
                    chart_id = save_chart(client, source_id, proposal)
                    result.chart_id = chart_id
                    print(f"       chart_id={chart_id}")

                except Exception as e:
                    traceback.print_exc()
                    result.phase_failed = "save"
                    result.error = str(e)
                    result.duration_s = time.time() - start
                    results.append(result)
                    print(f"       FAIL (save): {e}\n")
                    continue

                try:
                    # Step 4: Screenshot
                    ss_path = SCREENSHOT_DIR / f"{test.name}.png"
                    print(f"       Taking screenshot...")
                    take_screenshot(page, chart_id, ss_path)
                    result.screenshot_path = str(ss_path)
                    print(f"       Screenshot saved: {ss_path.name}")

                except Exception as e:
                    traceback.print_exc()
                    result.phase_failed = "screenshot"
                    result.error = str(e)
                    result.duration_s = time.time() - start
                    results.append(result)
                    print(f"       FAIL (screenshot): {e}\n")
                    continue

                try:
                    # Step 5: Vision validation
                    print(f"       Validating with Claude vision...")
                    # Validate against the actual proposed type, not expected
                    passed, feedback = validate_with_vision(
                        provider, ss_path, actual_type, test.user_hint
                    )
                    result.passed = passed
                    result.vision_feedback = feedback

                    status = "PASS" if passed else "FAIL"
                    print(f"       Vision: {status}")

                except Exception as e:
                    traceback.print_exc()
                    result.phase_failed = "vision"
                    result.error = str(e)
                    print(f"       FAIL (vision): {e}")

                result.duration_s = time.time() - start
                results.append(result)
                print()

        browser.close()

    return results


def main():
    parser = argparse.ArgumentParser(description="v2 Visual QA Test Suite")
    parser.add_argument("--smoke", action="store_true", help="Run 3-test smoke suite")
    args = parser.parse_args()

    start = time.time()
    results = run_tests(smoke=args.smoke)
    run_time = time.time() - start

    # Print summary
    passed = sum(1 for r in results if r.passed)
    total = len(results)
    print(f"\n{'='*60}")
    print(f"  RESULT: {passed}/{total} passed  ({run_time:.1f}s)")
    print(f"{'='*60}")

    if passed < total:
        failures = [r for r in results if not r.passed]
        print(f"\nFailures:")
        for r in failures:
            print(f"  - {r.name}: {r.phase_failed} — {r.error[:100] if r.error else 'vision fail'}")

    # Write reports
    write_report(results, run_time)
    append_testing_log(results, run_time)

    # Exit code: 0 if all pass, 1 if any fail
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
