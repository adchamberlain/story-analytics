"""
Database schema introspection for Snowflake.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import snowflake.connector

from .config import get_config

if TYPE_CHECKING:
    from .semantic import SemanticLayer


@dataclass
class Column:
    """Represents a database column."""

    name: str
    data_type: str
    nullable: bool
    sample_values: list[Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "data_type": self.data_type,
            "nullable": self.nullable,
            "sample_values": self.sample_values,
        }


@dataclass
class Table:
    """Represents a database table."""

    name: str
    columns: list[Column]
    row_count: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "row_count": self.row_count,
            "columns": [col.to_dict() for col in self.columns],
        }


@dataclass
class Schema:
    """Represents the database schema."""

    database: str
    schema_name: str
    tables: list[Table]

    def to_dict(self) -> dict[str, Any]:
        return {
            "database": self.database,
            "schema": self.schema_name,
            "tables": [table.to_dict() for table in self.tables],
        }

    def get_schema_hash(self) -> str:
        """
        Generate a deterministic hash of the schema structure.

        Used for detecting schema changes and semantic layer staleness.
        The hash is based on table names, column names, and column types.
        Sample values are NOT included (they may change without schema changes).
        """
        hash_data = {
            "database": self.database,
            "schema": self.schema_name,
            "tables": [],
        }

        for table in sorted(self.tables, key=lambda t: t.name):
            table_data = {
                "name": table.name,
                "columns": [
                    {"name": col.name, "type": col.data_type, "nullable": col.nullable}
                    for col in sorted(table.columns, key=lambda c: c.name)
                ],
            }
            hash_data["tables"].append(table_data)

        # Create deterministic JSON and hash it
        json_str = json.dumps(hash_data, sort_keys=True)
        return hashlib.sha256(json_str.encode()).hexdigest()[:12]

    def to_prompt_context(self, semantic_layer: SemanticLayer | None = None) -> str:
        """
        Convert schema to a string suitable for LLM context.

        Args:
            semantic_layer: Optional semantic layer to merge in for richer context.
                           If provided, includes business context, column descriptions,
                           relationships, and query patterns.

        Returns:
            Formatted string for inclusion in LLM prompts.
        """
        lines = [f"Source: snowflake_saas (Snowflake: {self.database}.{self.schema_name})", ""]
        lines.append("IMPORTANT: In SQL queries, reference tables as 'snowflake_saas.tablename'")
        lines.append("")

        # Add business context if semantic layer is available
        if semantic_layer:
            lines.append("## Business Context")
            lines.append("")
            lines.append(semantic_layer.business_context.description)
            lines.append("")

            if semantic_layer.business_context.key_metrics:
                lines.append(f"Key Metrics: {', '.join(semantic_layer.business_context.key_metrics)}")
            if semantic_layer.business_context.key_dimensions:
                lines.append(f"Key Dimensions: {', '.join(semantic_layer.business_context.key_dimensions)}")
            lines.append("")

            # Business glossary
            if semantic_layer.business_context.business_glossary:
                lines.append("### Business Glossary")
                for term, definition in semantic_layer.business_context.business_glossary.items():
                    lines.append(f"- **{term}**: {definition}")
                lines.append("")

        # Tables section
        lines.append("## Tables")
        lines.append("")

        for table in self.tables:
            row_info = f" ({table.row_count:,} rows)" if table.row_count else ""
            # Show full reference path
            lines.append(f"### Table: snowflake_saas.{table.name.lower()}{row_info}")

            # Add table semantic info if available
            table_semantic = None
            if semantic_layer and table.name.lower() in {k.lower() for k in semantic_layer.tables}:
                # Case-insensitive lookup
                for tname, tsem in semantic_layer.tables.items():
                    if tname.lower() == table.name.lower():
                        table_semantic = tsem
                        break

            if table_semantic:
                lines.append(f"*{table_semantic.description}*")
                lines.append(f"Business role: {table_semantic.business_role}")
                lines.append("")

            lines.append("Columns:")
            for col in table.columns:
                nullable = "NULL" if col.nullable else "NOT NULL"

                # Get column semantic info if available
                col_semantic = None
                if table_semantic and col.name.lower() in {k.lower() for k in table_semantic.columns}:
                    for cname, csem in table_semantic.columns.items():
                        if cname.lower() == col.name.lower():
                            col_semantic = csem
                            break

                if col_semantic:
                    role_tag = f"[{col_semantic.role}]"
                    lines.append(f"  - {col.name}: {col.data_type} {nullable} {role_tag}")
                    lines.append(f"    Description: {col_semantic.description}")
                    if col_semantic.business_meaning:
                        lines.append(f"    Business meaning: {col_semantic.business_meaning}")
                    if col_semantic.aggregation_hint:
                        lines.append(f"    Typical aggregation: {col_semantic.aggregation_hint}")
                    if col_semantic.references:
                        lines.append(f"    References: {col_semantic.references}")
                else:
                    lines.append(f"  - {col.name}: {col.data_type} {nullable}")
                    if col.sample_values:
                        samples = ", ".join(str(v) for v in col.sample_values[:5])
                        lines.append(f"    Sample values: {samples}")

            lines.append("")

        # Add relationships if semantic layer is available
        if semantic_layer and semantic_layer.relationships:
            lines.append("## Relationships")
            lines.append("")
            for rel in semantic_layer.relationships:
                desc = f" - {rel.description}" if rel.description else ""
                lines.append(
                    f"- {rel.from_table}.{rel.from_column} → {rel.to_table}.{rel.to_column} ({rel.type}){desc}"
                )
            lines.append("")

        # Add query patterns if semantic layer is available
        if semantic_layer and semantic_layer.query_patterns:
            lines.append("## Common Query Patterns")
            lines.append("")
            for pattern_name, pattern in semantic_layer.query_patterns.items():
                lines.append(f"### {pattern_name}")
                lines.append(pattern.description)
                lines.append(f"Use when: {', '.join(pattern.use_when)}")
                lines.append(f"Pattern: {pattern.pattern}")
                if pattern.example:
                    lines.append(f"Example: {pattern.example}")
                lines.append("")

        return "\n".join(lines)


class SchemaIntrospector:
    """Introspect database schema from Snowflake."""

    def __init__(self):
        self.config = get_config()
        self._connection = None
        self._schema_cache: Schema | None = None

    def _get_connection(self):
        """Get or create Snowflake connection."""
        if self._connection is None:
            sf_config = self.config.get_snowflake_config()
            self._connection = snowflake.connector.connect(
                account=sf_config["account"],
                user=sf_config["username"],
                password=sf_config["password"],
                warehouse=sf_config["warehouse"],
                database=sf_config["database"],
                schema=sf_config["schema"],
            )
        return self._connection

    def close(self):
        """Close the database connection."""
        if self._connection:
            self._connection.close()
            self._connection = None

    def get_schema(self, include_samples: bool = True) -> Schema:
        """
        Get the full database schema.

        Args:
            include_samples: Whether to include sample values for columns.

        Returns:
            Schema object with all tables and columns.
        """
        if self._schema_cache is not None:
            return self._schema_cache

        conn = self._get_connection()
        cursor = conn.cursor()
        sf_config = self.config.get_snowflake_config()

        database = sf_config["database"]
        schema_name = sf_config["schema"]

        # Get all tables
        cursor.execute(
            f"""
            SELECT TABLE_NAME
            FROM {database}.INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = '{schema_name}'
            AND TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
            """
        )
        table_names = [row[0] for row in cursor.fetchall()]

        tables = []
        for table_name in table_names:
            # Get columns for this table
            cursor.execute(
                f"""
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                FROM {database}.INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = '{schema_name}'
                AND TABLE_NAME = '{table_name}'
                ORDER BY ORDINAL_POSITION
                """
            )

            columns = []
            for col_name, data_type, is_nullable in cursor.fetchall():
                sample_values = None
                if include_samples:
                    sample_values = self._get_sample_values(
                        cursor, table_name, col_name, data_type
                    )

                columns.append(
                    Column(
                        name=col_name,
                        data_type=data_type,
                        nullable=is_nullable == "YES",
                        sample_values=sample_values,
                    )
                )

            # Get row count
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            row_count = cursor.fetchone()[0]

            tables.append(Table(name=table_name, columns=columns, row_count=row_count))

        self._schema_cache = Schema(
            database=database, schema_name=schema_name, tables=tables
        )

        return self._schema_cache

    def _get_sample_values(
        self, cursor, table_name: str, column_name: str, data_type: str
    ) -> list[Any] | None:
        """Get sample values for a column."""
        # Skip sampling for certain data types
        if data_type in ("VARIANT", "OBJECT", "ARRAY"):
            return None

        try:
            # Get distinct values (up to 10)
            cursor.execute(
                f"""
                SELECT DISTINCT "{column_name}"
                FROM {table_name}
                WHERE "{column_name}" IS NOT NULL
                LIMIT 10
                """
            )
            values = [row[0] for row in cursor.fetchall()]
            return values if values else None
        except Exception:
            return None

    def get_table_names(self) -> list[str]:
        """Get list of all table names."""
        schema = self.get_schema(include_samples=False)
        return [table.name for table in schema.tables]

    def get_table(self, table_name: str) -> Table | None:
        """Get a specific table by name."""
        schema = self.get_schema()
        for table in schema.tables:
            if table.name.lower() == table_name.lower():
                return table
        return None


# Module-level functions for convenience
_introspector: SchemaIntrospector | None = None


def get_schema(include_samples: bool = True) -> Schema:
    """Get the database schema."""
    global _introspector
    if _introspector is None:
        _introspector = SchemaIntrospector()
    return _introspector.get_schema(include_samples)


def get_schema_context(semantic_layer: SemanticLayer | None = None) -> str:
    """
    Get schema as a string for LLM context.

    Args:
        semantic_layer: Optional semantic layer to include for richer context.

    Returns:
        Formatted schema string suitable for LLM prompts.
    """
    return get_schema().to_prompt_context(semantic_layer)


def get_schema_hash() -> str:
    """Get a hash of the current schema structure."""
    return get_schema().get_schema_hash()
