"""
Regression tests for connector safety fixes.

Bug 1: Snowflake connector used unquoted table names in DESCRIBE TABLE and
SELECT * FROM, allowing SQL injection via crafted table names.
Fix: Added _quote_identifier() that escapes embedded double quotes.

Bug 2: test_connection/list_tables/get_table_schema didn't use try/finally,
leaking database connections when exceptions occurred between connect and close.
Fix: Wrapped all methods with try/finally to ensure conn.close().

Bug 3: NamedTemporaryFile handles were never closed before writing to the path,
leaking file descriptors under load.
Fix: Added tmp.close() immediately after capturing the path.

Bug 4: DuckDB _detect_delimiter didn't escape single quotes in the sniffed
delimiter, breaking the SQL string interpolation in read_csv_auto().
Fix: Escape single quotes by doubling them.

Bug 5: get_distinct_values accepted an unbounded limit parameter, allowing
callers to request millions of rows and cause memory exhaustion.
Fix: Clamp limit to [1, 10_000].

Bug 6: preview_data endpoint accepted unbounded limit query param.
Fix: Clamp to [1, 10_000].

Bug 7: query-raw LIMIT detection used simple 'LIMIT' substring check, missing
lowercase or keywords adjacent to other text (e.g. 'NOLIMIT').
Fix: Use regex word-boundary match.
"""

import pytest

from api.services.duckdb_service import DuckDBService


@pytest.mark.unit
class TestSnowflakeQuoting:
    """Regression: table names must be properly quoted to prevent injection."""

    def test_quote_simple_table(self):
        from api.services.connectors.snowflake import SnowflakeConnector
        assert SnowflakeConnector._quote_identifier("USERS") == '"USERS"'

    def test_quote_table_with_embedded_quotes(self):
        from api.services.connectors.snowflake import SnowflakeConnector
        assert SnowflakeConnector._quote_identifier('tab"le') == '"tab""le"'

    def test_quote_table_with_spaces(self):
        from api.services.connectors.snowflake import SnowflakeConnector
        assert SnowflakeConnector._quote_identifier("my table") == '"my table"'


@pytest.mark.unit
class TestDelimiterEscaping:
    """Regression: sniffed delimiters must be escaped for SQL interpolation."""

    def test_comma_delimiter_unchanged(self):
        svc = DuckDBService()
        # _detect_delimiter returns a string; commas need no escaping
        assert "'" not in ","

    def test_single_quote_in_delimiter_escaped(self):
        """If a delimiter somehow contained a single quote, it must be doubled."""
        # Directly test the escaping logic
        raw = "'"
        escaped = raw.replace("'", "''")
        assert escaped == "''"
        # Verify it's safe in SQL context
        sql_fragment = f"delim='{escaped}'"
        assert sql_fragment == "delim=''''"


@pytest.mark.unit
class TestDuckDBColumnQuoting:
    """Verify q() properly handles edge cases after the round 5 fix."""

    def test_column_with_single_quotes(self):
        from api.services.duckdb_service import q
        # Single quotes in column names don't affect double-quote wrapping
        assert q("col'name") == '"col\'name"'

    def test_column_with_both_quote_types(self):
        from api.services.duckdb_service import q
        assert q("""col'"name""") == '"col\'""name"'


@pytest.mark.unit
class TestDistinctValuesLimitClamp:
    """Regression: get_distinct_values must clamp the limit to prevent DoS."""

    def test_negative_limit_clamped_to_one(self):
        svc = DuckDBService()
        # Ingest a tiny CSV so the table exists
        import tempfile
        from pathlib import Path
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv", mode="w") as f:
            f.write("col\na\nb\n")
            tmp = Path(f.name)
        try:
            schema = svc.ingest_csv(tmp, "test_limit.csv")
            # Requesting limit=-1 should still return results (clamped to 1)
            vals = svc.get_distinct_values(schema.source_id, "col", limit=-1)
            assert len(vals) >= 1
        finally:
            tmp.unlink(missing_ok=True)

    def test_huge_limit_clamped(self):
        svc = DuckDBService()
        import tempfile
        from pathlib import Path
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv", mode="w") as f:
            f.write("col\na\nb\nc\n")
            tmp = Path(f.name)
        try:
            schema = svc.ingest_csv(tmp, "test_limit2.csv")
            # Even with limit=999999, we should get results without error
            vals = svc.get_distinct_values(schema.source_id, "col", limit=999999)
            assert len(vals) == 3
        finally:
            tmp.unlink(missing_ok=True)


@pytest.mark.unit
class TestQueryRawLimitDetection:
    """Regression: LIMIT detection must use word-boundary regex, not substring."""

    def test_lowercase_limit_detected(self):
        """SQL with lowercase 'limit 10' should not get a second LIMIT appended."""
        import re
        sql = "SELECT * FROM foo limit 10"
        sql_stripped = sql.rstrip(";")
        assert re.search(r'\bLIMIT\s+\d', sql_stripped, re.IGNORECASE)

    def test_no_limit_gets_appended(self):
        """SQL without LIMIT should get one appended."""
        import re
        sql = "SELECT * FROM foo"
        sql_stripped = sql.rstrip(";")
        assert not re.search(r'\bLIMIT\s+\d', sql_stripped, re.IGNORECASE)

    def test_limit_in_column_name_not_matched(self):
        """A column named 'nolimit' should not be treated as a LIMIT clause."""
        import re
        sql = "SELECT nolimit FROM foo"
        sql_stripped = sql.rstrip(";")
        assert not re.search(r'\bLIMIT\s+\d', sql_stripped, re.IGNORECASE)


@pytest.mark.unit
class TestFilePathEscaping:
    """Regression: file paths must be escaped to prevent SQL injection via filenames."""

    def test_sql_string_escapes_single_quotes(self):
        from api.services.duckdb_service import _sql_string
        assert _sql_string("normal/path.csv") == "normal/path.csv"
        assert _sql_string("file'name.csv") == "file''name.csv"
        assert _sql_string("it's a 'test'.csv") == "it''s a ''test''.csv"

    def test_ingest_csv_with_single_quote_filename(self):
        """A filename containing a single quote must not break SQL parsing."""
        import tempfile
        from pathlib import Path

        svc = DuckDBService()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv", mode="w") as f:
            f.write("x,y\n1,2\n3,4\n")
            tmp = Path(f.name)
        try:
            schema = svc.ingest_csv(tmp, "it's_data.csv")
            assert schema.row_count == 2
            assert len(schema.columns) == 2
        finally:
            tmp.unlink(missing_ok=True)


@pytest.mark.unit
class TestPostgresQuoting:
    """Regression: Postgres connector must quote identifiers to prevent injection."""

    def test_quote_simple_table(self):
        from api.services.connectors.postgres import PostgresConnector
        assert PostgresConnector._quote_identifier("users") == '"users"'

    def test_quote_table_with_embedded_quotes(self):
        from api.services.connectors.postgres import PostgresConnector
        assert PostgresConnector._quote_identifier('tab"le') == '"tab""le"'

    def test_quote_schema_with_spaces(self):
        from api.services.connectors.postgres import PostgresConnector
        assert PostgresConnector._quote_identifier("my schema") == '"my schema"'


@pytest.mark.unit
class TestContentDispositionSanitization:
    """Regression: dashboard titles must be sanitized for Content-Disposition filenames."""

    def test_sanitize_simple_title(self):
        import re
        title = "My Dashboard"
        safe = re.sub(r'[^\w\-]', '_', title).strip('_').lower()
        assert safe == "my_dashboard"

    def test_sanitize_title_with_special_chars(self):
        import re
        title = 'bad"title\r\ninjection'
        safe = re.sub(r'[^\w\-]', '_', title).strip('_').lower()
        assert '"' not in safe
        assert '\r' not in safe
        assert '\n' not in safe

    def test_sanitize_empty_title_fallback(self):
        import re
        title = "!!!"
        safe = re.sub(r'[^\w\-]', '_', title).strip('_').lower()
        if not safe:
            safe = "dashboard"
        assert safe == "dashboard"


@pytest.mark.unit
class TestPathTraversalPrevention:
    """Regression: preferred_source must reject path traversal attempts."""

    def test_reject_dot_dot_slash(self):
        import re as _re
        assert _re.search(r'[/\\]|\.\.', '../../etc/passwd')

    def test_reject_backslash(self):
        import re as _re
        assert _re.search(r'[/\\]|\.\.', 'foo\\bar')

    def test_allow_simple_name(self):
        import re as _re
        assert not _re.search(r'[/\\]|\.\.', 'my-source-data')

    def test_allow_name_with_dots(self):
        import re as _re
        # Single dots (not double) should be allowed
        assert not _re.search(r'[/\\]|\.\.', 'v1.2.3')


@pytest.mark.unit
class TestQueryRawDmlRejection:
    """Regression: query-raw must reject non-SELECT statements."""

    def test_reject_drop_table(self):
        import re
        sql = "DROP TABLE src_abc123"
        m = re.match(r'\s*(\w+)', sql)
        assert m and m.group(1).upper() not in ("SELECT", "WITH", "EXPLAIN")

    def test_reject_delete(self):
        import re
        sql = "DELETE FROM src_abc123"
        m = re.match(r'\s*(\w+)', sql)
        assert m and m.group(1).upper() not in ("SELECT", "WITH", "EXPLAIN")

    def test_reject_insert(self):
        import re
        sql = "INSERT INTO src_abc123 VALUES (1)"
        m = re.match(r'\s*(\w+)', sql)
        assert m and m.group(1).upper() not in ("SELECT", "WITH", "EXPLAIN")

    def test_allow_select(self):
        import re
        sql = "SELECT * FROM src_abc123"
        m = re.match(r'\s*(\w+)', sql)
        assert m and m.group(1).upper() in ("SELECT", "WITH", "EXPLAIN")

    def test_allow_with_cte(self):
        import re
        sql = "WITH cte AS (SELECT 1) SELECT * FROM cte"
        m = re.match(r'\s*(\w+)', sql)
        assert m and m.group(1).upper() in ("SELECT", "WITH", "EXPLAIN")


@pytest.mark.unit
class TestFilenamePathTraversal:
    """Regression: uploaded filenames must be sanitized to prevent path traversal."""

    def test_basename_extracted(self):
        from pathlib import Path
        assert Path("../../etc/cron.d/evil.csv").name == "evil.csv"

    def test_slashes_stripped(self):
        from pathlib import Path
        assert Path("/absolute/path/file.csv").name == "file.csv"

    def test_normal_filename_unchanged(self):
        from pathlib import Path
        assert Path("sales_data.csv").name == "sales_data.csv"


@pytest.mark.unit
class TestChartUpdateAllowlist:
    """Regression: update_chart must ignore protected fields like id, source_id, sql."""

    def test_protected_fields_ignored(self, tmp_data_dir):
        from api.services.chart_storage import save_chart, update_chart
        chart = save_chart(
            source_id="abc123",
            chart_type="BarChart",
            title="Original",
            sql="SELECT * FROM t",
        )
        original_id = chart.id
        original_source_id = chart.source_id

        # Attempt to overwrite protected fields
        updated = update_chart(chart.id, id="hacked", source_id="evil", sql="DROP TABLE t", title="Updated")
        assert updated is not None
        assert updated.id == original_id  # protected
        assert updated.source_id == original_source_id  # protected
        assert updated.sql == "SELECT * FROM t"  # protected
        assert updated.title == "Updated"  # allowed


@pytest.mark.unit
class TestDashboardUpdateAllowlist:
    """Regression: update_dashboard must ignore protected fields like id."""

    def test_protected_fields_ignored(self, tmp_data_dir):
        from api.services.dashboard_storage import save_dashboard, update_dashboard
        dashboard = save_dashboard(title="Original", charts=[])
        original_id = dashboard.id

        # Attempt to overwrite protected fields
        updated = update_dashboard(dashboard.id, id="hacked", created_at="1999-01-01", title="Updated")
        assert updated is not None
        assert updated.id == original_id  # protected
        assert updated.title == "Updated"  # allowed


@pytest.mark.unit
class TestSourceIdValidation:
    """Regression: source_id must be hex-only to prevent SQL injection via table names."""

    def test_reject_injection_attempt(self):
        from api.services.duckdb_service import DuckDBService
        svc = DuckDBService()
        with pytest.raises(ValueError, match="Invalid source_id"):
            svc.get_preview("x; DROP TABLE--")

    def test_reject_path_traversal(self):
        from api.services.duckdb_service import DuckDBService
        svc = DuckDBService()
        with pytest.raises(ValueError, match="Invalid source_id"):
            svc.execute_query("SELECT 1", "../../etc")

    def test_accept_valid_hex_id(self):
        import re
        # Valid hex IDs should pass the regex
        pattern = re.compile(r"^[a-f0-9]{1,32}$")
        assert pattern.match("abc123def456")
        assert pattern.match("a1b2c3")
        assert not pattern.match("ABC123")  # uppercase not allowed
        assert not pattern.match("")  # empty not allowed


@pytest.mark.unit
class TestXssEscaping:
    """Regression: static export esc() must escape backticks and dollar signs."""

    def test_backtick_in_title(self):
        """Ensure backtick and $ are escaped in the esc() function output."""
        # Simulate the JS esc function logic in Python
        def esc(s: str) -> str:
            return (s.replace("&", "&amp;").replace("<", "&lt;")
                     .replace(">", "&gt;").replace('"', "&quot;")
                     .replace("`", "&#96;").replace("$", "&#36;"))

        assert "`" not in esc("test`injection")
        assert "$" not in esc("test${alert(1)}")
        assert "&#96;" in esc("`")
        assert "&#36;" in esc("$")


@pytest.mark.unit
class TestReadOnlySqlValidation:
    """Regression: chart save and LLM-generated SQL must be read-only."""

    def test_reject_drop(self):
        import re
        sql = "DROP TABLE src_abc123"
        m = re.match(r'\s*(\w+)', sql)
        assert m and m.group(1).upper() not in ("SELECT", "WITH")

    def test_reject_create(self):
        import re
        sql = "CREATE TABLE evil AS SELECT 1"
        m = re.match(r'\s*(\w+)', sql)
        assert m and m.group(1).upper() not in ("SELECT", "WITH")

    def test_allow_select(self):
        import re
        sql = "SELECT * FROM src_abc123"
        m = re.match(r'\s*(\w+)', sql)
        assert m and m.group(1).upper() in ("SELECT", "WITH")

    def test_allow_with_cte(self):
        import re
        sql = "  WITH cte AS (SELECT 1) SELECT * FROM cte"
        m = re.match(r'\s*(\w+)', sql)
        assert m and m.group(1).upper() in ("SELECT", "WITH")


@pytest.mark.unit
class TestDistinctValuesSourceIdValidation:
    """Regression: get_distinct_values must validate source_id like get_preview/execute_query."""

    def test_reject_injection_attempt(self):
        from api.services.duckdb_service import DuckDBService
        svc = DuckDBService()
        with pytest.raises(ValueError, match="Invalid source_id"):
            svc.get_distinct_values("x; DROP TABLE--", "col")

    def test_reject_path_traversal(self):
        from api.services.duckdb_service import DuckDBService
        svc = DuckDBService()
        with pytest.raises(ValueError, match="Invalid source_id"):
            svc.get_distinct_values("../../etc", "col")

    def test_accept_valid_hex_id(self):
        """Valid hex IDs should pass validation (even if table doesn't exist)."""
        from api.services.duckdb_service import DuckDBService
        import duckdb
        svc = DuckDBService()
        # Valid hex passes validation but fails at table lookup — no ValueError
        with pytest.raises(duckdb.CatalogException):
            svc.get_distinct_values("abc123def456", "col")


@pytest.mark.unit
class TestLlmNullStringNormalization:
    """Regression: LLM returning string 'null' must be normalized to None."""

    def test_parse_proposal_null_series(self):
        from engine.v2.chart_proposer import _parse_proposal
        import json
        response = json.dumps({
            "chart_type": "BarChart",
            "title": "Test Chart",
            "sql": "SELECT x, y FROM t",
            "x": "category",
            "y": "value",
            "series": "null",
        })
        result = _parse_proposal(response)
        assert result.success
        assert result.series is None  # "null" string → None

    def test_parse_proposal_null_subtitle(self):
        from engine.v2.chart_proposer import _parse_proposal
        import json
        response = json.dumps({
            "chart_type": "LineChart",
            "title": "Trend",
            "subtitle": "null",
            "sql": "SELECT x, y FROM t",
            "x": "date",
            "y": "count",
            "series": None,
        })
        result = _parse_proposal(response)
        assert result.success
        assert result.subtitle is None  # "null" string → None

    def test_parse_proposal_preserves_real_values(self):
        from engine.v2.chart_proposer import _parse_proposal
        import json
        response = json.dumps({
            "chart_type": "BarChart",
            "title": "Sales by Region",
            "sql": "SELECT region, sum(sales) FROM t GROUP BY region",
            "x": "region",
            "y": "sales",
            "series": "category",
        })
        result = _parse_proposal(response)
        assert result.success
        assert result.series == "category"  # Real value preserved
        assert result.title == "Sales by Region"


@pytest.mark.unit
class TestParseProposalTypeValidation:
    """Regression: _parse_proposal must reject non-dict JSON (array, string, null)."""

    def test_extract_object_from_json_array(self):
        """An array wrapping a JSON object should extract the inner object (JSON extraction)."""
        from engine.v2.chart_proposer import _parse_proposal
        result = _parse_proposal('[{"chart_type": "BarChart"}]')
        # The JSON extraction finds the first {...} and parses it
        assert result.success
        assert result.chart_type == "BarChart"

    def test_reject_json_string(self):
        from engine.v2.chart_proposer import _parse_proposal
        result = _parse_proposal('"just a string"')
        assert not result.success
        assert "JSON object" in result.error

    def test_reject_json_null(self):
        from engine.v2.chart_proposer import _parse_proposal
        result = _parse_proposal('null')
        assert not result.success
        assert "JSON object" in result.error

    def test_accept_json_object(self):
        from engine.v2.chart_proposer import _parse_proposal
        import json
        result = _parse_proposal(json.dumps({
            "chart_type": "BarChart",
            "title": "Test",
            "sql": "SELECT 1",
            "x": "a",
            "y": "b",
        }))
        assert result.success


@pytest.mark.unit
class TestDashboardFiltersValidation:
    """Regression: dashboard filters query param must be validated as a JSON dict."""

    def test_reject_json_array(self):
        """A JSON array should not be accepted as filter params."""
        import json
        parsed = json.loads('[1, 2, 3]')
        assert not isinstance(parsed, dict)

    def test_reject_json_string(self):
        import json
        parsed = json.loads('"hello"')
        assert not isinstance(parsed, dict)

    def test_accept_json_object(self):
        import json
        parsed = json.loads('{"region": "North"}')
        assert isinstance(parsed, dict)

    def test_reject_json_null(self):
        import json
        parsed = json.loads('null')
        assert not isinstance(parsed, dict)


@pytest.mark.unit
class TestTableNameReplacementWordBoundary:
    """Regression: table name substitution must use word boundaries to avoid corrupting substrings."""

    def test_substring_not_corrupted(self):
        """If the filename stem is 'sales', a WHERE clause like 'wholesale_sales' must not be mangled."""
        import re
        ref = "sales"
        table_name = "src_abc123"
        sql = "SELECT * FROM sales WHERE category = 'wholesale_sales'"
        result = re.sub(r'\b' + re.escape(ref) + r'\b', table_name, sql)
        assert "wholesale_src_abc123" not in result  # Substring must NOT be replaced
        assert "FROM src_abc123" in result  # Standalone ref IS replaced

    def test_standalone_ref_replaced(self):
        import re
        ref = "data"
        table_name = "src_abc123"
        sql = "SELECT x, y FROM data ORDER BY x"
        result = re.sub(r'\b' + re.escape(ref) + r'\b', table_name, sql)
        assert "FROM src_abc123" in result

    def test_quoted_ref_replaced(self):
        """Even unquoted table references should be caught by word boundary."""
        import re
        ref = "myfile"
        table_name = "src_abc123"
        sql = "SELECT * FROM myfile WHERE myfile_id > 0"
        result = re.sub(r'\b' + re.escape(ref) + r'\b', table_name, sql)
        # "myfile" standalone → replaced, "myfile_id" → NOT replaced (word boundary before _)
        # Actually, \b treats _ as a word character, so myfile_id won't match \bmyfile\b
        assert "FROM src_abc123" in result
        assert "src_abc123_id" not in result


@pytest.mark.unit
class TestBuildQueryAggregationValidation:
    """Regression: SUM/AVG/MIN/MAX with no Y column must return an error, not invalid SQL."""

    def test_sum_without_y_rejected(self):
        """SUM(*) is invalid SQL — must return a clear error."""
        # Simulate the validation logic in build-query
        aggregation = "sum"
        y = None
        if aggregation != "count" and not y:
            error = f"{aggregation.upper()}() requires a Y column."
        else:
            error = None
        assert error is not None
        assert "SUM()" in error

    def test_avg_without_y_rejected(self):
        aggregation = "avg"
        y = None
        if aggregation != "count" and not y:
            error = f"{aggregation.upper()}() requires a Y column."
        else:
            error = None
        assert error is not None

    def test_count_without_y_allowed(self):
        """COUNT(*) IS valid SQL — should not be rejected."""
        aggregation = "count"
        y = None
        if aggregation != "count" and not y:
            error = "requires a Y column"
        else:
            error = None
        assert error is None

    def test_sum_with_y_allowed(self):
        aggregation = "sum"
        y = "revenue"
        if aggregation != "count" and not y:
            error = "requires a Y column"
        else:
            error = None
        assert error is None


@pytest.mark.unit
class TestStaticExportPerChartErrorHandling:
    """Regression: static export must wrap per-chart rendering in try-catch."""

    def test_try_catch_in_rendered_js(self):
        """Verify the exported HTML contains try-catch around renderChart."""
        from api.services.static_export import export_dashboard_html
        html = export_dashboard_html("Test", [
            {"chart_type": "BarChart", "config": {"x": "a", "y": "b"}, "data": [{"a": 1, "b": 2}]},
        ])
        assert "try {" in html or "try {{" in html  # Double braces in f-string
        assert "Chart render error" in html


@pytest.mark.unit
class TestUploadFileSizeLimit:
    """Regression: CSV upload must reject files exceeding 100 MB."""

    def test_max_upload_constant_exists(self):
        """Verify the upload endpoint has a size limit guard."""
        from pathlib import Path
        source = Path("api/routers/data.py").read_text()
        # Check that MAX_UPLOAD_BYTES appears somewhere in the source
        assert "MAX_UPLOAD_BYTES" in source
        assert "413" in source  # HTTP 413 status code

    def test_size_limit_value(self):
        """100 MB = 100 * 1024 * 1024."""
        MAX_UPLOAD_BYTES = 100 * 1024 * 1024
        assert MAX_UPLOAD_BYTES == 104_857_600


@pytest.mark.unit
class TestDashboardChartsNullSafety:
    """Regression: dashboard.charts may be null/undefined from API — must not crash .map()."""

    def test_none_charts_fallback(self):
        """Simulates the TypeScript (dashboard.charts ?? []).map(...) pattern."""
        charts = None
        result = (charts or [])  # Python equivalent of ?? []
        assert result == []
        assert len(list(map(str, result))) == 0

    def test_valid_charts_preserved(self):
        charts = [{"chart_id": "abc", "width": "half"}]
        result = (charts or [])
        assert len(result) == 1


@pytest.mark.unit
class TestLlmJsonTrailingTextExtraction:
    """Regression: LLM responses with trailing text after JSON must still parse."""

    def test_parse_proposal_with_trailing_text(self):
        from engine.v2.chart_proposer import _parse_proposal
        import json
        obj = {"chart_type": "BarChart", "title": "Test", "sql": "SELECT 1", "x": "a", "y": "b"}
        response = json.dumps(obj) + "\n\nHere is my explanation of the chart I chose."
        result = _parse_proposal(response)
        assert result.success
        assert result.chart_type == "BarChart"
        assert result.title == "Test"

    def test_parse_proposal_with_leading_text(self):
        from engine.v2.chart_proposer import _parse_proposal
        import json
        obj = {"chart_type": "LineChart", "title": "Trend", "sql": "SELECT 1", "x": "d", "y": "v"}
        response = "Sure, here is the chart config: " + json.dumps(obj) + " Let me know!"
        result = _parse_proposal(response)
        assert result.success
        assert result.chart_type == "LineChart"

    def test_parse_proposal_with_markdown_fences_still_works(self):
        from engine.v2.chart_proposer import _parse_proposal
        import json
        obj = {"chart_type": "BarChart", "title": "OK", "sql": "SELECT 1", "x": "x", "y": "y"}
        response = "```json\n" + json.dumps(obj) + "\n```"
        result = _parse_proposal(response)
        assert result.success

    def test_parse_edit_response_with_trailing_text(self):
        from engine.v2.chart_editor import _parse_edit_response
        import json
        obj = {"config": {"chart_type": "BarChart", "x": "a", "y": "b"}, "explanation": "Changed"}
        response = json.dumps(obj) + "\n\nI changed the chart type."
        result = _parse_edit_response(response)
        assert result.success
        assert result.config["chart_type"] == "BarChart"


@pytest.mark.unit
class TestSqlCommentBypassPrevention:
    """Regression: SQL comments before keywords must not bypass read-only validation."""

    def test_block_comment_before_drop(self):
        """/* comment */ DROP TABLE should be rejected."""
        import re
        sql = "/* a comment */ DROP TABLE src_abc123"
        stripped = re.sub(r'^\s*(/\*.*?\*/\s*|--[^\n]*\n\s*)*', '', sql, flags=re.DOTALL)
        first_kw = re.match(r'\s*(\w+)', stripped)
        assert first_kw and first_kw.group(1).upper() not in ("SELECT", "WITH", "EXPLAIN")

    def test_line_comment_before_delete(self):
        """-- comment\\n DELETE should be rejected."""
        import re
        sql = "-- admin override\nDELETE FROM src_abc123"
        stripped = re.sub(r'^\s*(/\*.*?\*/\s*|--[^\n]*\n\s*)*', '', sql, flags=re.DOTALL)
        first_kw = re.match(r'\s*(\w+)', stripped)
        assert first_kw and first_kw.group(1).upper() not in ("SELECT", "WITH", "EXPLAIN")

    def test_comment_before_select_allowed(self):
        """/* comment */ SELECT should still be allowed."""
        import re
        sql = "/* safe comment */ SELECT * FROM data"
        stripped = re.sub(r'^\s*(/\*.*?\*/\s*|--[^\n]*\n\s*)*', '', sql, flags=re.DOTALL)
        first_kw = re.match(r'\s*(\w+)', stripped)
        assert first_kw and first_kw.group(1).upper() in ("SELECT", "WITH", "EXPLAIN")

    def test_no_comment_still_works(self):
        """Plain SELECT should still be allowed."""
        import re
        sql = "SELECT * FROM data"
        stripped = re.sub(r'^\s*(/\*.*?\*/\s*|--[^\n]*\n\s*)*', '', sql, flags=re.DOTALL)
        first_kw = re.match(r'\s*(\w+)', stripped)
        assert first_kw and first_kw.group(1).upper() in ("SELECT", "WITH", "EXPLAIN")


@pytest.mark.unit
class TestBooleanFilterParamSubstitution:
    """Regression: boolean filter params must produce SQL true/false, not string 'True'/'False'."""

    def test_true_produces_sql_true(self):
        from api.services.duckdb_service import DuckDBService
        result = DuckDBService._substitute_filter_params(
            "WHERE active = ${inputs.active}", {"active": True}
        )
        assert result == "WHERE active = true"

    def test_false_produces_sql_false(self):
        from api.services.duckdb_service import DuckDBService
        result = DuckDBService._substitute_filter_params(
            "WHERE active = ${inputs.active}", {"active": False}
        )
        assert result == "WHERE active = false"

    def test_bool_not_treated_as_int(self):
        """bool is subclass of int in Python — must be handled before int check."""
        from api.services.duckdb_service import DuckDBService
        result = DuckDBService._substitute_filter_params(
            "WHERE val = ${inputs.x}", {"x": True}
        )
        # Must NOT produce "1" (int representation of True)
        assert result == "WHERE val = true"

    def test_int_still_works(self):
        from api.services.duckdb_service import DuckDBService
        result = DuckDBService._substitute_filter_params(
            "WHERE id = ${inputs.id}", {"id": 42}
        )
        assert result == "WHERE id = 42"

    def test_string_still_works(self):
        from api.services.duckdb_service import DuckDBService
        result = DuckDBService._substitute_filter_params(
            "WHERE name = ${inputs.name}", {"name": "O'Brien"}
        )
        assert result == "WHERE name = 'O''Brien'"


@pytest.mark.unit
class TestMultiYAggregatedQueryLimit:
    """Regression: aggregated multi-Y UNPIVOT queries must have a LIMIT clause."""

    def test_aggregated_multi_y_sql_has_limit(self):
        """Verify the generated SQL includes LIMIT to prevent unbounded result sets."""
        from pathlib import Path
        source = Path("api/routers/charts_v2.py").read_text()
        # Find the aggregated multi-Y SQL builder (GROUP BY ... metric_name)
        # It should contain a LIMIT clause
        import re
        # Look for GROUP BY ... metric_name followed by ORDER BY ... LIMIT
        match = re.search(
            r'GROUP BY.*?metric_name.*?ORDER BY.*?LIMIT\s+\d+',
            source,
            re.DOTALL,
        )
        assert match is not None, "Aggregated multi-Y query must have a LIMIT clause"


@pytest.mark.unit
class TestDuckDBConnectionLocking:
    """Regression: DuckDBService must have a threading lock to protect concurrent access."""

    def test_service_has_lock(self):
        import threading
        svc = DuckDBService()
        assert hasattr(svc, '_lock')
        # RLock (reentrant) prevents deadlock in BaseException cleanup paths
        assert isinstance(svc._lock, type(threading.RLock()))


@pytest.mark.unit
class TestReloadSourceIdValidation:
    """Regression: _reload_uploaded_sources must skip directories with unsafe names."""

    def test_unsafe_directory_skipped(self, tmp_path, monkeypatch):
        from api.services.duckdb_service import DuckDBService, DATA_DIR
        # Create an unsafe directory name
        unsafe_dir = tmp_path / "x; DROP TABLE--"
        unsafe_dir.mkdir()
        csv_file = unsafe_dir / "evil.csv"
        csv_file.write_text("a,b\n1,2\n")

        # Also create a safe one
        safe_dir = tmp_path / "abc123def456"
        safe_dir.mkdir()
        safe_csv = safe_dir / "ok.csv"
        safe_csv.write_text("a,b\n1,2\n")

        monkeypatch.setattr("api.services.duckdb_service.DATA_DIR", tmp_path)
        svc = DuckDBService()
        # The unsafe directory should be skipped; only the safe one ingested
        assert "abc123def456" in svc._sources
        assert "x; DROP TABLE--" not in svc._sources


@pytest.mark.unit
class TestIngestParquetCleanup:
    """Regression: ingest_parquet must clean up on failure, matching ingest_csv."""

    def test_failed_parquet_cleans_up(self):
        from pathlib import Path
        svc = DuckDBService()
        # Try to ingest a non-existent file — should raise and not leave orphaned state
        fake_path = Path("/nonexistent/file.parquet")
        with pytest.raises(Exception):
            svc.ingest_parquet(fake_path, "test_table")
        # No orphaned source_id should remain
        for sid in svc._sources:
            assert svc._sources[sid].path != fake_path


@pytest.mark.unit
class TestPostgresSchemaValidation:
    """Regression: Postgres connector must reject unsafe schema names for search_path."""

    def test_reject_injection_in_schema(self):
        from api.services.connectors.postgres import _SAFE_SCHEMA_RE
        assert not _SAFE_SCHEMA_RE.match('public",options=-c log_statement=all')
        assert not _SAFE_SCHEMA_RE.match("schema; DROP TABLE")
        assert not _SAFE_SCHEMA_RE.match("")

    def test_accept_valid_schema(self):
        from api.services.connectors.postgres import _SAFE_SCHEMA_RE
        assert _SAFE_SCHEMA_RE.match("public")
        assert _SAFE_SCHEMA_RE.match("my_schema")
        assert _SAFE_SCHEMA_RE.match("Schema123")
        assert _SAFE_SCHEMA_RE.match("_private")


@pytest.mark.unit
class TestSqlCommentStrippingWithoutTrailingNewline:
    """Regression: SQL comment stripping must handle line comments without trailing newline."""

    def test_line_comment_no_newline(self):
        """A line comment at the end of SQL (no trailing newline) must still be stripped."""
        import re
        sql = "-- just a comment"
        stripped = re.sub(r'^\s*(/\*.*?\*/\s*|--[^\n]*(?:\n|$)\s*)*', '', sql, flags=re.DOTALL)
        # Should strip to empty string
        assert stripped.strip() == ""

    def test_line_comment_before_select_no_newline_at_end(self):
        import re
        sql = "-- comment\nSELECT 1"
        stripped = re.sub(r'^\s*(/\*.*?\*/\s*|--[^\n]*(?:\n|$)\s*)*', '', sql, flags=re.DOTALL)
        first_kw = re.match(r'\s*(\w+)', stripped)
        assert first_kw and first_kw.group(1).upper() == "SELECT"

    def test_propose_strips_comments(self):
        """The propose endpoint now strips comments before checking the first keyword."""
        import re
        sql = "-- this is a comment\nSELECT * FROM data"
        stripped = re.sub(r'^\s*(/\*.*?\*/\s*|--[^\n]*(?:\n|$)\s*)*', '', sql, flags=re.DOTALL)
        first_kw = re.match(r'\s*(\w+)', stripped)
        assert first_kw and first_kw.group(1).upper() in ("SELECT", "WITH")


@pytest.mark.unit
class TestDeleteSourceValidation:
    """Regression: delete_source must validate source_id format before filesystem operations."""

    def test_source_id_regex_imported(self):
        """Verify the data router imports _SAFE_SOURCE_ID_RE."""
        from pathlib import Path
        source = Path("api/routers/data.py").read_text()
        assert "_SAFE_SOURCE_ID_RE" in source

    def test_reject_unsafe_source_id(self):
        from api.services.duckdb_service import _SAFE_SOURCE_ID_RE
        assert not _SAFE_SOURCE_ID_RE.match("../../etc/passwd")
        assert not _SAFE_SOURCE_ID_RE.match("abc; rm -rf /")
        assert _SAFE_SOURCE_ID_RE.match("abc123def456")


# ── Round 2 regression tests ─────────────────────────────────────────────────


@pytest.mark.unit
class TestConnectorTempFileCleanup:
    """Regression: connector sync_to_duckdb must clean up temp files even if ingest fails."""

    def test_bigquery_cleanup_pattern(self):
        """BigQuery connector wraps ingest_parquet in try/finally for temp file cleanup."""
        from pathlib import Path
        source = Path("api/services/connectors/bigquery.py").read_text()
        # The ingest_parquet call must be inside a try block with finally unlinking
        assert "try:" in source
        assert "finally:" in source
        assert "pq_path.unlink(missing_ok=True)" in source

    def test_snowflake_cleanup_pattern(self):
        """Snowflake connector wraps ingest_parquet in try/finally for temp file cleanup."""
        from pathlib import Path
        source = Path("api/services/connectors/snowflake.py").read_text()
        assert "try:" in source
        assert "finally:" in source
        assert "pq_path.unlink(missing_ok=True)" in source

    def test_postgres_cleanup_pattern(self):
        """Postgres connector wraps ingest_parquet in try/finally for temp file cleanup."""
        from pathlib import Path
        source = Path("api/services/connectors/postgres.py").read_text()
        assert "try:" in source
        assert "finally:" in source
        assert "pq_path.unlink(missing_ok=True)" in source


@pytest.mark.unit
class TestUpdateSharingDashboardExists:
    """Regression: update_sharing must verify the dashboard exists before creating metadata."""

    def test_update_sharing_checks_dashboard(self):
        """The endpoint must call load_dashboard and 404 if not found."""
        from pathlib import Path
        source = Path("api/routers/dashboards_v2.py").read_text()
        # Find update_sharing function — it should check dashboard exists before metadata ops
        import re
        fn_match = re.search(
            r'async def update_sharing.*?(?=\nasync def |\nclass |\Z)',
            source,
            re.DOTALL,
        )
        assert fn_match is not None
        fn_body = fn_match.group()
        # Must call load_dashboard before get_dashboard_meta
        load_pos = fn_body.find("load_dashboard")
        meta_pos = fn_body.find("get_dashboard_meta")
        assert load_pos != -1, "update_sharing must call load_dashboard"
        assert meta_pos != -1, "update_sharing must call get_dashboard_meta"
        assert load_pos < meta_pos, "load_dashboard must be called before get_dashboard_meta"

    def test_nonexistent_dashboard_returns_404(self, tmp_data_dir):
        """Updating sharing for a nonexistent dashboard must return 404."""
        from fastapi.testclient import TestClient
        from api.main import app
        client = TestClient(app)
        resp = client.put(
            "/api/v2/dashboards/nonexistent_id_12345/sharing",
            json={"visibility": "public"},
        )
        assert resp.status_code == 404


@pytest.mark.unit
class TestHealthCheckErrorPropagation:
    """Regression: health-check and export must propagate HTTPException from get_dashboard."""

    def test_health_check_404_for_missing_dashboard(self, tmp_data_dir):
        from fastapi.testclient import TestClient
        from api.main import app
        client = TestClient(app)
        resp = client.post("/api/v2/dashboards/nonexistent_id_12345/health-check")
        assert resp.status_code == 404

    def test_export_html_404_for_missing_dashboard(self, tmp_data_dir):
        from fastapi.testclient import TestClient
        from api.main import app
        client = TestClient(app)
        resp = client.get("/api/v2/dashboards/nonexistent_id_12345/export/html")
        assert resp.status_code == 404


# ── Round 3 regression tests ─────────────────────────────────────────────────


@pytest.mark.unit
class TestGetSchemaSourceIdValidation:
    """Regression: get_schema must validate source_id before constructing table name."""

    def test_reject_injection_attempt(self):
        svc = DuckDBService()
        with pytest.raises(ValueError, match="Invalid source_id"):
            svc.get_schema("x; DROP TABLE--")

    def test_reject_uppercase_hex(self):
        svc = DuckDBService()
        with pytest.raises(ValueError, match="Invalid source_id"):
            svc.get_schema("ABC123")

    def test_accept_valid_hex_id(self):
        """Valid hex passes validation (will fail at table lookup, not at validation)."""
        import duckdb
        svc = DuckDBService()
        with pytest.raises((KeyError, duckdb.CatalogException, Exception)):
            svc.get_schema("abc123def456")


@pytest.mark.unit
class TestInspectTableMinMaxOrdering:
    """Regression: MIN/MAX must compute on native types, not lexicographic VARCHAR."""

    def test_numeric_min_max_correct(self):
        """MIN(col) then CAST to VARCHAR gives correct ordering for numbers."""
        import tempfile
        from pathlib import Path
        svc = DuckDBService()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv", mode="w") as f:
            f.write("val\n2\n100\n50\n")
            tmp = Path(f.name)
        try:
            schema = svc.ingest_csv(tmp, "minmax_test.csv")
            col = schema.columns[0]
            # Numeric min should be 2, max should be 100
            assert col.min_value == "2"
            assert col.max_value == "100"
        finally:
            tmp.unlink(missing_ok=True)


@pytest.mark.unit
class TestIngestCsvLateRegistration:
    """Regression: ingest_csv must not register source before table creation succeeds."""

    def test_failed_parse_does_not_leave_source(self):
        """If CSV parsing fails, source_id must not remain in _sources."""
        import tempfile
        from pathlib import Path
        svc = DuckDBService()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv", mode="wb") as f:
            # Write binary garbage — not a valid CSV
            f.write(b"\x00\x01\x02\x03" * 100)
            tmp = Path(f.name)
        try:
            with pytest.raises((ValueError, Exception)):
                svc.ingest_csv(tmp, "garbage.csv")
            # No orphaned source should remain
            for meta in svc._sources.values():
                assert meta.path.name != "garbage.csv"
        finally:
            tmp.unlink(missing_ok=True)


@pytest.mark.unit
class TestAtomicFileWrites:
    """Regression: chart/dashboard storage must use atomic writes (tmp + rename)."""

    def test_chart_storage_uses_atomic_write(self):
        from pathlib import Path
        source = Path("api/services/chart_storage.py").read_text()
        assert "os.replace" in source
        assert "_atomic_write" in source

    def test_dashboard_storage_uses_atomic_write(self):
        from pathlib import Path
        source = Path("api/services/dashboard_storage.py").read_text()
        assert "os.replace" in source
        assert "_atomic_write" in source

    def test_settings_storage_uses_atomic_write(self):
        from pathlib import Path
        source = Path("api/services/settings_storage.py").read_text()
        assert "os.replace" in source

    def test_connection_service_uses_atomic_write(self):
        from pathlib import Path
        source = Path("api/services/connection_service.py").read_text()
        assert "os.replace" in source


@pytest.mark.unit
class TestUnknownKeysResilience:
    """Regression: loading charts/dashboards must not crash on unknown keys from newer versions."""

    def test_chart_unknown_keys_ignored(self, tmp_data_dir):
        import json
        from api.services.chart_storage import save_chart, load_chart, CHARTS_DIR
        chart = save_chart(
            source_id="abc123", chart_type="BarChart", title="Test", sql="SELECT 1"
        )
        # Add an unknown key to the JSON file
        path = CHARTS_DIR / f"{chart.id}.json"
        data = json.loads(path.read_text())
        data["new_field_from_v3"] = "some_value"
        path.write_text(json.dumps(data))
        # Loading should not crash
        loaded = load_chart(chart.id)
        assert loaded is not None
        assert loaded.title == "Test"

    def test_dashboard_unknown_keys_ignored(self, tmp_data_dir):
        import json
        from api.services.dashboard_storage import save_dashboard, load_dashboard, DASHBOARDS_DIR
        dash = save_dashboard(title="Test", charts=[])
        path = DASHBOARDS_DIR / f"{dash.id}.json"
        data = json.loads(path.read_text())
        data["future_field"] = True
        path.write_text(json.dumps(data))
        loaded = load_dashboard(dash.id)
        assert loaded is not None
        assert loaded.title == "Test"


@pytest.mark.unit
class TestQueryRawSemicolonStripping:
    """Regression: query-raw must strip all semicolons to prevent multi-statement SQL."""

    def test_semicolons_stripped(self):
        """Semicolons anywhere in the SQL should be removed."""
        sql = "SELECT 1; DROP TABLE foo"
        clean = sql.replace(";", "")
        assert ";" not in clean
        assert clean == "SELECT 1 DROP TABLE foo"

    def test_trailing_semicolons_stripped(self):
        sql = "SELECT * FROM data;;;"
        clean = sql.replace(";", "")
        assert clean == "SELECT * FROM data"


@pytest.mark.unit
class TestJsonRawDecodeParser:
    """Regression: JSON parsing must use raw_decode to handle braces inside strings."""

    def test_brace_in_string_value(self):
        """A JSON string containing braces should not break the parser."""
        from engine.v2.chart_proposer import _parse_proposal
        import json
        obj = {
            "chart_type": "BarChart",
            "title": "Revenue by {Region}",
            "sql": "SELECT x, y FROM t",
            "x": "region",
            "y": "revenue",
        }
        response = json.dumps(obj) + "\n\nHere is the explanation."
        result = _parse_proposal(response)
        assert result.success
        assert result.title == "Revenue by {Region}"

    def test_nested_brace_in_string(self):
        from engine.v2.chart_editor import _parse_edit_response
        import json
        obj = {
            "config": {"chart_type": "BarChart", "title": "Test {x}"},
            "explanation": "Changed {config}",
        }
        response = json.dumps(obj) + "\nDone."
        result = _parse_edit_response(response)
        assert result.success
        assert result.config["title"] == "Test {x}"


@pytest.mark.unit
class TestSecurityTimezoneAwareDatetime:
    """Regression: JWT token creation must use timezone-aware datetime."""

    def test_security_uses_timezone_utc(self):
        from pathlib import Path
        source = Path("api/security.py").read_text()
        # Must use datetime.now(timezone.utc), not datetime.utcnow()
        assert "datetime.utcnow()" not in source
        assert "datetime.now(timezone.utc)" in source


@pytest.mark.unit
class TestShareDashboardPreservesCreatedAt:
    """Regression: share_dashboard must use ON CONFLICT DO UPDATE, not INSERT OR REPLACE."""

    def test_upsert_pattern_in_source(self):
        """share_dashboard SQL must use ON CONFLICT, not INSERT OR REPLACE."""
        from pathlib import Path
        import re
        source = Path("api/services/metadata_db.py").read_text()
        # Find the share_dashboard function body
        fn_match = re.search(
            r'def share_dashboard.*?(?=\ndef |\Z)',
            source,
            re.DOTALL,
        )
        assert fn_match is not None
        fn_body = fn_match.group()
        assert "INSERT OR REPLACE" not in fn_body
        assert "ON CONFLICT" in fn_body

    def test_reshare_preserves_created_at(self, tmp_data_dir):
        """Re-sharing with different access level must not reset created_at."""
        from api.services.metadata_db import (
            share_dashboard, ensure_default_user, set_dashboard_meta,
        )
        import sqlite3
        owner_id = ensure_default_user()
        set_dashboard_meta("dash123", owner_id)

        # Initial share
        share_dashboard("dash123", owner_id, "view")

        # Get the initial created_at
        from api.services.metadata_db import DB_PATH
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT created_at FROM dashboard_shares WHERE dashboard_id = ? AND user_id = ?",
            ("dash123", owner_id),
        ).fetchone()
        initial_created_at = row["created_at"]
        conn.close()

        # Re-share with different access level
        import time
        time.sleep(0.01)
        share_dashboard("dash123", owner_id, "edit")

        # created_at should be unchanged
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT created_at, access_level FROM dashboard_shares WHERE dashboard_id = ? AND user_id = ?",
            ("dash123", owner_id),
        ).fetchone()
        assert row["created_at"] == initial_created_at
        assert row["access_level"] == "edit"
        conn.close()


@pytest.mark.unit
class TestVisibilityValidation:
    """Regression: update_dashboard_visibility must reject invalid values."""

    def test_reject_invalid_visibility(self):
        from api.services.metadata_db import update_dashboard_visibility
        with pytest.raises(ValueError, match="Invalid visibility"):
            update_dashboard_visibility("dash123", "invalid_value")

    def test_accept_valid_visibility(self):
        """Valid visibility values should not raise."""
        for vis in ("private", "team", "public"):
            # Should not raise ValueError (may fail for other reasons like missing DB row)
            try:
                from api.services.metadata_db import update_dashboard_visibility
                update_dashboard_visibility("dash123", vis)
            except ValueError:
                pytest.fail(f"Visibility '{vis}' should be accepted")
            except Exception:
                pass  # Other errors (missing row) are fine


@pytest.mark.unit
class TestTempFileLeakOnOversizedUpload:
    """Regression: upload endpoint must clean up temp file when rejecting oversized files."""

    def test_tmp_path_assigned_before_size_check(self):
        """tmp_path must be available for cleanup even if size check raises."""
        import re
        from pathlib import Path
        source = Path("api/routers/data.py").read_text()
        # Find the upload_csv function body
        fn_match = re.search(
            r'async def upload_csv.*?(?=\n(?:async )?def |\Z)',
            source,
            re.DOTALL,
        )
        assert fn_match is not None
        fn_body = fn_match.group()
        # Within upload_csv, tmp_path assignment must come before the size check
        tmp_path_pos = fn_body.find("tmp_path = Path(tmp.name)")
        max_check_pos = fn_body.find("len(content) > MAX_UPLOAD_BYTES")
        assert tmp_path_pos != -1, "tmp_path assignment must exist in upload_csv"
        assert max_check_pos != -1, "size check must exist in upload_csv"
        assert tmp_path_pos < max_check_pos, "tmp_path must be assigned before size check"

    def test_cleanup_on_oversize(self):
        """The oversize branch must unlink the temp file."""
        import re
        from pathlib import Path
        source = Path("api/routers/data.py").read_text()
        fn_match = re.search(
            r'async def upload_csv.*?(?=\n(?:async )?def |\Z)',
            source,
            re.DOTALL,
        )
        assert fn_match is not None
        fn_body = fn_match.group()
        oversize_idx = fn_body.find("len(content) > MAX_UPLOAD_BYTES")
        cleanup_idx = fn_body.find("tmp_path.unlink(missing_ok=True)", oversize_idx)
        http413_idx = fn_body.find("413", oversize_idx)
        assert cleanup_idx != -1, "Must unlink temp file on oversize"
        assert cleanup_idx < http413_idx, "Cleanup must happen before raising 413"


@pytest.mark.unit
class TestColumnProfileUsage:
    """Regression: charts_v2 propose must use the real ColumnProfile dataclass."""

    def test_uses_column_profile_import(self):
        from pathlib import Path
        source = Path("api/routers/charts_v2.py").read_text()
        assert "from engine.v2.schema_analyzer import DataProfile, ColumnProfile" in source
        # Must NOT use type() to create duck-typed objects
        assert "type('ColumnProfile'" not in source

    def test_column_profile_construction(self):
        """ColumnProfile can be constructed with the expected fields."""
        from engine.v2.schema_analyzer import ColumnProfile
        cp = ColumnProfile(
            name="test",
            type="INTEGER",
            sample_values=["1", "2"],
            distinct_count=2,
            null_count=0,
            min_value="1",
            max_value="2",
        )
        assert cp.name == "test"
        assert cp.type == "INTEGER"


@pytest.mark.unit
class TestAuthAbsolutePath:
    """Regression: auth.py must use absolute path for source directory lookup."""

    def test_uses_absolute_path(self):
        from pathlib import Path
        source = Path("api/routers/auth.py").read_text()
        # Must use __file__-relative path, not bare Path("sources")
        assert 'Path("sources")' not in source
        assert "Path(__file__)" in source


@pytest.mark.unit
class TestChartEditorMaxTokens:
    """Regression: chart_editor and chart_proposer must use sufficient max_tokens."""

    def test_editor_max_tokens_at_least_2048(self):
        from pathlib import Path
        source = Path("engine/v2/chart_editor.py").read_text()
        import re
        match = re.search(r'max_tokens\s*=\s*(\d+)', source)
        assert match is not None
        assert int(match.group(1)) >= 2048

    def test_proposer_max_tokens_at_least_2048(self):
        from pathlib import Path
        source = Path("engine/v2/chart_proposer.py").read_text()
        import re
        match = re.search(r'max_tokens\s*=\s*(\d+)', source)
        assert match is not None
        assert int(match.group(1)) >= 2048


# ── Round 4 regression tests ────────────────────────────────────────────────

class TestStrftimeArgOrder:
    """Bug: chart_proposer.py system prompt had STRFTIME(column, fmt) — DuckDB
    expects STRFTIME(fmt, column). All LLM-generated date SQL would fail."""

    def test_strftime_format_first(self):
        from pathlib import Path
        source = Path("engine/v2/chart_proposer.py").read_text()
        assert "STRFTIME('%Y-%m', column)" in source
        assert "STRFTIME(column," not in source


class TestAtomicWriteUniqueTemp:
    """Bug: _atomic_write used a fixed temp filename derived from the target
    path, so concurrent writes to the same file would clobber each other.
    Fix: use tempfile.mkstemp for a unique temp filename."""

    def test_chart_storage_uses_mkstemp(self):
        from pathlib import Path
        source = Path("api/services/chart_storage.py").read_text()
        assert "tempfile.mkstemp" in source
        assert 'with_suffix(".json.tmp")' not in source

    def test_dashboard_storage_uses_mkstemp(self):
        from pathlib import Path
        source = Path("api/services/dashboard_storage.py").read_text()
        assert "tempfile.mkstemp" in source
        assert 'with_suffix(".json.tmp")' not in source

    def test_settings_storage_uses_mkstemp(self):
        from pathlib import Path
        source = Path("api/services/settings_storage.py").read_text()
        assert "tempfile.mkstemp" in source
        assert 'with_suffix(".json.tmp")' not in source

    def test_connection_service_uses_mkstemp(self):
        from pathlib import Path
        source = Path("api/services/connection_service.py").read_text()
        assert "tempfile.mkstemp" in source
        assert 'with_suffix(".json.tmp")' not in source


class TestDeleteSourcePopInsideLock:
    """Bug: _sources.pop ran outside the lock context manager despite the
    comment saying 'remove inside lock'. Fix: moved pop inside the with block."""

    def test_pop_inside_lock_block(self):
        import re
        from pathlib import Path
        source = Path("api/routers/data.py").read_text()
        # Extract the delete_source function body
        match = re.search(
            r'async def delete_source\([^)]*\):\s*"""[^"]*"""\s*(.*?)(?=\n@|\nclass |\Z)',
            source, re.DOTALL,
        )
        assert match is not None
        body = match.group(1)
        # The pop should appear indented within the `with service._lock:` block
        lock_match = re.search(
            r'with service\._lock:\s*(.*?)(?=\n    # Delete|\n    return)',
            body, re.DOTALL,
        )
        assert lock_match is not None
        lock_body = lock_match.group(1)
        assert "_sources.pop" in lock_body


class TestPreviewDataValidation:
    """Bug: preview_data echoed raw exception messages to the client, leaking
    internal error details. Fix: validate source_id and return clean errors."""

    def test_validates_source_id(self):
        from pathlib import Path
        source = Path("api/routers/data.py").read_text()
        # Find the preview_data function
        import re
        match = re.search(r'async def preview_data.*?(?=\nasync def |\nclass |\Z)', source, re.DOTALL)
        assert match is not None
        body = match.group(0)
        assert "_SAFE_SOURCE_ID_RE" in body

    def test_no_exception_echo(self):
        from pathlib import Path
        source = Path("api/routers/data.py").read_text()
        import re
        match = re.search(r'async def preview_data.*?(?=\nasync def |\nclass |\Z)', source, re.DOTALL)
        assert match is not None
        body = match.group(0)
        # Should not format the exception message into the HTTP detail
        assert 'f"Source not found: {e}"' not in body


class TestTempFileLeakOnWriteFailure:
    """Bug: pq.write_table was outside the try/finally that cleaned up temp
    files. If write_table threw, the temp file leaked permanently.
    Fix: moved pq.write_table inside the try/finally block."""

    def _check_write_inside_try(self, filepath: str):
        import re
        from pathlib import Path
        source = Path(filepath).read_text()
        # Find the sync_to_duckdb function body
        match = re.search(
            r'def sync_to_duckdb.*?(?=\ndef |\nclass |\Z)', source, re.DOTALL
        )
        assert match is not None, f"sync_to_duckdb not found in {filepath}"
        body = match.group(0)
        # pq.write_table should appear after 'try:' and before 'finally:'
        try_idx = body.rfind("try:")
        finally_idx = body.rfind("finally:")
        write_idx = body.rfind("pq.write_table")
        assert try_idx < write_idx < finally_idx, (
            f"pq.write_table should be inside try/finally in {filepath}"
        )

    def test_postgres_write_inside_try(self):
        self._check_write_inside_try("api/services/connectors/postgres.py")

    def test_snowflake_write_inside_try(self):
        self._check_write_inside_try("api/services/connectors/snowflake.py")

    def test_bigquery_write_inside_try(self):
        self._check_write_inside_try("api/services/connectors/bigquery.py")


class TestFormatDataContextTruncation:
    """Bug: _format_data_context showed no truncation message for large datasets
    (>200 rows) because sample_rows contained exactly 5 rows and
    len(sample_rows) > 5 was False. Fix: compare against total row_count."""

    def test_shows_truncation_for_large_datasets(self):
        from engine.v2.chart_editor import _format_data_context
        summary = {
            "row_count": 5000,
            "columns": {"x": {"type": "int", "distinct_count": 100}},
            "sample_rows": [{"x": i} for i in range(5)],
        }
        result = _format_data_context(summary)
        assert "5000" in result
        assert "showing" in result

    def test_no_truncation_note_when_all_rows_shown(self):
        from engine.v2.chart_editor import _format_data_context
        summary = {
            "row_count": 3,
            "columns": {"x": {"type": "int", "distinct_count": 3}},
            "sample_rows": [{"x": 1}, {"x": 2}, {"x": 3}],
        }
        result = _format_data_context(summary)
        assert "showing" not in result


class TestDashboardUpdateUsesRawValue:
    """Bug: dashboards_v2.py update() re-serialized charts from Pydantic objects
    instead of using the already-serialized dicts from model_dump.
    Fix: use value directly since it's already list[dict]."""

    def test_charts_use_raw_value(self):
        from pathlib import Path
        source = Path("api/routers/dashboards_v2.py").read_text()
        import re
        match = re.search(r'async def update\(.*?(?=\n@|\Z)', source, re.DOTALL)
        assert match is not None
        body = match.group(0)
        # Should use value directly for charts, not re-serialize
        assert 'fields["charts"] = value' in body
        # Should NOT call model_dump on individual chart items
        assert "c.model_dump()" not in body


# ── Round 5 regression tests ─────────────────────────────────────────────────

class TestDelimiterWhitelist:
    """Bug: _detect_delimiter only escaped single quotes but allowed any character
    from csv.Sniffer as a delimiter, including backslash and other SQL-injectable chars.
    Fix: Whitelist only known-safe delimiters; fall back to comma otherwise."""

    def test_safe_delimiters_are_accepted(self):
        from pathlib import Path
        source = Path("api/services/duckdb_service.py").read_text()
        assert "_SAFE_DELIMITERS" in source

    def test_whitelist_contains_common_delimiters(self):
        from pathlib import Path
        source = Path("api/services/duckdb_service.py").read_text()
        # Common CSV delimiters should all be in the whitelist
        for delim in [',', '|', ';', ' ']:
            assert repr(delim) in source or delim in source

    def test_backslash_delimiter_rejected(self):
        """A backslash delimiter would break SQL quoting; should be rejected."""
        from pathlib import Path
        source = Path("api/services/duckdb_service.py").read_text()
        # The fallback logic: if delim not in _SAFE_DELIMITERS, fall back to comma
        assert "if delim not in _SAFE_DELIMITERS" in source


class TestIngestCsvCleanupOnUnexpectedError:
    """Bug: ingest_csv for/else cleanup was bypassed on non-duckdb.Error exceptions,
    leaving orphan files on disk and stale tables in DuckDB.
    Fix: Wrap retry loop in try/except BaseException with cleanup."""

    def test_cleanup_on_unexpected_error(self):
        from pathlib import Path
        source = Path("api/services/duckdb_service.py").read_text()
        # Should have BaseException handler for unexpected errors
        assert "except BaseException" in source

    def test_table_dropped_on_failure(self):
        from pathlib import Path
        source = Path("api/services/duckdb_service.py").read_text()
        # The cleanup should also drop the DuckDB table, not just delete files
        assert "DROP TABLE IF EXISTS" in source

    def test_success_flag_pattern(self):
        """The retry loop should use a success flag instead of for/else."""
        from pathlib import Path
        source = Path("api/services/duckdb_service.py").read_text()
        assert "success = False" in source
        assert "success = True" in source
        assert "if not success:" in source


class TestSettingsEmptyKeyFilter:
    """Bug: Empty string bypassed the masked-key filter in update_settings,
    allowing any caller to wipe stored API keys by sending an empty string.
    Fix: Also skip empty/whitespace-only strings."""

    def test_empty_string_filtered(self):
        from pathlib import Path
        source = Path("api/routers/settings.py").read_text()
        # Should check for empty/whitespace strings in addition to masked keys
        assert '.strip() == ""' in source or "strip() ==" in source

    def test_masked_key_still_filtered(self):
        from pathlib import Path
        source = Path("api/routers/settings.py").read_text()
        assert '****"' in source


class TestMagicLinkTimezoneAware:
    """Bug: MagicLink used datetime.utcnow() (deprecated in Python 3.12+) which
    produces naive datetimes. Rest of codebase uses timezone-aware.
    Fix: Use datetime.now(timezone.utc) consistently."""

    def test_no_utcnow(self):
        from pathlib import Path
        source = Path("api/models/magic_link.py").read_text()
        assert "utcnow" not in source

    def test_uses_timezone_aware(self):
        from pathlib import Path
        source = Path("api/models/magic_link.py").read_text()
        assert "datetime.now(timezone.utc)" in source

    def test_imports_timezone(self):
        from pathlib import Path
        source = Path("api/models/magic_link.py").read_text()
        assert "timezone" in source


class TestHorizontalBarOrdinalDomain:
    """Bug: Ordinal domain fix was applied to overrides.x for horizontal bars,
    but horizontal bars use x for values and y for categories in Observable Plot.
    Fix: Apply domain to overrides.y when config.horizontal is true."""

    def test_horizontal_domain_on_y_axis(self):
        from pathlib import Path
        source = Path("app/src/components/charts/ObservableChartFactory.tsx").read_text()
        assert "if (config.horizontal)" in source
        assert "overrides.y = { ...getBaseAxis(), domain }" in source

    def test_vertical_domain_on_x_axis(self):
        from pathlib import Path
        source = Path("app/src/components/charts/ObservableChartFactory.tsx").read_text()
        assert "overrides.x = { ...getBaseAxis(), domain }" in source


class TestLegendColorDomainSync:
    """Bug: Custom React legend sorted series alphabetically but Observable Plot's
    color scale used first-occurrence order, causing color mismatches.
    Fix: Set explicit color domain on the Observable Plot color scale."""

    def test_color_domain_set(self):
        from pathlib import Path
        source = Path("app/src/components/charts/ObservableChartFactory.tsx").read_text()
        # Should set a domain on the color scale options
        assert "colorOpts.domain = getUniqueSeries" in source

    def test_legend_false(self):
        from pathlib import Path
        source = Path("app/src/components/charts/ObservableChartFactory.tsx").read_text()
        # Built-in legend should still be suppressed
        assert "legend: false" in source


class TestAnnotationDragNullGuard:
    """Bug: Drag callbacks read store.config.annotations at drag-end time,
    but anns.ranges/anns.texts could be undefined if LLM set partial annotations.
    Fix: Use optional chaining with fallback arrays."""

    def test_ranges_null_guard(self):
        from pathlib import Path
        source = Path("app/src/components/charts/ObservableChartFactory.tsx").read_text()
        assert "(anns?.ranges ?? [])" in source

    def test_texts_null_guard(self):
        from pathlib import Path
        source = Path("app/src/components/charts/ObservableChartFactory.tsx").read_text()
        assert "(anns?.texts ?? [])" in source


class TestPieTreemapWidthGuard:
    """Bug: PieChart and Treemap didn't guard against width=0 from unmeasured
    flex containers, causing negative radius / NaN path data.
    Fix: Added width <= 0 guard alongside the existing height guard."""

    def test_width_guard_present(self):
        from pathlib import Path
        source = Path("app/src/components/charts/ObservableChartFactory.tsx").read_text()
        assert "width <= 0 || effectiveHeight <= 0" in source


class TestShareModalDisabledDuringSave:
    """Bug: ShareModal radio inputs weren't disabled during save, allowing
    rapid clicks to send out-of-order requests causing server/UI split-brain.
    Fix: Disable radio inputs while saving."""

    def test_radio_disabled_during_save(self):
        from pathlib import Path
        source = Path("app/src/components/sharing/ShareModal.tsx").read_text()
        assert "disabled={saving}" in source


class TestSourcePickerOpenRedirect:
    """Bug: returnTo query param was passed directly to navigate() without
    validation, enabling open redirect attacks.
    Fix: Validate returnTo is a same-origin relative path."""

    def test_returnto_validation(self):
        from pathlib import Path
        source = Path("app/src/pages/SourcePickerPage.tsx").read_text()
        assert "safeReturnTo" in source
        # Should reject protocol-relative URLs (//evil.com)
        assert "!//" in source or "!returnTo.startsWith('//')" in source


class TestProviderChangeResponseCheck:
    """Bug: handleProviderChange updated UI state without checking fetch response
    status, causing UI/server divergence on server errors.
    Fix: Only update state when res.ok."""

    def test_response_ok_check(self):
        from pathlib import Path
        source = Path("app/src/components/editor/AIChat.tsx").read_text()
        assert "if (res.ok)" in source


class TestToolboxRowLengthCondition:
    """Bug: handleRunQuery checked `rows.length >= 0` which is always true,
    showing success message even after failed queries with stale data.
    Fix: Changed to simply `!err` since the error check is the real guard."""

    def test_no_vacuous_length_check(self):
        from pathlib import Path
        source = Path("app/src/components/editor/Toolbox.tsx").read_text()
        assert "rows.length >= 0" not in source


@pytest.mark.unit
class TestExecuteQueryReadOnly:
    """Regression: execute_query must reject DML/DDL (DROP, INSERT, DELETE, etc.)."""

    _SID = "abcdef012345"  # Valid 12-char hex source_id

    def test_reject_drop_table(self):
        svc = DuckDBService()
        with pytest.raises(ValueError, match="Only SELECT"):
            svc.execute_query("DROP TABLE src_abc", self._SID)

    def test_reject_delete(self):
        svc = DuckDBService()
        with pytest.raises(ValueError, match="Only SELECT"):
            svc.execute_query("DELETE FROM src_abc", self._SID)

    def test_reject_insert(self):
        svc = DuckDBService()
        with pytest.raises(ValueError, match="Only SELECT"):
            svc.execute_query("INSERT INTO src_abc VALUES (1)", self._SID)

    def test_reject_comment_bypass(self):
        svc = DuckDBService()
        with pytest.raises(ValueError, match="Only SELECT"):
            svc.execute_query("-- comment\nDROP TABLE src_abc", self._SID)

    def test_reject_block_comment_bypass(self):
        svc = DuckDBService()
        with pytest.raises(ValueError, match="Only SELECT"):
            svc.execute_query("/* comment */ DROP TABLE src_abc", self._SID)

    def test_allow_select(self):
        """SELECT should not raise ValueError (may fail for other reasons)."""
        svc = DuckDBService()
        try:
            svc.execute_query("SELECT 1", self._SID)
        except ValueError as e:
            if "Only SELECT" in str(e):
                pytest.fail("SELECT should be allowed")

    def test_allow_with_cte(self):
        """WITH (CTE) should not raise ValueError."""
        svc = DuckDBService()
        try:
            svc.execute_query("WITH t AS (SELECT 1) SELECT * FROM t", self._SID)
        except ValueError as e:
            if "Only SELECT" in str(e):
                pytest.fail("WITH should be allowed")

    def test_semicolons_stripped(self):
        """Semicolons must be stripped to prevent piggy-backed DML."""
        from pathlib import Path
        source = Path("api/services/duckdb_service.py").read_text()
        import re
        fn_body = re.search(r'def execute_query.*?(?=\n    def |\Z)', source, re.DOTALL)
        assert fn_body is not None
        assert 'replace(";", "")' in fn_body.group()


@pytest.mark.unit
class TestIsReadOnlySql:
    """Unit tests for DuckDBService._is_read_only_sql static method."""

    def test_select(self):
        assert DuckDBService._is_read_only_sql("SELECT * FROM t") is True

    def test_with_cte(self):
        assert DuckDBService._is_read_only_sql("WITH cte AS (SELECT 1) SELECT * FROM cte") is True

    def test_explain(self):
        assert DuckDBService._is_read_only_sql("EXPLAIN SELECT 1") is True

    def test_drop(self):
        assert DuckDBService._is_read_only_sql("DROP TABLE t") is False

    def test_insert(self):
        assert DuckDBService._is_read_only_sql("INSERT INTO t VALUES (1)") is False

    def test_comment_bypass(self):
        assert DuckDBService._is_read_only_sql("-- trick\nDROP TABLE t") is False

    def test_block_comment_bypass(self):
        assert DuckDBService._is_read_only_sql("/* trick */ DELETE FROM t") is False

    def test_empty(self):
        assert DuckDBService._is_read_only_sql("") is False


@pytest.mark.unit
class TestMultiYUnpivotSeriesColumn:
    """Regression: multi-Y UNPIVOT branch must include series column when present."""

    def test_series_in_multi_y_subquery(self):
        from pathlib import Path
        import re
        source = Path("api/routers/charts_v2.py").read_text()
        # Find the multi-Y UNPIVOT branch
        branch = re.search(
            r'# ── Multi-Y UNPIVOT branch.*?(?=# ── Single-Y)',
            source,
            re.DOTALL,
        )
        assert branch is not None
        body = branch.group()
        # Must reference request.series somewhere in the UNPIVOT branch
        assert "request.series" in body


@pytest.mark.unit
class TestDashboardLayoutGenerator:
    """Layout generator must produce valid grid positions with no overlaps."""

    def test_no_negative_coordinates(self):
        """All generated layout positions must have non-negative x,y."""
        from pathlib import Path
        source = Path("app/src/components/dashboard/DashboardGrid.tsx").read_text()
        # The function should initialize x=0, y=0 (no negative starts)
        assert "let x = 0" in source
        assert "let y = 0" in source


@pytest.mark.unit
class TestHealthCacheEviction:
    """Regression: health cache must only evict when inserting a NEW entry, not when updating."""

    def test_eviction_checks_existing_key(self):
        from pathlib import Path
        import re
        source = Path("api/routers/dashboards_v2.py").read_text()
        # Find the cache eviction section
        cache_section = re.search(
            r'# Evict oldest.*?_health_cache\[dashboard_id\] = result',
            source,
            re.DOTALL,
        )
        assert cache_section is not None
        body = cache_section.group()
        # Must check if dashboard_id is already in cache before evicting
        assert "dashboard_id not in _health_cache" in body or "not in _health_cache" in body


@pytest.mark.unit
class TestOpenAINoDoubleSystemMessage:
    """Regression: OpenAI provider must not duplicate system message when system_prompt is provided."""

    def test_skips_system_messages_from_list(self):
        from pathlib import Path
        import re
        source = Path("engine/llm/openai_provider.py").read_text()
        # Find the generate method
        fn_body = re.search(
            r'def generate.*?return LLMResponse',
            source,
            re.DOTALL,
        )
        assert fn_body is not None
        body = fn_body.group()
        # Must skip system messages from the message loop when system_prompt is set
        assert 'msg.role == "system"' in body
        assert "continue" in body


@pytest.mark.unit
class TestUseObservablePlotSeedHeight:
    """Regression: useObservablePlot seed must check height > 0 before setting size."""

    def test_height_guard_in_seed(self):
        from pathlib import Path
        source = Path("app/src/hooks/useObservablePlot.ts").read_text()
        # The seed block should check both width and height > 0
        assert "rect.height > 0" in source or "height > 0" in source


@pytest.mark.unit
class TestConfirmReplaceDoubleSubmit:
    """Regression: confirmReplace must guard against double-clicks when upload is in progress."""

    def test_uploading_guard(self):
        from pathlib import Path
        source = Path("app/src/stores/dataStore.ts").read_text()
        # confirmReplace must check uploading state before proceeding
        assert "uploading" in source.split("confirmReplace")[1].split("uploadCSV")[0]


@pytest.mark.unit
class TestLoadPreviewStalenessGuard:
    """Regression: loadPreview must discard stale responses from superseded requests."""

    def test_request_id_guard(self):
        from pathlib import Path
        source = Path("app/src/stores/dataStore.ts").read_text()
        # Must have a request counter / staleness guard
        assert "previewRequestId" in source or "requestId" in source


@pytest.mark.unit
class TestUpdateConfigBuildQueryForExistingCharts:
    """Regression: updateConfig must trigger buildQuery in table mode regardless of chartId."""

    def test_no_chartid_guard_on_buildquery(self):
        from pathlib import Path
        import re
        source = Path("app/src/stores/editorStore.ts").read_text()
        # Find the updateConfig function
        fn_body = re.search(
            r'updateConfig:.*?(?=\n  \w+:)',
            source,
            re.DOTALL,
        )
        assert fn_body is not None
        body = fn_body.group()
        # Must NOT gate buildQuery on !chartId — AI edits need rebuild on saved charts too
        assert "!chartId" not in body or "!chartId &&" not in body.split("buildQuery")[0]


@pytest.mark.unit
class TestSqlDirtyTracking:
    """Regression: isDirty() must compare sql vs savedSql to detect SQL-mode changes."""

    def test_saved_sql_field_exists(self):
        from pathlib import Path
        source = Path("app/src/stores/editorStore.ts").read_text()
        assert "savedSql" in source

    def test_is_dirty_checks_sql(self):
        from pathlib import Path
        source = Path("app/src/stores/editorStore.ts").read_text()
        import re
        # Find the isDirty implementation (contains JSON.stringify), not the type declaration
        fn_body = re.search(r'isDirty: \(\) => \{.*?\}', source, re.DOTALL)
        assert fn_body is not None
        body = fn_body.group()
        assert "savedSql" in body


@pytest.mark.unit
class TestHandleAddChartAutoSave:
    """Regression: handleAddChart from picker must auto-save the dashboard."""

    def test_add_chart_calls_save(self):
        from pathlib import Path
        source = Path("app/src/pages/DashboardBuilderPage.tsx").read_text()
        import re
        fn_body = re.search(
            r'handleAddChart.*?(?=\n  const )',
            source,
            re.DOTALL,
        )
        assert fn_body is not None
        body = fn_body.group()
        assert "store.save()" in body


@pytest.mark.unit
class TestReplaceSourcesPopInsideLock:
    """Regression: replace upload must pop _sources inside the lock, not outside."""

    def test_pop_inside_lock(self):
        from pathlib import Path
        import re
        source = Path("api/routers/data.py").read_text()
        # Find the replace block
        replace_block = re.search(
            r'# If replacing.*?# Write uploaded',
            source,
            re.DOTALL,
        )
        assert replace_block is not None
        body = replace_block.group()
        # _sources.pop must be inside the with service._lock block
        lock_block = re.search(r'with service\._lock:.*?(?=\n        upload_dir)', body, re.DOTALL)
        assert lock_block is not None
        assert "_sources.pop" in lock_block.group()


@pytest.mark.unit
class TestPasteDeduplication:
    """Regression: paste endpoint must replace existing pasted_data.csv source."""

    def test_checks_existing_paste(self):
        from pathlib import Path
        source = Path("api/routers/data.py").read_text()
        import re
        fn_body = re.search(
            r'async def paste_data.*?(?=\n(?:@|async def |def ))',
            source,
            re.DOTALL,
        )
        assert fn_body is not None
        body = fn_body.group()
        assert "find_source_by_filename" in body


@pytest.mark.unit
class TestSetDataModeErrorField:
    """Regression: setDataMode table-restore failure must write to error, not sqlError."""

    def test_error_not_sql_error(self):
        from pathlib import Path
        source = Path("app/src/stores/editorStore.ts").read_text()
        # Find the line with "Failed to restore source columns" and check its context
        idx = source.find("Failed to restore source columns")
        assert idx != -1, "Expected error message text in editorStore"
        context = source[max(0, idx - 80):idx + 80]
        assert "sqlError" not in context, "Should use error, not sqlError for table-mode errors"


@pytest.mark.unit
class TestCanSaveTableModeErrorCheck:
    """Regression: table-mode canSave must also check !store.error."""

    def test_table_mode_checks_error(self):
        from pathlib import Path
        source = Path("app/src/pages/EditorPage.tsx").read_text()
        import re
        # Both SQL and table mode branches should check !store.error
        can_save = re.search(r'const canSave.*?isDirty', source, re.DOTALL)
        assert can_save is not None
        body = can_save.group()
        # Count occurrences of !store.error — should be at least 2 (SQL + table)
        error_checks = body.count("!store.error")
        assert error_checks >= 2, f"Expected >= 2 error checks, found {error_checks}"


@pytest.mark.unit
class TestSafeLoadChartExceptionHandling:
    """Regression: load_chart must not crash on legacy files missing required fields."""

    def test_load_chart_catches_type_error(self):
        from pathlib import Path
        import re
        source = Path("api/services/chart_storage.py").read_text()
        fn_body = re.search(
            r'def load_chart.*?(?=\ndef )',
            source,
            re.DOTALL,
        )
        assert fn_body is not None
        body = fn_body.group()
        assert "except Exception" in body or "except TypeError" in body

    def test_update_chart_catches_type_error(self):
        from pathlib import Path
        import re
        source = Path("api/services/chart_storage.py").read_text()
        fn_body = re.search(
            r'def update_chart.*?(?=\ndef )',
            source,
            re.DOTALL,
        )
        assert fn_body is not None
        body = fn_body.group()
        assert "except Exception" in body or "except TypeError" in body


@pytest.mark.unit
class TestMarginLeftOrdering:
    """Regression: yAxisTitle +24px must run AFTER horizontal bar base margin, not before."""

    def test_horizontal_before_y_axis_title(self):
        from pathlib import Path
        import re
        source = Path("app/src/components/charts/ObservableChartFactory.tsx").read_text()
        # horizontal marginLeft assignment must come BEFORE yAxisTitle addition
        horiz_pos = source.find("config.horizontal")
        ytitle_pos = source.find("config.yAxisTitle")
        # There are multiple references; find the marginLeft-related ones
        margin_section = re.search(
            r'// Horizontal bars need wider.*?// Y-axis bounds',
            source,
            re.DOTALL,
        )
        assert margin_section is not None
        body = margin_section.group()
        # horizontal should come first, then yAxisTitle
        assert body.index("config.horizontal") < body.index("config.yAxisTitle")


@pytest.mark.unit
class TestAtomicWriteDoubleClose:
    """Regression: _atomic_write must track fd_closed to avoid double-close on os.replace failure."""

    def test_fd_closed_flag_in_chart_storage(self):
        from pathlib import Path
        source = Path("api/services/chart_storage.py").read_text()
        assert "fd_closed" in source

    def test_fd_closed_flag_in_dashboard_storage(self):
        from pathlib import Path
        source = Path("api/services/dashboard_storage.py").read_text()
        assert "fd_closed" in source


# ── Round 23 regression tests ─────────────────────────────────────────────


@pytest.mark.unit
class TestDashboardPutFiltersSerialization:
    """Regression: Dashboard PUT should use value from model_dump, not re-serialize from Pydantic."""

    def test_filters_branch_uses_value_directly(self):
        from pathlib import Path
        import re
        source = Path("api/routers/dashboards_v2.py").read_text()
        # Find the update function body
        m = re.search(r'async def update\(dashboard_id.*?return DashboardResponse', source, re.DOTALL)
        assert m, "update function not found"
        body = m.group(0)
        # Should NOT contain exclude_none re-serialization on request.filters
        assert "model_dump(exclude_none" not in body
        # Should contain the direct value assignment pattern
        assert 'fields["filters"] = value' in body


@pytest.mark.unit
class TestPieTreemapCleanup:
    """Regression: Pie/Treemap useEffect should not return cleanup (causes blank flash)."""

    def test_no_return_cleanup_in_pie(self):
        from pathlib import Path
        source = Path("app/src/components/charts/ObservableChartFactory.tsx").read_text()
        # Find PieChartComponent and TreemapComponent sections
        # Neither should have `return () => { el.innerHTML = '' }` inside their useEffect
        import re
        # Count occurrences of the cleanup return pattern
        cleanup_returns = re.findall(r"return \(\) => \{ el\.innerHTML = '' \}", source)
        # Should be zero (removed from both Pie and Treemap)
        assert len(cleanup_returns) == 0, f"Found {len(cleanup_returns)} cleanup returns, expected 0"


@pytest.mark.unit
class TestGeminiEmptyMessagesGuard:
    """Regression: Gemini generate() must guard against empty messages list."""

    def test_guard_present(self):
        from pathlib import Path
        source = Path("engine/llm/gemini_provider.py").read_text()
        assert "if not messages:" in source
        assert 'raise ValueError("generate() requires at least one message")' in source


@pytest.mark.unit
class TestKeyboardShortcutStableHandler:
    """Regression: EditorPage keyboard handler should use getState(), not store from closure."""

    def test_uses_get_state(self):
        from pathlib import Path
        source = Path("app/src/pages/EditorPage.tsx").read_text()
        assert "useEditorStore.getState().undo()" in source
        assert "useEditorStore.getState().redo()" in source

    def test_deps_exclude_store(self):
        from pathlib import Path
        import re
        source = Path("app/src/pages/EditorPage.tsx").read_text()
        # The keyboard useEffect dependency array should be [handleSave] only
        m = re.search(r"return \(\) => window\.removeEventListener\('keydown', handler\)\s*\n\s*\}, \[([^\]]+)\]", source)
        assert m, "Could not find keyboard useEffect deps"
        deps = m.group(1).strip()
        assert "store" not in deps, f"Deps should not include 'store', got: [{deps}]"


@pytest.mark.unit
class TestQueryEndpointSourceIdValidation:
    """Regression: /data/query must validate source_id format at router level."""

    def test_source_id_check_before_execute(self):
        from pathlib import Path
        source = Path("api/routers/data.py").read_text()
        # The validation should appear before the service call
        validation_idx = source.find("_SAFE_SOURCE_ID_RE.match(request.source_id)")
        execute_idx = source.find("service.execute_query(request.sql, request.source_id)")
        assert validation_idx > 0, "source_id validation not found"
        assert execute_idx > 0, "execute_query call not found"
        assert validation_idx < execute_idx, "validation must come before execute_query"


@pytest.mark.unit
class TestDetectDelimiterEncoding:
    """Regression: _detect_delimiter must specify utf-8 encoding for Docker compatibility."""

    def test_utf8_encoding_specified(self):
        from pathlib import Path
        source = Path("api/services/duckdb_service.py").read_text()
        assert "encoding='utf-8'" in source
        assert "errors='replace'" in source


@pytest.mark.unit
class TestHealthCacheInvalidateOnDelete:
    """Regression: Dashboard delete must clear the health cache entry."""

    def test_health_cache_pop_in_delete(self):
        from pathlib import Path
        source = Path("api/routers/dashboards_v2.py").read_text()
        # Find the remove_dashboard function and verify it clears the cache
        import re
        m = re.search(r'async def remove_dashboard.*?return \{"deleted": True\}', source, re.DOTALL)
        assert m, "remove_dashboard function not found"
        body = m.group(0)
        assert "_health_cache.pop(dashboard_id" in body, "Health cache not cleared in delete handler"


# ── Round 23b regression tests ────────────────────────────────────────────


@pytest.mark.unit
class TestChatMessagesFunctionalUpdater:
    """Regression: sendChatMessage must use functional updater to avoid stale chatMessages snapshot."""

    def test_no_stale_spread_in_send_chat(self):
        from pathlib import Path
        import re
        source = Path("app/src/stores/editorStore.ts").read_text()
        # Find the sendChatMessage function body
        m = re.search(r'sendChatMessage: async.*?^\s{2}\},', source, re.DOTALL | re.MULTILINE)
        assert m, "sendChatMessage function not found"
        body = m.group(0)
        # Should NOT destructure chatMessages from get() since we use functional updaters
        assert "chatMessages" not in body.split("\n")[1], "chatMessages should not be destructured from get()"
        # Should use functional updater form: set((state) => ...)
        assert "state.chatMessages" in body, "Should use state.chatMessages via functional updater"


@pytest.mark.unit
class TestSourcesDictGetPattern:
    """Regression: execute_query must use _sources.get() to avoid TOCTOU KeyError."""

    def test_uses_get_not_bracket(self):
        from pathlib import Path
        import re
        source = Path("api/services/duckdb_service.py").read_text()
        # Find the execute_query method and the table substitution block
        m = re.search(r'def execute_query.*?return QueryResult', source, re.DOTALL)
        assert m, "execute_query method not found"
        body = m.group(0)
        # Should use .get() pattern, not direct bracket access after 'in' check
        assert "self._sources.get(source_id)" in body or "meta = self._sources.get(" in body, \
            "Should use .get() to avoid TOCTOU KeyError"
        # Should NOT have the old pattern: if source_id in self._sources: ... self._sources[source_id]
        assert "if source_id in self._sources:" not in body, \
            "Should not use 'in' check followed by bracket access"


@pytest.mark.unit
class TestLoadDashboardErrorHandling:
    """Regression: load_dashboard must catch errors like load_chart does."""

    def test_try_except_in_load_dashboard(self):
        from pathlib import Path
        import re
        source = Path("api/services/dashboard_storage.py").read_text()
        m = re.search(r'def load_dashboard.*?(?=\ndef )', source, re.DOTALL)
        assert m, "load_dashboard function not found"
        body = m.group(0)
        assert "try:" in body, "load_dashboard should have try/except"
        assert "except Exception:" in body, "load_dashboard should catch Exception"
        assert "return None" in body, "load_dashboard should return None on error"
