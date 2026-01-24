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
from .llm.claude import get_fast_provider, get_provider
from .models import Chart, ChartConfig, ChartSpec, ChartType, FilterSpec, FilterType, ValidatedChart
from .schema import get_schema_context
from .sql_validator import validate_query
from .config_loader import get_config_loader
from .validators import ChartSpecValidator
from .validators.sql_fixer import SQLFixer


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
        # Use fast model (Haiku) for structured JSON extraction
        self.llm = get_fast_provider(provider_name)
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

        # Parse interactive filters
        interactive_filters = []
        for f_data in data.get("interactive_filters", []):
            filter_spec = FilterSpec(
                name=f_data.get("name", "filter"),
                filter_type=FilterType.from_string(f_data.get("filter_type", "Dropdown")),
                title=f_data.get("title"),
                options_column=f_data.get("column"),
                options_table=f_data.get("table"),
                date_column=f_data.get("column"),  # For DateRangePicker
                default_value=f_data.get("default_value"),  # For DateRange preset
            )
            interactive_filters.append(filter_spec)

        return ChartSpec(
            title=data.get("title", "Chart"),
            description=data.get("description", ""),
            original_request=original_request,
            metric=data.get("metric", "value"),
            aggregation=data.get("aggregation"),
            dimension=data.get("dimension"),
            filters=data.get("filters", []),
            interactive_filters=interactive_filters,
            chart_type=ChartType.from_string(data.get("chart_type", "BarChart")),
            horizontal=data.get("horizontal", False),
            relevant_tables=data.get("relevant_tables", []),
        )


class ChartSQLAgent:
    """Generates and validates ONE SQL query for a chart."""

    def __init__(self, provider_name: str | None = None, max_fix_attempts: int = 3):
        # Use Sonnet for SQL generation - Haiku has JSON formatting issues with complex SQL
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
    ) -> tuple[str, str, list[str], list[dict], str | None]:
        """
        Generate and validate SQL queries for a chart.

        Args:
            spec: The chart specification
            schema_context: The database schema context

        Returns:
            Tuple of (query_name, sql, columns, filter_queries, error_or_none)
            filter_queries is a list of dicts with {name, filter_name, sql} for filter options
        """
        system_prompt = self._build_system_prompt(schema_context)

        request = f"""Generate SQL queries for this chart:

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

        query_name, sql, columns, filter_queries = self._parse_response(response.content)

        # Validate the main query
        # Note: We can't fully validate queries with ${inputs...} syntax,
        # so we do a basic syntax check
        result = validate_query(sql, query_name)

        if result.valid:
            return query_name, sql, columns, filter_queries, None

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

            query_name, sql, columns, filter_queries = self._parse_response(response.content)
            result = validate_query(sql, query_name)

            if result.valid:
                return query_name, sql, columns, filter_queries, None

            attempt += 1

        return query_name, sql, columns, filter_queries, result.error

    def _parse_response(self, response: str) -> tuple[str, str, list[str], list[dict]]:
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
            # Try to repair common JSON issues
            data = self._try_repair_json(json_str)
            if data is None:
                return "query", "", [], []

        return (
            data.get("query_name", "query"),
            data.get("sql", ""),
            data.get("columns", []),
            data.get("filter_queries", []),
        )

    def _try_repair_json(self, json_str: str) -> dict | None:
        """Try to repair common JSON formatting issues."""
        # Fix 1: Handle backslash-continuation that some LLMs use for multi-line SQL
        # Pattern: "sql": "SELECT \ \n   col" -> "sql": "SELECT col"
        # This is invalid JSON but common in LLM output
        try:
            # Remove backslash followed by whitespace (line continuation)
            fixed = re.sub(r'\\\s+', ' ', json_str)
            return json.loads(fixed)
        except (json.JSONDecodeError, Exception):
            pass

        # Fix 2: Try fixing unescaped newlines in strings
        # This is a common issue when SQL has newlines that weren't escaped
        try:
            # Replace literal newlines inside strings with escaped newlines
            # Find the "sql" field and fix newlines within it
            fixed = re.sub(
                r'"sql"\s*:\s*"(.*?)"(?=\s*[,}])',
                lambda m: '"sql": "' + m.group(1).replace('\n', '\\n').replace('\r', '\\r') + '"',
                json_str,
                flags=re.DOTALL
            )
            return json.loads(fixed)
        except (json.JSONDecodeError, Exception):
            pass

        # Fix 3: Try extracting just the SQL from a partially valid response
        try:
            sql_match = re.search(r'"sql"\s*:\s*"((?:[^"\\]|\\.)*)"|"sql"\s*:\s*`(.*?)`', json_str, re.DOTALL)
            name_match = re.search(r'"query_name"\s*:\s*"([^"]*)"', json_str)
            cols_match = re.search(r'"columns"\s*:\s*\[(.*?)\]', json_str)

            if sql_match:
                sql = sql_match.group(1) or sql_match.group(2) or ""
                # Clean up the SQL: remove backslash continuations and unescape
                sql = re.sub(r'\\\s+', ' ', sql)
                sql = sql.replace('\\n', '\n')
                name = name_match.group(1) if name_match else "query"
                cols = []
                if cols_match:
                    cols = [c.strip().strip('"\'') for c in cols_match.group(1).split(',') if c.strip()]
                return {
                    "query_name": name,
                    "sql": sql,
                    "columns": cols,
                    "filter_queries": []
                }
        except Exception:
            pass

        print("[ChartSQLAgent] Could not repair JSON")
        return None


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

            # Stage 1b: Validate and correct spec
            spec = ChartSpecValidator.validate_spec(spec)

            if self.config.verbose:
                print(f"[ChartPipeline]   Title: {spec.title}")
                print(f"[ChartPipeline]   Type: {spec.chart_type.value}")
                print(f"[ChartPipeline]   Metric: {spec.metric}")
                if spec.horizontal:
                    print(f"[ChartPipeline]   Horizontal: True")
        except Exception as e:
            return ChartPipelineResult(
                success=False,
                error=f"Requirements extraction failed: {e}",
            )

        # Stage 2: Generate and validate SQL
        if self.config.verbose:
            print("[ChartPipeline] Stage 2: Generating SQL query...")

        try:
            query_name, sql, columns, filter_queries, error = self.sql_agent.generate_query(spec, schema)

            if error:
                return ChartPipelineResult(
                    success=False,
                    spec=spec,
                    error=f"SQL validation failed: {error}",
                )

            if self.config.verbose:
                print(f"[ChartPipeline]   Query: {query_name}")
                print(f"[ChartPipeline]   Columns: {columns}")
                if filter_queries:
                    print(f"[ChartPipeline]   Filter queries: {len(filter_queries)}")
        except Exception as e:
            return ChartPipelineResult(
                success=False,
                spec=spec,
                error=f"SQL generation failed: {e}",
            )

        # Stage 2b: Fix SQL filter quoting
        # This catches cases where LLMs (especially non-Claude) forget to quote string values
        if spec.interactive_filters:
            original_sql = sql
            sql = SQLFixer.fix_filter_quoting(sql, spec.interactive_filters)
            if sql != original_sql and self.config.verbose:
                print("[ChartPipeline]   Fixed filter quoting in SQL")

        # Stage 3: Assemble chart
        if self.config.verbose:
            print("[ChartPipeline] Stage 3: Assembling chart...")

        # Determine chart config based on type and columns
        config = self._build_chart_config(spec, columns)

        # Stage 3b: Analyze scales and use dual y-axis if needed
        # Only for chart types that support dual y-axis (not DataTable, BigValue)
        y_columns = columns[1:] if len(columns) >= 2 else []
        chart_supports_dual_axis = spec.chart_type not in (ChartType.DATA_TABLE, ChartType.BIG_VALUE)
        if chart_supports_dual_axis and len(y_columns) == 2 and config.y2 is None:
            # Only analyze if we have 2 metrics and didn't already set y2
            scale_analysis = ChartSpecValidator.analyze_scales(sql, columns)
            if scale_analysis and scale_analysis.needs_dual_axis:
                if self.config.verbose:
                    print(f"[ChartPipeline]   Scale analysis: {scale_analysis.scale_ratio:.1f}x ratio, using dual y-axis")
                config.y = scale_analysis.primary_column
                config.y2 = scale_analysis.secondary_column

        # Build filter specs with generated queries
        filters = self._build_filters(spec, filter_queries)

        # Stage 4b: Validate filter defaults
        filters = ChartSpecValidator.validate_filters(filters)

        validated_chart = ValidatedChart(
            spec=spec,
            query_name=query_name,
            sql=sql,
            columns=columns,
            config=config,
            filters=filters,
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
        config_loader = get_config_loader()

        # Get design system defaults
        chart_defaults = config_loader.get_chart_defaults()
        base_options = config_loader.get_base_echarts_options()

        # Set up based on chart type
        if spec.chart_type == ChartType.BIG_VALUE:
            # BigValue: just needs the value column
            if columns:
                config.value = columns[-1]  # Usually the aggregated value is last
            config.title = spec.title

        elif spec.chart_type in (ChartType.LINE_CHART, ChartType.AREA_CHART):
            # Time series: x is date/time, y is metric(s)
            if len(columns) >= 2:
                config.x = columns[0]  # Date column
                y_columns = columns[1:]

                # Detect if any column is a categorical "series" column (for multi-line charts)
                # Keywords that indicate a grouping/category column, not a metric
                series_keywords = ["type", "category", "segment", "group", "status", "event", "name", "label"]
                series_col = None
                metric_cols = []

                for col in y_columns:
                    col_lower = col.lower()
                    if any(kw in col_lower for kw in series_keywords):
                        series_col = col
                    else:
                        metric_cols.append(col)

                # If we found a series column, use it for grouping
                if series_col and metric_cols:
                    config.series = series_col
                    config.y = metric_cols[0] if len(metric_cols) == 1 else metric_cols
                # Check if we should use dual y-axis (for metrics with different scales)
                # Use y2 when we have exactly 2 metrics and one has "count" or "volume" in name
                # while the other has "revenue", "amount", or "value" (different scales)
                elif len(y_columns) == 2:
                    col_names = [c.lower() for c in y_columns]
                    count_keywords = ["count", "volume", "number", "quantity"]
                    value_keywords = ["revenue", "amount", "value", "total", "sum"]

                    has_count = any(kw in col_names[0] or kw in col_names[1] for kw in count_keywords)
                    has_value = any(kw in col_names[0] or kw in col_names[1] for kw in value_keywords)

                    if has_count and has_value:
                        # Use dual y-axis: put the count metric on y2
                        if any(kw in col_names[0] for kw in count_keywords):
                            config.y = y_columns[1]  # value metric on primary
                            config.y2 = y_columns[0]  # count metric on secondary
                        else:
                            config.y = y_columns[0]  # value metric on primary
                            config.y2 = y_columns[1]  # count metric on secondary
                    else:
                        # Same scale, use both on primary y-axis
                        config.y = y_columns
                else:
                    config.y = y_columns if len(y_columns) > 1 else y_columns[0]
            config.title = spec.title

            # Apply design system defaults for line charts
            line_defaults = config_loader.get_chart_type_defaults("line")
            # Determine number of series for multi-line charts
            num_series = len(config.y) if isinstance(config.y, list) else 1
            config.extra_props = {
                "fillColor": "#6366f1",  # Indigo primary
                "chartAreaHeight": 350,  # Match design system standard height
                "echartsOptions": self._build_echarts_options(base_options, line_defaults, num_series),
            }

        elif spec.chart_type == ChartType.BAR_CHART:
            # Category comparison: x is category, y is metric(s)
            if len(columns) >= 2:
                config.x = columns[0]
                # Use all remaining columns as Y-axis values for grouped bar charts
                y_columns = columns[1:]
                config.y = y_columns if len(y_columns) > 1 else y_columns[0]
            config.title = spec.title

            # Check if horizontal bar chart was requested
            config.horizontal = spec.horizontal

            # Apply design system defaults for bar charts
            bar_type = "bar_horizontal" if spec.horizontal else "bar_vertical"
            bar_defaults = config_loader.get_chart_type_defaults(bar_type)
            # Determine number of series for grouped bar charts
            num_series = len(config.y) if isinstance(config.y, list) else 1
            config.extra_props = {
                "fillColor": "#6366f1",  # Indigo primary
                "chartAreaHeight": 350,  # Match design system standard height
                "echartsOptions": self._build_echarts_options(base_options, bar_defaults, num_series),
            }

        elif spec.chart_type == ChartType.DATA_TABLE:
            # DataTable: no specific config needed
            config.title = spec.title

        else:
            # Default: assume x/y from columns
            if len(columns) >= 2:
                config.x = columns[0]
                # Use all remaining columns as Y-axis values
                y_columns = columns[1:]
                config.y = y_columns if len(y_columns) > 1 else y_columns[0]
            config.title = spec.title
            config.extra_props = {
                "fillColor": "#6366f1",  # Indigo primary
            }

        return config

    def _build_echarts_options(self, base_options: dict, type_defaults: dict, num_series: int = 1) -> dict:
        """Build echartsOptions by merging base options with type-specific defaults.

        Args:
            base_options: Base grid/axis options from design system
            type_defaults: Chart-type-specific styling (line, bar, etc.)
            num_series: Number of data series (y-columns) to style
        """
        options = {}
        config_loader = get_config_loader()

        # Apply base grid and axis options
        if "grid" in base_options:
            options["grid"] = base_options["grid"]
        if "xAxis" in base_options:
            options["xAxis"] = base_options["xAxis"]
        if "yAxis" in base_options:
            options["yAxis"] = base_options["yAxis"]

        # Apply type-specific series options
        if type_defaults:
            # Get color palette for multi-series charts
            use_extended = num_series > 3
            series_palette = config_loader.get_series_palette(extended=use_extended)

            # Build series options for each data series
            series_list = []
            for i in range(num_series):
                series_options = {}

                # Get color for this series (cycle through palette if needed)
                series_color = series_palette[i % len(series_palette)] if series_palette else "#6366f1"

                # Line/area chart styling
                if "smooth" in type_defaults:
                    series_options["smooth"] = type_defaults["smooth"]
                if "symbolSize" in type_defaults:
                    series_options["symbolSize"] = type_defaults["symbolSize"]
                if "lineStyle" in type_defaults:
                    # Deep copy and override color for this series
                    line_style = dict(type_defaults["lineStyle"])
                    line_style["color"] = series_color
                    series_options["lineStyle"] = line_style
                if "itemStyle" in type_defaults:
                    # Deep copy and override color for this series
                    item_style = dict(type_defaults["itemStyle"])
                    item_style["color"] = series_color
                    series_options["itemStyle"] = item_style
                if "areaStyle" in type_defaults:
                    series_options["areaStyle"] = type_defaults["areaStyle"]
                if "emphasis" in type_defaults:
                    series_options["emphasis"] = type_defaults["emphasis"]

                # Bar chart styling
                if "barWidth" in type_defaults:
                    series_options["barWidth"] = type_defaults["barWidth"]

                if series_options:
                    series_list.append(series_options)

            if series_list:
                options["series"] = series_list

        return options

    def _build_filters(self, spec: ChartSpec, filter_queries: list[dict]) -> list[FilterSpec]:
        """Build filter specs from the spec's interactive_filters and generated queries."""
        filters = []

        # Create lookup for filter queries by filter_name
        query_lookup = {fq.get("filter_name"): fq for fq in filter_queries}

        for f in spec.interactive_filters:
            # Copy the filter spec
            filter_spec = FilterSpec(
                name=f.name,
                filter_type=f.filter_type,
                title=f.title,
                options_column=f.options_column,
                options_table=f.options_table,
                date_column=f.date_column,
                default_start=f.default_start,
                default_end=f.default_end,
                min_value=f.min_value,
                max_value=f.max_value,
                step=f.step,
                default_value=f.default_value,
            )

            # Add generated query info if available
            if f.name in query_lookup:
                query_info = query_lookup[f.name]
                filter_spec.options_query = query_info.get("sql")
                filter_spec.options_query_name = query_info.get("name")
                # Use the value_column from the SQL agent if provided
                # This is the column alias that should be used in the Dropdown
                if query_info.get("value_column"):
                    filter_spec.options_column = query_info.get("value_column")

            filters.append(filter_spec)

        return filters


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
