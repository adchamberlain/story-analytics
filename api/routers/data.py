"""
Data router: CSV upload, schema inspection, and query execution.
"""

import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from ..services.duckdb_service import get_duckdb_service, _SAFE_SOURCE_ID_RE


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


class PasteRequest(BaseModel):
    data: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/sources", response_model=list[SourceSummary])
async def list_sources():
    """List all data sources currently loaded in DuckDB."""
    service = get_duckdb_service()
    results = []
    for source_id in list(service._sources):
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
    for source_id in list(service._sources):
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


@router.delete("/sources/{source_id}")
async def delete_source(source_id: str):
    """Delete a CSV data source: drop DuckDB table, remove from memory, delete files."""
    if not _SAFE_SOURCE_ID_RE.match(source_id):
        raise HTTPException(status_code=400, detail="Invalid source_id")

    service = get_duckdb_service()

    if source_id not in service._sources:
        raise HTTPException(status_code=404, detail="Source not found")

    # Drop the DuckDB table and remove from in-memory registry atomically
    table_name = f"src_{source_id}"
    with service._lock:
        try:
            service._conn.execute(f"DROP TABLE IF EXISTS {table_name}")
        except Exception:
            pass
        # Remove inside lock to avoid race with concurrent iterators
        service._sources.pop(source_id, None)

    # Delete upload directory from disk
    upload_dir = Path(__file__).parent.parent.parent / "data" / "uploads" / source_id
    if upload_dir.exists():
        shutil.rmtree(upload_dir)

    return {"deleted": True}


@router.post("/query-raw", response_model=RawQueryResponse)
async def query_raw(request: RawQueryRequest):
    """Execute user-written SQL directly on DuckDB, bypassing table name substitution."""
    service = get_duckdb_service()

    sql = request.sql.strip()
    if not sql:
        return RawQueryResponse(success=False, error="SQL query is empty")

    # Reject non-SELECT statements to prevent DML/DDL (DROP, INSERT, DELETE, etc.)
    import re as _re
    # Strip leading SQL comments (block and line) before checking the first keyword
    sql_stripped_comments = _re.sub(r'^\s*(/\*.*?\*/\s*|--[^\n]*(?:\n|$)\s*)*', '', sql, flags=_re.DOTALL)
    first_keyword = _re.match(r'\s*(\w+)', sql_stripped_comments)
    if not first_keyword or first_keyword.group(1).upper() not in ("SELECT", "WITH", "EXPLAIN"):
        return RawQueryResponse(
            success=False,
            error="Only SELECT, WITH, and EXPLAIN statements are allowed.",
        )

    # Reject multi-statement SQL: strip all semicolons to prevent piggy-backed DML
    sql = sql.replace(";", "")

    # Safety: append LIMIT 10000 if user SQL has no top-level LIMIT clause.
    if not _re.search(r'\bLIMIT\s+\d', sql, _re.IGNORECASE):
        sql = sql + " LIMIT 10000"

    try:
        with service._lock:
            result = service._conn.execute(sql)
            if result.description:
                col_names = [desc[0] for desc in result.description]
                col_types = [str(desc[1]) for desc in result.description]
                rows_raw = result.fetchall()
                rows = [dict(zip(col_names, row)) for row in rows_raw]
            else:
                # Non-SELECT statements (INSERT, UPDATE, DELETE) have no description
                col_names, col_types, rows = [], [], []

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
async def upload_csv(file: UploadFile = File(...), replace: str = Form("")):
    """Upload a CSV file, load into DuckDB, return schema info.

    If a source with the same filename already exists and ``replace`` is not
    set, returns 409 with the existing source_id so the frontend can prompt
    the user before overwriting.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    service = get_duckdb_service()

    # Check for existing source with the same filename
    existing_id = service.find_source_by_filename(file.filename)
    if existing_id and replace != "true":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "DUPLICATE_FILENAME",
                "existing_source_id": existing_id,
                "filename": file.filename,
            },
        )

    # If replacing, delete the old source first
    if existing_id and replace == "true":
        table_name = f"src_{existing_id}"
        try:
            with service._lock:
                service._conn.execute(f"DROP TABLE IF EXISTS {table_name}")
        except Exception:
            pass
        service._sources.pop(existing_id, None)
        upload_dir = Path(__file__).parent.parent.parent / "data" / "uploads" / existing_id
        if upload_dir.exists():
            shutil.rmtree(upload_dir)

    # Write uploaded file to temp location, then ingest
    MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
    with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as tmp:
        tmp_path = Path(tmp.name)
        content = await file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            tmp_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=413,
                detail="File too large. Maximum upload size is 100 MB.",
            )
        tmp.write(content)

    # Reuse the old source_id when replacing so existing charts keep working
    reuse_id = existing_id if (existing_id and replace == "true") else None

    try:
        schema = service.ingest_csv(tmp_path, file.filename, source_id=reuse_id)
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


@router.post("/paste", response_model=UploadResponse)
async def paste_data(request: PasteRequest):
    """Ingest pasted tabular data (CSV/TSV), load into DuckDB, return schema info."""
    text = request.data.strip()
    if not text:
        raise HTTPException(status_code=400, detail="No data provided")

    if len(text) > 50_000:
        raise HTTPException(
            status_code=400,
            detail="Pasted data is too large. Please upload a CSV file for datasets over ~10,000 rows.",
        )

    # Write pasted text to a temp file and ingest through the standard CSV path
    with tempfile.NamedTemporaryFile(delete=False, suffix='.csv', mode='w', encoding='utf-8') as tmp:
        tmp.write(text)
        tmp_path = Path(tmp.name)

    try:
        service = get_duckdb_service()
        schema = service.ingest_csv(tmp_path, "pasted_data.csv")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Could not parse pasted data. Check that it contains a header row and is tab- or comma-separated.",
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
    if not _SAFE_SOURCE_ID_RE.match(source_id):
        raise HTTPException(status_code=400, detail="Invalid source_id")
    limit = max(1, min(limit, 10_000))  # Clamp to prevent DoS
    service = get_duckdb_service()
    try:
        result = service.get_preview(source_id, limit)
    except Exception:
        raise HTTPException(status_code=404, detail="Source not found")

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
