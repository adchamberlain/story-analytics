"""
AI-powered dbt Semantic Layer Builder (Proof of Concept)

Profiles data via DuckDB and uses Claude to generate a complete
dbt MetricFlow semantic layer (semantic_models + metrics + saved_queries).

Usage:
    python tools/build_semantic_layer.py --data-dir data/olist_ecommerce --output-dir output/generated_semantic_layer

Tiers:
    Tier 1 (default): Schema + data profiling only
    Tier 2 (--sql-corpus): Add existing SQL queries as context
    Tier 3 (--docs): Add business documentation as context
"""

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import duckdb
import yaml

# Add project root to path for .env loading
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass

import anthropic


# =============================================================================
# DATA PROFILER
# =============================================================================

@dataclass
class ColumnProfile:
    name: str
    dtype: str
    nullable: bool
    distinct_count: int
    null_count: int
    null_pct: float
    row_count: int
    # Optional stats depending on column type
    value_distribution: dict[str, int] | None = None  # low-cardinality
    sample_values: list[str] | None = None  # high-cardinality
    min_val: float | None = None
    max_val: float | None = None
    avg_val: float | None = None
    median_val: float | None = None
    min_date: str | None = None
    max_date: str | None = None


@dataclass
class TableProfile:
    name: str
    row_count: int
    columns: list[ColumnProfile]


@dataclass
class InferredRelationship:
    from_table: str
    from_column: str
    to_table: str
    to_column: str
    match_rate: float  # what % of from values exist in to


@dataclass
class DataProfile:
    tables: list[TableProfile]
    relationships: list[InferredRelationship]


class DataProfiler:
    """Profiles parquet data via DuckDB for semantic layer generation."""

    def __init__(self, data_dir: str):
        self.conn = duckdb.connect()
        self.data_dir = Path(data_dir)
        self.table_names: list[str] = []
        self._load_data()

    def _load_data(self):
        """Load all parquet files into DuckDB tables."""
        for subdir in sorted(self.data_dir.iterdir()):
            if not subdir.is_dir():
                continue
            parquet_files = list(subdir.glob("*.parquet"))
            if parquet_files:
                table_name = subdir.name
                self.conn.execute(
                    f"CREATE TABLE \"{table_name}\" AS "
                    f"SELECT * FROM read_parquet('{parquet_files[0]}')"
                )
                self.table_names.append(table_name)
        print(f"Loaded {len(self.table_names)} tables: {', '.join(self.table_names)}")

    def profile_all(self) -> DataProfile:
        """Profile all tables and infer relationships."""
        tables = []
        for name in self.table_names:
            print(f"  Profiling {name}...", end=" ", flush=True)
            t = self._profile_table(name)
            print(f"({t.row_count:,} rows, {len(t.columns)} cols)")
            tables.append(t)

        print("  Inferring relationships...")
        rels = self._infer_relationships(tables)
        print(f"  Found {len(rels)} relationships")

        return DataProfile(tables=tables, relationships=rels)

    def _profile_table(self, table_name: str) -> TableProfile:
        """Profile a single table."""
        row_count = self.conn.execute(
            f'SELECT COUNT(*) FROM "{table_name}"'
        ).fetchone()[0]

        col_info = self.conn.execute(
            f'DESCRIBE "{table_name}"'
        ).fetchall()

        columns = []
        for col_name, col_type, col_null, *_ in col_info:
            columns.append(
                self._profile_column(table_name, col_name, col_type, col_null, row_count)
            )

        return TableProfile(name=table_name, row_count=row_count, columns=columns)

    def _profile_column(
        self, table: str, col: str, dtype: str, nullable: str, row_count: int
    ) -> ColumnProfile:
        """Profile a single column."""
        stats = self.conn.execute(f"""
            SELECT
                COUNT(DISTINCT "{col}") as distinct_ct,
                SUM(CASE WHEN "{col}" IS NULL THEN 1 ELSE 0 END) as null_ct
            FROM "{table}"
        """).fetchone()

        distinct_count = stats[0]
        null_count = stats[1]
        null_pct = round(null_count / row_count * 100, 1) if row_count > 0 else 0

        profile = ColumnProfile(
            name=col,
            dtype=dtype,
            nullable=nullable != "NO",
            distinct_count=distinct_count,
            null_count=null_count,
            null_pct=null_pct,
            row_count=row_count,
        )

        # Low cardinality: get value distribution
        if 0 < distinct_count <= 30:
            rows = self.conn.execute(f"""
                SELECT "{col}", COUNT(*) as cnt
                FROM "{table}"
                WHERE "{col}" IS NOT NULL
                GROUP BY "{col}"
                ORDER BY cnt DESC
                LIMIT 30
            """).fetchall()
            profile.value_distribution = {str(v): c for v, c in rows}

        # High cardinality: get samples
        if distinct_count > 30:
            rows = self.conn.execute(f"""
                SELECT DISTINCT "{col}"
                FROM "{table}"
                WHERE "{col}" IS NOT NULL
                USING SAMPLE 10
            """).fetchall()
            profile.sample_values = [str(r[0]) for r in rows]

        # Numeric stats
        is_numeric = any(
            t in dtype.upper()
            for t in ["INT", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "BIGINT"]
        )
        if is_numeric and distinct_count > 0:
            try:
                nstats = self.conn.execute(f"""
                    SELECT
                        MIN("{col}"), MAX("{col}"),
                        AVG("{col}"),
                        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "{col}")
                    FROM "{table}"
                    WHERE "{col}" IS NOT NULL
                """).fetchone()
                profile.min_val = float(nstats[0]) if nstats[0] is not None else None
                profile.max_val = float(nstats[1]) if nstats[1] is not None else None
                profile.avg_val = round(float(nstats[2]), 2) if nstats[2] is not None else None
                profile.median_val = float(nstats[3]) if nstats[3] is not None else None
            except Exception:
                pass

        # Date/timestamp stats
        is_date = any(t in dtype.upper() for t in ["DATE", "TIMESTAMP"])
        if is_date and distinct_count > 0:
            try:
                dstats = self.conn.execute(f"""
                    SELECT MIN("{col}"), MAX("{col}")
                    FROM "{table}"
                    WHERE "{col}" IS NOT NULL
                """).fetchone()
                profile.min_date = str(dstats[0]) if dstats[0] else None
                profile.max_date = str(dstats[1]) if dstats[1] else None
            except Exception:
                pass

        return profile

    def _infer_relationships(self, tables: list[TableProfile]) -> list[InferredRelationship]:
        """Infer foreign key relationships by matching column names and values."""
        relationships = []

        # Build a map of column names to tables
        col_map: dict[str, list[tuple[str, ColumnProfile]]] = {}
        for table in tables:
            for col in table.columns:
                key = col.name.lower()
                col_map.setdefault(key, []).append((table.name, col))

        # Find columns that appear in multiple tables (likely foreign keys)
        for col_name, occurrences in col_map.items():
            if len(occurrences) < 2:
                continue

            # Find the table where this column is most likely the primary key
            # (highest distinct count relative to row count)
            best_pk = max(
                occurrences,
                key=lambda x: x[1].distinct_count / max(x[1].row_count, 1),
            )

            pk_table, pk_col = best_pk

            for fk_table, fk_col in occurrences:
                if fk_table == pk_table:
                    continue

                # Check value overlap
                try:
                    match_count = self.conn.execute(f"""
                        SELECT COUNT(DISTINCT f."{col_name}")
                        FROM "{fk_table}" f
                        INNER JOIN "{pk_table}" p ON f."{col_name}" = p."{col_name}"
                        WHERE f."{col_name}" IS NOT NULL
                    """).fetchone()[0]

                    fk_distinct = fk_col.distinct_count
                    match_rate = match_count / fk_distinct if fk_distinct > 0 else 0

                    if match_rate > 0.9:  # >90% of FK values exist in PK table
                        relationships.append(InferredRelationship(
                            from_table=fk_table,
                            from_column=col_name,
                            to_table=pk_table,
                            to_column=col_name,
                            match_rate=round(match_rate, 3),
                        ))
                except Exception:
                    pass

        return relationships

    def get_sample_rows(self, table_name: str, n: int = 3) -> list[dict]:
        """Get sample rows from a table."""
        rows = self.conn.execute(
            f'SELECT * FROM "{table_name}" USING SAMPLE {n}'
        ).fetchall()
        cols = [d[0] for d in self.conn.description]
        return [dict(zip(cols, [str(v) for v in row])) for row in rows]


# =============================================================================
# PROMPT BUILDER
# =============================================================================

def format_profile_for_prompt(profile: DataProfile) -> str:
    """Format the data profile into a structured prompt section."""
    lines = []

    for table in profile.tables:
        lines.append(f"## Table: {table.name} ({table.row_count:,} rows)")
        lines.append("")
        lines.append("| Column | Type | Nullable | Distinct | Nulls | Key Stats |")
        lines.append("|--------|------|----------|----------|-------|-----------|")

        for col in table.columns:
            stats_parts = []

            if col.value_distribution:
                top_3 = list(col.value_distribution.items())[:3]
                vals = ", ".join(f"{k} ({v:,})" for k, v in top_3)
                if len(col.value_distribution) > 3:
                    vals += f", ... ({len(col.value_distribution)} total values)"
                stats_parts.append(f"Values: {vals}")

            if col.min_val is not None:
                stats_parts.append(
                    f"Range: {col.min_val:,.2f} to {col.max_val:,.2f}, "
                    f"Avg: {col.avg_val:,.2f}, Median: {col.median_val:,.2f}"
                )

            if col.min_date:
                stats_parts.append(f"Range: {col.min_date} to {col.max_date}")

            if col.sample_values:
                stats_parts.append(f"Samples: {', '.join(col.sample_values[:5])}")

            stats = "; ".join(stats_parts) if stats_parts else ""

            lines.append(
                f"| {col.name} | {col.dtype} | {'Yes' if col.nullable else 'No'} | "
                f"{col.distinct_count:,} | {col.null_pct}% | {stats} |"
            )

        lines.append("")

    # Relationships
    if profile.relationships:
        lines.append("## Inferred Foreign Key Relationships")
        lines.append("")
        for rel in profile.relationships:
            lines.append(
                f"- {rel.from_table}.{rel.from_column} → "
                f"{rel.to_table}.{rel.to_column} "
                f"({rel.match_rate:.0%} match rate)"
            )
        lines.append("")

    return "\n".join(lines)


DBT_FORMAT_REFERENCE = """
## dbt MetricFlow YAML Format Reference

### semantic_models

```yaml
semantic_models:
  - name: <unique_name>
    description: |
      Multi-line description of what this model represents.
    model: ref('<dbt_model_name>')
    defaults:
      agg_time_dimension: <time_dimension_name>

    entities:
      - name: <entity_name>
        type: primary | unique | foreign | natural
        expr: <column_or_sql_expression>  # defaults to name if omitted

    dimensions:
      - name: <dimension_name>
        type: categorical | time
        description: <description>
        label: <display_name>
        expr: <column_or_sql_expression>  # defaults to name if omitted
        type_params:  # required for type: time
          time_granularity: day | week | month | quarter | year

    measures:
      - name: <measure_name>  # MUST be unique across ALL semantic models
        agg: sum | count | count_distinct | average | min | max | median
        expr: <column_or_sql_expression>
        description: <description>
        label: <display_name>
```

### metrics

**Simple** — wraps a single measure:
```yaml
metrics:
  - name: revenue
    label: Revenue
    description: Total revenue from delivered orders.
    type: simple
    type_params:
      measure: <measure_name>
    filter: |  # optional
      {{ Dimension('entity__dimension_name') }} = 'value'
```

**Derived** — expression combining other metrics:
```yaml
  - name: average_order_value
    label: Average Order Value
    type: derived
    type_params:
      expr: revenue / nullif(order_count, 0)
      metrics:
        - name: revenue
        - name: order_count
          alias: order_count  # optional alias for use in expr
          offset_window: 1 month  # optional time offset
```

**Cumulative** — running totals:
```yaml
  - name: cumulative_revenue
    type: cumulative
    type_params:
      measure: revenue
      window: 30 days  # optional; omit for all-time
      grain_to_date: month  # optional; for MTD/YTD
```

**Ratio** — numerator / denominator:
```yaml
  - name: conversion_rate
    type: ratio
    type_params:
      numerator: converted_users
      denominator: total_users
```

### saved_queries

```yaml
saved_queries:
  - name: monthly_overview
    label: Monthly Overview
    description: Key metrics by month.
    query_params:
      metrics:
        - revenue
        - order_count
      group_by:
        - TimeDimension('metric_time', 'month')
        - Dimension('entity__dimension_name')
      where:  # optional filters
        - "{{ Dimension('entity__dim') }} = 'value'"
```
"""


# =============================================================================
# SQL CORPUS EXTRACTION (Tier 2.5)
# =============================================================================

EXTRACTION_SYSTEM_PROMPT = """\
You are a senior analytics engineer analyzing a corpus of SQL queries to extract \
the implicit business logic and metric definitions they encode. Your job is to \
produce a concise, structured summary that captures HOW this organization thinks \
about their data — not the raw SQL itself.

Focus on extracting:
1. Metric definitions: What do they call things? How do they calculate revenue, GMV, etc.?
2. Standard filters: What WHERE clauses are always applied? (e.g., exclude canceled orders)
3. Join patterns: How do they connect tables? What's the standard join graph?
4. Naming conventions: Do they say "GMV" or "revenue"? "customers" or "users"?
5. Business rules: Any domain-specific logic embedded in CASE statements or comments
6. Key dimensions: What do they GROUP BY most often?
7. Derived calculations: Rates, ratios, per-unit metrics they compute

Output a YAML document with these sections. Be concise — this will be fed to another \
AI agent as context for generating a dbt semantic layer, so distill the essence."""


EXTRACTION_USER_TEMPLATE = """\
Analyze the following SQL queries written by analysts against this database. \
Extract the implicit business logic, metric definitions, naming conventions, \
and analytical patterns.

# SQL Queries

{sql_corpus}

# Output Format

Produce a YAML document with these sections:

```yaml
business_domain:
  description: "One paragraph describing what business this data represents"
  currency: "BRL/USD/etc"
  date_range: "approximate date range of the data"

metric_definitions:
  # Canonical metric names and their SQL definitions
  metric_name:
    description: "What this metric means"
    calculation: "SQL expression or plain English"
    standard_filters: "Filters always applied (e.g., delivered orders only)"
    notes: "Any caveats or business logic"

standard_filters:
  # Filters that are consistently applied across queries
  - name: "filter_name"
    sql: "WHERE clause or condition"
    when_applied: "When/why this filter is used"

join_patterns:
  # How tables are typically connected
  - tables: ["table1", "table2"]
    join_key: "column_name"
    join_type: "INNER/LEFT"
    notes: "When this join is used"

naming_conventions:
  # Preferred names for key concepts
  - concept: "What it represents"
    preferred_name: "What analysts call it"
    alternatives: ["other names seen"]

key_dimensions:
  # Most common GROUP BY columns
  - dimension: "column or expression"
    used_for: "What analysis this enables"

business_rules:
  # Domain-specific logic extracted from CASE statements, comments, etc.
  - rule: "Description of the business rule"
    sql_pattern: "How it appears in SQL"

analytical_patterns:
  # Common query structures (time series, cohort, funnel, etc.)
  - pattern: "Pattern name"
    description: "What it does"
    key_tables: ["tables involved"]
```

Be specific and use actual values from the queries. For metric_definitions, \
include the exact SQL calculation when clear from the queries."""


def extract_business_logic(sql_corpus: str, model: str = "claude-sonnet-4-5-20250929") -> str:
    """
    Extract structured business logic from a SQL corpus.

    This is the intermediate step between raw SQL and semantic layer generation.
    It compresses 50+ SQL queries into a concise business logic summary that
    captures metric definitions, filters, naming conventions, and patterns
    without the noise of individual query styles.
    """
    client = anthropic.Anthropic()

    user_prompt = EXTRACTION_USER_TEMPLATE.format(sql_corpus=sql_corpus)

    print(f"\n  Calling {model} for SQL extraction...")
    print(f"  SQL corpus: {len(sql_corpus):,} chars")

    start = time.time()
    response = client.messages.create(
        model=model,
        max_tokens=8192,
        system=EXTRACTION_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
        temperature=0.2,
    )
    elapsed = time.time() - start

    content = response.content[0].text
    usage = response.usage
    print(f"  Extraction: {usage.output_tokens:,} tokens in {elapsed:.1f}s")

    # Extract YAML from code blocks if present
    yaml_match = re.search(r'```ya?ml\s*(.*?)```', content, re.DOTALL)
    if yaml_match:
        return yaml_match.group(1).strip()

    return content


def build_system_prompt() -> str:
    return """You are an expert dbt analytics engineer who builds production-quality \
semantic layers using the dbt MetricFlow framework. You analyze database schemas and \
data profiles to generate comprehensive semantic_models, metrics, and saved_queries \
in valid dbt YAML format.

Your output must be EXACTLY valid dbt MetricFlow YAML that could be dropped into a \
real dbt project. Follow the format specification precisely.

Key principles:
1. Every measure name must be globally unique across all semantic models
2. Classify columns correctly: entities (join keys), dimensions (group by), measures (aggregate)
3. Define derived metrics for ratios, rates, and per-unit calculations
4. Include cumulative metrics for running totals and period-to-date
5. Use descriptive labels and descriptions that explain business meaning
6. Define saved_queries for the most common analytical questions
7. Infer business context from column names, data patterns, and relationships
8. Use the actual data distributions to write accurate descriptions (e.g., "97% of orders are delivered")

IMPORTANT: Output THREE separate YAML documents, clearly labeled:
1. `_semantic_models.yml` — all semantic model definitions
2. `_metrics.yml` — all metric definitions
3. `_saved_queries.yml` — common query patterns

Each YAML document must start with `version: 2` and the appropriate top-level key.
Separate each document with a line of `---` and a comment indicating the filename."""


def build_user_prompt(
    profile: DataProfile,
    sample_rows: dict[str, list[dict]],
    sql_corpus: str | None = None,
    business_logic: str | None = None,
    docs: str | None = None,
) -> str:
    """Build the user prompt with profiling data and optional context."""

    sections = []

    sections.append("# Database Profile\n")
    sections.append(format_profile_for_prompt(profile))

    # Sample rows
    sections.append("# Sample Rows\n")
    for table_name, rows in sample_rows.items():
        sections.append(f"## {table_name}")
        for i, row in enumerate(rows):
            sections.append(f"Row {i+1}: {json.dumps(row, default=str)}")
        sections.append("")

    # dbt format reference
    sections.append(DBT_FORMAT_REFERENCE)

    # Optional: Extracted business logic (Tier 2.5 — preferred over raw SQL)
    if business_logic:
        sections.append("""# Business Logic Extracted from Existing SQL Queries

The following business rules, metric definitions, and naming conventions were \
extracted from SQL queries that analysts actually run against this data. Use these \
as the authoritative source for:
- How metrics should be named and calculated
- What filters should be applied by default
- Which join patterns are standard
- What naming conventions to follow

""")
        sections.append(business_logic)
        sections.append("")

    # Optional: Raw SQL corpus (Tier 2 — fallback if no extraction)
    elif sql_corpus:
        sections.append("# Existing SQL Queries (learn metric patterns from these)\n")
        sections.append(sql_corpus)

    # Optional: business docs (Tier 3)
    if docs:
        sections.append("# Business Documentation\n")
        sections.append(docs)

    sections.append("""
# Your Task

Generate a complete dbt MetricFlow semantic layer for this data. Based on the
schema, data profiling, and relationships above:

1. **Semantic Models**: Create one semantic model per major table (or per logical
   fact/dimension). Each needs entities, dimensions, and measures. Every semantic
   model MUST have a time dimension set as the agg_time_dimension. If a table lacks
   a timestamp, you may need to create a denormalized fact table model that joins
   in the timestamp from a related table. Use `model: ref('model_name')` references.

2. **Metrics** (~30-50 metrics): Create metrics in these categories:
   - Revenue/value metrics (totals, averages, per-unit)
   - Volume metrics (counts, rates)
   - Growth metrics (month-over-month using offset_window)
   - Cumulative metrics (running totals, MTD)
   - Rate/ratio metrics (conversion rates, satisfaction rates)
   - Performance metrics specific to this business domain

3. **Saved Queries** (~8-12): Common analytical views that a business analyst
   would regularly need.

If business logic was provided above, use those metric names and definitions as the
canonical source. Prefer the naming conventions and calculation methods from the
business logic over your own inferences.

Output exactly three YAML documents separated by `---` lines.
Use the data distributions and value counts to write accurate, specific descriptions.
""")

    return "\n".join(sections)


# =============================================================================
# GENERATOR
# =============================================================================

def generate_semantic_layer(
    user_prompt: str,
    system_prompt: str,
    model: str = "claude-sonnet-4-5-20250929",
) -> str:
    """Call Claude API and return the raw response."""
    client = anthropic.Anthropic()

    print(f"\nCalling {model}...")
    print(f"Prompt size: ~{len(user_prompt):,} chars")

    start = time.time()
    response = client.messages.create(
        model=model,
        max_tokens=16384,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        temperature=0.3,
    )
    elapsed = time.time() - start

    content = response.content[0].text
    usage = response.usage
    print(f"Response: {usage.output_tokens:,} tokens in {elapsed:.1f}s")
    print(f"Input tokens: {usage.input_tokens:,}")

    return content


def parse_yaml_documents(response: str) -> dict[str, str]:
    """Parse the response into separate YAML documents."""
    documents = {}

    # Split on --- separators
    parts = re.split(r'\n---+\s*\n', response)

    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Extract YAML from code blocks if present
        yaml_match = re.search(r'```ya?ml\s*(.*?)```', part, re.DOTALL)
        if yaml_match:
            yaml_content = yaml_match.group(1).strip()
        else:
            yaml_content = part

        # Determine which file this is
        if 'semantic_models:' in yaml_content:
            documents['_semantic_models.yml'] = yaml_content
        elif 'saved_queries:' in yaml_content:
            documents['_saved_queries.yml'] = yaml_content
        elif 'metrics:' in yaml_content:
            documents['_metrics.yml'] = yaml_content

    return documents


def write_output(documents: dict[str, str], output_dir: str):
    """Write YAML documents to files."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    for filename, content in documents.items():
        filepath = output_path / filename
        filepath.write_text(content)
        print(f"  Wrote {filepath}")

    # Also save the raw response
    raw_path = output_path / "_raw_response.txt"
    raw_content = "\n\n---\n\n".join(documents.values())
    raw_path.write_text(raw_content)


# =============================================================================
# COMPARISON
# =============================================================================

def compare_to_reference(generated_dir: str, reference_dir: str):
    """Compare generated semantic layer to hand-built reference."""
    gen_path = Path(generated_dir)
    ref_path = Path(reference_dir)

    print("\n" + "=" * 70)
    print("COMPARISON: Generated vs Hand-Built Reference")
    print("=" * 70)

    for filename in ["_semantic_models.yml", "_metrics.yml", "_saved_queries.yml"]:
        gen_file = gen_path / filename
        ref_file = ref_path / filename

        if not gen_file.exists():
            print(f"\n{filename}: MISSING from generated output")
            continue
        if not ref_file.exists():
            print(f"\n{filename}: MISSING from reference")
            continue

        try:
            gen_data = yaml.safe_load(gen_file.read_text())
            ref_data = yaml.safe_load(ref_file.read_text())
        except yaml.YAMLError as e:
            print(f"\n{filename}: YAML parse error: {e}")
            continue

        print(f"\n--- {filename} ---")

        if filename == "_semantic_models.yml":
            _compare_semantic_models(gen_data, ref_data)
        elif filename == "_metrics.yml":
            _compare_metrics(gen_data, ref_data)
        elif filename == "_saved_queries.yml":
            _compare_saved_queries(gen_data, ref_data)


def _compare_semantic_models(gen: dict, ref: dict):
    gen_models = {m['name']: m for m in (gen or {}).get('semantic_models', [])}
    ref_models = {m['name']: m for m in (ref or {}).get('semantic_models', [])}

    print(f"  Generated: {len(gen_models)} models, Reference: {len(ref_models)} models")

    # Compare model names
    gen_names = set(gen_models.keys())
    ref_names = set(ref_models.keys())
    if gen_names & ref_names:
        print(f"  Matching: {gen_names & ref_names}")
    if gen_names - ref_names:
        print(f"  Extra in generated: {gen_names - ref_names}")
    if ref_names - gen_names:
        print(f"  Missing from generated: {ref_names - gen_names}")

    # Compare measures per model
    for name in gen_names | ref_names:
        gen_m = gen_models.get(name, {})
        ref_m = ref_models.get(name, {})
        gen_measures = {m['name'] for m in gen_m.get('measures', [])}
        ref_measures = {m['name'] for m in ref_m.get('measures', [])}
        gen_dims = {d['name'] for d in gen_m.get('dimensions', [])}
        ref_dims = {d['name'] for d in ref_m.get('dimensions', [])}

        print(f"\n  Model '{name}':")
        print(f"    Measures: {len(gen_measures)} generated vs {len(ref_measures)} reference")
        if ref_measures - gen_measures:
            print(f"    Missing measures: {ref_measures - gen_measures}")
        if gen_measures - ref_measures:
            print(f"    Extra measures: {gen_measures - ref_measures}")
        print(f"    Dimensions: {len(gen_dims)} generated vs {len(ref_dims)} reference")


def _compare_metrics(gen: dict, ref: dict):
    gen_metrics = {m['name']: m for m in (gen or {}).get('metrics', [])}
    ref_metrics = {m['name']: m for m in (ref or {}).get('metrics', [])}

    print(f"  Generated: {len(gen_metrics)} metrics, Reference: {len(ref_metrics)} metrics")

    # Compare by type
    gen_types = {}
    for m in gen_metrics.values():
        t = m.get('type', 'unknown')
        gen_types[t] = gen_types.get(t, 0) + 1
    ref_types = {}
    for m in ref_metrics.values():
        t = m.get('type', 'unknown')
        ref_types[t] = ref_types.get(t, 0) + 1

    print(f"  Generated by type: {gen_types}")
    print(f"  Reference by type: {ref_types}")

    # Matching metrics
    matching = set(gen_metrics.keys()) & set(ref_metrics.keys())
    gen_only = set(gen_metrics.keys()) - set(ref_metrics.keys())
    ref_only = set(ref_metrics.keys()) - set(gen_metrics.keys())

    print(f"  Exact name matches: {len(matching)}")
    if ref_only:
        print(f"  Missing from generated ({len(ref_only)}): {sorted(ref_only)}")
    if gen_only:
        print(f"  Extra in generated ({len(gen_only)}): {sorted(gen_only)}")


def _compare_saved_queries(gen: dict, ref: dict):
    gen_sq = {q['name'] for q in (gen or {}).get('saved_queries', [])}
    ref_sq = {q['name'] for q in (ref or {}).get('saved_queries', [])}

    print(f"  Generated: {len(gen_sq)} queries, Reference: {len(ref_sq)} queries")
    if gen_sq & ref_sq:
        print(f"  Matching: {gen_sq & ref_sq}")


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="AI-powered dbt Semantic Layer Builder")
    parser.add_argument(
        "--data-dir",
        default="data/olist_ecommerce",
        help="Path to directory containing parquet subdirectories",
    )
    parser.add_argument(
        "--output-dir",
        default="output/generated_semantic_layer",
        help="Where to write generated YAML files",
    )
    parser.add_argument(
        "--reference-dir",
        default="semantic_layer/olist/models/marts",
        help="Path to hand-built reference for comparison",
    )
    parser.add_argument(
        "--model",
        default="claude-sonnet-4-5-20250929",
        help="Claude model to use",
    )
    parser.add_argument(
        "--sql-corpus",
        help="Path to file containing example SQL queries (Tier 2)",
    )
    parser.add_argument(
        "--extract-sql",
        help="Path to SQL corpus to extract business logic from (Tier 2.5). "
             "Runs extraction agent first, then uses structured output as context.",
    )
    parser.add_argument(
        "--docs",
        help="Path to file containing business documentation (Tier 3)",
    )
    parser.add_argument(
        "--compare-only",
        action="store_true",
        help="Skip generation, just compare existing output to reference",
    )

    args = parser.parse_args()

    if args.compare_only:
        compare_to_reference(args.output_dir, args.reference_dir)
        return

    # Step 1: Profile the data
    print("=" * 70)
    print("STEP 1: Profiling data")
    print("=" * 70)
    profiler = DataProfiler(args.data_dir)
    profile = profiler.profile_all()

    # Get sample rows
    sample_rows = {}
    for table in profile.tables:
        sample_rows[table.name] = profiler.get_sample_rows(table.name, n=3)

    # Step 2: Build prompt
    print("\n" + "=" * 70)
    print("STEP 2: Building prompt")
    print("=" * 70)

    sql_corpus = None
    business_logic = None

    if args.extract_sql:
        # Tier 2.5: Extract business logic from SQL corpus first
        raw_sql = Path(args.extract_sql).read_text()
        print(f"  Loaded SQL corpus for extraction: {len(raw_sql):,} chars")

        print("\n" + "=" * 70)
        print("STEP 2a: Extracting business logic from SQL corpus")
        print("=" * 70)
        business_logic = extract_business_logic(raw_sql, model=args.model)
        print(f"  Extracted business logic: {len(business_logic):,} chars")

        # Save extracted logic for inspection
        output_path = Path(args.output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        (output_path / "_extracted_business_logic.yml").write_text(business_logic)
        print(f"  Saved to {output_path / '_extracted_business_logic.yml'}")

    elif args.sql_corpus:
        sql_corpus = Path(args.sql_corpus).read_text()
        print(f"  Loaded SQL corpus: {len(sql_corpus):,} chars")

    docs = None
    if args.docs:
        docs = Path(args.docs).read_text()
        print(f"  Loaded docs: {len(docs):,} chars")

    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(
        profile, sample_rows,
        sql_corpus=sql_corpus,
        business_logic=business_logic,
        docs=docs,
    )
    print(f"  System prompt: {len(system_prompt):,} chars")
    print(f"  User prompt: {len(user_prompt):,} chars")

    # Save prompt for inspection
    output_path = Path(args.output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    (output_path / "_prompt.txt").write_text(
        f"=== SYSTEM ===\n{system_prompt}\n\n=== USER ===\n{user_prompt}"
    )
    print(f"  Saved prompt to {output_path / '_prompt.txt'}")

    # Step 3: Generate
    print("\n" + "=" * 70)
    print("STEP 3: Generating semantic layer")
    print("=" * 70)
    response = generate_semantic_layer(user_prompt, system_prompt, model=args.model)

    # Save raw response
    (output_path / "_raw_response.txt").write_text(response)

    # Step 4: Parse and write
    print("\n" + "=" * 70)
    print("STEP 4: Writing output")
    print("=" * 70)
    documents = parse_yaml_documents(response)

    if not documents:
        print("ERROR: Could not parse any YAML documents from response")
        print("Raw response saved to _raw_response.txt")
        return

    write_output(documents, args.output_dir)

    # Validate YAML
    for filename, content in documents.items():
        try:
            yaml.safe_load(content)
            print(f"  {filename}: Valid YAML")
        except yaml.YAMLError as e:
            print(f"  {filename}: INVALID YAML - {e}")

    # Step 5: Compare to reference
    compare_to_reference(args.output_dir, args.reference_dir)


if __name__ == "__main__":
    main()
