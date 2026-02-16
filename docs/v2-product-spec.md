# Product Specification: Story Analytics v2

## Positioning

**Datawrapper-quality charts, open-source, from any data source, maintained by AI.**

The only open-source tool that combines publication-ready visual quality, AI-powered chart creation, and automated dashboard maintenance.

---

## Why This Exists

The data visualization landscape has a clear gap:

| Tool | Beautiful output | Open source | AI-native | Self-maintaining |
|------|:---:|:---:|:---:|:---:|
| Datawrapper | Yes | No | No | No |
| Flourish | Yes | No | No | No |
| Apache Superset | No | Yes | No | No |
| Metabase | No | Yes | Partial | No |
| Evidence.dev | Yes | Yes | No | No |
| **Story Analytics v2** | **Yes** | **Yes** | **Yes** | **Yes** |

No open-source tool produces publication-ready visualizations with AI-driven creation and automated maintenance. That's the product.

---

## Target Users

Researchers, data analysts, economists, and BI professionals who:

- Have clean data (CSV files or SQL queries) ready to visualize
- Want Datawrapper-quality output without paying for Datawrapper
- Need to maintain dashboards over time without constant manual oversight
- Want both a fast manual workflow and an AI-assisted one
- May need to run everything locally (privacy, air-gapped environments)

**Day-one scenario:** A researcher uploads a CSV of monthly employment figures. In under 30 seconds, they have a publication-ready line chart with proper axis formatting, a source note, and a shareable URL. A week later, they upload updated data and the chart refreshes automatically. A month later, the AI hygiene system alerts them that the upstream data format changed and offers a fix.

---

## Product Goals

1. **Publication-ready defaults.** Every chart should look like it belongs in The Economist or the NYT without manual styling effort.
2. **Two paths to a chart.** AI-led creation for exploration; manual wizard for users who know exactly what they want.
3. **Automated maintenance.** The chart hygiene system detects and resolves issues so dashboards don't silently break.
4. **Local-first, cloud-optional.** Runs entirely on a user's machine with DuckDB. Optional cloud deployment for sharing and collaboration.
5. **Open source.** Free forever. No feature gating, no "enterprise tier" for core functionality.

---

## Core User Flow

### Two Entry Points

Users choose their path at the start:

```
┌─────────────────────────────────────────┐
│          How do you want to start?       │
│                                          │
│   [✨ AI Create]     [🔧 Build Manually] │
│                                          │
│   Upload your data    Upload your data   │
│   and let AI propose  and choose your    │
│   the best chart.     chart type.        │
└─────────────────────────────────────────┘
```

Both paths converge at the **Chart Editor** (Step 4) and share the same output pipeline.

---

### Step 1: Data Source Connection

**Inputs (v1):**
- CSV file upload (drag-and-drop or file picker)
- Snowflake connection credentials + pre-written SQL query

**How it works:**
- CSV uploads are loaded directly into a local DuckDB instance. No import step, no schema definition -- DuckDB auto-detects types from the file.
- Snowflake connections execute the user's SQL query and cache the result locally.
- In both cases, the result is a queryable table in DuckDB.

**Technical requirements:**
- DuckDB for all local data processing (CSV, Parquet, JSON file support)
- Snowflake connector for cloud database queries
- Connection validation with clear error messages
- Saved connections for repeat use

**Future data sources (post-v1):** PostgreSQL, MySQL, BigQuery, Redshift, ClickHouse, local SQLite/DuckDB files.

---

### Step 2: Data Preview & Validation

**Interface:**
- Clean table preview showing column headers and first 10 rows
- Auto-detected data types with manual override (dropdown per column)
- Row count and basic column statistics (min, max, unique count, null count)
- "Edit SQL" / "Change File" button to return to Step 1

**Technical requirements:**
- Execute query and display results with pagination
- Type inference with override capability
- Data validation indicators (warnings for nulls, mixed types, etc.)

---

### Path A: AI-Led Creation (Default)

### Step 3A: AI Proposes a Visualization

After data preview, the user clicks **"Create with AI"** (or this is the default path).

**What happens:**
1. The LLM examines the data schema, column types, sample values, and row count.
2. It proposes an initial visualization: chart type, axis mappings, title, subtitle, and styling.
3. The chart renders immediately in the editor (Step 4).

**The AI proposal includes:**
- Chart type selection with reasoning ("This is time-series data with one metric, so a line chart works best")
- Axis mappings
- A suggested title and subtitle
- Default Datawrapper-inspired styling

**The user can:**
- Accept the proposal and proceed to refine in the editor
- Ask the AI to try a different approach ("Show me this as a bar chart instead")
- Switch to the manual wizard at any time

**Technical requirements:**
- LLM integration for data analysis and chart proposal
- Schema + sample data sent to the model (not the full dataset)
- Response includes a complete chart configuration JSON
- Fast rendering of the proposed chart (< 3 seconds target)

---

### Path B: Manual Wizard

### Step 3B: Chart Type Selection & Column Mapping

For users who know exactly what they want.

**Chart types supported (v1):**
- Line chart
- Vertical bar chart
- Horizontal bar chart
- Stacked bar chart
- Area chart
- Scatter plot
- Pie / donut chart
- Data table

**Interface:**
- Visual chart type picker (thumbnail grid showing each type)
- X-axis column dropdown
- Y-axis column dropdown (supports multiple series)
- Color/group-by column (optional)
- Sort order selector
- Instant preview as selections change

**Technical requirements:**
- Column-type compatibility validation (warn if mapping a categorical column to a numeric axis)
- Smart defaults: if user picks "line chart" and has a date column + a numeric column, auto-map them
- Live preview updates on every selection change

---

### Step 4: Chart Editor (Both Paths Converge Here)

**Layout: Three-pane editor**

```
┌──────────────┬─────────────────────────┬──────────────┐
│              │                         │              │
│   Toolbox    │    Chart Preview        │   AI Chat    │
│   (left)     │    (center)             │   (right)    │
│              │                         │              │
│  Chart-type  │    Live rendering       │  "Make the   │
│  specific    │    with publication-    │   title      │
│  controls    │    ready defaults       │   bigger"    │
│              │                         │              │
│  Axis        │                         │  "Add a      │
│  Title       │                         │   trend      │
│  Styling     │                         │   line"      │
│  Annotations │                         │              │
│              │                         │  "Change to  │
│              │                         │   a bar      │
│              │                         │   chart"     │
│              │                         │              │
└──────────────┴─────────────────────────┴──────────────┘
```

**Toolbox (left pane) -- chart-specific controls:**

*Axis Controls:*
- X/Y axis min/max values
- Axis labels and number formatting (currency, percentage, compact notation)
- Tick interval and rotation
- Log scale toggle

*Chart Enhancements:*
- Trend/regression line toggle (linear, polynomial)
- Smoothing options (for line/area charts)
- Data point annotations (click a point to add a label)
- Range highlighting (shade a region)
- Reference lines (horizontal/vertical threshold lines)

*Metadata & Context:*
- Chart title (with font size control)
- Subtitle
- Source note (with optional hyperlink)
- Data notes / disclaimers
- Author / byline

*Styling:*
- Color palette selector (curated publication-ready palettes)
- Custom brand colors (hex input)
- Font selector (limited set of clean, readable fonts)
- Background color (white default, optional light gray)
- Grid line visibility toggle
- Legend position

**AI Chat (right pane):**
- Natural language chart adjustments ("make the bars horizontal", "use a red-to-blue color scale")
- Styling suggestions ("this chart has too many categories for a pie chart, try a horizontal bar")
- Error troubleshooting
- The AI chat modifies the same chart configuration that the toolbox controls -- they're two interfaces to the same state

**Technical requirements:**
- Real-time chart re-rendering on every change (toolbox or AI)
- Undo/redo stack
- Dynamic toolbox panels that adapt to the current chart type
- AI chat streaming responses
- Chart configuration stored as serializable JSON

---

### Step 5: Save, Publish & Schedule

**Publishing outputs:**
- Permanent shareable URL (e.g., `storyanalytics.app/chart/abc123`)
- Embed code (iframe snippet for blogs, reports, CMSs)
- Direct download: SVG, PNG, PDF
- Link to underlying data source or query

**Chart configuration storage:**
- Charts saved as human-readable YAML/JSON configuration files
- Version history (every save creates a snapshot)
- Configuration is Git-friendly: can be version-controlled, diffed, shared

**Scheduling (for database-connected charts):**
- Manual refresh button
- Scheduled refresh at configurable intervals (hourly, daily, weekly)
- SQL re-execution on schedule (for Snowflake/database sources)
- CSV re-upload prompt (for file-based sources)

**Technical requirements:**
- Persistent storage for chart configurations and data snapshots
- Scheduled job runner (cron-based or lightweight task queue)
- URL routing and embedding infrastructure
- Static export rendering (SVG/PNG from chart config)

---

### Step 6: Dashboard Assembly

**Dashboard structure:**
- Responsive two-column grid layout
- 2-6 charts per dashboard (recommended, not enforced)
- Dashboard header with title and description
- Drag-and-drop chart ordering

**Dashboard features:**
- Shareable URL
- Embed code for the full dashboard
- Social sharing (Open Graph meta tags for link previews)
- Email scheduling: send dashboard snapshot to recipients on a regular interval
- Individual chart editing links (click any chart to jump to its editor)
- Dashboard-level date range filter (applies to all charts with date axes)

**Technical requirements:**
- Dashboard composition engine (layout manager)
- Responsive rendering (desktop, tablet, mobile)
- Email delivery system with scheduling
- Dashboard-level permissions (public, link-only, private)
- Thumbnail generation for dashboard gallery view

---

## AI-Powered Chart Hygiene System

This is the differentiating feature. Most tools help you *create* a dashboard. This one helps you *maintain* it.

### Purpose

Automated quality assurance and proactive error resolution so dashboards don't silently break over time.

### Core Capabilities

**1. Data Freshness Monitoring**
- Compare data timestamps against expected refresh schedules
- Detect stale, delayed, or missing data
- Alert users to upstream pipeline issues
- Severity levels: info (1 hour late), warning (1 day late), critical (missed scheduled refresh)

**2. Schema Change Detection**
- Detect renamed, added, or removed columns in the data source
- Propose SQL query adjustments when columns are renamed
- Flag charts that reference columns that no longer exist
- Auto-fix when the change is unambiguous (e.g., column rename with same data type)

**3. Visual Quality Checks**
- Screenshot-based chart validation using AI vision models
- Detect: blank charts, rendering errors, overlapping labels, truncated text, impossible values
- Compare against the chart's previous known-good screenshot
- Flag anomalies: "This chart usually shows values between 0-100, but today's data shows 50,000 -- is this correct?"

**4. Error Resolution**
- Automatic retry for transient failures (database timeouts, connection drops)
- Categorize errors: transient (retry), schema (needs user review), data (upstream issue)
- Maintain an error log with resolution history
- Escalation: auto-fix what's safe, alert the user for everything else

### Monitoring Outputs

- Per-chart health status badge (green/yellow/red) visible on the dashboard gallery
- Email digest: daily or weekly summary of all chart health statuses
- Alert notifications for critical issues (email, and webhook for integrations)
- Execution logs: every refresh attempt with timing, status, and any issues

### Technical Requirements

- Scheduled job runner for hygiene checks
- LLM integration (vision model for screenshot analysis, reasoning model for error categorization)
- Screenshot renderer (Playwright, headless browser)
- Structured logging and error taxonomy
- Notification/alert delivery system

---

## Visual Design: Publication-Ready Defaults

The visual quality of the default output is a core product differentiator. Every chart must look publication-ready with zero manual styling.

### Design Principles (Datawrapper-inspired)

1. **Minimal chrome.** No unnecessary gridlines, borders, or backgrounds. The data is the focus.
2. **Typography-first.** Clear, readable fonts. Titles that communicate, not decorate.
3. **Restrained color.** Default to a single-hue palette. Multiple colors only when encoding data dimensions.
4. **Generous whitespace.** Charts breathe. Labels never overlap.
5. **Responsive by default.** Every chart adapts cleanly to any container width.
6. **Accessible.** Color-blind-safe palettes. Sufficient contrast. Screen-reader-friendly markup.

### Default Styling Spec

```
Font family:       Inter (or system sans-serif fallback)
Title size:        18px, semibold, #1a1a1a
Subtitle size:     14px, regular, #666666
Source note size:  11px, regular, #999999
Axis labels:       12px, regular, #666666
Grid lines:        Horizontal only, #e5e5e5, 1px
Axis lines:        Bottom and left only, #333333, 1px
Default palette:   ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd"]
                   (but prefer single-color with intensity variation)
Background:        White (#ffffff)
Chart padding:     24px all sides
Annotation style:  12px, italic, with leader line
```

### Charting Library: Observable Plot (Proof of Concept)

Observable Plot (from the D3.js team) is the primary candidate for the rendering engine. It produces cleaner, more editorial output than Plotly.js by default.

**Why Observable Plot:**
- Built by the D3 team specifically for concise, publication-quality charts
- Clean SVG output (excellent for static export: SVG, PNG, PDF)
- Declarative API with excellent defaults
- MIT licensed
- Smaller bundle size than Plotly.js

**Proof of concept plan:**
Build the same chart (a line chart with title, subtitle, source note, and annotations) in both Observable Plot and Plotly.js, using publication-ready styling. Compare visual quality, bundle size, interactivity, and ease of customization. The winner becomes the default rendering engine.

**Interactivity considerations:**
Observable Plot produces static SVG by default. For interactive features (hover tooltips, zoom, pan, click-to-filter), we may need:
- A thin interactivity layer on top of Observable Plot, or
- Observable Plot for static/publication output + Plotly.js for interactive dashboards, or
- Observable Plot with D3 event handlers for targeted interactivity

This will be resolved by the proof of concept.

---

## Technical Architecture

### Deployment Models

**Local Mode (primary):**
- Runs entirely on the user's machine
- DuckDB for all data processing
- Charts stored as local YAML/JSON files
- No cloud dependencies -- works offline after install
- AI features require an API key (or a local model)

**Cloud Mode (future):**
- Hosted service with multi-user support
- Centralized chart/dashboard storage
- Snowflake and other cloud database connections
- Shared dashboards with team permissions
- Managed scheduling and hygiene monitoring

### Technology Stack

**Frontend:**
- React (with TypeScript)
- Observable Plot for chart rendering (pending proof of concept; Plotly.js as fallback)
- Zustand for state management
- Vite for build tooling
- Tailwind CSS for UI styling

**Backend:**
- Python / FastAPI
- DuckDB for local data processing and CSV/Parquet/JSON ingestion
- SQLite for application metadata (chart configs, user settings, job history)
- Scheduled task runner for refresh and hygiene jobs

**AI Layer:**
- Provider-agnostic abstraction (already built)
- Supported: Anthropic Claude, OpenAI, Google Gemini
- Future: local models (Llama, Mistral) for air-gapped environments
- Vision model integration for screenshot-based QA

**Storage:**
- Chart configurations: YAML/JSON files (human-readable, Git-friendly)
- Data snapshots: DuckDB tables or Parquet files
- Application state: SQLite
- Screenshots and exports: local filesystem or object storage (cloud mode)

### What Carries Forward from v1

| Component | Status | Notes |
|-----------|--------|-------|
| React frontend framework | **Keep** | Strip down to wizard + editor UI |
| Chart components (15+ types) | **Keep, restyle** | Re-skin for publication-ready defaults; may migrate to Observable Plot |
| FastAPI backend | **Keep** | Solid foundation for routes, auth, persistence |
| DuckDB integration | **Keep** | Already works for CSV → queryable table |
| LLM provider abstraction | **Keep** | Claude/OpenAI/Gemini already wired |
| QA validation (Playwright + vision) | **Keep** | Becomes the chart hygiene system |
| Brand/styling YAML config | **Keep** | Expand for publication-ready themes |
| SQL agent (from pipeline) | **Adapt** | Useful for query generation in AI-led flow |
| Layout agent (from pipeline) | **Adapt** | Useful for AI chart proposal |
| Semantic layer generator | **Drop** | Built for Looker-replacement use case |
| LookML extractor | **Drop** | Enterprise migration tool |
| Metric compiler | **Drop** | Coupled to semantic layer |
| Conversation-first UI | **Drop** | Replace with wizard + editor + sidebar chat |

---

## Database Support

**v1:**
- DuckDB (local: CSV, Parquet, JSON file processing)
- Snowflake (cloud database queries)

**v2:**
- PostgreSQL
- MySQL
- BigQuery
- Redshift
- ClickHouse
- SQLite / local DuckDB files

---

## AI Model Flexibility

**Supported providers (v1):**
- Anthropic (Claude)
- OpenAI (GPT-4 and successors)
- Google Gemini

**Future:**
- Local open-source models (Llama, Mistral) for privacy-sensitive / air-gapped deployments
- Provider-agnostic abstraction layer (already built)
- User-configurable model selection in settings

---

## Non-Functional Requirements

**Performance:**
- AI chart proposal: < 5 seconds from data upload to rendered chart
- Manual wizard preview: < 1 second for chart re-render on any change
- Dashboard load: < 3 seconds
- SQL query timeout: configurable, default 30 seconds

**Security:**
- Secure credential storage for database connections (encrypted at rest)
- No data sent to external services unless the user explicitly uses a cloud AI provider
- Local mode stores everything on-disk, no telemetry

**Accessibility:**
- Color-blind-safe default palettes
- Sufficient contrast ratios (WCAG AA)
- Keyboard-navigable editor
- Screen-reader-friendly chart descriptions (auto-generated alt text)

**Scalability:**
- Support 100+ charts per user
- Handle datasets up to 1M rows for preview and charting
- DuckDB handles the heavy lifting -- it can process much larger datasets locally

---

## Future Enhancements (Post-v1)

- AI-powered SQL query editor (write queries in natural language)
- Collaborative editing and commenting (cloud mode)
- Version control for charts and dashboards (Git integration)
- Advanced chart types: heatmaps, geographic/choropleth maps, network diagrams, Sankey diagrams
- API for programmatic chart creation (headless mode)
- Mobile-responsive dashboard viewing
- Export to PowerPoint / PDF / Google Slides
- Data source catalog and management UI
- Custom theme builder (define your organization's visual identity)
- Webhook integrations for alerts (Slack, Teams, PagerDuty)
- dbt semantic layer integration (MetricFlow)

---

## Open Questions

1. **Naming:** Is "Story Analytics" the right name for this product, or does the pivot warrant a new identity?
2. **Hosting for shareable URLs:** Cloud mode needs a hosting story. Self-hosted? Managed service? Both?
3. **Monetization (if any):** The spec says free and open-source. Is there a managed cloud tier for revenue? Or is this purely a community/research tool?
4. **Observable Plot vs. Plotly.js:** The proof of concept will determine the charting library. What if Observable Plot's interactivity limitations are too constraining?
5. **Local model support timeline:** How important is air-gapped / local-only AI for v1 vs. v2?
