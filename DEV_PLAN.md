# Implementation Plan: Story Analytics v2

## North Star

**Datawrapper-quality charts, open-source, from any data source, maintained by AI.**

The only open-source tool that combines publication-ready visual quality, AI-powered chart creation, and automated dashboard maintenance. Target users: researchers, data analysts, economists who want beautiful charts from their data without design effort.

**Day-one scenario:** A researcher uploads a CSV of monthly employment figures. In under 30 seconds, they have a publication-ready line chart with proper axis formatting, a source note, and a downloadable SVG. No styling required.

---

## Key Architectural Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Charting library | **Observable Plot** | Cleaner SVG, publication-ready defaults, smaller bundle. Confirmed by PoC (2026-02-13). |
| UI framework | **React 18 + TypeScript** | Existing codebase, strong ecosystem |
| Styling | **Tailwind v4** | Set up in PoC, `@tailwindcss/vite` plugin, design tokens via `@theme {}` |
| Typography | **Inter** | Clean, readable, Datawrapper-inspired. Loaded from Google Fonts. |
| Data engine | **DuckDB** | CSV/Parquet/JSON ingestion, SQL validation, local-first |
| State management | **Zustand** | Already in use, lightweight |
| Backend | **FastAPI** | Existing, proven |
| AI layer | **Provider-agnostic** (Claude, OpenAI, Gemini) | Existing abstraction works |
| React integration | **`useObservablePlot` hook** | `useRef` + `useEffect` + `ResizeObserver`. Canonical pattern from PoC. |
| Chart config | **JSON** | Serializable, Git-friendly. Maps to Observable Plot `plot()` options. |

---

## What Carries Forward from v1

### Keep Directly
| Component | Location | Lines | Why |
|-----------|----------|-------|-----|
| LLM providers | `engine/llm/` | ~250 | Clean abstraction, all 3 providers working |
| Chart requirements prompt | `engine/prompts/chart/requirements.yaml` | 347 | Battle-tested, 80+ examples, pattern detection |
| Chart pipeline (3-stage) | `engine/chart_pipeline.py` | 1,151 | Proven: Requirements → SQL → Assembly |
| Chart models | `engine/models/chart.py` | 700+ | `ChartSpec`, `ChartConfig`, `Chart`, `Dashboard` |
| Quality validators | `engine/validators/` | 1,964 | Data shape checks, pattern detection, scale analysis |
| Config loader (YAML) | `engine/config_loader.py` | 555 | YAML-driven prompts, themes, QA rules |
| Schema context generator | `engine/schema.py` | 400 | Schema → LLM prompt text |
| SQL validator (DuckDB) | `engine/sql_validator.py` | 501 | Query parsing + validation |
| QA system (vision) | `engine/qa.py` | 729 | Playwright screenshots + Claude vision |
| Design system prompts | `engine/prompts/base.yaml` | — | System role, chart type guidance |
| API infrastructure | `api/main.py`, `config.py` | ~200 | FastAPI app shell, CORS, config |
| Frontend types | `app/src/types/` | 350+ | `ChartConfig`, `ChartSpec`, `FilterSpec` |
| Zustand store patterns | `app/src/stores/` | ~1,000 | State management patterns |
| API client | `app/src/api/client.ts` | ~400 | Typed Axios wrapper |

### Adapt
| Component | Change Needed |
|-----------|---------------|
| Chart conversation manager (`chart_conversation.py`) | Adapt state machine for new editor UI (toolbox + AI chat) |
| Semantic layer (`semantic.py`) | Simplify for CSV: auto-generate from DuckDB column inspection |
| Sources router (`api/routers/sources.py`) | Replace DB connection wizard with CSV upload endpoint |
| Chart router (`api/routers/chart.py`) | Simplify persistence, add Observable Plot config generation |

### Drop
| Component | Reason |
|-----------|--------|
| Dashboard pipeline (`pipeline/pipeline.py`) | Evidence markdown is dead |
| Dashboard composer (`dashboard_composer.py`) | Evidence-based composition |
| Metric compiler (`metric_compiler.py`) | Over-engineered for CSV-first tool |
| LookML extractor (`tools/lookml_extractor/`) | Looker replacement direction |
| Semantic layer generator (`tools/build_semantic_layer.py`) | Looker replacement direction |
| All Plotly chart components (`app/src/components/charts/`) | Replaced by Observable Plot |
| Conversation router (`api/routers/conversation.py`) | Legacy dashboard conversations |

---

## Observable Plot Chart Architecture

### How It Works

The engine generates a **chart configuration JSON** that the frontend translates into Observable Plot `plot()` calls. This is the central abstraction:

```
User request → LLM pipeline → ChartConfig JSON → React component → Observable Plot SVG
```

### Chart Config → Observable Plot Mapping

The existing `ChartConfig` type maps naturally to Observable Plot:

```typescript
// ChartConfig (from engine)          →  Observable Plot (in React)
{
  chartType: 'LineChart',
  x: 'month',                        →  Plot.lineY(data, { x: 'month',
  y: 'revenue',                      →    y: 'revenue',
  series: 'region',                   →    stroke: 'region' })
  colors: ['#2166ac', '#d6604d'],     →  color: { range: [...] }
  title: 'Revenue by Region',         →  ChartCard title prop
  xAxisTitle: 'Month',               →  x: { label: 'Month' }
  yAxisTitle: 'Revenue ($)',          →  y: { label: 'Revenue ($)' }
  showGrid: true,                     →  grid: true
}
```

### Observable Plot Chart Factory

A single `ObservableChartFactory` component replaces the 17 Plotly chart components:

```typescript
function ObservableChartFactory({ data, config }: { data: any[], config: ChartConfig }) {
  // Maps ChartConfig.chartType → Plot marks
  // LINE_CHART    → Plot.lineY()
  // BAR_CHART     → Plot.barY() or Plot.barX() (if horizontal)
  // AREA_CHART    → Plot.areaY() + Plot.lineY()
  // SCATTER_PLOT  → Plot.dot()
  // DATA_TABLE    → HTML table (no Plot needed)
  // BIG_VALUE     → Styled number (no Plot needed)
}
```

This is dramatically simpler than the current 17-component Plotly approach. Observable Plot's declarative marks API means one component handles all chart types.

---

## Implementation Phases

### Phase 1: Foundation (Observable Plot Rendering Pipeline)

**Goal:** Replace the Plotly rendering pipeline with Observable Plot. A `ChartConfig` JSON renders as a publication-ready Observable Plot chart.

**This phase answers:** "Given chart config + data, can we render a beautiful chart?"

#### 1.1 Observable Plot Chart Factory
Create `app/src/components/charts/ObservableChartFactory.tsx` — single component that:
- Takes `{ data: any[], config: ChartConfig }` props
- Maps `config.chartType` to the correct Observable Plot marks
- Applies Datawrapper-style theme defaults
- Handles all chart types: line, bar (vertical/horizontal/stacked), area, scatter, data table, big value

**Builds on:** PoC components (`app/src/poc/components/Observable*.tsx`), `useObservablePlot` hook, `observableTheme.ts`.

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `app/src/components/charts/ObservableChartFactory.tsx` | Create | Central chart renderer |
| `app/src/components/charts/ChartWrapper.tsx` | Create | Shared wrapper: title, subtitle, source note, export buttons |
| `app/src/components/charts/useObservablePlot.ts` | Move from poc | React hook (promoted from PoC) |
| `app/src/themes/datawrapper.ts` | Create | Consolidated theme: colors, fonts, spacing, Observable Plot defaults |
| `app/src/types/chart.ts` | Modify | Add Observable Plot-specific config fields if needed |

#### 1.2 Chart Export
Static export from Observable Plot SVG output:
- **SVG**: Direct DOM extraction (Observable Plot renders SVG natively)
- **PNG**: Canvas-based rasterization at 2x resolution
- **PDF**: SVG → PDF conversion (client-side via jsPDF or similar)

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `app/src/utils/chartExport.ts` | Create | `exportSVG()`, `exportPNG()`, `exportPDF()` |

#### 1.3 Verify with Hardcoded Data
Wire up the factory to the existing PoC sample data at `/poc` to verify all chart types render correctly with the unified component.

**Deliverable:** Visit `/poc`, see all chart types rendered by `ObservableChartFactory` with publication-ready styling and working export buttons.

---

### Phase 2: Data Ingestion (CSV → DuckDB → Queryable)

**Goal:** User uploads a CSV and sees a data preview. The data is queryable via DuckDB.

**This phase answers:** "Can we get user data into the system cleanly?"

#### 2.1 CSV Upload Endpoint
Backend endpoint that accepts a CSV file, loads it into DuckDB, and returns schema info.

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `api/routers/data.py` | Create | `POST /api/data/upload` — accepts CSV, returns `{ source_id, schema }` |
| `api/services/duckdb_service.py` | Create | DuckDB connection management, CSV loading, query execution |

**Endpoint behavior:**
```
POST /api/data/upload
  Body: multipart form with CSV file
  Response: {
    source_id: "abc123",
    filename: "employment.csv",
    row_count: 240,
    columns: [
      { name: "month", type: "DATE", sample_values: ["2023-01", "2023-02", ...] },
      { name: "employment", type: "FLOAT", min: 145.2, max: 158.7, nulls: 0 },
      ...
    ]
  }
```

#### 2.2 Data Preview UI
Frontend page for CSV upload and data preview.

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `app/src/pages/UploadPage.tsx` | Create | Drag-and-drop CSV upload + data preview table |
| `app/src/components/data/DataPreview.tsx` | Create | Column headers, first 10 rows, type badges, row count |
| `app/src/components/data/FileDropzone.tsx` | Create | Drag-and-drop file upload area |
| `app/src/stores/dataStore.ts` | Create | Upload state, source_id, schema, preview data |

#### 2.3 Query Execution Endpoint
Backend endpoint to execute SQL against uploaded data and return results.

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `api/routers/data.py` | Extend | `POST /api/data/query` — executes SQL, returns `{ columns, rows }` |

**Deliverable:** Upload a CSV, see a clean data preview with column types and sample values. Backend can execute SQL against the data.

---

### Phase 3: AI Chart Creation (The Core Loop)

**Goal:** User uploads data, AI proposes a chart, chart renders instantly. This is the product's signature moment.

**This phase answers:** "Can AI look at data and produce a good chart automatically?"

#### 3.1 Chart Proposal Endpoint
Adapt the existing `ChartPipeline` for CSV data:
1. **Requirements stage:** LLM examines schema + sample data → proposes `ChartSpec` (chart type, axis mappings, title)
2. **SQL stage:** LLM generates DuckDB SQL to shape the data for the chart
3. **Assembly:** SQL executes against DuckDB, results + config sent to frontend

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `engine/v2/chart_proposer.py` | Create | Simplified 2-stage pipeline: schema → ChartSpec → SQL |
| `engine/v2/schema_analyzer.py` | Create | CSV schema → LLM prompt context (column types, sample values, distributions) |
| `api/routers/charts_v2.py` | Create | `POST /api/v2/charts/propose` — takes `source_id`, returns chart config + data |

**Key adaptation:** The existing `chart/requirements.yaml` prompt is the most valuable asset. It already handles chart type selection, axis mapping, and pattern detection. We adapt it to work with CSV-derived schemas instead of semantic layers.

#### 3.2 AI Creation Flow UI
The core user flow: upload → AI proposes → chart renders.

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `app/src/pages/CreatePage.tsx` | Create | Full creation flow: upload → preview → AI proposal → chart |
| `app/src/components/create/ChartProposal.tsx` | Create | Shows AI reasoning + rendered chart + accept/modify buttons |
| `app/src/stores/createStore.ts` | Create | Creation flow state: step, source_id, proposal, chart config |

**Flow:**
```
[Upload CSV] → [Data Preview] → [Create with AI] → [Chart renders]
                                                      ↓
                                              [Accept] or [Try different approach]
```

#### 3.3 Chart Persistence
Save chart configurations as JSON files (local-first, Git-friendly).

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `api/services/chart_storage.py` | Create | Save/load chart configs as JSON files |
| `api/routers/charts_v2.py` | Extend | `POST /api/v2/charts/save`, `GET /api/v2/charts/:id` |

**Storage format:**
```
charts/
  {chart_id}.json    # ChartConfig + metadata + SQL + source reference
data/
  {source_id}/
    raw.csv          # Original uploaded file
    schema.json      # Detected schema
```

**Deliverable:** Upload a CSV → AI proposes a chart → chart renders with Observable Plot → save it. The core product loop works end to end.

---

### Phase 4: Chart Editor (Three-Pane Interface)

**Goal:** Users can refine charts via direct controls (toolbox) or natural language (AI chat). Both modify the same `ChartConfig`.

**This phase answers:** "Can users refine charts easily after the AI proposes one?"

#### 4.1 Editor Layout
Three-pane layout: toolbox (left) + chart preview (center) + AI chat (right).

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `app/src/pages/EditorPage.tsx` | Create | Three-pane layout shell |
| `app/src/components/editor/Toolbox.tsx` | Create | Left pane: chart-type-specific controls |
| `app/src/components/editor/ChartPreview.tsx` | Create | Center pane: live Observable Plot rendering |
| `app/src/components/editor/AIChat.tsx` | Create | Right pane: natural language adjustments |
| `app/src/stores/editorStore.ts` | Create | Editor state: chart config, undo/redo stack, dirty flag |

#### 4.2 Toolbox Controls
Dynamic controls that change based on chart type.

**Controls (all chart types):**
- Title, subtitle, source note (text inputs)
- Color palette selector (curated palettes + custom hex)
- Legend position (top, bottom, right, none)
- Grid line toggle

**Chart-type-specific:**
- Line/area: line width, smoothing, point markers
- Bar: sort order, horizontal toggle, stacked toggle
- Scatter: point size, opacity, trend line toggle
- All: axis labels, number formatting, min/max overrides

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `app/src/components/editor/controls/TextControl.tsx` | Create | Title/subtitle/source inputs |
| `app/src/components/editor/controls/ColorPalette.tsx` | Create | Palette picker with preview |
| `app/src/components/editor/controls/AxisControls.tsx` | Create | Axis labels, formatting, scale |
| `app/src/components/editor/controls/ChartTypeControls.tsx` | Create | Type-specific options |

#### 4.3 AI Chat for Adjustments
Natural language chart modifications. The LLM reads the current `ChartConfig` + user request → outputs a modified `ChartConfig`.

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `engine/v2/chart_editor.py` | Create | LLM takes current config + user message → returns updated config |
| `api/routers/charts_v2.py` | Extend | `POST /api/v2/charts/edit` — streaming SSE response |

**Examples:**
- "Make the bars horizontal" → `config.horizontal = true`
- "Use a red-to-blue color scale" → `config.colors = [...]`
- "Add a trend line" → adds `Plot.linearRegressionY()` mark
- "Change to area chart" → `config.chartType = 'AreaChart'`

#### 4.4 Undo/Redo
Config history stack in the editor store.

#### 4.5 Manual Wizard (Path B)
For users who know what they want: chart type picker + column mapping dropdowns.

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `app/src/components/create/ManualWizard.tsx` | Create | Chart type thumbnails + column mapping dropdowns |

**Deliverable:** Full chart editor with toolbox controls, live preview, AI chat, and undo/redo. Both AI-led and manual creation paths work.

---

### Phase 5: Publishing & Sharing

**Goal:** Charts are shareable, embeddable, and exportable at publication quality.

#### 5.1 Shareable URLs
Each saved chart gets a permanent URL that renders without auth.

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `app/src/pages/ChartViewPage.tsx` | Create | Public chart view (no sidebar, no auth) |
| `api/routers/charts_v2.py` | Extend | `GET /api/v2/charts/:id/public` — returns chart + data for public rendering |

#### 5.2 Embed Codes
Generate iframe snippet and standalone HTML embed.

#### 5.3 Static Export Pipeline
High-quality export for publication:
- **SVG**: Native Observable Plot output, cleaned up
- **PNG**: 2x resolution, with title/subtitle/source baked in
- **PDF**: Single-page, publication-ready

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `api/routers/export.py` | Create | `GET /api/v2/charts/:id/export?format=svg|png|pdf` |
| `api/services/export_service.py` | Create | Server-side rendering via Playwright for PNG/PDF |

#### 5.4 Chart Library
Browse and manage saved charts.

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `app/src/pages/LibraryPage.tsx` | Create | Grid of saved charts with search, filter, and sort |

**Deliverable:** Saved charts have shareable URLs, embed codes, and downloadable SVG/PNG/PDF exports.

---

### Phase 6: Dashboard Assembly

**Goal:** Compose multiple charts into a responsive dashboard.

#### 6.1 Dashboard Builder
Grid-based layout with drag-and-drop ordering.

**Files:**
| File | Action | Purpose |
|------|--------|---------|
| `app/src/pages/DashboardBuilderPage.tsx` | Create | Dashboard composition canvas |
| `app/src/components/dashboard/DashboardGrid.tsx` | Create | Responsive 2-column grid |
| `app/src/components/dashboard/ChartPicker.tsx` | Create | Select charts from library to add |
| `app/src/stores/dashboardStore.ts` | Create | Dashboard state: layout, chart references |

#### 6.2 Dashboard Features
- Dashboard title and description
- Shareable URL
- Global date range filter (applies to all charts with date axes)
- Embed code for full dashboard
- Export full dashboard as PDF

**Deliverable:** Multi-chart dashboards with shareable URLs and PDF export.

---

### Phase 7: Chart Hygiene System

**Goal:** Automated maintenance so dashboards don't silently break.

#### 7.1 Data Freshness Monitoring
- Track data source timestamps vs expected refresh schedules
- Alert on stale data (info → warning → critical severity)

#### 7.2 Schema Change Detection
- Detect column renames, additions, removals in data sources
- Propose SQL adjustments
- Flag charts referencing missing columns

#### 7.3 Visual Quality Checks
- Playwright screenshots + Claude vision validation
- Detect: blank charts, rendering errors, overlapping labels, impossible values
- Compare against previous known-good screenshot

**Builds on:** Existing `engine/qa.py` (729 lines) — adapt from Plotly screenshots to Observable Plot screenshots.

#### 7.4 Scheduled Refresh
- Manual refresh button
- Cron-based scheduled refresh for database-connected charts
- Re-upload prompt for CSV-based charts

**Deliverable:** Automated health monitoring for all charts. Health badge (green/yellow/red) on each chart and dashboard.

---

## App Navigation Structure (v2)

```
/                   → Landing page (upload CTA)
/create             → Upload CSV → data preview → AI proposes chart
/create/manual      → Manual wizard (chart type + column mapping)
/editor/:chartId    → Three-pane chart editor
/chart/:chartId     → Public chart view (no auth, shareable)
/library            → Saved charts browser
/dashboard/new      → Dashboard builder
/dashboard/:slug    → Public dashboard view
/settings           → API key config, theme preferences
/poc                → Observable Plot PoC (temporary, for comparison)
```

---

## Tech Stack Summary

```
Frontend:
  React 18 + TypeScript
  Observable Plot + D3 (charting)
  Tailwind v4 (UI styling, @tailwindcss/vite)
  Inter font (Google Fonts)
  Zustand (state management)
  Vite (build)

Backend:
  Python + FastAPI
  DuckDB (CSV/Parquet/JSON ingestion + SQL)
  File-based chart storage (JSON)

AI:
  Claude / OpenAI / Gemini (provider-agnostic)
  Claude Vision (chart QA)
  Playwright (screenshot rendering)
```

---

## Priority Order

| Phase | Scope | Depends On |
|-------|-------|------------|
| **Phase 1** | Observable Plot rendering pipeline | PoC (done) |
| **Phase 2** | CSV upload + data preview | — |
| **Phase 3** | AI chart creation (core loop) | Phases 1 + 2 |
| **Phase 4** | Chart editor (toolbox + AI chat) | Phase 3 |
| **Phase 5** | Publishing + sharing + export | Phase 3 |
| **Phase 6** | Dashboard assembly | Phase 5 |
| **Phase 7** | Chart hygiene system | Phase 6 |

Phases 1 and 2 can be built in parallel. Phase 3 is the critical path — it's the product's signature moment. Phases 4 and 5 can overlap. Phases 6 and 7 are post-launch polish.

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| CSV → rendered chart | < 30 seconds end-to-end |
| Chart visual quality | Indistinguishable from Datawrapper at a glance |
| AI chart proposal accuracy | Correct chart type + axis mapping 90%+ |
| SVG export quality | Clean, publication-ready, suitable for print |
| Bundle size | < 500KB gzipped (Observable Plot is ~150KB vs Plotly's ~1.6MB) |
| Chart types supported | Line, bar (v/h/stacked), area, scatter, table, big value |
| Manual chart creation time | < 60 seconds from data preview to rendered chart |

---

*Document updated: 2026-02-13*
*Previous direction (Looker replacement) archived in git history*
