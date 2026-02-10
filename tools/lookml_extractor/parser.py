"""Parse LookML files into intermediate representations."""

import os
from pathlib import Path

import lkml

from .models import (
    LookMLDimension,
    LookMLExplore,
    LookMLJoinDef,
    LookMLMeasure,
    LookMLView,
    ParsedRepo,
)


def _parse_dimension(raw: dict) -> LookMLDimension:
    """Convert lkml dimension dict to LookMLDimension."""
    return LookMLDimension(
        name=raw["name"],
        type=raw.get("type", "string"),
        sql=raw.get("sql", ""),
        description=raw.get("description", ""),
        hidden=raw.get("hidden", "") == "yes",
        group_label=raw.get("group_label", ""),
        label=raw.get("label", ""),
        value_format=raw.get("value_format_name", ""),
        primary_key=raw.get("primary_key", "") == "yes",
    )


def _parse_dimension_group(raw: dict) -> LookMLDimension:
    """Convert lkml dimension_group dict to LookMLDimension.

    dimension_groups expand into multiple dimensions (one per timeframe),
    but we store them as a single dimension with timeframes list.
    The mapper will handle expansion.
    """
    return LookMLDimension(
        name=raw["name"],
        type=raw.get("type", "time"),
        sql=raw.get("sql", ""),
        description=raw.get("description", ""),
        hidden=raw.get("hidden", "") == "yes",
        group_label=raw.get("group_label", ""),
        label=raw.get("label", ""),
        value_format=raw.get("value_format_name", ""),
        timeframes=raw.get("timeframes", ["raw", "date", "week", "month", "quarter", "year"]),
        convert_tz=raw.get("convert_tz", "yes") != "no",
    )


def _parse_measure(raw: dict) -> LookMLMeasure:
    """Convert lkml measure dict to LookMLMeasure."""
    # lkml stores measure filters in 'filters__all' as list of dicts
    filters = []
    for f in raw.get("filters__all", []):
        if isinstance(f, dict):
            filters.append(f)

    return LookMLMeasure(
        name=raw["name"],
        type=raw.get("type", "count"),
        sql=raw.get("sql", ""),
        description=raw.get("description", ""),
        hidden=raw.get("hidden", "") == "yes",
        label=raw.get("label", ""),
        value_format=raw.get("value_format_name", ""),
        filters=filters,
        drill_fields=raw.get("drill_fields", []),
    )


def _parse_view(raw: dict, source_file: str) -> LookMLView:
    """Convert lkml view dict to LookMLView."""
    dimensions = [_parse_dimension(d) for d in raw.get("dimensions", [])]
    dimension_groups = [_parse_dimension_group(dg) for dg in raw.get("dimension_groups", [])]
    measures = [_parse_measure(m) for m in raw.get("measures", [])]

    # Derived table SQL
    derived_sql = ""
    dt = raw.get("derived_table", {})
    if isinstance(dt, dict):
        derived_sql = dt.get("sql", "")

    # Sets
    sets = {}
    for s in raw.get("sets", []):
        sets[s["name"]] = s.get("fields", [])

    return LookMLView(
        name=raw["name"],
        sql_table_name=raw.get("sql_table_name", ""),
        description=raw.get("description", ""),
        dimensions=dimensions + dimension_groups,
        measures=measures,
        sets=sets,
        derived_table_sql=derived_sql,
        source_file=source_file,
    )


def _parse_join(raw: dict) -> LookMLJoinDef:
    """Convert lkml join dict to LookMLJoinDef."""
    return LookMLJoinDef(
        view_name=raw["name"],
        sql_on=raw.get("sql_on", ""),
        relationship=raw.get("relationship", "many_to_one"),
        type=raw.get("type", "left_outer"),
        from_view=raw.get("from", ""),
        fields=raw.get("fields", []),
    )


def _parse_explore(raw: dict, source_file: str) -> LookMLExplore:
    """Convert lkml explore dict to LookMLExplore."""
    joins = [_parse_join(j) for j in raw.get("joins", [])]

    # Base view: 'from' overrides, 'view_name' overrides, otherwise same as explore name
    view_name = raw.get("from", raw.get("view_name", raw["name"]))

    # always_filter is a list of filter dicts in lkml
    always_filter = {}
    for f in raw.get("always_filter", []):
        if isinstance(f, dict):
            always_filter[f.get("name", "")] = f.get("value", "")

    return LookMLExplore(
        name=raw["name"],
        view_name=view_name,
        label=raw.get("label", ""),
        description=raw.get("description", ""),
        group_label=raw.get("group_label", ""),
        joins=joins,
        always_filter=always_filter,
        sql_always_where=raw.get("sql_always_where", ""),
        hidden=raw.get("hidden", "") == "yes",
        source_file=source_file,
    )


def parse_repo(repo_path: str) -> ParsedRepo:
    """Parse all LookML files in a repository.

    Args:
        repo_path: Path to the root of the LookML repository.

    Returns:
        ParsedRepo with all views and explores.
    """
    repo = Path(repo_path)
    parsed = ParsedRepo(repo_path=str(repo))
    errors: list[str] = []

    for lkml_file in sorted(repo.rglob("*.lkml")):
        rel_path = str(lkml_file.relative_to(repo))
        try:
            content = lkml_file.read_text()
            result = lkml.load(content)
        except (lkml.LkmlError, UnicodeDecodeError) as e:
            errors.append(f"{rel_path}: {e}")
            continue

        # Extract connection from model files
        if result.get("connection") and not parsed.connection:
            parsed.connection = result["connection"]

        # Parse views
        for raw_view in result.get("views", []):
            view = _parse_view(raw_view, rel_path)
            parsed.views[view.name] = view

        # Parse explores
        for raw_explore in result.get("explores", []):
            # Skip hidden explores and extension bases
            if raw_explore.get("extension", "") == "required":
                continue
            explore = _parse_explore(raw_explore, rel_path)
            parsed.explores.append(explore)

    if errors:
        print(f"  Warnings: {len(errors)} files had parse errors")
        for err in errors[:5]:
            print(f"    {err}")

    return parsed
