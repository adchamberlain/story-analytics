"""
SQL validation module.

Tests SQL queries against DuckDB before writing dashboards to catch errors early.
Evidence uses DuckDB locally, so we validate against the same engine.
"""

import re
from dataclasses import dataclass
from pathlib import Path

import duckdb


@dataclass
class SQLValidationResult:
    """Result of validating a single SQL query."""

    query_name: str
    query: str
    valid: bool
    error: str | None = None
    row_count: int | None = None


@dataclass
class ValidationReport:
    """Complete validation report for a dashboard."""

    valid: bool
    results: list[SQLValidationResult]
    error_count: int

    @property
    def errors(self) -> list[SQLValidationResult]:
        """Get only the failed validations."""
        return [r for r in self.results if not r.valid]

    def format_errors(self) -> str:
        """Format errors for display or LLM consumption."""
        if not self.errors:
            return "All queries valid."

        lines = [f"Found {self.error_count} SQL error(s):\n"]
        for i, err in enumerate(self.errors, 1):
            lines.append(f"{i}. Query '{err.query_name}':")
            lines.append(f"   Error: {err.error}")
            lines.append(f"   SQL: {err.query[:200]}..." if len(err.query) > 200 else f"   SQL: {err.query}")
            lines.append("")
        return "\n".join(lines)


class SQLValidator:
    """Validates SQL queries against Evidence's DuckDB data."""

    def __init__(self, evidence_data_dir: Path | None = None):
        """
        Initialize the validator.

        Args:
            evidence_data_dir: Path to Evidence's static data directory.
                              Defaults to .evidence/template/static/data/
        """
        if evidence_data_dir is None:
            # Find the evidence data directory relative to project root
            project_root = Path(__file__).parent.parent
            evidence_data_dir = project_root / ".evidence" / "template" / "static" / "data"

        self.evidence_data_dir = evidence_data_dir
        self._connection: duckdb.DuckDBPyConnection | None = None

    def _get_connection(self) -> duckdb.DuckDBPyConnection:
        """Get or create a DuckDB connection with Evidence data loaded."""
        if self._connection is None:
            self._connection = duckdb.connect(":memory:")
            self._load_evidence_data()
        return self._connection

    def _load_evidence_data(self):
        """Load all Evidence parquet files as views in DuckDB."""
        conn = self._connection

        if not self.evidence_data_dir.exists():
            raise FileNotFoundError(
                f"Evidence data directory not found: {self.evidence_data_dir}. "
                "Run 'npm run sources' to generate data."
            )

        # Find all source directories
        for source_dir in self.evidence_data_dir.iterdir():
            if not source_dir.is_dir():
                continue

            source_name = source_dir.name

            # Find all table directories within the source
            for table_dir in source_dir.iterdir():
                if not table_dir.is_dir():
                    continue

                table_name = table_dir.name

                # Find parquet file
                parquet_files = list(table_dir.glob("*.parquet"))
                if not parquet_files:
                    continue

                parquet_path = parquet_files[0]

                # Create a view with the Evidence naming convention: source.table
                view_name = f"{source_name}.{table_name}"
                try:
                    conn.execute(f"""
                        CREATE SCHEMA IF NOT EXISTS {source_name}
                    """)
                    conn.execute(f"""
                        CREATE VIEW {view_name} AS
                        SELECT * FROM read_parquet('{parquet_path}')
                    """)
                except Exception as e:
                    # Log but continue - some files might have issues
                    print(f"Warning: Could not load {view_name}: {e}")

    def validate_query(self, query: str, query_name: str = "query") -> SQLValidationResult:
        """
        Validate a single SQL query.

        Args:
            query: The SQL query to validate
            query_name: A name for the query (for error reporting)

        Returns:
            SQLValidationResult with validation status
        """
        conn = self._get_connection()

        # Strip trailing semicolons - they cause issues when wrapping in subqueries
        query = query.strip().rstrip(';').strip()

        try:
            # Use EXPLAIN to validate without actually running the full query
            # This catches syntax and reference errors without processing all data
            result = conn.execute(f"EXPLAIN {query}")

            # If EXPLAIN works, also do a quick LIMIT 1 to catch runtime errors
            result = conn.execute(f"SELECT * FROM ({query}) AS subq LIMIT 1")
            row_count = len(result.fetchall())

            return SQLValidationResult(
                query_name=query_name,
                query=query,
                valid=True,
                row_count=row_count,
            )
        except duckdb.Error as e:
            return SQLValidationResult(
                query_name=query_name,
                query=query,
                valid=False,
                error=str(e),
            )
        except Exception as e:
            return SQLValidationResult(
                query_name=query_name,
                query=query,
                valid=False,
                error=f"Unexpected error: {e}",
            )

    def extract_queries_from_markdown(self, markdown: str) -> list[tuple[str, str]]:
        """
        Extract SQL queries from Evidence markdown.

        Args:
            markdown: The dashboard markdown content

        Returns:
            List of (query_name, query_sql) tuples
        """
        queries = []

        # Pattern to match Evidence SQL code blocks
        # ```sql query_name
        # SELECT ...
        # ```
        pattern = r"```sql\s+(\w+)\s*\n(.*?)```"
        matches = re.findall(pattern, markdown, re.DOTALL | re.IGNORECASE)

        for query_name, query_sql in matches:
            # Clean up the query
            query_sql = query_sql.strip()
            if query_sql:
                queries.append((query_name, query_sql))

        return queries

    def validate_markdown(self, markdown: str) -> ValidationReport:
        """
        Validate all SQL queries in a dashboard markdown file.

        Args:
            markdown: The dashboard markdown content

        Returns:
            ValidationReport with all results
        """
        queries = self.extract_queries_from_markdown(markdown)

        if not queries:
            return ValidationReport(valid=True, results=[], error_count=0)

        results = []
        for query_name, query_sql in queries:
            result = self.validate_query(query_sql, query_name)
            results.append(result)

        error_count = sum(1 for r in results if not r.valid)

        return ValidationReport(
            valid=error_count == 0,
            results=results,
            error_count=error_count,
        )

    def close(self):
        """Close the DuckDB connection."""
        if self._connection:
            self._connection.close()
            self._connection = None


# Module-level convenience functions
_validator: SQLValidator | None = None


def get_validator() -> SQLValidator:
    """Get or create the global SQL validator."""
    global _validator
    if _validator is None:
        _validator = SQLValidator()
    return _validator


def validate_dashboard_sql(markdown: str) -> ValidationReport:
    """Validate all SQL in a dashboard markdown."""
    return get_validator().validate_markdown(markdown)


def validate_query(query: str, query_name: str = "query") -> SQLValidationResult:
    """Validate a single SQL query."""
    return get_validator().validate_query(query, query_name)
