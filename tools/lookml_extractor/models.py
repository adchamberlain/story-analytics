"""Intermediate representations for parsed LookML constructs."""

from dataclasses import dataclass, field


@dataclass
class LookMLDimension:
    name: str
    type: str  # string, number, yesno, tier, time, date, etc.
    sql: str  # raw SQL expression
    description: str = ""
    hidden: bool = False
    group_label: str = ""
    label: str = ""
    value_format: str = ""
    primary_key: bool = False
    # For dimension_groups (type=time):
    timeframes: list[str] = field(default_factory=list)
    convert_tz: bool = True


@dataclass
class LookMLMeasure:
    name: str
    type: str  # sum, count, count_distinct, average, median, number, string, etc.
    sql: str
    description: str = ""
    hidden: bool = False
    label: str = ""
    value_format: str = ""
    filters: list[dict] = field(default_factory=list)  # [{field: str, value: str}]
    drill_fields: list[str] = field(default_factory=list)


@dataclass
class LookMLView:
    name: str
    sql_table_name: str = ""
    description: str = ""
    dimensions: list[LookMLDimension] = field(default_factory=list)
    measures: list[LookMLMeasure] = field(default_factory=list)
    sets: dict[str, list[str]] = field(default_factory=dict)
    derived_table_sql: str = ""
    # Source tracking
    source_file: str = ""


@dataclass
class LookMLJoinDef:
    view_name: str  # the 'name' key in lkml output
    sql_on: str
    relationship: str  # many_to_one, one_to_many, one_to_one, many_to_many
    type: str = "left_outer"
    from_view: str = ""  # if join uses 'from:' to alias
    fields: list[str] = field(default_factory=list)


@dataclass
class LookMLExplore:
    name: str
    view_name: str  # base view (from: value or same as name)
    label: str = ""
    description: str = ""
    group_label: str = ""
    joins: list[LookMLJoinDef] = field(default_factory=list)
    always_filter: dict[str, str] = field(default_factory=dict)
    sql_always_where: str = ""
    hidden: bool = False
    # Source tracking
    source_file: str = ""


@dataclass
class ParsedRepo:
    """Container for all parsed LookML constructs from a repository."""
    views: dict[str, LookMLView] = field(default_factory=dict)  # keyed by view name
    explores: list[LookMLExplore] = field(default_factory=list)
    connection: str = ""  # from model files
    repo_path: str = ""
