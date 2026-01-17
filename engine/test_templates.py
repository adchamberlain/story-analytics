"""
Template Testing Script - Tests all dashboard templates against the pipeline.

Runs each template through the dashboard generation pipeline and reports:
- Which templates succeed
- Which templates fail (and why)
- Feasibility check results

Results are written to test_results.txt for easy review.
"""

import sys
from datetime import datetime
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from engine.config_loader import get_config_loader
from engine.schema import get_schema_context
from engine.pipeline import DashboardPipeline, PipelineConfig
from engine.pipeline.requirements_agent import RequirementsAgent
from engine.pipeline.feasibility_checker import FeasibilityChecker


def test_all_templates(output_file: str = "test_results.txt"):
    """Test all templates and write results to file."""

    results = []
    results.append(f"Template Test Results - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    results.append("=" * 70)
    results.append("")

    # Load schema
    print("Loading schema...")
    schema = get_schema_context()
    results.append(f"Schema loaded ({len(schema)} chars)")
    results.append("")

    # Load templates
    print("Loading templates...")
    config = get_config_loader()
    templates_data = config.get_templates()

    # Initialize agents
    requirements_agent = RequirementsAgent()
    feasibility_checker = FeasibilityChecker()

    # Track overall stats
    total = 0
    passed = 0
    failed = 0
    partial = 0

    for category in templates_data.get("categories", []):
        cat_id = category["id"]
        cat_name = category["name"]

        results.append(f"\n{'='*70}")
        results.append(f"Category: {cat_name} ({cat_id})")
        results.append("=" * 70)

        for template in category.get("templates", []):
            total += 1
            template_id = template["id"]
            template_name = template["name"]
            prompt = template["prompt"]

            print(f"\nTesting: {cat_name} / {template_name}...")
            results.append(f"\n--- {template_name} ({template_id}) ---")
            results.append(f"Prompt: {prompt[:100]}...")

            try:
                # Step 1: Extract requirements
                print(f"  Extracting requirements...")
                spec = requirements_agent.extract_spec(prompt, schema)
                results.append(f"  Requirements extracted: {spec.title}")
                results.append(f"    Metrics: {len(spec.metrics)}")
                results.append(f"    Visualizations: {len(spec.visualizations)}")
                results.append(f"    Tables: {spec.relevant_tables}")

                # Step 2: Check feasibility
                print(f"  Checking feasibility...")
                feasibility = feasibility_checker.check(spec, schema)

                if feasibility.fully_feasible:
                    results.append(f"  FULLY FEASIBLE")
                    passed += 1
                    status = "PASS"
                elif feasibility.feasible:
                    results.append(f"  PARTIALLY FEASIBLE")
                    results.append(f"    Can build: {feasibility.feasible_parts[:3]}")
                    results.append(f"    Cannot build: {feasibility.infeasible_parts[:3]}")
                    results.append(f"    Explanation: {feasibility.explanation}")
                    if feasibility.suggested_alternative:
                        results.append(f"    Alternative: {feasibility.suggested_alternative}")
                    partial += 1
                    status = "PARTIAL"
                else:
                    results.append(f"  NOT FEASIBLE")
                    results.append(f"    Explanation: {feasibility.explanation}")
                    if feasibility.suggested_alternative:
                        results.append(f"    Alternative: {feasibility.suggested_alternative}")
                    failed += 1
                    status = "FAIL"

                results.append(f"  Status: {status}")

            except Exception as e:
                results.append(f"  ERROR: {e}")
                failed += 1
                status = "ERROR"

            print(f"  Result: {status}")

    # Summary
    results.append(f"\n{'='*70}")
    results.append("SUMMARY")
    results.append("=" * 70)
    results.append(f"Total templates: {total}")
    results.append(f"Fully feasible (PASS): {passed}")
    results.append(f"Partially feasible (PARTIAL): {partial}")
    results.append(f"Not feasible (FAIL): {failed}")
    results.append(f"Success rate: {(passed/total*100):.1f}%" if total > 0 else "N/A")

    # Write to file
    output_path = Path(__file__).parent.parent / output_file
    with open(output_path, "w") as f:
        f.write("\n".join(results))

    print(f"\nResults written to: {output_path}")
    return output_path


def test_single_template_full(template_id: str, output_file: str = "single_test_result.txt"):
    """Run a single template through the full pipeline."""

    results = []
    results.append(f"Full Pipeline Test - {template_id}")
    results.append(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    results.append("=" * 70)

    # Find template
    config = get_config_loader()
    templates_data = config.get_templates()
    template = None
    for category in templates_data.get("categories", []):
        for t in category.get("templates", []):
            if t["id"] == template_id:
                template = t
                break

    if not template:
        results.append(f"Template not found: {template_id}")
        return

    prompt = template["prompt"]
    results.append(f"Template: {template['name']}")
    results.append(f"Prompt: {prompt}")
    results.append("")

    # Run full pipeline
    config = PipelineConfig(verbose=True, check_feasibility=True)
    pipeline = DashboardPipeline(config)

    print(f"Running full pipeline for: {template['name']}")
    result = pipeline.run(prompt)

    results.append(f"Success: {result.success}")
    if result.error:
        results.append(f"Error: {result.error}")
    if result.markdown:
        results.append(f"\nGenerated Markdown ({len(result.markdown)} chars):")
        results.append("-" * 40)
        results.append(result.markdown[:2000])
        if len(result.markdown) > 2000:
            results.append(f"... (truncated, total {len(result.markdown)} chars)")

    # Write to file
    output_path = Path(__file__).parent.parent / output_file
    with open(output_path, "w") as f:
        f.write("\n".join(results))

    print(f"\nResults written to: {output_path}")
    return output_path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Test dashboard templates")
    parser.add_argument("--template", "-t", help="Test a single template by ID (full pipeline)")
    parser.add_argument("--output", "-o", default="test_results.txt", help="Output file")

    args = parser.parse_args()

    if args.template:
        test_single_template_full(args.template, args.output)
    else:
        test_all_templates(args.output)
