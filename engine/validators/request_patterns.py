"""
Request Pattern Validator - Detects user intent patterns that LLMs miss.

This validator corrects ChartSpec fields based on deterministic pattern
matching against the original user request. It runs after LLM extraction
to catch cases where the LLM failed to set expected fields.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..models.chart import ChartSpec


class RequestPatternValidator:
    """Validates and corrects ChartSpec based on request patterns."""

    # Patterns that indicate horizontal bar chart
    HORIZONTAL_PATTERNS = [
        "horizontal bar",
        "horizontal bars",
        "bar chart horizontal",
        "bars horizontal",
        "horizontal bar chart",
    ]

    @classmethod
    def validate_horizontal(cls, spec: "ChartSpec") -> "ChartSpec":
        """
        Ensure horizontal is set if user explicitly requested horizontal bars.

        The LLM prompt instructs it to set horizontal=True for horizontal bar
        requests, but this isn't always followed. This validator provides a
        deterministic fallback.

        Args:
            spec: The ChartSpec to validate

        Returns:
            The spec with horizontal corrected if needed
        """
        request_lower = spec.original_request.lower()

        for pattern in cls.HORIZONTAL_PATTERNS:
            if pattern in request_lower:
                if not spec.horizontal:
                    print(f"[RequestPatternValidator] Corrected: horizontal=True (detected '{pattern}')")
                    spec.horizontal = True
                break

        return spec

    @classmethod
    def validate(cls, spec: "ChartSpec") -> "ChartSpec":
        """
        Run all request pattern validations.

        Args:
            spec: The ChartSpec to validate

        Returns:
            The validated and potentially corrected spec
        """
        spec = cls.validate_horizontal(spec)
        return spec
