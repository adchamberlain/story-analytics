"""
Abstract base class for database connectors.

All connectors sync remote data into DuckDB for uniform local querying.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ColumnInfo:
    """Column metadata returned from schema inspection."""
    name: str
    type: str


@dataclass
class SchemaColumn:
    """Column metadata within a schema introspection result."""
    name: str
    type: str


@dataclass
class SchemaTable:
    """Table metadata within a schema introspection result."""
    name: str
    columns: list[SchemaColumn]
    row_count: int | None = None


@dataclass
class SchemaInfo:
    """Schema (namespace) metadata containing its tables."""
    name: str
    tables: list[SchemaTable]


@dataclass
class TableInfo:
    """Table name with optional row count, returned by list_tables()."""
    name: str
    row_count: int | None = None


@dataclass
class ConnectorResult:
    """Result of a connector operation."""
    success: bool
    message: str = ""
    tables: list[str] = field(default_factory=list)
    table_infos: list[TableInfo] = field(default_factory=list)
    columns: list[ColumnInfo] = field(default_factory=list)
    schemas: list[SchemaInfo] = field(default_factory=list)


@dataclass
class QueryResult:
    """Result of executing a SQL query against the warehouse."""
    columns: list[str]       # column names
    column_types: list[str]  # column data types
    rows: list[list]         # row data as lists
    row_count: int
    truncated: bool = False  # True if LIMIT was enforced


class DatabaseConnector(ABC):
    """
    Abstract base class for database connectors.

    Each connector knows how to:
    1. Test a connection with provided credentials
    2. List available tables
    3. Get column schema for a table
    4. Sync tables into DuckDB via parquet intermediary
    """

    @property
    @abstractmethod
    def db_type(self) -> str:
        """Return the database type identifier (e.g. 'snowflake', 'postgres')."""
        ...

    @property
    @abstractmethod
    def required_fields(self) -> list[str]:
        """Return the list of required credential/config fields for the connection form."""
        ...

    @abstractmethod
    def test_connection(self, credentials: dict) -> ConnectorResult:
        """
        Test whether a connection can be established.

        Args:
            credentials: Dict of connection parameters (host, port, user, password, etc.)

        Returns:
            ConnectorResult with success=True if connection works.
        """
        ...

    @abstractmethod
    def list_tables(self, credentials: dict) -> ConnectorResult:
        """
        List available tables in the connected database/schema.

        Returns:
            ConnectorResult with tables populated.
        """
        ...

    @abstractmethod
    def get_table_schema(self, table: str, credentials: dict) -> ConnectorResult:
        """
        Get column names and types for a specific table.

        Returns:
            ConnectorResult with columns populated.
        """
        ...

    @abstractmethod
    def list_schemas(self, credentials: dict) -> ConnectorResult:
        """
        List all schemas with their tables and column metadata.

        Returns:
            ConnectorResult with schemas populated.
        """
        ...

    @abstractmethod
    def sync_to_duckdb(
        self,
        tables: list[str],
        credentials: dict,
        duckdb_service: object,
        cache_dir: Path | None = None,
        max_rows: int | None = None,
    ) -> list[dict]:
        """
        Sync the specified tables from the remote database into DuckDB.

        Uses parquet as the intermediary format:
        1. SELECT * from remote table (with optional LIMIT)
        2. Write to parquet (optionally cached on disk)
        3. Load into DuckDB via duckdb_service.ingest_parquet()

        Args:
            tables: List of table names to sync.
            credentials: Connection credentials dict.
            duckdb_service: The DuckDBService instance to ingest into.
            cache_dir: Optional directory to cache parquet files.
            max_rows: Optional row limit per table.

        Returns:
            List of SourceSchema dicts (one per synced table).
        """
        ...

    @staticmethod
    def validate_sql(sql: str) -> None:
        """Ensure SQL is read-only (SELECT/WITH/EXPLAIN only). Raises ValueError if not."""
        stripped = sql.strip().upper()
        if not stripped:
            raise ValueError("SQL statement is empty")
        if not (stripped.startswith("SELECT") or stripped.startswith("WITH") or stripped.startswith("EXPLAIN")):
            raise ValueError("Only SELECT, WITH, and EXPLAIN statements are allowed")
        dangerous = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "GRANT", "REVOKE"]
        for keyword in dangerous:
            if f" {keyword} " in f" {stripped} ":
                raise ValueError(f"Statement contains disallowed keyword: {keyword}")

    @abstractmethod
    def execute_query(self, sql: str, credentials: dict, limit: int = 10000, timeout: int = 30) -> QueryResult:
        """Execute a read-only SQL query against the warehouse and return results."""
        ...
