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
class QueryReferenceMismatch:
    """A mismatch between a component reference and defined queries."""

    referenced_name: str
    component_type: str
    defined_queries: list[str]
    suggestion: str | None = None


@dataclass
class ValidationReport:
    """Complete validation report for a dashboard."""

    valid: bool
    results: list[SQLValidationResult]
    error_count: int
    reference_mismatches: list[QueryReferenceMismatch] | None = None

    @property
    def errors(self) -> list[SQLValidationResult]:
        """Get only the failed validations."""
        return [r for r in self.results if not r.valid]

    @property
    def has_reference_errors(self) -> bool:
        """Check if there are query reference mismatches."""
        return bool(self.reference_mismatches)

    def format_errors(self) -> str:
        """Format errors for display or LLM consumption."""
        lines = []

        if self.errors:
            lines.append(f"Found {self.error_count} SQL error(s):\n")
            for i, err in enumerate(self.errors, 1):
                lines.append(f"{i}. Query '{err.query_name}':")
                lines.append(f"   Error: {err.error}")
                lines.append(f"   SQL: {err.query[:200]}..." if len(err.query) > 200 else f"   SQL: {err.query}")
                lines.append("")

        if self.reference_mismatches:
            lines.append(f"Found {len(self.reference_mismatches)} query reference error(s):\n")
            for i, mismatch in enumerate(self.reference_mismatches, 1):
                lines.append(f"{i}. Component <{mismatch.component_type}> references '{mismatch.referenced_name}' but this query is not defined.")
                lines.append(f"   Defined queries: {', '.join(mismatch.defined_queries)}")
                if mismatch.suggestion:
                    lines.append(f"   Suggestion: Use '{mismatch.suggestion}' instead")
                lines.append("")

        if not lines:
            return "All queries valid."

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

        # Replace Evidence template variables with placeholder values for validation
        # ${inputs.filter_name} -> 'placeholder'
        # ${inputs.date_range.start} -> '2024-01-01'
        # ${inputs.date_range.end} -> '2024-12-31'
        test_query = self._replace_template_variables(query)

        try:
            # Use EXPLAIN to validate without actually running the full query
            # This catches syntax and reference errors without processing all data
            result = conn.execute(f"EXPLAIN {test_query}")

            # If EXPLAIN works, also do a quick LIMIT 1 to catch runtime errors
            result = conn.execute(f"SELECT * FROM ({test_query}) AS subq LIMIT 1")
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

    def _replace_template_variables(self, query: str) -> str:
        """
        Replace Evidence template variables with placeholder values for validation.

        Handles various template syntaxes:
        - '${inputs.filter_name}' -> 'placeholder'
        - '${inputs.date_range.start}' -> '2024-01-01'
        - ${inputs.filter_name.column}' -> 'placeholder' or 0
        - ${inputs.numeric_filter} -> 0
        - Also handles $'${...}' patterns (where LLM adds extra $)
        """
        # First, clean up any erroneous $' patterns (LLM sometimes adds $ before quotes)
        # $'${inputs...}' -> '${inputs...}'
        query = re.sub(r"\$'", "'", query)

        # Replace quoted date range start/end patterns first (most specific)
        # '${inputs.date_range.start}' -> '2024-01-01'
        query = re.sub(r"'\$\{inputs\.\w+\.start\}'", "'2024-01-01'", query)
        query = re.sub(r"'\$\{inputs\.\w+\.end\}'", "'2024-12-31'", query)

        # Replace unquoted date range patterns (add quotes)
        # ${inputs.date_range.start} -> '2024-01-01'
        query = re.sub(r"\$\{inputs\.\w+\.start\}", "'2024-01-01'", query)
        query = re.sub(r"\$\{inputs\.\w+\.end\}", "'2024-12-31'", query)

        # Replace dropdown column access patterns (filter_name.column_name)
        # ${inputs.year_filter.year} -> 2024
        query = re.sub(r"\$\{inputs\.\w+\.year\}", "2024", query)
        # ${inputs.filter_name.column} -> 'placeholder' for non-year columns
        query = re.sub(r"'\$\{inputs\.\w+\.\w+\}'", "'placeholder'", query)
        query = re.sub(r"\$\{inputs\.\w+\.\w+\}", "'placeholder'", query)

        # Replace quoted string filter patterns
        # '${inputs.filter_name}' -> 'placeholder'
        query = re.sub(r"'\$\{inputs\.\w+\}'", "'placeholder'", query)

        # Replace unquoted filter patterns (might be numeric)
        # ${inputs.filter_name} -> 0
        query = re.sub(r"\$\{inputs\.\w+\}", "0", query)

        return query

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

    def extract_data_references(self, markdown: str) -> list[tuple[str, str]]:
        """
        Extract data references from Evidence components.

        Args:
            markdown: The dashboard markdown content

        Returns:
            List of (component_type, referenced_query_name) tuples
        """
        references = []

        # Pattern to match data={query_name} in components
        # e.g., <BarChart data={monthly_revenue} ...>
        # Also handles data={query_name.column} for column references
        component_pattern = r"<(\w+)[^>]*\bdata=\{(\w+)(?:\.\w+)?\}[^>]*>"
        matches = re.findall(component_pattern, markdown, re.IGNORECASE)

        for component_type, query_name in matches:
            references.append((component_type, query_name))

        return references

    def validate_references(self, markdown: str) -> list[QueryReferenceMismatch]:
        """
        Validate that all data references in components match defined queries.

        Args:
            markdown: The dashboard markdown content

        Returns:
            List of QueryReferenceMismatch for any undefined references
        """
        # Get defined query names
        queries = self.extract_queries_from_markdown(markdown)
        defined_names = {name for name, _ in queries}

        # Get data references
        references = self.extract_data_references(markdown)

        mismatches = []
        seen = set()  # Avoid duplicate errors for same reference

        for component_type, referenced_name in references:
            if referenced_name not in defined_names and referenced_name not in seen:
                seen.add(referenced_name)

                # Try to suggest a similar query name
                suggestion = self._find_similar_query(referenced_name, defined_names)

                mismatches.append(QueryReferenceMismatch(
                    referenced_name=referenced_name,
                    component_type=component_type,
                    defined_queries=list(defined_names),
                    suggestion=suggestion,
                ))

        return mismatches

    def _find_similar_query(self, target: str, candidates: set[str]) -> str | None:
        """Find a similar query name from candidates."""
        target_lower = target.lower()

        # First try exact substring match
        for candidate in candidates:
            if target_lower in candidate.lower() or candidate.lower() in target_lower:
                return candidate

        # Try common word overlap
        target_words = set(target_lower.replace('_', ' ').split())
        best_match = None
        best_overlap = 0

        for candidate in candidates:
            candidate_words = set(candidate.lower().replace('_', ' ').split())
            overlap = len(target_words & candidate_words)
            if overlap > best_overlap:
                best_overlap = overlap
                best_match = candidate

        return best_match if best_overlap > 0 else None

    def validate_markdown(self, markdown: str) -> ValidationReport:
        """
        Validate all SQL queries in a dashboard markdown file.

        This validates:
        1. SQL syntax and execution against DuckDB
        2. Query name references (components must reference defined queries)

        Args:
            markdown: The dashboard markdown content

        Returns:
            ValidationReport with all results
        """
        queries = self.extract_queries_from_markdown(markdown)

        if not queries:
            # Still check for reference mismatches (component referencing non-existent query)
            reference_mismatches = self.validate_references(markdown)
            return ValidationReport(
                valid=len(reference_mismatches) == 0,
                results=[],
                error_count=0,
                reference_mismatches=reference_mismatches if reference_mismatches else None,
            )

        results = []
        for query_name, query_sql in queries:
            result = self.validate_query(query_sql, query_name)
            results.append(result)

        error_count = sum(1 for r in results if not r.valid)

        # Also validate that component references match query names
        reference_mismatches = self.validate_references(markdown)

        # Dashboard is only valid if SQL is valid AND references are valid
        is_valid = error_count == 0 and len(reference_mismatches) == 0

        return ValidationReport(
            valid=is_valid,
            results=results,
            error_count=error_count,
            reference_mismatches=reference_mismatches if reference_mismatches else None,
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
