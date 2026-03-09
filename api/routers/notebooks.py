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


class ExecuteAllResponse(BaseModel):
    results: list[dict]


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
    session = km.start_kernel(notebook_id)
    result = session.execute(body.code)
    return result


@router.post("/{notebook_id}/execute-all", response_model=ExecuteAllResponse)
async def execute_all_endpoint(
    notebook_id: str,
    user: dict = Depends(get_current_user),
):
    """Execute all code cells in order. Starts a fresh kernel, stops on error."""
    data = get_notebook(notebook_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Notebook not found")

    km = get_kernel_manager()

    # Shut down existing kernel and start fresh
    km.shutdown_kernel(notebook_id)
    session = km.start_kernel(notebook_id)

    results = []
    for cell in data.get("cells", []):
        if cell.get("cell_type") != "code":
            continue
        # Source can be a string or list of strings
        source = cell.get("source", "")
        if isinstance(source, list):
            source = "".join(source)
        if not source.strip():
            continue

        result = session.execute(source)
        results.append(result)

        if result.get("status") == "error":
            break

    return {"results": results}


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
