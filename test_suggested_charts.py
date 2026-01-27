#!/usr/bin/env python3
"""
Test all 12 suggested charts from both semantic layers.
Runs each chart through the pipeline with Claude and reports results.
"""

import json
import sys
import time
from datetime import datetime
from pathlib import Path

import yaml

from engine.semantic import SemanticLayer
from engine.chart_conversation import ChartConversationManager
from engine.qa import DashboardScreenshot, ChartQA


def update_source_config(source_name: str):
    """Update engine_config.yaml to use the specified source."""
    config_path = Path("engine_config.yaml")
    with open(config_path) as f:
        config = yaml.safe_load(f)

    # Update the connection file path
    config["snowflake"]["connection_file"] = f"sources/{source_name}/connection.yaml"

    with open(config_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False)

    # Force config reload by clearing the cache
    from engine.config import clear_config_cache
    clear_config_cache()


def test_source_charts(source_name: str, screenshots_dir: Path) -> list[dict]:
    """Test all suggested charts for a given source."""
    results = []

    # Update config to use this source
    print(f"\n[Setup] Switching to source: {source_name}")
    update_source_config(source_name)

    # Load semantic layer
    semantic_path = Path("sources") / source_name / "semantic.yaml"
    semantic = SemanticLayer.load(str(semantic_path))

    print(f"\n{'='*60}")
    print(f"Testing {source_name} - {len(semantic.suggested_charts)} charts")
    print(f"{'='*60}")

    for i, chart in enumerate(semantic.suggested_charts, 1):
        print(f"\n[{i}/6] {chart.name}")
        print(f"  Prompt: {chart.prompt[:80]}...")

        chart_result = {
            "source": source_name,
            "chart_id": chart.id,
            "chart_name": chart.name,
            "prompt": chart.prompt,
            "success": False,
            "chart_url": None,
            "error": None,
            "qa_passed": None,
            "qa_issues": [],
            "screenshot_path": None,
        }

        try:
            # Create fresh manager for each chart
            mgr = ChartConversationManager(provider_name="claude")

            # Step 1: Send the chart request (creates proposal)
            response = mgr.process_message(chart.prompt)

            if response.error:
                chart_result["error"] = response.error
                print(f"  ❌ Proposal error: {response.error[:100]}...")
                results.append(chart_result)
                time.sleep(1)
                continue

            # Step 2: Trigger chart generation
            response = mgr.process_message("__action:generate")

            if response.error:
                chart_result["error"] = response.error
                print(f"  ❌ Pipeline error: {response.error[:100]}...")
            elif not response.chart_url:
                chart_result["error"] = "No chart URL returned"
                print(f"  ❌ No chart URL returned")
            else:
                chart_result["success"] = True
                chart_result["chart_url"] = response.chart_url
                print(f"  ✅ Chart generated: {response.chart_url}")

                # Extract chart ID from URL for QA validation
                # URL format: http://localhost:3001/chart/{chart_id}
                chart_id_from_url = response.chart_url.split("/chart/")[-1] if response.chart_url else None

                if chart_id_from_url:
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    screenshot_path = screenshots_dir / f"{source_name}_{chart.id}_{timestamp}.png"

                    # Take screenshot using chart mode
                    screenshotter = DashboardScreenshot(mode="chart")
                    screenshot_result = screenshotter.capture(
                        f"chart/{chart_id_from_url}",
                        save_path=screenshot_path,
                        timeout=45000,
                    )

                    if screenshot_result.success:
                        chart_result["screenshot_path"] = str(screenshot_path)
                        print(f"  📸 Screenshot: {screenshot_path.name}")

                        # Run QA validation using ChartQA
                        qa = ChartQA()
                        qa_result = qa.validate(
                            chart_id=chart_id_from_url,
                            original_request=chart.prompt,
                        )

                        chart_result["qa_passed"] = qa_result.passed
                        chart_result["qa_issues"] = qa_result.critical_issues if qa_result.critical_issues else []

                        if qa_result.passed:
                            print(f"  ✅ QA Passed: {qa_result.summary[:80]}...")
                        else:
                            print(f"  ⚠️  QA Issues: {qa_result.critical_issues}")
                    else:
                        print(f"  ⚠️  Screenshot failed: {screenshot_result.error}")

        except Exception as e:
            import traceback
            chart_result["error"] = str(e)
            print(f"  ❌ Exception: {e}")
            traceback.print_exc()

        results.append(chart_result)
        time.sleep(1)  # Small delay between charts

    return results


def main():
    all_results = []

    # Create screenshots directory
    screenshots_dir = Path("test_results/suggested_chart_screenshots")
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    # Test both sources
    for source in ["snowflake_saas", "olist_ecommerce"]:
        results = test_source_charts(source, screenshots_dir)
        all_results.extend(results)

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")

    passed = sum(1 for r in all_results if r["success"])
    failed = sum(1 for r in all_results if not r["success"])
    qa_passed = sum(1 for r in all_results if r.get("qa_passed") is True)

    print(f"\nTotal: {len(all_results)} charts")
    print(f"Generated Successfully: {passed}")
    print(f"Failed to Generate: {failed}")
    print(f"QA Passed: {qa_passed}")
    print(f"Generation Pass Rate: {passed/len(all_results)*100:.1f}%")

    # Show failures
    failures = [r for r in all_results if not r["success"]]
    if failures:
        print(f"\nFailed Charts:")
        for f in failures:
            error = f['error'][:100] if f['error'] else "Unknown error"
            print(f"  - [{f['source']}] {f['chart_name']}: {error}")

    # Show QA issues
    qa_issues = [r for r in all_results if r.get("qa_passed") is False]
    if qa_issues:
        print(f"\nCharts with QA Issues:")
        for r in qa_issues:
            print(f"  - [{r['source']}] {r['chart_name']}: {r['qa_issues']}")

    # Show all chart URLs for review
    print(f"\n{'='*60}")
    print("CHART URLs FOR REVIEW")
    print(f"{'='*60}")
    for r in all_results:
        status = "✅" if r["success"] else "❌"
        url = r.get("chart_url", "N/A")
        qa = ""
        if r.get("qa_passed") is True:
            qa = " [QA: ✅]"
        elif r.get("qa_passed") is False:
            qa = f" [QA: ❌]"
        print(f"{status} [{r['source']}] {r['chart_name']}: {url}{qa}")

    # Save detailed results
    output_path = Path("test_results/suggested_charts_test.json")
    output_path.parent.mkdir(exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nDetailed results saved to: {output_path}")
    print(f"Screenshots saved to: {screenshots_dir}")

    return all_results


if __name__ == "__main__":
    results = main()
