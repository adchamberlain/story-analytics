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

    # Patterns that should use horizontal bars for better label display
    # "Top N" queries with entity names work better horizontal
    TOP_N_PATTERNS = [
        "top 5 customers",
        "top 10 customers",
        "top 20 customers",
        "top 5 companies",
        "top 10 companies",
        "top customers",
        "top clients",
        "best customers",
        "highest customers",
        "top 10 by",
        "top 5 by",
        "top 20 by",
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
    def validate_top_n_horizontal(cls, spec: "ChartSpec") -> "ChartSpec":
        """
        Make "top N" charts horizontal for better label display.

        When showing ranked lists of entities (customers, products, etc.),
        horizontal bars display much better because:
        1. Long names don't get truncated
        2. The ranking is more intuitive (top to bottom)

        Args:
            spec: The ChartSpec to validate

        Returns:
            The spec with horizontal set if it's a top N query
        """
        from ..models.chart import ChartType

        # Only apply to bar charts
        if spec.chart_type != ChartType.BAR_CHART:
            return spec

        request_lower = spec.original_request.lower()

        for pattern in cls.TOP_N_PATTERNS:
            if pattern in request_lower:
                if not spec.horizontal:
                    print(f"[RequestPatternValidator] Corrected: horizontal=True for top N query (detected '{pattern}')")
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
        spec = cls.validate_top_n_horizontal(spec)
        return spec
