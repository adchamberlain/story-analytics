"""
Request Pattern Validator - Detects user intent patterns that LLMs miss.

This validator corrects ChartSpec fields based on deterministic pattern
matching against the original user request. It runs after LLM extraction
to catch cases where the LLM failed to set expected fields.

Expanded to cover:
- Horizontal bar detection
- Top-N to horizontal conversion
- Time series to LineChart
- Category comparisons to BarChart
- Single values to BigValue
- Distribution patterns
"""

from __future__ import annotations

import re
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
        "bottom 5",
        "bottom 10",
        "lowest 5",
        "lowest 10",
        "top products",
        "best products",
        "top performing",
        "best performing",
        "worst performing",
    ]

    # Patterns that strongly indicate time series (should be LineChart)
    TIME_SERIES_PATTERNS = [
        "over time",
        "trend",
        "trending",
        "by month",
        "by week",
        "by day",
        "by quarter",
        "monthly trend",
        "weekly trend",
        "daily trend",
        "time series",
        "over the past",
        "over the last",
        "historical",
        "year over year",
        "yoy",
        "mom",
        "month over month",
        "how has .* changed",
        "growth over",
    ]

    # Patterns that indicate categorical comparison (should be BarChart)
    CATEGORY_COMPARISON_PATTERNS = [
        "by segment",
        "by region",
        "by category",
        "by type",
        "by industry",
        "by country",
        "by state",
        "by plan",
        "by tier",
        "breakdown by",
        "split by",
        "grouped by",
        "per segment",
        "per region",
        "per category",
        "compare .* across",
        "comparison of",
    ]

    # Patterns that indicate single value (should be BigValue)
    SINGLE_VALUE_PATTERNS = [
        r"^total revenue$",
        r"^total sales$",
        r"^total customers$",
        r"^total users$",
        "what is the total",
        "what's the total",
        "how much total",
        "overall revenue",
        "overall sales",
        "grand total",
        "current mrr",
        "current arr",
        "total mrr",
        "total arr",
    ]

    # Patterns that indicate percentage/rate metrics
    PERCENTAGE_PATTERNS = [
        "rate",
        "percentage",
        "percent",
        "ratio",
        "conversion",
        "churn rate",
        "retention rate",
        "growth rate",
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
    def validate_time_series_chart_type(cls, spec: "ChartSpec") -> "ChartSpec":
        """
        Ensure time series requests use LineChart.

        If user asks for data "over time" or "trend", they expect a line chart.
        Correct BarChart to LineChart when time series patterns are detected.

        Args:
            spec: The ChartSpec to validate

        Returns:
            The spec with chart_type corrected if needed
        """
        from ..models.chart import ChartType

        # Only change BarChart to LineChart (don't override other types)
        if spec.chart_type != ChartType.BAR_CHART:
            return spec

        request_lower = spec.original_request.lower()

        for pattern in cls.TIME_SERIES_PATTERNS:
            # Handle regex patterns
            if pattern.startswith("how has") or pattern.startswith("growth"):
                if re.search(pattern, request_lower):
                    print(f"[RequestPatternValidator] Corrected: BarChart→LineChart (time series pattern '{pattern}')")
                    spec.chart_type = ChartType.LINE_CHART
                    return spec
            elif pattern in request_lower:
                print(f"[RequestPatternValidator] Corrected: BarChart→LineChart (time series pattern '{pattern}')")
                spec.chart_type = ChartType.LINE_CHART
                return spec

        return spec

    @classmethod
    def validate_category_chart_type(cls, spec: "ChartSpec") -> "ChartSpec":
        """
        Ensure category comparison requests use BarChart.

        If user asks for data "by segment" or "breakdown by", they expect a bar chart.
        Correct LineChart to BarChart when category patterns are detected AND
        there's no time series pattern present.

        Args:
            spec: The ChartSpec to validate

        Returns:
            The spec with chart_type corrected if needed
        """
        from ..models.chart import ChartType

        # Only change LineChart to BarChart
        if spec.chart_type != ChartType.LINE_CHART:
            return spec

        request_lower = spec.original_request.lower()

        # First check if there's a time series pattern - if so, don't change
        for ts_pattern in cls.TIME_SERIES_PATTERNS:
            if ts_pattern.startswith("how has") or ts_pattern.startswith("growth"):
                if re.search(ts_pattern, request_lower):
                    return spec
            elif ts_pattern in request_lower:
                return spec

        # Check for category patterns
        for pattern in cls.CATEGORY_COMPARISON_PATTERNS:
            if pattern.startswith("compare") or pattern.startswith("comparison"):
                if re.search(pattern, request_lower):
                    print(f"[RequestPatternValidator] Corrected: LineChart→BarChart (category pattern '{pattern}')")
                    spec.chart_type = ChartType.BAR_CHART
                    return spec
            elif pattern in request_lower:
                print(f"[RequestPatternValidator] Corrected: LineChart→BarChart (category pattern '{pattern}')")
                spec.chart_type = ChartType.BAR_CHART
                return spec

        return spec

    @classmethod
    def validate_single_value_chart_type(cls, spec: "ChartSpec") -> "ChartSpec":
        """
        Ensure single value requests use BigValue.

        If user asks for "total revenue" or "what is the total", they likely
        want a single KPI, not a chart with one bar.

        Args:
            spec: The ChartSpec to validate

        Returns:
            The spec with chart_type corrected if needed
        """
        from ..models.chart import ChartType

        # Only change BarChart or LineChart to BigValue
        if spec.chart_type not in (ChartType.BAR_CHART, ChartType.LINE_CHART):
            return spec

        # Only if there's no dimension (no grouping)
        if spec.dimension:
            return spec

        request_lower = spec.original_request.lower()

        for pattern in cls.SINGLE_VALUE_PATTERNS:
            if pattern.startswith("^"):
                # Regex pattern
                if re.search(pattern, request_lower):
                    print(f"[RequestPatternValidator] Corrected: {spec.chart_type.value}→BigValue (single value pattern)")
                    spec.chart_type = ChartType.BIG_VALUE
                    return spec
            elif pattern in request_lower:
                print(f"[RequestPatternValidator] Corrected: {spec.chart_type.value}→BigValue (single value pattern '{pattern}')")
                spec.chart_type = ChartType.BIG_VALUE
                return spec

        return spec

    @classmethod
    def validate_aggregation_hints(cls, spec: "ChartSpec") -> "ChartSpec":
        """
        Add aggregation hints based on request patterns.

        Detects patterns like "average", "count", "sum" and ensures
        the aggregation field is set correctly.

        Args:
            spec: The ChartSpec to validate

        Returns:
            The spec with aggregation corrected if needed
        """
        request_lower = spec.original_request.lower()

        # Check for per-entity patterns FIRST (before general average check)
        # These need two-level aggregation even if "AVG" is already set
        per_entity_patterns = ["per customer", "per user", "per account", "per company"]
        if any(p in request_lower for p in per_entity_patterns):
            if any(p in request_lower for p in ["average", "avg", "mean"]):
                if spec.aggregation != "AVG_PER_ENTITY":
                    print(f"[RequestPatternValidator] Corrected: aggregation→AVG_PER_ENTITY")
                    spec.aggregation = "AVG_PER_ENTITY"
                return spec

        # Only override other aggregations if they seem wrong or missing
        if spec.aggregation and spec.aggregation not in ("", "SUM"):
            return spec

        # Check for average patterns
        if any(p in request_lower for p in ["average", "avg", "mean"]):
            if spec.aggregation != "AVG":
                print(f"[RequestPatternValidator] Corrected: aggregation→AVG")
                spec.aggregation = "AVG"

        # Check for count patterns
        elif any(p in request_lower for p in ["how many", "count of", "number of", "total number"]):
            if spec.aggregation != "COUNT":
                print(f"[RequestPatternValidator] Corrected: aggregation→COUNT")
                spec.aggregation = "COUNT"

        # Check for median patterns
        elif "median" in request_lower:
            if spec.aggregation != "MEDIAN":
                print(f"[RequestPatternValidator] Corrected: aggregation→MEDIAN")
                spec.aggregation = "MEDIAN"

        return spec

    @classmethod
    def validate(cls, spec: "ChartSpec") -> "ChartSpec":
        """
        Run all request pattern validations.

        Validation order matters - more specific checks run first.

        Args:
            spec: The ChartSpec to validate

        Returns:
            The validated and potentially corrected spec
        """
        # 1. Explicit horizontal bar requests
        spec = cls.validate_horizontal(spec)

        # 2. Top-N queries should be horizontal
        spec = cls.validate_top_n_horizontal(spec)

        # 3. Time series should use LineChart
        spec = cls.validate_time_series_chart_type(spec)

        # 4. Category comparisons should use BarChart
        spec = cls.validate_category_chart_type(spec)

        # 5. Single value requests should use BigValue
        spec = cls.validate_single_value_chart_type(spec)

        # 6. Aggregation hints
        spec = cls.validate_aggregation_hints(spec)

        return spec
