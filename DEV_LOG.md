# Development Log

This log captures development changes made during each session. Review this at the start of each session to understand recent context and continue where we left off.

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
