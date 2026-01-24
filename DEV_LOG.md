# Development Log

This log captures development changes made during each session. Review this at the start of each session to understand recent context and continue where we left off.

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
- [ ] Add visual polish and animations
- [ ] Implement feature flag in SvelteKit frontend for A/B testing
- [ ] Phase 2: Chat UI migration

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
