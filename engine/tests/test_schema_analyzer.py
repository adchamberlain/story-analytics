"""
Regression tests for schema analyzer: type classification, schema context building.
"""

import pytest

from engine.v2.schema_analyzer import (
    ColumnProfile, DataProfile,
    build_schema_context, _simplify_type, _is_date_type, _is_numeric_type,
)


# ── Type classification ─────────────────────────────────────────────────────

@pytest.mark.unit
class TestSimplifyType:
    @pytest.mark.parametrize("duckdb_type,expected", [
        ("INTEGER", "integer"),
        ("BIGINT", "integer"),
        ("SMALLINT", "integer"),
        ("TINYINT", "integer"),
        ("HUGEINT", "integer"),
        ("FLOAT", "decimal"),
        ("DOUBLE", "decimal"),
        ("DECIMAL(10,2)", "decimal"),
        ("NUMERIC", "decimal"),
        ("DATE", "date"),
        ("TIMESTAMP", "datetime"),
        ("TIMESTAMP WITH TIME ZONE", "datetime"),
        ("BOOLEAN", "boolean"),
        ("VARCHAR", "text"),
        ("VARCHAR(255)", "text"),
        ("TEXT", "text"),
        ("BLOB", "blob"),
    ])
    def test_simplify_type(self, duckdb_type, expected):
        assert _simplify_type(duckdb_type) == expected


@pytest.mark.unit
class TestIsDateType:
    @pytest.mark.parametrize("duckdb_type,expected", [
        ("DATE", True),
        ("TIMESTAMP", True),
        ("TIMESTAMP WITH TIME ZONE", True),
        ("VARCHAR", False),
        ("INTEGER", False),
        ("BOOLEAN", False),
    ])
    def test_is_date_type(self, duckdb_type, expected):
        assert _is_date_type(duckdb_type) == expected


@pytest.mark.unit
class TestIsNumericType:
    @pytest.mark.parametrize("duckdb_type,expected", [
        ("INTEGER", True),
        ("BIGINT", True),
        ("FLOAT", True),
        ("DOUBLE", True),
        ("DECIMAL(10,2)", True),
        ("VARCHAR", False),
        ("DATE", False),
        ("BOOLEAN", False),
    ])
    def test_is_numeric_type(self, duckdb_type, expected):
        assert _is_numeric_type(duckdb_type) == expected


# ── Schema context building ──────────────────────────────────────────────────

@pytest.mark.unit
class TestBuildSchemaContext:
    def _make_profile(self, columns=None):
        if columns is None:
            columns = [
                ColumnProfile("order_date", "DATE", ["2024-01-01", "2024-01-02"], 365, 0, "2024-01-01", "2024-12-31"),
                ColumnProfile("revenue", "DOUBLE", ["100.5", "200.3"], 500, 0, "10.0", "9999.99"),
                ColumnProfile("region", "VARCHAR", ["North", "South", "East"], 4, 0),
            ]
        return DataProfile(filename="sales.csv", row_count=1000, columns=columns)

    def test_context_includes_table_name(self):
        ctx = build_schema_context(self._make_profile(), "src_abc123")
        assert "TABLE: src_abc123" in ctx

    def test_context_includes_filename(self):
        ctx = build_schema_context(self._make_profile(), "src_abc123")
        assert "sales.csv" in ctx

    def test_context_includes_row_count(self):
        ctx = build_schema_context(self._make_profile(), "src_abc123")
        assert "1,000" in ctx

    def test_context_includes_column_names(self):
        ctx = build_schema_context(self._make_profile(), "src_abc123")
        assert "order_date" in ctx
        assert "revenue" in ctx
        assert "region" in ctx

    def test_context_includes_simplified_types(self):
        ctx = build_schema_context(self._make_profile(), "src_abc123")
        assert "date" in ctx.lower()
        assert "decimal" in ctx.lower()
        assert "text" in ctx.lower()

    def test_context_includes_sample_values(self):
        ctx = build_schema_context(self._make_profile(), "src_abc123")
        assert "2024-01-01" in ctx
        assert "North" in ctx

    def test_context_includes_data_shape_hints(self):
        ctx = build_schema_context(self._make_profile(), "src_abc123")
        assert "Date columns:" in ctx
        assert "Numeric columns:" in ctx
        assert "Categorical columns:" in ctx

    def test_context_detects_time_series_pattern(self):
        ctx = build_schema_context(self._make_profile(), "src_abc123")
        assert "Time series data detected" in ctx

    def test_context_detects_category_metric_pattern(self):
        """Category hint only fires when no date columns are present (elif priority)."""
        columns = [
            ColumnProfile("region", "VARCHAR", ["North", "South", "East"], 4, 0),
            ColumnProfile("revenue", "DOUBLE", ["100.5", "200.3"], 500, 0, "10.0", "9999.99"),
        ]
        ctx = build_schema_context(self._make_profile(columns), "src_abc123")
        assert "Category + metric" in ctx

    def test_context_detects_scatter_pattern(self):
        columns = [
            ColumnProfile("x_val", "DOUBLE", ["1.0", "2.0"], 100, 0),
            ColumnProfile("y_val", "FLOAT", ["3.0", "4.0"], 100, 0),
        ]
        ctx = build_schema_context(self._make_profile(columns), "src_abc")
        assert "scatter" in ctx.lower()

    def test_context_handles_null_counts(self):
        columns = [
            ColumnProfile("notes", "VARCHAR", ["hello"], 10, 5),
        ]
        ctx = build_schema_context(self._make_profile(columns), "src_abc")
        assert "5 nulls" in ctx


@pytest.mark.unit
class TestDataProfileFromSchemaResponse:
    def test_from_schema_response(self):
        schema = {
            "filename": "test.csv",
            "row_count": 42,
            "columns": [
                {
                    "name": "id",
                    "type": "INTEGER",
                    "sample_values": ["1", "2", "3"],
                    "distinct_count": 42,
                    "null_count": 0,
                    "min_value": "1",
                    "max_value": "42",
                }
            ],
        }
        profile = DataProfile.from_schema_response(schema)
        assert profile.filename == "test.csv"
        assert profile.row_count == 42
        assert len(profile.columns) == 1
        assert profile.columns[0].name == "id"
        assert profile.columns[0].type == "INTEGER"
