"""Generate a readable review memo from extracted Data Context."""

from collections import defaultdict

from .mapper import DataContextOutput


def write_memo(output: DataContextOutput, output_path: str) -> None:
    """Write a markdown review memo organized by business domain.

    This is designed for PR-style review — readable by domain experts
    who don't need to know YAML or LookML.
    """
    lines: list[str] = []

    # --- Header ---
    lines.append("# Data Context Review Memo")
    lines.append("")
    lines.append(f"**Source:** `{output.repo_path}`")
    lines.append(f"**Connection:** {output.connection}")
    lines.append("")

    # --- Summary stats ---
    lines.append("## Summary")
    lines.append("")
    lines.append(f"| Metric | Count |")
    lines.append(f"|--------|-------|")
    lines.append(f"| Tables | {len(output.tables)} |")
    lines.append(f"| Dimensions | {output.total_dimensions} |")
    lines.append(f"| Measures | {output.total_measures} |")
    lines.append(f"| Metrics | {len(output.metrics)} |")
    lines.append(f"| Join Graphs | {len(output.joins)} |")
    lines.append("")

    # --- Group tables by domain ---
    tables_by_domain: dict[str, list] = defaultdict(list)
    for table in output.tables:
        domain = table.domain or "ungrouped"
        tables_by_domain[domain].append(table)

    lines.append("## Domains")
    lines.append("")
    for domain in sorted(tables_by_domain.keys()):
        tables = tables_by_domain[domain]
        total_measures = sum(len(t.measures) for t in tables)
        total_dims = sum(len(t.dimensions) for t in tables)
        lines.append(f"- **{domain}**: {len(tables)} tables, {total_dims} dimensions, {total_measures} measures")
    lines.append("")

    # --- Per-domain detail ---
    for domain in sorted(tables_by_domain.keys()):
        tables = tables_by_domain[domain]
        lines.append(f"## Domain: {domain}")
        lines.append("")

        for table in sorted(tables, key=lambda t: t.name):
            lines.append(f"### {table.name}")
            lines.append("")
            if table.description:
                lines.append(f"*{table.description}*")
                lines.append("")
            lines.append(f"- **Source table:** `{table.table_ref}`")
            if table.grain:
                lines.append(f"- **Primary key:** `{table.grain}`")
            if table.default_time_dimension:
                lines.append(f"- **Default time dimension:** `{table.default_time_dimension}`")
            lines.append(f"- **Dimensions:** {len(table.dimensions)}")
            lines.append(f"- **Measures:** {len(table.measures)}")
            lines.append("")

            # Key measures (non-count, first 10)
            key_measures = [m for m in table.measures if m.get("agg") != "count"][:10]
            if key_measures:
                lines.append("**Key Measures:**")
                lines.append("")
                for m in key_measures:
                    desc = m.get("description", "")
                    label = m.get("label", m["name"])
                    fmt = m.get("format", "")
                    fmt_str = f" ({fmt})" if fmt else ""
                    desc_str = f" — {desc}" if desc else ""
                    lines.append(f"- `{label}`{fmt_str}: {m['agg']}({m.get('expr', '*')}){desc_str}")
                lines.append("")

            # Entities (foreign keys / relationships)
            if table.entities:
                fks = [e for e in table.entities if e.get("type") == "foreign"]
                if fks:
                    lines.append(f"**Foreign Keys:** {', '.join(f'`{e['name']}`' for e in fks[:8])}")
                    lines.append("")

    # --- Join graphs ---
    lines.append("## Join Graphs")
    lines.append("")
    lines.append(f"Total: {len(output.joins)} join graphs extracted from LookML explores.")
    lines.append("")

    # Show top 10 most connected
    top_joins = sorted(output.joins, key=lambda j: len(j.joins), reverse=True)[:10]
    if top_joins:
        lines.append("**Most Connected (top 10):**")
        lines.append("")
        lines.append("| Join Graph | Base Table | Joined Tables |")
        lines.append("|------------|-----------|--------------|")
        for j in top_joins:
            joined = ", ".join(je.get("table", je.get("alias", "?")) for je in j.joins[:5])
            if len(j.joins) > 5:
                joined += f", +{len(j.joins) - 5} more"
            lines.append(f"| {j.name} | {j.base_table} | {joined} |")
        lines.append("")

    # --- Potential issues ---
    lines.append("## Potential Issues")
    lines.append("")

    # Tables with no measures
    no_measures = [t for t in output.tables if not t.measures]
    if no_measures:
        lines.append(f"- **{len(no_measures)} tables have no measures** (dimension-only tables — may be lookup/reference tables)")
        lines.append("")

    # Tables with no primary key
    no_pk = [t for t in output.tables if not t.grain]
    if no_pk:
        lines.append(f"- **{len(no_pk)} tables have no identified primary key**")
        lines.append("")

    # Tables with no description
    no_desc = [t for t in output.tables if not t.description]
    if no_desc:
        lines.append(f"- **{len(no_desc)} tables have no description**")
        lines.append("")

    # Measures with no description
    measures_no_desc = sum(
        1 for t in output.tables
        for m in t.measures
        if not m.get("description")
    )
    if measures_no_desc:
        lines.append(f"- **{measures_no_desc} measures have no description** (out of {output.total_measures})")
        lines.append("")

    with open(output_path, "w") as f:
        f.write("\n".join(lines))
