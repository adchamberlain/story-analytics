"""Write Data Context YAML files from mapped output."""

import os
from collections import defaultdict
from datetime import datetime, timezone

import yaml

from .mapper import DataContextOutput, DataContextTable


def _table_to_dict(table: DataContextTable) -> dict:
    """Convert a DataContextTable to a YAML-serializable dict."""
    d: dict = {
        "name": table.name,
        "table": table.table_ref,
    }
    if table.description:
        d["description"] = table.description
    if table.grain:
        d["grain"] = table.grain
    if table.default_time_dimension:
        d["default_time_dimension"] = table.default_time_dimension
    if table.domain:
        d["tags"] = [table.domain]
        d["domain"] = table.domain
    if table.entities:
        d["entities"] = table.entities
    if table.dimensions:
        d["dimensions"] = table.dimensions
    if table.measures:
        d["measures"] = table.measures
    return d


def write_data_context(output: DataContextOutput, output_dir: str) -> None:
    """Write Data Context YAML files to output directory.

    Creates:
        output_dir/
        ├── metadata.yaml
        ├── tables/
        │   ├── <domain>.yaml  (one file per domain, or ungrouped.yaml)
        ├── metrics.yaml
        ├── joins.yaml
        └── knowledge/
            └── business_context.yaml
    """
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(os.path.join(output_dir, "tables"), exist_ok=True)
    os.makedirs(os.path.join(output_dir, "knowledge"), exist_ok=True)

    # --- metadata.yaml ---
    metadata = {
        "story_data_context": "0.1.0",
        "metadata": {
            "name": os.path.basename(output.repo_path.rstrip("/")),
            "description": f"Auto-extracted from LookML repository at {output.repo_path}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source": {
                "type": "lookml",
                "origin": output.repo_path,
                "extraction_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "extraction_method": "tools/extract_lookml.py",
            },
        },
        "adapter": {
            "type": output.connection if output.connection in ("snowflake", "bigquery", "redshift", "postgres") else "snowflake",
        },
    }
    _write_yaml(os.path.join(output_dir, "metadata.yaml"), metadata)

    # --- tables/*.yaml (grouped by domain) ---
    tables_by_domain: dict[str, list[dict]] = defaultdict(list)
    for table in output.tables:
        domain = table.domain or "ungrouped"
        tables_by_domain[domain].append(_table_to_dict(table))

    for domain, tables in tables_by_domain.items():
        _write_yaml(
            os.path.join(output_dir, "tables", f"{domain}.yaml"),
            {"tables": tables},
        )

    # --- metrics.yaml ---
    _write_yaml(
        os.path.join(output_dir, "metrics.yaml"),
        {"metrics": output.metrics},
    )

    # --- joins.yaml ---
    joins_list = []
    for join in output.joins:
        j: dict = {
            "name": join.name,
            "base_table": join.base_table,
        }
        if join.description:
            j["description"] = join.description
        if join.joins:
            j["joins"] = join.joins
        if join.always_filter:
            j["always_filter"] = join.always_filter
        if join.sql_always_where:
            j["sql_always_where"] = join.sql_always_where
        joins_list.append(j)

    _write_yaml(
        os.path.join(output_dir, "joins.yaml"),
        {"joins": joins_list},
    )

    # --- knowledge/business_context.yaml ---
    domains = sorted(set(t.domain for t in output.tables if t.domain))
    glossary = {}
    for table in output.tables:
        for m in table.measures:
            if m.get("description"):
                glossary[m["name"]] = m["description"]

    business_context = {
        "business_context": {
            "overview": f"Data context extracted from LookML repository. Contains {len(output.tables)} tables across {len(domains)} domains.",
            "domains": domains,
            "glossary": dict(list(glossary.items())[:50]),  # top 50 terms
        },
    }
    _write_yaml(
        os.path.join(output_dir, "knowledge", "business_context.yaml"),
        business_context,
    )


def _write_yaml(path: str, data: dict) -> None:
    """Write a dict to a YAML file with clean formatting."""
    with open(path, "w") as f:
        yaml.dump(
            data,
            f,
            default_flow_style=False,
            sort_keys=False,
            allow_unicode=True,
            width=120,
        )
