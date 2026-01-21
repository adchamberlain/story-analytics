"""
Chart Generation Pipeline - Generates a single chart.

This is a simplified version of the dashboard pipeline that focuses
on creating one chart at a time. Much more reliable because:
1. Only ONE chart spec to extract
2. Only ONE SQL query to generate
3. Layout is trivial (just the query + component)

Pipeline stages:
1. ChartRequirementsAgent - Extract what chart the user wants
2. ChartSQLAgent - Generate and validate ONE DuckDB query
3. Chart assembly - Trivial: just combine query + component
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import yaml

from .llm.base import Message
from .llm.claude import get_provider
from .models import Chart, ChartConfig, ChartSpec, ChartType, ValidatedChart
from .schema import get_schema_context
from .sql_validator import validate_query


@dataclass
class ChartPipelineConfig:
    """Configuration for the chart pipeline."""

    provider_name: str | None = None
    max_sql_fix_attempts: int = 3
    verbose: bool = True


@dataclass
class ChartPipelineResult:
    """Result from the chart generation pipeline."""

    success: bool
    chart: ValidatedChart | None = None
    error: str | None = None

    # For debugging
    spec: ChartSpec | None = None
    raw_sql_response: str | None = None


class ChartRequirementsAgent:
    """Extracts requirements for a single chart."""

    def __init__(self, provider_name: str | None = None):
        self.llm = get_provider(provider_name)
        self._prompt_config = self._load_prompt_config()

    def _load_prompt_config(self) -> dict:
        """Load the chart requirements prompt configuration."""
        prompt_path = Path(__file__).parent / "prompts" / "chart" / "requirements.yaml"
        with open(prompt_path) as f:
            return yaml.safe_load(f)

    def _build_system_prompt(self, schema_context: str) -> str:
        """Build the system prompt for this agent."""
        config = self._prompt_config

        parts = [
            config.get("role", ""),
            "",
            "DATABASE SCHEMA:",
            schema_context,
            "",
            config.get("instructions", ""),
            "",
            config.get("output_format", ""),
        ]

        return "\n".join(parts)

    def extract_spec(self, user_request: str, schema_context: str) -> ChartSpec:
        """
        Extract a chart specification from a user request.

        Args:
            user_request: The user's natural language request
            schema_context: The database schema context

        Returns:
            A structured ChartSpec
        """
        system_prompt = self._build_system_prompt(schema_context)

        messages = [
            Message(
                role="user",
                content=f"Create a chart specification for this request:\n\n{user_request}",
            )
        ]

        response = self.llm.generate(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.3,
            max_tokens=1024,
        )

        return self._parse_response(response.content, user_request)

    def _parse_response(self, response: str, original_request: str) -> ChartSpec:
        """Parse the LLM response into a ChartSpec."""
        # Extract JSON from response
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        if json_match:
            json_str = json_match.group(1).strip()
        else:
            json_str = response.strip()

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"[ChartRequirementsAgent] JSON parse error: {e}")
            # Return a minimal spec
            return ChartSpec(
                title="Chart",
                description="",
                original_request=original_request,
                metric="value",
            )

        return ChartSpec(
            title=data.get("title", "Chart"),
            description=data.get("description", ""),
            original_request=original_request,
            metric=data.get("metric", "value"),
            aggregation=data.get("aggregation"),
            dimension=data.get("dimension"),
            filters=data.get("filters", []),
            chart_type=ChartType.from_string(data.get("chart_type", "BarChart")),
            relevant_tables=data.get("relevant_tables", []),
        )


class ChartSQLAgent:
    """Generates and validates ONE SQL query for a chart."""

    def __init__(self, provider_name: str | None = None, max_fix_attempts: int = 3):
        self.llm = get_provider(provider_name)
        self.max_fix_attempts = max_fix_attempts
        self._prompt_config = self._load_prompt_config()

    def _load_prompt_config(self) -> dict:
        """Load the chart SQL prompt configuration."""
        prompt_path = Path(__file__).parent / "prompts" / "chart" / "sql.yaml"
        with open(prompt_path) as f:
            return yaml.safe_load(f)

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

    def generate_query(
        self, spec: ChartSpec, schema_context: str
    ) -> tuple[str, str, list[str], str | None]:
        """
        Generate and validate ONE SQL query for a chart.

        Args:
            spec: The chart specification
            schema_context: The database schema context

        Returns:
            Tuple of (query_name, sql, columns, error_or_none)
        """
        system_prompt = self._build_system_prompt(schema_context)

        request = f"""Generate ONE SQL query for this chart:

{spec.to_prompt_context()}
"""

        messages = [Message(role="user", content=request)]

        # Generate initial query
        response = self.llm.generate(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.2,
            max_tokens=2048,
        )

        query_name, sql, columns = self._parse_response(response.content)

        # Validate the query
        result = validate_query(sql, query_name)

        if result.valid:
            return query_name, sql, columns, None

        # Try to fix the query
        attempt = 1
        while attempt < self.max_fix_attempts:
            print(f"[ChartSQLAgent] Validation failed, attempt {attempt + 1}/{self.max_fix_attempts}")

            fix_request = f"""The query has an error that must be fixed:

Query: {query_name}
Error: {result.error}
SQL: {sql}

REMINDER - Common DuckDB issues:
- DATEADD() does not exist - use: date + INTERVAL '1 month'
- DATEDIFF() syntax is different - use: DATE_DIFF('day', date1, date2)
- TO_CHAR() does not exist - use: STRFTIME(date, '%Y-%m')
- NVL() does not exist - use: COALESCE(column, default)
- IFF() does not exist - use: CASE WHEN ... THEN ... ELSE ... END

Please fix the query and output the corrected JSON."""

            messages.append(Message(role="assistant", content=response.content))
            messages.append(Message(role="user", content=fix_request))

            response = self.llm.generate(
                messages=messages,
                system_prompt=system_prompt,
                temperature=0.1,
                max_tokens=2048,
            )

            query_name, sql, columns = self._parse_response(response.content)
            result = validate_query(sql, query_name)

            if result.valid:
                return query_name, sql, columns, None

            attempt += 1

        return query_name, sql, columns, result.error

    def _parse_response(self, response: str) -> tuple[str, str, list[str]]:
        """Parse the LLM response into query components."""
        # Extract JSON from response
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        if json_match:
            json_str = json_match.group(1).strip()
        else:
            json_str = response.strip()

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"[ChartSQLAgent] JSON parse error: {e}")
            return "query", "", []

        return (
            data.get("query_name", "query"),
            data.get("sql", ""),
            data.get("columns", []),
        )


class ChartPipeline:
    """
    Pipeline for generating a single chart.

    Much simpler than the dashboard pipeline:
    1. Extract what chart the user wants
    2. Generate and validate ONE SQL query
    3. Assemble the chart (trivial)
    """

    def __init__(self, config: ChartPipelineConfig | None = None):
        self.config = config or ChartPipelineConfig()
        self._schema_context: str | None = None

        # Initialize agents
        self.requirements_agent = ChartRequirementsAgent(self.config.provider_name)
        self.sql_agent = ChartSQLAgent(
            self.config.provider_name,
            max_fix_attempts=self.config.max_sql_fix_attempts,
        )

    def get_schema_context(self) -> str:
        """Get cached schema context."""
        if self._schema_context is None:
            self._schema_context = get_schema_context()
        return self._schema_context

    def run(self, user_request: str) -> ChartPipelineResult:
        """
        Run the chart generation pipeline.

        Args:
            user_request: The user's natural language request

        Returns:
            ChartPipelineResult with the generated chart or error
        """
        schema = self.get_schema_context()

        # Stage 1: Extract requirements
        if self.config.verbose:
            print("[ChartPipeline] Stage 1: Extracting chart requirements...")

        try:
            spec = self.requirements_agent.extract_spec(user_request, schema)
            if self.config.verbose:
                print(f"[ChartPipeline]   Title: {spec.title}")
                print(f"[ChartPipeline]   Type: {spec.chart_type.value}")
                print(f"[ChartPipeline]   Metric: {spec.metric}")
        except Exception as e:
            return ChartPipelineResult(
                success=False,
                error=f"Requirements extraction failed: {e}",
            )

        # Stage 2: Generate and validate SQL
        if self.config.verbose:
            print("[ChartPipeline] Stage 2: Generating SQL query...")

        try:
            query_name, sql, columns, error = self.sql_agent.generate_query(spec, schema)

            if error:
                return ChartPipelineResult(
                    success=False,
                    spec=spec,
                    error=f"SQL validation failed: {error}",
                )

            if self.config.verbose:
                print(f"[ChartPipeline]   Query: {query_name}")
                print(f"[ChartPipeline]   Columns: {columns}")
        except Exception as e:
            return ChartPipelineResult(
                success=False,
                spec=spec,
                error=f"SQL generation failed: {e}",
            )

        # Stage 3: Assemble chart (trivial)
        if self.config.verbose:
            print("[ChartPipeline] Stage 3: Assembling chart...")

        # Determine chart config based on type and columns
        config = self._build_chart_config(spec, columns)

        validated_chart = ValidatedChart(
            spec=spec,
            query_name=query_name,
            sql=sql,
            columns=columns,
            config=config,
            validation_status="valid",
        )

        if self.config.verbose:
            print("[ChartPipeline] Complete!")

        return ChartPipelineResult(
            success=True,
            chart=validated_chart,
            spec=spec,
        )

    def _build_chart_config(self, spec: ChartSpec, columns: list[str]) -> ChartConfig:
        """Build chart configuration based on spec and columns."""
        config = ChartConfig()

        # Set up based on chart type
        if spec.chart_type == ChartType.BIG_VALUE:
            # BigValue: just needs the value column
            if columns:
                config.value = columns[-1]  # Usually the aggregated value is last
            config.title = spec.title

        elif spec.chart_type in (ChartType.LINE_CHART, ChartType.AREA_CHART):
            # Time series: x is date/time, y is metric
            if len(columns) >= 2:
                config.x = columns[0]  # Date column
                config.y = columns[1]  # Metric column
            config.title = spec.title
            # Apply design system defaults
            config.extra_props = {
                "fillColor": "#6366f1",  # Indigo
                "smooth": 0.3,
            }

        elif spec.chart_type == ChartType.BAR_CHART:
            # Category comparison: x is category, y is metric
            if len(columns) >= 2:
                config.x = columns[0]
                config.y = columns[1]
            config.title = spec.title
            # Apply design system defaults
            config.extra_props = {
                "fillColor": "#6366f1",  # Indigo
            }

        elif spec.chart_type == ChartType.DATA_TABLE:
            # DataTable: no specific config needed
            config.title = spec.title

        else:
            # Default: assume x/y from first two columns
            if len(columns) >= 2:
                config.x = columns[0]
                config.y = columns[1]
            config.title = spec.title

        return config


def create_chart(user_request: str, provider_name: str | None = None) -> ChartPipelineResult:
    """
    Convenience function to create a chart from a user request.

    Args:
        user_request: Natural language description of the chart
        provider_name: Optional LLM provider name

    Returns:
        ChartPipelineResult with the generated chart or error
    """
    pipeline = ChartPipeline(ChartPipelineConfig(provider_name=provider_name))
    return pipeline.run(user_request)
