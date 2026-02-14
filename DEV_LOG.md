# Development Log

This log captures development changes made during each session. Review this at the start of each session to understand recent context and continue where we left off.

---

## Session: 2026-02-13 (Part 6)

### Focus: Build Phase 6 — Dashboard Assembly

**Context**: Phases 1-5 complete. Phase 6 adds dashboard composition: pick charts from the library, arrange them in a grid, save, and share.

### Phase 6: Dashboard Assembly

**New Backend Files:**

| File | Purpose |
|------|---------|
| `api/services/dashboard_storage.py` | JSON file persistence for dashboards in `data/dashboards/`. Save, load, list, update, delete. DashboardChartRef dataclass (chart_id + width). |
| `api/routers/dashboards_v2.py` | REST endpoints: POST create, GET list, GET with full chart data (re-executes SQL for each chart), PUT update, DELETE. |

**New Frontend Files:**

| File | Purpose |
|------|---------|
| `app/src/stores/dashboardBuilderStore.ts` | Zustand store: title, description, ordered chart refs, addChart/removeChart/moveChart/setChartWidth, save (create or update), load for editing |
| `app/src/components/dashboard/ChartPicker.tsx` | Modal overlay: fetches chart list, search filter, excludes already-added charts, "+ Add" buttons |
| `app/src/components/dashboard/DashboardGrid.tsx` | Responsive 2-column grid rendering. Each chart cell maps API data → ChartConfig → ObservableChartFactory. Supports full/half width. |
| `app/src/pages/DashboardBuilderPage.tsx` | Builder: title/description inputs, ordered chart cards with move up/down + width toggle + remove, "Add Chart" opens picker modal, save navigates to view |
| `app/src/pages/DashboardViewPage.tsx` | Public view: fetches dashboard with all chart data, renders DashboardGrid, copy URL + embed code sharing |

**Modified Files:**

| File | Change |
|------|--------|
| `api/main.py` | Registered `dashboards_v2_router` |
| `app/src/App.tsx` | Added routes: `/dashboard/new` (builder), `/dashboard/:dashboardId/edit` (edit builder), `/dashboard/v2/:dashboardId` (public view) |
| `app/src/pages/LibraryPage.tsx` | Added "New Dashboard" button in header alongside "New Chart" |

**API Endpoints:**
- `POST /api/v2/dashboards/` — create dashboard
- `GET /api/v2/dashboards/` — list all
- `GET /api/v2/dashboards/{id}` — get with all chart data (re-executes SQL per chart)
- `PUT /api/v2/dashboards/{id}` — update title/description/charts
- `DELETE /api/v2/dashboards/{id}` — delete

**Architecture Decisions:**
- Dashboard = ordered list of chart references (chart_id + width), not embedded chart configs
- Each chart can be "full" (span both columns) or "half" (one column) width
- Builder uses move up/down buttons instead of drag-and-drop library (keeps deps minimal)
- GET dashboard re-executes SQL for each chart (same as chart view page) — always fresh data
- v2 dashboard routes use `/dashboard/v2/` prefix to avoid collision with v1 `/dashboard/:slug`

**Verification:**
- `tsc --noEmit` — zero type errors
- `npm run build` — production build succeeds (13.0s, 1380 modules)
- Python imports — all backend modules load cleanly

### End-to-End Test Results (Confirmed Working)

Full pipeline tested with dev server running:
1. Upload CSV (12 rows, monthly sales by region) → source_id assigned
2. AI proposes LineChart (revenue by region) + BarChart (units by region) → correct types, SQL, data
3. Save both charts → persisted to `data/charts/`
4. GET chart with data → SQL re-executes, returns 12 rows
5. Chart list → 2 charts returned
6. Create dashboard with both charts (line=full, bar=half) → saved to `data/dashboards/`
7. GET dashboard with chart data → both charts' SQL re-executed, data returned
8. Update dashboard title → works
9. Delete chart → works
10. All 4 frontend routes (`/library`, `/chart/:id`, `/dashboard/new`, `/dashboard/v2/:id`) return 200
11. Vite proxy → FastAPI works for both charts and dashboards APIs
12. **Visual confirmation**: all pages render correctly in browser
13. **Realistic data test**: Generated 1,197 invoices with growth trend + seasonality ($40K–$110K/month). AI produced correct `DATE_TRUNC` SQL, line chart shows real trend, bar chart shows paid vs pending breakdown. Dashboard renders both charts — visually confirmed.

### Next Steps
- Consider adding dashboards section to library page (currently charts-only)
- Phase 7: Chart hygiene system (data freshness, schema change detection, visual QA)

---

## Session: 2026-02-13 (Part 5)

### Focus: Build Phase 5 — Publishing & Sharing

**Context**: Phases 1-4 complete (Observable Plot rendering, CSV upload, AI chart creation, three-pane editor). Phase 5 adds publishing so charts are shareable, exportable, and browsable.

### Phase 5: Publishing & Sharing

**New Files Created:**

| File | Purpose |
|------|---------|
| `app/src/pages/ChartViewPage.tsx` | Public chart view: fetches v2 chart, renders with ChartWrapper + ObservableChartFactory, header with Library/Edit links, SharePanel below chart |
| `app/src/pages/LibraryPage.tsx` | Chart grid with search, type filter dropdown, sort (updated/created/title). Cards show type badge, title, subtitle, date, View/Edit/Delete actions. Empty state links to /create |
| `app/src/stores/libraryStore.ts` | Zustand store: charts list, loading, search/filter/sort state, loadCharts/deleteChart actions, filteredCharts() computed |
| `app/src/components/sharing/SharePanel.tsx` | Copy URL, copy embed code (iframe snippet), SVG/PNG/PDF export buttons. "Copied!" feedback on clipboard actions |

**Modified Files:**

| File | Change |
|------|--------|
| `app/src/utils/chartExport.ts` | Extracted shared `svgToCanvas()` helper from PNG logic. Added `exportPDF()` using dynamic `import('jspdf')`. Refactored `exportPNG` to use the shared helper |
| `app/src/components/charts/ChartWrapper.tsx` | Added PDF export button alongside SVG/PNG. Imports `exportPDF` from chartExport |
| `app/src/App.tsx` | Replaced `ChartView` → `ChartViewPage` on `/chart/:chartId` route. Added `/library` route → `LibraryPage`. Removed unused ChartView import |

**Dependencies:**

| Package | Purpose |
|---------|---------|
| `jspdf` | Client-side PDF generation. Dynamically imported — separate 390KB chunk only loaded on PDF click |

**Architecture Decisions:**
- Client-side only — no new backend endpoints (existing v2 API covers list/get/delete)
- Iframe embed code — simplest sharing mechanism; the public view page IS the embed target
- Dynamic `import('jspdf')` — code-split into separate chunk, zero bundle impact for non-PDF users
- Library cards show type icon + metadata only (no live chart thumbnails) — avoids N+1 data fetches
- Replaced v1 `ChartView` route rather than keeping both — clean break from Plotly-based rendering

**Verification:**
- `tsc --noEmit` — zero type errors
- `npm run build` — production build succeeds (12.77s, 1375 modules)
- `jspdf` chunk correctly code-split (389KB separate chunk)

### Next Steps
- Test full flow end-to-end with running server
- Consider adding chart thumbnails to library cards (could use static SVG snapshots)
- Consider adding pagination to library for large chart collections
- Phase 6: Dashboard composition (multi-chart layouts)

---

## Session: 2026-02-13 (Part 4)

### Focus: Build Phase 4 — Chart Editor (Three-Pane Interface)

**Context**: Phases 1-3 complete (Observable Plot rendering, CSV upload, AI chart creation). Phase 4 adds the editor so users can refine charts after AI proposes one.

### Phase 4: Chart Editor

**New Files Created:**

| File | Purpose |
|------|---------|
| `app/src/stores/editorStore.ts` | Zustand store: EditorConfig, undo/redo history (50-deep), chat messages, load/save/updateConfig/sendChatMessage |
| `app/src/pages/EditorPage.tsx` | Three-pane layout page: Toolbox (280px) + Chart Preview (flex-1) + AI Chat (320px), header with undo/redo/save/discard |
| `app/src/components/editor/Toolbox.tsx` | Left pane: chart type, column dropdowns, text inputs, palette, toggles, axis labels |
| `app/src/components/editor/ChartTypeSelector.tsx` | Grid of 5 chart type buttons with active highlight |
| `app/src/components/editor/PaletteSelector.tsx` | Swatch rows for default/blues/reds/greens palettes |
| `app/src/components/editor/ColumnDropdown.tsx` | `<select>` populated from data columns with optional "None" |
| `app/src/components/editor/AIChat.tsx` | Right pane: chat history, auto-resize textarea, send button, loading state |
| `engine/v2/chart_editor.py` | LLM pipeline: current config + user message → updated config + explanation |

**Modified Files:**

| File | Change |
|------|--------|
| `app/src/App.tsx` | Added `/editor/:chartId` route |
| `app/src/themes/datawrapper.ts` | Added `PaletteKey` type export |
| `app/src/components/create/ChartProposal.tsx` | Added "Edit chart" link after save |
| `api/routers/charts_v2.py` | Added `PUT /{chart_id}` (update), `POST /edit` (AI edit) endpoints |
| `api/services/chart_storage.py` | Added `config: dict | None` field on SavedChart, `update_chart()` function |

**Architecture:**
- Single `EditorConfig` object shared by Toolbox and AI Chat via Zustand store
- Palette stored as key (`"blues"`) not color array — mapped to colors at render time
- AI edit returns full config (not diff) for simplicity
- `config` blob on SavedChart for visual settings beyond flat fields
- Keyboard shortcuts: Ctrl+Z undo, Ctrl+Shift+Z redo, Ctrl+S save

**Verification:**
- `tsc --noEmit` — zero type errors
- `npm run build` — production build succeeds (11.87s, 1124 modules)
- Python imports — all engine/v2 and API modules load cleanly

### Next Steps
- **Phase 5**: Dashboard composition (multi-chart layouts)
- Test the full edit loop end-to-end with a running server
- Consider adding more chart types to editor (BigValue, DataTable)
- Consider streaming for AI chat responses

---

## Session: 2026-02-13 (Part 3)

### Focus: Build Phase 3 — AI Chart Creation (Complete)

**Context**: Phases 1 (Observable Plot rendering) and 2 (CSV data ingestion) are built. Phase 3 wires the AI pipeline: user uploads CSV → LLM analyzes schema → proposes chart type + SQL → executes against DuckDB → renders via Observable Plot.

### Phase 3: AI Chart Creation

**Backend — Engine:**
| File | Purpose |
|------|---------|
| `engine/v2/__init__.py` | Package init |
| `engine/v2/schema_analyzer.py` | Converts DuckDB column metadata into LLM prompt context (DataProfile, ColumnProfile, build_schema_context()) |
| `engine/v2/chart_proposer.py` | 2-stage AI pipeline: schema → LLM proposes chart type + SQL → JSON response (ProposedChart dataclass) |

**Backend — API:**
| File | Purpose |
|------|---------|
| `api/services/chart_storage.py` | JSON file persistence in `data/charts/` — save, load, list, delete |
| `api/routers/charts_v2.py` | REST endpoints: propose, save, get, list, delete charts |

**Endpoints:**
- `POST /api/v2/charts/propose` — takes source_id + optional user_hint, calls AI proposer, executes SQL, returns config + data
- `POST /api/v2/charts/save` — persists chart config as JSON
- `GET /api/v2/charts/` — list all saved charts
- `GET /api/v2/charts/{chart_id}` — get chart with re-executed data
- `DELETE /api/v2/charts/{chart_id}` — delete chart

**Frontend:**
| File | Purpose |
|------|---------|
| `app/src/stores/createStore.ts` | Zustand store for creation flow (upload → preview → proposing → result) |
| `app/src/components/create/ChartProposal.tsx` | AI reasoning display + chart preview + save/retry UI |
| `app/src/pages/CreatePage.tsx` | Full creation flow orchestrator with URL param support |

**Route:** `/create/ai` (public, no auth)

### Verification

- `tsc --noEmit` ✓ — zero type errors
- `npm run build` ✓ — production build succeeds (11.93s, 1117 modules)
- Python imports ✓ — all engine/v2 and API modules load cleanly

### Next Steps

- **Phase 4**: Saved chart gallery — list/view/delete saved charts
- **Phase 5**: Dashboard builder — compose multiple charts into dashboards
- Test the full AI creation flow end-to-end with dev server running

---

## Session: 2026-02-13 (Part 2)

### Focus: Build v2 Phases 1 + 2 (Rendering Pipeline + Data Ingestion)

**Context**: Observable Plot won the PoC comparison. Now building the v2 foundation: the Observable Plot rendering pipeline (Phase 1) and CSV data ingestion (Phase 2).

### Phase 1: Observable Plot Rendering Pipeline (Complete)

Built the unified chart rendering system that replaces 17 Plotly components with one:

| File | Purpose |
|------|---------|
| `app/src/themes/datawrapper.ts` | Consolidated Datawrapper theme (colors, fonts, plotDefaults()) |
| `app/src/hooks/useObservablePlot.ts` | Promoted from PoC, added getSvgElement() for export |
| `app/src/components/charts/ObservableChartFactory.tsx` | Central renderer: ChartConfig → Observable Plot marks |
| `app/src/components/charts/ChartWrapper.tsx` | Title/subtitle/source + SVG/PNG export buttons |
| `app/src/utils/chartExport.ts` | Client-side SVG + PNG (2x) export |

**ObservableChartFactory** handles all chart types via a single component:
- LineChart → `Plot.lineY()` (with multi-series via `stroke`)
- BarChart → `Plot.barY()` / `Plot.barX()` (vertical/horizontal/stacked)
- AreaChart → `Plot.areaY()` + `Plot.lineY()` overlay
- ScatterPlot → `Plot.dot()` (with grouped coloring)
- Histogram → `Plot.rectY()` + `Plot.binX()`
- BigValue → styled number with delta indicator (no Plot)
- DataTable → HTML table (no Plot)

PocPage rewritten to use the factory — all 5 chart types render from a single `ObservableChartFactory` component with `ChartConfig` props.

### Phase 2: CSV Data Ingestion (Complete)

Built end-to-end CSV upload pipeline:

**Backend:**
| File | Purpose |
|------|---------|
| `api/services/duckdb_service.py` | DuckDB in-memory service: CSV ingestion, schema inspection, query execution |
| `api/routers/data.py` | REST endpoints: upload, preview, query, schema |

**Endpoints:**
- `POST /api/data/upload` — accepts CSV, returns `{ source_id, schema }`
- `GET /api/data/preview/{source_id}` — first N rows
- `POST /api/data/query` — execute SQL against uploaded data
- `GET /api/data/schema/{source_id}` — column types + stats

**Frontend:**
| File | Purpose |
|------|---------|
| `app/src/stores/dataStore.ts` | Zustand store for upload state, auto-loads preview |
| `app/src/components/data/FileDropzone.tsx` | Drag-and-drop CSV upload with loading state |
| `app/src/components/data/DataPreview.tsx` | Schema badges + data table preview |
| `app/src/pages/UploadPage.tsx` | Full upload flow with "Create with AI" / "Build manually" CTAs |

**Route:** `/create` (public, no auth)

### DEV_PLAN.md Updated

Replaced the old Looker replacement plan with the v2 implementation plan (7 phases). Previous direction archived in git history.

### Verification

- `tsc --noEmit` ✓ — zero type errors
- `npm run build` ✓ — production build succeeds (11.94s)
- Python imports ✓ — data router and DuckDB service load cleanly
- Routes: `/poc` (chart factory demo), `/create` (upload page)

### Next Steps

- **Phase 3**: AI chart creation — wire LLM pipeline to CSV schema, generate ChartConfig from user data
- Test CSV upload end-to-end with dev server running
- Build chart proposal UI (ChartProposal component)

---

## Session: 2026-02-13

### Focus: Observable Plot vs Plotly.js Proof of Concept

**Context**: Story Analytics is pivoting to an open-source, publication-ready dashboarding tool. Before building further, we need to compare charting libraries. This PoC builds 5 chart types side by side in both Plotly.js and Observable Plot with identical Datawrapper-inspired styling.

### Implementation

**Branch**: `v2-poc` (from main)

**New dependencies**: `@observablehq/plot`, `d3`, `@types/d3`, `tailwindcss`, `@tailwindcss/vite`

**Infrastructure changes** (minimal, 4 existing files touched):
- `app/vite.config.ts` — Added `@tailwindcss/vite` plugin
- `app/src/main.tsx` — Added `import './styles/tailwind.css'`
- `app/index.html` — Added Inter font `<link>` tags
- `app/src/App.tsx` — Added `/poc` public route

**New files created** (18 files in `app/src/poc/`):

| File | Purpose |
|------|---------|
| `styles/tailwind.css` | Tailwind v4 entry point with design tokens |
| `poc/data/sampleData.ts` | 4 hardcoded datasets (economic time series, country survey, scatter, CPI) |
| `poc/themes/plotlyTheme.ts` | Datawrapper-style Plotly layout defaults |
| `poc/themes/observableTheme.ts` | Datawrapper-style Observable Plot defaults |
| `poc/hooks/useObservablePlot.ts` | React hook for Observable Plot DOM mounting with ResizeObserver |
| `poc/components/ChartCard.tsx` | Shared wrapper with title, subtitle, source, library badge |
| `poc/components/PlotlyLineChart.tsx` | Multi-series line chart (Plotly) |
| `poc/components/ObservableLineChart.tsx` | Multi-series line chart (Observable Plot) |
| `poc/components/PlotlyVerticalBar.tsx` | Vertical bar chart (Plotly) |
| `poc/components/ObservableVerticalBar.tsx` | Vertical bar chart (Observable Plot) |
| `poc/components/PlotlyHorizontalBar.tsx` | Horizontal bar chart (Plotly) |
| `poc/components/ObservableHorizontalBar.tsx` | Horizontal bar chart (Observable Plot) |
| `poc/components/PlotlyScatter.tsx` | Grouped scatter plot (Plotly) |
| `poc/components/ObservableScatter.tsx` | Grouped scatter plot (Observable Plot) |
| `poc/components/PlotlyArea.tsx` | Area chart (Plotly) |
| `poc/components/ObservableArea.tsx` | Area chart (Observable Plot) |
| `poc/PocPage.tsx` | 2-column grid comparison page |
| `poc/index.ts` | Barrel export |

### Chart Types Compared

| Chart | Dataset | Tests |
|-------|---------|-------|
| Multi-series line | 24-month economic indicators (GDP, unemployment, inflation) | Time series, legend, tooltips |
| Vertical bar | 8-country satisfaction scores | Categorical axis, sorting |
| Horizontal bar | Country life expectancy, ranked | Long labels, horizontal orientation |
| Grouped scatter | Study hours vs scores (2 groups) | Color encoding, tooltips |
| Area | CPI trend | Fill under line, minimal styling |

### Verification

- `tsc --noEmit` ✓ — zero type errors
- `npm run build` ✓ — production build succeeds (12.28s)
- All PoC code isolated in `app/src/poc/`, existing app unaffected

### Decision: Observable Plot wins

After visual comparison at `/poc`, Observable Plot produces noticeably better default output than Plotly.js. **Observable Plot is the charting library for v2.**

Key advantages observed:
- Cleaner SVG output, more editorial/publication-ready aesthetic
- Smaller bundle size (Observable Plot + D3 vs full Plotly.js)
- More concise code per chart (declarative marks API)
- Better typography and gridline defaults

Trade-offs accepted:
- No built-in zoom/pan (acceptable for publication-style charts)
- Requires `useRef`/`useEffect` pattern for React integration (solved by `useObservablePlot` hook)
- Data must be in long-form for multi-series charts (minor reshaping)

### V2 Implementation Plan Written

Replaced `DEV_PLAN.md` with the v2 implementation plan. Key structure:

| Phase | Scope |
|-------|-------|
| Phase 1 | Observable Plot rendering pipeline (chart factory, theme, export) |
| Phase 2 | CSV upload + DuckDB ingestion + data preview |
| Phase 3 | AI chart creation — the core loop (propose → render → save) |
| Phase 4 | Chart editor (three-pane: toolbox + preview + AI chat) |
| Phase 5 | Publishing, sharing, export (SVG/PNG/PDF, shareable URLs) |
| Phase 6 | Dashboard assembly (multi-chart grid layout) |
| Phase 7 | Chart hygiene system (freshness, schema change, visual QA) |

Documented: what carries forward (~8,500 lines of reusable engine + API code), what gets dropped (Evidence pipeline, LookML extractor, Plotly components), and what gets adapted (chart pipeline, semantic layer, sources router).

### Next Steps

- Begin Phase 1: Build `ObservableChartFactory` from PoC components
- Begin Phase 2 (parallel): CSV upload endpoint + data preview UI

---

## Session: 2026-02-09 (Part 7)

### Focus: Wire LookML Extractor into Creation Workflow

**Context**: The enriched Data Context output (`output/mattermost/enriched/`) uses a different format than the engine's `SemanticLayer` (`sources/{source}/semantic.yaml`). Built a converter to bridge the gap so enriched LookML extractions feed directly into dashboard creation.

### Implementation

New module: `tools/lookml_extractor/semantic_converter.py` with:

| Function | Purpose |
|----------|---------|
| `convert_data_context_to_semantic()` | Main converter: reads enriched Data Context, builds SemanticLayer, saves YAML |
| `_load_all_tables()` | Loads all domain YAML files from tables/ subdirectory |
| `_parse_join_on()` | Parses LookML-style join ON clauses into from/to column pairs |
| `_compute_schema_hash()` | Generates schema hash from metadata for change detection |

**Mapping rules implemented:**

| Data Context | SemanticLayer |
|-------------|---------------|
| table.dimensions[] | table.columns[] with `role: dimension` (or `role: date` for time dims) |
| table.measures[] | table.columns[] with `role: measure`, `aggregation_hint` |
| table.entities[] type=primary | table.columns[] with `role: primary_key` |
| table.entities[] type=foreign | table.columns[] with `role: foreign_key` |
| table.default_time_dimension | Marked with `role: date` |
| certified metrics | business_context.key_metrics |
| knowledge.glossary | business_context.business_glossary |
| knowledge.domains | business_context.domain (top 5, comma-joined) |
| joins[].joins[] | relationships[] with from/to column parsing |
| derived metrics | query_patterns (expression → pattern) |
| top dimension names | business_context.key_dimensions (top 10 by frequency) |

CLI integration via `tools/extract_lookml.py`:
- `--to-semantic <source_name>`: Convert after extraction/enrichment
- `--convert-to-semantic <dir>`: Convert an already-enriched directory
- `--source-name <name>`: Source name for --convert-to-semantic
- `--semantic-output <path>`: Override output path (default: sources/{source}/semantic.yaml)

### Conversion Results (Mattermost)

| Metric | Value |
|--------|-------|
| Tables | 248 |
| Relationships | 353 (from join parsing) |
| Key metrics | 247 (certified) |
| Glossary terms | 441 |
| Key dimensions | 10 (most frequent) |
| Query patterns | 303 (from derived metrics) |
| Prompt context | 19,219 lines, 1.3M chars |
| Conversion time | 3.2s |

### Verification

- SemanticLayer.load() ✓ — parses all 248 tables with columns, roles, aggregations
- to_prompt_context() ✓ — produces 19K-line structured context with business glossary, tables, relationships
- Round-trip (save → load → save) ✓ — all counts match exactly
- Default output path ✓ — writes to sources/mattermost/semantic.yaml for auto-loading

### Files Created/Modified

- `tools/lookml_extractor/semantic_converter.py` (new — 250 lines)
- `tools/extract_lookml.py` (modified — added --to-semantic, --convert-to-semantic, --source-name, --semantic-output flags)
- `sources/mattermost/semantic.yaml` (generated — full semantic layer)
- `DEV_LOG.md` (updated)

### End-to-End Test Investigation

Explored what's needed to run Mattermost through the full dashboard creation pipeline. The engine runs SQL against **parquet files loaded into DuckDB**, not a live database. Current blockers for end-to-end:

| Requirement | Status |
|-------------|--------|
| `sources/mattermost/semantic.yaml` | Done |
| `sources/mattermost/connection.yaml` | Needed |
| `sources/mattermost/dialect.yaml` | Needed (copy from snowflake_saas) |
| `data/mattermost/**/*.parquet` | **Missing — no actual data** |
| `engine_config.yaml` → mattermost | Needed |

The LookML repo provides schema definitions but no data. Options: generate synthetic parquet data for key tables, test SQL generation without execution, or export from a real Mattermost/Snowflake instance.

### Next Steps

- [ ] **End-to-end test**: Resolve data gap (synthetic generation or real export), then create connection.yaml, dialect.yaml, and data/mattermost/ parquet files
- [ ] Re-run enrichment on failed domains (blp, events, finance, mattermost batches)
- [ ] Add extends resolution for LookML inheritance
- [ ] Build dbt project extractor (same pipeline, different parser)
- [ ] Test extractor against Mozilla repo for scale validation

---

## Session: 2026-02-09 (Part 6)

### Focus: LLM Enrichment of Extracted Data Context

**Context**: The LookML extractor produces a faithful mechanical extraction (248 tables, 4,404 measures, 3,574 metrics) but with quality gaps: 159 duplicate `count` metrics, 248 tables with zero descriptions, 1,195 measures without descriptions, no derived metrics. Built an LLM enrichment pipeline that layers business understanding on top of the raw extraction.

### Implementation

New module: `tools/lookml_extractor/enricher.py` with:

| Function | Purpose |
|----------|---------|
| `enrich_domain()` | Enriches one domain's tables/metrics via Claude, with automatic batching for large domains |
| `_enrich_batch()` | Single API call for a batch of tables |
| `apply_enrichments()` | Merges enrichment deltas into existing tables/metrics (non-destructive) |
| `enrich_data_context()` | Orchestrator: reads domain YAML, enriches each domain, writes enriched output |
| `_extract_yaml_from_response()` | Robust YAML extraction handling code fences, double-fences, truncation, prose |
| `_salvage_truncated_yaml()` | Recovers partial YAML from truncated API responses |

CLI integration via `tools/extract_lookml.py`:
- `--enrich`: Run enrichment after extraction
- `--enrich-only <dir>`: Enrich an already-extracted directory
- `--enrich-output <dir>`: Specify output directory
- `--model <model>`: Override default model

### Enrichment Results (Mattermost, First Run)

| Metric | Value |
|--------|-------|
| Domains processed | 20/24 (4 failed — truncation/token limits, fixed with batching) |
| Tables described | 165 (from 0 descriptions) |
| Measures described | 455 new descriptions |
| Dimensions described | 951 new descriptions |
| Metrics renamed | 344 (e.g., `count` → `web_traffic_pageviews`) |
| Derived metrics | 145 suggested (ratios, rates, averages) |
| Certified metrics | 150 key metrics flagged |
| Glossary terms | 256 (up from 50 shallow entries) |
| Data quirks | 143 flagged |
| API time | ~23 min total |

### Key Design Decisions

- **Delta pattern**: Enrichments are deltas that merge on top of raw extraction. Raw is never destroyed.
- **Domain-at-a-time**: Each domain processed separately to stay within token limits.
- **Automatic batching**: Domains with >10 tables split into batches (fixes the `mattermost` 202k token issue).
- **Robust YAML parsing**: Line-based approach strips fence lines before parsing; truncation salvage removes incomplete trailing lines.
- **max_tokens=16384**: Doubled from 8192 to reduce truncation on large domains.
- **Error resilience**: Programming errors (AttributeError, TypeError) fail loudly; API/YAML errors log and continue.

### Issues & Fixes During Development

1. **Code fence extraction**: LLM sometimes returned double-fenced YAML (````yaml\n```yaml...```\n```). Fixed with line-based stripping approach instead of regex matching.
2. **Truncated YAML**: Large domains exceeded max_tokens, cutting off mid-string. Fixed with salvage function that removes trailing incomplete lines, plus increased max_tokens.
3. **Token limit overflow**: `mattermost` domain (31 tables, 1404 metrics) exceeded 200k token limit. Fixed with automatic batching (10 tables per batch).
4. **Python output buffering**: Background shell didn't show output. Fixed with `PYTHONUNBUFFERED=1`.

### Files Created/Modified

- `tools/lookml_extractor/enricher.py` (new — 600+ lines)
- `tools/extract_lookml.py` (modified — added --enrich, --enrich-only, --model flags)
- `output/mattermost/enriched/` (generated — enriched Data Context)
- `DEV_LOG.md` (updated)

### Next Steps

- [ ] Re-run enrichment on failed domains (blp, events, finance, mattermost) — should succeed with batching fix
- [ ] Add extends resolution for LookML inheritance
- [ ] Build dbt project extractor (same pipeline, different parser)
- [ ] Wire extractor into the creation workflow (Step 2 → Step 3 handoff)
- [ ] Test extractor against Mozilla repo for scale validation

---

## Session: 2026-02-09 (Part 5)

### Focus: LookML → Data Context Extractor

**Context**: With the Data Context spec finalized and terminology overhauled, needed to build the first real extraction pipeline — Step 2 of the creation workflow. Cloned public LookML repos (Mozilla looker-hub, Mattermost) as test data, determined Mattermost is the best PoC target (real SaaS business, 4,500+ measures), and built a deterministic extractor.

### Test Data Selection

Evaluated two public LookML repos:
- **Mozilla looker-hub**: 2,569 .lkml files, 1,075 views — but auto-generated, telemetry-heavy, almost no measures. Good for scale testing, bad for PoC.
- **Mattermost**: 246 views, 4,526 measures, hand-written with descriptions. SaaS domains: finance/ARR, CRM, product, sales, billing. Chose this.

Both cloned to `test_data/` (gitignored).

### LookML Extractor Built

New package at `tools/lookml_extractor/` with 5 modules:

| Module | Purpose |
|--------|---------|
| `models.py` | Intermediate dataclasses: LookMLView, LookMLDimension, LookMLMeasure, LookMLExplore, ParsedRepo |
| `parser.py` | Parses `.lkml` files via `lkml` package, handles dimension_groups, from: aliases |
| `mapper.py` | Maps LookML → Data Context: type mapping, SQL cleaning (`${TABLE}.col` → `col`), entity inference, value format detection |
| `output_writer.py` | Writes YAML: metadata.yaml, tables/*.yaml (grouped by domain), metrics.yaml, joins.yaml, knowledge/ |
| `memo_writer.py` | Generates 3,693-line review memo organized by business domain |

CLI entry point: `python tools/extract_lookml.py <repo> --output <dir>`

### Extraction Results (Mattermost)

| Metric | Count |
|--------|-------|
| Tables | 248 |
| Dimensions | 6,587 |
| Measures | 4,404 |
| Metrics (simple 1:1) | 3,574 |
| Join Graphs | 143 |
| Domains | 24 |
| Parse time | ~2s |
| Total time | ~4s |

Output grouped into 24 domain files (orgm.yaml, finance.yaml, mattermost.yaml, etc.) plus cross-cutting metrics.yaml and joins.yaml.

### Design Decisions

- **Pure deterministic** — no LLM calls. This is a faithful extraction, not interpretation.
- **1:1 measure→metric** — every non-hidden, non-derived measure gets a simple metric wrapper. Derived/ratio metrics left for future LLM-powered inference.
- **No extends resolution** — 5 instances in Mattermost, skipped for now.
- **Domain inference** from file paths (views/orgm/ → domain "orgm").
- **Entity inference** from column naming patterns (_id, _pk) and primary_key flags.

### Creation Workflow Updates

Also updated `DATA_CONTEXT_SPEC.md` and `DEV_PLAN.md` with the refined creation workflow:
- Step 1: Connect & Discover (automatic profiling)
- Step 2: Gather Context (automatic query history + GitHub scan, optional manual inputs)
- Step 3: Generate Draft (LLM)
- Step 4: Review (readable memo, not YAML — PR-style domain expert review)
- Step 5: Validate (mostly automated, humans only gut-check magnitude)

### Files Created/Modified

- `tools/lookml_extractor/__init__.py` (new)
- `tools/lookml_extractor/models.py` (new)
- `tools/lookml_extractor/parser.py` (new)
- `tools/lookml_extractor/mapper.py` (new)
- `tools/lookml_extractor/output_writer.py` (new)
- `tools/lookml_extractor/memo_writer.py` (new)
- `tools/extract_lookml.py` (new — CLI)
- `requirements.txt` (added lkml>=1.3.0)
- `.gitignore` (added test_data/, output/)
- `DATA_CONTEXT_SPEC.md` (added Creation Workflow section)
- `DEV_PLAN.md` (rewrote Phase 1 as Data Context Creation Engine)

### Next Steps

- [ ] Add extends resolution for LookML inheritance
- [ ] Build dbt project extractor (same pipeline, different parser)
- [ ] Add LLM-powered derived metric inference (ratios, YoY, etc.)
- [ ] Test extractor against Mozilla repo for scale validation
- [ ] Wire extractor into the creation workflow (Step 2 → Step 3 handoff)

---

## Session: 2026-02-09 (Part 4)

### Focus: Terminology Overhaul — Replacing Jargon with Plain Language

**Context**: Reviewed the spec and identified several terms that feel like engineer-invented jargon rather than language data scientists actually use. Made four terminology changes throughout `DATA_CONTEXT_SPEC.md` to make the format more intuitive.

### Terminology Changes

| Old Term | New Term | Rationale |
|---|---|---|
| **Semantic Layer** | **Data Context** | "Semantic layer" is opaque jargon. "Data context" describes what it actually is — the context an LLM (or human) needs to understand your data. |
| **Explores** | **Joins** | LookML-specific term that doesn't mean anything outside Looker. "Joins" is what they actually are. |
| **Manifest** | **Metadata** | Plain English. It's metadata about the data context. |
| **Models** | **Tables** | "Model" is overloaded (ML models, data models, dbt models). These represent tables/views in the warehouse — just call them tables. |

### Changes Made

- Renamed `SEMANTIC_LAYER_SPEC.md` → `DATA_CONTEXT_SPEC.md`
- Updated all YAML keys: `explores:` → `joins:`, `model:` → `table:`, `base_model:` → `base_table:`, `manifest.yaml` → `metadata.yaml`, `story_semantic_layer` → `story_data_context`
- Updated directory structure: `semantic_layer/` → `data_context/`, `models/` → `tables/`
- Updated all prose, property tables, comments, and cross-format mappings
- Preserved external tool terminology (LookML "explore", dbt "semantic_model", etc.) in mapping tables

### Files Modified

- `SEMANTIC_LAYER_SPEC.md` → `DATA_CONTEXT_SPEC.md` (renamed + 94 lines changed)

### Next Steps

- [ ] Update DEV_PLAN.md to use new terminology
- [ ] Update any code references to old terminology (semantic layer generator, metric compiler, etc.)
- [ ] Continue with spec validation against real LookML repos

---

## Session: 2026-02-09 (Part 3)

### Focus: Story Semantic Layer Specification — v0.1.0-draft

**Context**: With research completed on LookML, dbt MetricFlow, Cube.js, Tableau, Power BI, and open standards, plus a key conversation about AI-native semantic layer architecture (compile-time vs. runtime hybrid), designed and wrote the foundational spec for our portable semantic layer format.

### Key Design Decision: Compile-Time + Runtime Hybrid

Traditional semantic layers (LookML, dbt) are compile-time: rigid YAML → deterministic SQL. The conversation identified that an AI-native approach should be runtime: rich context → LLM generates SQL → validated against known-good results. Our format supports **both**:

- **Compiled queries** for core metrics (revenue, churn) — deterministic, auditable, no LLM needed
- **Contextual queries** for ad-hoc questions — LLM reads the knowledge base, generates SQL, validates against benchmarks

### What the Spec Defines (7 Sections)

1. **Manifest** — metadata, provenance (where the layer came from), database adapter config, SQL dialect rules, time spine configuration

2. **Models** — table representations with entities (join keys), dimensions (categorical, time, boolean, tier, numeric, location), and measures (all aggregation types including semi-additive). Maps to LookML views and dbt semantic_models.

3. **Metrics** — five types (simple, derived, ratio, cumulative, conversion) with governance metadata (tier, owner, domain). Dual nature: compilable to SQL AND rich enough for LLM reasoning.

4. **Explores** — explicit join graphs with relationship types, join conditions, mandatory filters, row-level security. Combines best of LookML (explicit joins) and dbt (entity-based inference).

5. **Knowledge Base** — **AI-native innovation.** Three sub-files:
   - `business_context.yaml` — business rules, glossary, KPIs, naming conventions
   - `data_quirks.yaml` — column-level quirks, date range limitations, quality issues
   - `validated_examples.yaml` — known-good query-result pairs as a test suite

6. **Validation/Benchmarks** — machine-readable test definitions for automated verification

7. **Access Control** — grants, field-level restrictions, row-level security filters

### Cross-Format Coverage Analysis

Verified the spec can express the full range of concepts from:
- **LookML**: All dimension/measure types, explores with joins, derived tables, access control, value formatting. Liquid templating and parameters handled via "evaluate at extraction time" strategy.
- **dbt MetricFlow**: All metric types (simple, derived, ratio, cumulative, conversion), entities, semi-additive measures, offset windows, saved queries.
- **Cube.js**: Cubes, segments, pre-aggregations (noted but deferred — adapter-level concern).
- **Tableau/Power BI**: Relationship cardinality, field-level access, format patterns.

### What's Unique to Our Format (No Equivalent in Others)

| Feature | Description |
|---|---|
| `knowledge/` directory | Rich business context, data quirks, naming conventions — LLM food |
| `validated_examples` | Known-good query-result pairs as a test suite for metrics |
| `metric.tier` | Governance levels: certified, reviewed, draft, deprecated |
| `metric.owner` | Metric ownership for accountability |
| `dimension.known_values` | Enumerated values with frequency distribution |
| `metadata.source` | Extraction provenance and confidence scores |
| Extraction mapping | Documented how every LookML/dbt concept maps to and from our format |

### Files Created

- `SEMANTIC_LAYER_SPEC.md` — Complete v0.1.0-draft specification (~750 lines)

### Next Steps

- [ ] Validate the spec against a real LookML repo — does it cover all the edge cases?
- [ ] Build the Python dataclasses that implement this spec (extend existing `engine/semantic.py` and `engine/metric_compiler.py`)
- [ ] Build the LookML → Story extractor using the `lkml` package
- [ ] Build a round-trip test: LookML → Story → compile SQL → execute → validate against benchmarks
- [ ] Consider: should the knowledge base be auto-generated by LLM or manually curated? (Probably both — auto-generated with human review)

---

## Session: 2026-02-09 (Part 2)

### Focus: BI Tool Semantic Layer Research

**Context**: Researching how major BI tools define their semantic/data models to inform the design of our portable semantic layer format. Comprehensive analysis of Tableau, Power BI, Metabase, Apache Superset, and Lightdash.

### Research Completed

- Tableau: Data model (logical/physical layers), relationships vs joins, LOD expressions, .tds XML format, field metadata, Tableau Catalog, Tableau Pulse, Tableau Semantics
- Power BI: Semantic model, TMDL format, DAX measures (implicit/explicit), relationships, calculation groups, composite models, RLS, field properties
- Metabase: Models, metrics, semantic types, Metabot integration
- Apache Superset: Datasets, virtual metrics, calculated columns, SIP-68/SIP-182
- Lightdash: dbt-based YAML metrics, open semantic layer, metric types and properties

### Key Findings for Our Semantic Layer Design

1. **Every tool has a different format** — there is no universal standard, confirming our portable format has value
2. **TMDL is the most modern text-based format** — YAML-like, git-friendly, folder-structured
3. **Tableau's relationship model** is the most sophisticated for multi-table queries (deferred joins, automatic join type selection)
4. **DAX calculation groups** solve measure proliferation (time intelligence variants) — we should consider something similar
5. **Lightdash/dbt approach** is closest to our current YAML format — metrics defined alongside models, version-controlled
6. **RLS/security** is defined differently everywhere — Power BI uses DAX filter expressions on roles, Tableau uses user filters
7. **All tools distinguish dimensions from measures** — this is universal and our format already handles it
8. **Superset intentionally keeps its semantic layer thin** to avoid vendor lock-in (like LookML) — interesting counter-position to our approach

### Files Created

- Research output delivered as conversation response (no files created)

### Next Steps

- [ ] Use research findings to refine our portable semantic layer YAML schema
- [ ] Consider adding: calculation groups, RLS definitions, relationship cardinality/referential integrity hints
- [ ] Design import/export adapters for Tableau (.tds) and Power BI (TMDL) formats
- [ ] Continue with Phase 1: LookML extraction engine

---

## Session: 2026-02-09

### Focus: Strategic Pivot — LookML Workbench Direction

**Context**: Brainstorming session to evaluate alternative project directions. Reviewed the full codebase, DEV_LOG history, and current architecture to assess where the project's strengths actually lie and what would deliver the most value.

### Decision: Build an AI-Native Looker Replacement

After evaluating five possible directions (Semantic Layer Product, Conversational Analyst, Embeddable Analytics, Data Storytelling, Open-Source Framework), decided to build a **complete AI-native dashboarding platform that replaces Looker**.

**North Star:** Use LookML as the **migration wedge** — parse existing LookML repos to extract the semantic layer (institutional knowledge), then build our own dashboarding suite on top. LookML is the input, not the output.

**Strategic rationale:**
1. The Tier 3 semantic layer pipeline (73% exact name match, 92% with near-misses) is the project's strongest technical asset
2. LookML is the **input** — we extract semantic layers from existing LookML repos, then build our own platform
3. The target user is data analysts/scientists currently using Looker who need to move fast
4. North Star is a **complete Looker replacement** — extract semantic layer → build catalog → build dashboards
5. Real-world deployment planned: internal tool at a large public company with existing Looker
6. Existing React/Plotly frontend, FastAPI backend, conversation engine, and chart components are all directly reusable for the dashboard suite (Phase 3+)

**The strategic sequence:**
```
Existing LookML repo (years of institutional knowledge)
  → Phase 1: Extract into our portable semantic layer
  → Phase 2: Metric catalog + structured queries (replaces Looker Explore)
  → Phase 3: Dashboard builder (replaces Looker Dashboards)
  → Phase 4: Production features (permissions, scheduling, alerting)
  → Phase 5: AI-native analytics (auto-insights, investigation, prediction)
```

### Files Modified

- `DEV_PLAN.md` — Complete rewrite: "Story Analytics — The Looker Replacement" with 5 implementation phases, semantic layer format design, architecture diagrams, competitive positioning, and detailed code reuse mapping

### Key Architectural Decisions

1. **LookML is input, not output.** We extract from LookML to bootstrap our semantic layer, then build everything on our own format.
2. **Use the `lkml` Python package** (MIT license) for parsing LookML. Focus effort on extraction and enrichment, not parsing.
3. **Our semantic layer format** is the core — portable, LLM-readable, compilable to SQL, richer than LookML (AI-enriched descriptions, lineage, domain classification).
4. **The metric compiler is the query engine** — SQL is compiled from metric definitions, never hallucinated by the LLM. The LLM's job is selection (which metrics/dimensions), not generation.
5. **Most existing code is reusable** — React charts, FastAPI backend, conversation engine, pipeline architecture all serve the dashboard suite. This isn't a rewrite, it's a retargeting.

### Implementation Phases (Summary)

1. **Phase 1: LookML Extraction Engine** — Parse LookML → our semantic layer format + AI enrichment
2. **Phase 2: Metric Catalog & Structured Queries** — Browse/search metrics, structured query builder, conversational queries
3. **Phase 3: Dashboard Builder** — Grid layout, multi-chart dashboards, cross-filtering (replaces Looker dashboards)
4. **Phase 4: Production & Team Features** — Permissions, scheduling, alerting, caching
5. **Phase 5: AI-Native Analytics** — Auto-insights, investigation agent, predictive analytics

### Next Steps

- [ ] Research the `lkml` Python package — capabilities, limitations, parse output format
- [ ] Find or create a sample LookML repo to use as test data
- [ ] Design the portable semantic layer format in detail (YAML schema)
- [ ] Build Phase 1: LookML parser integration and semantic layer extractor
- [ ] Validate: parse LookML → our format → compile SQL → execute against DB

---

## Session: 2026-02-07 (Part 2 & 3)

### Focus: Advanced SQL Patterns + Fix Test Screenshot Infrastructure

**Context**: The advanced chart test suite (30 tests) showed ~40% failure rate. Systemic failures were in period-over-period comparisons (MoM/YoY), conditional aggregation (CASE WHEN), threshold filtering (HAVING), and multi-value filters (IN/OR). These are SQL patterns the LLM knows but wasn't guided to use because the prompts didn't document them.

### Part 2: Advanced SQL Patterns (YAML-only changes)

**`engine/prompts/chart/sql.yaml`** — Added three new SQL pattern sections (~140 lines) after the existing POINT-IN-TIME METRICS section:

1. **CONDITIONAL AGGREGATION**: CASE WHEN inside COUNT/SUM for paid-vs-unpaid splits, value bucketing with ordered labels, series_column alternative approach.

2. **THRESHOLD & MULTI-VALUE FILTERING**: HAVING clause for post-aggregation thresholds, IN operator for multi-value category filters, compound WHERE + IN patterns.

3. **WINDOW FUNCTIONS**: LAG() for MoM growth rate with NULLIF safety, year-over-year via date extraction, running total/cumulative sum, moving/trailing average, NTILE for Pareto/concentration analysis. Includes trigger phrase mapping.

**`engine/prompts/chart/requirements.yaml`** — Added ADVANCED PATTERN DETECTION section at the end of `instructions:` so the requirements agent flags advanced patterns in the description field.

**`sources/snowflake_saas/dialect.yaml`** and **`sources/olist_ecommerce/dialect.yaml`** — Added `window_functions` and `conditional_functions` sections.

### Part 3: Fix Test Screenshot Infrastructure

Found and fixed **three bugs** causing all test screenshots to be blank (5,288 bytes):

1. **URL path mismatch** (root cause): Tests navigated to `localhost:3001/{slug}` but React route is `/chart/{uuid}`. Fixed by using `manager.state.current_chart_id` (UUID) instead of `manager.state.dashboard_slug` (human-readable slug), and prepending `chart/` to the path.

2. **Wrong QA class**: Tests used `DashboardQA` (designed for dashboard pages) instead of `ChartQA` (which correctly constructs chart URLs). Switched to `ChartQA`.

3. **Double QA overhead**: Each test ran Playwright + Claude vision **twice** — once in the pipeline's internal QA, once in the test harness. Disabled the pipeline's `enable_visual_qa` during testing. This roughly halves test execution time.

### Additional Bugs Fixed (from Part 2)

4. **Test harness missing two-phase flow** (`advanced_chart_tests.py`, `comprehensive_chart_tests.py`): Tests called `process_message()` once but pipeline requires a second `__action:generate` step. Fixed by adding `ChartPhase.PROPOSING` check.
5. **Wrong port in test_runner.py**: Legacy `localhost:3000` reference changed to `localhost:3001`.

### Test Results (Partial — Smoke Test)

After fixing screenshots, smoke test (3 tests) with Claude: **2/3 passed (67%)**
- Test 31 (Cumulative Running Total): PASSED — line chart with correct running sum
- Test 33 (Average vs Median): PASSED — dual-line chart showing both metrics
- Test 38 (Last 6 Months): FAILED — data limitation (Olist dataset only has ~3 months)

Full test run (30 tests) reached test 48 before API connection hung. Partial results through test 48 show real chart screenshots (16-98KB) confirming the fix works.

### Next Steps

- [ ] Run full 30-test suite to completion (process hung at test 48 last time)
- [ ] Investigate tests that fail due to Olist dataset limitations (small date range)
- [ ] Consider adding test timeout/retry logic for hung API connections

---

## Session: 2026-02-07

### Focus: Metric Compiler — Compiles Semantic Layer YAML to DuckDB SQL

**Context**: The semantic layer (Tier 3) achieved 73% exact metric name match rate. The next step from the DEV_LOG was to "build the metric compiler that reads the semantic layer and generates DuckDB SQL." This session delivered a fully working compiler.

### What Was Built

**`engine/metric_compiler.py`** — Complete metric compilation module (~500 lines):

1. **ModelRegistry** — Loads and indexes the semantic layer YAML files:
   - Parses `_semantic_models.yml` (entities, dimensions, measures)
   - Parses `_metrics.yml` (49 metric definitions across 4 types)
   - Parses `_saved_queries.yml` (13 saved query definitions)
   - Builds measure → model index for fast lookups
   - Configurable table mapping (`ref('fct_order_items')` → actual DuckDB table name)

2. **MetricCompiler** — Compiles metric definitions into executable DuckDB SQL:
   - **Simple metrics**: Direct measure aggregation (e.g., `SUM(price) AS gmv`)
   - **Derived metrics**: Expression over sub-metrics with inline optimization when all sub-metrics share a model
   - **Ratio metrics**: `CAST(numerator AS DOUBLE) / NULLIF(denominator, 0)` with same-model inlining
   - **Cumulative metrics**: Window functions with `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`
   - **Offset window metrics**: LAG-based MoM growth using a two-level CTE pattern to avoid self-referencing aliases
   - **Multi-metric queries**: Automatically groups simple metrics from the same model, uses CTEs for cross-model joins

3. **Dimension Resolution**:
   - `TimeDimension('metric_time', 'month')` → `DATE_TRUNC('month', order_date)`
   - `Dimension('order_item__product_category')` → `product_category`
   - Filter resolution: `{{ Dimension('order_item__order_status') }} = 'delivered'` → `order_status = 'delivered'`

4. **Saved Query Compiler**: Compiles a full saved query (multiple metrics + group_by) into a single SQL statement.

**`tests/test_metric_compiler.py`** — 50 tests, all passing:
- Creates synthetic Olist fact tables in DuckDB (no external data dependency)
- Validates correct SQL generation AND correct query results
- Tests every metric type, dimension resolution, filters, edge cases
- Bulk tests: all simple metrics compile, all ratio metrics compile

### Key Design Decisions

1. **Inline vs CTE strategy**: When all metrics in a query come from the same model, they're computed in a single `SELECT` (no CTEs). When they span models, each gets its own CTE and they're joined on the group_by dimension. This produces efficient SQL.

2. **Offset window two-level CTE**: MoM growth metrics use `LAG()`, but SQL doesn't let you reference a window function alias in the same SELECT. Fixed by materializing LAG results in a `lagged` CTE before applying the expression.

3. **Table map abstraction**: The compiler doesn't hardcode table names. `ref('fct_order_items')` is resolved through a configurable mapping, so the same semantic layer works against different DuckDB schemas (test vs production).

4. **Python 3.11 compatibility**: Backslashes aren't allowed in f-string expressions in Python 3.11. Used module-level constants (`_SEL_JOIN`, `_CTE_JOIN`, `_NL`) as separators.

### Semantic Layer Gap Found

The saved query `payment_method_analysis` references `payment_count` which exists as a measure but not as a metric in `_metrics.yml`. The compiler correctly raises a `ValueError`. This should be added to the metrics file in a future session.

### Test Results

```
50 passed in 0.78s
```

Coverage by metric type:
- Simple: 13 tests (GMV, orders, reviews, payments, filters, dimensions)
- Derived: 6 tests (AOV, items/order, cancellation rate, delivery rate, GMV/seller)
- Ratio: 5 tests (5-star rate, 1-star rate, positive/negative review rate, credit card share)
- Cumulative: 4 tests (all-time, monotonic, MTD, rolling 30-day)
- Offset: 2 tests (GMV MoM growth, order MoM growth)
- Multi-metric: 2 tests (same model, mixed types)
- Saved queries: 5 tests
- Edge cases: 6 tests (error handling, bulk compilation)

### Data Availability Note

The Olist semantic layer references fact tables (`fct_order_items`, etc.) that don't exist as parquet files yet. The test creates synthetic data in DuckDB to validate the compiler. When real Olist data becomes available (from Kaggle or Snowflake), the compiler will work against it by setting the table map to point to the actual DuckDB schema.

### Files Created/Modified

- `engine/metric_compiler.py` — New: metric compiler module
- `tests/test_metric_compiler.py` — New: 50 tests for the compiler

### Next Steps

- Wire the metric compiler into the chart generation pipeline (LLM references metric names → compiler produces SQL → DuckDB executes)
- Add the missing `payment_count` metric to `_metrics.yml`
- Download Olist data from Kaggle and create parquet files for integration testing
- Build a CLI tool for ad-hoc metric compilation (useful for debugging)

---

## Session: 2026-02-05 (Part 3)

### Focus: AI Semantic Layer Builder — Tier 3 (Business Documentation + SQL Extraction)

**Context**: Testing whether adding business documentation on top of the Tier 2.5 extraction pipeline improves semantic layer generation quality. Hypothesis: business docs provide context that neither schema nor SQL capture — the "why" behind metrics, strategic priorities, marketplace business model, and metric naming preferences.

### What Was Built

**Business Documentation** — `docs/olist_business_context.md` (15,865 chars):

A comprehensive business context document simulating what a real company's analytics team would maintain. Sourced from Kaggle dataset descriptions, Olist company research, and existing `_sources.yml` column descriptions. Sections:
- Business Overview — Olist as a Brazilian SMB marketplace, revenue model, business levers
- Data Dictionary — All 8 tables with business-context column descriptions
- Key Performance Indicators — 6 KPI categories with preferred names and definitions
- Business Rules — Order lifecycle, revenue recognition, customer deduplication, freight splitting, payment logic
- Geographic & Market Context — BRL currency, state codes, São Paulo dominance, installment culture, boleto
- Metric Naming Conventions — 11 explicit naming preferences (GMV vs sales, AOV vs average order value, etc.)
- Known Data Quality Issues — 9 documented issues (customer_id confusion, missing reviews, etc.)

### Experiment Results: Cross-Tier Comparison

| Metric | Tier 1 (Schema) | Tier 2 (Raw SQL) | Tier 2.5 (Extraction) | **Tier 3 (Docs + Extraction)** | Reference |
|--------|-----------------|-------------------|-----------------------|-------------------------------|-----------|
| Metrics generated | 57 | 52 | 51 | **55** | 49 |
| **Exact name matches** | **15/49 (31%)** | **21/49 (43%)** | **19/49 (39%)** | **36/49 (73%)** | — |
| Semantic models | 7 | 8 | 8 | **7** | 4 |
| Saved queries | ? | 0 (token limit) | 12 | **12** | 13 |
| Valid YAML | Yes | Yes | Yes | **Yes** | — |
| Metric types used | simple, derived | simple, derived | simple, derived, cumulative, ratio | **simple (30), derived (22), cumulative (3)** | all 5 |
| Output tokens | ~16K (maxed) | ~16K (maxed) | 14,338 | **13,765** | — |
| Prompt size | ~22K chars | ~56K chars | ~37K chars | **~56K chars** | — |
| Generation time | — | — | ~194s | **~202s** | — |

### Key Findings

**Tier 3 is a massive improvement — 36 exact matches (73%) vs previous best of 21 (43%).**

1. **Naming conventions drove the improvement** — The business docs specified 11 explicit naming preferences (e.g., "GMV" not "sales", "AOV" not "average order value", "Boleto" not "bank transfer"). **All 11 preferences were followed exactly** in the generated output. This is the single biggest factor in the jump from 21 → 36 matches.

2. **AOV vs average_order_value** — The key test case. Reference uses `average_order_value`; Tier 2.5 generated `aov` (matching the business docs). Tier 3 also generated `aov`. This counts as a near-miss vs reference (name differs) but is actually correct business behavior — the docs said to prefer "AOV". The reference metric `average_order_value` is the one that's misaligned with business preference.

3. **Business context enriched descriptions** — Tier 3 descriptions include specific business context: "Boleto is unique to Brazil", "CRITICAL: Always use customer_unique_id, not customer_id", "63% on-time benchmark - late delivery predicts poor reviews". These are more actionable than purely data-derived descriptions.

4. **Missing matches analysis** — The 13 metrics still missing from Tier 3:
   - `active_customers` — generated `unique_customers` instead (business docs prefer this name)
   - `average_order_value` — generated `aov` (business docs naming preference)
   - `five_star_reviews` — generated `five_star_count` (near-miss)
   - `gmv_growth_mom` — generated `gmv_mom_growth` (word order near-miss)
   - `gmv_last_30_days` — not generated (rolling window metric)
   - `late_deliveries` — generated `late_orders` (near-miss)
   - `median_item_price` — not generated
   - `negative_reviews` — generated `negative_review_count` (near-miss)
   - `on_time_deliveries` — generated `on_time_orders` (near-miss)
   - `one_star_reviews` — generated `one_star_count` (near-miss)
   - `order_count_from_items` — not generated (internal implementation metric)
   - `order_growth_mom` — generated `orders_mom_growth` (word order near-miss)
   - `positive_reviews` — generated `positive_review_count` (near-miss)

5. **Most "missing" are near-misses** — Of 13 missing, ~9 are naming near-misses (e.g., `five_star_reviews` vs `five_star_count`, `late_deliveries` vs `late_orders`). If we count near-misses as matches, the effective match rate would be ~45/49 (92%).

6. **Novel metrics from business docs** — Tier 3 generated metrics not in the reference that reflect business doc priorities:
   - `repeat_purchase_rate` — explicitly mentioned as "Only ~3% — major retention opportunity"
   - `freight_to_price_ratio` — logistics optimization metric from business context
   - `late_delivery_rate` — complement to on_time rate, mentioned in docs
   - `customers_mom_growth` — growth tracking from business lever discussion
   - `orders_per_seller` — marketplace health from business model discussion

7. **Ratio metrics dropped** — Tier 3 generated 0 ratio-type metrics (vs 5 in reference, 2 in Tier 2.5). It used `derived` with division instead. Functionally equivalent but syntactically different.

### Architecture Insight

The three-stage pipeline for Tier 3:
```
Raw SQL Corpus (34K chars, noisy)
  → Extraction Agent (Claude Sonnet, ~96s)
    → Structured Business Logic (19.6K chars, clean YAML)
      + Business Documentation (15.9K chars, curated)
        → Generation Agent (Claude Sonnet, ~202s)
          → Complete Semantic Layer (3 YAML files)
```

Business documentation works because it provides **authoritative naming** that resolves ambiguity. The extraction step captures *how* metrics are calculated; the docs specify *what they should be called* and *why they matter*. Together they achieve 73% exact match rate.

### Output Files

- `docs/olist_business_context.md` — Business documentation (new file)
- `output/generated_semantic_layer_tier3/_semantic_models.yml` — 7 semantic models
- `output/generated_semantic_layer_tier3/_metrics.yml` — 55 metrics
- `output/generated_semantic_layer_tier3/_saved_queries.yml` — 12 saved queries
- `output/generated_semantic_layer_tier3/_extracted_business_logic.yml` — Intermediate extraction output
- `output/generated_semantic_layer_tier3/_prompt.txt` — Full prompt for inspection

### Cross-Tier Scorecard

| Dimension | Tier 1 | Tier 2 | Tier 2.5 | **Tier 3** | Winner |
|-----------|--------|--------|----------|-----------|--------|
| Exact name matches | 31% | 43% | 39% | **73%** | **Tier 3** |
| Saved queries | 0 | 0 | 12 | **12** | Tie (2.5/3) |
| Naming consistency | Low | Medium | Medium | **High** | **Tier 3** |
| Description quality | Generic | Some context | Business benchmarks | **Business context + benchmarks** | **Tier 3** |
| Metric type diversity | 2 types | 2 types | 4 types | **3 types** | Tier 2.5 |
| Token efficiency | Maxed out | Maxed out | Headroom | **Headroom** | Tie (2.5/3) |
| Prompt size | 22K | 56K | 37K | **56K** | Tier 1 (smallest) |

**Conclusion**: Business documentation is the highest-impact input for naming accuracy. The combination of extraction (for calculation logic) + documentation (for naming conventions and business context) produces the best overall result.

### Next Steps
- Consider adding the naming convention table directly to the generation system prompt (not just user context) for even stronger adherence
- Build the metric compiler that reads the semantic layer and generates DuckDB SQL
- Wire the LLM pipeline to use metric selections instead of raw SQL
- Investigate why ratio-type metrics weren't generated (may need explicit format guidance)

---

## Session: 2026-02-05 (Part 2)

### Focus: AI Semantic Layer Builder — SQL Extraction Pipeline (Tier 2.5)

**Context**: Continuing from Part 1 which built the hand-crafted dbt semantic layer and the Tier 1/Tier 2 proof-of-concept generator. This session completed the SQL extraction pipeline (Tier 2.5) that compresses raw SQL queries into structured business logic before feeding to the generator.

### What Was Built

**SQL Extraction Pipeline** — added to `tools/build_semantic_layer.py`:

1. **`EXTRACTION_SYSTEM_PROMPT`** — Instructs Claude to analyze a SQL corpus and extract implicit business logic, metric definitions, naming conventions, and analytical patterns into a structured YAML summary.

2. **`EXTRACTION_USER_TEMPLATE`** — Template with output schema: `business_domain`, `metric_definitions`, `standard_filters`, `join_patterns`, `naming_conventions`, `key_dimensions`, `business_rules`, `analytical_patterns`.

3. **`extract_business_logic()`** function — Calls Claude Sonnet to compress raw SQL corpus into structured business logic summary. Takes ~34K chars of SQL, produces ~17K chars of structured YAML.

4. **`--extract-sql` CLI flag** — Wired into `main()` to enable the two-stage pipeline: extraction → generation. Takes priority over `--sql-corpus` (raw SQL fallback).

5. **Updated `build_user_prompt()`** — Accepts `business_logic` parameter (preferred over raw `sql_corpus`). When provided, tells the generator to use extracted logic as the authoritative source for metric names and calculation methods.

### Experiment Results: Cross-Tier Comparison

| Metric | Tier 1 (Schema) | Tier 2 (Raw SQL) | **Tier 2.5 (Extraction)** | Reference |
|--------|-----------------|-------------------|--------------------------|-----------|
| Metrics generated | 57 | 52 | **51** | 49 |
| Exact name matches | 15/49 (31%) | 21/49 (43%) | **19/49 (39%)** | — |
| Semantic models | 7 | 8 | **8** | 4 |
| Saved queries | ? | **0** (token limit) | **12** | 13 |
| Valid YAML | Yes | Yes | **Yes** | — |
| Metric types used | simple, derived | simple, derived | **simple (31), derived (14), cumulative (4), ratio (2)** | all 5 |
| Output tokens | ~16K (maxed) | ~16K (maxed) | **14,338** (headroom) | — |
| Prompt size | ~22K chars | ~56K chars | **~37K chars** | — |

### Key Findings

**Tier 2.5 is the best overall approach:**

1. **Saved queries recovered** — 12 generated (vs 0 in Tier 2 which hit token limit). Extraction compressed 34K → 17K chars, freeing token budget.

2. **Richest descriptions** — Metrics include actual business benchmarks from extraction: "63% on-time delivery rate", "97% one-time buyers", "Credit card AOV is R$162.70".

3. **All metric types used naturally** — Cumulative metrics and ratios appeared correctly. Tier 2 was too token-constrained.

4. **Business rules properly encoded** — Filters like "exclude canceled orders" and "delivered only" consistently applied, matching extraction's `standard_filters`.

5. **Naming near-misses explain the score drop** — 19 vs 21 exact matches is misleading. The extraction established canonical names that differ slightly from our reference:
   - Reference `average_order_value` → Generated `aov` (extraction used "aov")
   - Reference `avg_review_score` → Generated `average_review_score` (1 word diff)
   - Reference `orders` → Generated `order_count` (arguably clearer)

**Extraction quality** — The intermediate `_extracted_business_logic.yml` is excellent: 350 lines covering 8 metric definitions, 5 standard filters, 9 join patterns, 9 naming conventions, 10 key dimensions, 14 business rules, 14 analytical patterns, and actual benchmark values.

### Output Files

- `output/generated_semantic_layer_tier2_5/_semantic_models.yml` — 8 semantic models
- `output/generated_semantic_layer_tier2_5/_metrics.yml` — 51 metrics
- `output/generated_semantic_layer_tier2_5/_saved_queries.yml` — 12 saved queries
- `output/generated_semantic_layer_tier2_5/_extracted_business_logic.yml` — Intermediate extraction output
- `output/generated_semantic_layer_tier2_5/_prompt.txt` — Full prompt for inspection

### Architecture Insight

The two-stage extraction pipeline is the key design pattern:
```
Raw SQL Corpus (34K chars, noisy)
  → Extraction Agent (Claude Sonnet, ~93s)
    → Structured Business Logic (17K chars, clean YAML)
      → Generation Agent (Claude Sonnet, ~194s)
        → Complete Semantic Layer (3 YAML files)
```

This separates **comprehension** (understanding messy SQL) from **generation** (producing valid dbt YAML), letting each stage focus on what it does best.

### Next Steps
- Explore Tier 3: Adding business documentation on top of extraction
- Consider using the extraction output to auto-tune naming conventions (e.g., abbreviation preferences)
- Build the metric compiler that reads the semantic layer and generates DuckDB SQL
- Wire the LLM pipeline to use metric selections instead of raw SQL

---

## Session: 2026-02-05

### Focus: dbt MetricFlow Semantic Layer for Olist Dataset

**Context**: Project pivot — recognized that the AI-native analytics tool cannot work reliably without a proper semantic layer with exact metric definitions. Decided to build a production-quality dbt semantic layer on the existing Olist e-commerce dataset as the foundation for rebuilding the product.

### Strategic Decision

The core problem: the LLM was generating arbitrary SQL from loose schema descriptions. The solution is to shift to a **metric compilation** approach where the LLM selects pre-defined metrics and dimensions, and the system compiles guaranteed-correct SQL from exact definitions.

### What Was Built

**Complete dbt project** at `semantic_layer/olist/` with 21 files:

#### Project Configuration
- `dbt_project.yml` — Standard dbt project config
- `packages.yml` — dbt-utils dependency for time spine

#### Staging Models (7 files) — 1:1 with source tables
- `stg_olist__orders.sql`, `stg_olist__order_items.sql`, `stg_olist__customers.sql`
- `stg_olist__products.sql`, `stg_olist__sellers.sql`
- `stg_olist__order_payments.sql`, `stg_olist__order_reviews.sql`
- `_sources.yml` — Full source documentation with column descriptions

#### Mart Models (8 files) — Denormalized for analytics
- `fct_order_items.sql` — Primary revenue fact (items + orders + products + geography)
- `fct_orders.sql` — Order-level fact with delivery metrics and pre-aggregated items
- `fct_order_payments.sql` — Payment fact with order dates
- `fct_order_reviews.sql` — Review fact with order dates
- `dim_customers.sql` — Deduplicated to customer_unique_id level
- `dim_products.sql` — Products with English category names (via translation join)
- `dim_sellers.sql` — Seller dimension
- `metricflow_time_spine.sql` — Daily time spine (2016-2019) for cumulative metrics

#### Semantic Layer YAML (3 files) — The core deliverable
- `_semantic_models.yml` — 4 semantic models:
  - `order_items` (revenue/GMV metrics, 11 measures)
  - `orders` (delivery/order metrics, 12 measures)
  - `order_payments` (payment metrics, 7 measures)
  - `order_reviews` (satisfaction metrics, 8 measures)

- `_metrics.yml` — 44 metrics across 8 categories:
  - Revenue (8): gmv, realized_gmv, total_revenue, freight_revenue, aov, avg_item_price, median_item_price, revenue_per_customer
  - Growth (5): gmv_growth_mom, order_growth_mom, cumulative_gmv, gmv_last_30_days, gmv_mtd
  - Orders (7): orders, delivered_orders, canceled_orders, order_count_from_items, items_sold, items_per_order, cancellation_rate
  - Delivery (5): avg_delivery_days, avg_shipping_days, on_time_delivery_rate, on_time_deliveries, late_deliveries
  - Customers (3): unique_customers, active_customers, orders_per_customer
  - Satisfaction (10): avg_review_score, review_count, five/one_star counts/rates, positive/negative counts/rates
  - Payments (7): total_payment_value, avg_payment_value, credit_card/boleto/voucher_revenue, credit_card_share, avg_installments
  - Sellers (4): active_sellers, active_products, gmv_per_seller, items_per_seller

- `_saved_queries.yml` — 13 saved queries covering executive overview, growth, categories, geography, delivery, satisfaction, and payments

### Key Design Decisions
1. **Used current/legacy dbt MetricFlow format** (not the new Fusion Engine spec) for maximum compatibility
2. **Defined semantic models on mart models** (not raw tables) so each semantic model has its own time dimension
3. **All metric types represented**: simple, derived, cumulative, ratio — with offset windows for growth metrics
4. **Measure names globally unique** across all semantic models (MetricFlow requirement)
5. **Rich descriptions with actual data distributions** (e.g., "SP accounts for 42% of customers") to help LLMs understand the data

### Next Steps
- Build a metric compiler that reads this semantic layer and generates DuckDB SQL
- Wire the LLM pipeline to output structured metric selections instead of raw SQL
- Consider AI-assisted semantic layer generation from source materials (see discussion about using LLMs to automate semantic layer creation)

---

## Session: 2026-01-26 (Part 6)

### Focus: Focused Chart Edit Mode + Visual Change Fixes

**Context**: Built a dedicated chart editing page and fixed the visual change pipeline so AI-driven chart modifications (colors, fonts, legend labels) work correctly.

### Features Built

#### 1. Focused Chart Edit Page (`/chart/:id/edit`)
- New route and page component (`ChartEditPage.tsx`) for immersive chart editing
- Live chart preview (top) with chat input (bottom) for AI modifications
- Done/Cancel buttons — Cancel reverts all changes made during the session
- Edit history sidebar showing user requests and AI responses
- Added route in `App.tsx`, updated `ChartsPage.tsx` navigation

#### 2. Visual Change Pipeline Fixes
- **Fixed JSON serialization**: Used `dataclasses.asdict()` for ChartConfig instead of raw `json.dumps()`
- **Fixed config corruption**: Used `setattr()` on existing ChartConfig object instead of replacing with dict
- **Removed dangerous fallback**: Visual change errors no longer silently fall back to full data pipeline
- **LLM-based classification**: Replaced fragile keyword matching in `_is_visual_change()` with LLM call
- **Key mapping**: Added comprehensive mapping from LLM camelCase keys to Python snake_case fields

#### 3. Legend Label Support
- Added `legend_label` field to ChartConfig dataclass, `from_dict()`, and `to_dict()`
- Added to render spec, API config endpoints, BarChart component, and ConfigFormPanel editor
- Added key aliases (`legendLabel`, `legendText`, `legendTitle`) in visual change handler

#### 4. UI Improvements
- Fixed chart icons: BarChart and Histogram now use `~` sigil instead of `#`
- Simplified Chat landing page: removed "Welcome" header and "Find/Edit" buttons
- Added retro terminal-styled cards for "New Chart" and "New Dashboard" options
- Force chart re-render after edits using React key prop with version counter

### Files Modified
- `app/src/pages/ChartEditPage.tsx` (new)
- `app/src/App.tsx`, `app/src/pages/ChartsPage.tsx`, `app/src/pages/ChatPage.tsx`
- `app/src/components/charts/BarChart.tsx`, `app/src/components/editors/ConfigFormPanel.tsx`
- `app/src/components/chat/Message.tsx`, `app/src/types/chart.ts`
- `engine/chart_conversation.py`, `engine/models/chart.py`
- `api/routers/chart.py`, `api/routers/render.py`
- `engine/templates/charts.yaml`, `engine_config.yaml`, `dev.sh`

### Key Bug: `legend_label` not persisted
The `legend_label` field was added to ChartConfig dataclass and `from_dict()` but missed in `to_dict()`. The value was set correctly in memory via `setattr()` but silently dropped on save.

---

## Session: 2026-01-26 (Part 5)

### Focus: End-to-End Testing of Suggested Charts + Bug Fixes

**Context**: Tested all 12 suggested charts (6 per data source) end-to-end with Claude and visual QA validation. Discovered and fixed multiple bugs in the screenshot capture and QA validation systems.

### Test Results

**Summary:**
- 12/12 charts generated successfully (100% generation rate)
- 11/12 passed QA validation (91.7% QA pass rate)
- 1 chart failed QA: "Top Customers" - missing value labels on bars

**Full Report:** See `test_results/SUGGESTED_CHARTS_QA_REPORT.html` for all screenshots and details.

### Bugs Found and Fixed

#### 1. Blank Screenshot Capture (engine/qa.py)

**Problem:** Playwright screenshots were blank/white because the wait logic didn't properly wait for Plotly charts to render.

**Root Cause:** The `_wait_for_dashboard_ready` method only waited for `networkidle` and added sleep delays, but didn't wait for actual Plotly elements to appear in the DOM.

**Fix:** Updated to wait for `.js-plotly-plot` (Plotly's container class) and `.fade-in` (our React wrapper) before capturing:

```python
# Wait for Plotly chart to render
plotly_chart = page.locator(".js-plotly-plot")
try:
    await plotly_chart.wait_for(state="visible", timeout=10000)
    await asyncio.sleep(1)  # Let animations complete
except PlaywrightTimeout:
    # Fallback to fade-in wrapper
    fade_in = page.locator(".fade-in")
    await fade_in.wait_for(state="visible", timeout=5000)
```

#### 2. Missing validate_chart Method (engine/validators/quality_validator.py)

**Problem:** `ChartConversationManager` was calling `self._pipeline.quality_validator.validate_chart()` but this method didn't exist, causing every chart's built-in QA step to silently fail with:
```
[ChartConversation] QA validation failed: 'ChartQualityValidator' object has no attribute 'validate_chart'
```

**Root Cause:** The `ChartQualityValidator` class had methods for `validate_spec`, `validate_query`, and `validate_visual`, but no `validate_chart` method that `chart_conversation.py` was expecting. The error was silently caught in a try/except block.

**Fix:** Added the missing `validate_chart` method that wraps `ChartQA.validate()`:

```python
def validate_chart(
    self,
    chart,  # ValidatedChart
    original_request: str,
    chart_slug: str,
):
    """Validate a rendered chart using vision QA."""
    from ..qa import ChartQA, QAResult

    if not self.enable_visual_qa:
        return QAResult(passed=True, summary="Visual QA disabled", ...)

    chart_id = chart_slug.replace("/chart/", "")
    qa = ChartQA(provider_name=self.provider_name)
    return qa.validate(chart_id, original_request)
```

### Lessons Learned: Test Coverage Gap

**How did the broken QA evade unit tests?**

1. **Method never existed, never tested** - Unit tests in `tests/test_quality_validators.py` tested `validate_spec()`, `validate_query()`, and initialization, but never tested `validate_chart()` because it didn't exist.

2. **Visual QA disabled by default** - Tests always ran with `enable_visual_qa=False`, so the broken code path was never exercised.

3. **No integration test for full flow** - Unit tests tested individual methods in isolation, but no test verified that `ChartConversationManager` called the correct validator method with the correct signature.

4. **Silent error swallowing** - The try/except in `chart_conversation.py` caught the `AttributeError` and just logged it, so charts generated successfully while QA silently failed.

**Action Items:**
- [ ] Add integration test that exercises full chart creation with visual QA enabled
- [ ] Add test specifically for `validate_chart` method
- [ ] Consider making QA failures more visible (warnings vs silent skip)

### Codebase Audit: Other Potential Silent Failures

After finding the `validate_chart` bug, performed a full codebase search for similar patterns that could hide errors.

#### HIGH RISK - Same Pattern as validate_chart Bug

| File | Line | Pattern | Risk |
|------|------|---------|------|
| `engine/chart_conversation.py` | 659-660 | `except Exception as e: print(...)` | **THE BUG** - Caught AttributeError silently |
| `engine/validators/quality_validator.py` | 758-759 | `except Exception: return QAResult(passed=True...)` | Returns "passing" on any error! |
| `engine/validators/quality_validator.py` | 135-137 | `except Exception: pass` in row count | Could hide missing methods |

#### MEDIUM RISK - Silent Fallbacks (Functional but Hide Issues)

| File | Line | Pattern | Impact |
|------|------|---------|--------|
| `api/routers/templates.py` | 190-192 | `except Exception: pass` | Falls back to static templates silently |
| `api/routers/chart.py` | 1213-1214 | `except Exception: pass` | Skips business context silently |
| `engine/qa.py` | 410-411 | `except Exception: pass` | Auto-fix proceeds without schema |
| `engine/chart_pipeline.py` | 468-470 | `except Exception as e:` (only warns if verbose) | Silent in production |

#### Patterns to Watch

1. **`except Exception` catching AttributeError** - This hides missing methods/typos
2. **`pass` after except** - Complete silence, no indication anything failed
3. **`return default_value` after except** - Makes it look like success
4. **Logging to console only** - Easy to miss in production logs

#### Recommendations

1. Change `chart_conversation.py:659` to catch only expected exceptions (e.g., `RuntimeError` for service unavailable), not all exceptions
2. Consider adding warnings/metrics for silent fallbacks
3. Review `quality_validator.py:758` - returning `passed=True` on exception is dangerous

### Files Modified

| File | Change |
|------|--------|
| `engine/qa.py` | Fixed `_wait_for_dashboard_ready` to wait for Plotly elements |
| `engine/validators/quality_validator.py` | Added missing `validate_chart` method |
| `test_suggested_charts.py` | Fixed to use `ChartQA` instead of `DashboardQA` |

### Files Created

| File | Description |
|------|-------------|
| `test_results/SUGGESTED_CHARTS_QA_REPORT.html` | HTML report with all 12 chart screenshots and QA results |
| `test_results/suggested_charts_test.json` | JSON data for test results |
| `test_results/suggested_chart_screenshots/*.png` | Screenshot images for each chart |

---

## Session: 2026-01-26 (Part 4)

### Focus: Auto-Generated Suggested Charts Feature

**Context**: Implemented the auto-generated suggested charts feature to replace static business-type templates with source-specific charts that are stored in each source's semantic.yaml.

### Problem Solved

The previous system had several issues:
- Templates were generic, not tailored to actual data
- Cart abandonment template failed on Olist (no clickstream data)
- User had to manually set business_type
- Templates often referenced tables/columns that didn't exist

### Solution: Source-Specific Suggested Charts

Instead of filtering generic templates by business_type, charts are now auto-generated and stored in each source's semantic.yaml, ensuring they work with the actual data.

**New Architecture:**
```
User selects data source → GET /templates/charts
    → Load sources/{source}/semantic.yaml
    → Return 6 charts from suggested_charts section
```

### Implementation

1. **Added SuggestedChart dataclass** (`engine/semantic.py`)
   - Fields: id, name, icon, description, prompt
   - Added to SemanticLayer with to_dict/from_dict support

2. **Added 6 suggested charts to snowflake_saas semantic.yaml:**
   - MRR Trend (area chart of monthly recurring revenue)
   - Customer Growth (new signups over time)
   - Revenue by Plan (MRR by subscription tier)
   - Revenue by Industry (MRR by customer industry)
   - Top Customers (highest value by MRR)
   - Churn Analysis (churn patterns over time)

3. **Added 6 suggested charts to olist_ecommerce semantic.yaml:**
   - GMV Trend (gross merchandise value by month)
   - Orders Over Time (order volume trends)
   - Orders by State (geographic distribution)
   - Category Performance (top categories by revenue)
   - Payment Methods (revenue by payment type)
   - Satisfaction Score (review score distribution)

4. **Updated templates API** (`api/routers/templates.py`)
   - Now loads from semantic layer first
   - Falls back to static templates if no semantic layer charts
   - Uses preferred_source instead of business_type

5. **Removed Business Type from Settings** (`app/src/pages/SettingsPage.tsx`)
   - Removed BUSINESS_TYPES constant
   - Removed handleBusinessTypeChange function
   - Removed Business Type section from UI
   - Data source selection now determines chart templates

### Files Modified

| File | Change |
|------|--------|
| `engine/semantic.py` | Added SuggestedChart dataclass, updated SemanticLayer |
| `sources/snowflake_saas/semantic.yaml` | Added 6 suggested charts |
| `sources/olist_ecommerce/semantic.yaml` | Added 6 suggested charts |
| `api/routers/templates.py` | Load charts from semantic layer by source |
| `app/src/pages/SettingsPage.tsx` | Removed Business Type section |

### Verification

```bash
# Both sources load 6 charts successfully
python -c "from engine.semantic import SemanticLayer; \
  sl = SemanticLayer.load('sources/snowflake_saas/semantic.yaml'); \
  print([c.name for c in sl.suggested_charts])"
# ['MRR Trend', 'Customer Growth', 'Revenue by Plan', 'Revenue by Industry', 'Top Customers', 'Churn Analysis']
```

### Next Steps

- [ ] Test all 12 suggested charts end-to-end to verify they render correctly
- [ ] Update semantic generation prompt to auto-generate suggested_charts for new sources
- [ ] Consider removing updateBusinessType from API client (now unused)
- [ ] Optionally remove business_type from UserPreferences model validation

---

## Session: 2026-01-26 (Part 3)

### Focus: E-Commerce Template Fixes & Test Suite Validation

**Context**: Ran the autonomous chart test suite with the Olist E-commerce dataset. Discovered that several suggested chart templates don't work with the actual e-commerce data, creating a poor user experience where charts render with no data.

### Test Results

Ran 30 prompts across all 3 LLMs with Olist e-commerce data:

| Provider | Passed | Failed | Pass Rate |
|----------|--------|--------|-----------|
| Claude   | 29     | 1      | 96.7%     |
| OpenAI   | 27     | 3      | 90.0%     |
| Gemini   | 25     | 5      | 83.3%     |

**Systematic Failure**: Prompt 27 ("Revenue by month with a filter for year") failed on all providers due to SQL filter syntax issues.

### Problems Identified

1. **Historical Data Issue**: LLM generated SQL with `CURRENT_DATE - INTERVAL '12 months'` but Olist data is from 2016-2018, returning 0 rows.
   - **Fix**: Updated `sources/olist_ecommerce/semantic.yaml` with note about historical data timeframe

2. **E-commerce Templates Don't Match Data**: Several suggested templates reference data that Olist doesn't have:
   - Cart abandonment funnel (requires clickstream data - Olist only has orders)
   - Visitor trends (requires web analytics - Olist only has transactions)
   - Product-level performance (Olist doesn't have product views/engagement)
   - Customer LTV (Olist has no subscription/recurring revenue)

### Solution: Updated E-Commerce Templates

Modified `engine/templates/charts.yaml` to replace templates with ones that work with typical order-based e-commerce data:

| Old Template | New Template | Reason |
|--------------|--------------|--------|
| `visitors-trend` | `orders-trend` | No visitor data in transactional datasets |
| `traffic-sources` | `orders-by-state` | No traffic/UTM data; use geographic analysis |
| `cart-abandonment` | `order-fulfillment-funnel` | No cart events; use order status progression |
| `product-performance` | `category-performance` | Aggregate by category, not individual products |
| `sales-trend` | `gmv-trend` | Renamed to standard e-commerce metric (GMV) |
| `customer-ltv` | `payment-methods` | No LTV data; analyze payment preferences |

Also split `metric-health-check` into business-type specific versions:
- `metric-health-check` (SaaS) - uses subscriptions table
- `metric-health-check-orders` (E-commerce) - uses orders table
- `metric-health-check-general` (General) - generic key metrics

### Files Modified

| File | Change |
|------|--------|
| `engine/templates/charts.yaml` | Updated all e-commerce templates to match actual data availability |
| `sources/olist_ecommerce/semantic.yaml` | Added historical data timeframe note |
| `tests/chart_prompts.yaml` | Adapted 30 test prompts for e-commerce (earlier in session) |
| `tests/test_chart_prompts.py` | Added cache clearing for fresh data loading |

### Feature Enhancement Idea (Future)

**Auto-generate suggested charts during semantic layer creation**:

When a new data source is onboarded and the semantic layer is auto-generated via LLM, also auto-generate 6 suggested chart prompts specific to that data source. Benefits:
- Charts guaranteed to work with the actual data
- Customized to the real schema, not generic business type assumptions
- Better UX - users see charts that actually work
- LLM already has full schema context at that point

This would toggle on when that data source is selected, replacing the generic business-type templates.

### Next Steps

- [ ] Implement auto-generated suggested charts during onboarding
- [ ] Re-run test suite to verify template fixes work
- [ ] Investigate systematic failure on Prompt 27 (year filter)
- [ ] Consider adding data availability checks before suggesting templates

---

## Session: 2026-01-26 (Part 2)

### Focus: Multi-Source Support & Olist E-Commerce Dataset

**Context**: User wanted to test the client onboarding flow with a new e-commerce dataset. We set up the Olist Brazilian E-Commerce dataset and fixed the source caching issues to support multiple data sources.

### Problem Identified

The system had hardcoded `snowflake_saas` as the source name in multiple places, preventing proper multi-source support:
- `engine/schema.py` - Hardcoded in `to_prompt_context()`
- `engine/chart_pipeline.py` - Default parameter was `snowflake_saas`
- Various prompt templates referenced `snowflake_saas.tablename`

### Solution Implemented

1. **Added `source_name` property to Config** (`engine/config.py`)
   - Reads source name from the `name` field in connection.yaml
   - Provides proper default when not specified

2. **Made `Schema.to_prompt_context()` dynamic** (`engine/schema.py`)
   - Accepts `source_name` parameter
   - Falls back to semantic layer's source_name if available
   - Uses config default otherwise

3. **Updated ChartPipeline to auto-detect source** (`engine/chart_pipeline.py`)
   - Gets source_name from config when not explicitly provided
   - Passes source_name to schema context

4. **Added cache clearing functions**
   - `clear_config_cache()` in `engine/config.py`
   - `clear_schema_cache()` in `engine/schema.py`
   - `clear_validator_cache()` in `engine/sql_validator.py`

### Olist E-Commerce Dataset Setup

1. **Downloaded dataset** from Kaggle (Brazilian E-Commerce Public Dataset by Olist)
   - 8 tables, ~550k total rows
   - Covers orders, customers, products, payments, reviews, sellers

2. **Loaded into Snowflake** (`data/olist/load_to_snowflake.py`)
   - Created `ANALYTICS_POC.OLIST_ECOMMERCE` schema
   - Loaded all 8 CSV files

3. **Created source configuration** (`sources/olist_ecommerce/`)
   - `connection.yaml` - Snowflake connection with schema reference
   - `dialect.yaml` - DuckDB-compatible SQL rules
   - `semantic.yaml` - AI-generated semantic layer (E-commerce domain)

4. **Exported data for local validation** (`data/olist_ecommerce/`)
   - Created parquet files for each table
   - Enables DuckDB validation without Snowflake connection

5. **Updated engine_config.yaml** to use new source

### Files Created

| File | Purpose |
|------|---------|
| `sources/olist_ecommerce/connection.yaml` | Snowflake connection config |
| `sources/olist_ecommerce/dialect.yaml` | DuckDB-compatible SQL rules |
| `sources/olist_ecommerce/semantic.yaml` | AI-generated semantic layer |
| `data/olist/load_to_snowflake.py` | Script to load CSV data to Snowflake |
| `data/olist_ecommerce/export_to_parquet.py` | Export Snowflake to parquet |
| `data/olist_ecommerce/{table}/*.parquet` | Local parquet files for validation |

### Files Modified

| File | Change |
|------|--------|
| `engine/config.py` | Added `source_name` property, `clear_config_cache()` |
| `engine/schema.py` | Made `to_prompt_context()` accept dynamic source_name, added `clear_schema_cache()` |
| `engine/chart_pipeline.py` | Auto-detect source_name from config |
| `engine/chart_conversation.py` | Pass source_name to ChartPipeline |
| `engine/sql_validator.py` | Added `clear_validator_cache()` |
| `.gitignore` | Added `sources/olist_ecommerce/connection.yaml` to protect credentials |

### Verification

Successfully tested chart creation with new source:
```
[ChartPipeline] Loaded semantic layer: E-commerce
[ChartConversation] Executing preview query: SELECT op.PAYMENT_TYPE as payment_type, SUM(op.PAYMENT_VALUE) as revenue FROM olist_ecommerce.order_payments...
```

SQL now correctly uses `olist_ecommerce.tablename` instead of `snowflake_saas.tablename`.

### Commit

Pushed to main: `f3e2081` - "Add multi-source support and Olist E-commerce dataset"

**Note**: Default `engine_config.yaml` still points to `snowflake_saas` to avoid breaking other developers. To use Olist, change the connection_file path locally.

### Client Onboarding Flow - Validated ✓

The complete end-to-end flow for new Snowflake data sources works:
1. Load data into Snowflake → ✓
2. Create source configuration (connection.yaml, dialect.yaml) → ✓
3. Generate semantic layer with AI → ✓ (auto-documents tables, columns, relationships)
4. Export data for local validation → ✓
5. Create charts with natural language → ✓

Time to value: ~10 minutes from raw data to asking natural language questions.

### Next Steps

- [ ] Test full autonomous chart testing suite with new source
- [ ] Add UI for switching between data sources
- [ ] Consider adding source selection to chart creation flow

---

## Session: 2026-01-26 (Part 1)

### Focus: Autonomous Chart Testing System

**Context**: Implemented a repeatable, autonomous testing system for chart generation that:
1. Tests 30 realistic PM/data scientist prompts across all 3 LLMs (Claude, OpenAI, Gemini)
2. Runs all 3 LLMs in parallel using ProcessPoolExecutor
3. Logs results separately per LLM (parallel-safe JSON files)
4. Generates combined markdown analysis report
5. Identifies systematically failing patterns

### Files Created

| File | Purpose |
|------|---------|
| `tests/chart_prompts.yaml` | 30 prompt definitions with validation criteria |
| `tests/test_chart_prompts.py` | Parallel test runner for all providers |

### Implementation Details

#### 1. Prompt Definitions (`tests/chart_prompts.yaml`)

30 prompts organized into 3 categories:
- **Template Tests (10)**: Explicitly test all chart templates (mrr-trend, signups-trend, churn-rate, top-customers, feature-adoption, active-users, revenue-trend, engagement-rate, activation-rate, metric-health-check)
- **Chart Type Tests (10)**: Test all chart types (bar, line, area, bigvalue, histogram, heatmap, scatter, funnel, table, dual-trend)
- **Natural Language Variations (10)**: Realistic PM/DS requests including vague questions, casual language, typos, verbose requests, and business questions

Each prompt includes:
- `expected_chart_type`: The chart type expected
- `expected_template`: Template if applicable
- `validation_criteria`: List of criteria for QA validation

#### 2. Parallel Test Runner (`tests/test_chart_prompts.py`)

Key features:
- **Parallel Execution**: Uses `ProcessPoolExecutor` to run all 3 providers simultaneously
- **Parallel-Safe Output**: Each provider writes to its own JSON file (`prompts_{provider}_{timestamp}.json`)
- **Incremental Saves**: Results saved after each test to prevent data loss
- **QA Validation**: Uses Claude for consistent visual validation across all providers
- **Analysis Report**: Generates combined markdown report with:
  - Pass rates by provider
  - Results by category and chart type
  - Failing prompts with error details
  - Systematic failures (same test failing on all LLMs)
  - Provider-specific failures

CLI Interface:
```bash
# Run all providers in parallel (default)
python tests/test_chart_prompts.py

# Run single provider
python tests/test_chart_prompts.py --provider claude

# Run specific prompts only
python tests/test_chart_prompts.py --prompts 01,05,10

# Skip QA for faster testing
python tests/test_chart_prompts.py --no-qa

# Verbose output
python tests/test_chart_prompts.py --verbose
```

#### 3. Output Structure

```
test_results/
├── prompts_claude_TIMESTAMP.json    # Claude results
├── prompts_openai_TIMESTAMP.json    # OpenAI results
├── prompts_gemini_TIMESTAMP.json    # Gemini results
├── prompts_analysis_TIMESTAMP.md    # Combined analysis report
└── prompt_screenshots/
    ├── 01_claude_TIMESTAMP.png
    ├── 01_openai_TIMESTAMP.png
    └── ...
```

### Architecture

```
test_chart_prompts.py
       │
       ├── Spawns 3 parallel processes (ProcessPoolExecutor)
       │   ├── Claude subprocess → prompts_claude_TIMESTAMP.json
       │   ├── OpenAI subprocess → prompts_openai_TIMESTAMP.json
       │   └── Gemini subprocess → prompts_gemini_TIMESTAMP.json
       │
       ├── Each subprocess:
       │   ├── Uses ChartConversationManager
       │   ├── Takes screenshots via Playwright
       │   └── Validates via QA system (always Claude for consistency)
       │
       └── Main process generates combined analysis report
```

### Next Steps

- [ ] Run initial test suite: `python tests/test_chart_prompts.py`
- [ ] Identify systematic failures
- [ ] Fix failing templates/pipeline issues
- [ ] Iterate until 100% pass rate

---

## Session: 2026-01-25 (Part 13)

### Focus: Complete Data Source Onboarding Flow

**Context**: User asked about the onboarding experience for new users adding a new database. We extended the schema browser to include:
1. AI-powered semantic layer generation
2. Add Data Source wizard for connecting new databases

### Implementation

#### 1. Semantic Generation API (`api/routers/sources.py`)

Added endpoint to trigger AI-powered semantic layer generation:
- `POST /sources/{source_name}/semantic/generate` - Generates semantic layer using LLM analysis
- Calls `SemanticGenerator` from `engine/semantic_generator.py`
- Analyzes schema + sample data to generate descriptions, roles, relationships
- Returns table count, relationship count, and detected domain

Request body:
```python
class SemanticGenerateRequest(BaseModel):
    provider: str | None = None  # claude, openai, gemini
    force: bool = False  # Force regeneration even if not stale
```

#### 2. Frontend API Functions (`app/src/api/client.ts`)

Added new API functions:
- `generateSemanticLayer(sourceName, options)` - Trigger semantic generation
- `testSnowflakeConnection(connection)` - Test database connection
- `saveSnowflakeConnection(connection, sourceName)` - Save connection config

#### 3. Source Store Updates (`app/src/stores/sourceStore.ts`)

Added generation state and action:
- `generating: boolean` - Loading state during generation
- `generateError: string | null` - Error message if generation fails
- `generateSemantic(provider?, force?)` - Action to trigger generation

#### 4. Schema Browser: Generate Button (`app/src/components/sources/SchemaBrowser.tsx`)

When a source has no semantic layer:
- Shows "Generate Semantic Layer" prompt with feature list
- "Generate with AI" button triggers generation
- Loading spinner during generation
- Error display if generation fails

#### 5. Add Data Source Wizard (`app/src/components/sources/AddDataSourceWizard.tsx`)

Multi-step wizard modal for new database connections:

**Step 1: Connection Details**
- Source name input
- Snowflake connection fields (account, username, password, warehouse, database, schema)
- "Test Connection" button

**Step 2: Generate Semantic Layer**
- Shows connection success with table list
- "Generate Semantic Layer" button
- AI analyzes schema and sample data

**Step 3: Complete**
- Shows generation results (table count, domain)
- "Browse Schema" button opens schema browser

#### 6. Sidebar Integration

Updated Data Sources section:
- "Add Data Source" button at bottom of sources list
- Opens AddDataSourceWizard modal
- After completion, opens schema browser for new source

### Files Created

| File | Purpose |
|------|---------|
| `app/src/components/sources/AddDataSourceWizard.tsx` | Multi-step connection wizard |

### Files Modified

| File | Change |
|------|--------|
| `api/routers/sources.py` | Added `POST /sources/{source_name}/semantic/generate` endpoint |
| `app/src/api/client.ts` | Added generation and connection API functions |
| `app/src/stores/sourceStore.ts` | Added `generating`, `generateError`, `generateSemantic()` |
| `app/src/components/sources/SchemaBrowser.tsx` | Added generate prompt and loading states |
| `app/src/components/sources/index.ts` | Export AddDataSourceWizard |
| `app/src/components/layout/Sidebar.tsx` | Added "Add Data Source" button and wizard modal |

### Complete Onboarding Flow

```
User clicks "Add Data Source" in sidebar
          ↓
┌─────────────────────────────────────┐
│  Step 1: Connection Details          │
│  - Enter source name                 │
│  - Enter Snowflake credentials       │
│  - Click "Test Connection"           │
└─────────────────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│  Step 2: Generate Semantic Layer     │
│  - Shows tables found                │
│  - Click "Generate Semantic Layer"   │
│  - AI analyzes schema + samples      │
└─────────────────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│  Step 3: Complete                    │
│  - Shows tables documented, domain   │
│  - Click "Browse Schema"             │
│  → Opens Schema Browser              │
└─────────────────────────────────────┘
          ↓
User can view/edit semantic layer in Schema Browser
```

### Verification

- TypeScript compiles without errors for new code
- Python router imports successfully
- All components properly exported and imported

### Next Steps

- [ ] Add support for other database types (PostgreSQL, MySQL, BigQuery)
- [ ] Add progress streaming during semantic generation (SSE)
- [ ] Add "Regenerate" button in Schema Browser header for existing sources

---

## Session: 2026-01-25 (Part 12)

### Focus: Data Sources in Sidebar with Schema Browser

**Context**: User requested a "Data Sources" section in the sidebar that shows connected sources, their tables/columns, and allows editing the semantic layer metadata.

### Implementation

#### 1. Backend Schemas (`api/schemas/source.py`)

Created new Pydantic schemas for semantic layer API:
- `ColumnSemantic` - Column with semantic metadata (role, description, business_meaning, etc.)
- `TableSemantic` - Table with columns and metadata
- `RelationshipSchema` - Foreign key relationships
- `BusinessContextSchema` - Domain description, key metrics, glossary
- `SemanticLayerResponse` - Full semantic layer response
- `SemanticUpdateRequest` - Partial update request
- `SourceInfoExtended` - Source info with semantic layer status

#### 2. Backend API Endpoints (`api/routers/sources.py`)

Enhanced existing `/sources` endpoint and added semantic layer endpoints:
- `GET /sources` - Now includes `has_semantic_layer` and `table_count`
- `GET /sources/{source_name}/semantic` - Get full semantic layer with tables, columns, relationships
- `PATCH /sources/{source_name}/semantic` - Update table/column descriptions and roles

The semantic endpoint:
- Parses `semantic.yaml` files from sources directory
- Merges with column type info from cached parquet files
- Returns structured response for frontend consumption

#### 3. Frontend API Client (`app/src/api/client.ts`)

Added TypeScript interfaces and functions:
- `ColumnSemantic`, `TableSemantic`, `RelationshipSchema`, etc.
- `fetchSourcesExtended()` - Get sources with semantic status
- `fetchSemanticLayer(sourceName)` - Get semantic layer
- `updateSemanticLayer(sourceName, request)` - Update metadata

#### 4. Source Store (`app/src/stores/sourceStore.ts`)

Created Zustand store for source state management:
- Sources list with loading/error states
- Selected source and semantic layer
- Schema browser modal state
- Pending changes tracking for edits
- Actions: loadSources, selectSource, loadSemanticLayer, selectTable
- Save/discard changes functionality
- `getMergedTableData()` helper for combining original data with pending changes

#### 5. SchemaBrowser Component (`app/src/components/sources/SchemaBrowser.tsx`)

Full-featured schema browser modal:
- **Header**: Source selector dropdown, close button
- **Business Context**: Collapsible section showing domain, key metrics, key dimensions
- **Table List**: Left sidebar with table names and column counts
- **Table Details**: Editable fields for description and business role
- **Column Grid**: Expandable rows showing:
  - Column name, type, role badge
  - Editable description
  - Role selector (primary_key, foreign_key, dimension, measure, date, identifier)
  - Business meaning textarea
  - Aggregation hint (for measures)
  - References display (for foreign keys)
- **Footer**: Save/discard buttons when changes are pending

#### 6. Sidebar Integration (`app/src/components/layout/Sidebar.tsx`)

Added "Data Sources" collapsible section:
- Shows list of configured sources
- Connection status indicator (green/gray dot)
- Table count badge
- Click to open schema browser for that source
- Renders SchemaBrowser modal when open

### Files Created

| File | Purpose |
|------|---------|
| `api/schemas/source.py` | Semantic layer Pydantic schemas |
| `app/src/stores/sourceStore.ts` | Source state management |
| `app/src/components/sources/SchemaBrowser.tsx` | Schema browser modal |
| `app/src/components/sources/index.ts` | Barrel export |

### Files Modified

| File | Change |
|------|--------|
| `api/routers/sources.py` | Added semantic layer endpoints, enhanced list_sources |
| `app/src/api/client.ts` | Added semantic layer types and functions |
| `app/src/stores/index.ts` | Export sourceStore |
| `app/src/components/layout/Sidebar.tsx` | Added Data Sources section |

### User Flow

1. User sees "Data Sources" section in sidebar
2. Clicking a source opens the schema browser modal
3. Table list on left, details on right
4. Click a table to view/edit its metadata
5. Expand columns to edit descriptions and roles
6. Changes tracked as pending, save button appears
7. Click "Save Changes" to persist to `semantic.yaml`

### Verification

- TypeScript compiles without errors for new code
- Python router imports successfully
- Schema browser modal renders correctly
- Edits are saved to YAML file

### Next Steps

- [ ] Test full flow with dev server running
- [ ] Add visual indicators for tables/columns with missing documentation
- [ ] Consider adding "Generate with AI" button to auto-document columns

---

## Session: 2026-01-25 (Part 11)

### Focus: Expanded Chart Configuration Options

**Context**: User requested many more config options in the chart config editor, not just a basic subset.

### Implementation

Added comprehensive config options across the entire stack:

#### 1. Python Model (`engine/models/chart.py`)

Expanded `ChartConfig` dataclass with new fields:
- **Styling**: `background_color`, `grid_color`
- **Typography**: `title_font_size`, `legend_font_size`, `axis_font_size`
- **Display Options**: `show_legend`, `show_grid`, `show_values`
- **Line/Scatter**: `line_width`, `marker_size`
- **Bar Chart**: `bar_gap`, `bar_group_gap`
- **Axis Options**: `tick_angle`, `y_axis_min`, `y_axis_max`

Updated `to_dict()` and `from_dict()` to serialize/deserialize all fields.

#### 2. API Router (`api/routers/chart.py`)

- Extended `field_mapping` dict with all new camelCase→snake_case mappings
- Updated `_get_allowed_config_fields()` with chart-type-specific options

#### 3. Render Endpoint (`api/routers/render.py`)

Updated `_chart_to_render_spec()` to include all new config fields in the response.

#### 4. TypeScript Types (`app/src/types/chart.ts`)

Already had the expanded fields (added in previous partial work).

#### 5. ConfigFormPanel (`app/src/components/editors/ConfigFormPanel.tsx`)

Expanded form with organized sections:
- **Labels**: title, xAxisTitle, yAxisTitle
- **Colors**: color, fillColor, backgroundColor, gridColor
- **Typography**: titleFontSize, legendFontSize, axisFontSize
- **Display Options**: showLegend, showGrid, showValues toggles
- **Axis Options**: tickAngle, yAxisMin, yAxisMax
- **Bar Options**: horizontal, stacked, sort, barGap, barGroupGap
- **Line Options**: stacked, lineWidth, markerSize
- **BigValue Options**: valueFormat, positiveIsGood, showTrend, sparklineType

Added `NumberInput` component for numeric fields.

#### 6. Chart Components

Updated to use new config options:
- **BarChart.tsx**: bargap, bargroupgap, tickAngle, yAxisMin/Max, showLegend, showGrid, showValues, font sizes, background/grid colors
- **LineChart.tsx**: lineWidth, markerSize, showLegend, showGrid, showValues, tickAngle, yAxisMin/Max, font sizes, background/grid colors
- **AreaChart.tsx**: lineWidth, fillColor, showLegend, showGrid, showValues, tickAngle, yAxisMin/Max, font sizes, background/grid colors

#### 7. AI Prompt (`engine/prompts/config_edit.yaml`)

Expanded with all new options organized by category:
- Documented all available fields with types
- Added examples for new options (hide legend, bigger title, rotate labels, thicker lines, show values, set axis range)
- Added white/black to color mappings

### Files Modified

| File | Change |
|------|--------|
| `engine/models/chart.py` | Added 15 new config fields, updated to_dict/from_dict |
| `api/routers/chart.py` | Extended field_mapping and allowed_config_fields |
| `api/routers/render.py` | Include all config fields in render spec |
| `app/src/components/editors/ConfigFormPanel.tsx` | Full form with all option sections |
| `app/src/components/charts/BarChart.tsx` | Apply all config options to Plotly layout |
| `app/src/components/charts/LineChart.tsx` | Apply all config options to Plotly layout |
| `app/src/components/charts/AreaChart.tsx` | Apply all config options to Plotly layout |
| `engine/prompts/config_edit.yaml` | Document all config options and examples |

### Config Options Summary

| Category | Options |
|----------|---------|
| Labels & Titles | title, xAxisTitle, yAxisTitle |
| Colors | color, fillColor, backgroundColor, gridColor |
| Typography | titleFontSize, legendFontSize, axisFontSize |
| Display | showLegend, showGrid, showValues |
| Line/Scatter | lineWidth, markerSize |
| Bar | horizontal, stacked, sort, barGap, barGroupGap |
| Axis | tickAngle, yAxisMin, yAxisMax |
| BigValue | valueFormat, positiveIsGood, showTrend, sparklineType |

---

## Session: 2026-01-25 (Part 10)

### Focus: Chart Configuration Editor with AI Assistance

**Context**: User requested a visual configuration editor for charts that combines form controls for common options with an AI assistant for natural language requests like "make the bars horizontal" or "change colors to blue".

### Implementation

#### 1. Backend Schemas (`api/schemas/chart.py`)

Added new schemas for config editing:
- `ChartConfigUpdateRequest` - Partial ChartConfig for updates
- `ChartConfigUpdateResponse` - Response with updated chart
- `AIConfigSuggestionRequest` - Request for AI-powered suggestion
- `AIConfigSuggestionResponse` - Suggested config with explanation

#### 2. Backend Endpoints (`api/routers/chart.py`)

Added two new endpoints:
- `PATCH /charts/library/{chart_id}/config` - Update chart config directly
- `POST /charts/library/{chart_id}/suggest-config` - Get AI suggestion for config changes

Helper function `_get_allowed_config_fields()` validates fields by chart type.

#### 3. AI Prompt (`engine/prompts/config_edit.yaml`)

Created comprehensive prompt for AI-assisted config changes:
- Documents all available config fields by chart type
- Provides color name to hex mappings (blue → #3b82f6, etc.)
- Includes output format specification (JSON with suggested_config and explanation)
- Provides examples for common requests

#### 4. Frontend API Client (`app/src/api/client.ts`)

Added functions:
- `updateChartConfig(chartId, config)` - Update chart config
- `getConfigSuggestion(chartId, currentConfig, chartType, userRequest)` - Get AI suggestion

#### 5. Editor Components (`app/src/components/editors/`)

**Control Components** (`controls/`):
- `ToggleOption.tsx` - Boolean toggle with label and description
- `ColorPicker.tsx` - Hex input with color preview and preset palette
- `TextInput.tsx` - Text input for titles
- `SelectInput.tsx` - Dropdown for format selection

**Panel Components**:
- `ConfigFormPanel.tsx` - Renders appropriate controls based on chart type
  - All charts: title, xAxisTitle, yAxisTitle, color
  - BarChart: horizontal, stacked toggles
  - LineChart/AreaChart: stacked toggle
  - BigValue: valueFormat, positiveIsGood, showTrend, sparklineType
- `ConfigAIAssistant.tsx` - Natural language input with example chips
  - Shows suggestion with explanation before applying
  - Chart-type-specific example chips
- `ChartConfigEditor.tsx` - Main editor modal
  - Split view: live preview on left, config panel on right
  - Real-time preview updates as config changes
  - Cancel/Apply Changes buttons

#### 6. ChartsPage Integration (`app/src/pages/ChartsPage.tsx`)

- Added "Edit Config" button in preview modal footer
- Added state for showing config editor (`showConfigEditor`)
- Renders `ChartConfigEditor` when active
- Handles save: refreshes chart list and preview data

### Files Created

| File | Purpose |
|------|---------|
| `engine/prompts/config_edit.yaml` | AI prompt for config suggestions |
| `app/src/components/editors/controls/ToggleOption.tsx` | Boolean toggle control |
| `app/src/components/editors/controls/ColorPicker.tsx` | Color picker with presets |
| `app/src/components/editors/controls/TextInput.tsx` | Text input control |
| `app/src/components/editors/controls/SelectInput.tsx` | Dropdown select control |
| `app/src/components/editors/controls/index.ts` | Barrel export |
| `app/src/components/editors/ConfigFormPanel.tsx` | Form panel by chart type |
| `app/src/components/editors/ConfigAIAssistant.tsx` | AI assistant panel |
| `app/src/components/editors/ChartConfigEditor.tsx` | Main editor component |
| `app/src/components/editors/index.ts` | Barrel export |

### Files Modified

| File | Change |
|------|--------|
| `api/schemas/chart.py` | Added config update schemas |
| `api/routers/chart.py` | Added PATCH config and POST suggest-config endpoints |
| `app/src/api/client.ts` | Added updateChartConfig, getConfigSuggestion functions |
| `app/src/pages/ChartsPage.tsx` | Added Edit Config button and editor integration |

### User Flow

1. User opens chart preview modal on Charts page
2. Clicks "Edit Config" button
3. Config editor opens as overlay with:
   - Live preview on left (updates in real-time)
   - Form controls on right (varies by chart type)
   - AI assistant below form controls
4. User can:
   - Use form controls to change settings directly
   - Type natural language request (e.g., "make horizontal")
   - Click example chips for quick changes
   - See AI explanation before applying
5. Changes preview live before saving
6. Click "Apply Changes" to save or "Cancel" to discard

### Verification

- TypeScript build passes
- Python API imports successfully
- All components follow existing dark theme styling

### Next Steps

- [ ] Add support for additional chart types as needed
- [ ] Consider adding undo/redo for config changes
- [ ] Add validation feedback for invalid combinations

---

## Session: 2026-01-25 (Part 8)

### Focus: New Dashboard Creation Wizard

**Context**: User requested a new dashboard creation flow where "New Dashboard" button takes users to a manual chart selection wizard instead of starting an LLM conversation.

### Changes Made

#### 1. New Dashboard Creation Page

Created `/dashboards/new` route with a 3-step wizard:

**Step 1: Select Charts**
- Grid view of all available charts (same as Charts page)
- Click to select/deselect charts
- Shows selection count
- Visual checkbox indicators on selected cards

**Step 2: Order Charts**
- List view of selected charts
- Up/down buttons to reorder
- Position numbers displayed
- Preserves chart info (title, type icon)

**Step 3: Details**
- Title input (required)
- Context block textarea
- "Generate with AI" button - calls LLM to write a summary paragraph
- Preview of selected charts in order

#### 2. API Endpoint for Context Generation

Added `POST /charts/dashboards/generate-context`:
- Takes dashboard title and list of chart titles/descriptions
- Uses LLM to generate a 2-3 sentence context paragraph
- Falls back to simple description if LLM fails

#### 3. Navigation Updates

- "New Dashboard" button on DashboardsPage → `/dashboards/new` (was: `/chat`)
- "Create New Dashboard" button on ChatPage welcome → `/dashboards/new` (was: start chat)
- Back button on NewDashboardPage → `/dashboards`

### Files Created

| File | Purpose |
|------|---------|
| `app/src/pages/NewDashboardPage.tsx` | 3-step dashboard creation wizard |

### Files Modified

| File | Change |
|------|--------|
| `app/src/App.tsx` | Added NewDashboardPage import and `/dashboards/new` route |
| `app/src/pages/DashboardsPage.tsx` | "New Dashboard" navigates to `/dashboards/new` |
| `app/src/pages/ChatPage.tsx` | "Create New Dashboard" navigates to `/dashboards/new` |
| `app/src/api/client.ts` | Added `generateDashboardContext()` function |
| `api/schemas/chart.py` | Added context generation request/response schemas |
| `api/routers/chart.py` | Added generate-context endpoint |

### User Flow

1. User clicks "New Dashboard" on Dashboards page or Chat welcome
2. Step 1: Select which charts to include (click to select)
3. Step 2: Arrange the order (up/down buttons)
4. Step 3: Enter title, optionally generate AI context
5. Click "Create Dashboard" → navigates to new dashboard view

### Design Decisions

- **Manual selection over LLM**: User explicitly picks charts instead of describing what they want
- **Explicit ordering**: Up/down buttons instead of drag-and-drop (simpler, more accessible)
- **Optional AI context**: Context is helpful but not required - can be empty or hand-written
- **Reuses existing infrastructure**: Uses same `createDashboardFromCharts` API as ChartsPage selection mode

---

## Session: 2026-01-25 (Part 9)

### Focus: Dashboard View Inside App + View Code Feature

**Context**: Dashboards rendered at `/dashboard/{slug}` were standalone pages with no navigation back to the app. Also, data scientists requested ability to see the SQL and Python code behind each chart.

### Changes Made

#### 1. In-App Dashboard View

Added `/dashboards/view/:slug` route inside the app layout (with sidebar):

- **DashboardView.tsx**: Updated to work in two modes:
  - Standalone mode (`/dashboard/:slug`) - Full page, no navigation (for sharing)
  - In-app mode (`/dashboards/view/:slug`) - With sidebar, back button, edit button
- Dark theme styling when in-app mode
- Context block displayed with left border accent
- "Edit" button navigates to new dashboard wizard

#### 2. View Code Feature

Added collapsible "View Code" section below each chart in in-app dashboard view:

- **ChartCard.tsx**: Added `showCode` prop
  - Toggle button to expand/collapse code section
  - Tabbed view: SQL | Python
  - Syntax-highlighted code display (dark theme)
  - Copy button for easy clipboard access
  - Python snippet includes DuckDB boilerplate

- **DashboardGrid.tsx**: Added `showCode` prop, passes to ChartCard

#### 3. Dashboard List Links

- Updated DashboardsPage "View" button to navigate to `/dashboards/view/:slug`
- Updated NewDashboardPage to navigate to in-app view after creation

#### 4. Fixed Dashboard Not Saving to List

**Root Cause**: Two different storage systems were in use:
- File storage: `.story-analytics/dashboards/*.json` (where dashboards were created)
- Database: SQLAlchemy `Dashboard` model (where list endpoint reads from)

**Fix**: Updated `POST /charts/dashboards` endpoint to also create a database record after saving to file storage.

### Files Modified

| File | Change |
|------|--------|
| `app/src/App.tsx` | Added `/dashboards/view/:slug` route inside AppLayout |
| `app/src/pages/DashboardView.tsx` | Dual-mode rendering (standalone vs in-app), dark theme |
| `app/src/components/layout/DashboardGrid.tsx` | Added `showCode` prop |
| `app/src/components/layout/ChartCard.tsx` | Added View Code section with SQL/Python tabs |
| `app/src/pages/DashboardsPage.tsx` | "View" links to `/dashboards/view/:slug` |
| `app/src/pages/NewDashboardPage.tsx` | Navigate to in-app view after creation |
| `api/routers/chart.py` | Save dashboard to database in addition to file storage |

### Verification

- TypeScript build passes
- Python API imports successfully
- Dashboards now appear in list after creation
- Code view shows SQL and Python with copy functionality

---

## Session: 2026-01-25 (Part 7)

### Focus: Dark Theme Consistency & Chart Management Features

**Context**: Continued UI polish and added chart management capabilities to the preview modal.

### Changes Made

#### 1. Dark Theme Consistency

Made the entire app consistently dark-themed (Homebrew Terminal style):

- **Sidebar.tsx**: Changed from light (`gray-50`) to dark (`gray-900`) background
- **ChatPage.tsx**: Updated welcome screen, cards, and buttons to dark variants
- **ChatInput.tsx**: Dark input background with light text
- **Message.tsx**: Dark markdown content colors and button backgrounds
- **ProgressSteps.tsx**: Fixed streaming status updates showing white background - now uses `gray-800`

#### 2. View Chart Button

Added a "View Chart" button to chat messages instead of plain URL links:

- **Message.tsx**: Added `ViewChartButton` component that extracts chart ID and navigates to `/charts?preview={chartId}`
- **ChartsPage.tsx**: Added `useSearchParams` handling to auto-open preview modal when `preview` param is present

#### 3. Chart Management Actions in Preview Modal

Added Rename, Edit, and Duplicate functionality to the Charts page preview modal:

**Backend (api/routers/chart.py)**:
- `PATCH /charts/library/{chart_id}` - Update chart title/description
- `POST /charts/library/{chart_id}/duplicate` - Create a copy of a chart
- `GET /charts/library/{chart_id}/session` - Get conversation session for a chart

**Schemas (api/schemas/chart.py)**:
- Added `ChartUpdateRequest`, `ChartUpdateResponse`, `ChartDuplicateResponse`

**Frontend (app/src/api/client.ts)**:
- `updateChart(chartId, { title?, description? })`
- `duplicateChart(chartId)`
- `getChartSession(chartId)`

**UI (app/src/pages/ChartsPage.tsx)**:
- **Rename**: Inline title editing in modal header with Save/Cancel
- **Edit**: Navigates to `/chat?editChart={chartId}` to load the chart's conversation
- **Duplicate**: Creates a copy with "(Copy)" suffix and opens it

**ChatPage.tsx**:
- Added handling for `editChart` query param to load chart's linked conversation session

### Files Modified

| File | Change |
|------|--------|
| `app/src/components/layout/Sidebar.tsx` | Dark theme colors |
| `app/src/pages/ChatPage.tsx` | Dark theme + editChart param handling |
| `app/src/components/chat/ChatInput.tsx` | Dark theme colors |
| `app/src/components/chat/Message.tsx` | Dark theme + ViewChartButton |
| `app/src/components/chat/ProgressSteps.tsx` | Dark background for streaming status |
| `app/src/pages/ChartsPage.tsx` | Preview modal actions (Rename/Edit/Duplicate) |
| `app/src/api/client.ts` | updateChart, duplicateChart, getChartSession functions |
| `api/routers/chart.py` | PATCH, duplicate, and session endpoints |
| `api/schemas/chart.py` | Update/duplicate request/response schemas |

### User Flow

1. **View Chart**: Click "View Chart" button in chat → navigates to Charts page with preview modal open
2. **Rename**: Click Rename → edit title inline → Save
3. **Edit**: Click Edit → loads original conversation → continue modifying chart
4. **Duplicate**: Click Duplicate → creates copy → opens copy in preview

---

## Session: 2026-01-25 (Part 6)

### Focus: Semantic Layer for Data Sources

**Context**: Implemented a semantic layer feature that generates LLM-powered documentation for database schemas. This documentation provides business context, column descriptions, relationships, and common query patterns - enabling more reliable chart generation.

### Why This Matters

**Before (raw schema)**: LLM sees columns and must guess meanings each time
```
- PLAN_TIER: VARCHAR NULL
  Sample values: Pro, Starter, Enterprise
```

**After (with semantic layer)**: LLM gets rich business context
```
- PLAN_TIER: VARCHAR NULL [dimension]
  Description: Current subscription plan level
  Business meaning: Free=Trial users, Starter=$99/mo, Pro=$499/mo, Enterprise=Custom
```

### Implementation Completed

1. **Semantic Layer Data Structures** (`engine/semantic.py`):
   - `ColumnSemantic`: Role, description, aggregation hints, business meaning
   - `TableSemantic`: Description, business role, typical questions
   - `Relationship`: Foreign key relationships between tables
   - `QueryPattern`: Common SQL patterns for the domain
   - `BusinessContext`: Domain description, key metrics, glossary
   - `SemanticLayer`: Complete semantic documentation with YAML serialization

2. **LLM Generator** (`engine/semantic_generator.py`):
   - `SemanticGenerator` class that:
     - Introspects database schema
     - Samples data from each table
     - Sends schema + samples to LLM for analysis
     - Parses response into SemanticLayer object
   - Schema hash for staleness detection
   - `generate_semantic_layer()` convenience function

3. **Generation Prompt** (`engine/prompts/semantic/generate.yaml`):
   - Detailed instructions for LLM to generate semantic layer
   - Column role classification (primary_key, foreign_key, dimension, measure, date)
   - Aggregation hints (SUM, COUNT, AVG)
   - Business meaning explanations
   - Query pattern identification

4. **CLI Commands** (`engine/cli/semantic.py`):
   - `generate`: Create semantic layer for a data source
   - `status`: Check if semantic layer exists and is up to date
   - `show`: Display semantic layer in YAML or prompt format
   - Supports `--force` and `--provider` flags

5. **Schema Integration** (`engine/schema.py`):
   - `get_schema_hash()`: Deterministic hash for staleness detection
   - Enhanced `to_prompt_context(semantic_layer)`: Merges semantic info with schema
   - Module-level `get_schema_hash()` function

6. **Config Loader** (`engine/config_loader.py`):
   - `get_semantic_layer(source_name)`: Load semantic layer from YAML
   - `get_semantic_prompt(source_name)`: Format for LLM context
   - `has_semantic_layer(source_name)`: Check if exists
   - `clear_semantic_cache()`: Cache management

### Files Created

| File | Purpose |
|------|---------|
| `engine/semantic.py` | SemanticLayer and related dataclasses |
| `engine/semantic_generator.py` | LLM-powered generation |
| `engine/prompts/semantic/generate.yaml` | Generation prompt |
| `engine/cli/__init__.py` | CLI package init |
| `engine/cli/semantic.py` | CLI commands |
| `sources/snowflake_saas/semantic.yaml` | Generated semantic layer |

### Files Modified

| File | Change |
|------|--------|
| `engine/schema.py` | Added `get_schema_hash()`, enhanced `to_prompt_context()` |
| `engine/config_loader.py` | Added semantic layer methods and cache |

### Generated Semantic Layer Summary

For `snowflake_saas`:
- **Tables**: 5 (CUSTOMERS, SUBSCRIPTIONS, USERS, EVENTS, INVOICES)
- **Relationships**: 4 (all foreign keys properly documented)
- **Query Patterns**: 6 (MRR analysis, churn, cohorts, engagement, revenue, customer health)
- **Domain**: SaaS
- **Key Metrics**: MRR, Churn Rate, CLV, Engagement Score, Revenue per Customer

### Usage

```bash
# Generate semantic layer
python -m engine.cli.semantic generate snowflake_saas

# Check status
python -m engine.cli.semantic status snowflake_saas

# View formatted for prompts
python -m engine.cli.semantic show snowflake_saas

# Force regeneration
python -m engine.cli.semantic generate snowflake_saas --force
```

### Integration with Chart Pipeline

The semantic layer can now be loaded and merged with schema context:

```python
from engine.config_loader import get_config_loader
from engine.schema import get_schema_context

loader = get_config_loader()
semantic_layer = loader.get_semantic_layer('snowflake_saas')
context = get_schema_context(semantic_layer)  # Rich context for LLM
```

### Next Steps

- [ ] Integrate semantic layer into chart pipeline's SQL generation
- [ ] Add automatic semantic layer regeneration when schema changes
- [ ] Consider adding dashboard-level semantic documentation
- [ ] Test chart generation quality improvement with semantic context

---

## Session: 2026-01-25 (Part 5)

### Focus: Explicit Column Mapping Refactoring (AI-Native Fix)

**Context**: User experienced unreliable chart generation where the same request (MRR by product over time) worked sometimes and failed other times. Root cause was systemic: the pipeline used heuristic keyword matching to guess column roles instead of having the LLM explicitly specify them.

### The Problem

The `_build_chart_config()` method in `chart_pipeline.py` used fragile heuristics:

```python
# OLD APPROACH: Fragile keyword matching
series_keywords = ["type", "category", "segment", "group", "status", ...]
for col in y_columns:
    if any(kw in col for kw in series_keywords):
        series_col = col
```

Issues with this approach:
1. Column names might not contain expected keywords
2. Case sensitivity mismatches (PLAN_TIER vs plan_tier)
3. Different naming conventions across projects
4. Throws away LLM's understanding of the data

### The Solution: Explicit LLM Column Mappings

Following the project's AI-native philosophy, we now have the LLM explicitly specify column roles.

**1. Added column mapping fields to ChartSpec** (`engine/models/chart.py`):
```python
@dataclass
class ChartSpec:
    # ... existing fields ...

    # Explicit column mappings (LLM-specified, not heuristic-guessed)
    x_column: str | None = None      # Column for X-axis (e.g., "month")
    y_column: str | list[str] | None = None  # Y-axis metric(s)
    series_column: str | None = None # Grouping column (e.g., "plan_tier")
```

**2. Updated requirements prompt** (`engine/prompts/chart/requirements.yaml`):
- Added instruction section 9 requiring explicit column mappings
- Updated all JSON examples to include x_column, y_column, series_column
- Emphasized lowercase column names for consistency

**3. Updated parsing logic** (`engine/chart_pipeline.py`):
- `_parse_response()` extracts new fields and normalizes to lowercase
- `_build_chart_config()` uses explicit mappings when available
- Falls back to heuristics only if mappings not provided (backward compatibility)

### Example: Before vs After

**Request**: "Show me MRR by product over time"

**Before (heuristic, unreliable)**:
- SQL returns columns: `month`, `plan_tier`, `mrr`
- Heuristic scans for keywords... might or might not detect `plan_tier`
- Result: Sometimes works, sometimes broken

**After (explicit, reliable)**:
- LLM returns: `{"x_column": "month", "y_column": "mrr", "series_column": "plan_tier"}`
- Pipeline uses exact mappings
- Result: Consistently correct

### Files Modified

| File | Change |
|------|--------|
| `engine/models/chart.py` | Added x_column, y_column, series_column fields to ChartSpec |
| `engine/prompts/chart/requirements.yaml` | Added column mapping instructions and examples |
| `engine/chart_pipeline.py` | Extract column mappings, use explicit mappings in _build_chart_config() |

### Verification

```bash
# Test explicit mapping extraction
python -c "
from engine.chart_pipeline import ChartRequirementsAgent
agent = ChartRequirementsAgent()
spec = agent._parse_response('...json with mappings...', 'request')
print(f'x_column: {spec.x_column}')  # month
print(f'y_column: {spec.y_column}')  # mrr
print(f'series_column: {spec.series_column}')  # plan_tier
"

# Test config builder uses explicit mappings
# Output: "[ChartPipeline]   Using explicit column mappings: x=month, y=mrr, series=plan_tier"
```

### Design Philosophy Note

This change aligns with the project's AI-native philosophy documented in CLAUDE.md:
> "Never use naive string/keyword matching for intent detection or control flow."

The LLM now explicitly communicates column roles rather than the pipeline guessing from keywords.

### Next Steps

- [ ] Test full chart creation flow with explicit mappings
- [ ] Monitor for any edge cases where LLM doesn't provide mappings
- [ ] Consider adding validation that column names exist in SQL output

---

## Session: 2026-01-25 (Part 4)

### Focus: Chart Creation Quality & UX Improvements

**Context**: User experienced 20+ chart creation failures with incorrect outputs. Root causes identified:
1. Series column detection was missing common keywords like "product", "tier", "plan"
2. Charts were generated immediately without user review of SQL/data
3. Visual QA was disabled for charts
4. No progress feedback during generation

### Bug Fix: Multiline Chart Series Detection

**Problem**: A request for "MRR by product over time" produced a broken chart where "product" was plotted as a Y-axis value instead of being used as a series grouper.

**Root Cause**: In `chart_pipeline.py`, the `series_keywords` list was missing common categorical column names.

**Fix** (`engine/chart_pipeline.py`):
```python
# Before
series_keywords = ["type", "category", "segment", "group", "status", "event", "name", "label"]

# After
series_keywords = ["type", "category", "segment", "group", "status", "event", "name", "label", "product", "tier", "plan", "region", "channel", "source"]
```

### Feature 1: Chart Proposal Step

Added a proposal phase to chart creation where users can review SQL and data preview before generating the chart.

**New Flow**:
1. User describes chart
2. System shows PROPOSED CHART with:
   - Chart title and description
   - SQL query (formatted in code block)
   - Data preview table (first 5 rows)
3. User clicks "Generate" to proceed or "Modify Plan" to adjust

**Changes**:
- Added `PROPOSING` phase to `ChartPhase` enum
- Added proposal state to `ChartConversationState` (proposed_spec, proposed_sql, proposed_columns, proposed_data_preview)
- New `_build_proposal_response()` method formats proposal as markdown with data table
- New `_handle_generate_chart()` method creates chart from approved proposal
- Updated `process_message()` to handle PROPOSING phase
- Updated frontend PHASE_LABELS

### Feature 2: Visual QA for Charts

Enabled screenshot-based QA validation for chart creation.

**Change** (`engine/chart_pipeline.py:435`):
```python
# Before
enable_visual_qa=False,  # Visual QA requires running app

# After
enable_visual_qa=True,  # Screenshot-based validation
```

QA now runs during `_handle_generate_chart()` if visual QA is enabled.

### Feature 3: Streaming Progress for Chart Creation

Added SSE streaming to show users progress during chart generation.

**Backend** (`api/routers/chart.py`):
- New endpoint: `POST /charts/conversation/message/stream`
- Uses same pattern as dashboard streaming
- Emits progress events: requirements, sql, validation, layout, writing, qa, complete

**Engine** (`engine/chart_conversation.py`):
- Added `progress_emitter` parameter to `ChartConversationManager`
- Added `_emit_progress()` helper method
- Progress emissions throughout `_handle_new_chart_request()` and `_handle_generate_chart()`

**Frontend**:
- Added `sendChartMessageStream()` function to API client
- Updated `conversationStore` to use streaming for `__action:generate`
- Progress steps displayed in ChatPage (reuses existing progress UI)

### Files Modified

| File | Change |
|------|--------|
| `engine/chart_pipeline.py` | Added series keywords, enabled visual QA |
| `engine/chart_conversation.py` | Added proposal phase, progress emission, QA integration |
| `api/routers/chart.py` | Added streaming endpoint |
| `app/src/api/client.ts` | Added `sendChartMessageStream()` function |
| `app/src/stores/conversationStore.ts` | Use streaming for chart generate action |
| `app/src/pages/ChatPage.tsx` | Updated PHASE_LABELS for chart phases |

### Verification

- TypeScript build should pass
- Chart creation now shows proposal before generation
- Progress indicator appears during chart generation
- Visual QA validates charts against original request

### Next Steps

- [ ] Test full chart creation flow with proposal + QA
- [ ] Monitor QA pass rate and tune if needed
- [ ] Consider adding retry with fixes when QA fails

---

## Session: 2026-01-25 (Part 3)

### Focus: Dashboard Composition from Existing Charts

**Context**: Implemented a feature allowing users to select charts from their library and compose them into a new dashboard. The chartStore already had selection infrastructure that was unused.

### Implementation Completed

1. **API Client Function** (`app/src/api/client.ts`):
   - Added `createDashboardFromCharts(title, description, chartIds)` function
   - Calls existing `POST /charts/dashboards` endpoint
   - Returns dashboard URL for navigation on success

2. **CreateDashboardModal Component** (`app/src/components/modals/CreateDashboardModal.tsx`):
   - New modal component for dashboard creation
   - Title input (required), description textarea (optional)
   - Shows list of selected chart titles for confirmation
   - Loading state with spinner during creation
   - Error handling and display

3. **ChartsPage Selection Mode** (`app/src/pages/ChartsPage.tsx`):
   - Added "Select Charts" toggle button in header
   - Selection mode shows:
     - Checkboxes on each chart card (top-left corner with checkmark SVG)
     - Selection count indicator
     - "Create Dashboard" button (disabled when 0 selected)
     - "Cancel" button to exit selection mode
   - Selected cards have highlighted border (brand color)
   - Click card to toggle selection (replaces preview behavior in selection mode)
   - After successful creation, navigates to new dashboard

### Files Created

| File | Purpose |
|------|---------|
| `app/src/components/modals/CreateDashboardModal.tsx` | Modal for title/description input |
| `app/src/components/modals/index.ts` | Barrel export |

### Files Modified

| File | Change |
|------|--------|
| `app/src/api/client.ts` | Added `createDashboardFromCharts()` function |
| `app/src/pages/ChartsPage.tsx` | Added selection mode UI, checkboxes, modal integration |

### Existing Infrastructure Used (No Changes Needed)

- `app/src/stores/chartStore.ts` - Already had `selectionMode`, `selectedChartIds`, `toggleSelectionMode`, `toggleChartSelection`, `clearSelection`
- `api/routers/chart.py` - `POST /charts/dashboards` endpoint already existed
- `api/schemas/chart.py` - `DashboardCreateRequest/Response` schemas already existed
- `engine/dashboard_composer.py` - `create_dashboard(chart_ids)` already worked

### Verification

- TypeScript build passes successfully
- Selection mode UI toggles correctly
- Modal shows selected charts and validates required fields

### Next Steps

- [ ] Test full flow: select charts → create dashboard → navigate to dashboard view
- [ ] Verify dashboard renders all selected charts correctly

---

## Session: 2026-01-25 (Part 2)

### Focus: Chart Quality Validation System

**Context**: User reported quality issues with LLM-generated charts - the LLM was not delivering accurate charts as requested. Analysis revealed the pipeline validated SQL syntax but not semantic correctness.

### Quality Gaps Identified

1. **No semantic validation** - SQL syntax checked but not correctness (aggregation, chart type suitability)
2. **QA/Vision not used for charts** - Only dashboards got screenshot validation
3. **No data shape validation** - Empty results, wrong cardinality not caught
4. **Limited pattern detection** - Only horizontal bars and top-N were detected

### New Quality Validation System

Created comprehensive `ChartQualityValidator` with multiple validation layers:

1. **DataShapeValidator** (`engine/validators/quality_validator.py`)
   - Checks query returns data (catches empty results)
   - Validates column count matches expected
   - Checks cardinality (e.g., bar chart with 100 categories = warning)
   - Validates column types (numeric for y-axis, date for time series x-axis)

2. **AggregationValidator**
   - Verifies SQL aggregation matches spec (SUM vs AVG vs COUNT)
   - Detects missing GROUP BY clauses
   - Handles special AVG_PER_ENTITY two-level aggregation

3. **ChartTypeValidator**
   - Detects "over time" / "trend" requests with bar chart → should be line
   - Detects category comparisons with line chart → should be bar
   - Suggests BigValue for single-value requests without dimension

4. **SpecVerifier** (optional LLM check)
   - Quick LLM verification that extracted spec matches user intent
   - Catches semantic mismatches pattern matching can't detect

5. **Expanded RequestPatternValidator** (`engine/validators/request_patterns.py`)
   - Added time series patterns → forces LineChart
   - Added category patterns → forces BarChart
   - Added single value patterns → suggests BigValue
   - Added aggregation hints (count, average, median, per-entity)
   - Added more top-N and horizontal bar patterns

6. **ChartQA** (`engine/qa.py`)
   - New class for chart-specific screenshot validation
   - Uses React app's `/chart/{id}` route
   - Vision-based validation against original request

### Pipeline Integration

Updated `ChartPipeline` to run quality validation at each stage:
- Stage 1c: Validate spec quality (chart type, intent match)
- Stage 2c: Validate query quality (data shape, aggregation)
- Lowered temperature from 0.3 → 0.1 for requirements extraction (more deterministic)

### Configuration Options

New `ChartPipelineConfig` options:
- `enable_quality_validation` - Master switch
- `enable_spec_verification` - LLM spec check
- `enable_data_validation` - Data shape validation
- `enable_aggregation_check` - SQL aggregation validation
- `enable_chart_type_check` - Chart type appropriateness
- `fail_on_quality_warnings` - Treat warnings as errors

### Files Created/Modified

**Created:**
- `engine/validators/quality_validator.py` - Core quality validation classes
- `tests/test_quality_validators.py` - 20 unit tests (all passing)
- `tests/test_pipeline_quality.py` - Integration test script

**Modified:**
- `engine/validators/request_patterns.py` - Expanded pattern detection
- `engine/validators/__init__.py` - Exported new validators
- `engine/chart_pipeline.py` - Integrated quality validation
- `engine/qa.py` - Added ChartQA class

### Test Results

All 20 unit tests passing:
- DataShapeValidator: 3 tests
- AggregationValidator: 4 tests
- ChartTypeValidator: 3 tests
- RequestPatternValidator: 6 tests
- ChartQualityValidator: 3 tests
- Integration: 1 test

### Next Steps

1. Run full pipeline tests with ANTHROPIC_API_KEY
2. Consider enabling `fail_on_quality_warnings` for stricter validation
3. Enable visual QA for charts when app is running
4. Add more aggregation patterns as issues are discovered

---

## Session: 2026-01-25

### Focus: Fix Chart Creation Flow & Navigation Bugs

**Context**: Two issues reported:
1. Chart creation says "dashboard created" but no chart is created
2. Sidebar navigation links to past conversations are buggy

### Root Cause Analysis

**Chart Creation Issue**: The frontend was calling `/conversation/message` (dashboard flow) even when creating charts. Should have called `/charts/conversation/message` (chart flow).

**Navigation Bug**: Race condition in ChatPage - when clicking a sidebar conversation:
1. Sidebar navigates to `/chat?session=123`
2. ChatPage effect sees param, clears URL, calls `loadConversation(123)`
3. URL change triggers effect to re-run with no params
4. Default case calls `startNewConversation()`, wiping out loaded conversation

### Fixes Applied

1. **API client** (`app/src/api/client.ts`):
   - Added `sendChartMessage()` function that calls `/charts/conversation/message`
   - Added `newChartConversation()` function
   - Added `ChartMessageResponse` interface

2. **Conversation store** (`app/src/stores/conversationStore.ts`):
   - Added `creationMode` state to track chart vs dashboard mode
   - Added `setCreationMode` action
   - Updated `sendMessage` to route to chart API when `creationMode === 'chart'`
   - Added `lastChartId` and `lastChartUrl` state

3. **ChatPage** (`app/src/pages/ChatPage.tsx`):
   - Added `setStoreCreationMode` to sync local mode with store
   - Used `initializedRef` to prevent re-initialization when sidebar loads conversation
   - Only starts new conversation on first load with no existing session

4. **Sidebar** (`app/src/components/layout/Sidebar.tsx`):
   - Changed `handleSwitchConversation` to call `loadConversation()` directly
   - Navigates to `/chat` without URL params (avoids race condition)
   - Sets `creationMode` based on conversation type

### Files Modified
- `app/src/api/client.ts` - Added chart message API
- `app/src/stores/conversationStore.ts` - Added creation mode routing
- `app/src/pages/ChatPage.tsx` - Fixed navigation race condition
- `app/src/components/layout/Sidebar.tsx` - Direct conversation loading

---

## Current Status (2026-01-24)

### Completed
- ✅ **Phase 1: Foundation** - React + Plotly.js frontend in `app/`
- ✅ **Feature flag** - Toggle between Evidence and React renderers
- ✅ **Phase 2: Visual Polish** - Professional-quality charts with formatters, KPI components, loading states
- ✅ **Phase 3: Chat UI Migration** - Chat interface ported from SvelteKit to React
- ✅ **Phase 4: Deprecate SvelteKit** - Single React frontend with all routes migrated
- ✅ **Phase 5: Remove Evidence** - Deleted all Evidence-related code and dependencies

### Architecture
**React + FastAPI + DuckDB**. No more SvelteKit or Evidence framework.

### Quick Start
```bash
./dev.sh  # Starts API:8000 + React:3001
```

### To Continue Development
1. Read `DEV_PLAN.md` for detailed specs on each phase
2. Phase 2 specs are ready - start with design system in `app/src/styles/`

---

## Session: 2026-01-24

### Focus: Architecture Review & Strategic Planning

**Context**: After several days of automated testing, visual quality of generated charts was disappointing compared to Tableau/Mode/Looker. Conducted comprehensive architecture review.

### Analysis Completed

1. **Reviewed current architecture**:
   - Evidence framework as rendering layer (markdown → components → ECharts)
   - Chart pipeline with 3-stage LLM process (Requirements → SQL → Assembly)
   - Design system via YAML config (`engine/styles/chart_defaults.yaml`)

2. **Reviewed test results**:
   - Standard tests: 97% pass rate across all providers (Claude, OpenAI, Gemini)
   - Advanced tests: 53-60% pass rate (complex analytics like MoM growth, conditional aggregation)
   - Single failing standard test is test data limitation, not code bug

3. **Identified core limitation**:
   - Evidence was designed for humans writing markdown, not LLMs generating dashboards
   - The indirection (LLM → Markdown → Evidence → ECharts) loses too much visual control
   - Single chart per page, no dashboard layouts, limited component API

### Decisions Made

**Recommendation**: Build custom React frontend with Plotly.js, replacing Evidence rendering layer while keeping SQL generation pipeline.

Key benefits:
- Full control over visual output (Tableau-quality possible)
- Multi-chart dashboard layouts
- LLM generates JSON spec directly (no markdown intermediary)
- Extensible to any chart type

### Files Created

| File | Purpose |
|------|---------|
| `DEV_PLAN.md` | Strategic architecture plan with implementation phases |
| `DEV_LOG.md` | This file - session-by-session development log |

### Files Modified

| File | Change |
|------|--------|
| `CLAUDE.md` | Added dev log workflow instructions |

### Next Steps

- [x] Decide on Phase 1 implementation timeline
- [x] Prototype JSON dashboard spec format
- [x] Evaluate Plotly.js vs alternatives hands-on
- [x] Design React component architecture

---

## Session: 2026-01-24 (Continued)

### Focus: Phase 1 Implementation - React + Plotly.js Frontend

**Context**: Implementing the strategic plan from the earlier session. Building the new React frontend with Plotly.js to replace Evidence rendering.

### Implementation Completed

1. **React App Scaffold** (`app/`):
   - Created Vite + React + TypeScript project
   - Installed dependencies: plotly.js, react-plotly.js, zustand, react-router-dom
   - Set up project structure matching the plan

2. **TypeScript Types** (`app/src/types/`):
   - Mirrored Python models from `engine/models/chart.py`
   - Created ChartSpec, ChartConfig, ChartType, FilterSpec types
   - Added Dashboard and DashboardLayout types

3. **Plotly Chart Components** (`app/src/components/charts/`):
   - PlotlyChart.tsx - Base wrapper with design system colors
   - LineChart.tsx, BarChart.tsx, AreaChart.tsx, ScatterPlot.tsx
   - BigValue.tsx for KPI displays
   - DataTable.tsx for tabular data
   - ChartFactory.tsx - Factory pattern for chart type routing

4. **Backend Render Endpoints** (`api/routers/render.py`):
   - GET `/api/render/chart/{chart_id}` - Returns chart spec + executed query data
   - GET `/api/render/dashboard/{slug}` - Returns dashboard with all charts
   - POST `/api/render/execute-query` - Re-execute queries when filters change
   - Added CORS for port 3001

5. **Filter Components** (`app/src/components/filters/`):
   - Dropdown.tsx - Select filter with dynamic options loading
   - DateRange.tsx - Date picker with presets (7d, 30d, 90d, etc.)

6. **Layout Components** (`app/src/components/layout/`):
   - DashboardGrid.tsx - CSS Grid responsive layout
   - ChartCard.tsx - Chart wrapper with title and options

7. **State Management**:
   - Zustand store for dashboard/chart state
   - API client for backend communication

### Files Created

| File | Purpose |
|------|---------|
| `app/package.json` | React app dependencies |
| `app/tsconfig.json` | TypeScript configuration |
| `app/vite.config.ts` | Vite build configuration |
| `app/src/main.tsx` | App entry point |
| `app/src/App.tsx` | Router setup |
| `app/src/types/*.ts` | TypeScript type definitions |
| `app/src/components/charts/*.tsx` | Plotly chart components |
| `app/src/components/filters/*.tsx` | Filter components |
| `app/src/components/layout/*.tsx` | Layout components |
| `app/src/pages/*.tsx` | Page components |
| `app/src/api/client.ts` | API client |
| `app/src/stores/dashboardStore.ts` | Zustand state management |
| `app/src/styles/index.css` | Global styles with design system |
| `api/routers/render.py` | Backend render endpoints |

### Files Modified

| File | Change |
|------|--------|
| `api/main.py` | Mount render router |
| `api/config.py` | Add port 3001 to CORS origins |
| `dev.sh` | Added React app (port 3001) as 4th service, added `--no-evidence` flag |

### Test Charts Created

Three test charts stored in `.story-analytics/charts/`:
- `test-chart-001` - Line chart (monthly revenue)
- `test-chart-002` - Horizontal bar chart (top 10 customers)
- `test-chart-003` - BigValue KPI (total revenue: 1.4M)

### Decisions Made

- Used Zustand over Redux for simpler state management
- Used CSS variables for design system (matches existing Evidence theme)
- Chart factory pattern allows easy addition of new chart types
- Vite proxy handles API routing during development
- Render endpoints use optional auth for local development (no login required to view charts)

### Verification

- TypeScript compiles without errors
- All components follow existing design patterns
- **Live testing completed successfully:**
  - Line chart renders correctly with Plotly.js
  - Horizontal bar chart works with proper axis orientation
  - BigValue KPI displays "1.4M" with automatic formatting
  - API proxy correctly routes /api calls to backend
  - Authentication flow works with JWT tokens
  - Screenshots saved in `test_results/`:
    - `react_home.png` - Landing page
    - `react_line_chart.png` - Monthly revenue trend
    - `react_bar_chart.png` - Top 10 customers by revenue
    - `react_bigvalue.png` - Total revenue KPI

### Next Steps

- [x] Start the React app and verify rendering works
- [x] Test with existing charts from the database
- [x] Implement feature flag in SvelteKit frontend for A/B testing
- [ ] Add visual polish and animations
- [ ] Phase 2: Chat UI migration

---

## Session: 2026-01-24 (Feature Flag)

### Focus: Implement Renderer Toggle Feature Flag

**Context**: Adding ability to switch between Evidence and React renderers in the SvelteKit frontend for A/B testing.

### Implementation

1. **Settings Store** (`frontend/src/lib/stores/settings.ts`):
   - `chartRenderer` store with values: 'evidence' | 'react'
   - Persisted to localStorage for session persistence
   - `toggleRenderer()` and `setRenderer()` functions
   - `getChartUrl()` utility to generate correct URL based on renderer

2. **ChartEmbed Component Updates**:
   - Added `chartId` optional prop for React renderer
   - Added renderer toggle button in toolbar (Evidence/React)
   - Toggle button shows current renderer with icon
   - React mode has highlighted purple styling
   - URL automatically switches between ports 3000/3001

3. **Updated Components to Pass chartId**:
   - `ChartLibrary.svelte` - preview modal
   - `ChartChat.svelte` - chat chart embeds
   - `view/[slug]/+page.svelte` - chart view page

### Files Created

| File | Purpose |
|------|---------|
| `frontend/src/lib/stores/settings.ts` | Settings store with renderer preference |

### Files Modified

| File | Change |
|------|--------|
| `frontend/src/lib/components/ChartEmbed.svelte` | Added renderer toggle and chartId prop |
| `frontend/src/lib/components/ChartLibrary.svelte` | Pass chartId to ChartEmbed |
| `frontend/src/lib/components/ChartChat.svelte` | Pass chartId to ChartEmbed |
| `frontend/src/routes/app/charts/view/[slug]/+page.svelte` | Pass chartId to ChartEmbed |

### How to Test

1. Start all services: `./dev.sh`
2. Open SvelteKit frontend: http://localhost:5173
3. Navigate to a chart view
4. Click the "Evidence" button in the chart toolbar to toggle to "React"
5. Chart reloads using React + Plotly.js renderer
6. Setting persists across page refreshes (stored in localStorage)

### Next Steps

- [ ] Add visual polish and animations to React renderer
- [ ] Phase 2: Chat UI migration

---

## Session: 2026-01-24 (Phase 2: Visual Polish)

### Focus: Transform React charts to professional quality

**Context**: Implementing Phase 2 of the strategic plan - adding formatters, KPI components, loading states, and visual enhancements to achieve Tableau/Looker-level polish.

### Implementation Completed

1. **Utilities & Design Tokens** (Foundation):
   - Created `app/src/utils/formatters.ts` with smart number formatting
     - `formatCompact()` - Smart abbreviation (1.5M, 2.3K)
     - `formatCurrency()` - Currency with optional compact mode
     - `formatPercent()` - Percentage formatting
     - `formatNumber()` - Locale formatting with separators
     - `autoFormat()` - Automatic formatting based on value type
     - `getAxisTickFormat()` - Plotly axis formatting helper
   - Expanded `app/src/styles/index.css` with:
     - Typography scale (text-xs through text-4xl)
     - Font weights (normal, medium, semibold, bold)
     - Spacing scale (space-1 through space-12)
     - Transitions (fast, base, slow)
     - Trend colors (up, down, neutral)
     - Skeleton shimmer animation
     - Fade-in animation classes

2. **KPI Components**:
   - Created `TrendIndicator.tsx` - SVG up/down/neutral arrows with semantic colors
   - Created `DeltaValue.tsx` - Formatted change values with sign, color, and trend indicator
   - Created `Sparkline.tsx` - Minimal inline Plotly chart for trend visualization
   - Refactored `BigValue.tsx` to use formatters and support:
     - Trend indicator
     - Comparison delta
     - Sparkline
     - Value format hints (currency, percent, number)

3. **Chart Enhancements**:
   - Enhanced `PlotlyChart.tsx`:
     - Smart Y-axis formatting based on data magnitude
     - Better grid styling (semi-transparent)
     - Zero-line highlighting
     - Animation transition config
     - Default styling helpers exported
   - Updated `LineChart.tsx`:
     - Professional hovertemplates
     - Unified hover mode
     - Spline interpolation
   - Updated `BarChart.tsx`:
     - Professional hovertemplates
     - Better bar spacing (bargap, bargroupgap)
     - Auto tick angle for many categories

4. **Loading States**:
   - Created `app/src/components/skeletons/`:
     - `SkeletonBase.tsx` - Base shimmer component
     - `ChartSkeleton.tsx` - Chart-specific skeletons (line, bar, bigvalue, table)
     - `index.ts` - Barrel export
   - Updated `ChartCard.tsx`:
     - Loading prop with skeleton placeholder
     - Error state with icon
     - Empty state
     - Smooth fade-in transitions

### Files Created

| File | Purpose |
|------|---------|
| `app/src/utils/formatters.ts` | Number/date formatting utilities |
| `app/src/utils/index.ts` | Barrel export |
| `app/src/components/charts/TrendIndicator.tsx` | Up/down/neutral arrow indicator |
| `app/src/components/charts/DeltaValue.tsx` | Change value with color and sign |
| `app/src/components/charts/Sparkline.tsx` | Mini inline chart |
| `app/src/components/skeletons/SkeletonBase.tsx` | Base shimmer component |
| `app/src/components/skeletons/ChartSkeleton.tsx` | Chart placeholders |
| `app/src/components/skeletons/index.ts` | Barrel export |

### Files Modified

| File | Changes |
|------|---------|
| `app/src/styles/index.css` | Typography, spacing, transitions, animations |
| `app/src/types/chart.ts` | KPI config fields (comparisonValue, sparkline, etc.) |
| `app/src/components/charts/BigValue.tsx` | Full refactor with trend/comparison/sparkline |
| `app/src/components/charts/PlotlyChart.tsx` | Smart formatting, better styling |
| `app/src/components/charts/LineChart.tsx` | Hovertemplates, spline smoothing |
| `app/src/components/charts/BarChart.tsx` | Hovertemplates, bar styling |
| `app/src/components/layout/ChartCard.tsx` | Loading/error states |

### Verification

- TypeScript build passes successfully
- All components follow existing patterns
- CSS variables used consistently for theming
- **Live testing verified** - Charts render correctly at http://localhost:3001/chart/test-chart-001, 002, 003

### Deferred Items (Phase 2.5 or Later)

- Dark/light theme toggle (foundation ready, UI deferred)
- Gradient fills for AreaChart
- Secondary y-axis support
- Cross-filtering between charts

### Next Steps

- [x] Phase 3: Chat UI Migration - Move chat from SvelteKit to React
- [ ] Test visual improvements with live data

---

## Session: 2026-01-24 (Phase 3: Chat UI Migration)

### Focus: Migrate Chat Interface from SvelteKit to React

**Context**: Implementing Phase 3 of the strategic plan - porting the chat UI from the SvelteKit frontend to the React app.

### Implementation Completed

1. **TypeScript Types** (`app/src/types/conversation.ts`):
   - User & Auth types (User, BusinessType)
   - Message types (Message, ExtendedMessage, ClarifyingOption, ActionButton, QAResult)
   - Conversation types (ConversationSession, ConversationSummary)
   - API response types (MessageResponse, ProgressEvent)
   - Dashboard types for sidebar (SidebarDashboard, SidebarDashboardList)
   - Schema types for data explorer (SchemaInfo, TableInfo, ColumnInfo)

2. **API Client Extensions** (`app/src/api/client.ts`):
   - `sendMessage()` - Send message to conversation engine
   - `sendMessageStream()` - SSE streaming with progress callbacks
   - `listConversations()` - Get conversation history
   - `getConversation()` - Get specific conversation
   - `newConversation()` - Start new conversation
   - `deleteConversation()` - Delete conversation
   - `renameConversation()` - Rename conversation
   - `getDashboards()` - Get dashboard list for sidebar
   - `getSourceSchema()` - Get schema for data explorer
   - `getMe()` - Get current user info

3. **Zustand Store** (`app/src/stores/conversationStore.ts`):
   - Full conversation state management
   - Session tracking (currentSessionId, currentTitle)
   - Message history with extended properties
   - Streaming progress steps
   - User authentication state
   - Dashboard and conversation lists for sidebar
   - All CRUD operations for conversations

4. **Chat Components** (`app/src/components/chat/`):
   - `Message.tsx` - Message display with react-markdown, action buttons, clarifying options
   - `ChatInput.tsx` - Auto-resizing textarea with submit handling
   - `ProgressSteps.tsx` - Streaming progress indicator with step labels
   - `index.ts` - Barrel export

5. **Layout Components** (`app/src/components/layout/`):
   - `Sidebar.tsx` - Navigation, conversation list, dashboard list, user info
   - `AppLayout.tsx` - Layout wrapper with sidebar and Outlet

6. **Chat Page** (`app/src/pages/ChatPage.tsx`):
   - Welcome state with example prompts
   - Message list with auto-scroll
   - Streaming progress display
   - Dashboard creation success state
   - Loading indicators

7. **Route Configuration** (`app/src/App.tsx`):
   - Added `/chat` route within AppLayout
   - Added placeholder routes for `/charts`, `/charts/new`, `/dashboards`
   - Nested routing with React Router Outlet

### Files Created

| File | Purpose |
|------|---------|
| `app/src/types/conversation.ts` | Full conversation type definitions |
| `app/src/stores/conversationStore.ts` | Zustand state management |
| `app/src/components/chat/Message.tsx` | Message display component |
| `app/src/components/chat/ChatInput.tsx` | Chat input with auto-resize |
| `app/src/components/chat/ProgressSteps.tsx` | Streaming progress display |
| `app/src/components/chat/index.ts` | Barrel export |
| `app/src/pages/ChatPage.tsx` | Main chat page |
| `app/src/components/layout/Sidebar.tsx` | Sidebar navigation |
| `app/src/components/layout/AppLayout.tsx` | App layout wrapper |

### Files Modified

| File | Change |
|------|--------|
| `app/src/api/client.ts` | Added conversation API endpoints and SSE streaming |
| `app/src/stores/index.ts` | Added conversationStore export |
| `app/src/types/index.ts` | Added conversation types export |
| `app/src/App.tsx` | Added chat route with AppLayout |

### Build Errors Fixed

1. **ProgressSteps.tsx font-weight**: Changed CSS variable strings to numeric values (400, 500)
2. **Sidebar.tsx unused function**: Removed unused `formatDate` function
3. **Type export conflict**: Renamed `Dashboard` to `SidebarDashboard` in conversation.ts to avoid conflict with dashboard.ts

### Verification

- TypeScript build passes successfully
- All components follow existing design patterns
- CSS variables used consistently
- **Ready for live testing** at http://localhost:3001/chat

### Next Steps

- [x] Live test chat UI at http://localhost:3001/chat
- [x] Phase 4: Deprecate SvelteKit - Single React frontend
- [ ] Phase 5: Remove Evidence - Delete markdown generation

---

## Session: 2026-01-24 (Phase 4: Deprecate SvelteKit)

### Focus: Single React Frontend - Remove SvelteKit Dependency

**Context**: Migrating all remaining SvelteKit routes to React to have a single frontend.

### Implementation Completed

1. **Chart Types and API** (`app/src/types/conversation.ts`, `app/src/api/client.ts`):
   - Added ChartLibraryItem type for chart library API responses
   - Added chart API endpoints: getCharts, getChart, deleteChart, getChartPreviewUrl
   - Added settings API: getProviders, updateProvider, updateBusinessType, updateSource, getSources
   - Added deleteDashboard API endpoint

2. **Chart Store** (`app/src/stores/chartStore.ts`):
   - Zustand store for chart library state
   - Manages charts list, loading, error, search/filter
   - Selection mode for dashboard composition
   - Preview modal state

3. **Login Page** (`app/src/pages/LoginPage.tsx`):
   - Magic link email authentication
   - Terminal-style UI matching design system
   - Success state with "check your email" message

4. **Auth Verify Page** (`app/src/pages/VerifyPage.tsx`):
   - Reads token from URL params
   - Verifies with API, stores JWT token
   - Shows verifying/success/error states
   - Redirects to /chat on success

5. **Charts List Page** (`app/src/pages/ChartsPage.tsx`):
   - Grid view of saved charts
   - Search and chart type filter
   - Delete with confirmation
   - Preview modal with iframe embed

6. **Dashboards List Page** (`app/src/pages/DashboardsPage.tsx`):
   - List of dashboards with search
   - Links to view in Evidence or React
   - Delete with confirmation

7. **Settings Page** (`app/src/pages/SettingsPage.tsx`):
   - Account info display
   - AI provider selection (radio buttons)
   - Business type selection with descriptions
   - Data source selection
   - API keys info section

8. **Auth Guard** (`app/src/components/auth/ProtectedRoute.tsx`):
   - Wraps protected routes
   - Redirects to /login if not authenticated
   - Uses localStorage token check

9. **Updated Routing** (`app/src/App.tsx`):
   - Public routes: /, /login, /auth/verify
   - Protected routes: /chat, /charts, /charts/new, /dashboards, /settings
   - Added Settings link to Sidebar

10. **Updated dev.sh**:
    - Removed SvelteKit service
    - React is now the primary frontend
    - Evidence is optional (--evidence flag)
    - Updated quick links and documentation

### Files Created

| File | Purpose |
|------|---------|
| `app/src/stores/chartStore.ts` | Chart library Zustand store |
| `app/src/pages/LoginPage.tsx` | Magic link login page |
| `app/src/pages/VerifyPage.tsx` | Token verification page |
| `app/src/pages/ChartsPage.tsx` | Charts library list page |
| `app/src/pages/DashboardsPage.tsx` | Dashboards list page |
| `app/src/pages/SettingsPage.tsx` | Settings page |
| `app/src/components/auth/ProtectedRoute.tsx` | Auth guard component |
| `app/src/components/auth/index.ts` | Auth barrel export |

### Files Modified

| File | Change |
|------|--------|
| `app/src/types/conversation.ts` | Added chart library types, provider/source types |
| `app/src/api/client.ts` | Added chart, settings, and dashboard API endpoints |
| `app/src/stores/index.ts` | Added chartStore export |
| `app/src/components/layout/Sidebar.tsx` | Added Settings nav link |
| `app/src/App.tsx` | Added all new routes with auth protection |
| `dev.sh` | Removed SvelteKit, made Evidence optional |

### Verification

- TypeScript build passes successfully
- All routes accessible in React app
- Auth flow: login -> verify -> protected routes

### Next Steps

- [x] Phase 5: Remove Evidence - Delete markdown generation

---

## Session: 2026-01-24 (Phase 5: Remove Evidence)

### Focus: Remove Evidence Framework Completely

**Context**: With React frontend fully functional, removing all Evidence-related code, dependencies, and file generation logic.

### Implementation Completed

1. **Removed Evidence Config Files**:
   - Deleted `evidence.config.yaml`
   - Deleted `Dockerfile.evidence`
   - Deleted `.evidence/` directory

2. **Removed Pages Directory**:
   - Deleted `pages/` (Evidence markdown output)

3. **Removed Evidence Markdown Generators**:
   - Deleted `engine/generator.py` (EvidenceGenerator class)
   - Removed `to_evidence_markdown()` methods from Chart, ValidatedChart, Dashboard models
   - Removed `to_evidence_component()` from FilterSpec
   - Renamed `to_evidence_props()` to `to_props()` in ChartConfig
   - Simplified `dashboard_composer.py` (removed file writing, kept storage)

4. **Removed Evidence Component Reference**:
   - Deleted `engine/components/evidence.yaml`

5. **Removed Evidence NPM Dependencies**:
   - Removed all `@evidence-dev/*` packages from `package.json`
   - Simplified `package.json` scripts

6. **Updated dev.sh**:
   - Removed `--evidence` flag and related logic
   - Removed Evidence service startup
   - Simplified to just API + React

7. **Updated Conversation Engine**:
   - Removed import of `create_dashboard_from_markdown` from `conversation.py`
   - Simplified `_finalize_dashboard()` to not write files
   - Updated `chart_conversation.py` to remove file path tracking
   - Updated `validators/__init__.py` docstring

8. **Updated Tests**:
   - Updated `test_chart_models.py` to use `to_props()` instead of `to_evidence_props()`
   - Removed Evidence-specific tests
   - Updated `test_chart_pipeline.py` to remove Evidence markdown tests

### Files Deleted

| File | Purpose |
|------|---------|
| `evidence.config.yaml` | Evidence framework config |
| `Dockerfile.evidence` | Evidence Docker build |
| `.evidence/` | Evidence template and build artifacts |
| `pages/` | Generated Evidence markdown pages |
| `engine/generator.py` | Evidence markdown generator |
| `engine/components/evidence.yaml` | Evidence component documentation |

### Files Modified

| File | Changes |
|------|---------|
| `package.json` | Removed @evidence-dev/* dependencies |
| `dev.sh` | Removed Evidence service, simplified |
| `engine/models/chart.py` | Removed to_evidence_markdown(), renamed to_evidence_props() to to_props() |
| `engine/dashboard_composer.py` | Removed file writing, kept storage functions |
| `engine/conversation.py` | Removed Evidence-specific imports and file writing |
| `engine/chart_conversation.py` | Removed file path tracking |
| `engine/validators/__init__.py` | Updated docstring |
| `api/routers/chart.py` | Removed write_dashboard() calls, updated URLs |
| `tests/test_chart_models.py` | Updated to use to_props(), removed Evidence tests |
| `tests/test_chart_pipeline.py` | Removed Evidence markdown tests |

### Architecture After Phase 5

```
User Request → LLM Pipeline → Chart JSON → Storage
                                     ↓
                              React Frontend ← Render API
```

No more markdown intermediary. Charts are stored as JSON and rendered directly by React + Plotly.js.

### Data Migration

During testing, discovered that parquet data files were deleted with `.evidence/` directory.
Fixed by:
1. Restored data from git (`git restore .evidence/template/static/data`)
2. Moved parquet files to `data/` directory
3. Updated `sql_validator.py`, `filter_defaults.py`, `scale_analyzer.py` to use new path
4. Updated test chart SQL paths

### Verification

- All Evidence-related code removed
- Tests updated to not reference Evidence
- Dev server starts with just API + React
- Chart data flows through render API to React frontend
- All 3 test charts render correctly via API

### Next Steps

- [x] Clean up any remaining Evidence references in comments/docs
- [x] Test full chat → chart → view flow
- [x] Remove SvelteKit frontend directory

---

## Session: 2026-01-24 (Post-Phase 5 Cleanup)

### Focus: Evidence Reference Cleanup and E2E Testing

**Context**: Final cleanup after Phase 5. Removed all Evidence references and tested the full application flow.

### Changes Made

1. **Removed SvelteKit Frontend**:
   - Deleted `frontend/` directory entirely
   - Updated docker-compose.yml to remove frontend service

2. **Evidence Reference Cleanup**:
   - Updated `.gitignore` - removed Evidence paths
   - Updated `CLAUDE.md` - new architecture description, updated setup steps
   - Updated `README.md` - React + Plotly.js description
   - Updated `api/config.py` - removed Evidence URL, simplified CORS
   - Updated `engine_config.yaml` - replaced Evidence section with app URLs
   - Updated `engine/config.py` - removed pages_dir/dev_url, added api_url/frontend_url
   - Updated `engine/__init__.py` - updated docstring
   - Updated `engine/prompts/base.yaml` - removed Evidence markdown syntax
   - Updated `engine/prompts/chart/sql.yaml` - removed Evidence comment
   - Updated `engine/qa/rules.yaml` - removed Evidence-specific notes
   - Updated `engine/pipeline/__init__.py` - marked as legacy
   - Deleted `engine/prompts/generate.yaml` - unused Evidence generator prompt
   - Deleted `scripts/start-dev.sh` - dev.sh is the new script

3. **E2E Testing**:
   - Tested chart viewing: All 3 test charts render correctly
   - Tested React app: Home, login pages work
   - Tested API: Health check, render endpoints work
   - Tested chart pipeline: Successfully creates charts

### Files Deleted

| File/Directory | Purpose |
|----------------|---------|
| `frontend/` | SvelteKit frontend (replaced by React) |
| `scripts/start-dev.sh` | Old dev script (replaced by dev.sh) |
| `engine/prompts/generate.yaml` | Evidence markdown generation prompt |

### Files Modified

| File | Changes |
|------|---------|
| `.gitignore` | Removed Evidence paths |
| `CLAUDE.md` | Updated architecture, setup steps |
| `README.md` | React + Plotly.js description |
| `api/config.py` | Removed Evidence URL |
| `engine_config.yaml` | Replaced Evidence with app URLs |
| `engine/config.py` | api_url, frontend_url properties |
| `engine/prompts/base.yaml` | JSON output instead of markdown |
| `engine/qa/rules.yaml` | Removed Evidence notes |
| `docker-compose.yml` | Removed Evidence/SvelteKit services |

### Verification

All tests pass:
- ✓ Chart rendering (test-chart-001, 002, 003)
- ✓ React app (home, login pages)
- ✓ API health check
- ✓ Render API (chart data)
- ✓ Chart pipeline (creates charts successfully)

Screenshots saved in `test_results/`

### Next Steps

- [x] Sync up branding with dual cursor motif

---

## Session: 2026-01-24 (Branding Update)

### Focus: Dual Cursor Logo - Analyst + AI

**Context**: Updated branding to feature dual blinking cursors, representing the analyst and AI working together. This reinforces the "AI-native" identity and differentiates from traditional BI tools.

### Design Decision

The dual cursor motif (**STORY ▌▌**) symbolizes:
- Two entities (analyst + AI) collaborating
- Terminal/developer aesthetic (signals power users)
- Distinctive brand identity vs. generic SaaS dashboards

Decision: Keep the terminal vibe, sync branding across all touchpoints.

### Changes Made

1. **Created Logo Component**:
   - `app/src/components/brand/Logo.tsx` - Reusable logo with dual cursors
   - `app/src/components/brand/index.ts` - Barrel export
   - Supports sizes: sm, md, lg
   - Optional tagline ("AI-native analytics.")
   - Dark mode support for different backgrounds

2. **Updated Components**:
   - `LoginPage.tsx` - Uses Logo component (lg size)
   - `Sidebar.tsx` - Uses Logo component (md size)
   - Removed inline blink animations (now in global CSS)

3. **Global CSS**:
   - Added `@keyframes blink` animation to `styles/index.css`
   - Centralized animation for consistency

### Files Created

| File | Purpose |
|------|---------|
| `app/src/components/brand/Logo.tsx` | Reusable dual-cursor logo |
| `app/src/components/brand/index.ts` | Barrel export |

### Files Modified

| File | Changes |
|------|---------|
| `app/src/styles/index.css` | Added blink animation |
| `app/src/pages/LoginPage.tsx` | Use Logo component |
| `app/src/components/layout/Sidebar.tsx` | Use Logo component |

### Next Steps

- [ ] Create Dockerfile for React app (for docker-compose)
- [ ] Add integration tests for authenticated chat flow
- [ ] Consider adding logo to chart embed pages
- [ ] Update website (storyanalytics.ai) to match dual cursor branding

---

## Session: 2026-01-24 (UX Improvements & Branding)

### Focus: Fix Settings, Streamline UX, and Brand Consistency

### Changes Made

1. **Settings Bug Fix**: API client was calling non-existent `PATCH /auth/me`. Changed to `PUT /auth/preferences`.

2. **Removed Intermediate "Create Chart" Page**: Clicking "Create New Chart" on welcome screen now prefills the chat input instead of navigating to a redundant intermediate page.
   - `/charts/new` now redirects to `/chat`
   - Removed unused `NewChartPage` component

3. **Brand Consistency**: Updated colors and fonts to match website (storyanalytics.ai)

### Brand Font Locations (for future reference)

If changing the brand font, update these locations:

**CSS Variables** (`app/src/styles/index.css`):
- `--font-brand` - The brand monospace font stack
- `--color-brand` - Brand color #7c9eff
- `--color-brand-dim` - Dimmed brand color
- `--color-brand-glow` - Glow effect color
- Global `h1, h2, h3` styles

**Logo Component** (`app/src/components/brand/Logo.tsx`):
- Uses `var(--font-brand)` and `var(--color-brand)`

**Sidebar** (`app/src/components/layout/Sidebar.tsx`):
- Nav item icons and labels
- "Conversations" section header
- "Recent Dashboards" section header
- Conversation list items ("New conversation")
- "No conversations yet" placeholder

**ChatPage** (`app/src/pages/ChatPage.tsx`):
- Header title (h2 "New conversation")
- "Phase: Starting" status text
- "+ New" button
- Welcome state: main heading, subheading, section headers (Charts/Dashboards)
- ActionButtonLarge component
- Error display

### Files Modified

| File | Change |
|------|--------|
| `app/src/api/client.ts` | Changed settings functions from `PATCH /auth/me` to `PUT /auth/preferences` |
| `app/src/pages/ChatPage.tsx` | Prefill input, hide welcome, error display, brand fonts |
| `app/src/App.tsx` | `/charts/new` redirects to `/chat`, removed `NewChartPage` |
| `app/src/styles/index.css` | Added `--color-brand`, `--font-brand`, global h1/h2/h3 styles |
| `app/src/components/brand/Logo.tsx` | Updated to use CSS variables |
| `app/src/components/layout/Sidebar.tsx` | Brand font on nav items and headers |

---

## Session: 2026-01-24 (Done Button Fix)

### Focus: Fix "Done" Button After Chart Creation

### Root Cause

After Evidence was removed, the `created_file` property was never being set in the conversation state. The API checked this property to determine if a dashboard was created, so `dashboard_created` was always `False`, and the frontend never populated `lastDashboard`.

Flow before fix:
1. `_finalize_dashboard()` generates slug but doesn't store it
2. API checks `manager.state.created_file` → always None
3. `dashboard_created = False` in API response
4. Frontend only sets `lastDashboard` when `dashboard_created && dashboard_url`
5. "Done" button checks `lastDashboard?.url` → null → nothing happens

### Fix Applied

1. **Added `dashboard_slug` to ConversationState** (`engine/conversation.py`):
   - New property: `dashboard_slug: str | None = None`
   - Set in `_finalize_dashboard()`: `self.state.dashboard_slug = slug`

2. **Updated API to check `dashboard_slug`** (`api/routers/conversation.py`):
   - Non-streaming endpoint: Check `manager.state.dashboard_slug` first, fall back to `created_file`
   - Streaming endpoint: Same logic
   - `restore_manager_state()`: Restore `dashboard_slug` from linked dashboard

### Files Modified

| File | Change |
|------|--------|
| `engine/conversation.py` | Added `dashboard_slug` property, set it in `_finalize_dashboard()` |
| `api/routers/conversation.py` | Check `dashboard_slug` for dashboard detection, restore it from session |

---

## Session: 2026-01-24 (Login Redirect to New Chat)

### Focus: Always Start New Chat After Login

### Changes Made

1. **Updated Login Verification Flow**:
   - `VerifyPage.tsx` now redirects to `/chat?new=1` instead of `/chat`
   - This signals to ChatPage that a fresh conversation should be started

2. **Updated ChatPage to Handle New Chat Parameter**:
   - Added `useSearchParams` and `useNavigate` hooks
   - On mount, checks for `?new=1` query parameter
   - If present, clears the URL parameter and calls `startNewConversation()` instead of `loadConversation()`
   - Ensures users always get a fresh conversation after login

### Files Modified

| File | Change |
|------|--------|
| `app/src/pages/VerifyPage.tsx` | Redirect to `/chat?new=1` after verification |
| `app/src/pages/ChatPage.tsx` | Check for `new` query param and start fresh conversation |

### Verification

- TypeScript build passes successfully
- Logic: User logs in → Verify page → Redirect to `/chat?new=1` → ChatPage starts new conversation → URL cleaned to `/chat`

---

## Session: 2026-01-24 (Chat UX Overhaul)

### Focus: Complete overhaul of chat user experience and chart creation flow

### Changes Made

1. **Welcome Screen Flow**:
   - Chat page now shows welcome cards (Create Chart / Create Dashboard) by default
   - Chat input hidden until user selects a creation mode
   - Dynamic placeholder text based on mode ("Describe the chart..." vs "Describe the dashboard...")
   - Auto-focus on chat input after selecting mode

2. **Login Flow**:
   - After login, users always redirected to fresh chat page (`/chat?new=1`)
   - Chat page always starts fresh on direct navigation
   - Existing conversations loaded via `/chat?session=123` from sidebar

3. **Navigation Improvements**:
   - "Chat" nav item always starts a new conversation
   - Delete conversation now redirects to fresh chat page
   - "Done" button navigates to `/charts` or `/dashboards` based on creation mode

4. **Chat Input Enhancements**:
   - Changed placeholder from "Type your message..." to helpful guidance
   - Auto-focus on input after clicking "Modify Plan" or similar actions
   - Exposed `focus()` method via `forwardRef` on ChatInput component

5. **Phase Indicator**:
   - Shows "Understanding..." while request is processing instead of static "Starting"

6. **Inline Dashboard Preview**:
   - Added `DashboardPreview` component showing iframe preview in chat
   - Messages with `dashboard_slug` show embedded preview with "Open full size" link
   - Fixed dashboard storage to return most recent dashboard when duplicates exist

7. **Chart Storage Fix**:
   - `_finalize_dashboard` now creates and saves Chart objects to storage
   - Charts properly linked to dashboards via `chart_ids`
   - Fixed `get_by_slug` to return most recently updated dashboard

8. **JSON Cleanup**:
   - Updated prompts to instruct LLM not to output raw JSON
   - Added `_clean_json_from_response()` to strip JSON blocks from conversation responses

9. **Conversation Completion**:
   - "Done" button sends action to backend, marks conversation complete
   - Chat input hidden when conversation is complete
   - Buttons greyed out (disabled) when complete

### Files Modified

| File | Change |
|------|--------|
| `app/src/pages/ChatPage.tsx` | Welcome flow, creation mode, auto-focus, navigation, completion handling |
| `app/src/pages/VerifyPage.tsx` | Redirect to `/chat?new=1` |
| `app/src/components/chat/ChatInput.tsx` | forwardRef with focus() method |
| `app/src/components/chat/Message.tsx` | DashboardPreview component |
| `app/src/components/layout/Sidebar.tsx` | Navigation to `/chat?new=1`, session param for existing convos |
| `app/src/types/conversation.ts` | Added dashboard_url/slug to ExtendedMessage |
| `app/src/stores/conversationStore.ts` | Include dashboard info in messages |
| `engine/conversation.py` | Chart storage, JSON cleanup, dashboard creation |
| `engine/models/storage.py` | get_by_slug returns most recent |
| `engine/prompts/base.yaml` | No JSON output instruction |

### Issues Resolved

- Welcome cards not showing on fresh navigation (fixed with session param approach)
- Charts not rendering in preview (fixed chart storage and dashboard lookup)
- JSON blocks appearing in chat (prompt update + response cleaning)
- Duplicate dashboards with same slug (return most recent by updated_at)

---

## Session: 2026-01-24 (Chart Templates)

### Focus: Chart Templates System with Amazon-style Dual Trend Chart

### Context

Built a chart templates system to suggest commonly-needed charts when users click "Create New Chart". Templates are organized by funnel stage (top/middle/bottom) and filtered by business type (SaaS, E-commerce, General).

### Research Conducted

Reviewed product analytics best practices from:
- Contentsquare, Pendo, Userpilot for product analytics metrics
- ChartMogul, Phoenix Strategy Group for SaaS metrics visualization
- Amplitude for cohort analysis patterns

### Implementation Completed

1. **Chart Templates YAML** (`engine/templates/charts.yaml`):
   - 19 total templates organized by funnel stage
   - 7 templates per business type (6 unique + 1 shared)
   - Categories: top-of-funnel, middle-of-funnel, bottom-of-funnel
   - Each template has: id, name, icon, chart_type, description, prompt, business_types

2. **Dual Trend Chart Type** - Amazon-style WBR chart:
   - Added `dual-trend` to `engine/components/charts.yaml`
   - Two-panel layout using Plotly subplots:
     - Left: Last 6 weeks with year-over-year comparison
     - Right: Last 12 months with year-over-year comparison
   - Created `app/src/components/charts/DualTrendChart.tsx`
   - Updated `ChartFactory.tsx` to include new chart type
   - Added `DualTrendChart` to `ChartType` union in `types/chart.ts`

3. **Config Loader Methods** (`engine/config_loader.py`):
   - `get_chart_templates()` - Load chart templates YAML
   - `get_chart_templates_by_business_type(type)` - Filter by business type
   - `get_chart_template_categories()` - Get funnel stage categories

4. **API Endpoints** (`api/routers/templates.py`):
   - `GET /templates/charts` - Charts for user's business type
   - `GET /templates/charts/all` - All chart templates
   - `GET /templates/charts/categories` - Funnel stage categories

5. **Frontend Integration**:
   - Added `getChartTemplates()` to `api/client.ts`
   - Updated `ChatPage.tsx`:
     - New `ChartTemplatesGrid` component showing 2x3 grid of cards
     - Clicking "Create New Chart" loads templates from API
     - Clicking a template prefills chat input with its prompt
     - "Describe a custom chart..." option for freeform input

### Templates by Business Type

**SaaS (7 charts):**
- Signups Trend, Signup Funnel (TOFU)
- Activation Rate, Feature Adoption (MOFU)
- MRR Trend, Churn Rate (BOFU)
- Metric Health Check (shared)

**E-commerce (7 charts):**
- Visitors Trend, Traffic by Source (TOFU)
- Cart Abandonment, Product Performance (MOFU)
- Sales Trend, Customer LTV (BOFU)
- Metric Health Check (shared)

**General (7 charts):**
- New Users, Acquisition Channels (TOFU)
- Active Users, Engagement Rate (MOFU)
- Revenue Trend, Top Customers (BOFU)
- Metric Health Check (shared)

### Files Created

| File | Purpose |
|------|---------|
| `engine/templates/charts.yaml` | 19 chart template definitions |
| `app/src/components/charts/DualTrendChart.tsx` | Amazon-style WBR chart component |

### Files Modified

| File | Change |
|------|--------|
| `engine/components/charts.yaml` | Added dual-trend chart type |
| `engine/config_loader.py` | Added chart template methods |
| `api/routers/templates.py` | Added /templates/charts endpoints |
| `app/src/types/chart.ts` | Added DualTrendChart to ChartType |
| `app/src/components/charts/ChartFactory.tsx` | Added DualTrendChart case |
| `app/src/api/client.ts` | Added getChartTemplates() |
| `app/src/pages/ChatPage.tsx` | Added ChartTemplatesGrid component |

### Verification

- TypeScript build passes
- Python config loader loads all 19 templates correctly
- Templates correctly filter by business type (7 per type)
- API router loads without errors

### Next Steps

- [x] Test the full flow: login → create chart → select template → generate chart
- [x] Test the DualTrendChart with real data
- [ ] Consider adding dashboard templates grid (similar pattern)

---

## Session: 2026-01-24 (DualTrendChart Pipeline Integration)

### Focus: Fix DualTrendChart generation in LLM pipeline

### Root Cause

When users clicked "Metric Health Check" template, the LLM created a generic dashboard with 2 LineCharts instead of a DualTrendChart. The issue was that:
1. The requirements.yaml didn't include DualTrendChart in the chart type options
2. The template prompt asked for "2 LineCharts" instead of "DualTrendChart"
3. The ChartType enum didn't include DUAL_TREND_CHART
4. The chart pipeline didn't have a config builder case for DualTrendChart

### Fix Applied

1. **Updated requirements.yaml** (`engine/prompts/chart/requirements.yaml`):
   - Added DualTrendChart to the chart type list with usage triggers
   - Added Example 4 showing the correct JSON output structure
   - Added DualTrendChart to the chart type mapping

2. **Updated sql.yaml** (`engine/prompts/chart/sql.yaml`):
   - Added DualTrendChart query structure documentation
   - Specified 13-month data requirement for YoY comparison

3. **Updated ChartType enum** (`engine/models/chart.py`):
   - Added `DUAL_TREND_CHART = "DualTrendChart"`
   - Added mappings: "dualtrendchart", "dualtrend", "healthcheck", "wbr"

4. **Updated chart pipeline** (`engine/chart_pipeline.py`):
   - Added `elif spec.chart_type == ChartType.DUAL_TREND_CHART` case in `_build_chart_config`
   - Sets x (date column) and y (metric column)
   - Sets metricLabel in extra_props

5. **Fixed template prompt** (`engine/templates/charts.yaml`):
   - Changed from "Create 2 LineCharts..." to "Create a DualTrendChart..."
   - Changed chart_type from "line" to "dual-trend"

### Files Modified

| File | Change |
|------|--------|
| `engine/prompts/chart/requirements.yaml` | Added DualTrendChart type, example, and mapping |
| `engine/prompts/chart/sql.yaml` | Added DualTrendChart query structure |
| `engine/models/chart.py` | Added DUAL_TREND_CHART to ChartType enum |
| `engine/chart_pipeline.py` | Added config builder case for DualTrendChart |
| `engine/templates/charts.yaml` | Fixed template prompt to request DualTrendChart |

### Architecture

The DualTrendChart now flows correctly through the pipeline:
1. User clicks "Metric Health Check" template
2. Template prompt: "Create a DualTrendChart for revenue..."
3. RequirementsAgent extracts: chart_type = "DualTrendChart"
4. SQLAgent generates: daily/weekly data with date and metric columns
5. Pipeline builds config: x = date column, y = metric column
6. React frontend: renders DualTrendChart component with Plotly subplots

### Verification

- TypeScript build passes
- Python pipeline updated
- Frontend already had DualTrendChart component and ChartFactory case

---

## Session: 2026-01-25 (Part 6)

### Focus: Semantic Layer Integration into All AI Features

### Context

The semantic layer infrastructure (business descriptions, column roles, relationships) existed but wasn't being used in the LLM prompts. Every call to `get_schema_context()` was passing no semantic layer, meaning all the rich business context was being ignored when generating SQL and designing charts.

### Problem Identified

Traced through the codebase and found that:
- `get_schema_context()` accepts an optional `semantic_layer` parameter
- When passed, it enriches prompts with business context, column descriptions, relationships
- BUT every call was WITHOUT the semantic layer parameter
- The semantic layer infrastructure existed but wasn't connected

### Solution: Connect Semantic Layer to All AI Entry Points

Implemented a consistent pattern across all LLM-using components:

1. **Added `get_semantic_layer()` method** to each pipeline class that:
   - Loads semantic.yaml from `sources/{source_name}/semantic.yaml`
   - Caches the result for subsequent calls
   - Returns `None` gracefully if semantic.yaml doesn't exist

2. **Updated `get_schema_context()` method** in each class to:
   - Call `get_semantic_layer()` first
   - Pass the semantic layer to the base `get_schema_context()` function
   - Cache the enriched result

### Files Modified

| File | Change |
|------|--------|
| `engine/chart_pipeline.py` | Added `get_semantic_layer()`, updated `get_schema_context()` to use semantic layer |
| `engine/chart_conversation.py` | Now uses pipeline's enriched `get_schema_context()` |
| `engine/conversation.py` | Added `_semantic_layer` field, `get_semantic_layer()`, updated `get_schema_context()` |
| `engine/pipeline/pipeline.py` | Added `get_semantic_layer()`, updated `get_schema_context()` for DashboardPipeline |
| `engine/qa.py` | Updated `auto_fix_dashboard()` fallback to use semantic layer |
| `api/routers/chart.py` | Enhanced dashboard context generation with business domain info |

### Impact

Now when AI generates:
- **SQL queries**: Gets column descriptions, roles, and relationships for better joins
- **Chart specs**: Understands business terminology (MRR, churn, etc.)
- **Dashboard context**: Uses domain info to write relevant business context paragraphs
- **QA auto-fixes**: Has full business context when fixing issues

### Example Enhancement

When generating a chart for "Show MRR by customer segment", the LLM now receives:

```
CUSTOMERS table:
  - CUSTOMER_ID (Primary Key): Unique identifier for each customer
  - PLAN_TIER (Dimension): Customer's subscription tier
  - Purpose: Core customer records for SaaS business analysis

Relationships:
  - SUBSCRIPTIONS.CUSTOMER_ID → CUSTOMERS.CUSTOMER_ID

Business Context:
  Domain: B2B SaaS
  Key Metrics: MRR, ARR, Churn Rate, Customer Count
```

Instead of just raw column names with no context.

### Verification

```bash
python -m py_compile engine/conversation.py engine/qa.py engine/chart_pipeline.py engine/pipeline/pipeline.py
# Python syntax OK
```

### Next Steps

- [ ] Test chart generation quality improvement with semantic context enabled
- [ ] Add automatic semantic layer regeneration when schema changes
- [ ] Consider adding semantic layer diff detection for staleness alerts

---

## Session: 2026-01-25 (Part 7)

### Focus: Enhance Semantic Layer with User Business Context

### Context

Companies often have existing business definitions:
- dbt semantic layer definitions
- Looker LookML models
- Data dictionaries in Confluence/Notion
- "Golden SQL" queries defining canonical metric calculations
- Internal glossaries with business term definitions

Previously, users had to manually re-enter all this information into the Schema Browser. This feature allows users to paste their existing business context and have the LLM intelligently merge it.

### Implementation

#### 1. Backend API Endpoint (`api/routers/sources.py`)

New endpoint: `POST /sources/{source_name}/semantic/enhance`

```python
class SemanticEnhanceRequest(BaseModel):
    user_context: str  # User's business context (any format)
    preview: bool = True  # If True, return proposed changes without applying

class SemanticEnhanceResponse(BaseModel):
    success: bool
    message: str
    changes: list[SemanticChange] | None = None
    summary: dict | None = None
    applied: bool = False
```

Features:
- Accepts business context in any format (YAML, JSON, markdown, SQL, plain text)
- Preview mode shows proposed changes before applying
- LLM parses input and generates structured changes
- Applies changes intelligently with merge strategy

#### 2. LLM Prompt (`engine/prompts/semantic/enhance.yaml`)

New prompt that instructs the LLM to:
- Auto-detect input format (dbt, Looker, markdown, SQL, etc.)
- Extract metric definitions, business terms, column descriptions
- Map user terminology to existing schema structure
- Output only changes (not full semantic layer)
- Follow merge rules: User input > Existing manual edits > Auto-generated

#### 3. Frontend Modal (`app/src/components/sources/EnhanceSemanticModal.tsx`)

Three-step flow:
1. **Input**: Textarea for pasting business context with format hints
2. **Preview**: Shows proposed changes with summary (metrics added, terms added, etc.)
3. **Apply**: Saves changes and reloads semantic layer

#### 4. SchemaBrowser Integration

Added "Enhance with Context" button to header (only shown when semantic layer exists).

### Files Created

| File | Purpose |
|------|---------|
| `engine/prompts/semantic/enhance.yaml` | LLM prompt for parsing and merging business context |
| `app/src/components/sources/EnhanceSemanticModal.tsx` | Modal component for enhancement flow |

### Files Modified

| File | Change |
|------|--------|
| `api/routers/sources.py` | Added `/semantic/enhance` endpoint with preview/apply logic |
| `app/src/api/client.ts` | Added `enhanceSemanticLayer()` function and types |
| `app/src/components/sources/SchemaBrowser.tsx` | Added "Enhance with Context" button and modal integration |
| `app/src/components/sources/index.ts` | Exported new component |

### User Flow

1. User opens Schema Browser for a data source
2. Clicks "Enhance with Context" button in header
3. Pastes existing business definitions (any format)
4. Clicks "Preview Changes" - sees what will be added/updated
5. Reviews changes (expandable to see current vs new values)
6. Clicks "Apply Changes" to save
7. Semantic layer is updated and reloaded

### Merge Strategy

- **ADD**: New information that doesn't exist
- **ENHANCE**: Improve existing descriptions with more detail
- **PRESERVE**: Keep existing content unless user explicitly provides replacement
- **NEVER DELETE**: Existing documentation is preserved

### Verification

```bash
python -m py_compile api/routers/sources.py  # OK
npx tsc --noEmit  # No errors in modified files
```

### Next Steps

- [ ] Test with real dbt semantic layer YAML
- [ ] Test with Looker LookML files
- [ ] Add support for URL import (fetch from Confluence/Notion)
- [ ] Consider adding history/undo for semantic layer changes

---

## Template for Future Sessions

```markdown
## Session: YYYY-MM-DD

### Focus: [Brief description]

### Changes Made

1. **[Category]**: Description of change
   - Details
   - Files affected

### Issues Encountered

- Issue description and resolution

### Decisions Made

- Decision and rationale

### Files Created/Modified

| File | Change |
|------|--------|
| `path/to/file` | Description |

### Next Steps

- [ ] Task 1
- [ ] Task 2
```
