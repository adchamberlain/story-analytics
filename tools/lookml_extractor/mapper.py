"""Map parsed LookML constructs to Data Context format."""

import re
from dataclasses import dataclass, field

from .models import (
    LookMLDimension,
    LookMLExplore,
    LookMLMeasure,
    LookMLView,
    ParsedRepo,
)

# --- Type mappings ---

DIMENSION_TYPE_MAP = {
    "string": "categorical",
    "number": "numeric",
    "yesno": "boolean",
    "tier": "tier",
    "time": "time",
    "date": "time",
    "duration": "numeric",
    "location": "location",
    "zipcode": "categorical",
    "int": "numeric",
}

MEASURE_AGG_MAP = {
    "sum": "sum",
    "count": "count",
    "count_distinct": "count_distinct",
    "average": "average",
    "avg": "average",
    "min": "min",
    "max": "max",
    "median": "median",
    "percentile": "percentile",
    "sum_distinct": "sum",
    "average_distinct": "average",
    # These are non-standard — we store as-is
    "number": "number",
    "string": "string",
    "list": "list",
    "date": "date",
    "yesno": "boolean",
}

VALUE_FORMAT_MAP = {
    "usd": "currency",
    "usd_0": "currency",
    "usd_0_no_sign": "currency",
    "decimal_0": "number",
    "decimal_1": "number",
    "decimal_2": "number",
    "decimal_3": "number",
    "percent_0": "percent",
    "percent_1": "percent",
    "percent_2": "percent",
}

# Timeframe → granularity mapping
TIMEFRAME_MAP = {
    "raw": None,  # skip
    "date": "day",
    "day_of_week": None,
    "day_of_month": None,
    "week": "week",
    "month": "month",
    "month_name": None,
    "quarter": "quarter",
    "quarter_of_year": None,
    "year": "year",
    "fiscal_quarter": "quarter",
    "fiscal_quarter_of_year": None,
    "fiscal_year": "year",
    "hour": "hour",
    "hour_of_day": None,
    "minute": "minute",
    "time": None,
    "time_of_day": None,
}

LKM_RELATIONSHIP_MAP = {
    "many_to_one": "many_to_one",
    "one_to_many": "one_to_many",
    "one_to_one": "one_to_one",
    "many_to_many": "many_to_many",
}

LKM_JOIN_TYPE_MAP = {
    "left_outer": "left",
    "inner": "inner",
    "full_outer": "full",
    "cross": "cross",
}


# --- SQL expression cleaning ---

_TABLE_REF_RE = re.compile(r"\$\{TABLE\}\.")
_FIELD_REF_RE = re.compile(r"\$\{(\w+)\.(\w+)\}")
_FIELD_SELF_RE = re.compile(r"\$\{(\w+)\}")


def clean_sql_expr(sql: str, view_name: str = "") -> str:
    """Clean LookML SQL expression for Data Context format.

    - ${TABLE}.col → col
    - ${view.field} → view.field (for join conditions)
    - ${field} → field (within same view)
    - Strip trailing ;; and whitespace
    """
    sql = sql.strip().rstrip(";").strip()
    sql = _TABLE_REF_RE.sub("", sql)
    sql = _FIELD_REF_RE.sub(r"\1.\2", sql)
    # Self-references (no dot) — these are fields within the same view
    sql = _FIELD_SELF_RE.sub(r"\1", sql)
    return sql.strip()


def clean_join_sql(sql: str) -> str:
    """Clean SQL ON condition from explores, preserving view.field references."""
    sql = sql.strip().rstrip(";").strip()
    sql = _FIELD_REF_RE.sub(r"\1.\2", sql)
    return sql.strip()


# --- Output data structures (plain dicts for YAML serialization) ---

@dataclass
class DataContextTable:
    name: str
    table_ref: str  # fully qualified table name
    description: str = ""
    grain: str = ""  # primary key column
    default_time_dimension: str = ""
    domain: str = ""
    entities: list[dict] = field(default_factory=list)
    dimensions: list[dict] = field(default_factory=list)
    measures: list[dict] = field(default_factory=list)
    source_file: str = ""


@dataclass
class DataContextJoin:
    name: str
    description: str = ""
    base_table: str = ""
    joins: list[dict] = field(default_factory=list)
    always_filter: dict[str, str] = field(default_factory=dict)
    sql_always_where: str = ""


@dataclass
class DataContextOutput:
    tables: list[DataContextTable] = field(default_factory=list)
    metrics: list[dict] = field(default_factory=list)
    joins: list[DataContextJoin] = field(default_factory=list)
    connection: str = ""
    repo_path: str = ""
    # Stats
    total_views: int = 0
    total_explores: int = 0
    total_dimensions: int = 0
    total_measures: int = 0


def _infer_domain(view: LookMLView) -> str:
    """Infer business domain from view source file path."""
    parts = view.source_file.split("/")
    # Look for domain directory: views/orgm/..., views/finance/..., etc.
    if len(parts) >= 2:
        for i, part in enumerate(parts):
            if part == "views" and i + 1 < len(parts):
                next_part = parts[i + 1]
                # If next part is not the filename, it's a domain dir
                if not next_part.endswith(".lkml"):
                    return next_part
    return ""


def _map_dimension(dim: LookMLDimension, view_name: str) -> tuple[dict | None, dict | None]:
    """Map a LookML dimension to Data Context dimension dict.

    Returns (dimension_dict, entity_dict_or_None).
    """
    if dim.hidden:
        return None, None

    dc_type = DIMENSION_TYPE_MAP.get(dim.type, "categorical")

    d: dict = {
        "name": dim.name,
        "type": dc_type,
    }

    if dim.description:
        d["description"] = dim.description
    if dim.label:
        d["label"] = dim.label

    # SQL expression
    expr = clean_sql_expr(dim.sql, view_name)
    if expr and expr != dim.name:
        d["expr"] = expr

    # Time dimensions: add granularities
    if dc_type == "time" and dim.timeframes:
        granularities = []
        for tf in dim.timeframes:
            g = TIMEFRAME_MAP.get(tf)
            if g and g not in granularities:
                granularities.append(g)
        if granularities:
            d["granularities"] = granularities

    # Entity inference
    entity = None
    if dim.primary_key:
        entity = {
            "name": dim.name,
            "type": "primary",
        }
        expr_val = clean_sql_expr(dim.sql, view_name)
        if expr_val and expr_val != dim.name:
            entity["expr"] = expr_val
    elif dim.name.endswith("_id") or dim.name.endswith("_pk"):
        entity = {
            "name": dim.name,
            "type": "foreign",
        }
        expr_val = clean_sql_expr(dim.sql, view_name)
        if expr_val and expr_val != dim.name:
            entity["expr"] = expr_val

    return d, entity


def _map_measure(measure: LookMLMeasure, view_name: str) -> tuple[dict | None, dict | None]:
    """Map a LookML measure to Data Context measure dict.

    Returns (measure_dict, simple_metric_dict).
    Skips hidden measures and non-aggregatable types.
    """
    if measure.hidden:
        return None, None

    agg = MEASURE_AGG_MAP.get(measure.type)
    if agg is None:
        agg = measure.type  # preserve unknown types

    # Skip 'number' type measures that are really derived calculations
    # We'll still include them but mark the agg type
    is_derived = measure.type in ("number", "string", "date", "yesno", "list")

    m: dict = {
        "name": measure.name,
        "agg": agg,
    }

    # SQL expression
    expr = clean_sql_expr(measure.sql, view_name)
    if expr:
        m["expr"] = expr

    if measure.label:
        m["label"] = measure.label
    if measure.description:
        m["description"] = measure.description

    # Format
    fmt = VALUE_FORMAT_MAP.get(measure.value_format)
    if fmt:
        m["format"] = fmt

    # Filters on measure
    if measure.filters:
        filter_parts = []
        for f in measure.filters:
            field_name = f.get("field", f.get("name", ""))
            value = f.get("value", "")
            if field_name and value:
                filter_parts.append(f"{field_name} = {value}")
        if filter_parts:
            m["filter"] = " AND ".join(filter_parts)

    # Generate a simple metric wrapping this measure (1:1)
    metric = None
    if not is_derived:
        metric = {
            "name": measure.name,
            "type": "simple",
            "measure": measure.name,
        }
        if measure.label:
            metric["label"] = measure.label
        if measure.description:
            metric["description"] = measure.description
        if fmt:
            metric["format"] = fmt

    return m, metric


def _map_explore(explore: LookMLExplore) -> DataContextJoin:
    """Map a LookML explore to Data Context join entry."""
    joins = []
    for j in explore.joins:
        join_entry: dict = {
            "table": j.from_view if j.from_view else j.view_name,
            "on": clean_join_sql(j.sql_on),
            "relationship": LKM_RELATIONSHIP_MAP.get(j.relationship, j.relationship),
        }
        join_type = LKM_JOIN_TYPE_MAP.get(j.type)
        if join_type and join_type != "left":  # left is default
            join_entry["type"] = join_type
        if j.view_name != (j.from_view or j.view_name):
            join_entry["alias"] = j.view_name
        joins.append(join_entry)

    return DataContextJoin(
        name=explore.name,
        description=explore.description,
        base_table=explore.view_name,
        joins=joins,
        always_filter=explore.always_filter,
        sql_always_where=explore.sql_always_where,
    )


def map_to_data_context(parsed: ParsedRepo) -> DataContextOutput:
    """Map all parsed LookML constructs to Data Context format.

    Args:
        parsed: ParsedRepo from parser.parse_repo()

    Returns:
        DataContextOutput ready for YAML serialization.
    """
    output = DataContextOutput(
        connection=parsed.connection,
        repo_path=parsed.repo_path,
        total_views=len(parsed.views),
        total_explores=len(parsed.explores),
    )

    all_metrics: list[dict] = []

    for view in parsed.views.values():
        domain = _infer_domain(view)

        entities: list[dict] = []
        dimensions: list[dict] = []
        measures: list[dict] = []
        default_time_dim = ""
        grain = ""

        # Map dimensions
        for dim in view.dimensions:
            dim_dict, entity = _map_dimension(dim, view.name)
            if dim_dict:
                dimensions.append(dim_dict)
                output.total_dimensions += 1
            if entity:
                entities.append(entity)
                if entity["type"] == "primary":
                    grain = entity["name"]

        # Infer default_time_dimension (first time dimension)
        for dim in dimensions:
            if dim.get("type") == "time":
                default_time_dim = dim["name"]
                break

        # Map measures
        for meas in view.measures:
            meas_dict, metric = _map_measure(meas, view.name)
            if meas_dict:
                measures.append(meas_dict)
                output.total_measures += 1
            if metric:
                all_metrics.append(metric)

        table = DataContextTable(
            name=view.name,
            table_ref=view.sql_table_name or view.name,
            description=view.description,
            grain=grain,
            default_time_dimension=default_time_dim,
            domain=domain,
            entities=entities,
            dimensions=dimensions,
            measures=measures,
            source_file=view.source_file,
        )
        output.tables.append(table)

    output.metrics = all_metrics

    # Map explores to joins (skip hidden)
    for explore in parsed.explores:
        if not explore.hidden:
            output.joins.append(_map_explore(explore))

    return output
