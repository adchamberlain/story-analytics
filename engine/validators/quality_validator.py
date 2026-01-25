"""
Chart Quality Validator - Comprehensive validation for chart generation.

This module provides semantic validation that goes beyond syntax checking:
1. Data Shape Validation - Verify query results match chart requirements
2. Spec Verification - LLM check that spec matches user intent
3. Aggregation Validation - Verify SQL aggregation matches spec
4. Chart Type Validation - Ensure chart type is appropriate for data
5. Visual QA - Screenshot-based validation (optional)

These validators catch issues that syntax validation misses, ensuring
the generated chart actually answers the user's question correctly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Optional

import duckdb

if TYPE_CHECKING:
    from ..models.chart import ChartSpec, ChartType


class ValidationSeverity(Enum):
    """Severity levels for validation issues."""
    ERROR = "error"      # Must be fixed, chart will be wrong
    WARNING = "warning"  # Should be fixed, chart may be suboptimal
    INFO = "info"        # Informational, no action needed


@dataclass
class ValidationIssue:
    """A single validation issue found during quality checks."""
    severity: ValidationSeverity
    code: str           # Machine-readable code (e.g., "EMPTY_RESULTS")
    message: str        # Human-readable description
    suggestion: str     # How to fix it

    def __str__(self) -> str:
        return f"[{self.severity.value.upper()}] {self.code}: {self.message}"


@dataclass
class QualityValidationResult:
    """Result of quality validation checks."""
    passed: bool
    issues: list[ValidationIssue] = field(default_factory=list)
    data_preview: list[dict] | None = None  # First few rows of query results
    row_count: int = 0
    column_count: int = 0

    @property
    def errors(self) -> list[ValidationIssue]:
        """Get all ERROR severity issues."""
        return [i for i in self.issues if i.severity == ValidationSeverity.ERROR]

    @property
    def warnings(self) -> list[ValidationIssue]:
        """Get all WARNING severity issues."""
        return [i for i in self.issues if i.severity == ValidationSeverity.WARNING]

    def add_issue(self, issue: ValidationIssue):
        """Add an issue and update passed status."""
        self.issues.append(issue)
        if issue.severity == ValidationSeverity.ERROR:
            self.passed = False


class DataShapeValidator:
    """
    Validates that query results match chart requirements.

    Checks:
    - Query returns data (not empty)
    - Column count matches expected
    - Data cardinality is appropriate for chart type
    - Column types are correct (numeric for y-axis, etc.)
    """

    # Maximum categories for different chart types
    MAX_BAR_CATEGORIES = 20
    MAX_PIE_SLICES = 10
    MAX_LINE_POINTS = 365  # One year of daily data

    # Minimum rows for meaningful charts
    MIN_LINE_POINTS = 2
    MIN_BAR_CATEGORIES = 1

    @classmethod
    def validate(
        cls,
        sql: str,
        spec: "ChartSpec",
        expected_columns: list[str],
        db_path: str | None = None,
    ) -> QualityValidationResult:
        """
        Validate query results against chart requirements.

        Args:
            sql: The SQL query to execute
            spec: The chart specification
            expected_columns: Expected column names from SQL agent
            db_path: Path to DuckDB database (uses default if None)

        Returns:
            QualityValidationResult with issues found
        """
        from ..models.chart import ChartType

        result = QualityValidationResult(passed=True)

        # Prepare SQL for validation (replace template variables)
        test_sql = cls._prepare_sql_for_validation(sql)

        try:
            # Get database path
            if db_path is None:
                data_dir = Path(__file__).parent.parent.parent / "data"
                db_path = str(data_dir / "analytics.duckdb")

            # Execute query with limit
            conn = duckdb.connect(db_path, read_only=True)

            # First get total count
            count_sql = f"SELECT COUNT(*) FROM ({test_sql}) AS subq"
            try:
                count_result = conn.execute(count_sql).fetchone()
                result.row_count = count_result[0] if count_result else 0
            except Exception:
                # If count fails, try running limited query
                result.row_count = -1  # Unknown

            # Get sample data
            sample_sql = f"SELECT * FROM ({test_sql}) AS subq LIMIT 100"
            df = conn.execute(sample_sql).fetchdf()
            conn.close()

            result.column_count = len(df.columns)
            result.data_preview = df.head(5).to_dict('records') if len(df) > 0 else []

            if result.row_count == -1:
                result.row_count = len(df)

        except Exception as e:
            result.add_issue(ValidationIssue(
                severity=ValidationSeverity.ERROR,
                code="QUERY_EXECUTION_FAILED",
                message=f"Failed to execute query for validation: {str(e)[:200]}",
                suggestion="Check SQL syntax and table/column references"
            ))
            return result

        # Check 1: Empty results
        if result.row_count == 0:
            result.add_issue(ValidationIssue(
                severity=ValidationSeverity.ERROR,
                code="EMPTY_RESULTS",
                message="Query returned no data",
                suggestion="Check date filters, table references, and WHERE conditions"
            ))
            return result  # No point checking other things

        # Check 2: Column count
        if len(expected_columns) > 0 and result.column_count != len(expected_columns):
            result.add_issue(ValidationIssue(
                severity=ValidationSeverity.WARNING,
                code="COLUMN_COUNT_MISMATCH",
                message=f"Expected {len(expected_columns)} columns, got {result.column_count}",
                suggestion="Verify SQL SELECT clause matches expected columns"
            ))

        # Check 3: Cardinality for chart type
        if spec.chart_type == ChartType.BAR_CHART:
            if result.row_count > cls.MAX_BAR_CATEGORIES:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    code="TOO_MANY_CATEGORIES",
                    message=f"Bar chart has {result.row_count} categories (max recommended: {cls.MAX_BAR_CATEGORIES})",
                    suggestion="Add a LIMIT clause or use a different chart type"
                ))

        elif spec.chart_type == ChartType.LINE_CHART:
            if result.row_count < cls.MIN_LINE_POINTS:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    code="TOO_FEW_POINTS",
                    message=f"Line chart has only {result.row_count} points (need at least {cls.MIN_LINE_POINTS})",
                    suggestion="Expand date range or use BigValue for single metrics"
                ))

        elif spec.chart_type == ChartType.BIG_VALUE:
            if result.row_count > 1:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    code="MULTIPLE_ROWS_FOR_BIGVALUE",
                    message=f"BigValue expects 1 row, got {result.row_count}",
                    suggestion="Add aggregation to return a single value"
                ))

        # Check 4: Column types (if we have data)
        if len(df) > 0:
            cls._validate_column_types(df, spec, expected_columns, result)

        return result

    @classmethod
    def _prepare_sql_for_validation(cls, sql: str) -> str:
        """Replace template variables with test values for validation."""
        # Replace Evidence-style input variables
        replacements = [
            # DateRange filters
            (r"\$\{inputs\.[a-zA-Z_]+\.start\}", "'2024-01-01'"),
            (r"\$\{inputs\.[a-zA-Z_]+\.end\}", "'2024-12-31'"),
            # Dropdown/other filters (string values)
            (r"'\$\{inputs\.[a-zA-Z_]+\.value\}'", "'test_value'"),
            (r"'\$\{inputs\.[a-zA-Z_]+\}'", "'test_value'"),
            # Numeric filter values
            (r"\$\{inputs\.[a-zA-Z_]+\.value\}", "2024"),
            (r"\$\{inputs\.[a-zA-Z_]+\}", "2024"),
        ]

        result = sql
        for pattern, replacement in replacements:
            result = re.sub(pattern, replacement, result)

        return result

    @classmethod
    def _validate_column_types(
        cls,
        df,
        spec: "ChartSpec",
        expected_columns: list[str],
        result: QualityValidationResult,
    ):
        """Validate that column types are appropriate for the chart."""
        from ..models.chart import ChartType
        import pandas as pd

        if len(df.columns) < 2:
            return

        x_col = df.columns[0]
        y_cols = df.columns[1:]

        # For time series, x should be date-like
        if spec.chart_type in (ChartType.LINE_CHART, ChartType.AREA_CHART):
            x_dtype = df[x_col].dtype
            is_date_like = (
                pd.api.types.is_datetime64_any_dtype(x_dtype) or
                str(x_dtype) == 'object' and cls._looks_like_date(df[x_col])
            )
            if not is_date_like:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.INFO,
                    code="X_AXIS_NOT_DATE",
                    message=f"Line chart x-axis '{x_col}' may not be a date column",
                    suggestion="Ensure x-axis is a date/time column for time series"
                ))

        # Y columns should be numeric
        for col in y_cols:
            if col in df.columns and not pd.api.types.is_numeric_dtype(df[col].dtype):
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    code="Y_AXIS_NOT_NUMERIC",
                    message=f"Y-axis column '{col}' is not numeric (type: {df[col].dtype})",
                    suggestion="Ensure y-axis columns contain numeric values"
                ))

    @classmethod
    def _looks_like_date(cls, series) -> bool:
        """Check if a string series looks like dates."""
        if len(series) == 0:
            return False
        sample = str(series.iloc[0])
        # Common date patterns
        date_patterns = [
            r'^\d{4}-\d{2}-\d{2}',  # 2024-01-01
            r'^\d{4}/\d{2}/\d{2}',  # 2024/01/01
            r'^\d{2}/\d{2}/\d{4}',  # 01/01/2024
            r'^\d{4}-\d{2}$',       # 2024-01
        ]
        return any(re.match(p, sample) for p in date_patterns)


class AggregationValidator:
    """
    Validates that SQL aggregation matches the chart spec.

    Catches issues like:
    - Spec says SUM but SQL uses AVG
    - Spec says COUNT but SQL uses SUM
    - Missing GROUP BY for aggregations
    """

    # Mapping of spec aggregation to SQL patterns
    AGGREGATION_PATTERNS = {
        "SUM": [r'\bSUM\s*\(', r'\bTOTAL\s*\('],
        "AVG": [r'\bAVG\s*\(', r'\bAVERAGE\s*\(', r'\bMEAN\s*\('],
        "COUNT": [r'\bCOUNT\s*\('],
        "MIN": [r'\bMIN\s*\('],
        "MAX": [r'\bMAX\s*\('],
        "MEDIAN": [r'\bMEDIAN\s*\(', r'\bPERCENTILE_CONT\s*\('],
    }

    @classmethod
    def validate(
        cls,
        sql: str,
        spec: "ChartSpec",
    ) -> QualityValidationResult:
        """
        Validate SQL aggregation matches spec.

        Args:
            sql: The SQL query
            spec: The chart specification

        Returns:
            QualityValidationResult with issues found
        """
        result = QualityValidationResult(passed=True)
        sql_upper = sql.upper()

        # Skip validation for BigValue or if no aggregation specified
        if not spec.aggregation:
            return result

        spec_agg = spec.aggregation.upper()

        # Handle special "AVG_PER_ENTITY" aggregation
        if spec_agg == "AVG_PER_ENTITY":
            # Should have nested aggregation (CTE with SUM then AVG)
            if "WITH" not in sql_upper or "AVG" not in sql_upper:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    code="MISSING_TWO_LEVEL_AGGREGATION",
                    message="Per-entity metric should use CTE with two-level aggregation",
                    suggestion="Use WITH clause: first aggregate per entity, then AVG across entities"
                ))
            return result

        # Check if the expected aggregation is present
        patterns = cls.AGGREGATION_PATTERNS.get(spec_agg, [])
        if patterns:
            found = any(re.search(p, sql_upper) for p in patterns)
            if not found:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    code="AGGREGATION_MISMATCH",
                    message=f"Spec specifies {spec_agg} but SQL may use different aggregation",
                    suggestion=f"Verify SQL uses {spec_agg}() function"
                ))

        # Check for GROUP BY if aggregation is present
        has_aggregation = any(
            re.search(p, sql_upper)
            for patterns in cls.AGGREGATION_PATTERNS.values()
            for p in patterns
        )
        if has_aggregation and "GROUP BY" not in sql_upper:
            # Could be a single-value aggregation (BigValue), which is OK
            if spec.dimension:
                result.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    code="MISSING_GROUP_BY",
                    message="Query has aggregation but no GROUP BY clause",
                    suggestion="Add GROUP BY clause for the dimension column"
                ))

        return result


class ChartTypeValidator:
    """
    Validates that chart type is appropriate for the data and request.

    Uses pattern matching to detect when the LLM chose the wrong chart type.
    """

    # Patterns that strongly indicate time series (should be LineChart)
    TIME_SERIES_PATTERNS = [
        "over time", "trend", "trending", "by month", "by week", "by day",
        "monthly", "weekly", "daily", "time series", "over the past",
        "historical", "year over year", "yoy", "mom", "month over month",
    ]

    # Patterns that indicate categorical comparison (should be BarChart)
    CATEGORY_PATTERNS = [
        "by segment", "by region", "by category", "by type", "by industry",
        "breakdown", "compare", "comparison", "top 10", "top 5", "ranking",
    ]

    # Patterns that indicate single value (should be BigValue)
    SINGLE_VALUE_PATTERNS = [
        "total revenue", "total sales", "overall", "grand total",
        "how much", "what is the", "what's the total",
    ]

    # Patterns that indicate distribution (could be histogram)
    DISTRIBUTION_PATTERNS = [
        "distribution", "histogram", "spread", "range of",
    ]

    @classmethod
    def validate(
        cls,
        spec: "ChartSpec",
    ) -> QualityValidationResult:
        """
        Validate chart type matches request patterns.

        Args:
            spec: The chart specification

        Returns:
            QualityValidationResult with issues found
        """
        from ..models.chart import ChartType

        result = QualityValidationResult(passed=True)
        request_lower = spec.original_request.lower()

        # Check for time series patterns with non-line chart
        if spec.chart_type == ChartType.BAR_CHART:
            for pattern in cls.TIME_SERIES_PATTERNS:
                if pattern in request_lower:
                    result.add_issue(ValidationIssue(
                        severity=ValidationSeverity.WARNING,
                        code="CHART_TYPE_MISMATCH",
                        message=f"Request mentions '{pattern}' but chart type is BarChart",
                        suggestion="Consider using LineChart for time series data"
                    ))
                    break

        # Check for category patterns with line chart
        if spec.chart_type == ChartType.LINE_CHART:
            for pattern in cls.CATEGORY_PATTERNS:
                if pattern in request_lower:
                    # "by month" etc. are OK for line charts
                    if pattern not in cls.TIME_SERIES_PATTERNS:
                        result.add_issue(ValidationIssue(
                            severity=ValidationSeverity.INFO,
                            code="POSSIBLE_CHART_TYPE_MISMATCH",
                            message=f"Request mentions '{pattern}' which often uses BarChart",
                            suggestion="LineChart may be correct if showing trends over categories"
                        ))
                        break

        # Check for single value patterns with chart instead of BigValue
        if spec.chart_type not in (ChartType.BIG_VALUE, ChartType.DATA_TABLE):
            for pattern in cls.SINGLE_VALUE_PATTERNS:
                if pattern in request_lower and spec.dimension is None:
                    result.add_issue(ValidationIssue(
                        severity=ValidationSeverity.INFO,
                        code="CONSIDER_BIGVALUE",
                        message=f"Request '{pattern}' might be better as BigValue KPI",
                        suggestion="Use BigValue for single metric displays"
                    ))
                    break

        return result


class SpecVerifier:
    """
    Uses LLM to verify that extracted spec matches user intent.

    This is a quick verification pass that catches semantic mismatches
    that pattern matching can't detect.
    """

    @classmethod
    def verify(
        cls,
        spec: "ChartSpec",
        provider_name: str | None = None,
    ) -> QualityValidationResult:
        """
        Verify spec matches the original request using LLM.

        Args:
            spec: The chart specification to verify
            provider_name: LLM provider to use

        Returns:
            QualityValidationResult with issues found
        """
        from ..llm.claude import get_fast_provider
        from ..llm.base import Message

        result = QualityValidationResult(passed=True)

        try:
            llm = get_fast_provider(provider_name)

            prompt = f"""Verify this chart specification correctly captures the user's request.

USER REQUEST:
{spec.original_request}

EXTRACTED SPECIFICATION:
- Title: {spec.title}
- Metric: {spec.metric}
- Aggregation: {spec.aggregation or 'not specified'}
- Dimension: {spec.dimension or 'none (single value)'}
- Chart Type: {spec.chart_type.value if spec.chart_type else 'not specified'}
- Filters: {spec.filters or 'none'}

INSTRUCTIONS:
1. Does the title accurately describe what the user asked for?
2. Is the metric correct (the thing being measured)?
3. Is the aggregation correct (SUM, AVG, COUNT, etc.)?
4. Is the dimension correct (how data is grouped)?
5. Is the chart type appropriate?

Respond in this exact format:
MATCH: YES or NO
ISSUES: (list any problems, or "None" if all correct)
- Issue 1
- Issue 2"""

            response = llm.generate(
                messages=[Message(role="user", content=prompt)],
                system_prompt="You are a data analyst verifying chart specifications. Be concise.",
                temperature=0,
                max_tokens=300,
            )

            content = response.content.upper()

            if "MATCH: NO" in content or "MATCH:NO" in content:
                # Extract issues
                issues_section = response.content.split("ISSUES:")[-1] if "ISSUES:" in response.content else ""
                issues = [
                    line.strip().lstrip("- ")
                    for line in issues_section.split("\n")
                    if line.strip() and line.strip() != "None" and not line.strip().startswith("MATCH")
                ]

                for issue in issues[:3]:  # Limit to top 3 issues
                    if issue and len(issue) > 5:
                        result.add_issue(ValidationIssue(
                            severity=ValidationSeverity.WARNING,
                            code="SPEC_INTENT_MISMATCH",
                            message=issue[:200],
                            suggestion="Review and regenerate the chart specification"
                        ))

        except Exception as e:
            # Don't fail the whole validation if LLM check fails
            result.add_issue(ValidationIssue(
                severity=ValidationSeverity.INFO,
                code="SPEC_VERIFICATION_SKIPPED",
                message=f"Could not verify spec with LLM: {str(e)[:100]}",
                suggestion="Manual review recommended"
            ))

        return result


class ChartQualityValidator:
    """
    Unified quality validation for chart generation.

    Combines all validators into a single entry point with configurable
    validation levels.
    """

    def __init__(
        self,
        enable_data_validation: bool = True,
        enable_spec_verification: bool = True,
        enable_aggregation_check: bool = True,
        enable_chart_type_check: bool = True,
        enable_visual_qa: bool = False,  # Requires running app
        provider_name: str | None = None,
    ):
        """
        Initialize the quality validator.

        Args:
            enable_data_validation: Check query results shape
            enable_spec_verification: LLM verification of spec
            enable_aggregation_check: Check SQL aggregation matches spec
            enable_chart_type_check: Check chart type is appropriate
            enable_visual_qa: Screenshot-based QA (requires app running)
            provider_name: LLM provider for verification
        """
        self.enable_data_validation = enable_data_validation
        self.enable_spec_verification = enable_spec_verification
        self.enable_aggregation_check = enable_aggregation_check
        self.enable_chart_type_check = enable_chart_type_check
        self.enable_visual_qa = enable_visual_qa
        self.provider_name = provider_name

    def validate_spec(
        self,
        spec: "ChartSpec",
    ) -> QualityValidationResult:
        """
        Validate chart spec before SQL generation.

        Args:
            spec: The chart specification

        Returns:
            Combined validation result
        """
        combined = QualityValidationResult(passed=True)

        # Chart type validation
        if self.enable_chart_type_check:
            chart_type_result = ChartTypeValidator.validate(spec)
            for issue in chart_type_result.issues:
                combined.add_issue(issue)

        # Spec verification (LLM)
        if self.enable_spec_verification:
            spec_result = SpecVerifier.verify(spec, self.provider_name)
            for issue in spec_result.issues:
                combined.add_issue(issue)

        return combined

    def validate_query(
        self,
        sql: str,
        spec: "ChartSpec",
        expected_columns: list[str],
    ) -> QualityValidationResult:
        """
        Validate SQL query after generation.

        Args:
            sql: The generated SQL query
            spec: The chart specification
            expected_columns: Expected column names

        Returns:
            Combined validation result
        """
        combined = QualityValidationResult(passed=True)

        # Aggregation validation
        if self.enable_aggregation_check:
            agg_result = AggregationValidator.validate(sql, spec)
            for issue in agg_result.issues:
                combined.add_issue(issue)

        # Data shape validation
        if self.enable_data_validation:
            data_result = DataShapeValidator.validate(sql, spec, expected_columns)
            combined.row_count = data_result.row_count
            combined.column_count = data_result.column_count
            combined.data_preview = data_result.data_preview
            for issue in data_result.issues:
                combined.add_issue(issue)

        return combined

    def validate_visual(
        self,
        chart_slug: str,
        original_request: str,
    ) -> QualityValidationResult:
        """
        Validate rendered chart using vision QA.

        Args:
            chart_slug: The chart slug to validate
            original_request: Original user request

        Returns:
            Validation result from visual inspection
        """
        combined = QualityValidationResult(passed=True)

        if not self.enable_visual_qa:
            return combined

        try:
            from ..qa import DashboardQA

            qa = DashboardQA(provider_name=self.provider_name)
            qa_result = qa.validate(chart_slug, original_request)

            if not qa_result.passed:
                for issue in qa_result.critical_issues:
                    combined.add_issue(ValidationIssue(
                        severity=ValidationSeverity.ERROR,
                        code="VISUAL_QA_FAILED",
                        message=issue,
                        suggestion="Review rendered chart and regenerate if needed"
                    ))
                for suggestion in qa_result.suggestions:
                    combined.add_issue(ValidationIssue(
                        severity=ValidationSeverity.INFO,
                        code="VISUAL_QA_SUGGESTION",
                        message=suggestion,
                        suggestion="Consider implementing for better visualization"
                    ))

        except Exception as e:
            combined.add_issue(ValidationIssue(
                severity=ValidationSeverity.INFO,
                code="VISUAL_QA_SKIPPED",
                message=f"Visual QA not available: {str(e)[:100]}",
                suggestion="Start the app to enable visual validation"
            ))

        return combined

    def validate_full(
        self,
        spec: "ChartSpec",
        sql: str,
        expected_columns: list[str],
        chart_slug: str | None = None,
    ) -> QualityValidationResult:
        """
        Run all validations in sequence.

        Args:
            spec: The chart specification
            sql: The generated SQL query
            expected_columns: Expected column names
            chart_slug: Optional chart slug for visual QA

        Returns:
            Combined validation result from all checks
        """
        combined = QualityValidationResult(passed=True)

        # 1. Spec validation
        spec_result = self.validate_spec(spec)
        for issue in spec_result.issues:
            combined.add_issue(issue)

        # 2. Query validation
        query_result = self.validate_query(sql, spec, expected_columns)
        combined.row_count = query_result.row_count
        combined.column_count = query_result.column_count
        combined.data_preview = query_result.data_preview
        for issue in query_result.issues:
            combined.add_issue(issue)

        # 3. Visual validation (if chart slug provided)
        if chart_slug and self.enable_visual_qa:
            visual_result = self.validate_visual(chart_slug, spec.original_request)
            for issue in visual_result.issues:
                combined.add_issue(issue)

        return combined


# Convenience function
def validate_chart_quality(
    spec: "ChartSpec",
    sql: str,
    columns: list[str],
    quick: bool = False,
) -> QualityValidationResult:
    """
    Convenience function to validate chart quality.

    Args:
        spec: The chart specification
        sql: The generated SQL
        columns: Expected columns
        quick: If True, skip LLM verification for speed

    Returns:
        Quality validation result
    """
    validator = ChartQualityValidator(
        enable_spec_verification=not quick,
        enable_visual_qa=False,
    )
    return validator.validate_query(sql, spec, columns)
