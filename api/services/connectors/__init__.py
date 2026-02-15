"""
Pluggable database connector system.

All connectors implement the DatabaseConnector interface and sync data
into DuckDB for uniform SQL querying.
"""

from .base import DatabaseConnector, ColumnInfo as ColumnInfo, ConnectorResult as ConnectorResult
from .snowflake import SnowflakeConnector
from .postgres import PostgresConnector
from .bigquery import BigQueryConnector

CONNECTOR_REGISTRY: dict[str, type[DatabaseConnector]] = {
    "snowflake": SnowflakeConnector,
    "postgres": PostgresConnector,
    "bigquery": BigQueryConnector,
}


def get_connector(db_type: str) -> DatabaseConnector:
    """Get a connector instance by database type string."""
    cls = CONNECTOR_REGISTRY.get(db_type)
    if cls is None:
        raise ValueError(f"Unknown database type: {db_type}. Available: {list(CONNECTOR_REGISTRY.keys())}")
    return cls()
