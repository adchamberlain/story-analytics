"""
Connections router: database connection management and data sync.
Supports Snowflake, PostgreSQL, and BigQuery via pluggable connectors.
"""

import calendar
import json
import os
import tempfile
import time
import traceback
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth_simple import get_current_user

from ..services.connection_service import (
    save_connection,
    load_connection,
    list_connections,
    delete_connection,
)
from ..services.connectors import get_connector, CONNECTOR_REGISTRY
from ..services.credential_store import (
    store_credentials,
    load_credentials,
    delete_credentials,
)
from ..services.duckdb_service import get_duckdb_service


router = APIRouter(prefix="/connections", tags=["connections"])

CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "snowflake_saas"
_SCHEMA_CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "schema_cache"

# Schema cache staleness threshold (1 hour)
_SCHEMA_CACHE_MAX_AGE_SECONDS = 3600


# ── Request / Response Schemas ───────────────────────────────────────────────

class CreateConnectionRequest(BaseModel):
    name: str = Field(..., examples=["Production Warehouse"], description="Human-readable connection name")
    db_type: str = Field("snowflake", examples=["snowflake", "postgres", "bigquery"], description="Database type")
    config: dict = Field(..., description="Connection configuration (varies by db_type)")

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
    save_credentials: bool = False   # Persist encrypted credentials on successful test

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


class SchemaColumnResponse(BaseModel):
    name: str
    type: str

class SchemaTableResponse(BaseModel):
    name: str
    columns: list[SchemaColumnResponse]
    row_count: int | None = None

class SchemaInfoResponse(BaseModel):
    name: str
    tables: list[SchemaTableResponse]

class SchemaResponse(BaseModel):
    schemas: list[SchemaInfoResponse]
    cached_at: str
    stale: bool = False


class ExecuteQueryRequest(BaseModel):
    sql: str = Field(..., max_length=100000)
    limit: int = Field(default=10000, ge=1, le=100000)
    timeout: int = Field(default=30, ge=1, le=300)

class QueryResponse(BaseModel):
    columns: list[str]
    column_types: list[str]
    rows: list[list]
    row_count: int
    truncated: bool
    execution_time_ms: int


class QuerySyncRequest(BaseModel):
    sql: str = Field(..., max_length=100000)
    source_name: str = Field(default="Query Result", max_length=200)

class QuerySyncResponse(BaseModel):
    source_id: str
    row_count: int


# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_credentials(conn_config: dict, db_type: str, request, connection_id: str | None = None) -> dict:
    """
    Build a unified credentials dict from connection config + request params.

    Priority (highest to lowest):
      1. Explicit request params (username, password, credentials dict)
      2. Stored encrypted credentials (if connection_id provided)
      3. Environment variable fallbacks (.env)
    """
    creds = {**conn_config}

    # Fallback: merge stored encrypted credentials (lowest priority, under request params)
    if connection_id:
        stored = load_credentials(connection_id)
        if stored:
            creds.update(stored)

    # If the request provides a generic credentials dict, merge it (overrides stored)
    if hasattr(request, 'credentials') and request.credentials:
        creds.update(request.credentials)

    # Legacy Snowflake compat: merge username/password from request (overrides stored)
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
async def list_connector_types(user: dict = Depends(get_current_user)):
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
async def create_connection(request: CreateConnectionRequest, user: dict = Depends(get_current_user)):
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
async def list_all(user: dict = Depends(get_current_user)):
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
async def get_connection(connection_id: str, user: dict = Depends(get_current_user)):
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
async def remove_connection(connection_id: str, user: dict = Depends(get_current_user)):
    """Delete a connection and its stored credentials."""
    if not delete_connection(connection_id):
        raise HTTPException(status_code=404, detail="Connection not found")
    delete_credentials(connection_id)
    return {"deleted": True}


@router.post("/{connection_id}/test", response_model=TestConnectionResponse)
async def test_connection(connection_id: str, request: TestConnectionRequest, user: dict = Depends(get_current_user)):
    """Test a database connection using the pluggable connector system."""
    conn = load_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    try:
        connector = get_connector(conn.db_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    creds = _build_credentials(conn.config, conn.db_type, request, connection_id)

    try:
        result = connector.test_connection(creds)
        if result.success:
            # Save credentials if requested — store ONLY what the user provided
            if request.save_credentials:
                secrets = {}
                if request.credentials:
                    secrets.update(request.credentials)
                if request.username:
                    secrets["username"] = request.username
                if request.password:
                    secrets["password"] = request.password
                if secrets:
                    store_credentials(connection_id, secrets)

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
async def list_tables(connection_id: str, request: ListTablesRequest, user: dict = Depends(get_current_user)):
    """List available tables in the connected database."""
    conn = load_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    try:
        connector = get_connector(conn.db_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    creds = _build_credentials(conn.config, conn.db_type, request, connection_id)

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
async def sync_tables(connection_id: str, request: SyncRequest, user: dict = Depends(get_current_user)):
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
    creds = _build_credentials(conn.config, conn.db_type, request, connection_id)

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


@router.post("/{connection_id}/schema", response_model=SchemaResponse)
async def get_schema(
    connection_id: str,
    refresh: bool = Query(False, description="Force re-fetch from database"),
    user: dict = Depends(get_current_user),
):
    """
    Get full schema introspection (schemas, tables, columns) for a connection.

    Returns cached data if available. Set refresh=true to force re-fetch.
    Cached data older than 1 hour is marked stale but still returned.
    """
    conn = load_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    cache_file = _SCHEMA_CACHE_DIR / f"{conn.connection_id}.json"

    # Return cached data if available and not forcing refresh
    if not refresh and cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text())
            cached_at = cached.get("cached_at", "")

            # Determine staleness
            stale = False
            if cached_at:
                try:
                    cached_ts = calendar.timegm(time.strptime(cached_at, "%Y-%m-%dT%H:%M:%SZ"))
                    stale = (time.time() - cached_ts) > _SCHEMA_CACHE_MAX_AGE_SECONDS
                except (ValueError, OverflowError):
                    stale = True

            return SchemaResponse(
                schemas=[SchemaInfoResponse(**s) for s in cached["schemas"]],
                cached_at=cached_at,
                stale=stale,
            )
        except (json.JSONDecodeError, KeyError):
            pass  # Corrupted cache — fall through to re-fetch

    # Fetch fresh schema from database
    try:
        connector = get_connector(conn.db_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Build credentials from stored + config
    creds = {**conn.config}
    stored = load_credentials(connection_id)
    if stored:
        creds.update(stored)

    try:
        result = connector.list_schemas(creds)
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Required library not installed for {conn.db_type}: {e}",
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Schema introspection failed: {e}")

    if not result.success:
        raise HTTPException(status_code=500, detail=result.message)

    # Build response
    cached_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    schema_dicts = [
        {
            "name": s.name,
            "tables": [
                {
                    "name": t.name,
                    "columns": [{"name": c.name, "type": c.type} for c in t.columns],
                    "row_count": t.row_count,
                }
                for t in s.tables
            ],
        }
        for s in result.schemas
    ]

    # Cache to disk
    _SCHEMA_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_data = {"schemas": schema_dicts, "cached_at": cached_at}
    cache_file.write_text(json.dumps(cache_data, indent=2))

    return SchemaResponse(
        schemas=[SchemaInfoResponse(**s) for s in schema_dicts],
        cached_at=cached_at,
        stale=False,
    )


@router.post("/{connection_id}/query", response_model=QueryResponse)
async def execute_query(connection_id: str, request: ExecuteQueryRequest, user: dict = Depends(get_current_user)):
    """Execute a read-only SQL query against the connected warehouse."""
    conn = load_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    # Load stored credentials — required for query execution
    stored_creds = load_credentials(connection_id)
    if not stored_creds:
        raise HTTPException(
            status_code=400,
            detail="No stored credentials found for this connection. "
                   "Test the connection with save_credentials=true first.",
        )

    # Merge connection config with stored credentials
    creds = {**conn.config, **stored_creds}

    try:
        connector = get_connector(conn.db_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    start_ms = time.monotonic_ns() // 1_000_000
    try:
        result = connector.execute_query(
            sql=request.sql,
            credentials=creds,
            limit=request.limit,
            timeout=request.timeout,
        )
    except ValueError as e:
        # SQL validation errors
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query execution failed: {e}")

    elapsed_ms = (time.monotonic_ns() // 1_000_000) - start_ms

    return QueryResponse(
        columns=result.columns,
        column_types=result.column_types,
        rows=result.rows,
        row_count=result.row_count,
        truncated=result.truncated,
        execution_time_ms=elapsed_ms,
    )


@router.post("/{connection_id}/sync-query", response_model=QuerySyncResponse)
async def sync_query_result(connection_id: str, request: QuerySyncRequest, user: dict = Depends(get_current_user)):
    """Sync arbitrary query results into DuckDB as a new source.

    Executes the SQL against the connected warehouse, converts the results
    to a parquet file, and ingests it into the local DuckDB instance.
    Used by the "Chart this" flow in the SQL workbench.
    """
    import pyarrow as pa
    import pyarrow.parquet as pq

    conn = load_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    # Load stored credentials — required for query execution
    stored_creds = load_credentials(connection_id)
    if not stored_creds:
        raise HTTPException(
            status_code=400,
            detail="No stored credentials found for this connection. "
                   "Test the connection with save_credentials=true first.",
        )

    # Merge connection config with stored credentials
    creds = {**conn.config, **stored_creds}

    try:
        connector = get_connector(conn.db_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Execute the query against the warehouse
    try:
        result = connector.execute_query(
            sql=request.sql,
            credentials=creds,
            limit=10000,
            timeout=30,
        )
    except ValueError as e:
        # SQL validation errors (INSERT, DELETE, etc.)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query execution failed: {e}")

    if not result.columns or not result.rows:
        raise HTTPException(status_code=400, detail="Query returned no data")

    # Convert QueryResult rows to a pyarrow Table
    # Transpose row-major data to column-major for Arrow
    col_data = {
        col: [row[i] for row in result.rows]
        for i, col in enumerate(result.columns)
    }
    arrow_table = pa.table(col_data)

    # Write to temp parquet file, ingest into DuckDB, clean up
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet")
    pq_path = Path(tmp.name)
    tmp.close()

    try:
        pq.write_table(arrow_table, str(pq_path))
        db = get_duckdb_service()
        schema = db.ingest_parquet(pq_path, request.source_name)
    finally:
        pq_path.unlink(missing_ok=True)

    return QuerySyncResponse(
        source_id=schema.source_id,
        row_count=schema.row_count,
    )
