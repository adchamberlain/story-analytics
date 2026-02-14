# Implementation Plan: Story Analytics v2

## North Star

**Open-source Tableau replacement: publication-ready dashboards from any database, with AI assistance.**

A fast, direct dashboarding tool for data scientists and analysts. Connect to your database, build charts with direct controls, assemble dashboards, and keep them updated. Publication-quality output via Observable Plot. AI helps with the hard parts (SQL, derived metrics, formatting) but doesn't drive creation.

**Target users:** Data scientists and analysts at companies who currently use Tableau for product dashboards.

---

## User Stories

These three stories define the product's scope and priorities:

### Story 1: The Monitoring Data Scientist

> I'm a data scientist. I built a dashboard to monitor our product area — conversion rates, daily active users, key events. When I open this tool, I want to see that dashboard immediately. Most days I just check the numbers. Occasionally I tweak a chart or add a new one.

**Implies:** Dashboard is home. Pin a default dashboard. Fast load. Living connection to database.

### Story 2: The Solo Analyst Replacing Tableau

> I'm a researcher who wants to quickly build nice dashboards from datasets I refresh periodically. I used to use Tableau for this, but I want something open-source, cheaper, and more modern. I connect to a table, build a few charts, arrange them into a dashboard, and share it.

**Implies:** Fast creation workflow with direct controls. Database-first. Data refresh is a key workflow. Export and sharing.

### Story 3: The Team Replacing Tableau

> I'm on a team of product analytics data scientists. We want to replace Tableau as our main dashboarding suite. We need shared dashboards organized by product area, connected to our data warehouse.

**Implies:** Multi-user. Shared dashboards. Team organization. Scalable to many dashboards. (Later phase — but architecture must not preclude it.)

---

## Core Philosophy

### Dashboards Are the Unit of Work

Nobody wakes up thinking "I need a bar chart." They think "I need to monitor this product area." Charts are building blocks; dashboards are what users create, share, and return to. The product is organized around dashboards, not individual charts.

### Human-Driven Creation, AI-Assisted

v1 testing proved that AI cannot reliably propose good charts from raw schemas. Without rich semantic layers and deep business context, AI gets chart types, axis mappings, and metric names wrong. The LLM doesn't know what "conversion rate" means in your schema.

**What works (Tableau's model):** The data scientist knows what they want to see. They pick a chart type, map columns to axes, set a title and date range. The tool's job is to make this fast and produce beautiful output.

**Where AI adds value:**
- **SQL generation:** "Show me 7-day rolling average of conversions" → AI writes the SQL
- **Derived metrics:** "Add a conversion rate column (signups / visits)" → AI generates the calculation
- **Formatting suggestions:** Reasonable axis labels, number formatting, date granularity
- **Natural language refinement:** "Make the bars horizontal", "Add a trend line"

**Where AI does NOT drive:**
- Chart type selection (human picks from a menu)
- Column-to-axis mapping (human maps with dropdowns)
- Dashboard composition (human arranges charts)
- "Build me a dashboard" (this doesn't work without rich semantic context)

### Database-First

The primary data path is connecting to a database table — Snowflake, BigQuery, Postgres, etc. This is how Tableau is used in companies. CSV upload is a secondary convenience path, not the core workflow.

A dashboard stays connected to its data source. When the underlying table gets new data, the dashboard refreshes. This living connection is what makes dashboards useful for monitoring.

---

## Key Architectural Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Charting library | **Observable Plot** | Cleaner SVG, publication-ready defaults, smaller bundle. Confirmed by PoC. |
| UI framework | **React 18 + TypeScript** | Existing codebase, strong ecosystem |
| Styling | **Tailwind v4** | `@tailwindcss/vite` plugin, design tokens via `@theme {}`. Single styling approach — no inline styles. |
| Typography | **Inter** | Clean, readable. Loaded from Google Fonts. |
| Data engine | **DuckDB** | CSV/Parquet/JSON ingestion, SQL validation, local query execution |
| Primary data path | **Database connections** (Snowflake for PoC) | How Tableau is actually used. CSV upload is secondary. |
| State management | **Zustand** | Already in use, lightweight |
| Backend | **FastAPI** | Existing, proven |
| AI role | **Assistant, not driver** | AI helps with SQL and refinement. Human drives chart creation with direct controls. |
| React integration | **`useObservablePlot` hook** | `useRef` + `useEffect` + `ResizeObserver`. Canonical pattern from PoC. |
| Chart config | **JSON** | Serializable, Git-friendly. Maps to Observable Plot `plot()` options. |

---

## Observable Plot Chart Architecture

### How It Works

The user configures a chart through direct controls. The configuration is stored as a **chart configuration JSON** that the frontend translates into Observable Plot `plot()` calls:

```
User controls → ChartConfig JSON → React component → Observable Plot SVG
      ↑                                                      |
      |              AI assists (SQL, refinement)             |
      +------ live preview updates instantly ----------------+
```

### Chart Config → Observable Plot Mapping

```typescript
// ChartConfig (from editor)            →  Observable Plot (in React)
{
  chartType: 'LineChart',
  x: 'month',                          →  Plot.lineY(data, { x: 'month',
  y: 'revenue',                        →    y: 'revenue',
  series: 'region',                     →    stroke: 'region' })
  colors: ['#2166ac', '#d6604d'],       →  color: { range: [...] }
  title: 'Revenue by Region',           →  ChartCard title prop
  xAxisTitle: 'Month',                  →  x: { label: 'Month' }
  yAxisTitle: 'Revenue ($)',            →  y: { label: 'Revenue ($)' }
  showGrid: true,                       →  grid: true
}
```

### Observable Plot Chart Factory

A single `ObservableChartFactory` component handles all chart types:

```typescript
function ObservableChartFactory({ data, config }: { data: any[], config: ChartConfig }) {
  // Maps ChartConfig.chartType → Plot marks
  // LINE_CHART    → Plot.lineY()
  // BAR_CHART     → Plot.barY() or Plot.barX() (if horizontal)
  // AREA_CHART    → Plot.areaY() + Plot.lineY()
  // SCATTER_PLOT  → Plot.dot()
  // HISTOGRAM     → Plot.rectY() + Plot.binX()
  // DATA_TABLE    → HTML table (no Plot needed)
  // BIG_VALUE     → Styled number (no Plot needed)
}
```

---

## What Carries Forward

### From v1 Engine (Keep)
| Component | Location | Why |
|-----------|----------|-----|
| LLM providers | `engine/llm/` | Clean abstraction, all 3 providers working |
| Chart models | `engine/models/chart.py` | `ChartSpec`, `ChartConfig`, `Chart`, `Dashboard` |
| Quality validators | `engine/validators/` | Data shape checks, pattern detection, scale analysis |
| Config loader (YAML) | `engine/config_loader.py` | YAML-driven prompts, themes, QA rules |
| Schema context generator | `engine/schema.py` | Schema → LLM prompt text |
| SQL validator (DuckDB) | `engine/sql_validator.py` | Query parsing + validation |
| QA system (vision) | `engine/qa.py` | Playwright screenshots + Claude vision |
| API infrastructure | `api/main.py`, `config.py` | FastAPI app shell, CORS, config |
| Snowflake connection | `sources/snowflake_saas/` | Database connection pattern — re-enable for primary data path |

### From v2 PoC (Keep)
| Component | Location | Why |
|-----------|----------|-----|
| ObservableChartFactory | `app/src/components/charts/` | Central chart renderer — working, tested |
| ChartWrapper | `app/src/components/charts/` | Title, subtitle, source note wrapper |
| useObservablePlot hook | `app/src/components/charts/` | React ↔ Observable Plot bridge |
| Editor + Toolbox | `app/src/components/editor/` | Direct controls — this becomes the primary creation interface |
| AI Chat (editor) | `app/src/components/editor/AIChat.tsx` | Natural language refinement (assistant role) |
| Dashboard grid/view | `app/src/components/dashboard/` | Dashboard rendering |
| Chart persistence | `api/services/chart_storage.py` | JSON file storage for charts |
| DuckDB service | `api/services/duckdb_service.py` | Query execution |
| Visual QA test suite | `tests/v2_visual_qa.py` | 10/10 passing, validates rendering pipeline |

### Drop
| Component | Reason |
|-----------|--------|
| v1 Sidebar + AppLayout | Chat-app paradigm; replaced by dashboard-first navigation |
| v1 ChatPage | Conversation-based creation is dead |
| v1 ConversationStore | No more conversations |
| v1 ChartEditPage (dark chat editor) | Replaced by v2 EditorPage |
| v1 ChartsPage, DashboardsPage, NewDashboardPage | Replaced by v2 equivalents |
| v1 ProtectedRoute wrapper | Auth model changes (deferred auth) |
| v1 SourceStore (schema browser in sidebar) | Replaced by database connection flow |
| CreatePage (AI proposal flow) | AI-driven creation is replaced by human-driven creation |
| CreateStore (proposal state machine) | No more proposal workflow |
| ChartProposal component | No more "accept or retry" pattern |
| `engine/v2/chart_proposer.py` | AI no longer proposes charts |

---

## Implementation Phases

### Status: Phases 1-6 (Old Plan) Complete

The v2 PoC built the rendering pipeline, CSV upload, AI proposal flow, editor, publishing, and dashboard assembly. The Observable Plot rendering pipeline, editor toolbox, dashboard grid, and visual QA suite are solid and carry forward. The AI proposal flow and CSV-first data path are being replaced.

---

### Phase 7: Frontend Architecture Reset

**Goal:** Remove v1 remnants. Establish dashboard-first navigation. Unify styling. The app should feel like a dashboarding tool, not a chat application.

#### 7.1 Remove v1 Routes, Components, and Stores

Delete everything from the chat-app paradigm:

| Delete | Type | Replacement |
|--------|------|-------------|
| `Sidebar.tsx` | Component | New top header bar |
| `AppLayout.tsx` | Component | New minimal shell |
| `ChatPage.tsx` | Page | None |
| `ChartsPage.tsx` | Page | Library is secondary to dashboards |
| `ChartEditPage.tsx` | Page | EditorPage already exists |
| `DashboardsPage.tsx` | Page | DashboardsHome (new) |
| `NewDashboardPage.tsx` | Page | DashboardBuilderPage already exists |
| `LoginPage.tsx` / `VerifyPage.tsx` | Page | Simplify auth (deferred model) |
| `ProtectedRoute.tsx` | Component | Deferred auth — create without login, auth to save |
| `conversationStore.ts` | Store | None |
| `sourceStore.ts` | Store | New `connectionStore.ts` |
| `chartStore.ts` | Store | `editorStore.ts` already covers this |
| `dashboardStore.ts` (v1) | Store | `dashboardBuilderStore.ts` already covers this |
| `createStore.ts` | Store | Replaced by editor-first creation |
| All `/chat`, `/charts`, legacy dashboard routes | Routes | New route structure |

#### 7.2 New Navigation Shell

Replace the dark sidebar with a lightweight top header:

```
+------------------------------------------------------------------+
|  [Logo]    Dashboards    Library    |    [+ New Dashboard]  [User] |
+------------------------------------------------------------------+
|                                                                    |
|                        Page content                                |
|                                                                    |
+------------------------------------------------------------------+
```

- **Logo:** Brand, links to home
- **Dashboards:** Your dashboards (home)
- **Library:** Browse individual charts (secondary)
- **+ New Dashboard:** Primary CTA
- **User:** Settings, account, logout

#### 7.3 New Route Structure

```
/                           → DashboardsHome (your dashboards; default dashboard pinned)
/dashboard/new              → DashboardBuilder (create new dashboard)
/dashboard/:id              → DashboardView (the live dashboard)
/dashboard/:id/edit         → DashboardBuilder (edit layout, add/remove charts)
/dashboard/:id/chart/new    → ChartEditor (new chart, in context of dashboard)
/dashboard/:id/chart/:cid   → ChartEditor (edit existing chart)
/chart/:id                  → ChartView (public, shareable, standalone)
/library                    → LibraryPage (all charts, search/filter)
/settings                   → SettingsPage
```

Key change: **Charts are created and edited in the context of a dashboard.** The URL reflects this. "New chart" always happens inside a dashboard.

#### 7.4 Unify Styling

Migrate all inline styles to Tailwind utilities. Remove direct hex values and `var()` references from component code. The CSS custom properties in `index.css` remain as the token source, consumed through Tailwind's `@theme` integration.

**Deliverable:** Clean app shell with top nav, dashboard-first routing, no v1 remnants. All pages use consistent Tailwind styling.

---

### Phase 8: Database Connection (Primary Data Path)

**Goal:** Connect to Snowflake (and later other databases). Browse tables, preview schemas, write custom SQL. This replaces CSV upload as the primary data path.

#### 8.1 Connection Management

Backend endpoints for managing database connections. Re-enable and adapt the v1 Snowflake connection infrastructure.

**Endpoints:**
```
POST /api/connections/          — Create connection (Snowflake credentials)
GET  /api/connections/          — List connections
GET  /api/connections/:id/test  — Test connection
GET  /api/connections/:id/tables — List tables/views
GET  /api/connections/:id/schema/:table — Get table schema (columns, types, sample values)
POST /api/connections/:id/query — Execute SQL, return results
```

#### 8.2 Connection UI

A connection setup flow (modal or page):
- Choose database type (Snowflake for PoC; extensible to BigQuery, Postgres, etc.)
- Enter credentials (account, warehouse, database, schema, user/password)
- Test connection
- Browse available tables

#### 8.3 Table Browser + Schema Preview

When creating a chart, the user picks a table (or writes custom SQL). The UI shows:
- List of tables in the connected schema
- Click a table → see columns with types, sample values, row count
- Option to write custom SQL instead of picking a table
- SQL preview/editor for power users

#### 8.4 CSV Upload (Secondary Path)

Keep the existing CSV upload as an alternative data path. Same DuckDB ingestion, same schema preview. But it's presented as "Upload a file" alongside "Connect to database" — not the primary flow.

**Deliverable:** Connect to Snowflake, browse tables, preview schemas, execute queries. CSV upload still works as a secondary option.

---

### Phase 9: Human-Driven Chart Creation

**Goal:** The chart editor is the creation interface. Users pick chart type, map columns, and configure everything directly. Charts render instantly with publication-quality defaults. AI assists but doesn't drive.

#### 9.1 The Editor IS the Creation Interface

No separate "create" page or AI proposal step. When you click "+ Add Chart" in a dashboard, you go straight to the editor with:
- Data source already set (inherited from dashboard's connection)
- Empty chart canvas
- Toolbox on the left with chart type picker at the top

The flow:
```
Dashboard → "+ Add Chart" → Editor opens
    → Pick chart type (visual menu: line, bar, area, scatter, histogram, table, big number)
    → Map columns to axes (dropdowns populated from table schema)
    → Chart renders instantly
    → Customize: title, subtitle, date range, filters, colors, aggregation
    → Save → back to dashboard
```

#### 9.2 Enhanced Toolbox Controls

The existing Toolbox needs to be expanded to cover the full Tableau-like control surface:

**Data section (new):**
- Table/SQL source display
- Column list with types (dimension vs. measure indicators)
- X-axis column dropdown
- Y-axis column dropdown (supports multiple for multi-series)
- Series/color-by column dropdown
- Aggregation method (sum, avg, count, min, max, none)
- Sort order (ascending, descending, natural)
- Row limit / date range filter

**Chart type section (enhanced):**
- Visual chart type picker with thumbnail previews
- Chart-type-specific options:
  - Line: line width, smoothing, point markers, step interpolation
  - Bar: horizontal toggle, stacked toggle, grouped
  - Area: stacked, normalized (100%)
  - Scatter: point size, opacity, trend line, color scale
  - Histogram: bin count, bin width

**Appearance section (enhanced):**
- Title, subtitle, source note, footer
- Color palette picker (curated palettes + custom)
- Legend position (top, bottom, right, none) and orientation
- Grid lines (x, y, both, none)
- Axis formatting: number format (currency, percent, compact), date format, min/max overrides
- Font size controls for title/labels

**Every control change rerenders the chart instantly.** This is the Tableau experience — direct manipulation with immediate visual feedback.

#### 9.3 Custom SQL Editor

For power users, a SQL editor panel (collapsible) where they can write or modify the query that feeds the chart. Changes to SQL re-execute and update the chart preview.

#### 9.4 AI Assistant Panel

The existing AI Chat panel stays, but its role is clearly scoped:
- "Add a 7-day rolling average column" → AI generates SQL
- "Calculate conversion rate as signups divided by visits" → AI generates derived column SQL
- "Make the y-axis show percentages" → AI updates config
- "Add a horizontal reference line at 1000" → AI adds annotation

The AI modifies the ChartConfig or SQL — it doesn't propose new charts.

**Deliverable:** Full chart creation and editing via direct controls. Chart type picker, column mapping, aggregation, formatting — all in the toolbox. AI assists with SQL and derived metrics. Every change renders instantly.

---

### Phase 10: Dashboard-First Workflow

**Goal:** Dashboards are the primary object users create and return to. Charts are built in the context of dashboards.

#### 10.1 DashboardsHome (The Home Page)

When you log in, you see your dashboards:
- **Default/pinned dashboard:** If you have one pinned, it renders directly (Story 1: "I just want to see my dashboard")
- **Dashboard grid:** All your dashboards as cards with titles, thumbnails, last-updated timestamps
- **Empty state:** For new users — "Connect to your database and build your first dashboard" CTA
- **+ New Dashboard** button (always visible)

#### 10.2 Dashboard Creation Flow

Creating a dashboard:
1. Click "+ New Dashboard"
2. Set title and description
3. Connect data source (pick existing connection or create new)
4. Click "+ Add Chart" → opens chart editor (Phase 9)
5. Build charts one at a time, each saves to the dashboard
6. Arrange chart layout (drag-and-drop grid, full/half width)
7. Save dashboard

The dashboard is the creation context. Charts are always created inside a dashboard. A chart can be reused across dashboards later, but the primary flow is dashboard → chart.

#### 10.3 Dashboard View (The Daily Experience)

The dashboard view is the most polished page in the app. This is what Story 1's user sees every morning:
- Clean header: title, description, last refreshed timestamp
- Responsive chart grid with proper spacing
- Refresh button (re-queries all charts from database)
- Edit mode toggle (rearrange, add/remove charts)
- Share: URL, embed code
- Export: PDF of full dashboard

#### 10.4 Pin Default Dashboard

Users can pin one dashboard as their default. When they navigate to `/`, they see that dashboard directly — no intermediate list. This is the "open the app, see my data" experience.

#### 10.5 Data Source at Dashboard Level

A dashboard is connected to a data source (database connection + optional default table). All charts in the dashboard share this connection. When you add a chart, the table browser is pre-populated with the dashboard's connection.

Data refresh happens at the dashboard level — one "Refresh" button re-queries all charts.

**Deliverable:** Dashboard-first home page with pin-to-default. Charts created in dashboard context. One-click refresh for all charts. Polished daily-use dashboard view.

---

### Phase 11: Data Refresh & Maintenance

**Goal:** Dashboards stay alive. Data refreshes, schema changes are detected, stale data is flagged.

#### 11.1 Manual Refresh

- "Refresh" button on dashboard view re-executes all chart SQL queries
- Shows last-refreshed timestamp
- Loading state per chart during refresh

#### 11.2 Data Freshness Monitoring

- Track when each data source was last queried
- If a table hasn't been refreshed in X days, show a "stale data" indicator
- Configurable freshness thresholds per dashboard

#### 11.3 Schema Change Detection

- When a chart's SQL fails because a column was renamed or removed, surface a clear error
- Suggest fixes: "Column `signup_count` not found. Did you mean `signups`?"
- AI can help rewrite SQL to adapt to schema changes

#### 11.4 Visual Quality Checks

Adapt the existing `engine/qa.py` vision QA system:
- Playwright screenshots + Claude vision validation
- Detect blank charts, rendering errors, overlapping labels
- Health badge (green/yellow/red) per chart

**Deliverable:** Living dashboards with manual refresh, staleness alerts, schema change detection, and visual health monitoring.

---

### Phase 12: Team & Sharing (Future)

**Goal:** Multiple users share dashboards within an organization. This is what Story 3 requires.

#### 12.1 Shared Dashboards
- Dashboard visibility: private, team, public
- Share by URL with view-only or edit access

#### 12.2 Team Workspaces
- Dashboards organized by team or product area
- Browse all shared dashboards in the organization

#### 12.3 Role-Based Access
- Viewer: see dashboards
- Editor: modify charts and dashboards
- Admin: manage connections and team settings

**Deliverable:** (Future) Team dashboarding with shared access and organization.

---

## App Navigation Structure

```
/                               → DashboardsHome (pinned dashboard or dashboard grid)
/dashboard/new                  → DashboardBuilder (new dashboard: set data source, add charts)
/dashboard/:id                  → DashboardView (the live dashboard — the daily-use page)
/dashboard/:id/edit             → DashboardBuilder (edit layout, add/remove charts)
/dashboard/:id/chart/new        → ChartEditor (new chart in context of dashboard)
/dashboard/:id/chart/:chartId   → ChartEditor (edit existing chart)
/chart/:chartId                 → ChartView (public standalone chart, shareable)
/library                        → LibraryPage (all charts across dashboards, search/filter)
/connections                    → ConnectionsPage (manage database connections)
/settings                       → SettingsPage (account, preferences)
```

---

## Tech Stack Summary

```
Frontend:
  React 18 + TypeScript
  Observable Plot + D3 (charting)
  Tailwind v4 (UI styling — sole styling approach, no inline styles)
  Inter font (Google Fonts)
  Zustand (state management)
  Vite (build)

Backend:
  Python + FastAPI
  DuckDB (SQL execution, CSV/Parquet ingestion)
  Snowflake connector (primary data path for PoC)
  File-based chart/dashboard storage (JSON)

AI (assistant role):
  Claude / OpenAI / Gemini (provider-agnostic)
  SQL generation for derived metrics and calculations
  Natural language chart refinement
  Claude Vision for visual QA
  Playwright for screenshot rendering
```

---

## Priority Order

| Phase | Scope | Status |
|-------|-------|--------|
| ~~Phase 1~~ | ~~Observable Plot rendering~~ | Done (v2 PoC) |
| ~~Phase 2~~ | ~~CSV upload + data preview~~ | Done (v2 PoC) |
| ~~Phase 3~~ | ~~AI chart proposal~~ | Done but being replaced — AI proposal flow deprecated |
| ~~Phase 4~~ | ~~Chart editor (toolbox + AI chat)~~ | Done (v2 PoC) — toolbox carries forward |
| ~~Phase 5~~ | ~~Publishing + sharing~~ | Done (v2 PoC) |
| ~~Phase 6~~ | ~~Dashboard assembly~~ | Done (v2 PoC) |
| **Phase 7** | Frontend architecture reset | **Next** — remove v1, dashboard-first nav, unify styling |
| **Phase 8** | Database connections (Snowflake) | Primary data path |
| **Phase 9** | Human-driven chart creation | Editor as creation interface, enhanced toolbox |
| **Phase 10** | Dashboard-first workflow | Dashboards as home, pin default, creation in context |
| **Phase 11** | Data refresh & maintenance | Living dashboards, schema detection, QA |
| **Phase 12** | Team & sharing | Future — multi-user, shared dashboards |

Phases 7 and 8 can be built in parallel (frontend reset + backend connections). Phase 9 depends on Phase 8 (need database schema for column mapping). Phase 10 depends on Phase 9 (need chart creation for dashboard building). Phase 11 is post-launch polish. Phase 12 is future.

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| Connect to DB → first chart rendered | < 2 minutes (including picking table + mapping columns) |
| Chart visual quality | Publication-ready, Datawrapper-quality Observable Plot SVGs |
| Toolbox control responsiveness | Every change renders instantly (< 200ms feedback) |
| Dashboard daily-use load time | < 3 seconds to see pinned dashboard with all charts |
| Data refresh | One-click refresh re-queries all charts in < 10 seconds |
| SVG export quality | Clean, publication-ready, suitable for print |
| Chart types supported | Line, bar (v/h/stacked), area, scatter, histogram, table, big value |

---

*Document updated: 2026-02-13*
*Previous direction (CSV-first, AI-driven chart creation) archived in git history*
