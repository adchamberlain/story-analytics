"""
Semantic layer data structures for database schema documentation.

The semantic layer provides rich business context about database schemas,
enabling LLMs to generate more accurate SQL and understand data relationships.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import yaml


@dataclass
class ColumnSemantic:
    """Semantic information about a database column."""

    description: str
    role: str  # primary_key, foreign_key, dimension, measure, date, identifier
    references: str | None = None  # For FKs: "table.column"
    aggregation_hint: str | None = None  # SUM, COUNT, AVG, etc.
    business_meaning: str | None = None  # Human-readable context
    common_filters: list[str] | None = None  # Common filter values
    format_hint: str | None = None  # currency, percent, number, date

    def to_dict(self) -> dict[str, Any]:
        result = {"description": self.description, "role": self.role}
        if self.references:
            result["references"] = self.references
        if self.aggregation_hint:
            result["aggregation_hint"] = self.aggregation_hint
        if self.business_meaning:
            result["business_meaning"] = self.business_meaning
        if self.common_filters:
            result["common_filters"] = self.common_filters
        if self.format_hint:
            result["format_hint"] = self.format_hint
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "ColumnSemantic":
        return cls(
            description=data.get("description", ""),
            role=data.get("role", "dimension"),
            references=data.get("references"),
            aggregation_hint=data.get("aggregation_hint"),
            business_meaning=data.get("business_meaning"),
            common_filters=data.get("common_filters"),
            format_hint=data.get("format_hint"),
        )


@dataclass
class TableSemantic:
    """Semantic information about a database table."""

    description: str
    business_role: str  # Describes what the table represents in business terms
    typical_questions: list[str] = field(default_factory=list)
    columns: dict[str, ColumnSemantic] = field(default_factory=dict)
    join_hints: list[str] | None = None  # Common join patterns

    def to_dict(self) -> dict[str, Any]:
        result = {
            "description": self.description,
            "business_role": self.business_role,
            "typical_questions": self.typical_questions,
            "columns": {name: col.to_dict() for name, col in self.columns.items()},
        }
        if self.join_hints:
            result["join_hints"] = self.join_hints
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "TableSemantic":
        columns = {}
        for col_name, col_data in data.get("columns", {}).items():
            columns[col_name] = ColumnSemantic.from_dict(col_data)
        return cls(
            description=data.get("description", ""),
            business_role=data.get("business_role", ""),
            typical_questions=data.get("typical_questions", []),
            columns=columns,
            join_hints=data.get("join_hints"),
        )


@dataclass
class Relationship:
    """Describes a relationship between two tables."""

    from_table: str
    from_column: str
    to_table: str
    to_column: str
    type: str  # one_to_one, one_to_many, many_to_many
    description: str | None = None

    def to_dict(self) -> dict[str, Any]:
        result = {
            "from": f"{self.from_table}.{self.from_column}",
            "to": f"{self.to_table}.{self.to_column}",
            "type": self.type,
        }
        if self.description:
            result["description"] = self.description
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "Relationship":
        from_parts = data.get("from", ".").split(".")
        to_parts = data.get("to", ".").split(".")
        return cls(
            from_table=from_parts[0] if len(from_parts) > 1 else "",
            from_column=from_parts[1] if len(from_parts) > 1 else from_parts[0],
            to_table=to_parts[0] if len(to_parts) > 1 else "",
            to_column=to_parts[1] if len(to_parts) > 1 else to_parts[0],
            type=data.get("type", "one_to_many"),
            description=data.get("description"),
        )


@dataclass
class QueryPattern:
    """Describes a common query pattern for the domain."""

    description: str
    use_when: list[str]  # Keywords/phrases that trigger this pattern
    pattern: str  # SQL pattern or guidance
    example: str | None = None

    def to_dict(self) -> dict[str, Any]:
        result = {
            "description": self.description,
            "use_when": self.use_when,
            "pattern": self.pattern,
        }
        if self.example:
            result["example"] = self.example
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "QueryPattern":
        return cls(
            description=data.get("description", ""),
            use_when=data.get("use_when", []),
            pattern=data.get("pattern", ""),
            example=data.get("example"),
        )


@dataclass
class BusinessContext:
    """High-level business context for the data source."""

    description: str
    domain: str  # SaaS, E-commerce, Finance, etc.
    key_metrics: list[str] = field(default_factory=list)
    key_dimensions: list[str] = field(default_factory=list)
    business_glossary: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        result = {
            "description": self.description,
            "domain": self.domain,
            "key_metrics": self.key_metrics,
            "key_dimensions": self.key_dimensions,
        }
        if self.business_glossary:
            result["business_glossary"] = self.business_glossary
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "BusinessContext":
        return cls(
            description=data.get("description", ""),
            domain=data.get("domain", "General"),
            key_metrics=data.get("key_metrics", []),
            key_dimensions=data.get("key_dimensions", []),
            business_glossary=data.get("business_glossary", {}),
        )


@dataclass
class SemanticLayer:
    """
    Complete semantic layer for a data source.

    Provides rich business context, column descriptions, relationships,
    and common query patterns to help LLMs generate accurate SQL.
    """

    version: str
    generated_at: str
    source_name: str
    schema_hash: str  # For detecting schema changes
    business_context: BusinessContext
    tables: dict[str, TableSemantic] = field(default_factory=dict)
    relationships: list[Relationship] = field(default_factory=list)
    query_patterns: dict[str, QueryPattern] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "generated_at": self.generated_at,
            "source_name": self.source_name,
            "schema_hash": self.schema_hash,
            "business_context": self.business_context.to_dict(),
            "tables": {name: table.to_dict() for name, table in self.tables.items()},
            "relationships": [rel.to_dict() for rel in self.relationships],
            "query_patterns": {
                name: pattern.to_dict() for name, pattern in self.query_patterns.items()
            },
        }

    def to_yaml(self) -> str:
        """Serialize to YAML string."""
        return yaml.dump(self.to_dict(), default_flow_style=False, sort_keys=False)

    def save(self, path: str) -> None:
        """Save to a YAML file."""
        with open(path, "w") as f:
            f.write(self.to_yaml())

    @classmethod
    def from_dict(cls, data: dict) -> "SemanticLayer":
        # Parse business context
        bc_data = data.get("business_context", {})
        business_context = BusinessContext.from_dict(bc_data)

        # Parse tables
        tables = {}
        for table_name, table_data in data.get("tables", {}).items():
            tables[table_name] = TableSemantic.from_dict(table_data)

        # Parse relationships
        relationships = [
            Relationship.from_dict(rel) for rel in data.get("relationships", [])
        ]

        # Parse query patterns
        query_patterns = {}
        for pattern_name, pattern_data in data.get("query_patterns", {}).items():
            query_patterns[pattern_name] = QueryPattern.from_dict(pattern_data)

        return cls(
            version=data.get("version", "1.0"),
            generated_at=data.get("generated_at", datetime.now().isoformat()),
            source_name=data.get("source_name", ""),
            schema_hash=data.get("schema_hash", ""),
            business_context=business_context,
            tables=tables,
            relationships=relationships,
            query_patterns=query_patterns,
        )

    @classmethod
    def load(cls, path: str) -> "SemanticLayer":
        """Load from a YAML file."""
        with open(path) as f:
            data = yaml.safe_load(f)
        return cls.from_dict(data)

    def to_prompt_context(self) -> str:
        """
        Format the semantic layer for inclusion in LLM prompts.

        Returns a structured text representation that helps the LLM
        understand the business context and data relationships.
        """
        lines = []

        # Business context
        lines.append("## Business Context")
        lines.append("")
        lines.append(self.business_context.description)
        lines.append("")

        if self.business_context.key_metrics:
            lines.append(f"Key Metrics: {', '.join(self.business_context.key_metrics)}")
        if self.business_context.key_dimensions:
            lines.append(
                f"Key Dimensions: {', '.join(self.business_context.key_dimensions)}"
            )
        lines.append("")

        # Business glossary
        if self.business_context.business_glossary:
            lines.append("### Business Glossary")
            for term, definition in self.business_context.business_glossary.items():
                lines.append(f"- **{term}**: {definition}")
            lines.append("")

        # Tables with semantic info
        lines.append("## Tables")
        lines.append("")

        for table_name, table in self.tables.items():
            lines.append(f"### {table_name}")
            lines.append(f"*{table.description}*")
            lines.append(f"Business role: {table.business_role}")
            lines.append("")

            if table.typical_questions:
                lines.append("Typical questions:")
                for q in table.typical_questions:
                    lines.append(f"  - {q}")
                lines.append("")

            lines.append("Columns:")
            for col_name, col in table.columns.items():
                role_tag = f"[{col.role}]"
                lines.append(f"  - **{col_name}** {role_tag}: {col.description}")
                if col.business_meaning:
                    lines.append(f"    Business meaning: {col.business_meaning}")
                if col.aggregation_hint:
                    lines.append(f"    Typical aggregation: {col.aggregation_hint}")
                if col.references:
                    lines.append(f"    References: {col.references}")

            lines.append("")

        # Relationships
        if self.relationships:
            lines.append("## Relationships")
            lines.append("")
            for rel in self.relationships:
                desc = f" - {rel.description}" if rel.description else ""
                lines.append(
                    f"- {rel.from_table}.{rel.from_column} → {rel.to_table}.{rel.to_column} ({rel.type}){desc}"
                )
            lines.append("")

        # Query patterns
        if self.query_patterns:
            lines.append("## Common Query Patterns")
            lines.append("")
            for pattern_name, pattern in self.query_patterns.items():
                lines.append(f"### {pattern_name}")
                lines.append(pattern.description)
                lines.append(f"Use when: {', '.join(pattern.use_when)}")
                lines.append(f"Pattern: {pattern.pattern}")
                if pattern.example:
                    lines.append(f"Example: {pattern.example}")
                lines.append("")

        return "\n".join(lines)

    def is_stale(self, current_schema_hash: str) -> bool:
        """Check if the semantic layer is stale (schema has changed)."""
        return self.schema_hash != current_schema_hash
