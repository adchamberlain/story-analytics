"""
QA module for dashboard validation.

Uses Playwright to capture screenshots and Claude's vision to verify
dashboards match the original request.
"""

import base64
import time
from dataclasses import dataclass
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

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

    def capture(
        self,
        dashboard_slug: str,
        wait_for_data: bool = True,
        timeout: int = 30000,
        save_path: Path | None = None,
    ) -> ScreenshotResult:
        """
        Capture a screenshot of a dashboard.

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
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page(viewport={"width": 1280, "height": 900})

                # Navigate to the dashboard
                page.goto(url, wait_until="networkidle", timeout=timeout)

                if wait_for_data:
                    # Wait for Evidence to finish loading data
                    # Evidence shows loading states, then renders charts
                    self._wait_for_dashboard_ready(page, timeout)

                # Take screenshot
                screenshot_bytes = page.screenshot(full_page=True)
                browser.close()

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

    def _wait_for_dashboard_ready(self, page, timeout: int):
        """Wait for the dashboard to finish loading data and rendering."""
        # Wait for any loading indicators to disappear
        # Evidence uses various loading states we need to wait out

        # First, wait a moment for initial render
        time.sleep(1)

        # Wait for no more "Loading..." text or error states to appear
        # Check that charts/tables have rendered (have content)
        try:
            # Wait for the main content area to be stable
            page.wait_for_load_state("networkidle", timeout=timeout)

            # Give charts a moment to render after data loads
            time.sleep(2)

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
        # Capture screenshot
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

        passed = False
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
                passed = "PASS" in result_text
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
