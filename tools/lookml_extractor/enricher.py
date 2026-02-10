"""LLM-powered enrichment of extracted Data Context.

Takes mechanically-extracted tables/metrics YAML and enriches it with:
- Table descriptions inferred from measures, dimensions, and SQL
- Improved measure/dimension descriptions
- Deduplicated and scoped metric names (e.g., `count` → `opportunity_count`)
- Key metric identification (tier: certified)
- Derived metric suggestions (ratios, rates, period-over-period)
- Glossary entries from domain knowledge
- Data quirk flags

Processes one domain at a time to stay within token limits.
Outputs deltas that merge on top of the raw extraction.
"""

import os
import re
import time
import traceback
from collections import defaultdict
from dataclasses import dataclass, field

import yaml

try:
    import anthropic
except ImportError:
    anthropic = None  # type: ignore[assignment]


# --- Prompt templates ---

SYSTEM_PROMPT = """\
You are a senior data analyst documenting a company's data warehouse. You've been given \
mechanically-extracted table definitions from LookML. Your job is to add business context, \
improve descriptions, deduplicate metrics, and suggest derived metrics.

You are precise and concise. You write descriptions that a business user would find helpful — \
not just restating column names, but explaining what the data means and how it's used.

Rules:
- Only output YAML in the specified format
- Only describe things you can reasonably infer from the table structure, SQL expressions, \
  and measure definitions
- When you're unsure, say so in the description (e.g., "Likely represents...")
- For metric renaming, always prefix generic names with the table/domain context
- For derived metrics, only suggest ones where both operands exist as measures
"""

USER_PROMPT_TEMPLATE = """\
## Domain: {domain}

This domain contains {table_count} tables. Here are the full table definitions:

```yaml
{tables_yaml}
```

## Current Metrics for This Domain

```yaml
{metrics_yaml}
```

## Your Tasks

Analyze these tables and produce enrichments in the following YAML format. \
Output ONLY the YAML block — no other text.

```yaml
tables:
  <table_name>:
    description: "Inferred description of what this table represents"
    dimensions:
      <dim_name>:
        description: "Improved description"
    measures:
      <measure_name>:
        description: "Improved description"

metrics:
  rename:
    <old_name>: <new_scoped_name>
  add:
    - name: <derived_metric_name>
      type: derived
      expression: "<measure1> / <measure2>"
      description: "What this ratio/rate measures"
      table: <source_table>
  certify:
    - <metric_name>

glossary:
  <term>: "<definition>"

data_quirks:
  - table: "<table_name>"
    issue: "<description of the quirk or potential data quality issue>"
```

### Specific instructions:

1. **Table descriptions**: Every table MUST get a description. Infer from table name, \
its measures, dimensions, and SQL expressions what business process or entity it represents.

2. **Measure/dimension descriptions**: Focus on measures and dimensions that currently \
lack descriptions. Use SQL expressions, labels, CASE statements, and naming conventions \
to infer meaning. Skip dimensions/measures that already have good descriptions.

3. **Metric renaming**: Generic metric names that appear in multiple tables need scoping. \
For example, if table `opportunity` has a metric called `count`, rename it to \
`opportunity_count`. Only rename metrics that are ambiguous — if a metric name is already \
unique and descriptive, leave it alone. Use the format `old_name: new_name` in the rename map. \
IMPORTANT: the old_name must exactly match a metric name from the Current Metrics section.

4. **Key metrics (certify)**: Identify the 3-8 most important metrics per domain. \
These should be the ones a business user would care about most — revenue, counts of key \
entities, conversion rates, etc.

5. **Derived metrics**: Suggest ratios, rates, or averages that can be computed from \
existing measures. Only suggest ones where the component measures actually exist in the tables. \
Common patterns: conversion rates, average per entity, cost per unit, growth rates.

6. **Glossary**: Extract 5-15 business terms from this domain. Include abbreviations \
(ARR, MRR, CSAT), domain-specific terms, and any terms whose meaning isn't obvious.

7. **Data quirks**: Flag unusual SQL patterns, potential data quality issues, or \
naming inconsistencies. Examples: columns with `__c` suffix (Salesforce custom fields), \
measures with suspicious filters, tables that look like duplicates.

Output ONLY the YAML block. Do not include any text before or after the YAML.
"""


# --- Data structures ---

@dataclass
class DomainEnrichment:
    """Enrichment results for a single domain."""
    domain: str
    table_descriptions: dict[str, str] = field(default_factory=dict)
    dimension_descriptions: dict[str, dict[str, str]] = field(default_factory=dict)
    measure_descriptions: dict[str, dict[str, str]] = field(default_factory=dict)
    metric_renames: dict[str, str] = field(default_factory=dict)
    derived_metrics: list[dict] = field(default_factory=list)
    certified_metrics: list[str] = field(default_factory=list)
    glossary: dict[str, str] = field(default_factory=dict)
    data_quirks: list[dict] = field(default_factory=list)


@dataclass
class EnrichmentResult:
    """Combined enrichment results across all domains."""
    domain_enrichments: list[DomainEnrichment] = field(default_factory=list)
    # Aggregated
    all_table_descriptions: dict[str, str] = field(default_factory=dict)
    all_metric_renames: dict[str, str] = field(default_factory=dict)
    all_derived_metrics: list[dict] = field(default_factory=list)
    all_certified_metrics: list[str] = field(default_factory=list)
    all_glossary: dict[str, str] = field(default_factory=dict)
    all_data_quirks: list[dict] = field(default_factory=list)


@dataclass
class EnrichmentSummary:
    """Summary statistics from enrichment run."""
    domains_processed: int = 0
    domains_failed: int = 0
    tables_described: int = 0
    measures_described: int = 0
    dimensions_described: int = 0
    metrics_renamed: int = 0
    metrics_derived: int = 0
    metrics_certified: int = 0
    glossary_terms: int = 0
    data_quirks: int = 0
    total_api_time_s: float = 0.0
    failed_domains: list[str] = field(default_factory=list)


# --- YAML extraction ---

_FENCE_LINE_RE = re.compile(r"^\s*`{3,}\s*(ya?ml)?\s*$")


def _salvage_truncated_yaml(content: str) -> str:
    """Try to salvage a truncated YAML response by removing the incomplete last line.

    When the LLM hits max_tokens, the response often ends mid-string or mid-line.
    We remove lines from the end until we get valid-looking YAML.
    """
    lines = content.rstrip().split("\n")
    # Remove the last line which is likely truncated mid-value
    while lines:
        last = lines[-1].strip()
        # If line looks complete (ends with a YAML value), stop removing
        if not last or last.endswith(":") or last.endswith("\"") or last.endswith("'"):
            lines.pop()
            continue
        # Check for unclosed quotes
        if last.count('"') % 2 != 0 or last.count("'") % 2 != 0:
            lines.pop()
            continue
        break
    return "\n".join(lines)


def _extract_yaml_from_response(content: str) -> dict:
    """Extract YAML from an LLM response, handling code fences.

    Uses a line-based approach: finds the first YAML-relevant line (starting
    with a YAML key like 'tables:', 'metrics:', etc.) and the last one, then
    extracts everything between them. This handles all fence variants robustly.

    If YAML parsing fails (e.g., truncated response), tries salvaging by
    removing the last few lines until valid YAML is obtained.
    """
    lines = content.strip().split("\n")

    # Strip all fence lines (```yaml, ```, etc.)
    stripped = [l for l in lines if not _FENCE_LINE_RE.match(l)]

    # Find first and last lines that look like YAML content
    # (not prose — prose lines don't start with valid YAML keys or whitespace+key)
    first_yaml = -1
    last_yaml = -1
    for i, line in enumerate(stripped):
        # A YAML content line starts with a key (word + colon) or whitespace (indented)
        s = line.strip()
        if not s:
            continue
        if re.match(r"^[\w].*:", line) or line.startswith(" ") or line.startswith("\t") or line.startswith("-"):
            if first_yaml == -1:
                first_yaml = i
            last_yaml = i

    if first_yaml == -1:
        return {}

    yaml_lines = stripped[first_yaml:last_yaml + 1]
    yaml_str = "\n".join(yaml_lines).strip()

    try:
        return yaml.safe_load(yaml_str) or {}
    except yaml.YAMLError:
        # Try salvaging truncated YAML by removing lines from the end
        for trim in range(1, min(20, len(yaml_lines))):
            salvaged = "\n".join(yaml_lines[:-trim]).strip()
            try:
                result = yaml.safe_load(salvaged)
                if result:
                    return result
            except yaml.YAMLError:
                continue
        return {}


# --- Domain enrichment ---

def _build_domain_tables_yaml(tables: list[dict]) -> str:
    """Build a YAML string of tables for a domain, suitable for the prompt."""
    return yaml.dump(
        {"tables": tables},
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=120,
    )


def _build_domain_metrics_yaml(metrics: list[dict]) -> str:
    """Build a YAML string of metrics for a domain."""
    return yaml.dump(
        {"metrics": metrics},
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=120,
    )


def _parse_domain_enrichment(domain: str, raw: dict) -> DomainEnrichment:
    """Parse raw YAML response into a DomainEnrichment."""
    enrichment = DomainEnrichment(domain=domain)

    # Table/dimension/measure descriptions
    tables_section = raw.get("tables", {})
    if isinstance(tables_section, dict):
        for table_name, table_data in tables_section.items():
            if not isinstance(table_data, dict):
                continue
            desc = table_data.get("description")
            if desc:
                enrichment.table_descriptions[table_name] = desc

            dims = table_data.get("dimensions", {})
            if isinstance(dims, dict) and dims:
                enrichment.dimension_descriptions[table_name] = {
                    k: v.get("description", v) if isinstance(v, dict) else str(v)
                    for k, v in dims.items()
                    if v
                }

            measures = table_data.get("measures", {})
            if isinstance(measures, dict) and measures:
                enrichment.measure_descriptions[table_name] = {
                    k: v.get("description", v) if isinstance(v, dict) else str(v)
                    for k, v in measures.items()
                    if v
                }

    # Metric operations
    metrics_section = raw.get("metrics", {})
    if isinstance(metrics_section, dict):
        enrichment.metric_renames = metrics_section.get("rename", {}) or {}
        enrichment.derived_metrics = metrics_section.get("add", []) or []
        enrichment.certified_metrics = metrics_section.get("certify", []) or []

    # Glossary
    enrichment.glossary = raw.get("glossary", {}) or {}

    # Data quirks
    enrichment.data_quirks = raw.get("data_quirks", []) or []

    return enrichment


_MAX_TABLES_PER_BATCH = 10  # Keep batches small enough for token limits


def _enrich_batch(
    domain: str,
    tables: list[dict],
    metrics: list[dict],
    model: str,
    client: "anthropic.Anthropic",
    batch_label: str = "",
) -> DomainEnrichment:
    """Enrich a single batch of tables via one API call."""
    tables_yaml = _build_domain_tables_yaml(tables)
    metrics_yaml = _build_domain_metrics_yaml(metrics)

    user_prompt = USER_PROMPT_TEMPLATE.format(
        domain=domain,
        table_count=len(tables),
        tables_yaml=tables_yaml,
        metrics_yaml=metrics_yaml,
    )

    response = client.messages.create(
        model=model,
        max_tokens=16384,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
        temperature=0.3,
    )

    content = response.content[0].text

    # Check if response was truncated (hit max_tokens)
    if response.stop_reason == "max_tokens":
        content = _salvage_truncated_yaml(content)

    raw = _extract_yaml_from_response(content)
    return _parse_domain_enrichment(domain, raw)


def _merge_domain_enrichments(enrichments: list[DomainEnrichment], domain: str) -> DomainEnrichment:
    """Merge multiple batch enrichments for the same domain into one."""
    merged = DomainEnrichment(domain=domain)
    for e in enrichments:
        merged.table_descriptions.update(e.table_descriptions)
        for tname, descs in e.dimension_descriptions.items():
            merged.dimension_descriptions.setdefault(tname, {}).update(descs)
        for tname, descs in e.measure_descriptions.items():
            merged.measure_descriptions.setdefault(tname, {}).update(descs)
        merged.metric_renames.update(e.metric_renames)
        merged.derived_metrics.extend(e.derived_metrics)
        merged.certified_metrics.extend(e.certified_metrics)
        merged.glossary.update(e.glossary)
        merged.data_quirks.extend(e.data_quirks)
    return merged


def enrich_domain(
    domain: str,
    tables: list[dict],
    metrics: list[dict],
    model: str = "claude-sonnet-4-5-20250929",
) -> DomainEnrichment:
    """Enrich a single domain's tables and metrics via LLM.

    Automatically batches large domains into multiple API calls.

    Args:
        domain: Domain name (e.g., "finance", "orgm")
        tables: List of table dicts from the domain YAML
        metrics: List of metric dicts relevant to this domain
        model: Anthropic model ID

    Returns:
        DomainEnrichment with all enrichment deltas

    Raises:
        RuntimeError: If anthropic package is not installed
        anthropic.APIError: If the API call fails
    """
    if anthropic is None:
        raise RuntimeError("anthropic package is required for enrichment. Install with: pip install anthropic")

    client = anthropic.Anthropic()

    # Small domain: single call
    if len(tables) <= _MAX_TABLES_PER_BATCH:
        return _enrich_batch(domain, tables, metrics, model, client)

    # Large domain: split into batches
    batches: list[list[dict]] = []
    for i in range(0, len(tables), _MAX_TABLES_PER_BATCH):
        batches.append(tables[i:i + _MAX_TABLES_PER_BATCH])

    batch_enrichments: list[DomainEnrichment] = []
    for batch_idx, batch_tables in enumerate(batches):
        # Filter metrics to only those referenced by this batch's tables
        batch_measure_names = set()
        for t in batch_tables:
            for m in t.get("measures", []):
                batch_measure_names.add(m["name"])
        batch_metrics = [m for m in metrics if m.get("measure") in batch_measure_names]

        label = f"batch {batch_idx + 1}/{len(batches)}"
        print(f"      {label}: {len(batch_tables)} tables, {len(batch_metrics)} metrics")

        enrichment = _enrich_batch(domain, batch_tables, batch_metrics, model, client, label)
        batch_enrichments.append(enrichment)

    return _merge_domain_enrichments(batch_enrichments, domain)


# --- Merge enrichments into existing data ---

def apply_enrichments(
    tables: list[dict],
    metrics: list[dict],
    enrichment: EnrichmentResult,
) -> tuple[list[dict], list[dict]]:
    """Apply enrichments to existing tables and metrics.

    Creates copies — does not mutate originals.

    Args:
        tables: All table dicts from the extraction
        metrics: All metric dicts from the extraction
        enrichment: Combined EnrichmentResult

    Returns:
        (enriched_tables, enriched_metrics) tuple
    """
    import copy
    enriched_tables = copy.deepcopy(tables)
    enriched_metrics = copy.deepcopy(metrics)

    # Build lookup for table descriptions, dimension/measure descriptions
    all_dim_descs: dict[str, dict[str, str]] = {}
    all_meas_descs: dict[str, dict[str, str]] = {}
    for de in enrichment.domain_enrichments:
        all_dim_descs.update(de.dimension_descriptions)
        all_meas_descs.update(de.measure_descriptions)

    # Apply table-level enrichments
    for table in enriched_tables:
        tname = table["name"]

        # Add table description if missing
        if not table.get("description") and tname in enrichment.all_table_descriptions:
            table["description"] = enrichment.all_table_descriptions[tname]

        # Add dimension descriptions
        if tname in all_dim_descs:
            dim_descs = all_dim_descs[tname]
            for dim in table.get("dimensions", []):
                if not dim.get("description") and dim["name"] in dim_descs:
                    dim["description"] = dim_descs[dim["name"]]

        # Add measure descriptions
        if tname in all_meas_descs:
            meas_descs = all_meas_descs[tname]
            for meas in table.get("measures", []):
                if not meas.get("description") and meas["name"] in meas_descs:
                    meas["description"] = meas_descs[meas["name"]]

    # Apply metric renames
    rename_map = enrichment.all_metric_renames
    if rename_map:
        for metric in enriched_metrics:
            old_name = metric["name"]
            if old_name in rename_map:
                metric["name"] = rename_map[old_name]
                if not metric.get("original_name"):
                    metric["original_name"] = old_name

    # Add derived metrics
    for derived in enrichment.all_derived_metrics:
        enriched_metrics.append({
            "name": derived.get("name", "unnamed"),
            "type": "derived",
            "expression": derived.get("expression", ""),
            "description": derived.get("description", ""),
            "table": derived.get("table", ""),
        })

    # Mark certified metrics
    certified_set = set(enrichment.all_certified_metrics)
    for metric in enriched_metrics:
        if metric["name"] in certified_set:
            metric["tier"] = "certified"

    # Deduplicate metrics: if multiple metrics have the same name after renames,
    # keep the first one with a description, or just the first one
    seen: dict[str, int] = {}
    deduped_metrics: list[dict] = []
    for metric in enriched_metrics:
        name = metric["name"]
        if name in seen:
            # Keep the one with the better description
            existing_idx = seen[name]
            existing = deduped_metrics[existing_idx]
            if not existing.get("description") and metric.get("description"):
                deduped_metrics[existing_idx] = metric
            # Otherwise skip the duplicate
        else:
            seen[name] = len(deduped_metrics)
            deduped_metrics.append(metric)

    return enriched_tables, deduped_metrics


# --- Orchestrator ---

def enrich_data_context(
    input_dir: str,
    output_dir: str | None = None,
    model: str = "claude-sonnet-4-5-20250929",
) -> EnrichmentSummary:
    """Enrich an entire extracted Data Context directory.

    Reads domain YAML files from input_dir/tables/, enriches each domain
    via LLM, merges results, and writes to output_dir.

    Args:
        input_dir: Directory containing extracted Data Context
        output_dir: Directory for enriched output. If None, writes to input_dir/enriched/
        model: Anthropic model ID

    Returns:
        EnrichmentSummary with statistics
    """
    if output_dir is None:
        output_dir = os.path.join(input_dir, "enriched")

    tables_dir = os.path.join(input_dir, "tables")
    metrics_path = os.path.join(input_dir, "metrics.yaml")

    # Load all metrics
    with open(metrics_path) as f:
        all_metrics_data = yaml.safe_load(f)
    all_metrics: list[dict] = all_metrics_data.get("metrics", [])

    # Build table→metrics index (metrics reference measures, measures belong to tables)
    # Since metrics don't have a table field, we match by measure name to table measures
    table_measure_names: dict[str, set[str]] = {}  # table_name → set of measure names
    all_tables: list[dict] = []

    # Load all domain files
    domain_files = sorted(
        f for f in os.listdir(tables_dir) if f.endswith(".yaml")
    )

    domain_tables: dict[str, list[dict]] = {}
    for fname in domain_files:
        domain = fname.replace(".yaml", "")
        with open(os.path.join(tables_dir, fname)) as f:
            data = yaml.safe_load(f)
        tables = data.get("tables", [])
        domain_tables[domain] = tables
        all_tables.extend(tables)

        for table in tables:
            tname = table["name"]
            table_measure_names[tname] = {
                m["name"] for m in table.get("measures", [])
            }

    # Map metrics to domains by matching measure names to table measures
    domain_metrics: dict[str, list[dict]] = defaultdict(list)
    for metric in all_metrics:
        measure_name = metric.get("measure", metric.get("name", ""))
        for domain, tables in domain_tables.items():
            for table in tables:
                if measure_name in {m["name"] for m in table.get("measures", [])}:
                    domain_metrics[domain].append(metric)
                    break

    # Process each domain
    summary = EnrichmentSummary()
    result = EnrichmentResult()

    for domain in sorted(domain_tables.keys()):
        tables = domain_tables[domain]
        metrics = domain_metrics.get(domain, [])

        print(f"  Enriching domain: {domain} ({len(tables)} tables, {len(metrics)} metrics)...")
        t0 = time.time()

        try:
            enrichment = enrich_domain(domain, tables, metrics, model=model)
            elapsed = time.time() - t0
            summary.total_api_time_s += elapsed

            result.domain_enrichments.append(enrichment)
            result.all_table_descriptions.update(enrichment.table_descriptions)
            result.all_metric_renames.update(enrichment.metric_renames)
            result.all_derived_metrics.extend(enrichment.derived_metrics)
            result.all_certified_metrics.extend(enrichment.certified_metrics)
            result.all_glossary.update(enrichment.glossary)
            result.all_data_quirks.extend(enrichment.data_quirks)

            summary.domains_processed += 1
            summary.tables_described += len(enrichment.table_descriptions)
            summary.measures_described += sum(
                len(v) for v in enrichment.measure_descriptions.values()
            )
            summary.dimensions_described += sum(
                len(v) for v in enrichment.dimension_descriptions.values()
            )
            summary.metrics_renamed += len(enrichment.metric_renames)
            summary.metrics_derived += len(enrichment.derived_metrics)
            summary.metrics_certified += len(enrichment.certified_metrics)
            summary.glossary_terms += len(enrichment.glossary)
            summary.data_quirks += len(enrichment.data_quirks)

            print(f"    Done in {elapsed:.1f}s: {len(enrichment.table_descriptions)} descriptions, "
                  f"{len(enrichment.metric_renames)} renames, "
                  f"{len(enrichment.derived_metrics)} derived metrics")

        except (AttributeError, TypeError, KeyError) as e:
            # Programming bugs — fail loudly
            traceback.print_exc()
            raise
        except Exception as e:
            # API errors, YAML parse errors — log and continue
            traceback.print_exc()
            print(f"    FAILED: {e}")
            summary.domains_failed += 1
            summary.failed_domains.append(domain)

    # Apply enrichments to all tables and metrics
    print(f"\n  Merging enrichments...")
    enriched_tables, enriched_metrics = apply_enrichments(all_tables, all_metrics, result)

    # Write enriched output
    _write_enriched_output(
        enriched_tables, enriched_metrics, result, input_dir, output_dir
    )

    print(f"  Wrote enriched output to {output_dir}/")
    return summary


def _write_enriched_output(
    enriched_tables: list[dict],
    enriched_metrics: list[dict],
    result: EnrichmentResult,
    input_dir: str,
    output_dir: str,
) -> None:
    """Write enriched Data Context files to output directory."""
    import shutil

    os.makedirs(output_dir, exist_ok=True)
    tables_out = os.path.join(output_dir, "tables")
    os.makedirs(tables_out, exist_ok=True)
    knowledge_out = os.path.join(output_dir, "knowledge")
    os.makedirs(knowledge_out, exist_ok=True)

    # Copy metadata.yaml and joins.yaml from input (unchanged)
    for fname in ("metadata.yaml", "joins.yaml"):
        src = os.path.join(input_dir, fname)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(output_dir, fname))

    # Group enriched tables by domain and write
    tables_by_domain: dict[str, list[dict]] = defaultdict(list)
    for table in enriched_tables:
        domain = table.get("domain", "ungrouped")
        tables_by_domain[domain].append(table)

    for domain, tables in tables_by_domain.items():
        _write_yaml(
            os.path.join(tables_out, f"{domain}.yaml"),
            {"tables": tables},
        )

    # Write enriched metrics
    _write_yaml(
        os.path.join(output_dir, "metrics.yaml"),
        {"metrics": enriched_metrics},
    )

    # Write enriched knowledge base
    # Merge existing business_context with new glossary
    existing_bc_path = os.path.join(input_dir, "knowledge", "business_context.yaml")
    existing_glossary: dict[str, str] = {}
    existing_domains: list[str] = []
    if os.path.exists(existing_bc_path):
        with open(existing_bc_path) as f:
            existing_bc = yaml.safe_load(f)
        if existing_bc and "business_context" in existing_bc:
            existing_glossary = existing_bc["business_context"].get("glossary", {}) or {}
            existing_domains = existing_bc["business_context"].get("domains", []) or []

    # Merge glossaries (new entries override old)
    merged_glossary = {**existing_glossary, **result.all_glossary}

    business_context = {
        "business_context": {
            "overview": f"Enriched data context. {len(enriched_tables)} tables, "
                        f"{len(enriched_metrics)} metrics ({len(result.all_derived_metrics)} derived), "
                        f"{len(result.all_certified_metrics)} certified.",
            "domains": existing_domains,
            "glossary": dict(sorted(merged_glossary.items())),
            "data_quirks": result.all_data_quirks,
        },
    }
    _write_yaml(
        os.path.join(knowledge_out, "business_context.yaml"),
        business_context,
    )

    # Write enrichment summary file (for human review)
    _write_enrichment_report(output_dir, result)


def _write_enrichment_report(output_dir: str, result: EnrichmentResult) -> None:
    """Write a human-readable enrichment report."""
    lines: list[str] = []
    lines.append("# Enrichment Report")
    lines.append("")
    lines.append("## Metric Renames")
    lines.append("")
    if result.all_metric_renames:
        lines.append("| Original | Renamed To |")
        lines.append("|----------|-----------|")
        for old, new in sorted(result.all_metric_renames.items()):
            lines.append(f"| `{old}` | `{new}` |")
    else:
        lines.append("No renames.")
    lines.append("")

    lines.append("## Certified Metrics")
    lines.append("")
    if result.all_certified_metrics:
        for m in sorted(result.all_certified_metrics):
            lines.append(f"- `{m}`")
    else:
        lines.append("None certified.")
    lines.append("")

    lines.append("## Derived Metrics")
    lines.append("")
    if result.all_derived_metrics:
        for dm in result.all_derived_metrics:
            lines.append(f"- **{dm.get('name', '?')}**: {dm.get('description', '')}")
            lines.append(f"  - Expression: `{dm.get('expression', '')}`")
            lines.append(f"  - Source table: `{dm.get('table', '?')}`")
    else:
        lines.append("None suggested.")
    lines.append("")

    lines.append("## Data Quirks")
    lines.append("")
    if result.all_data_quirks:
        for quirk in result.all_data_quirks:
            table = quirk.get("table", "?")
            issue = quirk.get("issue", quirk.get("quirk", "?"))
            lines.append(f"- **{table}**: {issue}")
    else:
        lines.append("None flagged.")
    lines.append("")

    lines.append("## Glossary Additions")
    lines.append("")
    if result.all_glossary:
        for term, defn in sorted(result.all_glossary.items()):
            lines.append(f"- **{term}**: {defn}")
    else:
        lines.append("None.")
    lines.append("")

    with open(os.path.join(output_dir, "ENRICHMENT_REPORT.md"), "w") as f:
        f.write("\n".join(lines))


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
