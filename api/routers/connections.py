"""
Connections router: database connection management and data sync.
Supports Snowflake, PostgreSQL, and BigQuery via pluggable connectors.
"""

import os
import traceback
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.connection_service import (
    save_connection,
    load_connection,
    list_connections,
    delete_connection,
)
from ..services.connectors import get_connector, CONNECTOR_REGISTRY
from ..services.duckdb_service import get_duckdb_service


router = APIRouter(prefix="/connections", tags=["connections"])

CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "snowflake_saas"


# ── Request / Response Schemas ───────────────────────────────────────────────

class CreateConnectionRequest(BaseModel):
    name: str
    db_type: str = "snowflake"
    config: dict  # varies by db_type

class ConnectionResponse(BaseModel):
    connection_id: str
    name: str
    db_type: str
    config: dict
    created_at: str

class TestConnectionRequest(BaseModel):
    username: str | None = None
    password: str | None = None
    credentials: dict | None = None  # Generic credentials for any connector

class TestConnectionResponse(BaseModel):
    success: bool
    message: str
    tables: list[str] = []

class ListTablesRequest(BaseModel):
    username: str | None = None
    password: str | None = None
    credentials: dict | None = None

class ListTablesResponse(BaseModel):
    tables: list[str]

class SyncRequest(BaseModel):
    tables: list[str]
    username: str | None = None
    password: str | None = None
    credentials: dict | None = None

class SyncedSource(BaseModel):
    source_id: str
    table_name: str
    row_count: int

class SyncResponse(BaseModel):
    sources: list[SyncedSource]

class ConnectorTypesResponse(BaseModel):
    types: list[dict]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_credentials(conn_config: dict, db_type: str, request) -> dict:
    """
    Build a unified credentials dict from connection config + request params.

    For Snowflake: merges connection config with username from .env fallback.
    For Postgres/BigQuery: merges connection config with provided credentials.
    """
    creds = {**conn_config}

    # If the request provides a generic credentials dict, merge it
    if hasattr(request, 'credentials') and request.credentials:
        creds.update(request.credentials)

    # Legacy Snowflake compat: merge username/password from request
    if request.username:
        creds["username"] = request.username
    if hasattr(request, 'password') and request.password:
        creds["password"] = request.password

    # Snowflake .env fallback for username
    if db_type == "snowflake" and not creds.get("username"):
        env_user = os.environ.get("SNOWFLAKE_USERNAME")
        if env_user:
            creds["username"] = env_user

    return creds


def _try_cached_parquet(db, tables: list[str]) -> list:
    """Try loading cached parquet for the requested tables. Returns [] on failure."""
    all_schemas = db.ingest_cached_parquet()
    requested = {t.lower() for t in tables}
    return [s for s in all_schemas if s.filename in requested]


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/types", response_model=ConnectorTypesResponse)
async def list_connector_types():
    """List all supported database connector types and their required fields."""
    types = []
    for name, cls in CONNECTOR_REGISTRY.items():
        instance = cls()
        types.append({
            "db_type": name,
            "required_fields": instance.required_fields,
        })
    return ConnectorTypesResponse(types=types)


@router.post("/", response_model=ConnectionResponse, status_code=201)
async def create_connection(request: CreateConnectionRequest):
    """Save a new database connection (metadata only, no credentials)."""
    if request.db_type not in CONNECTOR_REGISTRY:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown database type: {request.db_type}. "
                   f"Available: {list(CONNECTOR_REGISTRY.keys())}",
        )

    conn = save_connection(
        name=request.name,
        db_type=request.db_type,
        config=request.config,
    )
    return ConnectionResponse(
        connection_id=conn.connection_id,
        name=conn.name,
        db_type=conn.db_type,
        config=conn.config,
        created_at=conn.created_at,
    )


@router.get("/", response_model=list[ConnectionResponse])
async def list_all():
    """List all saved connections."""
    return [
        ConnectionResponse(
            connection_id=c.connection_id,
            name=c.name,
            db_type=c.db_type,
            config=c.config,
            created_at=c.created_at,
        )
        for c in list_connections()
    ]


@router.get("/{connection_id}", response_model=ConnectionResponse)
async def get_connection(connection_id: str):
    """Get a connection by ID."""
    conn = load_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    return ConnectionResponse(
        connection_id=conn.connection_id,
        name=conn.name,
        db_type=conn.db_type,
        config=conn.config,
        created_at=conn.created_at,
    )


@router.delete("/{connection_id}")
async def remove_connection(connection_id: str):
    """Delete a connection."""
    if not delete_connection(connection_id):
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"deleted": True}


@router.post("/{connection_id}/test", response_model=TestConnectionResponse)
async def test_connection(connection_id: str, request: TestConnectionRequest):
    """Test a database connection using the pluggable connector system."""
    conn = load_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    try:
        connector = get_connector(conn.db_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    creds = _build_credentials(conn.config, conn.db_type, request)

    try:
        result = connector.test_connection(creds)
        if result.success:
            # Also list tables on successful test
            tables_result = connector.list_tables(creds)
            return TestConnectionResponse(
                success=True,
                message=result.message,
                tables=tables_result.tables if tables_result.success else [],
            )
        return TestConnectionResponse(success=False, message=result.message)
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Required library not installed for {conn.db_type}: {e}",
        )
    except Exception as e:
        traceback.print_exc()
        return TestConnectionResponse(success=False, message=f"Connection failed: {e}")


@router.post("/{connection_id}/tables", response_model=ListTablesResponse)
async def list_tables(connection_id: str, request: ListTablesRequest):
    """List available tables in the connected database."""
    conn = load_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    try:
        connector = get_connector(conn.db_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    creds = _build_credentials(conn.config, conn.db_type, request)

    try:
        result = connector.list_tables(creds)
        if not result.success:
            raise HTTPException(status_code=500, detail=result.message)
        return ListTablesResponse(tables=result.tables)
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Required library not installed for {conn.db_type}: {e}",
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to list tables: {e}")


@router.post("/{connection_id}/sync", response_model=SyncResponse)
async def sync_tables(connection_id: str, request: SyncRequest):
    """
    Sync tables from a database connection into DuckDB.

    For Snowflake: falls back to cached parquet if credentials unavailable.
    For Postgres/BigQuery: requires valid credentials.
    """
    conn = load_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    try:
        connector = get_connector(conn.db_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db = get_duckdb_service()
    creds = _build_credentials(conn.config, conn.db_type, request)

    # Determine cache dir (only for Snowflake for backward compat)
    cache_dir = CACHE_DIR if conn.db_type == "snowflake" else None

    try:
        sync_results = connector.sync_to_duckdb(
            tables=request.tables,
            credentials=creds,
            duckdb_service=db,
            cache_dir=cache_dir,
        )
    except ImportError:
        # Missing library — Snowflake can fall back to cached parquet
        if conn.db_type == "snowflake":
            schemas = _try_cached_parquet(db, request.tables)
            if schemas:
                return SyncResponse(
                    sources=[
                        SyncedSource(source_id=s.source_id, table_name=s.filename, row_count=s.row_count)
                        for s in schemas
                    ]
                )
        raise HTTPException(
            status_code=500,
            detail=f"Required library not installed for {conn.db_type}",
        )
    except Exception as e:
        traceback.print_exc()
        # Snowflake fallback to cached parquet
        if conn.db_type == "snowflake":
            schemas = _try_cached_parquet(db, request.tables)
            if schemas:
                return SyncResponse(
                    sources=[
                        SyncedSource(source_id=s.source_id, table_name=s.filename, row_count=s.row_count)
                        for s in schemas
                    ]
                )
        raise HTTPException(
            status_code=500,
            detail=f"Sync failed: {e}",
        )

    return SyncResponse(
        sources=[
            SyncedSource(
                source_id=r["source_id"],
                table_name=r["filename"],
                row_count=r["row_count"],
            )
            for r in sync_results
        ]
    )
