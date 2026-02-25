"""
Data router: CSV upload, schema inspection, and query execution.
"""

import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Response
from pydantic import BaseModel, Field

from ..auth_simple import get_current_user

from ..services.duckdb_service import get_duckdb_service, _SAFE_SOURCE_ID_RE
from ..services.connectors.google_sheets import parse_sheets_url, build_export_url, fetch_sheet_csv
from ..services.data_cache import get_cached, set_cached
from ..services.storage import get_storage


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
    source_id: str = Field(..., examples=["abc123def456"], description="Unique source identifier")
    filename: str = Field(..., examples=["sales_data.csv"], description="Original filename")
    row_count: int = Field(..., examples=[1500], description="Number of rows in the dataset")
    columns: list[ColumnInfoResponse] = Field(..., description="Column schema information")


class QueryRequest(BaseModel):
    source_id: str = Field(..., examples=["abc123def456"], description="Source to query against")
    sql: str = Field(..., examples=["SELECT name, revenue FROM {{source}} ORDER BY revenue DESC"], description="SQL query (use {{source}} as table placeholder)")


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
    name: str | None = None


class RenameRequest(BaseModel):
    name: str


class GoogleSheetsRequest(BaseModel):
    url: str
    name: str | None = None


class UrlSourceRequest(BaseModel):
    url: str
    name: str | None = None
    headers: dict[str, str] | None = None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/sources", response_model=list[SourceSummary])
async def list_sources(user: dict = Depends(get_current_user)):
    """List all data sources currently loaded in DuckDB, newest first."""
    service = get_duckdb_service()
    results: list[tuple[datetime, SourceSummary]] = []
    for source_id in list(service._sources):
        try:
            schema = service.get_schema(source_id)
            ingested_at = service.get_ingested_at(source_id)
            results.append((
                ingested_at or datetime.min.replace(tzinfo=timezone.utc),
                SourceSummary(
                    source_id=schema.source_id,
                    name=schema.filename,
                    row_count=schema.row_count,
                    column_count=len(schema.columns),
                ),
            ))
        except Exception:
            continue
    results.sort(key=lambda t: t[0], reverse=True)
    return [summary for _, summary in results]

@router.get("/tables", response_model=list[TableInfo])
async def list_tables(user: dict = Depends(get_current_user)):
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
async def delete_source(source_id: str, user: dict = Depends(get_current_user)):
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

    # Delete upload directory from storage
    storage = get_storage()
    storage.delete_tree(f"uploads/{source_id}")

    return {"deleted": True}


@router.post("/query-raw", response_model=RawQueryResponse)
async def query_raw(request: RawQueryRequest, user: dict = Depends(get_current_user)):
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
async def upload_csv(file: UploadFile = File(...), replace: str = Form(""), user: dict = Depends(get_current_user)):
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
        with service._lock:
            try:
                service._conn.execute(f"DROP TABLE IF EXISTS {table_name}")
            except Exception:
                pass
            service._sources.pop(existing_id, None)
        storage = get_storage()
        storage.delete_tree(f"uploads/{existing_id}")

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
async def paste_data(request: PasteRequest, user: dict = Depends(get_current_user)):
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

        # Determine filename: use user-provided name or fall back to sentinel.
        if request.name and request.name.strip():
            paste_filename = request.name.strip()
            if not paste_filename.lower().endswith('.csv'):
                paste_filename += '.csv'
        else:
            paste_filename = "__paste__.csv"

        # Replace previous source with same filename if it exists.
        existing_paste_id = service.find_source_by_filename(paste_filename)
        if existing_paste_id:
            table_name = f"src_{existing_paste_id}"
            with service._lock:
                try:
                    service._conn.execute(f"DROP TABLE IF EXISTS {table_name}")
                except Exception:
                    pass
                service._sources.pop(existing_paste_id, None)

        schema = service.ingest_csv(tmp_path, paste_filename)
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


@router.patch("/sources/{source_id}/rename")
async def rename_source(source_id: str, request: RenameRequest, user: dict = Depends(get_current_user)):
    """Rename a data source (update the display filename)."""
    if not _SAFE_SOURCE_ID_RE.match(source_id):
        raise HTTPException(status_code=400, detail="Invalid source_id")

    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    # Ensure .csv extension
    if not name.lower().endswith('.csv'):
        name = name + '.csv'

    service = get_duckdb_service()
    meta = service._sources.get(source_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Source not found")

    # Rename the file via storage backend
    old_path = meta.path
    safe_new_name = Path(name).name  # sanitize
    new_path = old_path.parent / safe_new_name
    if old_path != new_path:
        storage = get_storage()
        old_key = f"uploads/{source_id}/{old_path.name}"
        new_key = f"uploads/{source_id}/{safe_new_name}"
        storage.rename(old_key, new_key)
        meta.path = new_path

    return {"ok": True, "filename": new_path.name}


@router.get("/preview/{source_id}", response_model=PreviewResponse)
async def preview_data(source_id: str, limit: int = 10, user: dict = Depends(get_current_user)):
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
async def execute_query(request: QueryRequest, user: dict = Depends(get_current_user)):
    """Execute SQL against an uploaded data source."""
    if not _SAFE_SOURCE_ID_RE.match(request.source_id):
        raise HTTPException(status_code=400, detail="Invalid source_id")
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
async def get_schema(source_id: str, user: dict = Depends(get_current_user)):
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


def _build_upload_response(schema) -> UploadResponse:
    """Helper to build UploadResponse from a SourceSchema."""
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


@router.post("/import/google-sheets", response_model=UploadResponse)
async def import_google_sheets(request: GoogleSheetsRequest, response: Response, user: dict = Depends(get_current_user)):
    """Import data from a public Google Sheets document.

    The sheet must be publicly shared (Anyone with the link).
    """
    try:
        parsed = parse_sheets_url(request.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    export_url = build_export_url(parsed["sheet_id"], parsed["gid"])

    # Check cache first
    cached = get_cached(export_url)
    staleness = 0
    if cached:
        # Write cached data to temp file
        import tempfile as _tf
        tmp = _tf.NamedTemporaryFile(delete=False, suffix=".csv")
        tmp.write(cached["data"])
        tmp.close()
        csv_path = Path(tmp.name)
        staleness = cached["age_seconds"]
    else:
        try:
            csv_path = await fetch_sheet_csv(export_url)
        except Exception as e:
            raise HTTPException(
                status_code=422,
                detail=f"Could not fetch sheet: {e}. Make sure the sheet is publicly shared.",
            )
        # Cache the fetched content
        set_cached(export_url, csv_path.read_bytes())

    filename = request.name or f"gsheet_{parsed['sheet_id'][:8]}.csv"
    if not filename.lower().endswith(".csv"):
        filename += ".csv"

    service = get_duckdb_service()

    # Replace existing source with same name
    existing_id = service.find_source_by_filename(filename)
    if existing_id:
        table_name = f"src_{existing_id}"
        with service._lock:
            try:
                service._conn.execute(f"DROP TABLE IF EXISTS {table_name}")
            except Exception:
                pass
            service._sources.pop(existing_id, None)

    try:
        schema = service.ingest_csv(csv_path, filename, source_id=existing_id)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse sheet data: {e}")
    finally:
        csv_path.unlink(missing_ok=True)

    response.headers["X-Data-Staleness"] = str(staleness)
    return _build_upload_response(schema)


@router.post("/import/url", response_model=UploadResponse)
async def import_from_url(request: UrlSourceRequest, response: Response, user: dict = Depends(get_current_user)):
    """Import CSV or JSON data from an external URL.

    Optionally pass custom HTTP headers for authenticated endpoints.
    """
    import httpx as _httpx

    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is empty")

    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

    headers = request.headers or {}

    # Check cache first
    cached = get_cached(url, headers)
    if cached:
        content = cached["data"]
        content_type = ""  # Will be inferred from URL extension
        staleness = cached["age_seconds"]
    else:
        try:
            async with _httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
        except _httpx.HTTPStatusError as e:
            raise HTTPException(status_code=422, detail=f"HTTP {e.response.status_code} fetching URL")
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not fetch URL: {e}")

        content = resp.content
        content_type = resp.headers.get("content-type", "")
        etag = resp.headers.get("etag")
        set_cached(url, content, headers, etag=etag)
        staleness = 0

    # Convert JSON array-of-objects to CSV
    import json as _json

    if "json" in content_type or url.endswith(".json"):
        try:
            data = _json.loads(content)
            if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                import csv as _csv
                import io as _io

                cols = list(data[0].keys())
                buf = _io.StringIO()
                writer = _csv.DictWriter(buf, fieldnames=cols)
                writer.writeheader()
                writer.writerows(data)
                content = buf.getvalue().encode("utf-8")
            else:
                raise HTTPException(
                    status_code=422,
                    detail="JSON must be an array of objects [{...}, ...]",
                )
        except _json.JSONDecodeError as e:
            raise HTTPException(status_code=422, detail=f"Invalid JSON: {e}")

    # Write to temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
    tmp.write(content)
    tmp.close()
    csv_path = Path(tmp.name)

    # Determine filename
    filename = request.name
    if not filename:
        from urllib.parse import urlparse as _urlparse

        path = _urlparse(url).path
        filename = Path(path).stem or "url_import"
    if not filename.lower().endswith(".csv"):
        filename += ".csv"

    service = get_duckdb_service()

    # Replace existing source with same name
    existing_id = service.find_source_by_filename(filename)
    if existing_id:
        table_name = f"src_{existing_id}"
        with service._lock:
            try:
                service._conn.execute(f"DROP TABLE IF EXISTS {table_name}")
            except Exception:
                pass
            service._sources.pop(existing_id, None)

    try:
        schema = service.ingest_csv(csv_path, filename, source_id=existing_id)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse data: {e}")
    finally:
        csv_path.unlink(missing_ok=True)

    response.headers["X-Data-Staleness"] = str(staleness)
    return _build_upload_response(schema)
