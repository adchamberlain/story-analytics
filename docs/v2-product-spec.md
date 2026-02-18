# Product Specification: Story Analytics v2

## Positioning

**Publication-ready charts, open-source, from any data source, powered by AI.**

The only open-source tool that combines publication-ready visual quality with AI-powered chart creation. Upload a CSV or connect a database, and get a polished, shareable chart in seconds.

**Website:** [storyanalytics.ai](https://storyanalytics.ai/)
**License:** MIT

---

## Why This Exists

The data visualization landscape has a clear gap:

| Tool | Beautiful output | Open source | AI-native |
|------|:---:|:---:|:---:|
| Datawrapper | Yes | No | No |
| Flourish | Yes | No | No |
| Apache Superset | No | Yes | No |
| Metabase | No | Yes | Partial |
| Evidence.dev | Yes | Yes | No |
| **Story Analytics** | **Yes** | **Yes** | **Yes** |

No open-source tool produces publication-ready visualizations with AI-driven creation. That's the product.

---

## Target Users

Researchers, data analysts, economists, and BI professionals who:

- Have clean data (CSV files or SQL queries) ready to visualize
- Want publication-ready output without paying for a SaaS tool
- Want both a fast manual workflow and an AI-assisted one
- May need to run everything locally (privacy, air-gapped environments)

**Day-one scenario:** A researcher uploads a CSV of monthly employment figures. In under 30 seconds, they have a publication-ready line chart with proper axis formatting, a source note, and a shareable URL.

---

## Product Goals

1. **Publication-ready defaults.** Every chart should look like it belongs in The Economist or the NYT without manual styling effort.
2. **AI + manual.** AI-assisted creation for exploration; direct controls for users who know exactly what they want.
3. **Local-first, cloud-optional.** Runs entirely on a user's machine with DuckDB. No cloud dependencies.
4. **Open source.** Free forever under MIT. No feature gating, no "enterprise tier."

---

## What's Built

### Data Sources

**CSV & paste:**
- CSV file upload (drag-and-drop or file picker) → auto-ingested into DuckDB
- Paste tabular data (CSV/TSV) directly into the app
- Data preview step after upload showing table with row/column stats

**Database connections (pluggable connector system):**
- Snowflake
- PostgreSQL
- BigQuery

Each connector supports test connection, table listing, and sync to DuckDB. Credentials are passed per-request (not stored in DB).

**Source management:**
- Dedicated `/sources` page with separate sections for database connections and uploaded files
- Delete sources (drops DuckDB table, removes files from disk)
- Type badges (CSV, Snowflake, Postgres, BigQuery) with row/column counts

---

### Chart Editor

Three-pane layout: Toolbox (left), Chart Preview (center), AI Assistant (right).

```
┌──────────────┬─────────────────────────┬──────────────┐
│              │                         │              │
│   Toolbox    │    Chart Preview        │  AI Assistant│
│              │                         │              │
│  Data config │    Live Observable      │  "Make the   │
│  Chart type  │    Plot rendering       │   bars       │
│  Styling     │    with pub-ready       │   horizontal"│
│  Annotations │    defaults             │              │
│              │                         │  "Change to  │
│              │                         │   a line     │
│              │                         │   chart"     │
│              │                         │              │
└──────────────┴─────────────────────────┴──────────────┘
```

**Chart types (10):**

| Type | Rendering |
|------|-----------|
| Bar (vertical/horizontal/stacked) | Observable Plot |
| Line | Observable Plot |
| Area | Observable Plot |
| Scatter | Observable Plot |
| Histogram | Observable Plot |
| Heatmap | Observable Plot |
| Box Plot | Observable Plot |
| Pie / Donut | Custom D3 |
| Treemap | Custom D3 |
| Big Value (KPI) | Custom D3 |

Data table view is also available for any source.

**Data configuration:**
- Two data modes: Table (column mapping) or SQL (custom query editor)
- X-axis, Y-axis, and Series (color grouping) column selectors
- Multi-Y column selection for wide-format data (DuckDB UNPIVOT)
- Aggregation: None, Sum, Average, Median, Count, Min, Max
- Time grain for date columns: As-is, Daily, Weekly, Monthly, Quarterly, Yearly
- SQL editor with syntax highlighting, Cmd+Enter execution, table name hints

**Text & metadata:**
- Title, subtitle
- Source attribution with optional hyperlink
- X-axis and Y-axis labels

**Styling:**
- Color palettes: Default (multi-color), Blues, Reds, Greens (sequential)
- Horizontal orientation toggle (bar charts)
- Sort by value toggle
- Stacked mode (when series is selected)
- Grid lines toggle
- Legend show/hide (custom React legend, not Observable Plot built-in)

**Annotations (3 types):**
- **Reference lines** — horizontal or vertical, with label and color
- **Point notes** — click-to-place on data points, draggable labels with smart edge-clipping
- **Highlight ranges** — shaded regions with draggable edge handles, opacity control

**Editor UX:**
- Undo/redo (Cmd+Z / Cmd+Shift+Z) with full config history
- Auto-save detection with "Unsaved" badge
- Discard changes to revert to last saved state
- Keyboard shortcuts: Save (Cmd+S), Undo, Redo

---

### AI Assistant

The AI assistant lives in the right sidebar of the chart editor.

**Chart proposal:** When creating a new chart, the AI examines the data schema (column types, sample values, row count) and proposes a chart type, axis mappings, title, subtitle, and SQL query.

**Natural language editing:** In the editor, users can modify the chart via conversation:
- Change chart type, colors, orientation, sorting
- Add or modify annotations
- Adjust styling and layout
- The AI modifies the same chart configuration as the toolbox controls

**Supported LLM providers:**
- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)
- Inline provider dropdown in the AI panel when multiple are configured
- Provider and API key management in Settings

---

### Charting: Observable Plot

Observable Plot (from the D3.js team) is the rendering engine. This decision was made after evaluating Plotly.js — Observable Plot produces cleaner, more editorial SVG output.

**Why Observable Plot:**
- Built for concise, publication-quality charts
- Clean SVG output (excellent for static export)
- Declarative API with sensible defaults
- MIT licensed, small bundle size

**React integration:**
- `useObservablePlot` hook (useRef + useEffect + ResizeObserver pattern)
- Charts resize responsively with their container
- Custom React legend (Observable Plot's built-in legend is unreliable for stroke-based marks)
- Explicit x-axis domain ordering to preserve SQL ORDER BY (Plot alphabetically sorts string domains by default)
- Hover tooltips on all chart types
- Dark mode support via CSS custom properties

**Custom D3 renderers** for Pie/Donut, Treemap, and Big Value (KPI) — chart types not well-served by Observable Plot's grammar.

---

### Dashboards

**Dashboard builder:**
- Two-column responsive grid layout using `react-grid-layout`
- Drag-and-drop chart reordering
- Resizable cells (half-width or full-width)
- Chart picker modal to add existing charts or create new ones
- Title and description editing
- Live preview with actual data rendering

**Dashboard view:**
- Read-only grid with full chart rendering and annotations
- Health status indicators (red/amber dots for charts with errors)
- Error states with messages (schema change detection, missing source)
- Clickable chart titles linking to individual chart view

---

### Publishing & Export

**Sharing:**
- Permanent shareable URL per chart (`/chart/{id}`)
- Embed code (iframe snippet, copy-to-clipboard)

**Export formats:**
- SVG (vector, from Observable Plot output)
- PNG (raster, SVG → Canvas → download)
- PDF (with title and source metadata)

---

### Authentication

Passwordless magic link authentication:
- Email-based magic links (15-minute expiry)
- JWT session tokens
- Auto-creates accounts on first login
- User profile with name and preferences

---

### Onboarding

First-run wizard shown when no dashboards exist:
- Two paths: "Upload a CSV" or "Connect a Database"
- Navigates to `/sources` to get started
- Dismissible with "Skip for now"

---

## Technical Architecture

### Technology Stack

**Frontend:**
- React with TypeScript
- Observable Plot + custom D3 for chart rendering
- Tailwind CSS v4
- Vite for build tooling

**Backend:**
- Python / FastAPI
- DuckDB for local data processing (CSV, Parquet, JSON ingestion)
- SQLite for application metadata (chart configs, user settings)

**AI Layer:**
- Provider-agnostic abstraction supporting Claude, GPT, and Gemini
- Schema + sample data sent to the model (not the full dataset)
- Conversation engine with chart proposal and editor modification modes

**Local-first deployment:**
- Runs entirely on the user's machine
- DuckDB for all data processing
- No cloud dependencies (AI features require a provider API key)

---

## Visual Design Principles

1. **Minimal chrome.** No unnecessary gridlines, borders, or backgrounds. The data is the focus.
2. **Typography-first.** Clear, readable fonts. Titles that communicate, not decorate.
3. **Restrained color.** Default to a single-hue palette. Multiple colors only when encoding data dimensions.
4. **Generous whitespace.** Charts breathe. Labels never overlap.
5. **Responsive by default.** Every chart adapts cleanly to any container width.

---

## Roadmap

Potential future work, roughly ordered by priority. Nothing here is committed.

### Near-term
- Trend/regression line overlay (linear, polynomial)
- Additional color palettes and custom hex color input
- Number formatting controls (currency, percentage, compact notation)
- Dashboard-level date range filter
- Scheduled data refresh for database-connected charts

### Medium-term
- Chart hygiene system: automated data freshness monitoring, schema change detection, and error alerting
- Cloud hosting mode for shared dashboards
- Additional database connectors (MySQL, Redshift, ClickHouse)
- Custom theme builder (organization brand identity)
- Mobile-responsive dashboard viewing

### Longer-term
- Local/open-source LLM support for air-gapped environments
- Geographic/choropleth map chart type
- Collaborative editing and commenting
- API for programmatic chart creation (headless mode)
- Export to PowerPoint / Google Slides
