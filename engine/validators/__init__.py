"""
Chart Spec Validators - Post-LLM validation and correction layer.

This module provides deterministic validators that run after LLM extraction
to catch and correct common issues that the LLM fails to handle reliably.

Architecture:
    User Request
      → ChartRequirementsAgent (LLM) → ChartSpec [raw]
      → ChartSpecValidator.validate_spec() → ChartSpec [corrected]
      → ChartSQLAgent (LLM) → SQL + columns
      → ChartSpecValidator.analyze_scales() → scale hints
      → _build_chart_config() → ChartConfig [with y2 if needed]
      → ChartSpecValidator.validate_filters() → Filters [with defaults]
      → to_evidence_markdown() → Evidence page

Validators:
    - RequestPatternValidator: Detects horizontal bar requests
    - ScaleAnalyzer: Detects when dual y-axis is needed
    - FilterDefaultResolver: Sets dropdown defaults from data
    - DateRangeDefaultExtractor: Sets date range defaults from request
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from .filter_defaults import DateRangeDefaultExtractor, FilterDefaultResolver
from .request_patterns import RequestPatternValidator
from .scale_analyzer import ScaleAnalysis, ScaleAnalyzer

if TYPE_CHECKING:
    from ..models.chart import ChartConfig, ChartSpec, FilterSpec

__all__ = [
    "ChartSpecValidator",
    "RequestPatternValidator",
    "ScaleAnalyzer",
    "ScaleAnalysis",
    "FilterDefaultResolver",
    "DateRangeDefaultExtractor",
]


class ChartSpecValidator:
    """
    Unified validation and correction layer for chart specs.

    This class provides a single entry point for all post-LLM validation.
    It should be called at specific points in the chart pipeline to
    correct issues that the LLM failed to handle.
    """

    @classmethod
    def validate_spec(cls, spec: "ChartSpec") -> "ChartSpec":
        """
        Validate and correct a ChartSpec after LLM extraction.

        This runs immediately after ChartRequirementsAgent extracts the spec.
        It corrects:
        - horizontal flag for bar charts
        - DateRange filter defaults based on user request

        Args:
            spec: The raw ChartSpec from LLM

        Returns:
            The validated and potentially corrected spec
        """
        # 1. Validate horizontal bar charts
        spec = RequestPatternValidator.validate(spec)

        # 2. Validate date range filter defaults
        for i, filter_spec in enumerate(spec.interactive_filters):
            spec.interactive_filters[i] = DateRangeDefaultExtractor.correct_filter(
                filter_spec,
                spec.original_request,
            )

        return spec

    @classmethod
    def analyze_scales(
        cls,
        sql: str,
        columns: list[str],
        db_path: Optional[str] = None,
    ) -> Optional[ScaleAnalysis]:
        """
        Analyze metric scales to determine if dual y-axis is needed.

        This runs after SQL generation, before chart config is built.
        If it returns a ScaleAnalysis with needs_dual_axis=True, the
        chart config should use y + y2 instead of y=[col1, col2].

        Args:
            sql: The validated SQL query
            columns: Column names from the query
            db_path: Optional path to DuckDB database

        Returns:
            ScaleAnalysis if applicable, None otherwise
        """
        return ScaleAnalyzer.analyze(sql, columns, db_path)

    @classmethod
    def validate_filters(
        cls,
        filters: list["FilterSpec"],
        db_path: Optional[str] = None,
    ) -> list["FilterSpec"]:
        """
        Validate and correct filter defaults.

        This runs after filters are built, before markdown generation.
        It ensures Dropdown filters have default values by querying
        the options data.

        Args:
            filters: List of FilterSpec objects
            db_path: Optional path to DuckDB database

        Returns:
            List of FilterSpec with defaults resolved
        """
        from ..models.chart import FilterType

        corrected = []
        for f in filters:
            if f.filter_type == FilterType.DROPDOWN:
                f = FilterDefaultResolver.resolve_dropdown_default(f, db_path)
            corrected.append(f)
        return corrected
