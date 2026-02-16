"""
Data router: CSV upload, schema inspection, and query execution.
"""

import tempfile
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

from ..services.duckdb_service import get_duckdb_service


router = APIRouter(prefix="/data", tags=["data"])


# ── Response Schemas ─────────────────────────────────────────────────────────

class ColumnInfoResponse(BaseModel):
    name: str
    type: str
    nullable: bool
    sample_values: list[str]
    null_count: int
    distinct_count: int
    min_value: str | None = None
    max_value: str | None = None


class UploadResponse(BaseModel):
    source_id: str
    filename: str
    row_count: int
    columns: list[ColumnInfoResponse]


class QueryRequest(BaseModel):
    source_id: str
    sql: str


class QueryResponse(BaseModel):
    columns: list[str]
    rows: list[dict]
    row_count: int


class PreviewResponse(BaseModel):
    columns: list[str]
    rows: list[dict]
    row_count: int


class SourceSummary(BaseModel):
    source_id: str
    name: str
    row_count: int
    column_count: int


class RawQueryRequest(BaseModel):
    sql: str


class RawQueryResponse(BaseModel):
    success: bool
    columns: list[str] = []
    column_types: list[str] = []
    rows: list[dict] = []
    row_count: int = 0
    error: str | None = None


class TableInfo(BaseModel):
    source_id: str
    table_name: str       # Internal DuckDB name, e.g. "src_abc123"
    display_name: str     # Original filename, e.g. "sales_data.csv"
    row_count: int
    column_count: int


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/sources", response_model=list[SourceSummary])
async def list_sources():
    """List all data sources currently loaded in DuckDB."""
    service = get_duckdb_service()
    results = []
    for source_id in service._sources:
        try:
            schema = service.get_schema(source_id)
            results.append(SourceSummary(
                source_id=schema.source_id,
                name=schema.filename,
                row_count=schema.row_count,
                column_count=len(schema.columns),
            ))
        except Exception:
            continue
    return results

@router.get("/tables", response_model=list[TableInfo])
async def list_tables():
    """List all loaded DuckDB tables with their internal names (for raw SQL queries)."""
    service = get_duckdb_service()
    results = []
    for source_id in service._sources:
        try:
            schema = service.get_schema(source_id)
            results.append(TableInfo(
                source_id=schema.source_id,
                table_name=f"src_{source_id}",
                display_name=schema.filename,
                row_count=schema.row_count,
                column_count=len(schema.columns),
            ))
        except Exception:
            continue
    return results


@router.post("/query-raw", response_model=RawQueryResponse)
async def query_raw(request: RawQueryRequest):
    """Execute user-written SQL directly on DuckDB, bypassing table name substitution."""
    service = get_duckdb_service()

    sql = request.sql.strip()
    if not sql:
        return RawQueryResponse(success=False, error="SQL query is empty")

    # Safety: append LIMIT 10000 if user SQL has no LIMIT clause
    sql_upper = sql.rstrip(";").upper()
    if "LIMIT" not in sql_upper:
        sql = sql.rstrip(";") + " LIMIT 10000"

    try:
        result = service._conn.execute(sql)
        col_names = [desc[0] for desc in result.description]
        col_types = [str(desc[1]) for desc in result.description]
        rows_raw = result.fetchall()
        rows = [dict(zip(col_names, row)) for row in rows_raw]

        return RawQueryResponse(
            success=True,
            columns=col_names,
            column_types=col_types,
            rows=rows,
            row_count=len(rows),
        )
    except Exception as e:
        return RawQueryResponse(success=False, error=str(e))


@router.post("/upload", response_model=UploadResponse)
async def upload_csv(file: UploadFile = File(...)):
    """Upload a CSV file, load into DuckDB, return schema info."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    # Write uploaded file to temp location, then ingest
    with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        service = get_duckdb_service()
        schema = service.ingest_csv(tmp_path, file.filename)
    except ValueError as e:
        # User-friendly message from ingest_csv retry logic
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        raise HTTPException(
            status_code=422,
            detail=f"Could not parse \"{file.filename}\". Check that the file is a valid CSV with a header row.",
        )
    finally:
        tmp_path.unlink(missing_ok=True)

    return UploadResponse(
        source_id=schema.source_id,
        filename=schema.filename,
        row_count=schema.row_count,
        columns=[
            ColumnInfoResponse(
                name=c.name,
                type=c.type,
                nullable=c.nullable,
                sample_values=c.sample_values,
                null_count=c.null_count,
                distinct_count=c.distinct_count,
                min_value=c.min_value,
                max_value=c.max_value,
            )
            for c in schema.columns
        ],
    )


@router.get("/preview/{source_id}", response_model=PreviewResponse)
async def preview_data(source_id: str, limit: int = 10):
    """Get first N rows of an uploaded source."""
    service = get_duckdb_service()
    try:
        result = service.get_preview(source_id, limit)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Source not found: {e}")

    return PreviewResponse(
        columns=result.columns,
        rows=result.rows,
        row_count=result.row_count,
    )


@router.post("/query", response_model=QueryResponse)
async def execute_query(request: QueryRequest):
    """Execute SQL against an uploaded data source."""
    service = get_duckdb_service()
    try:
        result = service.execute_query(request.sql, request.source_id)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Query failed: {e}")

    return QueryResponse(
        columns=result.columns,
        rows=result.rows,
        row_count=result.row_count,
    )


@router.get("/schema/{source_id}", response_model=UploadResponse)
async def get_schema(source_id: str):
    """Get schema information for an uploaded source."""
    service = get_duckdb_service()
    try:
        schema = service.get_schema(source_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Source not found: {e}")

    return UploadResponse(
        source_id=schema.source_id,
        filename=schema.filename,
        row_count=schema.row_count,
        columns=[
            ColumnInfoResponse(
                name=c.name,
                type=c.type,
                nullable=c.nullable,
                sample_values=c.sample_values,
                null_count=c.null_count,
                distinct_count=c.distinct_count,
                min_value=c.min_value,
                max_value=c.max_value,
            )
            for c in schema.columns
        ],
    )
