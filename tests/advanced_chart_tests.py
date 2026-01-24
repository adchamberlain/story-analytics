"""
Advanced Chart Tests - More challenging test cases for the chart creation pipeline.

This test suite extends the comprehensive tests with more challenging scenarios:
- Complex aggregations and calculations
- Relative time references and period comparisons
- Ambiguous/conversational natural language
- Multi-condition filtering and complex logic
- Edge cases and unusual requests
- Advanced analytics and derived metrics

Usage:
  python tests/advanced_chart_tests.py                    # Full test suite
  python tests/advanced_chart_tests.py --smoke            # Quick smoke test (3 tests)
  python tests/advanced_chart_tests.py --provider claude  # Single provider
  python tests/advanced_chart_tests.py --auto-start       # Auto-start server if needed
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
from engine.qa import DashboardScreenshot, DashboardQA, QAResult


# =============================================================================
# ADVANCED TEST CASES - 30 Challenging Chart Requests
# =============================================================================

ADVANCED_TEST_CASES = [
    # ==========================================================================
    # COMPLEX AGGREGATIONS AND CALCULATIONS (Tests 31-35)
    # ==========================================================================
    {
        "id": "31_running_total",
        "name": "Cumulative Running Total",
        "complexity": "Complex",
        "chart_type": "LineChart",
        "features": ["cumulative sum", "running total", "time series"],
        "request": "Show me a line chart of cumulative total revenue over time, where each point shows the running total up to that month",
        "validation_criteria": [
            "Line chart is displayed",
            "Values are cumulative (each point >= previous point)",
            "Shows monotonically increasing trend",
            "Title indicates cumulative/running total",
        ],
        "smoke": True,
    },
    {
        "id": "32_percentage_of_total",
        "name": "Percentage of Total Calculation",
        "complexity": "Complex",
        "chart_type": "BarChart",
        "features": ["percentage calculation", "proportion"],
        "request": "Create a bar chart showing each customer segment's percentage share of total revenue",
        "validation_criteria": [
            "Bar chart is displayed",
            "Shows percentages (values roughly sum to 100%)",
            "Customer segments visible",
            "Values appear as percentages or proportions",
        ],
    },
    {
        "id": "33_average_vs_median_comparison",
        "name": "Average vs Median Statistical Comparison",
        "complexity": "Complex",
        "chart_type": "LineChart",
        "features": ["statistical comparison", "mean", "median"],
        "request": "Compare the average and median invoice amounts over the past year - I want to see if there are outliers skewing our averages",
        "validation_criteria": [
            "Chart shows TWO distinct metrics",
            "Both average and median are represented",
            "Time-based x-axis",
            "Legend distinguishes the two metrics",
        ],
        "smoke": True,
    },
    {
        "id": "34_count_with_condition",
        "name": "Conditional Count Aggregation",
        "complexity": "Medium",
        "chart_type": "BarChart",
        "features": ["conditional count", "filtered aggregation"],
        "request": "Show me the count of paid invoices vs unpaid invoices by month as a bar chart",
        "validation_criteria": [
            "Bar chart is displayed",
            "Shows distinction between paid and unpaid",
            "Monthly grouping visible",
            "Two categories or colors represented",
        ],
    },
    {
        "id": "35_ratio_between_metrics",
        "name": "Ratio Calculation Between Metrics",
        "complexity": "Complex",
        "chart_type": "LineChart",
        "features": ["ratio", "derived metric"],
        "request": "Show the ratio of new subscriptions to cancellations each month - values above 1 mean we're growing",
        "validation_criteria": [
            "Chart is displayed",
            "Shows ratio values (likely between 0-5 range)",
            "Monthly breakdown",
            "Values are ratios (not raw counts)",
        ],
    },

    # ==========================================================================
    # RELATIVE TIME AND PERIOD COMPARISONS (Tests 36-40)
    # ==========================================================================
    {
        "id": "36_year_to_date",
        "name": "Year-to-Date Aggregation",
        "complexity": "Medium",
        "chart_type": "BigValue",
        "features": ["YTD", "relative time"],
        "request": "What's our year-to-date revenue? Show it as a big number",
        "validation_criteria": [
            "Large number is displayed",
            "Shows revenue value",
            "Represents current year's data",
            "Has appropriate label",
        ],
    },
    {
        "id": "37_month_over_month_growth",
        "name": "Month-over-Month Growth Rate",
        "complexity": "Complex",
        "chart_type": "LineChart",
        "features": ["MoM growth", "percentage change"],
        "request": "Show me the month-over-month revenue growth rate as a line chart - I want to see the percentage change each month compared to the previous month",
        "validation_criteria": [
            "Line chart is displayed",
            "Shows percentage or rate values",
            "Values can be positive or negative",
            "Monthly x-axis",
        ],
    },
    {
        "id": "38_last_n_complete_months",
        "name": "Last N Complete Months",
        "complexity": "Medium",
        "chart_type": "BarChart",
        "features": ["relative time period", "complete months"],
        "request": "Show revenue for the last 6 complete months (not including the current partial month)",
        "validation_criteria": [
            "Bar chart is displayed",
            "Shows approximately 6 months of data",
            "Revenue values visible",
            "Most recent full month included",
        ],
        "smoke": True,
    },
    {
        "id": "39_same_period_comparison",
        "name": "Same Period Year Comparison",
        "complexity": "Complex",
        "chart_type": "BarChart",
        "features": ["period comparison", "YoY"],
        "request": "Compare our Q4 revenue this year vs Q4 last year as a bar chart",
        "validation_criteria": [
            "Bar chart is displayed",
            "Shows comparison between two periods",
            "Q4 or quarterly context visible",
            "Two distinct time periods represented",
        ],
    },
    {
        "id": "40_trailing_average",
        "name": "Trailing Moving Average",
        "complexity": "Complex",
        "chart_type": "LineChart",
        "features": ["moving average", "smoothing"],
        "request": "Show me a 3-month trailing average of monthly revenue to smooth out the variations",
        "validation_criteria": [
            "Line chart is displayed",
            "Line appears smoother than raw data would",
            "Revenue context visible",
            "Time-based x-axis",
        ],
    },

    # ==========================================================================
    # AMBIGUOUS AND CONVERSATIONAL LANGUAGE (Tests 41-45)
    # ==========================================================================
    {
        "id": "41_vague_performance_question",
        "name": "Vague Performance Question",
        "complexity": "Simple",
        "chart_type": "Any",
        "features": ["ambiguous", "interpretive"],
        "request": "How's business doing lately?",
        "validation_criteria": [
            "Some visualization is displayed",
            "Shows business-relevant metric (revenue, customers, or similar)",
            "Interpretation is reasonable for 'business performance'",
        ],
    },
    {
        "id": "42_colloquial_request",
        "name": "Highly Colloquial Request",
        "complexity": "Simple",
        "chart_type": "Any",
        "features": ["informal language", "slang"],
        "request": "yo whats the deal with our big spenders? who are they?",
        "validation_criteria": [
            "A visualization is displayed",
            "Shows customer or revenue data",
            "Identifies high-value customers in some way",
        ],
    },
    {
        "id": "43_negation_handling",
        "name": "Request with Negation",
        "complexity": "Medium",
        "chart_type": "BarChart",
        "features": ["negation", "exclusion"],
        "request": "Show me revenue by segment but NOT including the Enterprise segment",
        "validation_criteria": [
            "Bar chart is displayed",
            "Shows customer segments",
            "Enterprise segment should be absent or filtered out",
            "Other segments visible",
        ],
    },
    {
        "id": "44_implicit_comparison",
        "name": "Implicit Comparison Request",
        "complexity": "Medium",
        "chart_type": "Any",
        "features": ["implicit comparison", "interpretive"],
        "request": "Are our subscription numbers getting better or worse?",
        "validation_criteria": [
            "A visualization is displayed",
            "Shows subscription data over time",
            "Trend is visible (upward or downward)",
            "Enables answering the better/worse question",
        ],
    },
    {
        "id": "45_compound_question",
        "name": "Compound Multi-Part Question",
        "complexity": "Complex",
        "chart_type": "Any",
        "features": ["compound request", "multiple aspects"],
        "request": "Can you show me which industries bring in the most revenue and also how many customers we have in each?",
        "validation_criteria": [
            "A visualization is displayed",
            "Shows industry breakdown",
            "Revenue data is present",
            "Customer count may also be shown (bonus)",
        ],
    },

    # ==========================================================================
    # MULTI-CONDITION FILTERING AND COMPLEX LOGIC (Tests 46-50)
    # ==========================================================================
    {
        "id": "46_and_filter_conditions",
        "name": "Multiple AND Filter Conditions",
        "complexity": "Complex",
        "chart_type": "BarChart",
        "features": ["multiple filters", "AND logic"],
        "request": "Show revenue by month for Enterprise customers in the Technology industry only",
        "validation_criteria": [
            "Bar chart is displayed",
            "Shows monthly revenue",
            "Data appears filtered (subset of total)",
            "Context indicates Enterprise and/or Technology filter",
        ],
    },
    {
        "id": "47_or_filter_conditions",
        "name": "OR Filter Conditions",
        "complexity": "Complex",
        "chart_type": "BarChart",
        "features": ["OR logic", "multiple values"],
        "request": "Show me total revenue for customers in either Healthcare OR Finance industries",
        "validation_criteria": [
            "Chart is displayed",
            "Shows revenue data",
            "Appears to include both industries",
            "May show combined total or breakdown",
        ],
    },
    {
        "id": "48_threshold_filter",
        "name": "Threshold-Based Filter",
        "complexity": "Medium",
        "chart_type": "BarChart",
        "features": ["threshold", "greater than filter"],
        "request": "List customers who have spent more than $5000 total",
        "validation_criteria": [
            "Visualization shows customer data",
            "Customers appear to be high-value",
            "Revenue or spending amounts visible",
            "Appears to be filtered subset",
        ],
    },
    {
        "id": "49_date_range_with_category",
        "name": "Date Range Plus Category Filter",
        "complexity": "Complex",
        "chart_type": "LineChart",
        "features": ["date range", "category filter", "combined"],
        "request": "Show me monthly subscription trends for just the Pro plan tier over the last 12 months with a date filter",
        "validation_criteria": [
            "Line chart is displayed",
            "Shows subscription data",
            "Date filter is present",
            "Appears filtered to specific plan tier",
        ],
    },
    {
        "id": "50_grouped_comparison_filter",
        "name": "Grouped Comparison with Filter",
        "complexity": "Complex",
        "chart_type": "BarChart",
        "features": ["grouping", "comparison", "filter"],
        "request": "Compare paid vs unpaid invoice amounts by customer segment, but only for invoices over $100",
        "validation_criteria": [
            "Bar chart is displayed",
            "Shows paid/unpaid distinction",
            "Customer segments visible",
            "Appears to show filtered data",
        ],
    },

    # ==========================================================================
    # EDGE CASES AND UNUSUAL REQUESTS (Tests 51-55)
    # ==========================================================================
    {
        "id": "51_empty_result_handling",
        "name": "Potentially Empty Result Set",
        "complexity": "Medium",
        "chart_type": "Any",
        "features": ["edge case", "no data scenario"],
        "request": "Show me all cancelled subscriptions from yesterday",
        "validation_criteria": [
            "Either shows data or gracefully handles no data",
            "No error or crash",
            "Clear indication of what was searched for",
        ],
    },
    {
        "id": "52_large_number_formatting",
        "name": "Large Number Display",
        "complexity": "Simple",
        "chart_type": "BigValue",
        "features": ["formatting", "large numbers"],
        "request": "What's the total sum of all invoice amounts ever? Show as a big number with proper formatting",
        "validation_criteria": [
            "Large number displayed",
            "Number is formatted (K, M, or comma-separated)",
            "Readable format",
        ],
    },
    {
        "id": "53_zero_handling",
        "name": "Periods with Zero Values",
        "complexity": "Medium",
        "chart_type": "LineChart",
        "features": ["zero values", "sparse data"],
        "request": "Show cancelled subscriptions by month - there might be months with zero cancellations",
        "validation_criteria": [
            "Chart is displayed",
            "Monthly breakdown visible",
            "Handles months with zero or low values",
            "No gaps or errors for zero-value periods",
        ],
    },
    {
        "id": "54_single_value_chart",
        "name": "Single Data Point Request",
        "complexity": "Simple",
        "chart_type": "BigValue",
        "features": ["single value", "latest only"],
        "request": "Just show me this month's revenue, nothing else",
        "validation_criteria": [
            "Single value displayed (not a trend chart)",
            "Shows revenue",
            "Current month context",
        ],
    },
    {
        "id": "55_unicode_tolerance",
        "name": "Unicode and Special Characters",
        "complexity": "Simple",
        "chart_type": "BarChart",
        "features": ["unicode", "robustness"],
        "request": "Show revenue by segment \u2014 I want to see the breakdown please \ud83d\udcca",
        "validation_criteria": [
            "Chart displays despite unicode characters in request",
            "Shows revenue by segment",
            "No parsing errors",
        ],
    },

    # ==========================================================================
    # ADVANCED ANALYTICS AND DERIVED METRICS (Tests 56-60)
    # ==========================================================================
    {
        "id": "56_cohort_style_analysis",
        "name": "Cohort-Style Customer Analysis",
        "complexity": "Complex",
        "chart_type": "BarChart",
        "features": ["cohort", "customer lifecycle"],
        "request": "Show me average revenue per customer grouped by the month they became a customer",
        "validation_criteria": [
            "Chart is displayed",
            "Shows customer cohorts or signup months",
            "Revenue per customer metric visible",
            "Multiple cohort periods shown",
        ],
    },
    {
        "id": "57_concentration_analysis",
        "name": "Revenue Concentration Analysis",
        "complexity": "Complex",
        "chart_type": "BarChart",
        "features": ["pareto", "concentration"],
        "request": "What percentage of our revenue comes from our top 20% of customers?",
        "validation_criteria": [
            "Some visualization addressing concentration",
            "Shows customer revenue distribution",
            "May show percentage or pareto-style analysis",
        ],
    },
    {
        "id": "58_growth_decomposition",
        "name": "Growth Source Breakdown",
        "complexity": "Complex",
        "chart_type": "BarChart",
        "features": ["growth analysis", "decomposition"],
        "request": "Break down our revenue growth by customer segment - which segments are driving growth?",
        "validation_criteria": [
            "Chart shows revenue by segment",
            "Growth or trend context visible",
            "Multiple segments compared",
            "Allows identifying growth drivers",
        ],
    },
    {
        "id": "59_customer_value_distribution",
        "name": "Customer Value Distribution",
        "complexity": "Medium",
        "chart_type": "BarChart",
        "features": ["distribution", "bucketing"],
        "request": "Show me a distribution of customers by their total lifetime spending - bucket them into ranges like $0-1000, $1000-5000, $5000+",
        "validation_criteria": [
            "Bar chart or histogram displayed",
            "Shows customer counts",
            "Spending buckets or ranges visible",
            "Distribution pattern visible",
        ],
    },
    {
        "id": "60_churn_indicator",
        "name": "Churn Rate Trend",
        "complexity": "Complex",
        "chart_type": "LineChart",
        "features": ["churn", "rate metric"],
        "request": "Show me our subscription churn rate trend over the past year - cancellations divided by total active subscriptions each month",
        "validation_criteria": [
            "Line chart is displayed",
            "Shows rate or percentage values",
            "Monthly breakdown",
            "Values appear as ratios (small decimals or percentages)",
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

        # Process the test request
        response = manager.process_message(test_case["request"])

        if response.error:
            result.error = response.error
            result.error_type = "pipeline"
            print(f"    Pipeline error: {response.error[:100]}...")
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
        dashboard_slug = manager.state.dashboard_slug
        if dashboard_slug:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            screenshot_path = screenshots_dir / f"{test_id}_{provider}_{attempt + 1}_{timestamp}.png"

            # Retry screenshot up to 2 times for connection issues
            for screenshot_attempt in range(2):
                screenshotter = DashboardScreenshot()
                screenshot_result = screenshotter.capture(
                    dashboard_slug,
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
                qa = DashboardQA(provider_name="claude")

                # Build validation prompt with test-specific criteria
                validation_context = f"""
Original Request: {test_case['request']}

Expected Chart Type: {test_case['chart_type']}

Validation Criteria:
{chr(10).join('- ' + c for c in test_case['validation_criteria'])}
"""
                result.qa_result = qa.validate(
                    dashboard_slug,
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
        "# Advanced Chart Test Results",
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
        "## Test Categories",
        "",
        "| Category | Test IDs | Description |",
        "|----------|----------|-------------|",
        "| Complex Aggregations | 31-35 | Running totals, percentages, statistical comparisons |",
        "| Time Period Comparisons | 36-40 | YTD, MoM growth, trailing averages |",
        "| Ambiguous Language | 41-45 | Vague questions, colloquial, negation |",
        "| Multi-Condition Logic | 46-50 | AND/OR filters, thresholds, combined filters |",
        "| Edge Cases | 51-55 | Empty results, large numbers, unicode |",
        "| Advanced Analytics | 56-60 | Cohorts, concentration, churn rates |",
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

    # Write report (handle unicode errors by replacing problematic characters)
    report_text = "\n".join(lines)
    # Remove any invalid unicode surrogates
    report_text = report_text.encode('utf-8', errors='replace').decode('utf-8')
    output_path.write_text(report_text)
    print(f"\n📝 Report written to: {output_path}")


def main():
    """Run advanced chart tests."""
    parser = argparse.ArgumentParser(description="Advanced Chart Tests")
    parser.add_argument("--smoke", action="store_true", help="Run only smoke tests (3 basic tests)")
    parser.add_argument("--provider", type=str, help="Test only one provider (claude, openai, gemini)")
    parser.add_argument("--auto-start", action="store_true", help="Auto-start Evidence server if not running")
    parser.add_argument("--wait-server", type=int, default=60, help="Max seconds to wait for server")
    args = parser.parse_args()

    # Select test cases
    if args.smoke:
        test_cases = [tc for tc in ADVANCED_TEST_CASES if tc.get("smoke")]
        print(f"Running SMOKE TESTS ({len(test_cases)} tests)")
    else:
        test_cases = ADVANCED_TEST_CASES
        print(f"Running FULL TEST SUITE ({len(test_cases)} tests)")

    # Select providers
    if args.provider:
        providers = [args.provider.lower()]
    else:
        providers = PROVIDERS

    print("=" * 70)
    print("ADVANCED CHART TESTS")
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
    screenshots_dir = base_dir / "qa_screenshots" / "advanced_tests"
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    # Run tests for each provider
    all_results = {}
    for provider in available_providers:
        results = run_provider_tests(provider, test_cases, screenshots_dir)
        all_results[provider] = results

    # Generate report with today's date
    date_str = datetime.now().strftime('%Y-%m-%d')
    suffix = "_smoke" if args.smoke else ""
    report_path = base_dir / "test_results" / f"advanced_test_results_{date_str}{suffix}.md"
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
