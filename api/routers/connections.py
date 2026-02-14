"""
Connections router: database connection management and data sync.
Supports Snowflake connections with offline fallback to cached parquet.
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
    get_snowflake_pat,
)
from ..services.duckdb_service import get_duckdb_service


router = APIRouter(prefix="/connections", tags=["connections"])


# ── Request / Response Schemas ───────────────────────────────────────────────

class CreateConnectionRequest(BaseModel):
    name: str
    db_type: str = "snowflake"
    config: dict  # account, warehouse, database, schema


class ConnectionResponse(BaseModel):
    connection_id: str
    name: str
    db_type: str
    config: dict
    created_at: str


class TestConnectionRequest(BaseModel):
    username: str | None = None
    password: str | None = None


class TestConnectionResponse(BaseModel):
    success: bool
    message: str
    tables: list[str] = []


class ListTablesRequest(BaseModel):
    username: str | None = None
    password: str | None = None


class ListTablesResponse(BaseModel):
    tables: list[str]


class SyncRequest(BaseModel):
    tables: list[str]
    username: str | None = None
    password: str | None = None


class SyncedSource(BaseModel):
    source_id: str
    table_name: str
    row_count: int


class SyncResponse(BaseModel):
    sources: list[SyncedSource]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _resolve_username(username: str | None) -> str | None:
    """Resolve username: explicit → .env fallback → None."""
    return username or os.environ.get("SNOWFLAKE_USERNAME")


def _snowflake_connect(config: dict, username: str):
    """Create a Snowflake connection using PAT (Programmatic Access Token)."""
    import snowflake.connector

    pat = get_snowflake_pat()
    if not pat:
        raise RuntimeError(
            "Snowflake PAT not found. Set SNOWFLAKE_PAT in .env."
        )

    return snowflake.connector.connect(
        account=config["account"],
        user=username,
        authenticator="PROGRAMMATIC_ACCESS_TOKEN",
        token=pat,
        warehouse=config.get("warehouse", ""),
        database=config.get("database", ""),
        schema=config.get("schema", ""),
    )


def _try_cached_parquet(db, tables: list[str]) -> list:
    """Try loading cached parquet for the requested tables. Returns [] on failure."""
    all_schemas = db.ingest_cached_parquet()
    requested = {t.lower() for t in tables}
    return [s for s in all_schemas if s.filename in requested]


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/", response_model=ConnectionResponse, status_code=201)
async def create_connection(request: CreateConnectionRequest):
    """Save a new database connection (metadata only, no credentials)."""
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
    """Test a database connection using key-pair auth."""
    conn = load_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    username = _resolve_username(request.username)
    if not username:
        raise HTTPException(
            status_code=400,
            detail="No username provided and SNOWFLAKE_USERNAME not set in .env",
        )

    try:
        sf_conn = _snowflake_connect(conn.config, username)
        cursor = sf_conn.cursor()
        cursor.execute("SHOW TABLES")
        tables = [row[1] for row in cursor.fetchall()]
        cursor.close()
        sf_conn.close()

        return TestConnectionResponse(
            success=True,
            message=f"Connected. Found {len(tables)} tables.",
            tables=tables,
        )
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="snowflake-connector-python not installed",
        )
    except Exception as e:
        traceback.print_exc()
        return TestConnectionResponse(
            success=False,
            message=f"Connection failed: {e}",
        )


@router.post("/{connection_id}/tables", response_model=ListTablesResponse)
async def list_tables(connection_id: str, request: ListTablesRequest):
    """List available tables in the connected database."""
    conn = load_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    username = _resolve_username(request.username)
    if not username:
        raise HTTPException(
            status_code=400,
            detail="No username provided and SNOWFLAKE_USERNAME not set in .env",
        )

    try:
        sf_conn = _snowflake_connect(conn.config, username)
        cursor = sf_conn.cursor()
        cursor.execute("SHOW TABLES")
        tables = [row[1] for row in cursor.fetchall()]
        cursor.close()
        sf_conn.close()

        return ListTablesResponse(tables=tables)
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="snowflake-connector-python not installed",
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to list tables: {e}")


@router.post("/{connection_id}/sync", response_model=SyncResponse)
async def sync_tables(connection_id: str, request: SyncRequest):
    """Sync tables from a database connection into DuckDB.

    If credentials are provided → live Snowflake sync.
    If no credentials but .env has them → use .env credentials.
    If no credentials at all → fall back to cached parquet files.
    """
    conn = load_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    db = get_duckdb_service()
    username = _resolve_username(request.username)

    if username:
        # Try live Snowflake sync, fall back to cached parquet on failure
        try:
            schemas = db.ingest_from_snowflake(
                config=conn.config,
                credentials={"username": username},
                table_names=request.tables,
            )
        except ImportError:
            # No snowflake-connector — try cached parquet
            schemas = _try_cached_parquet(db, request.tables)
            if not schemas:
                raise HTTPException(
                    status_code=500,
                    detail="snowflake-connector-python not installed and no cached parquet available",
                )
        except Exception as e:
            # Live connection failed — try cached parquet as fallback
            traceback.print_exc()
            schemas = _try_cached_parquet(db, request.tables)
            if not schemas:
                raise HTTPException(
                    status_code=500,
                    detail=f"Snowflake sync failed: {e}. No cached parquet fallback available.",
                )
    else:
        # Offline: load cached parquet
        schemas = _try_cached_parquet(db, request.tables)
        if not schemas:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"No credentials available and no cached parquet found for: {request.tables}. "
                    "Set SNOWFLAKE_USERNAME/PASSWORD in .env or provide credentials."
                ),
            )

    return SyncResponse(
        sources=[
            SyncedSource(
                source_id=s.source_id,
                table_name=s.filename,
                row_count=s.row_count,
            )
            for s in schemas
        ]
    )
