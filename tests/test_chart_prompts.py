"""
Autonomous Chart Prompt Testing System

Runs 30 realistic PM/data scientist prompts across all 3 LLMs in parallel.
Each provider runs in a separate process with its own result file for parallel safety.

Usage:
    python tests/test_chart_prompts.py                    # Run all providers in parallel
    python tests/test_chart_prompts.py --provider claude  # Single provider
    python tests/test_chart_prompts.py --prompts 01,05,10 # Specific prompts only
    python tests/test_chart_prompts.py --verbose          # Verbose output
    python tests/test_chart_prompts.py --no-qa            # Skip QA validation (faster)
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

import yaml

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class PromptTestResult:
    """Result from testing a single prompt with one provider."""
    prompt_id: str
    prompt: str
    category: str
    provider: str
    success: bool
    error: Optional[str] = None
    error_type: str = "unknown"  # "infrastructure", "pipeline", "qa", "unknown"
    chart_id: Optional[str] = None
    chart_url: Optional[str] = None
    dashboard_slug: Optional[str] = None
    sql: Optional[str] = None
    sql_valid: bool = False
    screenshot_path: Optional[str] = None
    qa_passed: Optional[bool] = None
    qa_summary: Optional[str] = None
    qa_critical_issues: list = field(default_factory=list)
    duration_seconds: float = 0.0


@dataclass
class ProviderResults:
    """Complete results for one provider."""
    provider: str
    timestamp: str
    total: int = 0
    passed: int = 0
    failed: int = 0
    results: list = field(default_factory=list)

    @property
    def pass_rate(self) -> float:
        return (self.passed / self.total * 100) if self.total > 0 else 0


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def load_prompts(yaml_path: Path) -> list[dict]:
    """Load prompt definitions from YAML."""
    with open(yaml_path, "r") as f:
        data = yaml.safe_load(f)
    return data.get("prompts", [])


def check_api_key(provider: str) -> bool:
    """Check if API key is available for a provider."""
    key_map = {
        "claude": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "gemini": "GOOGLE_API_KEY",
    }
    return bool(os.environ.get(key_map.get(provider, "")))


def check_server(url: str = "http://localhost:3001", timeout: float = 5.0) -> tuple[bool, str]:
    """Check if the React frontend server is running."""
    import requests
    try:
        response = requests.get(url, timeout=timeout)
        if response.status_code == 200:
            return True, ""
        return False, f"Server returned status {response.status_code}"
    except requests.ConnectionError:
        return False, "Connection refused - server not running"
    except requests.Timeout:
        return False, "Connection timeout"
    except Exception as e:
        return False, str(e)


# =============================================================================
# TEST EXECUTION
# =============================================================================

def test_single_prompt(
    prompt_def: dict,
    provider: str,
    screenshots_dir: Path,
    timestamp: str,
    skip_qa: bool = False,
    verbose: bool = False,
) -> PromptTestResult:
    """
    Test a single prompt with a single provider.

    Returns:
        PromptTestResult with success/failure details
    """
    # Import inside function to avoid issues with multiprocessing
    from engine.chart_conversation import ChartConversationManager, ChartPhase
    from engine.qa import DashboardScreenshot, DashboardQA
    from engine.config import clear_config_cache
    from engine.schema import clear_schema_cache
    from engine.sql_validator import clear_validator_cache

    # Clear caches to ensure fresh data is loaded (important when switching data sources)
    clear_config_cache()
    clear_schema_cache()
    clear_validator_cache()

    prompt_id = prompt_def["id"]
    prompt = prompt_def["prompt"]
    category = prompt_def.get("category", "unknown")

    start_time = time.time()

    result = PromptTestResult(
        prompt_id=prompt_id,
        prompt=prompt,
        category=category,
        provider=provider,
        success=False,
    )

    if verbose:
        print(f"  [{provider}] Testing prompt {prompt_id}: {prompt[:50]}...")

    try:
        # Create conversation manager
        manager = ChartConversationManager(provider_name=provider)

        # Process the request (this returns a PROPOSAL, not the final chart)
        response = manager.process_message(prompt)

        if response.error:
            result.error = response.error
            result.error_type = "pipeline"
            if verbose:
                print(f"    Pipeline error: {response.error[:80]}...")
            result.duration_seconds = time.time() - start_time
            return result

        # The conversation manager has a two-phase flow:
        # 1. First call creates a PROPOSAL (shows SQL preview)
        # 2. User must click "generate" action to create the actual chart
        # We need to send the generate action to complete chart creation
        if manager.state.phase == ChartPhase.PROPOSING:
            if verbose:
                print(f"    Proposal received, sending generate action...")
            response = manager.process_message("__action:generate")

            if response.error:
                result.error = response.error
                result.error_type = "pipeline"
                if verbose:
                    print(f"    Generation error: {response.error[:80]}...")
                result.duration_seconds = time.time() - start_time
                return result

        if not response.chart_url:
            result.error = "No chart URL returned"
            result.error_type = "pipeline"
            if verbose:
                print(f"    No chart URL returned")
            result.duration_seconds = time.time() - start_time
            return result

        # Extract chart info
        result.chart_url = response.chart_url
        result.chart_id = response.chart_id
        result.dashboard_slug = response.dashboard_slug or manager.state.dashboard_slug

        # Get SQL if available
        if manager.state.current_chart:
            result.sql = manager.state.current_chart.sql
            result.sql_valid = bool(result.sql and len(result.sql) > 20)

        # Take screenshot using the chart_id path
        # The React app route is /chart/:chartId, not /{dashboard_slug}
        if result.chart_id and not skip_qa:
            screenshot_path = screenshots_dir / f"{prompt_id}_{provider}_{timestamp}.png"

            screenshotter = DashboardScreenshot()
            # Use chart/{id} path which matches React route /chart/:chartId
            screenshot_result = screenshotter.capture(
                f"chart/{result.chart_id}",
                save_path=screenshot_path,
                timeout=45000,
            )

            if screenshot_result.success:
                result.screenshot_path = str(screenshot_path)
                if verbose:
                    print(f"    Screenshot saved: {screenshot_path.name}")

                # Run QA validation (always use Claude for consistent evaluation)
                qa = DashboardQA(provider_name="claude")

                validation_criteria = prompt_def.get("validation_criteria", [])
                validation_context = f"""
Original Request: {prompt}

Expected Chart Type: {prompt_def.get('expected_chart_type', 'any')}

Validation Criteria:
{chr(10).join('- ' + c for c in validation_criteria)}
"""
                # Use chart/{id} path for QA validation
                qa_result = qa.validate(f"chart/{result.chart_id}", validation_context)

                result.qa_passed = qa_result.passed
                result.qa_summary = qa_result.summary
                result.qa_critical_issues = qa_result.critical_issues

                if verbose:
                    print(f"    QA: {'PASS' if qa_result.passed else 'FAIL'}")
            else:
                result.error = f"Screenshot failed: {screenshot_result.error}"
                result.error_type = "infrastructure"
                if verbose:
                    print(f"    Screenshot failed: {screenshot_result.error[:60]}...")
                result.duration_seconds = time.time() - start_time
                return result

        # Determine overall success
        if skip_qa:
            result.success = result.sql_valid and result.chart_url is not None
        else:
            result.success = (
                result.sql_valid and
                result.qa_passed is True and
                len(result.qa_critical_issues) == 0
            )

        if verbose:
            status = "PASS" if result.success else "FAIL"
            print(f"    Result: {status}")

    except Exception as e:
        result.error = str(e)
        result.error_type = "pipeline"
        if verbose:
            print(f"    Exception: {e}")
        import traceback
        traceback.print_exc()

    result.duration_seconds = time.time() - start_time
    return result


def run_provider_tests(
    provider: str,
    prompts: list[dict],
    timestamp: str,
    output_dir: Path,
    screenshots_dir: Path,
    skip_qa: bool = False,
    verbose: bool = False,
) -> ProviderResults:
    """
    Run all tests for a single provider (runs in subprocess).

    Writes incremental results to a provider-specific JSON file.
    """
    print(f"\n{'='*60}")
    print(f"TESTING PROVIDER: {provider.upper()}")
    print(f"{'='*60}")

    # Check API key
    if not check_api_key(provider):
        print(f"  Skipping: Missing API key")
        return ProviderResults(provider=provider, timestamp=timestamp)

    results = ProviderResults(
        provider=provider,
        timestamp=timestamp,
        total=len(prompts),
    )

    output_file = output_dir / f"prompts_{provider}_{timestamp}.json"

    for i, prompt_def in enumerate(prompts):
        print(f"\n[{i+1}/{len(prompts)}] Prompt {prompt_def['id']}: {prompt_def['prompt'][:50]}...")

        # Check server before each test
        server_ok, server_error = check_server()
        if not server_ok:
            print(f"  Server down: {server_error}")
            result = PromptTestResult(
                prompt_id=prompt_def["id"],
                prompt=prompt_def["prompt"],
                category=prompt_def.get("category", "unknown"),
                provider=provider,
                success=False,
                error=f"Server not running: {server_error}",
                error_type="infrastructure",
            )
            results.results.append(asdict(result))
            results.failed += 1
            continue

        # Test the prompt
        result = test_single_prompt(
            prompt_def=prompt_def,
            provider=provider,
            screenshots_dir=screenshots_dir,
            timestamp=timestamp,
            skip_qa=skip_qa,
            verbose=verbose,
        )

        results.results.append(asdict(result))

        if result.success:
            results.passed += 1
            print(f"  PASS")
        else:
            results.failed += 1
            print(f"  FAIL: {result.error or 'QA validation failed'}")

        # Write incremental results (parallel-safe)
        with open(output_file, "w") as f:
            json.dump(asdict(results), f, indent=2)

    print(f"\n{provider.upper()} Complete: {results.passed}/{results.total} passed ({results.pass_rate:.1f}%)")
    return results


# =============================================================================
# ANALYSIS REPORT
# =============================================================================

def generate_analysis_report(
    all_results: dict[str, ProviderResults],
    prompts: list[dict],
    timestamp: str,
    output_dir: Path,
):
    """Generate combined markdown analysis report."""
    report_path = output_dir / f"prompts_analysis_{timestamp}.md"

    lines = [
        "# Chart Prompt Test Results",
        "",
        f"**Test Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"**Total Prompts:** {len(prompts)}",
        f"**Providers Tested:** {', '.join(all_results.keys())}",
        "",
        "---",
        "",
        "## Summary",
        "",
        "| Provider | Passed | Failed | Pass Rate |",
        "|----------|--------|--------|-----------|",
    ]

    for provider, results in all_results.items():
        if results.total > 0:
            status = "" if results.pass_rate >= 90 else "" if results.pass_rate >= 70 else ""
            lines.append(f"| {provider.capitalize()} | {results.passed} | {results.failed} | {status} {results.pass_rate:.1f}% |")
        else:
            lines.append(f"| {provider.capitalize()} | - | - | Skipped |")

    # By Category breakdown
    lines.extend([
        "",
        "---",
        "",
        "## Results by Category",
        "",
    ])

    categories = {}
    for prompt in prompts:
        cat = prompt.get("category", "unknown")
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(prompt["id"])

    lines.append("| Category | " + " | ".join(p.capitalize() for p in all_results.keys()) + " |")
    lines.append("|----------|" + "|".join(["--------" for _ in all_results]) + "|")

    for cat, prompt_ids in categories.items():
        row = [cat.replace("_", " ").title()]
        for provider, results in all_results.items():
            if results.total == 0:
                row.append("-")
                continue
            cat_results = [r for r in results.results if r.get("prompt_id") in prompt_ids]
            passed = sum(1 for r in cat_results if r.get("success"))
            total = len(cat_results)
            row.append(f"{passed}/{total}")
        lines.append("| " + " | ".join(row) + " |")

    # By Chart Type breakdown
    lines.extend([
        "",
        "---",
        "",
        "## Results by Expected Chart Type",
        "",
    ])

    chart_types = {}
    for prompt in prompts:
        ct = prompt.get("expected_chart_type", "any")
        if ct not in chart_types:
            chart_types[ct] = []
        chart_types[ct].append(prompt["id"])

    lines.append("| Chart Type | " + " | ".join(p.capitalize() for p in all_results.keys()) + " |")
    lines.append("|------------|" + "|".join(["--------" for _ in all_results]) + "|")

    for ct, prompt_ids in chart_types.items():
        row = [ct]
        for provider, results in all_results.items():
            if results.total == 0:
                row.append("-")
                continue
            ct_results = [r for r in results.results if r.get("prompt_id") in prompt_ids]
            passed = sum(1 for r in ct_results if r.get("success"))
            total = len(ct_results)
            row.append(f"{passed}/{total}")
        lines.append("| " + " | ".join(row) + " |")

    # Failing Prompts
    lines.extend([
        "",
        "---",
        "",
        "## Failing Prompts",
        "",
    ])

    # Find prompts that failed for any provider
    failures_by_prompt = {}
    for prompt in prompts:
        pid = prompt["id"]
        failures = {}
        for provider, results in all_results.items():
            if results.total == 0:
                continue
            result = next((r for r in results.results if r.get("prompt_id") == pid), None)
            if result and not result.get("success"):
                failures[provider] = result
        if failures:
            failures_by_prompt[pid] = {
                "prompt": prompt["prompt"],
                "failures": failures,
            }

    if failures_by_prompt:
        for pid, data in failures_by_prompt.items():
            prompt_text = data["prompt"][:80] + "..." if len(data["prompt"]) > 80 else data["prompt"]
            lines.append(f"### Prompt {pid}: \"{prompt_text}\"")
            lines.append("")

            for provider, result in data["failures"].items():
                error = result.get("error") or "QA validation failed"
                error_type = result.get("error_type", "unknown")
                error_display = error[:100] if error else "QA validation failed"
                lines.append(f"- **{provider.capitalize()}**: [{error_type}] {error_display}")

                # Check if QA failed
                if result.get("qa_critical_issues"):
                    for issue in result.get("qa_critical_issues", [])[:2]:
                        lines.append(f"  - QA Issue: {issue}")

            # Check if systematic failure (all providers failed)
            failing_providers = list(data["failures"].keys())
            tested_providers = [p for p, r in all_results.items() if r.total > 0]
            if len(failing_providers) == len(tested_providers):
                lines.append("")
                lines.append("**SYSTEMATIC FAILURE** - All providers failed on this prompt")

            lines.append("")
    else:
        lines.append("*No failures!*")
        lines.append("")

    # Detailed Results
    lines.extend([
        "---",
        "",
        "## Detailed Results Matrix",
        "",
        "| # | Prompt | " + " | ".join(p.capitalize() for p in all_results.keys()) + " |",
        "|---|--------|" + "|".join(["------" for _ in all_results]) + "|",
    ])

    for prompt in prompts:
        pid = prompt["id"]
        prompt_text = prompt["prompt"][:40] + "..." if len(prompt["prompt"]) > 40 else prompt["prompt"]
        row = [pid, prompt_text]

        for provider, results in all_results.items():
            if results.total == 0:
                row.append("-")
                continue
            result = next((r for r in results.results if r.get("prompt_id") == pid), None)
            if result:
                if result.get("success"):
                    row.append("")
                elif result.get("error_type") == "infrastructure":
                    row.append(" Infra")
                else:
                    row.append("")
            else:
                row.append("?")

        lines.append("| " + " | ".join(row) + " |")

    # Recommendations
    lines.extend([
        "",
        "---",
        "",
        "## Recommendations",
        "",
    ])

    # Analyze systematic failures
    systematic = [pid for pid, data in failures_by_prompt.items()
                  if len(data["failures"]) == len([p for p, r in all_results.items() if r.total > 0])]

    if systematic:
        lines.append("### Systematic Failures (Need Template/Pipeline Fixes)")
        for pid in systematic:
            prompt_text = next(p["prompt"] for p in prompts if p["id"] == pid)
            lines.append(f"- **Prompt {pid}**: {prompt_text[:60]}...")
        lines.append("")

    # Provider-specific failures
    for provider, results in all_results.items():
        if results.total == 0:
            continue
        provider_only_failures = []
        for prompt in prompts:
            pid = prompt["id"]
            # Check if only this provider failed
            result = next((r for r in results.results if r.get("prompt_id") == pid), None)
            if result and not result.get("success"):
                # Check other providers
                others_passed = all(
                    next((r for r in other_results.results if r.get("prompt_id") == pid), {}).get("success", False)
                    for other_provider, other_results in all_results.items()
                    if other_provider != provider and other_results.total > 0
                )
                if others_passed:
                    provider_only_failures.append(pid)

        if provider_only_failures:
            lines.append(f"### {provider.capitalize()}-Specific Failures")
            for pid in provider_only_failures:
                prompt_text = next(p["prompt"] for p in prompts if p["id"] == pid)
                lines.append(f"- **Prompt {pid}**: {prompt_text[:60]}...")
            lines.append("")

    if not systematic and all(len(failures_by_prompt) == 0 for _ in all_results):
        lines.append("*All tests passed! No recommendations needed.*")

    # Write report
    report_path.write_text("\n".join(lines))
    print(f"\n Analysis report: {report_path}")


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Autonomous Chart Prompt Testing")
    parser.add_argument("--provider", type=str, help="Test single provider (claude, openai, gemini)")
    parser.add_argument("--prompts", type=str, help="Comma-separated prompt IDs to test (e.g., 01,05,10)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--no-qa", action="store_true", help="Skip QA validation (faster)")
    parser.add_argument("--sequential", action="store_true", help="Run providers sequentially instead of parallel")
    args = parser.parse_args()

    # Load prompts
    prompts_file = Path(__file__).parent / "chart_prompts.yaml"
    prompts = load_prompts(prompts_file)

    # Filter prompts if specified
    if args.prompts:
        prompt_ids = [p.strip() for p in args.prompts.split(",")]
        prompts = [p for p in prompts if p["id"] in prompt_ids]

    # Select providers
    all_providers = ["claude", "openai", "gemini"]
    if args.provider:
        providers = [args.provider.lower()]
    else:
        providers = all_providers

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    print("=" * 60)
    print("AUTONOMOUS CHART PROMPT TESTING")
    print("=" * 60)
    print(f"\nPrompts: {len(prompts)}")
    print(f"Providers: {', '.join(providers)}")
    print(f"QA Validation: {'Disabled' if args.no_qa else 'Enabled'}")
    print(f"Mode: {'Sequential' if args.sequential else 'Parallel'}")

    # Check server
    server_ok, server_error = check_server()
    if not server_ok:
        print(f"\n Server not running: {server_error}")
        print("Start with: ./dev.sh")
        sys.exit(1)
    print(f"\n Server running at http://localhost:3001")

    # Check API keys
    print("\nAPI Keys:")
    available_providers = []
    for provider in providers:
        if check_api_key(provider):
            print(f"   {provider.capitalize()}")
            available_providers.append(provider)
        else:
            print(f"   {provider.capitalize()} (missing)")

    if not available_providers:
        print("\n No API keys available!")
        sys.exit(1)

    # Create output directories
    base_dir = Path(__file__).parent.parent
    output_dir = base_dir / "test_results"
    output_dir.mkdir(exist_ok=True)

    screenshots_dir = base_dir / "test_results" / "prompt_screenshots"
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nOutput: {output_dir}")
    print("=" * 60)

    # Run tests
    all_results = {}

    if args.sequential or len(available_providers) == 1:
        # Sequential execution
        for provider in available_providers:
            results = run_provider_tests(
                provider=provider,
                prompts=prompts,
                timestamp=timestamp,
                output_dir=output_dir,
                screenshots_dir=screenshots_dir,
                skip_qa=args.no_qa,
                verbose=args.verbose,
            )
            all_results[provider] = results
    else:
        # Parallel execution using ProcessPoolExecutor
        print(f"\nLaunching {len(available_providers)} providers in parallel...")

        with ProcessPoolExecutor(max_workers=len(available_providers)) as executor:
            futures = {
                executor.submit(
                    run_provider_tests,
                    provider,
                    prompts,
                    timestamp,
                    output_dir,
                    screenshots_dir,
                    args.no_qa,
                    args.verbose,
                ): provider
                for provider in available_providers
            }

            for future in as_completed(futures):
                provider = futures[future]
                try:
                    results = future.result()
                    all_results[provider] = results
                except Exception as e:
                    print(f"\n Error in {provider}: {e}")
                    all_results[provider] = ProviderResults(
                        provider=provider,
                        timestamp=timestamp,
                    )

    # Generate combined analysis report
    generate_analysis_report(all_results, prompts, timestamp, output_dir)

    # Print final summary
    print("\n" + "=" * 60)
    print("FINAL SUMMARY")
    print("=" * 60)

    total_passed = 0
    total_tests = 0

    for provider, results in all_results.items():
        if results.total > 0:
            status = "" if results.pass_rate >= 90 else "" if results.pass_rate >= 70 else ""
            print(f"  {provider.capitalize():10} {status} {results.passed}/{results.total} ({results.pass_rate:.1f}%)")
            total_passed += results.passed
            total_tests += results.total
        else:
            print(f"  {provider.capitalize():10}  Skipped")

    if total_tests > 0:
        overall_pct = total_passed / total_tests * 100
        print(f"\n  {'OVERALL':10} {total_passed}/{total_tests} ({overall_pct:.1f}%)")

    print("\nResult files:")
    for provider in all_results.keys():
        print(f"  - test_results/prompts_{provider}_{timestamp}.json")
    print(f"  - test_results/prompts_analysis_{timestamp}.md")

    print("=" * 60)

    # Exit with error code if any tests failed
    sys.exit(0 if total_passed == total_tests else 1)


if __name__ == "__main__":
    main()
