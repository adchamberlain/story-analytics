"""
Integration tests for the chart pipeline with quality validation.

Tests the full pipeline flow with various user requests to verify
that quality checks catch issues and produce accurate charts.
"""

import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from engine.chart_pipeline import ChartPipeline, ChartPipelineConfig, ChartPipelineResult
from engine.validators.quality_validator import ValidationSeverity


def test_pipeline_with_request(request: str, description: str) -> dict:
    """
    Test the pipeline with a specific request.

    Returns a dict with test results.
    """
    print(f"\n{'='*60}")
    print(f"TEST: {description}")
    print(f"REQUEST: {request}")
    print('='*60)

    config = ChartPipelineConfig(
        verbose=True,
        enable_quality_validation=True,
        enable_spec_verification=False,  # Skip LLM verification for speed
        enable_data_validation=True,
        enable_aggregation_check=True,
        enable_chart_type_check=True,
        fail_on_quality_warnings=False,
    )

    pipeline = ChartPipeline(config)

    try:
        result = pipeline.run(request)

        print(f"\n--- RESULT ---")
        print(f"Success: {result.success}")

        if result.error:
            print(f"Error: {result.error}")

        if result.spec:
            print(f"\n--- SPEC ---")
            print(f"Title: {result.spec.title}")
            print(f"Chart Type: {result.spec.chart_type.value}")
            print(f"Metric: {result.spec.metric}")
            print(f"Aggregation: {result.spec.aggregation}")
            print(f"Dimension: {result.spec.dimension}")
            if result.spec.horizontal:
                print(f"Horizontal: True")

        if result.chart:
            print(f"\n--- CHART ---")
            print(f"Query: {result.chart.query_name}")
            print(f"Columns: {result.chart.columns}")

        if result.quality_result:
            print(f"\n--- QUALITY ---")
            print(f"Passed: {result.quality_result.passed}")
            print(f"Row Count: {result.quality_result.row_count}")
            print(f"Column Count: {result.quality_result.column_count}")

            if result.quality_errors:
                print(f"\nERRORS ({len(result.quality_errors)}):")
                for issue in result.quality_errors:
                    print(f"  - [{issue.code}] {issue.message}")

            if result.quality_warnings:
                print(f"\nWARNINGS ({len(result.quality_warnings)}):")
                for issue in result.quality_warnings:
                    print(f"  - [{issue.code}] {issue.message}")

            if result.data_preview:
                print(f"\nDATA PREVIEW (first 3 rows):")
                for row in result.data_preview[:3]:
                    print(f"  {row}")

        return {
            "request": request,
            "description": description,
            "success": result.success,
            "error": result.error,
            "chart_type": result.spec.chart_type.value if result.spec else None,
            "quality_passed": result.quality_result.passed if result.quality_result else None,
            "errors": len(result.quality_errors) if result.quality_errors else 0,
            "warnings": len(result.quality_warnings) if result.quality_warnings else 0,
            "row_count": result.quality_result.row_count if result.quality_result else 0,
        }

    except Exception as e:
        print(f"\n--- EXCEPTION ---")
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "request": request,
            "description": description,
            "success": False,
            "error": str(e),
            "chart_type": None,
            "quality_passed": False,
            "errors": 1,
            "warnings": 0,
            "row_count": 0,
        }


def main():
    """Run pipeline quality tests."""
    print("="*60)
    print("CHART PIPELINE QUALITY VALIDATION TESTS")
    print("="*60)

    # Check if API key is available
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("\nWARNING: ANTHROPIC_API_KEY not set. Tests may fail.")
        print("Set the environment variable or create a .env file.\n")

    test_cases = [
        # Time series tests - should be LineChart
        ("Show monthly revenue over time", "Time series - should be LineChart"),
        ("Revenue trend by month", "Trend - should be LineChart"),

        # Category tests - should be BarChart
        ("Show revenue by industry", "Category comparison - should be BarChart"),
        ("Top 10 customers by revenue", "Top N - should be horizontal BarChart"),

        # Single value tests - should be BigValue
        ("What is the total revenue", "Single value - should be BigValue"),

        # Aggregation tests
        ("Show average invoice amount", "Average aggregation"),
        ("How many customers do we have", "Count aggregation"),
        ("Show average revenue per customer", "Per-entity aggregation"),

        # Horizontal bar tests
        ("Show a horizontal bar chart of revenue by segment", "Explicit horizontal bar"),

        # Complex tests
        ("Show monthly revenue and customer count over time", "Dual metric time series"),
    ]

    results = []
    for request, description in test_cases:
        result = test_pipeline_with_request(request, description)
        results.append(result)

    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    total = len(results)
    successful = sum(1 for r in results if r["success"])
    quality_passed = sum(1 for r in results if r["quality_passed"])
    with_errors = sum(1 for r in results if r["errors"] > 0)
    with_warnings = sum(1 for r in results if r["warnings"] > 0)

    print(f"Total tests: {total}")
    print(f"Pipeline success: {successful}/{total}")
    print(f"Quality passed: {quality_passed}/{total}")
    print(f"Tests with errors: {with_errors}")
    print(f"Tests with warnings: {with_warnings}")

    print("\n--- INDIVIDUAL RESULTS ---")
    for r in results:
        status = "✓" if r["success"] and r.get("quality_passed") else "✗" if not r["success"] else "⚠"
        print(f"{status} {r['description'][:40]:<40} | {r['chart_type'] or 'N/A':<15} | rows: {r['row_count']}")

    return 0 if successful == total else 1


if __name__ == "__main__":
    sys.exit(main())
