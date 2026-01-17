"""
QA module for dashboard validation.

Uses Playwright to capture screenshots and Claude's vision to verify
dashboards match the original request.
"""

import asyncio
import base64
from dataclasses import dataclass
from pathlib import Path

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

from .config import get_config


@dataclass
class ScreenshotResult:
    """Result of a screenshot capture."""

    success: bool
    image_data: bytes | None = None
    image_base64: str | None = None
    error: str | None = None
    filepath: Path | None = None


@dataclass
class QAResult:
    """Result of QA validation."""

    passed: bool
    summary: str
    critical_issues: list[str]  # Errors that must be fixed (data errors, missing elements, broken charts)
    suggestions: list[str]  # Optional improvements (nice-to-haves)

    @property
    def needs_auto_fix(self) -> bool:
        """Returns True if there are critical issues that need automatic fixing."""
        return len(self.critical_issues) > 0


class DashboardScreenshot:
    """Captures screenshots of Evidence dashboards."""

    def __init__(self, base_url: str | None = None):
        config = get_config()
        self.base_url = base_url or config.dev_url

    async def capture_async(
        self,
        dashboard_slug: str,
        wait_for_data: bool = True,
        timeout: int = 30000,
        save_path: Path | None = None,
    ) -> ScreenshotResult:
        """
        Capture a screenshot of a dashboard (async version).

        Args:
            dashboard_slug: The dashboard slug (filename without .md)
            wait_for_data: Whether to wait for data to load
            timeout: Maximum time to wait in milliseconds
            save_path: Optional path to save the screenshot

        Returns:
            ScreenshotResult with the captured image
        """
        url = f"{self.base_url}/{dashboard_slug}"

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1280, "height": 900})

                # Navigate to the dashboard
                await page.goto(url, wait_until="networkidle", timeout=timeout)

                if wait_for_data:
                    # Wait for Evidence to finish loading data
                    await self._wait_for_dashboard_ready(page, timeout)

                # Take screenshot
                screenshot_bytes = await page.screenshot(full_page=True)
                await browser.close()

                # Convert to base64 for API
                image_base64 = base64.standard_b64encode(screenshot_bytes).decode("utf-8")

                # Optionally save to file
                filepath = None
                if save_path:
                    save_path.parent.mkdir(parents=True, exist_ok=True)
                    save_path.write_bytes(screenshot_bytes)
                    filepath = save_path

                return ScreenshotResult(
                    success=True,
                    image_data=screenshot_bytes,
                    image_base64=image_base64,
                    filepath=filepath,
                )

        except PlaywrightTimeout as e:
            return ScreenshotResult(
                success=False,
                error=f"Timeout waiting for dashboard to load: {e}",
            )
        except Exception as e:
            return ScreenshotResult(
                success=False,
                error=f"Failed to capture screenshot: {e}",
            )

    def capture(
        self,
        dashboard_slug: str,
        wait_for_data: bool = True,
        timeout: int = 30000,
        save_path: Path | None = None,
    ) -> ScreenshotResult:
        """
        Capture a screenshot of a dashboard (sync wrapper).

        This runs the async capture in a new event loop to avoid conflicts
        with existing event loops (e.g., FastAPI's).
        """
        try:
            # Try to get the running loop
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # No running loop, we can use asyncio.run()
            return asyncio.run(
                self.capture_async(dashboard_slug, wait_for_data, timeout, save_path)
            )

        # There's a running loop (e.g., FastAPI), run in a new thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(
                asyncio.run,
                self.capture_async(dashboard_slug, wait_for_data, timeout, save_path)
            )
            return future.result()

    async def _wait_for_dashboard_ready(self, page, timeout: int):
        """Wait for the dashboard to finish loading data and rendering."""
        # Wait for any loading indicators to disappear
        # Evidence uses various loading states we need to wait out

        # First, wait a moment for initial render
        await asyncio.sleep(1)

        # Wait for no more "Loading..." text or error states to appear
        # Check that charts/tables have rendered (have content)
        try:
            # Wait for the main content area to be stable
            await page.wait_for_load_state("networkidle", timeout=timeout)

            # Give charts a moment to render after data loads
            await asyncio.sleep(2)

        except PlaywrightTimeout:
            # If we timeout, proceed anyway - we'll capture whatever state it's in
            pass


class DashboardQA:
    """Validates dashboards using vision analysis."""

    def __init__(self):
        from .llm.claude import ClaudeProvider
        from .config_loader import get_config_loader
        self.llm = ClaudeProvider()
        self.screenshotter = DashboardScreenshot()
        self.config_loader = get_config_loader()

    def validate(
        self,
        dashboard_slug: str,
        original_request: str,
        expected_components: list[str] | None = None,
    ) -> QAResult:
        """
        Validate a dashboard against the original request.

        Args:
            dashboard_slug: The dashboard slug to validate
            original_request: The original user request for the dashboard
            expected_components: Optional list of expected components

        Returns:
            QAResult with validation results
        """
        # Capture screenshot (sync wrapper handles async internally)
        screenshot = self.screenshotter.capture(dashboard_slug)

        if not screenshot.success:
            return QAResult(
                passed=False,
                summary=f"Could not capture screenshot: {screenshot.error}",
                critical_issues=[screenshot.error],
                suggestions=["Ensure the Evidence dev server is running"],
            )

        # Build the validation prompt
        prompt = self._build_validation_prompt(original_request, expected_components)

        # Send to Claude with vision
        response = self.llm.generate_with_image(
            prompt=prompt,
            image_base64=screenshot.image_base64,
            image_media_type="image/png",
        )

        # Parse the response
        return self._parse_validation_response(response.content)

    def _build_validation_prompt(
        self,
        original_request: str,
        expected_components: list[str] | None,
    ) -> str:
        """Build the validation prompt for Claude using config-driven template."""
        # Get the prompt from config
        prompt = self.config_loader.get_qa_validation_prompt(original_request)

        # Add expected components if provided
        if expected_components:
            components_text = "\n".join(f"- {c}" for c in expected_components)
            prompt = prompt.replace(
                "ORIGINAL REQUEST:",
                f"EXPECTED COMPONENTS:\n{components_text}\n\nORIGINAL REQUEST:"
            )

        return prompt

    def _parse_validation_response(self, response: str) -> QAResult:
        """Parse Claude's validation response into a QAResult."""
        lines = response.strip().split("\n")

        result_says_pass = False
        summary = ""
        critical_issues = []
        suggestions = []

        current_section = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if line.startswith("RESULT:"):
                result_text = line.replace("RESULT:", "").strip().upper()
                result_says_pass = "PASS" in result_text
            elif line.startswith("SUMMARY:"):
                summary = line.replace("SUMMARY:", "").strip()
            elif line.startswith("CRITICAL:"):
                current_section = "critical"
            elif line.startswith("SUGGESTIONS:"):
                current_section = "suggestions"
            elif line.startswith("- "):
                item = line[2:].strip()
                if item.lower() != "none":
                    if current_section == "critical":
                        critical_issues.append(item)
                    elif current_section == "suggestions":
                        suggestions.append(item)

        # Determine actual pass/fail status
        # Override PASS if there are critical issues or summary indicates failure
        passed = result_says_pass
        if critical_issues:
            passed = False  # Can't pass if there are critical issues

        # Check summary for failure indicators (e.g., Claude says "broken" in summary)
        failure_keywords = [
            "broken", "error", "failed", "failing", "not working",
            "cannot", "can't", "unable", "no data", "missing",
            "catalog error", "sql error", "binder error"
        ]
        summary_lower = summary.lower()
        for keyword in failure_keywords:
            if keyword in summary_lower:
                passed = False
                break

        return QAResult(
            passed=passed,
            summary=summary,
            critical_issues=critical_issues,
            suggestions=suggestions,
        )


def validate_dashboard(
    dashboard_slug: str,
    original_request: str,
    expected_components: list[str] | None = None,
) -> QAResult:
    """Convenience function to validate a dashboard."""
    qa = DashboardQA()
    return qa.validate(dashboard_slug, original_request, expected_components)


def auto_fix_dashboard(
    file_path: Path,
    critical_issues: list[str],
    schema_context: str | None = None,
) -> str:
    """
    Standalone function to auto-fix critical issues in a dashboard.

    This function is decoupled from ConversationManager so it can be used
    for scheduled QA monitoring and other automated workflows.

    Args:
        file_path: Path to the dashboard markdown file
        critical_issues: List of critical issues to fix
        schema_context: Optional database schema context for better fixes

    Returns:
        Updated markdown content
    """
    from .config_loader import get_config_loader
    from .llm.claude import get_provider
    from .schema import get_schema_context

    config_loader = get_config_loader()
    llm = get_provider()

    # Read current content
    current_content = file_path.read_text()

    # Get fix prompt from config
    fix_prompt = config_loader.get_qa_auto_fix_prompt(
        issues=critical_issues,
        current_content=current_content
    )

    # Build system prompt with schema context
    system_prompt = config_loader.get_base_prompt()
    if schema_context:
        system_prompt += f"\n\nDATABASE SCHEMA:\n{schema_context}"
    else:
        # Get schema context if not provided
        try:
            schema = get_schema_context()
            system_prompt += f"\n\nDATABASE SCHEMA:\n{schema}"
        except Exception:
            pass  # Continue without schema if unavailable

    # Add component documentation
    components_prompt = config_loader.get_components_prompt()
    system_prompt += f"\n\n{components_prompt}"

    # Generate fix
    from .llm.base import Message
    response = llm.generate(
        messages=[Message(role="user", content=fix_prompt)],
        system_prompt=system_prompt,
        temperature=0.3,
    )

    new_markdown = response.content

    # Clean up markdown fences
    if new_markdown.startswith("```markdown"):
        new_markdown = new_markdown[len("```markdown"):].strip()
    if new_markdown.startswith("```"):
        new_markdown = new_markdown.split("\n", 1)[1] if "\n" in new_markdown else new_markdown[3:]
    if new_markdown.endswith("```"):
        new_markdown = new_markdown.rsplit("```", 1)[0]

    return new_markdown.strip()


@dataclass
class QARunResult:
    """Result of a complete QA run with optional auto-fix."""

    initial_result: QAResult
    final_result: QAResult
    auto_fix_attempted: bool
    auto_fix_succeeded: bool
    issues_fixed: list[str]
    issues_remaining: list[str]


def run_qa_with_auto_fix(
    dashboard_slug: str,
    file_path: Path,
    original_request: str,
    max_fix_attempts: int = 2,
    schema_context: str | None = None,
) -> QARunResult:
    """
    Run QA validation with automatic fix attempts.

    This is a standalone function that can be used for:
    - Scheduled QA monitoring
    - Post-creation validation
    - Manual QA runs

    Args:
        dashboard_slug: The dashboard slug to validate
        file_path: Path to the dashboard markdown file
        original_request: Original user request for validation context
        max_fix_attempts: Maximum number of auto-fix attempts
        schema_context: Optional database schema context

    Returns:
        QARunResult with complete run information
    """
    qa = DashboardQA()
    initial_result = None
    final_result = None
    auto_fix_attempted = False
    attempted_fixes = []

    for attempt in range(max_fix_attempts + 1):
        result = qa.validate(dashboard_slug, original_request)

        if initial_result is None:
            initial_result = result

        final_result = result

        if result.needs_auto_fix and attempt < max_fix_attempts:
            # Attempt auto-fix
            attempted_fixes.extend(result.critical_issues)
            fixed_markdown = auto_fix_dashboard(
                file_path=file_path,
                critical_issues=result.critical_issues,
                schema_context=schema_context,
            )
            file_path.write_text(fixed_markdown)
            auto_fix_attempted = True
            # Continue loop to re-validate
        else:
            # No issues or max attempts reached
            break

    # Determine which issues were actually fixed
    final_issues = set(final_result.critical_issues) if final_result else set()
    issues_fixed = [issue for issue in attempted_fixes if issue not in final_issues]
    issues_remaining = list(final_issues)

    return QARunResult(
        initial_result=initial_result,
        final_result=final_result,
        auto_fix_attempted=auto_fix_attempted,
        auto_fix_succeeded=auto_fix_attempted and len(issues_remaining) == 0,
        issues_fixed=issues_fixed,
        issues_remaining=issues_remaining,
    )
