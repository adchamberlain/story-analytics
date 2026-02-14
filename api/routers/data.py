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


# ── Endpoints ────────────────────────────────────────────────────────────────

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
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse CSV: {e}")
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
