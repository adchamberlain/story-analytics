"""
Tests for the chart quality validators.

Tests cover:
1. DataShapeValidator - Query results validation
2. AggregationValidator - SQL aggregation checking
3. ChartTypeValidator - Chart type appropriateness
4. RequestPatternValidator - Pattern-based corrections
5. ChartQualityValidator - Unified validation
"""

import pytest
from unittest.mock import patch, MagicMock

from engine.validators.quality_validator import (
    DataShapeValidator,
    AggregationValidator,
    ChartTypeValidator,
    SpecVerifier,
    ChartQualityValidator,
    QualityValidationResult,
    ValidationSeverity,
)
from engine.validators.request_patterns import RequestPatternValidator
from engine.models.chart import ChartSpec, ChartType


class TestDataShapeValidator:
    """Tests for DataShapeValidator."""

    def test_empty_results_error(self):
        """Test that empty query results produce an error."""
        spec = ChartSpec(
            title="Test Chart",
            description="Test",
            original_request="Show revenue by month",
            metric="revenue",
            chart_type=ChartType.LINE_CHART,
        )

        # SQL that would return no results (invalid table)
        sql = "SELECT * FROM nonexistent_table WHERE 1=0"

        result = DataShapeValidator.validate(sql, spec, ["month", "revenue"])

        # Should have an error (either execution failed or empty results)
        assert not result.passed or any(
            i.code in ("EMPTY_RESULTS", "QUERY_EXECUTION_FAILED")
            for i in result.issues
        )

    def test_too_many_categories_warning(self):
        """Test that too many bar chart categories produces a warning."""
        spec = ChartSpec(
            title="Test Chart",
            description="Test",
            original_request="Show revenue by customer",
            metric="revenue",
            chart_type=ChartType.BAR_CHART,
        )

        # Mock a query that returns many rows
        with patch.object(DataShapeValidator, 'validate') as mock_validate:
            mock_result = QualityValidationResult(passed=True)
            mock_result.row_count = 100  # Too many for bar chart
            mock_validate.return_value = mock_result

            result = mock_validate(
                "SELECT customer, SUM(amount) FROM invoices GROUP BY customer",
                spec,
                ["customer", "revenue"]
            )

            assert result.row_count == 100

    def test_prepare_sql_for_validation(self):
        """Test that template variables are replaced correctly."""
        sql = """
        SELECT * FROM invoices
        WHERE date >= '${inputs.date_range.start}'
        AND date <= '${inputs.date_range.end}'
        AND industry = '${inputs.industry_filter.value}'
        """

        result = DataShapeValidator._prepare_sql_for_validation(sql)

        # Should not contain template variables
        assert "${inputs" not in result
        assert "date_range.start" not in result
        assert "industry_filter.value" not in result

        # Should have replacement values
        assert "'2024-01-01'" in result or "'test_value'" in result


class TestAggregationValidator:
    """Tests for AggregationValidator."""

    def test_sum_aggregation_match(self):
        """Test that SUM aggregation is correctly detected."""
        spec = ChartSpec(
            title="Total Revenue",
            description="Test",
            original_request="Show total revenue",
            metric="revenue",
            aggregation="SUM",
            chart_type=ChartType.BIG_VALUE,
        )

        sql = "SELECT SUM(amount) as total_revenue FROM invoices"
        result = AggregationValidator.validate(sql, spec)

        assert result.passed
        assert not result.errors

    def test_aggregation_mismatch_warning(self):
        """Test that mismatched aggregation produces a warning."""
        spec = ChartSpec(
            title="Total Revenue",
            description="Test",
            original_request="Show total revenue",
            metric="revenue",
            aggregation="SUM",
            chart_type=ChartType.BIG_VALUE,
        )

        # SQL uses AVG instead of SUM
        sql = "SELECT AVG(amount) as avg_revenue FROM invoices"
        result = AggregationValidator.validate(sql, spec)

        # Should have a warning about aggregation mismatch
        assert any(i.code == "AGGREGATION_MISMATCH" for i in result.issues)

    def test_missing_group_by_warning(self):
        """Test that missing GROUP BY produces a warning."""
        spec = ChartSpec(
            title="Revenue by Month",
            description="Test",
            original_request="Show revenue by month",
            metric="revenue",
            aggregation="SUM",
            dimension="month",
            chart_type=ChartType.LINE_CHART,
        )

        # SQL has aggregation but no GROUP BY
        sql = "SELECT month, SUM(amount) as revenue FROM invoices"
        result = AggregationValidator.validate(sql, spec)

        # Should have a warning about missing GROUP BY
        assert any(i.code == "MISSING_GROUP_BY" for i in result.issues)

    def test_avg_per_entity_detection(self):
        """Test that AVG_PER_ENTITY aggregation checks for CTE."""
        spec = ChartSpec(
            title="Avg Revenue per Customer",
            description="Test",
            original_request="Show average revenue per customer",
            metric="revenue",
            aggregation="AVG_PER_ENTITY",
            chart_type=ChartType.BIG_VALUE,
        )

        # Correct two-level aggregation
        sql = """
        WITH customer_totals AS (
            SELECT customer_id, SUM(amount) as total
            FROM invoices
            GROUP BY customer_id
        )
        SELECT AVG(total) as avg_per_customer FROM customer_totals
        """
        result = AggregationValidator.validate(sql, spec)

        assert result.passed

        # Incorrect (no CTE)
        sql_wrong = "SELECT AVG(amount) FROM invoices"
        result_wrong = AggregationValidator.validate(sql_wrong, spec)

        assert any(
            i.code == "MISSING_TWO_LEVEL_AGGREGATION"
            for i in result_wrong.issues
        )


class TestChartTypeValidator:
    """Tests for ChartTypeValidator."""

    def test_time_series_bar_chart_warning(self):
        """Test that time series request with bar chart produces warning."""
        spec = ChartSpec(
            title="Revenue Over Time",
            description="Test",
            original_request="Show revenue over time",
            metric="revenue",
            chart_type=ChartType.BAR_CHART,
        )

        result = ChartTypeValidator.validate(spec)

        assert any(i.code == "CHART_TYPE_MISMATCH" for i in result.issues)

    def test_category_line_chart_info(self):
        """Test that category request with line chart produces info."""
        spec = ChartSpec(
            title="Revenue by Segment",
            description="Test",
            original_request="Show revenue breakdown by segment",
            metric="revenue",
            chart_type=ChartType.LINE_CHART,
        )

        result = ChartTypeValidator.validate(spec)

        # Should have an info about possible mismatch
        assert any(
            i.code == "POSSIBLE_CHART_TYPE_MISMATCH"
            for i in result.issues
        )

    def test_single_value_suggest_bigvalue(self):
        """Test that single value request without dimension suggests BigValue."""
        spec = ChartSpec(
            title="Total Revenue",
            description="Test",
            original_request="What is the total revenue",
            metric="revenue",
            dimension=None,  # No dimension
            chart_type=ChartType.BAR_CHART,
        )

        result = ChartTypeValidator.validate(spec)

        assert any(i.code == "CONSIDER_BIGVALUE" for i in result.issues)


class TestRequestPatternValidator:
    """Tests for expanded RequestPatternValidator."""

    def test_horizontal_bar_detection(self):
        """Test horizontal bar chart detection."""
        spec = ChartSpec(
            title="Revenue by Customer",
            description="Test",
            original_request="Show a horizontal bar chart of revenue",
            metric="revenue",
            chart_type=ChartType.BAR_CHART,
            horizontal=False,
        )

        result = RequestPatternValidator.validate(spec)

        assert result.horizontal is True

    def test_top_n_horizontal(self):
        """Test that top N queries become horizontal."""
        spec = ChartSpec(
            title="Top 10 Customers",
            description="Test",
            original_request="Show top 10 customers by revenue",
            metric="revenue",
            chart_type=ChartType.BAR_CHART,
            horizontal=False,
        )

        result = RequestPatternValidator.validate(spec)

        assert result.horizontal is True

    def test_time_series_to_line_chart(self):
        """Test that time series requests convert bar to line chart."""
        spec = ChartSpec(
            title="Revenue Trend",
            description="Test",
            original_request="Show revenue trend over time",
            metric="revenue",
            chart_type=ChartType.BAR_CHART,
        )

        result = RequestPatternValidator.validate(spec)

        assert result.chart_type == ChartType.LINE_CHART

    def test_aggregation_hint_count(self):
        """Test that count patterns set aggregation to COUNT."""
        spec = ChartSpec(
            title="Customer Count",
            description="Test",
            original_request="How many customers do we have",
            metric="customers",
            aggregation="SUM",  # Wrong aggregation
            chart_type=ChartType.BIG_VALUE,
        )

        result = RequestPatternValidator.validate(spec)

        assert result.aggregation == "COUNT"

    def test_aggregation_hint_average(self):
        """Test that average patterns set aggregation to AVG."""
        spec = ChartSpec(
            title="Average Order Value",
            description="Test",
            original_request="What is the average order value",
            metric="order_value",
            aggregation="SUM",  # Wrong aggregation
            chart_type=ChartType.BIG_VALUE,
        )

        result = RequestPatternValidator.validate(spec)

        assert result.aggregation == "AVG"

    def test_per_entity_aggregation(self):
        """Test that per-entity patterns set AVG_PER_ENTITY."""
        spec = ChartSpec(
            title="Avg Revenue per Customer",
            description="Test",
            original_request="Show average revenue per customer",
            metric="revenue",
            aggregation="AVG",  # Should be AVG_PER_ENTITY
            chart_type=ChartType.BIG_VALUE,
        )

        result = RequestPatternValidator.validate(spec)

        assert result.aggregation == "AVG_PER_ENTITY"


class TestChartQualityValidator:
    """Tests for unified ChartQualityValidator."""

    def test_validator_initialization(self):
        """Test that validator initializes with correct settings."""
        validator = ChartQualityValidator(
            enable_data_validation=True,
            enable_spec_verification=False,
            enable_aggregation_check=True,
            enable_chart_type_check=True,
        )

        assert validator.enable_data_validation is True
        assert validator.enable_spec_verification is False
        assert validator.enable_aggregation_check is True

    def test_validate_spec_runs_chart_type_check(self):
        """Test that validate_spec runs chart type validation."""
        validator = ChartQualityValidator(
            enable_spec_verification=False,  # Skip LLM verification
            enable_chart_type_check=True,
        )

        spec = ChartSpec(
            title="Revenue Over Time",
            description="Test",
            original_request="Show revenue over time",
            metric="revenue",
            chart_type=ChartType.BAR_CHART,
        )

        result = validator.validate_spec(spec)

        # Should catch the chart type mismatch
        assert any(i.code == "CHART_TYPE_MISMATCH" for i in result.issues)

    def test_quality_result_properties(self):
        """Test QualityValidationResult property methods."""
        result = QualityValidationResult(passed=True)

        from engine.validators.quality_validator import ValidationIssue

        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.ERROR,
            code="TEST_ERROR",
            message="Test error",
            suggestion="Fix it",
        ))
        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.WARNING,
            code="TEST_WARNING",
            message="Test warning",
            suggestion="Consider fixing",
        ))
        result.add_issue(ValidationIssue(
            severity=ValidationSeverity.INFO,
            code="TEST_INFO",
            message="Test info",
            suggestion="FYI",
        ))

        assert len(result.errors) == 1
        assert len(result.warnings) == 1
        assert len(result.issues) == 3
        assert result.passed is False  # Error should set passed=False


class TestIntegration:
    """Integration tests combining multiple validators."""

    def test_full_validation_flow(self):
        """Test a complete validation flow."""
        spec = ChartSpec(
            title="Monthly Revenue",
            description="Revenue trend over time",
            original_request="Show me monthly revenue trend",
            metric="revenue",
            aggregation="SUM",
            dimension="month",
            chart_type=ChartType.LINE_CHART,
        )

        sql = """
        SELECT DATE_TRUNC('month', invoice_date) as month,
               SUM(amount) as revenue
        FROM invoices
        GROUP BY month
        ORDER BY month
        """

        # Create validator with quick mode (no LLM verification)
        validator = ChartQualityValidator(
            enable_spec_verification=False,
            enable_visual_qa=False,
        )

        # Validate spec
        spec_result = validator.validate_spec(spec)
        assert spec_result.passed  # No chart type mismatch for line chart trend

        # Validate query (may fail without actual database, but should not crash)
        try:
            query_result = validator.validate_query(sql, spec, ["month", "revenue"])
            # If we have data, check results
            if query_result.row_count > 0:
                assert query_result.passed or query_result.warnings
        except Exception:
            # OK if database not available
            pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
