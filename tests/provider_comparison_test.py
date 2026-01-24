"""
Provider Comparison Test - Tests chart creation across all LLM providers.

This test creates the same chart across Claude, OpenAI, and Gemini,
validating the results with screenshots and SQL analysis.
"""

import os
import sys
import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from engine.chart_conversation import ChartConversationManager
from engine.qa import DashboardScreenshot, DashboardQA, QAResult
from engine.llm.claude import get_provider


# Test configuration
TEST_REQUEST = """Create a line chart with 2 lines: average customer invoice amount, and median customer invoice amount, by month. Show the latest 16 months, and add a date filter."""

PROVIDERS = ["claude", "openai", "gemini"]
MAX_ITERATIONS = 10


@dataclass
class IterationResult:
    """Result from a single test iteration."""
    iteration: int
    success: bool
    sql: str = ""
    sql_valid: bool = False
    sql_issues: list = field(default_factory=list)
    screenshot_path: Optional[Path] = None
    qa_result: Optional[QAResult] = None
    error: Optional[str] = None
    chart_url: Optional[str] = None


@dataclass
class ProviderTestResult:
    """Result from testing a single provider."""
    provider: str
    iterations: list[IterationResult] = field(default_factory=list)
    final_success: bool = False
    iterations_to_success: int = 0

    @property
    def total_iterations(self) -> int:
        return len(self.iterations)


def check_api_key(provider: str) -> tuple[bool, str]:
    """Check if API key is available for provider."""
    key_map = {
        "claude": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "gemini": "GOOGLE_API_KEY",
    }
    key_name = key_map.get(provider)
    if key_name and os.environ.get(key_name):
        return True, ""
    return False, f"Missing {key_name} environment variable"


def analyze_sql(sql: str) -> tuple[bool, list[str]]:
    """
    Analyze SQL for coherence with the test request.

    Checks for:
    - AVG and MEDIAN functions (or PERCENTILE_CONT for median)
    - Invoice amount column
    - Monthly grouping
    - Date filtering capability
    - Limit to 16 months
    """
    issues = []
    sql_lower = sql.lower()

    # Check for average calculation
    if "avg(" not in sql_lower and "average" not in sql_lower:
        issues.append("Missing AVG() function for average invoice amount")

    # Check for median calculation (DuckDB uses MEDIAN or PERCENTILE_CONT)
    has_median = (
        "median(" in sql_lower or
        "percentile_cont" in sql_lower or
        "percentile(" in sql_lower
    )
    if not has_median:
        issues.append("Missing MEDIAN() or PERCENTILE_CONT() for median calculation")

    # Check for invoice-related column
    invoice_terms = ["invoice", "amount", "total", "value"]
    has_invoice = any(term in sql_lower for term in invoice_terms)
    if not has_invoice:
        issues.append("SQL doesn't reference invoice/amount data")

    # Check for monthly grouping
    monthly_terms = ["month", "strftime", "date_trunc", "to_char"]
    has_monthly = any(term in sql_lower for term in monthly_terms)
    if not has_monthly:
        issues.append("Missing monthly grouping (expected DATE_TRUNC or STRFTIME)")

    # Check for date/time constraint (16 months)
    has_date_limit = (
        "16" in sql or
        "interval" in sql_lower or
        "months" in sql_lower or
        "month" in sql_lower
    )
    if not has_date_limit:
        issues.append("May not limit to 16 months as requested")

    is_valid = len(issues) == 0
    return is_valid, issues


def run_single_iteration(
    provider: str,
    iteration: int,
    screenshots_dir: Path,
) -> IterationResult:
    """Run a single test iteration for a provider."""
    print(f"\n[{provider}] Iteration {iteration + 1}/{MAX_ITERATIONS}")

    result = IterationResult(iteration=iteration + 1, success=False)

    try:
        # Create conversation manager with this provider
        manager = ChartConversationManager(provider_name=provider)

        # Process the test request
        response = manager.process_message(TEST_REQUEST)

        if response.error:
            result.error = response.error
            print(f"[{provider}] Error: {response.error}")
            return result

        if not response.chart_url:
            result.error = "No chart URL returned"
            print(f"[{provider}] No chart URL returned")
            return result

        result.chart_url = response.chart_url

        # Get the SQL from the chart
        if manager.state.current_chart:
            result.sql = manager.state.current_chart.sql
            result.sql_valid, result.sql_issues = analyze_sql(result.sql)
            print(f"[{provider}] SQL valid: {result.sql_valid}")
            if result.sql_issues:
                print(f"[{provider}] SQL issues: {result.sql_issues}")

        # Take screenshot
        dashboard_slug = manager.state.dashboard_slug
        if dashboard_slug:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            screenshot_path = screenshots_dir / f"{provider}_{iteration + 1}_{timestamp}.png"

            screenshotter = DashboardScreenshot()
            screenshot_result = screenshotter.capture(
                dashboard_slug,
                save_path=screenshot_path,
                timeout=45000,
            )

            if screenshot_result.success:
                result.screenshot_path = screenshot_path
                print(f"[{provider}] Screenshot saved: {screenshot_path}")

                # Run QA validation using Claude (always use Claude for validation)
                qa = DashboardQA(provider_name="claude")
                result.qa_result = qa.validate(
                    dashboard_slug,
                    TEST_REQUEST,
                )

                print(f"[{provider}] QA result: {'PASS' if result.qa_result.passed else 'FAIL'}")
                print(f"[{provider}] QA summary: {result.qa_result.summary}")

                # Determine overall success
                result.success = (
                    result.sql_valid and
                    result.qa_result.passed and
                    len(result.qa_result.critical_issues) == 0
                )
            else:
                result.error = f"Screenshot failed: {screenshot_result.error}"
                print(f"[{provider}] Screenshot failed: {screenshot_result.error}")

    except Exception as e:
        result.error = str(e)
        print(f"[{provider}] Exception: {e}")
        import traceback
        traceback.print_exc()

    return result


def test_provider(provider: str, screenshots_dir: Path) -> ProviderTestResult:
    """Test a single provider with up to MAX_ITERATIONS attempts."""
    print(f"\n{'='*60}")
    print(f"Testing provider: {provider.upper()}")
    print(f"{'='*60}")

    result = ProviderTestResult(provider=provider)

    # Check API key
    has_key, key_error = check_api_key(provider)
    if not has_key:
        print(f"[{provider}] Skipping: {key_error}")
        result.iterations.append(IterationResult(
            iteration=0,
            success=False,
            error=key_error,
        ))
        return result

    # Run iterations until success or max
    for i in range(MAX_ITERATIONS):
        iteration_result = run_single_iteration(provider, i, screenshots_dir)
        result.iterations.append(iteration_result)

        if iteration_result.success:
            result.final_success = True
            result.iterations_to_success = i + 1
            print(f"\n[{provider}] SUCCESS on iteration {i + 1}!")
            break

        if i < MAX_ITERATIONS - 1:
            print(f"[{provider}] Retrying...")

    if not result.final_success:
        print(f"\n[{provider}] FAILED after {MAX_ITERATIONS} iterations")

    return result


def generate_markdown_report(results: list[ProviderTestResult], output_path: Path):
    """Generate a markdown report of the test results."""
    lines = [
        "# Provider Comparison Test Results",
        "",
        f"**Test Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "**Test Request:**",
        f"> {TEST_REQUEST}",
        "",
        "---",
        "",
        "## Summary",
        "",
        "| Provider | Final Result | Iterations | SQL Valid | QA Passed |",
        "|----------|--------------|------------|-----------|-----------|",
    ]

    for r in results:
        if r.iterations:
            last = r.iterations[-1]
            sql_valid = "✅" if last.sql_valid else "❌"
            qa_passed = "✅" if (last.qa_result and last.qa_result.passed) else "❌"
            final = "✅ PASS" if r.final_success else "❌ FAIL"
            iters = f"{r.iterations_to_success}/{r.total_iterations}" if r.final_success else f"0/{r.total_iterations}"
        else:
            sql_valid = "N/A"
            qa_passed = "N/A"
            final = "⏭️ SKIPPED"
            iters = "0"

        lines.append(f"| {r.provider.capitalize()} | {final} | {iters} | {sql_valid} | {qa_passed} |")

    lines.extend([
        "",
        "---",
        "",
    ])

    # Detailed results per provider
    for r in results:
        lines.extend([
            f"## {r.provider.capitalize()} Provider",
            "",
        ])

        if not r.iterations:
            lines.extend(["*No iterations run*", ""])
            continue

        for it in r.iterations:
            lines.extend([
                f"### Iteration {it.iteration}",
                "",
            ])

            if it.error and "Missing" in it.error:
                lines.extend([
                    f"**Skipped:** {it.error}",
                    "",
                ])
                continue

            lines.append(f"**Result:** {'✅ SUCCESS' if it.success else '❌ FAILED'}")
            lines.append("")

            if it.error:
                lines.extend([
                    f"**Error:** {it.error}",
                    "",
                ])

            if it.sql:
                lines.extend([
                    "**SQL Query:**",
                    "```sql",
                    it.sql,
                    "```",
                    "",
                ])

            lines.append(f"**SQL Analysis:** {'✅ Valid' if it.sql_valid else '❌ Issues found'}")
            if it.sql_issues:
                lines.append("")
                for issue in it.sql_issues:
                    lines.append(f"- {issue}")
            lines.append("")

            if it.qa_result:
                lines.extend([
                    f"**QA Validation:** {'✅ PASSED' if it.qa_result.passed else '❌ FAILED'}",
                    "",
                    f"**Summary:** {it.qa_result.summary}",
                    "",
                ])

                if it.qa_result.critical_issues:
                    lines.append("**Critical Issues:**")
                    for issue in it.qa_result.critical_issues:
                        lines.append(f"- {issue}")
                    lines.append("")

                if it.qa_result.suggestions:
                    lines.append("**Suggestions:**")
                    for sug in it.qa_result.suggestions:
                        lines.append(f"- {sug}")
                    lines.append("")

            if it.screenshot_path:
                # Use relative path for the report
                rel_path = it.screenshot_path.relative_to(output_path.parent)
                lines.extend([
                    f"**Screenshot:** [{rel_path.name}]({rel_path})",
                    "",
                ])

            if it.chart_url:
                lines.extend([
                    f"**Chart URL:** {it.chart_url}",
                    "",
                ])

            lines.append("---")
            lines.append("")

    # Write the report
    output_path.write_text("\n".join(lines))
    print(f"\n📝 Report written to: {output_path}")


def main():
    """Run the provider comparison test."""
    print("=" * 60)
    print("PROVIDER COMPARISON TEST")
    print("=" * 60)
    print(f"\nTest request: {TEST_REQUEST}")
    print(f"Max iterations per provider: {MAX_ITERATIONS}")
    print(f"Providers: {', '.join(PROVIDERS)}")

    # Create screenshots directory
    base_dir = Path(__file__).parent.parent
    screenshots_dir = base_dir / "qa_screenshots" / "provider_test"
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    # Run tests for each provider
    results = []
    for provider in PROVIDERS:
        result = test_provider(provider, screenshots_dir)
        results.append(result)

    # Generate report
    report_path = base_dir / "provider_comparison_results.md"
    generate_markdown_report(results, report_path)

    # Print final summary
    print("\n" + "=" * 60)
    print("FINAL SUMMARY")
    print("=" * 60)

    for r in results:
        status = "✅ PASS" if r.final_success else "❌ FAIL"
        iters = f" (iteration {r.iterations_to_success})" if r.final_success else ""
        print(f"  {r.provider.capitalize():10} {status}{iters}")

    print(f"\nReport: {report_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
