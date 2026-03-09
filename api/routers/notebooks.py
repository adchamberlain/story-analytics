"""
Notebooks router: CRUD, upload, kernel execution, and DataFrame bridge.
"""

from __future__ import annotations

import json
import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

from ..auth_simple import get_current_user
from ..services.notebook_storage import (
    create_notebook,
    create_notebook_from_ipynb,
    get_notebook,
    list_notebooks,
    update_notebook,
    delete_notebook,
)
from ..services.kernel_manager import get_kernel_manager
from ..services.duckdb_service import get_duckdb_service
from ..services.settings_storage import load_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


# ── Request / Response Schemas ───────────────────────────────────────────────


class CreateNotebookRequest(BaseModel):
    title: str = "Untitled"


class UpdateNotebookRequest(BaseModel):
    title: str | None = None
    cells: list[dict] | None = None


class NotebookMetaResponse(BaseModel):
    id: str
    title: str
    cell_count: int
    created_at: str
    updated_at: str


class ExecuteCellRequest(BaseModel):
    code: str


class ExecuteCellResponse(BaseModel):
    status: str
    outputs: list[dict]
    execution_count: int | None = None
    df_var: str | None = None  # Variable name if SQL result was injected as DataFrame


class ExecuteAllCellResult(BaseModel):
    cell_id: str
    status: str = "ok"
    outputs: list[dict] = Field(default_factory=list)
    execution_count: int | None = None
    df_var: str | None = None


class ExecuteAllResponse(BaseModel):
    cells: list[ExecuteAllCellResult]


class DataFramesResponse(BaseModel):
    dataframes: dict


class DataFrameToSourceResponse(BaseModel):
    source_id: str
    filename: str
    row_count: int


# ── Helpers ──────────────────────────────────────────────────────────────────


def _meta_to_response(meta) -> NotebookMetaResponse:
    """Convert a NotebookMeta dataclass to a response model."""
    return NotebookMetaResponse(
        id=meta.id,
        title=meta.title,
        cell_count=meta.cell_count,
        created_at=meta.created_at,
        updated_at=meta.updated_at,
    )


# ── CRUD Endpoints ───────────────────────────────────────────────────────────


@router.post("/", response_model=NotebookMetaResponse)
async def create_notebook_endpoint(
    body: CreateNotebookRequest,
    user: dict = Depends(get_current_user),
):
    """Create a new notebook."""
    meta = create_notebook(title=body.title)
    return _meta_to_response(meta)


@router.get("/", response_model=list[NotebookMetaResponse])
async def list_notebooks_endpoint(
    user: dict = Depends(get_current_user),
):
    """List all notebooks."""
    return [_meta_to_response(m) for m in list_notebooks()]


@router.get("/{notebook_id}")
async def get_notebook_endpoint(
    notebook_id: str,
    user: dict = Depends(get_current_user),
):
    """Get full notebook .ipynb JSON."""
    data = get_notebook(notebook_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return data


@router.put("/{notebook_id}", response_model=NotebookMetaResponse)
async def update_notebook_endpoint(
    notebook_id: str,
    body: UpdateNotebookRequest,
    user: dict = Depends(get_current_user),
):
    """Update a notebook's title and/or cells."""
    meta = update_notebook(notebook_id, title=body.title, cells=body.cells)
    if meta is None:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return _meta_to_response(meta)


@router.delete("/{notebook_id}")
async def delete_notebook_endpoint(
    notebook_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete a notebook and shut down any active kernel."""
    # Shut down kernel if running
    km = get_kernel_manager()
    km.shutdown_kernel(notebook_id)

    deleted = delete_notebook(notebook_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return {"ok": True}


@router.post("/upload", response_model=NotebookMetaResponse)
async def upload_notebook_endpoint(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload an .ipynb file."""
    if not file.filename or not file.filename.lower().endswith(".ipynb"):
        raise HTTPException(status_code=400, detail="File must be a .ipynb notebook")

    content = await file.read()
    try:
        meta = create_notebook_from_ipynb(content, file.filename)
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _meta_to_response(meta)


# ── Kernel Execution Endpoints ───────────────────────────────────────────────


def _next_sql_var(session) -> str:
    """Find the next available sql_N variable name in the kernel."""
    code = """
import json as _json_
_n_ = 1
while f"sql_{_n_}" in dir():
    _n_ += 1
print(_n_)
del _n_, _json_
"""
    result = session.execute(code)
    n = 1
    for output in result.get("outputs", []):
        if output.get("output_type") == "stream" and output.get("name") == "stdout":
            try:
                n = int(output["text"].strip())
            except (ValueError, TypeError):
                pass
            break
    return f"sql_{n}"


def _build_df_injection(var_name: str, columns: list[str], rows: list) -> str:
    """Build Python code that creates a pandas DataFrame in the kernel."""
    # Serialize column data as JSON for safe transfer
    col_data = {}
    for i, col in enumerate(columns):
        col_data[col] = [_serialize_value(row[i]) for row in rows]

    return (
        f"import pandas as _pd_\n"
        f"{var_name} = _pd_.DataFrame({json.dumps(col_data)})\n"
        f"del _pd_\n"
    )


def _serialize_value(val):
    """Convert a DuckDB value to a JSON-safe Python value."""
    if val is None:
        return None
    if isinstance(val, (int, float, bool, str)):
        return val
    # datetime, date, Decimal, etc. → string
    return str(val)


def _inject_sources_if_new(session) -> None:
    """Inject Story Analytics data sources into a freshly started kernel."""
    try:
        service = get_duckdb_service()
        sources = []
        for source_id in list(service._sources):
            try:
                schema = service.get_schema(source_id)
                sources.append({
                    "source_id": source_id,
                    "name": schema.filename,
                    "table_name": f"src_{source_id}",
                    "row_count": schema.row_count,
                    "column_count": len(schema.columns),
                })
            except Exception:
                continue
        if sources:
            session.inject_sources(sources)
    except Exception:
        pass  # Don't fail kernel start if source injection fails


@router.post("/{notebook_id}/execute", response_model=ExecuteCellResponse)
async def execute_cell_endpoint(
    notebook_id: str,
    body: ExecuteCellRequest,
    user: dict = Depends(get_current_user),
):
    """Execute a single cell of code."""
    # Verify notebook exists
    data = get_notebook(notebook_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Notebook not found")

    km = get_kernel_manager()
    is_new = km.get_kernel(notebook_id) is None
    session = km.start_kernel(notebook_id)
    if is_new:
        _inject_sources_if_new(session)
    result = session.execute(body.code)
    return result


@router.post("/{notebook_id}/execute-all", response_model=ExecuteAllResponse)
async def execute_all_endpoint(
    notebook_id: str,
    user: dict = Depends(get_current_user),
):
    """Execute all code/SQL cells in order. Starts a fresh kernel, stops on error."""
    data = get_notebook(notebook_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Notebook not found")

    km = get_kernel_manager()

    # Shut down existing kernel and start fresh
    km.shutdown_kernel(notebook_id)
    session = km.start_kernel(notebook_id)
    _inject_sources_if_new(session)

    service = get_duckdb_service()
    cell_results: list[dict] = []

    for cell in data.get("cells", []):
        cell_id = cell.get("id", "")
        cell_type = cell.get("cell_type", "")
        is_sql = cell.get("metadata", {}).get("sa_cell_type") == "sql"

        # Skip markdown cells
        if cell_type == "markdown":
            continue

        source = cell.get("source", "")
        if isinstance(source, list):
            source = "".join(source)
        if not source.strip():
            continue

        if is_sql:
            # Execute SQL cell via DuckDB, inject result as DataFrame
            try:
                db_result = service._conn.execute(source)
                columns = [desc[0] for desc in db_result.description]
                rows = db_result.fetchall()

                html = '<table class="dataframe"><thead><tr>'
                for col in columns:
                    html += f"<th>{col}</th>"
                html += "</tr></thead><tbody>"
                for row in rows[:500]:
                    html += "<tr>"
                    for val in row:
                        html += f"<td>{val}</td>"
                    html += "</tr>"
                html += "</tbody></table>"

                text_summary = f"{len(rows)} rows x {len(columns)} columns"

                df_var = _next_sql_var(session)
                inject_code = _build_df_injection(df_var, columns, rows)
                session.execute(inject_code)

                cell_results.append({
                    "cell_id": cell_id,
                    "status": "ok",
                    "outputs": [{
                        "output_type": "execute_result",
                        "data": {"text/html": html, "text/plain": text_summary},
                        "metadata": {},
                    }],
                    "execution_count": None,
                    "df_var": df_var,
                })
            except Exception as e:
                cell_results.append({
                    "cell_id": cell_id,
                    "status": "error",
                    "outputs": [{
                        "output_type": "error",
                        "ename": "SQLError",
                        "evalue": str(e),
                        "traceback": [],
                    }],
                    "execution_count": None,
                })
                break
        else:
            # Execute Python code cell
            result = session.execute(source)
            cell_results.append({
                "cell_id": cell_id,
                "status": result.get("status", "ok"),
                "outputs": result.get("outputs", []),
                "execution_count": result.get("execution_count"),
            })

            if result.get("status") == "error":
                break

    return {"cells": cell_results}


@router.post("/{notebook_id}/execute-sql", response_model=ExecuteCellResponse)
async def execute_sql_endpoint(
    notebook_id: str,
    body: ExecuteCellRequest,
    user: dict = Depends(get_current_user),
):
    """Execute SQL against DuckDB, return results as an HTML table, and inject as DataFrame."""
    data = get_notebook(notebook_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Notebook not found")

    sql_code = body.code.strip()
    if not sql_code:
        return {"status": "ok", "outputs": [], "execution_count": None}

    service = get_duckdb_service()
    try:
        result = service._conn.execute(sql_code)
        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()

        # Build HTML table matching pandas DataFrame output format
        html = '<table class="dataframe"><thead><tr>'
        for col in columns:
            html += f"<th>{col}</th>"
        html += "</tr></thead><tbody>"
        for row in rows[:500]:  # Limit display to 500 rows
            html += "<tr>"
            for val in row:
                html += f"<td>{val}</td>"
            html += "</tr>"
        html += "</tbody></table>"

        text_summary = f"{len(rows)} rows x {len(columns)} columns"

        # Inject result as a DataFrame into the Jupyter kernel
        df_var = None
        km = get_kernel_manager()
        is_new = km.get_kernel(notebook_id) is None
        session = km.start_kernel(notebook_id)
        if is_new:
            _inject_sources_if_new(session)

        # Pick next sql_N variable name
        df_var = _next_sql_var(session)

        # Build injection code: create DataFrame from column data
        inject_code = _build_df_injection(df_var, columns, rows)
        session.execute(inject_code)

        return {
            "status": "ok",
            "outputs": [
                {
                    "output_type": "execute_result",
                    "data": {"text/html": html, "text/plain": text_summary},
                    "metadata": {},
                },
            ],
            "execution_count": None,
            "df_var": df_var,
        }
    except Exception as e:
        return {
            "status": "error",
            "outputs": [
                {
                    "output_type": "error",
                    "ename": "SQLError",
                    "evalue": str(e),
                    "traceback": [],
                }
            ],
            "execution_count": None,
        }


@router.post("/{notebook_id}/interrupt")
async def interrupt_kernel_endpoint(
    notebook_id: str,
    user: dict = Depends(get_current_user),
):
    """Interrupt the running kernel."""
    km = get_kernel_manager()
    session = km.get_kernel(notebook_id)
    if session is None:
        raise HTTPException(status_code=404, detail="No active kernel for this notebook")
    session.interrupt()
    return {"ok": True}


@router.post("/{notebook_id}/restart")
async def restart_kernel_endpoint(
    notebook_id: str,
    user: dict = Depends(get_current_user),
):
    """Restart the kernel (clears all variables)."""
    km = get_kernel_manager()
    session = km.restart_kernel(notebook_id)
    if session is None:
        raise HTTPException(status_code=404, detail="No active kernel for this notebook")
    return {"ok": True}


@router.post("/{notebook_id}/shutdown")
async def shutdown_kernel_endpoint(
    notebook_id: str,
    user: dict = Depends(get_current_user),
):
    """Shut down the kernel."""
    km = get_kernel_manager()
    km.shutdown_kernel(notebook_id)
    return {"ok": True}


# ── DataFrame Bridge Endpoints ───────────────────────────────────────────────


@router.get("/{notebook_id}/dataframes", response_model=DataFramesResponse)
async def list_dataframes_endpoint(
    notebook_id: str,
    user: dict = Depends(get_current_user),
):
    """List DataFrames in the kernel namespace."""
    km = get_kernel_manager()
    session = km.get_kernel(notebook_id)
    if session is None:
        raise HTTPException(status_code=404, detail="No active kernel for this notebook")
    dfs = session.get_dataframes()
    return {"dataframes": dfs}


@router.post(
    "/{notebook_id}/dataframes/{df_name}/to-source",
    response_model=DataFrameToSourceResponse,
)
async def dataframe_to_source_endpoint(
    notebook_id: str,
    df_name: str,
    user: dict = Depends(get_current_user),
):
    """Serialize a DataFrame to CSV and ingest as a Story Analytics data source."""
    km = get_kernel_manager()
    session = km.get_kernel(notebook_id)
    if session is None:
        raise HTTPException(status_code=404, detail="No active kernel for this notebook")

    csv_text = session.get_dataframe_csv(df_name)
    if csv_text is None:
        raise HTTPException(status_code=404, detail=f"DataFrame '{df_name}' not found in kernel")

    # Write CSV to a temp file and ingest via DuckDB service
    filename = f"{df_name}.csv"
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w") as tmp:
        tmp.write(csv_text)
        tmp_path = Path(tmp.name)

    try:
        duckdb_svc = get_duckdb_service()
        schema = duckdb_svc.ingest_csv(tmp_path, filename)
    finally:
        tmp_path.unlink(missing_ok=True)

    return DataFrameToSourceResponse(
        source_id=schema.source_id,
        filename=schema.filename,
        row_count=schema.row_count,
    )


# ── AI Assistant Endpoint ────────────────────────────────────────────────────

# Map settings provider names -> engine provider names
_PROVIDER_NAME_MAP = {
    "anthropic": "claude",
    "openai": "openai",
    "google": "gemini",
}

_NOTEBOOK_AI_SYSTEM_PROMPT = """You are an AI assistant embedded in a Python notebook environment (similar to Jupyter).
You help users write Python code and SQL queries for data analysis.

The environment has:
- Python with pandas, numpy, matplotlib, and other common data science libraries
- SQL cells that execute against DuckDB
- Data sources available as DuckDB tables (queryable via SQL cells or via duckdb.sql() in Python cells)
- SQL cell results are automatically saved as pandas DataFrames (named sql_1, sql_2, etc.) accessible in Python cells

{schema_context}


{notebook_context}

Guidelines:
- When suggesting code, wrap it in ```python or ```sql code blocks
- Be concise and practical
- Prefer pandas for data manipulation, matplotlib/seaborn for plotting
- For SQL, use DuckDB syntax (very close to PostgreSQL)
- When referencing data sources, use the table names shown above
- Reference existing variables and DataFrames from the notebook cells when relevant
"""


class NotebookCellContext(BaseModel):
    cell_type: str
    source: str
    df_var: str | None = None


class NotebookAiRequest(BaseModel):
    messages: list[dict]  # [{role: "user"|"assistant", content: str}]
    cells: list[NotebookCellContext] | None = None


@router.post("/{notebook_id}/ai-assist")
async def notebook_ai_assist(
    notebook_id: str,
    body: NotebookAiRequest,
    user: dict = Depends(get_current_user),
):
    """AI assistant for notebook — answers Python/SQL questions with context."""
    settings = load_settings()

    if not settings.ai_provider:
        raise HTTPException(
            status_code=400,
            detail="No AI provider configured. Set one in Settings.",
        )

    key_map = {
        "anthropic": settings.anthropic_api_key,
        "openai": settings.openai_api_key,
        "google": settings.google_api_key,
    }
    api_key = key_map.get(settings.ai_provider)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"No API key configured for {settings.ai_provider}.",
        )

    # Build schema context from available data sources
    schema_context = ""
    try:
        service = get_duckdb_service()
        lines = ["Available data sources:"]
        for source_id in list(service._sources):
            try:
                schema = service.get_schema(source_id)
                view_name = service.get_view_name(source_id)
                table_label = view_name or f"src_{source_id}"
                cols = ", ".join(f"{c.name} ({c.type})" for c in schema.columns[:20])
                lines.append(f"- {table_label} ({schema.filename}, {schema.row_count} rows): {cols}")
            except Exception:
                continue
        if len(lines) > 1:
            schema_context = "\n".join(lines)
    except Exception:
        pass

    # Build notebook context from current cell contents
    notebook_context = ""
    if body.cells:
        cell_lines = ["Current notebook cells:"]
        for i, cell in enumerate(body.cells, 1):
            label = cell.cell_type.upper()
            if cell.df_var:
                label += f" → {cell.df_var}"
            # Truncate very long cells to avoid blowing up the context
            source = cell.source[:2000]
            if len(cell.source) > 2000:
                source += "\n... (truncated)"
            cell_lines.append(f"[Cell {i} ({label})]:\n```\n{source}\n```")
        notebook_context = "\n\n".join(cell_lines)

    system = _NOTEBOOK_AI_SYSTEM_PROMPT.format(
        schema_context=schema_context,
        notebook_context=notebook_context,
    )

    from engine.llm.base import Message
    from engine.llm.claude import get_provider

    messages = [
        Message(role=m["role"], content=m["content"]) for m in body.messages
    ]

    provider_name = _PROVIDER_NAME_MAP.get(settings.ai_provider, settings.ai_provider)
    provider = get_provider(provider_name)

    try:
        response = provider.generate(
            messages=messages,
            system_prompt=system,
        )
        return {"content": response.content, "model": response.model}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI generation failed: {e}",
        )
