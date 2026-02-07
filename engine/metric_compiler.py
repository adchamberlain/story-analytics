"""
Metric Compiler — Compiles semantic layer YAML definitions into DuckDB SQL.

Reads dbt-style metric definitions (simple, derived, ratio, cumulative) from
YAML files and produces executable SQL queries. This replaces LLM-generated
SQL for known metrics, giving deterministic and validated query generation.

Architecture:
    Semantic Layer YAML → ModelRegistry → MetricCompiler → DuckDB SQL
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


# =============================================================================
# Data classes for the semantic layer
# =============================================================================


@dataclass
class Measure:
    """A measure defined on a semantic model (e.g., SUM(price))."""

    name: str
    agg: str  # sum, count, count_distinct, average, median
    expr: str  # column or SQL expression
    description: str = ""
    label: str = ""


@dataclass
class Dimension:
    """A dimension defined on a semantic model."""

    name: str
    type: str  # categorical, time
    description: str = ""
    expr: str | None = None  # optional SQL expression override
    type_params: dict = field(default_factory=dict)


@dataclass
class Entity:
    """An entity (join key) on a semantic model."""

    name: str
    type: str  # primary, foreign
    expr: str | None = None


@dataclass
class SemanticModel:
    """A semantic model — represents a table/view with typed columns."""

    name: str
    description: str
    model_ref: str  # e.g., "ref('fct_order_items')"
    default_time_dimension: str | None = None
    measures: dict[str, Measure] = field(default_factory=dict)
    dimensions: dict[str, Dimension] = field(default_factory=dict)
    entities: dict[str, Entity] = field(default_factory=dict)


@dataclass
class MetricDef:
    """A metric definition from _metrics.yml."""

    name: str
    label: str
    description: str
    type: str  # simple, derived, ratio, cumulative
    type_params: dict
    filter: str | None = None


@dataclass
class SavedQueryDef:
    """A saved query definition from _saved_queries.yml."""

    name: str
    label: str
    description: str
    metrics: list[str]
    group_by: list[str]  # raw strings like "TimeDimension('metric_time', 'month')"


@dataclass
class CompiledQuery:
    """The output of compiling a metric or saved query."""

    sql: str
    metric_names: list[str]
    columns: list[str]
    source_model: str | None = None


# =============================================================================
# Model Registry — loads and indexes the semantic layer
# =============================================================================


class ModelRegistry:
    """
    Loads semantic layer YAML and provides lookups for measures, dimensions,
    and metrics by name.
    """

    def __init__(self):
        self.models: dict[str, SemanticModel] = {}
        self.metrics: dict[str, MetricDef] = {}
        self.saved_queries: dict[str, SavedQueryDef] = {}

        # Indexes built during load
        self._measure_to_model: dict[str, str] = {}  # measure_name -> model_name
        self._table_map: dict[str, str] = {}  # ref name -> actual table

    def load_from_directory(self, semantic_dir: Path) -> None:
        """Load all YAML files from a semantic layer directory."""
        models_dir = semantic_dir / "models" / "marts"
        if not models_dir.exists():
            raise FileNotFoundError(f"Semantic layer directory not found: {models_dir}")

        models_file = models_dir / "_semantic_models.yml"
        metrics_file = models_dir / "_metrics.yml"
        saved_queries_file = models_dir / "_saved_queries.yml"

        if models_file.exists():
            self._load_models(models_file)
        if metrics_file.exists():
            self._load_metrics(metrics_file)
        if saved_queries_file.exists():
            self._load_saved_queries(saved_queries_file)

    def set_table_map(self, table_map: dict[str, str]) -> None:
        """
        Set the mapping from model ref names to actual DuckDB table names.

        Example:
            {"fct_order_items": "olist_ecommerce.order_items",
             "fct_orders": "olist_ecommerce.orders"}
        """
        self._table_map = table_map

    def resolve_table(self, model_ref: str) -> str:
        """
        Resolve a model reference like "ref('fct_order_items')" to a table name.

        Falls back to extracting the name from the ref() call if no mapping exists.
        """
        # Extract name from ref('xxx')
        ref_name = model_ref
        if "ref(" in model_ref:
            ref_name = model_ref.split("'")[1] if "'" in model_ref else model_ref

        if ref_name in self._table_map:
            return self._table_map[ref_name]

        # Fallback: use the ref name directly
        return ref_name

    def get_model_for_measure(self, measure_name: str) -> SemanticModel | None:
        """Find which semantic model contains a given measure."""
        model_name = self._measure_to_model.get(measure_name)
        if model_name:
            return self.models.get(model_name)
        return None

    def get_measure(self, measure_name: str) -> Measure | None:
        """Get a measure by name."""
        model = self.get_model_for_measure(measure_name)
        if model:
            return model.measures.get(measure_name)
        return None

    def _load_models(self, path: Path) -> None:
        """Parse _semantic_models.yml."""
        with open(path) as f:
            data = yaml.safe_load(f)

        for model_data in data.get("semantic_models", []):
            model = SemanticModel(
                name=model_data["name"],
                description=model_data.get("description", ""),
                model_ref=model_data.get("model", ""),
                default_time_dimension=model_data.get("defaults", {}).get(
                    "agg_time_dimension"
                ),
            )

            for m in model_data.get("measures", []):
                measure = Measure(
                    name=m["name"],
                    agg=m["agg"],
                    expr=m["expr"],
                    description=m.get("description", ""),
                    label=m.get("label", ""),
                )
                model.measures[measure.name] = measure
                self._measure_to_model[measure.name] = model.name

            for d in model_data.get("dimensions", []):
                dim = Dimension(
                    name=d["name"],
                    type=d["type"],
                    description=d.get("description", ""),
                    expr=d.get("expr"),
                    type_params=d.get("type_params", {}),
                )
                model.dimensions[dim.name] = dim

            for e in model_data.get("entities", []):
                entity = Entity(
                    name=e["name"],
                    type=e["type"],
                    expr=e.get("expr"),
                )
                model.entities[entity.name] = entity

            self.models[model.name] = model

    def _load_metrics(self, path: Path) -> None:
        """Parse _metrics.yml."""
        with open(path) as f:
            data = yaml.safe_load(f)

        for m in data.get("metrics", []):
            metric = MetricDef(
                name=m["name"],
                label=m.get("label", m["name"]),
                description=m.get("description", ""),
                type=m["type"],
                type_params=m.get("type_params", {}),
                filter=m.get("filter"),
            )
            self.metrics[metric.name] = metric

    def _load_saved_queries(self, path: Path) -> None:
        """Parse _saved_queries.yml."""
        with open(path) as f:
            data = yaml.safe_load(f)

        for sq in data.get("saved_queries", []):
            query_params = sq.get("query_params", {})
            saved_query = SavedQueryDef(
                name=sq["name"],
                label=sq.get("label", sq["name"]),
                description=sq.get("description", ""),
                metrics=query_params.get("metrics", []),
                group_by=query_params.get("group_by", []),
            )
            self.saved_queries[saved_query.name] = saved_query


# =============================================================================
# Metric Compiler — compiles metrics to SQL
# =============================================================================


# Map from semantic layer aggregation names to DuckDB SQL
AGG_MAP = {
    "sum": "SUM",
    "count": "COUNT",
    "count_distinct": "COUNT(DISTINCT {expr})",
    "average": "AVG",
    "median": "MEDIAN",
    "min": "MIN",
    "max": "MAX",
}


_SEL_JOIN = ",\n  "  # separator for SELECT column lists (avoids backslash in f-strings)
_CTE_JOIN = ",\n"  # separator for CTE definitions
_NL = "\n"  # newline for use in f-strings


class MetricCompiler:
    """
    Compiles semantic layer metric definitions into DuckDB SQL.

    Usage:
        registry = ModelRegistry()
        registry.load_from_directory(Path("semantic_layer/olist"))
        registry.set_table_map({"fct_order_items": "olist.order_items", ...})

        compiler = MetricCompiler(registry)
        result = compiler.compile_saved_query("monthly_revenue_overview")
        print(result.sql)
    """

    def __init__(self, registry: ModelRegistry):
        self.registry = registry

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    def compile_metric(
        self,
        metric_name: str,
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """
        Compile a single metric into a SQL query.

        Args:
            metric_name: Name of the metric to compile.
            group_by: Optional list of dimension references for GROUP BY.
            where: Optional additional WHERE clause.

        Returns:
            CompiledQuery with executable SQL.
        """
        metric = self.registry.metrics.get(metric_name)
        if not metric:
            raise ValueError(f"Unknown metric: {metric_name}")

        if metric.type == "simple":
            return self._compile_simple(metric, group_by, where)
        elif metric.type == "derived":
            return self._compile_derived(metric, group_by, where)
        elif metric.type == "ratio":
            return self._compile_ratio(metric, group_by, where)
        elif metric.type == "cumulative":
            return self._compile_cumulative(metric, group_by, where)
        else:
            raise ValueError(f"Unknown metric type: {metric.type}")

    def compile_metrics(
        self,
        metric_names: list[str],
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """
        Compile multiple metrics into a single SQL query.

        Metrics from the same source model are combined in one query.
        Metrics from different models are joined via CTEs.

        Args:
            metric_names: List of metric names to compile.
            group_by: Dimension references for GROUP BY.
            where: Optional WHERE clause.

        Returns:
            CompiledQuery with all metrics.
        """
        if not metric_names:
            raise ValueError("No metrics specified")

        if len(metric_names) == 1:
            return self.compile_metric(metric_names[0], group_by, where)

        # Group metrics by their compilation strategy
        simple_metrics: list[MetricDef] = []
        derived_metrics: list[MetricDef] = []
        ratio_metrics: list[MetricDef] = []
        cumulative_metrics: list[MetricDef] = []

        for name in metric_names:
            metric = self.registry.metrics.get(name)
            if not metric:
                raise ValueError(f"Unknown metric: {name}")
            if metric.type == "simple":
                simple_metrics.append(metric)
            elif metric.type == "derived":
                derived_metrics.append(metric)
            elif metric.type == "ratio":
                ratio_metrics.append(metric)
            elif metric.type == "cumulative":
                cumulative_metrics.append(metric)

        # Group simple metrics by source model
        model_groups: dict[str, list[MetricDef]] = {}
        for m in simple_metrics:
            measure_name = m.type_params.get("measure", "")
            source_model = self.registry.get_model_for_measure(measure_name)
            model_name = source_model.name if source_model else "unknown"
            model_groups.setdefault(model_name, []).append(m)

        # If all metrics are simple from the same model and no complex types,
        # produce a single query
        if (
            not derived_metrics
            and not ratio_metrics
            and not cumulative_metrics
            and len(model_groups) == 1
        ):
            model_name = next(iter(model_groups))
            return self._compile_simple_group(
                model_groups[model_name], group_by, where
            )

        # Otherwise, build CTEs for each source and join them
        return self._compile_multi_source(
            simple_metrics,
            derived_metrics,
            ratio_metrics,
            cumulative_metrics,
            group_by,
            where,
        )

    def compile_saved_query(self, query_name: str) -> CompiledQuery:
        """
        Compile a saved query definition into SQL.

        Args:
            query_name: Name of the saved query.

        Returns:
            CompiledQuery with executable SQL.
        """
        sq = self.registry.saved_queries.get(query_name)
        if not sq:
            raise ValueError(f"Unknown saved query: {query_name}")

        return self.compile_metrics(sq.metrics, sq.group_by)

    # -------------------------------------------------------------------------
    # Simple metric compilation
    # -------------------------------------------------------------------------

    def _compile_simple(
        self,
        metric: MetricDef,
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """Compile a simple metric (direct measure aggregation)."""
        return self._compile_simple_group([metric], group_by, where)

    def _compile_simple_group(
        self,
        metrics: list[MetricDef],
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """Compile a group of simple metrics from the same model."""
        # Find the source model from the first metric's measure
        first_measure = metrics[0].type_params.get("measure", "")
        source_model = self.registry.get_model_for_measure(first_measure)
        if not source_model:
            raise ValueError(
                f"Cannot find model for measure: {first_measure}"
            )

        table = self.registry.resolve_table(source_model.model_ref)

        # Build SELECT columns
        select_parts = []
        columns = []

        # Add group by dimensions first
        if group_by:
            for gb in group_by:
                dim_sql, dim_alias = self._resolve_group_by(gb, source_model)
                select_parts.append(f"{dim_sql} AS {dim_alias}")
                columns.append(dim_alias)

        # Add metric aggregations
        for metric in metrics:
            measure_name = metric.type_params.get("measure", "")
            measure = source_model.measures.get(measure_name)
            if not measure:
                raise ValueError(
                    f"Measure '{measure_name}' not found on model '{source_model.name}'"
                )

            agg_sql = self._build_aggregation(measure)
            select_parts.append(f"{agg_sql} AS {metric.name}")
            columns.append(metric.name)

        # Build WHERE clauses
        where_parts = []
        for metric in metrics:
            if metric.filter:
                resolved = self._resolve_filter(metric.filter, source_model)
                where_parts.append(resolved)
        if where:
            where_parts.append(where)

        # Assemble query
        sql = f"SELECT\n  {_SEL_JOIN.join(select_parts)}\nFROM {table}"
        if where_parts:
            sql += f"\nWHERE {' AND '.join(where_parts)}"
        if group_by:
            group_indices = list(range(1, len(group_by) + 1))
            sql += f"\nGROUP BY {', '.join(str(i) for i in group_indices)}"
            sql += f"\nORDER BY {group_indices[0]}"

        return CompiledQuery(
            sql=sql,
            metric_names=[m.name for m in metrics],
            columns=columns,
            source_model=source_model.name,
        )

    # -------------------------------------------------------------------------
    # Derived metric compilation
    # -------------------------------------------------------------------------

    def _compile_derived(
        self,
        metric: MetricDef,
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """
        Compile a derived metric.

        Derived metrics reference other metrics by name/alias and combine them
        with an expression. We compile each referenced metric as a CTE, then
        apply the expression.
        """
        expr = metric.type_params.get("expr", "")
        sub_metrics = metric.type_params.get("metrics", [])

        if not sub_metrics:
            raise ValueError(f"Derived metric '{metric.name}' has no sub-metrics")

        # Collect the sub-metrics we need to compute
        # Each has: name, optional alias, optional offset_window
        sub_metric_refs = []
        for sm in sub_metrics:
            sub_metric_refs.append({
                "name": sm["name"],
                "alias": sm.get("alias", sm["name"]),
                "offset_window": sm.get("offset_window"),
            })

        # Check if all sub-metrics are simple and from the same model
        # If so, we can inline them in one query
        all_simple_same_model = True
        source_model = None
        has_offset = False

        for ref in sub_metric_refs:
            m = self.registry.metrics.get(ref["name"])
            if not m or m.type != "simple":
                all_simple_same_model = False
                break
            measure_name = m.type_params.get("measure", "")
            model = self.registry.get_model_for_measure(measure_name)
            if source_model is None:
                source_model = model
            elif model and model.name != source_model.name:
                all_simple_same_model = False
                break
            if ref.get("offset_window"):
                has_offset = True

        if all_simple_same_model and source_model and not has_offset:
            return self._compile_derived_inline(
                metric, sub_metric_refs, source_model, group_by, where
            )
        elif has_offset:
            return self._compile_derived_with_offset(
                metric, sub_metric_refs, group_by, where
            )
        else:
            return self._compile_derived_with_ctes(
                metric, sub_metric_refs, group_by, where
            )

    def _compile_derived_inline(
        self,
        metric: MetricDef,
        sub_metric_refs: list[dict],
        source_model: SemanticModel,
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """Compile a derived metric where all sub-metrics are from the same model."""
        table = self.registry.resolve_table(source_model.model_ref)
        expr = metric.type_params["expr"]

        select_parts = []
        columns = []

        # Group by dimensions
        if group_by:
            for gb in group_by:
                dim_sql, dim_alias = self._resolve_group_by(gb, source_model)
                select_parts.append(f"{dim_sql} AS {dim_alias}")
                columns.append(dim_alias)

        # Build the expression by replacing aliases with actual aggregations
        compiled_expr = expr
        for ref in sub_metric_refs:
            m = self.registry.metrics[ref["name"]]
            measure = source_model.measures[m.type_params["measure"]]
            agg_sql = self._build_aggregation(measure)
            # Replace the alias in the expression with the aggregation
            compiled_expr = compiled_expr.replace(ref["alias"], agg_sql)

        select_parts.append(f"{compiled_expr} AS {metric.name}")
        columns.append(metric.name)

        sql = f"SELECT\n  {_SEL_JOIN.join(select_parts)}\nFROM {table}"

        where_parts = []
        if metric.filter:
            where_parts.append(self._resolve_filter(metric.filter, source_model))
        if where:
            where_parts.append(where)
        if where_parts:
            sql += f"\nWHERE {' AND '.join(where_parts)}"

        if group_by:
            group_indices = list(range(1, len(group_by) + 1))
            sql += f"\nGROUP BY {', '.join(str(i) for i in group_indices)}"
            sql += f"\nORDER BY {group_indices[0]}"

        return CompiledQuery(
            sql=sql,
            metric_names=[metric.name],
            columns=columns,
            source_model=source_model.name,
        )

    def _compile_derived_with_offset(
        self,
        metric: MetricDef,
        sub_metric_refs: list[dict],
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """Compile a derived metric that uses offset_window (e.g., MoM growth)."""
        # Offset metrics require a time dimension in group_by
        time_gb = None
        if group_by:
            for gb in group_by:
                if "TimeDimension" in gb:
                    time_gb = gb
                    break

        if not time_gb:
            raise ValueError(
                f"Derived metric '{metric.name}' uses offset_window but no "
                "TimeDimension in group_by"
            )

        # All sub-metrics should be simple for offset to work
        first_ref = sub_metric_refs[0]
        first_metric = self.registry.metrics[first_ref["name"]]
        measure_name = first_metric.type_params["measure"]
        source_model = self.registry.get_model_for_measure(measure_name)
        if not source_model:
            raise ValueError(f"Cannot find model for measure: {measure_name}")

        table = self.registry.resolve_table(source_model.model_ref)
        dim_sql, dim_alias = self._resolve_group_by(time_gb, source_model)

        # Build a base CTE with the time dimension and deduplicated aggregations.
        # Multiple refs may point to the same measure (e.g., gmv for both
        # current_gmv and previous_gmv). We only compute each measure once
        # and use a canonical column name (the measure name).
        seen_measures = {}  # measure_name -> base column alias
        base_aggs = []
        for ref in sub_metric_refs:
            m = self.registry.metrics[ref["name"]]
            mname = m.type_params["measure"]
            if mname not in seen_measures:
                measure = source_model.measures[mname]
                agg_sql = self._build_aggregation(measure)
                col_alias = f"_base_{mname}"
                base_aggs.append(f"{agg_sql} AS {col_alias}")
                seen_measures[mname] = col_alias

        base_select = [f"{dim_sql} AS {dim_alias}"] + base_aggs
        base_sql = f"SELECT\n  {_SEL_JOIN.join(base_select)}\nFROM {table}"

        where_parts = []
        if where:
            where_parts.append(where)
        if where_parts:
            base_sql += f"\nWHERE {' AND '.join(where_parts)}"
        base_sql += "\nGROUP BY 1\nORDER BY 1"

        # Build a "lagged" CTE that materializes LAG results so the final
        # expression can reference them correctly.
        lag_selects = [dim_alias]
        for ref in sub_metric_refs:
            m = self.registry.metrics[ref["name"]]
            mname = m.type_params["measure"]
            base_col = seen_measures[mname]
            if ref.get("offset_window"):
                offset_parts = ref["offset_window"].split()
                offset_n = int(offset_parts[0]) if offset_parts else 1
                lag_selects.append(
                    f"LAG({base_col}, {offset_n}) OVER (ORDER BY {dim_alias}) AS {ref['alias']}"
                )
            else:
                lag_selects.append(f"{base_col} AS {ref['alias']}")

        expr = metric.type_params["expr"]
        columns = [dim_alias, metric.name]

        sql = (
            f"WITH base AS (\n{_indent(base_sql)}\n),\n"
            f"lagged AS (\n"
            f"  SELECT\n    {_SEL_JOIN.join(lag_selects)}\n"
            f"  FROM base\n)\n"
            f"SELECT\n  {dim_alias},\n"
            f"  {expr} AS {metric.name}\n"
            f"FROM lagged\n"
            f"ORDER BY {dim_alias}"
        )

        return CompiledQuery(
            sql=sql,
            metric_names=[metric.name],
            columns=columns,
            source_model=source_model.name,
        )

    def _compile_derived_with_ctes(
        self,
        metric: MetricDef,
        sub_metric_refs: list[dict],
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """Compile a derived metric using CTEs when sub-metrics span models."""
        ctes = []
        cte_names = []
        expr = metric.type_params["expr"]

        for i, ref in enumerate(sub_metric_refs):
            cte_name = f"m{i}_{ref['alias']}"
            sub_result = self.compile_metric(ref["name"], group_by, where)
            ctes.append(f"{cte_name} AS (\n{_indent(sub_result.sql)}\n)")
            cte_names.append((cte_name, ref["alias"]))

        # Build final SELECT joining CTEs
        # Assume they share group_by dimensions for joining
        if group_by and len(cte_names) > 1:
            first_cte = cte_names[0][0]
            joins = []
            for cte_name, _ in cte_names[1:]:
                # Join on the first group_by column
                joins.append(
                    f"JOIN {cte_name} USING ({self._first_group_by_alias(group_by)})"
                )

            select_parts = []
            if group_by:
                alias = self._first_group_by_alias(group_by)
                select_parts.append(f"{first_cte}.{alias}")

            for cte_name, alias in cte_names:
                select_parts.append(f"{cte_name}.{alias}")

            select_parts.append(f"{expr} AS {metric.name}")

            join_sql = _NL.join(joins)
            final = (
                f"SELECT\n  {_SEL_JOIN.join(select_parts)}\n"
                f"FROM {first_cte}\n{join_sql}"
            )
        else:
            select_parts = []
            for _, alias in cte_names:
                select_parts.append(alias)
            select_parts.append(f"{expr} AS {metric.name}")
            first_cte = cte_names[0][0]
            final = f"SELECT\n  {_SEL_JOIN.join(select_parts)}\nFROM {first_cte}"

        columns = [metric.name]
        if group_by:
            columns.insert(0, self._first_group_by_alias(group_by))

        sql = f"WITH {_CTE_JOIN.join(ctes)}{_NL}{final}"

        return CompiledQuery(
            sql=sql,
            metric_names=[metric.name],
            columns=columns,
        )

    # -------------------------------------------------------------------------
    # Ratio metric compilation
    # -------------------------------------------------------------------------

    def _compile_ratio(
        self,
        metric: MetricDef,
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """
        Compile a ratio metric (numerator / denominator).

        Both numerator and denominator are metric references. If they're from
        the same model, inline them. Otherwise, use CTEs.
        """
        num_name = metric.type_params.get("numerator", "")
        den_name = metric.type_params.get("denominator", "")

        num_metric = self.registry.metrics.get(num_name)
        den_metric = self.registry.metrics.get(den_name)

        if not num_metric:
            raise ValueError(f"Numerator metric '{num_name}' not found")
        if not den_metric:
            raise ValueError(f"Denominator metric '{den_name}' not found")

        # Check if both are simple and from the same model
        if num_metric.type == "simple" and den_metric.type == "simple":
            num_measure = num_metric.type_params.get("measure", "")
            den_measure = den_metric.type_params.get("measure", "")
            num_model = self.registry.get_model_for_measure(num_measure)
            den_model = self.registry.get_model_for_measure(den_measure)

            if num_model and den_model and num_model.name == den_model.name:
                return self._compile_ratio_inline(
                    metric, num_metric, den_metric, num_model, group_by, where
                )

        # Different models — use CTEs
        return self._compile_ratio_with_ctes(
            metric, num_name, den_name, group_by, where
        )

    def _compile_ratio_inline(
        self,
        metric: MetricDef,
        num_metric: MetricDef,
        den_metric: MetricDef,
        source_model: SemanticModel,
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """Compile a ratio metric where both parts are from the same model."""
        table = self.registry.resolve_table(source_model.model_ref)

        num_measure = source_model.measures[num_metric.type_params["measure"]]
        den_measure = source_model.measures[den_metric.type_params["measure"]]

        num_agg = self._build_aggregation(num_measure)
        den_agg = self._build_aggregation(den_measure)

        select_parts = []
        columns = []

        if group_by:
            for gb in group_by:
                dim_sql, dim_alias = self._resolve_group_by(gb, source_model)
                select_parts.append(f"{dim_sql} AS {dim_alias}")
                columns.append(dim_alias)

        ratio_expr = f"CAST({num_agg} AS DOUBLE) / NULLIF({den_agg}, 0)"
        select_parts.append(f"{ratio_expr} AS {metric.name}")
        columns.append(metric.name)

        sql = f"SELECT\n  {_SEL_JOIN.join(select_parts)}\nFROM {table}"

        where_parts = []
        if where:
            where_parts.append(where)
        if where_parts:
            sql += f"\nWHERE {' AND '.join(where_parts)}"

        if group_by:
            group_indices = list(range(1, len(group_by) + 1))
            sql += f"\nGROUP BY {', '.join(str(i) for i in group_indices)}"
            sql += f"\nORDER BY {group_indices[0]}"

        return CompiledQuery(
            sql=sql,
            metric_names=[metric.name],
            columns=columns,
            source_model=source_model.name,
        )

    def _compile_ratio_with_ctes(
        self,
        metric: MetricDef,
        num_name: str,
        den_name: str,
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """Compile a ratio metric using CTEs when metrics span models."""
        num_result = self.compile_metric(num_name, group_by, where)
        den_result = self.compile_metric(den_name, group_by, where)

        ctes = [
            f"numerator AS (\n{_indent(num_result.sql)}\n)",
            f"denominator AS (\n{_indent(den_result.sql)}\n)",
        ]

        if group_by:
            join_col = self._first_group_by_alias(group_by)
            final = (
                f"SELECT\n"
                f"  numerator.{join_col},\n"
                f"  CAST(numerator.{num_name} AS DOUBLE) / "
                f"NULLIF(denominator.{den_name}, 0) AS {metric.name}\n"
                f"FROM numerator\n"
                f"JOIN denominator USING ({join_col})"
            )
        else:
            final = (
                f"SELECT\n"
                f"  CAST(numerator.{num_name} AS DOUBLE) / "
                f"NULLIF(denominator.{den_name}, 0) AS {metric.name}\n"
                f"FROM numerator, denominator"
            )

        columns = [metric.name]
        if group_by:
            columns.insert(0, self._first_group_by_alias(group_by))

        sql = f"WITH {_CTE_JOIN.join(ctes)}{_NL}{final}"

        return CompiledQuery(
            sql=sql,
            metric_names=[metric.name],
            columns=columns,
        )

    # -------------------------------------------------------------------------
    # Cumulative metric compilation
    # -------------------------------------------------------------------------

    def _compile_cumulative(
        self,
        metric: MetricDef,
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """
        Compile a cumulative metric (running total).

        Supports:
        - No window: all-time running total
        - window: rolling window (e.g., "30 days")
        - grain_to_date: period-to-date (e.g., "month" for MTD)
        """
        measure_name = metric.type_params.get("measure", "")
        window = metric.type_params.get("window")
        grain_to_date = metric.type_params.get("grain_to_date")

        source_model = self.registry.get_model_for_measure(measure_name)
        if not source_model:
            raise ValueError(f"Cannot find model for measure: {measure_name}")

        measure = source_model.measures.get(measure_name)
        if not measure:
            raise ValueError(f"Measure '{measure_name}' not found")

        table = self.registry.resolve_table(source_model.model_ref)
        time_dim = source_model.default_time_dimension or "order_date"

        # We need a time dimension for cumulative metrics
        # Use the first TimeDimension from group_by, or the model's default
        time_gb = None
        if group_by:
            for gb in group_by:
                if "TimeDimension" in gb:
                    time_gb = gb
                    break

        if not time_gb:
            # Default to monthly
            time_gb = f"TimeDimension('metric_time', 'month')"

        dim_sql, dim_alias = self._resolve_group_by(time_gb, source_model)
        agg_sql = self._build_aggregation(measure)

        # Build the base aggregation
        base_sql = (
            f"SELECT\n"
            f"  {dim_sql} AS {dim_alias},\n"
            f"  {agg_sql} AS period_value\n"
            f"FROM {table}"
        )

        where_parts = []
        if metric.filter:
            where_parts.append(self._resolve_filter(metric.filter, source_model))
        if where:
            where_parts.append(where)
        if where_parts:
            base_sql += f"\nWHERE {' AND '.join(where_parts)}"
        base_sql += f"\nGROUP BY 1\nORDER BY 1"

        # Build the window function
        if grain_to_date:
            # Period-to-date: partition by period start
            partition = f"PARTITION BY DATE_TRUNC('{grain_to_date}', {dim_alias})"
            window_frame = "ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW"
        elif window:
            # Rolling window: use RANGE with interval
            partition = ""
            window_frame = f"RANGE BETWEEN INTERVAL '{window}' PRECEDING AND CURRENT ROW"
        else:
            # All-time running total
            partition = ""
            window_frame = "ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW"

        over_clause = f"OVER ({partition} ORDER BY {dim_alias} {window_frame})"

        sql = (
            f"WITH base AS (\n{_indent(base_sql)}\n)\n"
            f"SELECT\n"
            f"  {dim_alias},\n"
            f"  SUM(period_value) {over_clause.strip()} AS {metric.name}\n"
            f"FROM base\n"
            f"ORDER BY {dim_alias}"
        )

        columns = [dim_alias, metric.name]

        return CompiledQuery(
            sql=sql,
            metric_names=[metric.name],
            columns=columns,
            source_model=source_model.name,
        )

    # -------------------------------------------------------------------------
    # Multi-source compilation (CTE-based)
    # -------------------------------------------------------------------------

    def _compile_multi_source(
        self,
        simple_metrics: list[MetricDef],
        derived_metrics: list[MetricDef],
        ratio_metrics: list[MetricDef],
        cumulative_metrics: list[MetricDef],
        group_by: list[str] | None = None,
        where: str | None = None,
    ) -> CompiledQuery:
        """Compile metrics from multiple models/types using CTEs."""
        ctes = []
        all_columns = []
        all_metric_names = []

        # Compile each metric individually as a CTE
        all_metrics = simple_metrics + derived_metrics + ratio_metrics + cumulative_metrics
        for i, metric in enumerate(all_metrics):
            result = self.compile_metric(metric.name, group_by, where)
            cte_name = f"cte_{metric.name}"
            ctes.append(f"{cte_name} AS (\n{_indent(result.sql)}\n)")
            all_metric_names.append(metric.name)

        if not ctes:
            raise ValueError("No metrics to compile")

        # Build final SELECT joining all CTEs
        if group_by:
            join_col = self._first_group_by_alias(group_by)
            all_columns.append(join_col)

            first_cte = f"cte_{all_metrics[0].name}"
            select_parts = [f"{first_cte}.{join_col}"]
            for metric in all_metrics:
                cte_name = f"cte_{metric.name}"
                select_parts.append(f"{cte_name}.{metric.name}")

            joins = []
            for metric in all_metrics[1:]:
                cte_name = f"cte_{metric.name}"
                joins.append(f"JOIN {cte_name} USING ({join_col})")

            join_sql = "\n".join(joins)
            final = (
                f"SELECT\n  {_SEL_JOIN.join(select_parts)}\n"
                f"FROM {first_cte}\n{join_sql}\n"
                f"ORDER BY {join_col}"
            )
        else:
            select_parts = []
            for metric in all_metrics:
                cte_name = f"cte_{metric.name}"
                select_parts.append(f"{cte_name}.{metric.name}")
            first_cte = f"cte_{all_metrics[0].name}"
            final = f"SELECT\n  {_SEL_JOIN.join(select_parts)}\nFROM {first_cte}"

        all_columns.extend(all_metric_names)
        sql = f"WITH {_CTE_JOIN.join(ctes)}{_NL}{final}"

        return CompiledQuery(
            sql=sql,
            metric_names=all_metric_names,
            columns=all_columns,
        )

    # -------------------------------------------------------------------------
    # Dimension & filter resolution
    # -------------------------------------------------------------------------

    def _resolve_group_by(
        self, group_by_ref: str, source_model: SemanticModel
    ) -> tuple[str, str]:
        """
        Resolve a group_by reference to SQL expression and alias.

        Handles:
        - TimeDimension('metric_time', 'month') → DATE_TRUNC('month', order_date)
        - Dimension('order_item__product_category') → product_category
        """
        if "TimeDimension" in group_by_ref:
            return self._resolve_time_dimension(group_by_ref, source_model)
        elif "Dimension" in group_by_ref:
            return self._resolve_categorical_dimension(group_by_ref, source_model)
        else:
            # Plain column name
            return group_by_ref, group_by_ref

    def _resolve_time_dimension(
        self, ref: str, source_model: SemanticModel
    ) -> tuple[str, str]:
        """
        Resolve TimeDimension('metric_time', 'month') to SQL.

        Returns (sql_expr, alias).
        """
        # Parse: TimeDimension('metric_time', 'month')
        parts = ref.replace("TimeDimension(", "").rstrip(")").split(",")
        parts = [p.strip().strip("'\"") for p in parts]

        grain = parts[1] if len(parts) > 1 else "day"

        # metric_time maps to the model's default time dimension
        time_col = source_model.default_time_dimension or "order_date"

        if grain == "day":
            return f"CAST({time_col} AS DATE)", "metric_time"
        else:
            return f"DATE_TRUNC('{grain}', {time_col})", "metric_time"

    def _resolve_categorical_dimension(
        self, ref: str, source_model: SemanticModel
    ) -> tuple[str, str]:
        """
        Resolve Dimension('order_item__product_category') to SQL.

        The format is model_name__dimension_name. We look up the dimension
        on the referenced model (or current model if it matches).
        """
        # Parse: Dimension('order_item__product_category')
        dim_ref = ref.replace("Dimension(", "").rstrip(")").strip("'\"")

        if "__" in dim_ref:
            model_name, dim_name = dim_ref.split("__", 1)
        else:
            model_name = source_model.name
            dim_name = dim_ref

        # Look up the dimension on the target model
        target_model = self.registry.models.get(model_name, source_model)
        dim = target_model.dimensions.get(dim_name)

        if dim and dim.expr:
            return dim.expr, dim_name
        else:
            return dim_name, dim_name

    def _resolve_filter(self, filter_str: str, source_model: SemanticModel) -> str:
        """
        Resolve a metric filter expression.

        Replaces {{ Dimension('model__column') }} with the actual column reference.
        """
        import re

        def replace_dim_ref(match):
            dim_ref = match.group(1)
            sql, _ = self._resolve_categorical_dimension(
                f"Dimension('{dim_ref}')", source_model
            )
            return sql

        # Replace {{ Dimension('xxx__yyy') }} patterns
        resolved = re.sub(
            r"\{\{\s*Dimension\(['\"]([^'\"]+)['\"]\)\s*\}\}",
            replace_dim_ref,
            filter_str,
        )

        return resolved.strip()

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    def _build_aggregation(self, measure: Measure) -> str:
        """Build a SQL aggregation expression from a measure."""
        agg = measure.agg.lower()
        expr = measure.expr

        if agg == "count_distinct":
            return f"COUNT(DISTINCT {expr})"
        elif agg in AGG_MAP:
            return f"{AGG_MAP[agg]}({expr})"
        else:
            return f"{agg.upper()}({expr})"

    def _first_group_by_alias(self, group_by: list[str]) -> str:
        """Get the alias for the first group_by dimension."""
        if not group_by:
            return "metric_time"

        ref = group_by[0]
        if "TimeDimension" in ref:
            return "metric_time"
        elif "Dimension" in ref:
            dim_ref = ref.replace("Dimension(", "").rstrip(")").strip("'\"")
            if "__" in dim_ref:
                _, dim_name = dim_ref.split("__", 1)
                return dim_name
            return dim_ref
        return ref


def _indent(sql: str, spaces: int = 2) -> str:
    """Indent each line of a SQL string."""
    prefix = " " * spaces
    return "\n".join(f"{prefix}{line}" for line in sql.split("\n"))
