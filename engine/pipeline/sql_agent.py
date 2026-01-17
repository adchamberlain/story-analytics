"""
SQL Agent - Generates and validates DuckDB SQL queries.

This agent focuses ONLY on writing correct SQL for DuckDB.
It receives structured requirements and outputs validated queries.
"""

import json
import re
from pathlib import Path

import yaml

from ..llm.base import Message
from ..llm.claude import get_provider
from ..sql_validator import validate_query
from .models import DashboardSpec, QuerySpec, ValidatedQueries


class SQLAgent:
    """Generates and validates SQL queries for dashboards."""

    def __init__(self, provider_name: str | None = None, max_fix_attempts: int = 3):
        self.llm = get_provider(provider_name)
        self.max_fix_attempts = max_fix_attempts
        self._prompt_config = self._load_prompt_config()
        self._dialect_config = self._load_dialect_config()

    def _load_prompt_config(self) -> dict:
        """Load the SQL agent prompt configuration."""
        prompt_path = Path(__file__).parent.parent / "prompts" / "pipeline" / "sql.yaml"
        with open(prompt_path) as f:
            return yaml.safe_load(f)

    def _load_dialect_config(self) -> dict:
        """Load the dialect configuration for the default source."""
        dialect_path = Path(__file__).parent.parent.parent / "sources" / "snowflake_saas" / "dialect.yaml"
        if dialect_path.exists():
            with open(dialect_path) as f:
                return yaml.safe_load(f)
        return {}

    def _build_system_prompt(self, schema_context: str) -> str:
        """Build the system prompt for this agent."""
        config = self._prompt_config

        parts = [
            config.get("role", ""),
            "",
            config.get("critical_rules", ""),
            "",
            "DATABASE SCHEMA:",
            schema_context,
            "",
            config.get("instructions", ""),
            "",
            config.get("output_format", ""),
        ]

        return "\n".join(parts)

    def generate_queries(
        self,
        spec: DashboardSpec,
        schema_context: str,
    ) -> ValidatedQueries:
        """
        Generate and validate SQL queries for a dashboard specification.

        Args:
            spec: The structured dashboard specification
            schema_context: The database schema context

        Returns:
            ValidatedQueries with all queries tested against DuckDB
        """
        system_prompt = self._build_system_prompt(schema_context)

        # Build the request message
        request = f"""Generate SQL queries for this dashboard specification:

{spec.to_prompt_context()}

Original user request: {spec.original_request}
"""

        messages = [Message(role="user", content=request)]

        # Generate initial queries
        response = self.llm.generate(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.2,
            max_tokens=4096,
        )

        queries = self._parse_response(response.content)

        # Validate each query
        validated = self._validate_queries(queries)

        # If there are errors, attempt to fix them
        attempt = 1
        while not validated.all_valid and attempt < self.max_fix_attempts:
            print(f"[SQLAgent] Validation failed, attempt {attempt + 1}/{self.max_fix_attempts}")

            # Build fix request
            fix_request = self._build_fix_request(validated)
            messages.append(Message(role="assistant", content=response.content))
            messages.append(Message(role="user", content=fix_request))

            response = self.llm.generate(
                messages=messages,
                system_prompt=system_prompt,
                temperature=0.1,  # Lower temperature for fixes
                max_tokens=4096,
            )

            queries = self._parse_response(response.content)
            validated = self._validate_queries(queries)
            attempt += 1

        validated.validation_attempts = attempt
        return validated

    def _parse_response(self, response: str) -> list[QuerySpec]:
        """Parse the LLM response into QuerySpec objects."""
        # Extract JSON from response
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        if json_match:
            json_str = json_match.group(1).strip()
        else:
            json_str = response.strip()

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"[SQLAgent] JSON parse error: {e}")
            return []

        queries = []
        for q in data.get("queries", []):
            queries.append(QuerySpec(
                name=q.get("name", "query"),
                purpose=q.get("purpose", ""),
                sql=q.get("sql", ""),
                columns=q.get("columns", []),
            ))

        return queries

    def _validate_queries(self, queries: list[QuerySpec]) -> ValidatedQueries:
        """Validate all queries against DuckDB."""
        all_valid = True

        for query in queries:
            result = validate_query(query.sql, query.name)

            if result.valid:
                query.validation_status = "valid"
                query.validation_error = None
            else:
                query.validation_status = "invalid"
                query.validation_error = result.error
                all_valid = False
                print(f"[SQLAgent] Query '{query.name}' failed: {result.error[:100]}...")

        return ValidatedQueries(
            queries=queries,
            all_valid=all_valid,
        )

    def _build_fix_request(self, validated: ValidatedQueries) -> str:
        """Build a request to fix invalid queries."""
        lines = [
            "Some queries have errors that must be fixed:",
            "",
        ]

        for query in validated.queries:
            if query.validation_status == "invalid":
                lines.append(f"Query '{query.name}':")
                lines.append(f"  Error: {query.validation_error}")
                lines.append(f"  SQL: {query.sql[:200]}...")
                lines.append("")

        lines.extend([
            "REMINDER - Common DuckDB issues:",
            "- DATEADD() does not exist - use: date + INTERVAL '1 month'",
            "- DATEDIFF() syntax is different - use: DATE_DIFF('day', date1, date2)",
            "- TO_CHAR() does not exist - use: STRFTIME(date, '%Y-%m')",
            "- NVL() does not exist - use: COALESCE(column, default)",
            "- IFF() does not exist - use: CASE WHEN ... THEN ... ELSE ... END",
            "",
            "Please regenerate ALL queries with the errors fixed.",
            "Output the complete JSON with all queries, not just the fixed ones.",
        ])

        return "\n".join(lines)
