"""Convert enriched Data Context output into SemanticLayer format.

The LookML extractor produces enriched Data Context files (tables/, metrics.yaml,
joins.yaml, knowledge/business_context.yaml). The conversation engine loads a
different format: SemanticLayer from sources/{source}/semantic.yaml.

This module bridges the gap by converting Data Context → SemanticLayer.
"""

import hashlib
import os
from datetime import datetime, timezone

import yaml

from engine.semantic import (
    BusinessContext,
    ColumnSemantic,
    QueryPattern,
    Relationship,
    SemanticLayer,
    TableSemantic,
)


# Maps Data Context aggregation types to SemanticLayer aggregation hints
_AGG_MAP = {
    "sum": "SUM",
    "count": "COUNT",
    "count_distinct": "COUNT_DISTINCT",
    "average": "AVG",
    "avg": "AVG",
    "min": "MIN",
    "max": "MAX",
    "median": "MEDIAN",
    "percentile": "PERCENTILE",
    "number": "SUM",  # expression-based measures default to SUM
}

# Maps Data Context format to SemanticLayer format_hint
_FORMAT_MAP = {
    "currency": "currency",
    "percent": "percent",
    "number": "number",
    "date": "date",
}


def convert_data_context_to_semantic(
    input_dir: str,
    source_name: str,
    output_path: str | None = None,
) -> SemanticLayer:
    """Convert an enriched Data Context directory into a SemanticLayer.

    Args:
        input_dir: Path to enriched Data Context directory (with tables/, metrics.yaml, etc.)
        source_name: Source name for the semantic layer (e.g., "mattermost")
        output_path: Where to save the semantic.yaml. Defaults to sources/{source_name}/semantic.yaml

    Returns:
        The constructed SemanticLayer object (also saved to disk).
    """
    # Load all Data Context files
    tables_data = _load_all_tables(input_dir)
    metrics_data = _load_yaml(os.path.join(input_dir, "metrics.yaml"))
    joins_data = _load_yaml(os.path.join(input_dir, "joins.yaml"))
    knowledge_data = _load_yaml(os.path.join(input_dir, "knowledge", "business_context.yaml"))

    # Build certified metrics set for business_context.key_metrics
    metrics_list = metrics_data.get("metrics", [])
    certified_metrics = [
        m["name"] for m in metrics_list
        if m.get("tier") == "certified"
    ]

    # Build business context
    biz = knowledge_data.get("business_context", {})
    domains = biz.get("domains", [])
    glossary = biz.get("glossary", {})
    overview = biz.get("overview", f"Data context for {source_name}")

    business_context = BusinessContext(
        description=overview,
        domain=", ".join(domains[:5]) if domains else "General",
        key_metrics=certified_metrics,
        key_dimensions=[],  # populated below from dimension scan
        business_glossary=glossary,
    )

    # Build tables
    semantic_tables: dict[str, TableSemantic] = {}
    all_dimensions: list[str] = []

    for table_dict in tables_data:
        table_name = table_dict["name"]
        columns: dict[str, ColumnSemantic] = {}

        # Convert entities to columns
        for entity in table_dict.get("entities", []):
            entity_name = entity["name"]
            entity_type = entity.get("type", "foreign")

            if entity_type == "primary":
                columns[entity_name] = ColumnSemantic(
                    description=entity.get("description", f"Primary key of {table_name}"),
                    role="primary_key",
                )
            elif entity_type == "foreign":
                columns[entity_name] = ColumnSemantic(
                    description=entity.get("description", f"Foreign key reference"),
                    role="foreign_key",
                    references=entity.get("references"),
                )

        # Convert dimensions to columns
        for dim in table_dict.get("dimensions", []):
            dim_name = dim["name"]
            desc = dim.get("description", "")
            dim_type = dim.get("type", "categorical")

            if dim_type == "time":
                role = "date"
            else:
                role = "dimension"
                all_dimensions.append(dim_name)

            # Don't overwrite entity columns (they have richer role info)
            if dim_name not in columns:
                columns[dim_name] = ColumnSemantic(
                    description=desc,
                    role=role,
                    business_meaning=dim.get("business_meaning"),
                    format_hint=_FORMAT_MAP.get(dim.get("format", ""), None),
                )

        # Convert measures to columns
        for measure in table_dict.get("measures", []):
            measure_name = measure["name"]
            desc = measure.get("description", "")
            agg = measure.get("agg", "")
            agg_hint = _AGG_MAP.get(agg, agg.upper() if agg else None)

            columns[measure_name] = ColumnSemantic(
                description=desc,
                role="measure",
                aggregation_hint=agg_hint,
                format_hint=_FORMAT_MAP.get(measure.get("format", ""), None),
            )

        # Build table description
        table_desc = table_dict.get("description", "")
        business_role = ""
        if table_dict.get("domain"):
            business_role = f"Part of {table_dict['domain']} domain"
        if table_dict.get("grain"):
            grain = table_dict["grain"]
            business_role += f". Grain: {grain}" if business_role else f"Grain: {grain}"

        # Mark the default time dimension
        default_time_dim = table_dict.get("default_time_dimension")
        if default_time_dim and default_time_dim in columns:
            col = columns[default_time_dim]
            if col.role != "date":
                columns[default_time_dim] = ColumnSemantic(
                    description=col.description,
                    role="date",
                    business_meaning=col.business_meaning or "Default time dimension",
                    format_hint="date",
                )

        semantic_tables[table_name] = TableSemantic(
            description=table_desc,
            business_role=business_role,
            columns=columns,
        )

    # Populate key_dimensions (most frequent dimension names, top 10)
    dim_counts: dict[str, int] = {}
    for d in all_dimensions:
        dim_counts[d] = dim_counts.get(d, 0) + 1
    top_dims = sorted(dim_counts.items(), key=lambda x: -x[1])[:10]
    business_context.key_dimensions = [d for d, _ in top_dims]

    # Build relationships from joins
    relationships: list[Relationship] = []
    joins_list = joins_data.get("joins", [])
    for explore in joins_list:
        base_table = explore.get("base_table", "")
        for join in explore.get("joins", []):
            parsed = _parse_join_on(join.get("on", ""), base_table, join.get("table", ""), join.get("alias"))
            if parsed:
                from_table, from_col, to_table, to_col = parsed
                rel_type = join.get("relationship", "one_to_many")
                relationships.append(Relationship(
                    from_table=from_table,
                    from_column=from_col,
                    to_table=to_table,
                    to_column=to_col,
                    type=rel_type,
                    description=join.get("description"),
                ))

    # Build query patterns from derived metrics
    query_patterns: dict[str, QueryPattern] = {}
    for metric in metrics_list:
        if metric.get("type") == "derived" and metric.get("expression"):
            pattern_name = metric["name"]
            desc = metric.get("description", "")
            table = metric.get("table", "")
            query_patterns[pattern_name] = QueryPattern(
                description=desc or f"Derived metric: {pattern_name}",
                use_when=[pattern_name.replace("_", " "), desc] if desc else [pattern_name.replace("_", " ")],
                pattern=metric["expression"],
            )

    # Compute schema hash from input content
    schema_hash = _compute_schema_hash(input_dir)

    semantic_layer = SemanticLayer(
        version="1.0",
        generated_at=datetime.now(timezone.utc).isoformat(),
        source_name=source_name,
        schema_hash=schema_hash,
        business_context=business_context,
        tables=semantic_tables,
        relationships=relationships,
        query_patterns=query_patterns,
    )

    # Save to disk
    if output_path is None:
        output_path = os.path.join("sources", source_name, "semantic.yaml")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    semantic_layer.save(output_path)
    print(f"  Saved semantic layer to {output_path}")

    return semantic_layer


def _load_all_tables(input_dir: str) -> list[dict]:
    """Load all table YAML files from the tables/ subdirectory."""
    tables_dir = os.path.join(input_dir, "tables")
    all_tables = []

    if not os.path.isdir(tables_dir):
        return all_tables

    for filename in sorted(os.listdir(tables_dir)):
        if not filename.endswith(".yaml"):
            continue
        filepath = os.path.join(tables_dir, filename)
        data = _load_yaml(filepath)
        tables = data.get("tables", [])
        all_tables.extend(tables)

    return all_tables


def _load_yaml(path: str) -> dict:
    """Load a YAML file, returning empty dict if missing."""
    if not os.path.exists(path):
        print(f"  Warning: {path} not found, skipping")
        return {}
    with open(path) as f:
        return yaml.safe_load(f) or {}


def _parse_join_on(
    on_clause: str,
    base_table: str,
    join_table: str,
    alias: str | None,
) -> tuple[str, str, str, str] | None:
    """Parse a simple join ON clause into (from_table, from_col, to_table, to_col).

    Handles patterns like:
        "base.col = joined.col"
        "base.col = alias.col"

    For complex ON clauses (multi-condition, functions), extracts the first
    equality condition.
    """
    if not on_clause:
        return None

    # Take the first condition (before AND/OR)
    first_condition = on_clause.split(" AND ")[0].split(" OR ")[0].strip()

    # Look for simple equality: X.Y = A.B
    parts = first_condition.split("=")
    if len(parts) != 2:
        return None

    left = parts[0].strip()
    right = parts[1].strip()

    # Extract table.column from each side
    left_parts = left.split(".")
    right_parts = right.split(".")

    if len(left_parts) < 2 or len(right_parts) < 2:
        return None

    left_table = left_parts[-2]
    left_col = left_parts[-1]
    right_table = right_parts[-2]
    right_col = right_parts[-1]

    # Resolve aliases: if alias matches, use the actual table name
    effective_alias = alias or join_table
    if left_table == effective_alias:
        left_table = join_table
    elif left_table == base_table:
        pass  # already correct
    if right_table == effective_alias:
        right_table = join_table
    elif right_table == base_table:
        pass  # already correct

    return (left_table, left_col, right_table, right_col)


def _compute_schema_hash(input_dir: str) -> str:
    """Compute a hash from the metadata file for change detection."""
    metadata_path = os.path.join(input_dir, "metadata.yaml")
    if os.path.exists(metadata_path):
        with open(metadata_path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()[:12]
    return hashlib.sha256(input_dir.encode()).hexdigest()[:12]
