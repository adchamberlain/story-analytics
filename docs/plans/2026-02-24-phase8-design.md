# Phase 8 Design: Data Transforms, Edit History, CSV Download

> **Date**: 2026-02-24
> **Status**: Approved
> **Execution**: 3 parallel worktree sessions (N, O, P)

## Overview

Phase 8 closes the medium-impact Datawrapper parity gaps:
1. Spreadsheet-lite data transform step (column operations + inline cell editing)
2. Auto-save edit history with restore UI
3. Configurable "Get the Data" CSV download

---

## Session N: Data Transforms

**Goal**: Spreadsheet-lite data editing between upload and chart creation, matching Datawrapper's "Step 2: Check & Describe."

### Backend: Transform Endpoints

New router `api/routers/transforms.py`:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/data/{source_id}/transform/transpose` | Swap rows and columns |
| `POST /api/data/{source_id}/transform/rename-column` | `{old, new}` |
| `POST /api/data/{source_id}/transform/delete-column` | `{column}` |
| `POST /api/data/{source_id}/transform/reorder-columns` | `{columns: [...]}` |
| `POST /api/data/{source_id}/transform/round` | `{column, decimals}` |
| `POST /api/data/{source_id}/transform/prepend-append` | `{column, prepend?, append?}` |
| `POST /api/data/{source_id}/transform/edit-cell` | `{row, column, value}` |
| `POST /api/data/{source_id}/transform/cast-type` | `{column, type: "text"\|"number"\|"date"}` |

Each transform modifies the source CSV on disk and re-ingests into DuckDB. Returns the updated preview (columns + first N rows).

### Frontend: DataTransformGrid Component

- Editable data grid rendered as an HTML `<table>` with all rows/columns from the source
- **Column header actions**: dropdown menu per column with rename, delete, reorder, round, cast type, prepend/append
- **Inline cell editing**: click cell to enter edit mode, blur or Enter saves via edit-cell endpoint
- **Transpose button** in toolbar above the grid
- **Undo stack**: keep previous 10 CSV states in memory for single-level undo
- **Placement**: new panel/step in the editor flow between data source selection and chart configuration
- **Skip button**: transforms are optional, user can proceed directly to chart config

### Tests
- ~15 backend pytest tests (one per transform + edge cases like empty columns, type conflicts)
- ~10 frontend vitest tests (grid rendering, cell edit, column operations, undo)

---

## Session O: Edit History / Versioning

**Goal**: Auto-save chart version snapshots with debounced triggers, plus a timeline UI for browsing and restoring past versions.

### Backend: Version Storage

New service `api/services/version_storage.py`:

- **Storage layout**: `data/versions/{chart_id}/` directory, files named `{version_number}.json`
- Each version file: complete copy of `SavedChart` JSON + version metadata:
  ```json
  { "version": 3, "created_at": "...", "trigger": "auto|publish|manual", "label": null }
  ```
- **Snapshot triggers**:
  - Every 30 saves (count tracked in-memory per chart)
  - After 60 seconds of idle (frontend debounce, then calls backend)
  - On every publish action
  - Manual "Save Version" button in editor
- **Pruning**: Keep last 50 versions per chart. Delete oldest on overflow.

### Backend: Version Endpoints

New router `api/routers/versions.py`:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v2/charts/{id}/versions` | Create version snapshot (`{trigger: "auto"\|"publish"\|"manual"}`) |
| `GET /api/v2/charts/{id}/versions` | List all versions (version number, created_at, trigger, label) |
| `GET /api/v2/charts/{id}/versions/{version}` | Get full version content |
| `POST /api/v2/charts/{id}/versions/{version}/restore` | Restore chart to this version (overwrites current) |
| `DELETE /api/v2/charts/{id}/versions/{version}` | Delete a specific version |

### Frontend: Version Timeline

- **VersionHistoryPanel**: sidebar or modal showing chronological version list
  - Each entry: version number, relative timestamp, trigger badge (auto/publish/manual)
  - Click to preview: read-only render of that version's chart config
  - "Restore" button with confirmation dialog, calls restore endpoint, reloads editor
- **Auto-save logic** in `editorStore.ts`:
  - Track save count per chart. Every 30th save → `POST /versions` with trigger "auto"
  - Debounce timer: after 60s idle post-edit → create auto snapshot
- **Editor header**: "Save Version" button + "History" button to open VersionHistoryPanel
- **Publish flow**: On publish, auto-create version with trigger "publish"

### Republish Distinction

- First publish: status `draft → published`, creates version with trigger "publish"
- Subsequent publishes: button label changes to "Republish", increments version
- Editor header shows "Published (v3)" badge

### Tests
- ~12 backend pytest tests (CRUD, restore, auto-prune at 50, trigger types)
- ~8 frontend vitest tests (version list rendering, restore flow, auto-save counter, debounce timer)

---

## Session P: "Get the Data" CSV Download

**Goal**: Configurable per-chart toggle that adds a "Get the data" CSV download link to embeds, public page, and editor.

### Backend: CSV Endpoint

Add to `api/routers/charts_v2.py`:

```
GET /api/v2/charts/{chart_id}/data.csv
```

- Re-executes the chart's SQL query against its source
- Streams result as CSV: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="{title}.csv"`
- Respects `allowDataDownload` config flag — returns 403 if disabled
- Published charts: no auth required. Draft charts: auth required.

### Config: allowDataDownload Toggle

- Add `allowDataDownload?: boolean` to `ChartConfig` in `chart.ts` (default: `true`)
- Add toggle in editor Toolbox under sharing/embed section
- When disabled: "Get the data" link hidden in all views, endpoint returns 403

### Frontend: "Get the Data" Links

**EmbedChartPage**: Small link in footer next to source line:
```
Source: Reuters  ·  Get the data ↓
```
- Only shown when `allowDataDownload !== false` and `!flags.plain`
- Links to `/api/v2/charts/{chartId}/data.csv`

**EmbedDashboardPage**: Per-chart "Get the data" links within each chart cell.

**PublicChartPage**: Same footer link as embed page.

**ChartWrapper (editor)**: Add "CSV" button to the export row (SVG, PNG, PDF, PPTX, **CSV**).

### Tests
- ~6 backend pytest tests (CSV format correctness, 403 when disabled, Content-Disposition filename, published vs draft auth)
- ~6 frontend vitest tests (link visibility toggle, embed flag interaction, CSV button in editor)

---

## Session Dependencies & Merge Order

```
N (Data Transforms) ──┐
O (Edit History) ──────┤── all independent, merge any order
P (CSV Download) ──────┘
```

Recommended merge order: P → O → N (smallest to largest, simplest conflict resolution).

---

## Test Budget

| Session | Backend | Frontend | Total |
|---------|---------|----------|-------|
| N: Data Transforms | ~15 | ~10 | ~25 |
| O: Edit History | ~12 | ~8 | ~20 |
| P: CSV Download | ~6 | ~6 | ~12 |
| **Phase 8 Total** | ~33 | ~24 | **~57** |

Running total after Phase 8: ~762 tests (705 + 57).
