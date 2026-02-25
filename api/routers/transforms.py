"""Data transform endpoints -- modify source CSV in-place and re-ingest."""
from __future__ import annotations

import csv
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.duckdb_service import get_duckdb_service, _SAFE_SOURCE_ID_RE

router = APIRouter(prefix="/data", tags=["transforms"])


# -- Request schemas ----------------------------------------------------------

class RenameColumnRequest(BaseModel):
    old: str
    new: str


class DeleteColumnRequest(BaseModel):
    column: str


class ReorderColumnsRequest(BaseModel):
    columns: list[str]


class RoundRequest(BaseModel):
    column: str
    decimals: int = 2


class PrependAppendRequest(BaseModel):
    column: str
    prepend: str = ""
    append: str = ""


class EditCellRequest(BaseModel):
    row: int
    column: str
    value: str | int | float | None


class CastTypeRequest(BaseModel):
    column: str
    type: str  # "text" | "number" | "date"


# -- Helpers ------------------------------------------------------------------

def _validate_source_id(source_id: str) -> None:
    if not _SAFE_SOURCE_ID_RE.match(source_id):
        raise HTTPException(400, "Invalid source_id")


def _get_source_path(source_id: str) -> Path:
    """Find the CSV file for a source_id."""
    _validate_source_id(source_id)
    svc = get_duckdb_service()
    meta = svc._sources.get(source_id)
    if not meta:
        raise HTTPException(404, f"Source {source_id} not found")
    return meta.path


def _read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    """Read CSV into (columns, rows)."""
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        columns = list(reader.fieldnames or [])
        rows = list(reader)
    return columns, rows


def _write_csv(path: Path, columns: list[str], rows: list[dict[str, str]]) -> None:
    """Write rows back to CSV atomically via temp file."""
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    tmp.rename(path)


def _reingest_and_preview(source_id: str, path: Path, limit: int = 50) -> dict:
    """Re-ingest CSV into DuckDB and return updated preview."""
    svc = get_duckdb_service()
    svc.ingest_csv(path, path.name, source_id=source_id)
    result = svc.get_preview(source_id, limit)
    return {
        "columns": result.columns,
        "rows": result.rows,
        "row_count": result.row_count,
    }


# -- Endpoints ----------------------------------------------------------------

@router.post("/{source_id}/transform/transpose")
async def transpose(source_id: str):
    """Transpose the data: rows become columns and columns become rows."""
    path = _get_source_path(source_id)
    columns, rows = _read_csv(path)
    if not rows:
        raise HTTPException(400, "No data to transpose")

    # Build transposed layout:
    #   new columns = ["field", value_of_first_col_for_row0, value_of_first_col_for_row1, ...]
    #   new rows = one per original column (excluding the first), values from each original row
    first_col = columns[0]
    new_cols = ["field"] + [row.get(first_col, f"row_{i}") for i, row in enumerate(rows)]
    new_rows: list[dict[str, str]] = []
    for col in columns[1:]:
        new_row: dict[str, str] = {"field": col}
        for i, row in enumerate(rows):
            new_row[new_cols[i + 1]] = row.get(col, "")
        new_rows.append(new_row)

    _write_csv(path, new_cols, new_rows)
    return _reingest_and_preview(source_id, path)


@router.post("/{source_id}/transform/rename-column")
async def rename_column(source_id: str, req: RenameColumnRequest):
    """Rename a single column."""
    path = _get_source_path(source_id)
    columns, rows = _read_csv(path)
    if req.old not in columns:
        raise HTTPException(404, f"Column '{req.old}' not found")

    new_columns = [req.new if c == req.old else c for c in columns]
    new_rows = [
        {(req.new if k == req.old else k): v for k, v in row.items()}
        for row in rows
    ]
    _write_csv(path, new_columns, new_rows)
    return _reingest_and_preview(source_id, path)


@router.post("/{source_id}/transform/delete-column")
async def delete_column(source_id: str, req: DeleteColumnRequest):
    """Delete a column from the dataset."""
    path = _get_source_path(source_id)
    columns, rows = _read_csv(path)
    if req.column not in columns:
        raise HTTPException(404, f"Column '{req.column}' not found")

    new_columns = [c for c in columns if c != req.column]
    new_rows = [{k: v for k, v in row.items() if k != req.column} for row in rows]
    _write_csv(path, new_columns, new_rows)
    return _reingest_and_preview(source_id, path)


@router.post("/{source_id}/transform/reorder-columns")
async def reorder_columns(source_id: str, req: ReorderColumnsRequest):
    """Reorder columns to match the provided order."""
    path = _get_source_path(source_id)
    columns, rows = _read_csv(path)
    for col in req.columns:
        if col not in columns:
            raise HTTPException(404, f"Column '{col}' not found")

    new_rows = [{c: row.get(c, "") for c in req.columns} for row in rows]
    _write_csv(path, req.columns, new_rows)
    return _reingest_and_preview(source_id, path)


@router.post("/{source_id}/transform/round")
async def round_column(source_id: str, req: RoundRequest):
    """Round numeric values in a column to N decimal places."""
    path = _get_source_path(source_id)
    columns, rows = _read_csv(path)
    if req.column not in columns:
        raise HTTPException(404, f"Column '{req.column}' not found")

    for row in rows:
        try:
            row[req.column] = str(round(float(row[req.column]), req.decimals))
        except (ValueError, TypeError):
            pass  # Leave non-numeric values as-is
    _write_csv(path, columns, rows)
    return _reingest_and_preview(source_id, path)


@router.post("/{source_id}/transform/prepend-append")
async def prepend_append(source_id: str, req: PrependAppendRequest):
    """Prepend and/or append text to all values in a column."""
    path = _get_source_path(source_id)
    columns, rows = _read_csv(path)
    if req.column not in columns:
        raise HTTPException(404, f"Column '{req.column}' not found")

    for row in rows:
        val = row.get(req.column, "")
        row[req.column] = f"{req.prepend}{val}{req.append}"
    _write_csv(path, columns, rows)
    return _reingest_and_preview(source_id, path)


@router.post("/{source_id}/transform/edit-cell")
async def edit_cell(source_id: str, req: EditCellRequest):
    """Edit a single cell value by row index and column name."""
    path = _get_source_path(source_id)
    columns, rows = _read_csv(path)
    if req.column not in columns:
        raise HTTPException(404, f"Column '{req.column}' not found")
    if req.row < 0 or req.row >= len(rows):
        raise HTTPException(400, f"Row {req.row} out of range (0-{len(rows) - 1})")

    rows[req.row][req.column] = "" if req.value is None else str(req.value)
    _write_csv(path, columns, rows)
    return _reingest_and_preview(source_id, path)


@router.post("/{source_id}/transform/cast-type")
async def cast_type(source_id: str, req: CastTypeRequest):
    """Cast a column to a different type (text, number, date)."""
    path = _get_source_path(source_id)
    columns, rows = _read_csv(path)
    if req.column not in columns:
        raise HTTPException(404, f"Column '{req.column}' not found")

    for row in rows:
        val = row.get(req.column, "")
        if req.type == "number":
            try:
                row[req.column] = str(float(val))
            except (ValueError, TypeError):
                row[req.column] = ""  # Non-parseable becomes empty (NULL after ingest)
        elif req.type == "text":
            row[req.column] = str(val)
        # "date" -- leave as-is; DuckDB handles date parsing on ingest
    _write_csv(path, columns, rows)
    return _reingest_and_preview(source_id, path)
