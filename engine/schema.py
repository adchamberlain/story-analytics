"""
Database schema introspection for Snowflake.
"""

from dataclasses import dataclass
from typing import Any

import snowflake.connector

from .config import get_config


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

    def to_prompt_context(self) -> str:
        """Convert schema to a string suitable for LLM context."""
        lines = [f"Source: snowflake_saas (Snowflake: {self.database}.{self.schema_name})", ""]
        lines.append("IMPORTANT: In SQL queries, reference tables as 'snowflake_saas.tablename'")
        lines.append("")

        for table in self.tables:
            row_info = f" ({table.row_count:,} rows)" if table.row_count else ""
            # Show full reference path
            lines.append(f"Table: snowflake_saas.{table.name.lower()}{row_info}")

            for col in table.columns:
                nullable = "NULL" if col.nullable else "NOT NULL"
                lines.append(f"  - {col.name}: {col.data_type} {nullable}")

                if col.sample_values:
                    samples = ", ".join(str(v) for v in col.sample_values[:5])
                    lines.append(f"    Sample values: {samples}")

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


def get_schema_context() -> str:
    """Get schema as a string for LLM context."""
    return get_schema().to_prompt_context()
