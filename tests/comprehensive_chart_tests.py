"""
Comprehensive Chart Tests - Tests diverse chart requests across all LLM providers.

This test suite covers:
- Different chart types (Line, Bar, Area, BigValue, DataTable)
- Different complexity levels (simple to complex)
- Different features (date filters, dropdowns, multiple metrics)
- Edge cases and common user requests

Usage:
  python tests/comprehensive_chart_tests.py                    # Full test suite
  python tests/comprehensive_chart_tests.py --smoke            # Quick smoke test (3 tests)
  python tests/comprehensive_chart_tests.py --provider claude  # Single provider
  python tests/comprehensive_chart_tests.py --auto-start       # Auto-start server if needed
"""

import argparse
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from test_runner import check_server, ensure_server_running, wait_for_server, check_api_keys

from engine.chart_conversation import ChartConversationManager
from engine.qa import DashboardScreenshot, ChartQA, QAResult


# =============================================================================
# TEST CASES - 10 Diverse Chart Requests
# =============================================================================

TEST_CASES = [
    # ==========================================================================
    # SMOKE TESTS (3 basic tests for quick validation)
    # ==========================================================================
    {
        "id": "01_simple_bar",
        "name": "Simple Bar Chart",
        "complexity": "Simple",
        "chart_type": "BarChart",
        "features": ["basic aggregation"],
        "request": "Show me total revenue by customer segment as a bar chart",
        "validation_criteria": [
            "Bar chart is displayed",
            "Shows customer segments on x-axis",
            "Shows revenue values on y-axis",
            "Has appropriate title",
        ],
        "smoke": True,
    },
    {
        "id": "02_time_series_line",
        "name": "Time Series Line Chart",
        "complexity": "Simple",
        "chart_type": "LineChart",
        "features": ["time series", "monthly aggregation"],
        "request": "Create a line chart showing new subscriptions by month over the past year",
        "validation_criteria": [
            "Line chart is displayed",
            "X-axis shows months or dates",
            "Y-axis shows subscription count",
            "Shows multiple months of data with variation",
        ],
        "smoke": True,
    },
    {
        "id": "03_kpi_big_value",
        "name": "KPI Big Value",
        "complexity": "Simple",
        "chart_type": "BigValue",
        "features": ["single metric", "aggregation"],
        "request": "Show me the total number of active customers as a big number KPI",
        "validation_criteria": [
            "Large number is displayed prominently",
            "Has a clear label/title",
            "Shows customer count (not revenue)",
        ],
        "smoke": True,
    },

    # ==========================================================================
    # CORE CHART TYPES
    # ==========================================================================
    {
        "id": "04_multi_line_with_filter",
        "name": "Multi-Line Chart with Date Filter",
        "complexity": "Medium",
        "chart_type": "LineChart",
        "features": ["multiple metrics", "date filter"],
        "request": "Create a line chart with 2 lines: average customer invoice amount and median customer invoice amount, by month. Show the latest 16 months and add a date filter.",
        "validation_criteria": [
            "Line chart with TWO distinct lines",
            "Legend showing both average and median",
            "Date filter/picker is present",
            "Monthly data on x-axis",
        ],
    },
    {
        "id": "05_area_chart_subscriptions",
        "name": "Area Chart with Subscriptions",
        "complexity": "Medium",
        "chart_type": "AreaChart",
        "features": ["time series", "cumulative"],
        "request": "Show me an area chart of subscription count over time, grouped by month",
        "validation_criteria": [
            "Area chart (filled under line) is displayed",
            "Shows subscription counts",
            "Monthly grouping on x-axis",
            "Filled area under the line",
        ],
    },
    {
        "id": "06_grouped_bar_comparison",
        "name": "Dual Y-Axis Bar Chart",
        "complexity": "Medium",
        "chart_type": "BarChart",
        "features": ["dual y-axis", "multiple metrics", "comparison"],
        "request": "Create a bar chart comparing total revenue and total invoice count by customer segment",
        "validation_criteria": [
            "Bar chart is displayed",
            "Legend shows both revenue and invoice count",
            "Customer segments on x-axis",
            "Dual y-axis (left ~100k-300k, right ~100-700) OR both metrics visible",
            "NOTE: Different scales may show as bar+line combo which is acceptable",
        ],
    },
    {
        "id": "07_bar_with_dropdown",
        "name": "Bar Chart with Dropdown Filter",
        "complexity": "Medium",
        "chart_type": "BarChart",
        "features": ["dropdown filter", "dynamic filtering"],
        "request": "Create a bar chart showing revenue by month, with a dropdown filter to select the year",
        "validation_criteria": [
            "Bar chart is displayed",
            "Dropdown filter is present",
            "Shows monthly revenue",
            "Filter appears to be functional",
        ],
    },
    {
        "id": "08_horizontal_bar",
        "name": "Horizontal Bar Chart - Top Items",
        "complexity": "Simple",
        "chart_type": "BarChart",
        "features": ["horizontal orientation", "top N"],
        "request": "Show me a horizontal bar chart of the top 5 customers by total revenue",
        "validation_criteria": [
            "Bar chart is displayed",
            "Bars appear horizontal (or vertical with customer names)",
            "Shows top customers",
            "Revenue values visible",
        ],
    },
    {
        "id": "09_multi_metric_comparison",
        "name": "Multi-Metric Monthly Comparison",
        "complexity": "Complex",
        "chart_type": "LineChart",
        "features": ["multiple metrics", "comparison", "date filter"],
        "request": "Create a line chart comparing new subscriptions and cancelled subscriptions by month over the last 12 months. Add a date range filter.",
        "validation_criteria": [
            "Line chart with TWO lines showing subscription metrics",
            "Legend distinguishing new vs cancelled subscriptions",
            "Date filter/range picker present",
            "Monthly x-axis",
            "Lines show variation over time",
        ],
    },
    {
        "id": "10_complex_filtered_analysis",
        "name": "Complex Filtered Analysis",
        "complexity": "Complex",
        "chart_type": "LineChart",
        "features": ["multiple filters", "time series", "derived metric"],
        "request": "Show me average invoice amount per customer over time as a line chart, with a date range filter. Show data by week for the last 6 months.",
        "validation_criteria": [
            "Line chart is displayed",
            "Shows average (not total) amounts",
            "Date filter is present",
            "Weekly granularity visible",
            "Approximately 6 months of data",
        ],
    },

    # ==========================================================================
    # NATURAL LANGUAGE VARIATIONS - Testing robustness to different input styles
    # ==========================================================================
    {
        "id": "11_question_format",
        "name": "Question Format Request",
        "complexity": "Simple",
        "chart_type": "Any",
        "features": ["question format", "implicit chart type"],
        "request": "What's our total revenue this year?",
        "validation_criteria": [
            "A visualization is displayed (chart or big number)",
            "Shows revenue data",
            "Has a clear title or label",
        ],
    },
    {
        "id": "12_casual_language",
        "name": "Casual/Informal Request",
        "complexity": "Simple",
        "chart_type": "Any",
        "features": ["casual language", "implicit chart type"],
        "request": "gimme a quick breakdown of sales by industry",
        "validation_criteria": [
            "A chart is displayed",
            "Shows breakdown by industry/segment",
            "Data is visible and interpretable",
        ],
    },
    {
        "id": "13_minimal_request",
        "name": "Minimal/Short Request",
        "complexity": "Simple",
        "chart_type": "Any",
        "features": ["minimal input", "implicit details"],
        "request": "monthly revenue trend",
        "validation_criteria": [
            "A chart is displayed",
            "Title or context indicates revenue trend",
            "Chart type is appropriate (line or bar)",
        ],
    },
    {
        "id": "14_verbose_request",
        "name": "Verbose/Detailed Request",
        "complexity": "Medium",
        "chart_type": "LineChart",
        "features": ["verbose input", "multiple requirements"],
        "request": "I need to see a visualization that shows how our subscription numbers have been trending over the past several months. It would be great if we could see this as a line graph with the months on the bottom and the count of subscriptions on the side. Please make sure to include data from the last year or so.",
        "validation_criteria": [
            "Line chart is displayed",
            "Shows subscription data over time",
            "Monthly x-axis",
            "Shows approximately a year of data",
        ],
    },
    {
        "id": "15_business_question",
        "name": "Business Question Format",
        "complexity": "Medium",
        "chart_type": "Any",
        "features": ["business context", "implicit visualization"],
        "request": "Which customer segments are driving the most revenue growth?",
        "validation_criteria": [
            "A chart is displayed",
            "Shows revenue by customer segment",
            "Segments are clearly labeled",
        ],
    },

    # ==========================================================================
    # AGGREGATION VARIATIONS
    # ==========================================================================
    {
        "id": "16_count_distinct",
        "name": "Count Distinct Metric",
        "complexity": "Medium",
        "chart_type": "LineChart",
        "features": ["count distinct", "time series"],
        "request": "Show me the number of unique customers who made purchases each month",
        "validation_criteria": [
            "Chart is displayed",
            "Shows customer counts (not revenue)",
            "Monthly breakdown",
            "Values represent distinct/unique counts",
        ],
    },
    {
        "id": "17_min_max_metrics",
        "name": "Min/Max Aggregation",
        "complexity": "Medium",
        "chart_type": "BarChart",
        "features": ["min aggregation", "max aggregation"],
        "request": "Show me the highest and lowest invoice amounts by customer segment",
        "validation_criteria": [
            "Chart is displayed",
            "Shows both max and min values",
            "Segments visible on axis",
        ],
    },
    {
        "id": "18_percentage_metric",
        "name": "Percentage/Rate Calculation",
        "complexity": "Complex",
        "chart_type": "LineChart",
        "features": ["calculated metric", "ratio"],
        "request": "What is the invoice payment rate (paid invoices / total invoices) by month?",
        "validation_criteria": [
            "Chart is displayed",
            "Shows rate or percentage values",
            "Monthly breakdown",
            "Values appear to be ratios (0-1 or 0-100%)",
        ],
    },
    {
        "id": "19_top_bottom_n",
        "name": "Top and Bottom N Items",
        "complexity": "Medium",
        "chart_type": "BarChart",
        "features": ["top N", "bottom N", "ranking"],
        "request": "Show me the top 10 customers by invoice count",
        "validation_criteria": [
            "Bar chart is displayed",
            "Shows approximately 10 customers",
            "Customers appear ordered by count",
            "Counts are visible",
        ],
    },

    # ==========================================================================
    # TIME-BASED VARIATIONS
    # ==========================================================================
    {
        "id": "20_weekly_revenue",
        "name": "Weekly Revenue Trend",
        "complexity": "Medium",
        "chart_type": "LineChart",
        "features": ["weekly data", "time series"],
        "request": "Show me revenue by week over time",
        "validation_criteria": [
            "Chart is displayed showing revenue over time",
            "Shows weekly data intervals",
            "Revenue values visible on y-axis",
            "Multiple weeks of data points",
        ],
    },
    {
        "id": "21_weekly_granularity",
        "name": "Weekly Time Granularity",
        "complexity": "Medium",
        "chart_type": "LineChart",
        "features": ["weekly data", "time granularity"],
        "request": "Show invoice volume by week",
        "validation_criteria": [
            "Chart is displayed",
            "Shows time-based data",
            "Title indicates invoice volume",
            "Volume/count values visible",
        ],
    },
    {
        "id": "22_quarterly_aggregation",
        "name": "Quarterly Aggregation",
        "complexity": "Medium",
        "chart_type": "BarChart",
        "features": ["quarterly", "time aggregation"],
        "request": "Show total revenue by quarter",
        "validation_criteria": [
            "Chart is displayed",
            "Shows quarterly data (Q1, Q2, etc. or by quarter dates)",
            "Revenue values visible",
            "Multiple quarters shown",
        ],
    },

    # ==========================================================================
    # FILTER VARIATIONS
    # ==========================================================================
    {
        "id": "23_industry_dropdown",
        "name": "Dropdown Filter by Category",
        "complexity": "Medium",
        "chart_type": "BarChart",
        "features": ["dropdown filter", "category filter"],
        "request": "Create a bar chart of monthly revenue with a dropdown to filter by customer industry",
        "validation_criteria": [
            "Bar chart is displayed",
            "Dropdown filter is present",
            "Industry options available",
            "Monthly revenue shown",
        ],
    },
    {
        "id": "24_multiple_filters",
        "name": "Multiple Filter Types",
        "complexity": "Complex",
        "chart_type": "LineChart",
        "features": ["date filter", "dropdown filter", "multiple filters"],
        "request": "Show revenue over time with both a date range filter and a dropdown to select the plan tier",
        "validation_criteria": [
            "Chart is displayed",
            "Date range filter present",
            "Dropdown filter for plan tier present",
            "Both filters appear functional",
        ],
    },

    # ==========================================================================
    # DATA TABLE AND OTHER FORMATS
    # ==========================================================================
    {
        "id": "25_top_customers_list",
        "name": "Top Customers List",
        "complexity": "Simple",
        "chart_type": "Any",
        "features": ["top N", "customer data"],
        "request": "Show me the top 10 customers by revenue",
        "validation_criteria": [
            "Visualization showing customer data is displayed",
            "Shows top customers ranked by revenue",
            "Customer names or identifiers visible",
            "Revenue values or relative amounts shown",
        ],
    },
    {
        "id": "26_single_kpi_revenue",
        "name": "Single Revenue KPI",
        "complexity": "Simple",
        "chart_type": "BigValue",
        "features": ["single metric", "KPI"],
        "request": "What's our total revenue? Just show me the number",
        "validation_criteria": [
            "Large number is displayed",
            "Shows revenue value",
            "Formatted appropriately (likely with K or M suffix)",
        ],
    },

    # ==========================================================================
    # EDGE CASES AND ROBUSTNESS
    # ==========================================================================
    {
        "id": "27_typo_tolerance",
        "name": "Typo/Misspelling Tolerance",
        "complexity": "Simple",
        "chart_type": "BarChart",
        "features": ["typo handling", "robustness"],
        "request": "show me revnue by custmer segmnt",
        "validation_criteria": [
            "A chart is displayed despite typos",
            "Shows revenue data",
            "Shows customer segments",
        ],
    },
    {
        "id": "28_ambiguous_metric",
        "name": "Ambiguous Metric Request",
        "complexity": "Simple",
        "chart_type": "Any",
        "features": ["ambiguous input", "reasonable default"],
        "request": "how are we doing with customers",
        "validation_criteria": [
            "Some visualization is displayed",
            "Shows customer-related data",
            "Interpretation is reasonable",
        ],
    },
    {
        "id": "29_mixed_requirements",
        "name": "Mixed Chart and Table Request",
        "complexity": "Medium",
        "chart_type": "Any",
        "features": ["mixed format", "flexible output"],
        "request": "Give me a summary of revenue by industry - whatever format works best",
        "validation_criteria": [
            "A visualization is displayed",
            "Shows revenue by industry",
            "Format is appropriate (chart or table)",
        ],
    },
    {
        "id": "30_no_explicit_chart_type",
        "name": "No Chart Type Specified",
        "complexity": "Simple",
        "chart_type": "Any",
        "features": ["implicit chart type", "auto-selection"],
        "request": "I want to see our subscription numbers over time",
        "validation_criteria": [
            "A time-series visualization is displayed",
            "Shows subscription data",
            "Time axis is present",
            "Chart type is appropriate (line or area)",
        ],
    },
]


PROVIDERS = ["claude", "openai", "gemini"]
MAX_ATTEMPTS = 3


@dataclass
class TestAttempt:
    """Result from a single test attempt."""
    attempt: int
    success: bool
    sql: str = ""
    sql_valid: bool = False
    screenshot_path: Optional[Path] = None
    qa_result: Optional[QAResult] = None
    error: Optional[str] = None
    error_type: str = "unknown"  # "infrastructure", "pipeline", "qa", "unknown"
    chart_url: Optional[str] = None


@dataclass
class TestCaseResult:
    """Result from testing a single test case with one provider."""
    test_id: str
    test_name: str
    provider: str
    attempts: list[TestAttempt] = field(default_factory=list)
    final_success: bool = False
    attempts_to_success: int = 0

    @property
    def total_attempts(self) -> int:
        return len(self.attempts)


@dataclass
class ProviderSummary:
    """Summary of all test results for a provider."""
    provider: str
    total_tests: int = 0
    passed: int = 0
    failed: int = 0
    infra_failures: int = 0  # Failures due to server/connection issues

    @property
    def pass_rate(self) -> float:
        return (self.passed / self.total_tests * 100) if self.total_tests > 0 else 0


def check_prerequisites() -> tuple[bool, dict[str, bool]]:
    """
    Check all prerequisites before running tests.

    Returns:
        Tuple of (server_ok, api_keys_dict)
    """
    print("\n" + "=" * 70)
    print("CHECKING PREREQUISITES")
    print("=" * 70)

    # Check server
    print("\n1. Evidence Server:")
    status = check_server()
    if status.running:
        print(f"   ✓ Running at {status.url}")
    else:
        print(f"   ✗ NOT RUNNING: {status.error}")
        print("   → Run 'npm run dev' in another terminal, or use --auto-start")

    # Check API keys
    print("\n2. API Keys:")
    api_keys = check_api_keys()
    for provider, available in api_keys.items():
        icon = "✓" if available else "✗"
        status_text = "Available" if available else "Missing"
        print(f"   {icon} {provider.capitalize():10} {status_text}")

    available_providers = [p for p, v in api_keys.items() if v]
    if not available_providers:
        print("\n   ⚠️  No API keys found. Set at least one of:")
        print("      ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY")

    print("=" * 70 + "\n")

    return status.running, api_keys


def run_single_attempt(
    test_case: dict,
    provider: str,
    attempt: int,
    screenshots_dir: Path,
) -> TestAttempt:
    """Run a single test attempt for a test case with a provider."""
    test_id = test_case["id"]
    print(f"\n  [{provider}] Attempt {attempt + 1}/{MAX_ATTEMPTS}")

    result = TestAttempt(attempt=attempt + 1, success=False)

    # Check server before each attempt
    server_status = check_server()
    if not server_status.running:
        result.error = f"Server not running: {server_status.error}"
        result.error_type = "infrastructure"
        print(f"    ⚠️ Server down: {server_status.error}")
        return result

    try:
        # Create fresh conversation manager for each attempt
        manager = ChartConversationManager(provider_name=provider)

        # Disable the pipeline's internal visual QA to avoid redundant
        # Playwright screenshots + Claude vision calls. The test harness
        # runs its own QA validation below.
        if manager._pipeline.quality_validator:
            manager._pipeline.quality_validator.enable_visual_qa = False

        # Process the test request (returns a PROPOSAL, not the final chart)
        response = manager.process_message(test_case["request"])

        if response.error:
            result.error = response.error
            result.error_type = "pipeline"
            print(f"    Pipeline error: {response.error[:100]}...")
            return result

        # The conversation manager has a two-phase flow:
        # 1. First call creates a PROPOSAL (shows SQL preview)
        # 2. User must click "generate" action to create the actual chart
        # We need to send the generate action to complete chart creation
        from engine.chart_conversation import ChartPhase
        if manager.state.phase == ChartPhase.PROPOSING:
            print(f"    Proposal received, sending generate action...")
            response = manager.process_message("__action:generate")

            if response.error:
                result.error = response.error
                result.error_type = "pipeline"
                print(f"    Generation error: {response.error[:100]}...")
                return result

        if not response.chart_url:
            result.error = "No chart URL returned"
            result.error_type = "pipeline"
            print(f"    No chart URL returned")
            return result

        result.chart_url = response.chart_url

        # Get the SQL from the chart
        if manager.state.current_chart:
            result.sql = manager.state.current_chart.sql
            result.sql_valid = bool(result.sql and len(result.sql) > 20)

        # Take screenshot with retry for transient errors
        # Use chart UUID (current_chart_id), not the slug (dashboard_slug)
        # React serves charts at /chart/{uuid}, not /chart/{slug}
        chart_id = manager.state.current_chart_id
        if chart_id:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            screenshot_path = screenshots_dir / f"{test_id}_{provider}_{attempt + 1}_{timestamp}.png"

            # Retry screenshot up to 2 times for connection issues
            for screenshot_attempt in range(2):
                screenshotter = DashboardScreenshot(mode="chart")
                screenshot_result = screenshotter.capture(
                    f"chart/{chart_id}",
                    save_path=screenshot_path,
                    timeout=45000,
                )

                if screenshot_result.success:
                    result.screenshot_path = screenshot_path
                    print(f"    Screenshot: {screenshot_path.name}")
                    break
                elif "ERR_CONNECTION_REFUSED" in str(screenshot_result.error):
                    # Server might have restarted, wait and retry
                    if screenshot_attempt == 0:
                        print(f"    Connection refused, waiting for server...")
                        time.sleep(3)
                        continue
                    result.error = f"Screenshot failed: {screenshot_result.error}"
                    result.error_type = "infrastructure"
                    print(f"    Screenshot failed (infrastructure): {screenshot_result.error[:80]}")
                    return result
                else:
                    result.error = f"Screenshot failed: {screenshot_result.error}"
                    result.error_type = "qa"
                    print(f"    Screenshot failed: {screenshot_result.error[:80]}")
                    return result

            if result.screenshot_path:
                # Run QA validation (always use Claude for consistent validation)
                qa = ChartQA(provider_name="claude")

                # Build validation prompt with test-specific criteria
                validation_context = f"""
Original Request: {test_case['request']}

Expected Chart Type: {test_case['chart_type']}

Validation Criteria:
{chr(10).join('- ' + c for c in test_case['validation_criteria'])}
"""
                result.qa_result = qa.validate(
                    chart_id,
                    validation_context,
                )

                print(f"    QA: {'PASS' if result.qa_result.passed else 'FAIL'}")
                if result.qa_result.summary:
                    print(f"    Summary: {result.qa_result.summary[:100]}...")

                # Determine success
                result.success = (
                    result.sql_valid and
                    result.qa_result.passed and
                    len(result.qa_result.critical_issues) == 0
                )

    except Exception as e:
        result.error = str(e)
        result.error_type = "pipeline"
        print(f"    Exception: {e}")
        import traceback
        traceback.print_exc()

    return result


def run_test_case(
    test_case: dict,
    provider: str,
    screenshots_dir: Path,
) -> TestCaseResult:
    """Run a test case for a specific provider (up to MAX_ATTEMPTS)."""
    test_id = test_case["id"]
    test_name = test_case["name"]

    print(f"\n  Testing: {test_name} ({test_case['complexity']})")
    print(f"  Request: {test_case['request'][:60]}...")

    result = TestCaseResult(
        test_id=test_id,
        test_name=test_name,
        provider=provider,
    )

    for attempt in range(MAX_ATTEMPTS):
        attempt_result = run_single_attempt(test_case, provider, attempt, screenshots_dir)
        result.attempts.append(attempt_result)

        if attempt_result.success:
            result.final_success = True
            result.attempts_to_success = attempt + 1
            print(f"  ✓ PASSED on attempt {attempt + 1}")
            break

        # Don't retry infrastructure failures - they're unlikely to resolve
        if attempt_result.error_type == "infrastructure":
            print(f"  ✗ FAILED (infrastructure issue - not retrying)")
            break

        if attempt < MAX_ATTEMPTS - 1:
            print(f"    Retrying...")

    if not result.final_success and result.attempts[-1].error_type != "infrastructure":
        print(f"  ✗ FAILED after {result.total_attempts} attempts")

    return result


def run_provider_tests(
    provider: str,
    test_cases: list[dict],
    screenshots_dir: Path,
) -> list[TestCaseResult]:
    """Run all test cases for a single provider."""
    print(f"\n{'='*70}")
    print(f"TESTING PROVIDER: {provider.upper()}")
    print(f"{'='*70}")

    # Check API key
    api_keys = check_api_keys()
    if not api_keys.get(provider):
        print(f"  ⏭️ Skipping: Missing API key")
        return []

    results = []
    for i, test_case in enumerate(test_cases):
        print(f"\n[{i+1}/{len(test_cases)}] {test_case['id']}")
        result = run_test_case(test_case, provider, screenshots_dir)
        results.append(result)

        # If we hit infrastructure issues, check if server is still up
        if result.attempts and result.attempts[-1].error_type == "infrastructure":
            status = check_server()
            if not status.running:
                print(f"\n⚠️ Server appears to be down. Stopping tests for {provider}.")
                break

    return results


def generate_markdown_report(
    all_results: dict[str, list[TestCaseResult]],
    test_cases: list[dict],
    output_path: Path,
    screenshots_dir: Path,
):
    """Generate comprehensive markdown report."""
    lines = [
        "# Comprehensive Chart Test Results",
        "",
        f"**Test Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"**Total Test Cases:** {len(test_cases)}",
        f"**Providers Tested:** {', '.join(all_results.keys())}",
        f"**Max Attempts per Test:** {MAX_ATTEMPTS}",
        "",
        "---",
        "",
        "## Executive Summary",
        "",
    ]

    # Calculate provider summaries
    summaries = {}
    for provider, results in all_results.items():
        summary = ProviderSummary(provider=provider, total_tests=len(results))
        for r in results:
            if r.final_success:
                summary.passed += 1
            else:
                summary.failed += 1
                # Check if it was an infrastructure failure
                if r.attempts and r.attempts[-1].error_type == "infrastructure":
                    summary.infra_failures += 1
        summaries[provider] = summary

    # Summary table
    lines.extend([
        "| Provider | Tests Passed | Tests Failed | Infra Issues | Pass Rate |",
        "|----------|--------------|--------------|--------------|-----------|",
    ])

    for provider, summary in summaries.items():
        status = "✅" if summary.pass_rate >= 70 else "⚠️" if summary.pass_rate >= 50 else "❌"
        lines.append(
            f"| {provider.capitalize()} | {summary.passed}/{summary.total_tests} | "
            f"{summary.failed}/{summary.total_tests} | {summary.infra_failures} | {status} {summary.pass_rate:.0f}% |"
        )

    lines.extend([
        "",
        "---",
        "",
        "## Test Cases Overview",
        "",
        "| # | Test Case | Complexity | Chart Type | Features |",
        "|---|-----------|------------|------------|----------|",
    ])

    for i, tc in enumerate(test_cases, 1):
        features = ", ".join(tc["features"][:2])  # First 2 features
        lines.append(
            f"| {i} | {tc['name']} | {tc['complexity']} | {tc['chart_type']} | {features} |"
        )

    lines.extend([
        "",
        "---",
        "",
        "## Results by Test Case",
        "",
    ])

    # Results matrix
    lines.extend([
        "| Test Case | " + " | ".join(p.capitalize() for p in all_results.keys()) + " |",
        "|-----------|" + "|".join(["----------" for _ in all_results]) + "|",
    ])

    for tc in test_cases:
        row = [tc["name"]]
        for provider in all_results.keys():
            results = all_results[provider]
            result = next((r for r in results if r.test_id == tc["id"]), None)
            if result:
                if result.final_success:
                    row.append(f"✅ ({result.attempts_to_success}/{result.total_attempts})")
                elif result.attempts and result.attempts[-1].error_type == "infrastructure":
                    row.append(f"🔌 Infra")
                else:
                    row.append(f"❌ (0/{result.total_attempts})")
            else:
                row.append("⏭️ Skipped")
        lines.append("| " + " | ".join(row) + " |")

    lines.extend([
        "",
        "---",
        "",
        "## Detailed Results",
        "",
    ])

    # Detailed results per provider
    for provider, results in all_results.items():
        lines.extend([
            f"### {provider.capitalize()} Provider",
            "",
        ])

        if not results:
            lines.extend(["*Provider skipped (missing API key)*", ""])
            continue

        for result in results:
            tc = next(tc for tc in test_cases if tc["id"] == result.test_id)

            status_text = "✅ PASSED" if result.final_success else "❌ FAILED"
            if result.attempts and result.attempts[-1].error_type == "infrastructure":
                status_text = "🔌 INFRASTRUCTURE FAILURE"

            lines.extend([
                f"#### {result.test_name}",
                "",
                f"**Request:** {tc['request']}",
                "",
                f"**Expected:** {tc['chart_type']} | Complexity: {tc['complexity']}",
                "",
                f"**Result:** {status_text} "
                f"({result.attempts_to_success if result.final_success else 0}/{result.total_attempts} attempts)",
                "",
            ])

            # Show last attempt details
            if result.attempts:
                last = result.attempts[-1]

                if last.sql:
                    # Truncate long SQL
                    sql_display = last.sql[:500] + "..." if len(last.sql) > 500 else last.sql
                    lines.extend([
                        "**SQL Query:**",
                        "```sql",
                        sql_display,
                        "```",
                        "",
                    ])

                if last.qa_result:
                    lines.append(f"**QA Summary:** {last.qa_result.summary}")
                    lines.append("")

                    if last.qa_result.critical_issues:
                        lines.append("**Critical Issues:**")
                        for issue in last.qa_result.critical_issues[:3]:  # Max 3
                            lines.append(f"- {issue}")
                        lines.append("")

                if last.screenshot_path and last.screenshot_path.exists():
                    # Compute relative path from base_dir (project root)
                    base_dir = output_path.parent.parent
                    try:
                        rel_path = f"../{last.screenshot_path.relative_to(base_dir)}"
                    except ValueError:
                        rel_path = str(last.screenshot_path)
                    lines.append(f"**Screenshot:** [{last.screenshot_path.name}]({rel_path})")
                    lines.append("")

                if last.error:
                    error_prefix = f"[{last.error_type.upper()}] " if last.error_type != "unknown" else ""
                    lines.append(f"**Error:** {error_prefix}{last.error[:200]}")
                    lines.append("")

            lines.extend(["---", ""])

    # Test case details appendix
    lines.extend([
        "## Appendix: Test Case Definitions",
        "",
    ])

    for tc in test_cases:
        lines.extend([
            f"### {tc['id']}: {tc['name']}",
            "",
            f"**Complexity:** {tc['complexity']}",
            "",
            f"**Chart Type:** {tc['chart_type']}",
            "",
            f"**Features:** {', '.join(tc['features'])}",
            "",
            f"**Request:**",
            f"> {tc['request']}",
            "",
            "**Validation Criteria:**",
        ])
        for criterion in tc["validation_criteria"]:
            lines.append(f"- {criterion}")
        lines.extend(["", "---", ""])

    # Write report
    output_path.write_text("\n".join(lines))
    print(f"\n📝 Report written to: {output_path}")


def main():
    """Run comprehensive chart tests."""
    parser = argparse.ArgumentParser(description="Comprehensive Chart Tests")
    parser.add_argument("--smoke", action="store_true", help="Run only smoke tests (3 basic tests)")
    parser.add_argument("--provider", type=str, help="Test only one provider (claude, openai, gemini)")
    parser.add_argument("--auto-start", action="store_true", help="Auto-start Evidence server if not running")
    parser.add_argument("--wait-server", type=int, default=60, help="Max seconds to wait for server")
    args = parser.parse_args()

    # Select test cases
    if args.smoke:
        test_cases = [tc for tc in TEST_CASES if tc.get("smoke")]
        print(f"Running SMOKE TESTS ({len(test_cases)} tests)")
    else:
        test_cases = TEST_CASES
        print(f"Running FULL TEST SUITE ({len(test_cases)} tests)")

    # Select providers
    if args.provider:
        providers = [args.provider.lower()]
    else:
        providers = PROVIDERS

    print("=" * 70)
    print("COMPREHENSIVE CHART TESTS")
    print("=" * 70)
    print(f"\nTest Cases: {len(test_cases)}")
    print(f"Providers: {', '.join(providers)}")
    print(f"Max Attempts: {MAX_ATTEMPTS}")
    print("\nTest Case Summary:")
    for i, tc in enumerate(test_cases, 1):
        print(f"  {i}. [{tc['complexity']}] {tc['name']} ({tc['chart_type']})")

    # Check prerequisites
    server_ok, api_keys = check_prerequisites()

    if not server_ok:
        if args.auto_start:
            print("Attempting to start server...")
            server_ok, process = ensure_server_running(auto_start=True)
            if not server_ok:
                print("\n❌ Could not start server. Aborting tests.")
                sys.exit(1)
        else:
            print("\n❌ Server not running. Use --auto-start or start manually with 'npm run dev'")
            sys.exit(1)

    # Filter to available providers
    available_providers = [p for p in providers if api_keys.get(p)]
    if not available_providers:
        print("\n❌ No API keys available for requested providers.")
        sys.exit(1)

    print(f"\nProceeding with providers: {', '.join(available_providers)}")

    # Create screenshots directory
    base_dir = Path(__file__).parent.parent
    screenshots_dir = base_dir / "qa_screenshots" / "comprehensive_tests"
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    # Run tests for each provider
    all_results = {}
    for provider in available_providers:
        results = run_provider_tests(provider, test_cases, screenshots_dir)
        all_results[provider] = results

    # Generate report with today's date
    date_str = datetime.now().strftime('%Y-%m-%d')
    suffix = "_smoke" if args.smoke else ""
    report_path = base_dir / "test_results" / f"comprehensive_test_results_{date_str}{suffix}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    generate_markdown_report(all_results, test_cases, report_path, screenshots_dir)

    # Print final summary
    print("\n" + "=" * 70)
    print("FINAL SUMMARY")
    print("=" * 70)

    total_passed = 0
    total_tests = 0

    for provider, results in all_results.items():
        if results:
            passed = sum(1 for r in results if r.final_success)
            total = len(results)
            infra = sum(1 for r in results if r.attempts and r.attempts[-1].error_type == "infrastructure")
            pct = passed / total * 100 if total > 0 else 0
            status = "✅" if pct >= 70 else "⚠️" if pct >= 50 else "❌"
            infra_note = f" ({infra} infra)" if infra > 0 else ""
            print(f"  {provider.capitalize():10} {status} {passed}/{total} passed ({pct:.0f}%){infra_note}")

            total_passed += passed
            total_tests += total
        else:
            print(f"  {provider.capitalize():10} ⏭️ Skipped")

    if total_tests > 0:
        overall_pct = total_passed / total_tests * 100
        print(f"\n  {'OVERALL':10} {total_passed}/{total_tests} ({overall_pct:.0f}%)")

    print(f"\nReport: {report_path}")
    print("=" * 70)

    # Exit with error code if tests failed
    sys.exit(0 if total_passed == total_tests else 1)


if __name__ == "__main__":
    main()
