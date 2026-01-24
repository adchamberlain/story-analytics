# Strategic Architecture Review: Story Analytics

## Executive Summary

After reviewing the codebase, test results, and generated outputs, we've identified fundamental architectural constraints that limit visual quality. The core issue isn't the LLM's capability—it's that **Evidence was designed for humans writing markdown, not for LLMs generating polished dashboards**. The indirection (LLM → Markdown → Evidence → ECharts) loses too much control.

## Current Architecture Limitations

### 1. The "Markdown as Dashboard" Problem

Looking at the generated pages like `revenue-and-customer-count-by-industry/+page.md`:

```markdown
<BarChart
    data={query}
    x="industry"
    y={["total_revenue", "customer_count"]}
    echartsOptions={{"grid": {...}, "series": [...]}}
/>
```

The LLM generates text that Evidence interprets. This creates several problems:
- **No layout control**: One chart per page, no grid positioning
- **Limited component API**: Evidence exposes only specific props
- **Styling constraints**: echartsOptions helps but can't override Evidence defaults
- **No dashboard composition**: No way to combine multiple charts, KPIs, text insights

### 2. Visual Quality Gap

Comparing generated output to Tableau/Looker/Mode:
- **Flat, static appearance** vs. animated, interactive feel
- **Basic typography** vs. professional information hierarchy
- **Cluttered sidebar** with auto-generated page names
- **No contextual insights** or data annotations
- **Single chart isolation** instead of dashboard context

### 3. What Works Well (Keep This)

- **SQL generation pipeline**: 97% pass rate, handles complex queries
- **Intent classification**: Good at understanding what users want
- **Filter integration**: DateRange, Dropdown work correctly
- **Design system approach**: YAML-based configuration is right idea

## The Vision: What "LLM-Native" Should Mean

The CLAUDE.md states this should be "AI-native" where the "LLM is the core, not a bolted-on feature." For visualization, this means:

1. **The LLM should control the visual output directly**, not generate intermediate formats
2. **The LLM should reason about visual design**, not just data queries
3. **Output should match Tableau/Looker quality** in polish and professionalism
4. **Multi-chart dashboards** with layouts, not isolated single charts
5. **Contextual intelligence**: automated insights, annotations, explanations

## Recommendation: Custom Rendering Layer with JSON Spec

### Architecture Overview

```
User Request
    ↓
Conversation Engine (keep existing)
    ├─ Intent Classification
    ├─ SQL Generation (keep existing - it works)
    └─ NEW: Dashboard Composition Agent
    ↓
Dashboard Specification (JSON)
    ├─ Layout grid (rows, columns, sizing)
    ├─ Chart configs (full control)
    ├─ KPI cards with formatting
    ├─ Annotations and insights
    └─ Interactive filters
    ↓
Custom React/Vue Frontend
    ├─ Plotly.js or Highcharts (not ECharts via Evidence)
    ├─ Grid layout system (CSS Grid or react-grid-layout)
    ├─ Professional design system
    └─ Full interactivity (cross-filtering, drill-down)
```

### Why Not Other Options?

| Option | Verdict | Reason |
|--------|---------|--------|
| **Stay with Evidence** | No | Fundamental API limitations can't be fixed without forking |
| **Apache Superset** | No | Designed as standalone tool, not embeddable; heavy infrastructure |
| **Metabase/Lightdash** | No | Same issues—designed for point-and-click, not LLM generation |
| **Vega-Lite** | Maybe | Good spec format, but limited chart types and styling |
| **Custom Frontend** | Yes | Full control, can achieve Tableau-quality output |

### The Dashboard Specification Format

Instead of markdown, the LLM generates a JSON dashboard spec:

```json
{
  "title": "Revenue Analysis Dashboard",
  "subtitle": "Q4 2025 Performance Overview",
  "layout": {
    "rows": [
      {"height": "auto", "items": [
        {"type": "kpi", "width": 3, "id": "total_revenue"},
        {"type": "kpi", "width": 3, "id": "customer_count"},
        {"type": "kpi", "width": 3, "id": "avg_order"},
        {"type": "kpi", "width": 3, "id": "growth_rate"}
      ]},
      {"height": 400, "items": [
        {"type": "chart", "width": 8, "id": "revenue_trend"},
        {"type": "chart", "width": 4, "id": "segment_breakdown"}
      ]}
    ]
  },
  "components": {
    "total_revenue": {
      "type": "kpi",
      "query": "SELECT SUM(amount) as value FROM invoices",
      "format": "currency",
      "label": "Total Revenue",
      "trend": {"compare": "previous_quarter", "show_delta": true}
    },
    "revenue_trend": {
      "type": "line",
      "query": "...",
      "x": "month",
      "y": ["revenue", "target"],
      "style": {
        "colors": ["#6366f1", "#e0e7ff"],
        "annotations": [
          {"type": "reference_line", "y": 100000, "label": "Target"}
        ]
      }
    }
  },
  "filters": {
    "date_range": {"type": "daterange", "default": "last_12_months"},
    "segment": {"type": "dropdown", "query": "SELECT DISTINCT segment FROM customers"}
  },
  "insights": [
    "Revenue increased 12% compared to last quarter",
    "Technology segment drives 35% of total revenue"
  ]
}
```

### Key Benefits

1. **Full Layout Control**: Grid-based positioning, responsive design
2. **Rich Chart Types**: Not limited to Evidence's component library
3. **Professional Styling**: Direct control over every visual element
4. **Contextual Intelligence**: Insights, annotations, trend indicators
5. **True Dashboards**: Multiple charts with cross-filtering
6. **Extensible**: Add new chart types without framework constraints

## Implementation Phases

### Phase 1: Foundation ✅ COMPLETE
**Status:** Completed 2026-01-24

**Deliverables:**
- [x] React app scaffold in `app/` with Vite + TypeScript
- [x] Plotly.js chart components (Line, Bar, Area, Scatter, BigValue, DataTable)
- [x] Backend render endpoints (`api/routers/render.py`)
- [x] Feature flag to toggle between Evidence and React renderers
- [x] Test charts for verification

**Key Files:**
- `app/` - React frontend
- `api/routers/render.py` - Render API
- `frontend/src/lib/stores/settings.ts` - Renderer toggle
- `frontend/src/lib/components/ChartEmbed.svelte` - Updated with toggle

---

### Phase 2: Visual Polish ✅ COMPLETE
**Status:** Completed 2026-01-24

**Goal:** Make React charts look professional (Tableau/Looker quality)

**Deliverables:**
- [x] Professional design system
  - Typography scale (text-xs through text-4xl)
  - Color palette with semantic colors (trend-up, trend-down, trend-neutral)
  - Spacing system (space-1 through space-12)
  - Transitions (fast, base, slow)
- [x] Enhanced BigValue/KPI cards
  - Trend indicators (TrendIndicator.tsx - up/down arrows with semantic color)
  - Comparison values (DeltaValue.tsx - formatted change with sign/color)
  - Sparkline mini-charts (Sparkline.tsx - inline Plotly charts)
- [x] Chart improvements
  - Better axis formatting (smart SI prefixes via formatters.ts)
  - Grid line styling (semi-transparent, zero-line highlighting)
  - Hover tooltips with formatting (createHoverTemplate)
  - Smooth animations on load/update (fade-in CSS, Plotly transitions)
- [x] Loading states
  - Skeleton loaders (SkeletonBase.tsx, ChartSkeleton.tsx)
  - Smooth fade transitions

**Key Files Created:**
- `app/src/utils/formatters.ts` - Number formatting utilities
- `app/src/components/charts/TrendIndicator.tsx` - Arrow indicators
- `app/src/components/charts/DeltaValue.tsx` - Change value display
- `app/src/components/charts/Sparkline.tsx` - Mini inline charts
- `app/src/components/skeletons/` - Loading skeleton components

---

### Phase 3: Chat UI Migration ✅ COMPLETE
**Status:** Completed 2026-01-24

**Goal:** Move conversation UI from SvelteKit to React (unified frontend)

**Deliverables:**
- [x] Chat components in React
  - Message.tsx - Message display with markdown, action buttons
  - ChatInput.tsx - Auto-resizing textarea
  - ProgressSteps.tsx - Streaming progress indicator
- [x] Conversation state management
  - conversationStore.ts - Full Zustand store
  - API client with SSE streaming support
- [x] Chat page
  - Welcome state with example prompts
  - Message list with auto-scroll
  - Dashboard creation success state
- [x] Navigation
  - Sidebar with conversation history
  - Dashboard list
  - New conversation button

**Key Files:**
- `app/src/components/chat/` - Chat components
- `app/src/stores/conversationStore.ts` - Chat state
- `app/src/pages/ChatPage.tsx` - Main chat page
- `app/src/components/layout/Sidebar.tsx` - Navigation sidebar

---

### Phase 4: Deprecate SvelteKit ✅ COMPLETE
**Status:** Completed 2026-01-24

**Goal:** Single unified React app replaces SvelteKit frontend

**Deliverables:**
- [x] All SvelteKit routes migrated to React
  - Login page with magic link auth
  - Auth verify page
  - Charts list page with search/filter/preview
  - Dashboards list page
  - Settings page
- [x] Authentication flow in React
  - ProtectedRoute component
  - JWT token management
  - Redirect to login when not authenticated
- [x] Remove SvelteKit from `dev.sh`
  - React is now the primary frontend
  - Evidence optional (--evidence flag)
- [x] Update documentation

**Key Files:**
- `app/src/pages/LoginPage.tsx` - Magic link login
- `app/src/pages/VerifyPage.tsx` - Token verification
- `app/src/pages/ChartsPage.tsx` - Charts library
- `app/src/pages/DashboardsPage.tsx` - Dashboard list
- `app/src/pages/SettingsPage.tsx` - User settings
- `app/src/components/auth/ProtectedRoute.tsx` - Auth guard

---

### Phase 5: Remove Evidence ✅ COMPLETE
**Status:** Completed 2026-01-24

**Goal:** Delete Evidence/markdown generation entirely

**Deliverables:**
- [x] Remove Evidence from `dev.sh`
- [x] Delete `pages/` markdown generation code
- [x] Delete `.evidence/` directory
- [x] Delete `evidence.config.yaml` and `Dockerfile.evidence`
- [x] Delete `engine/generator.py` (EvidenceGenerator)
- [x] Delete `engine/components/evidence.yaml`
- [x] Remove Evidence NPM dependencies from `package.json`
- [x] Remove `to_evidence_markdown()` methods from models
- [x] Update `dashboard_composer.py` to not write files
- [x] Update `conversation.py` and `chart_conversation.py`
- [x] Update tests to not reference Evidence

---

## Alternative: Evidence Fork with Custom Components

If building from scratch feels too ambitious, consider:

1. **Fork Evidence** to remove component API restrictions
2. **Create custom Svelte components** with full ECharts access
3. **Modify the markdown parser** to support layout directives

This preserves the SQL/DuckDB infrastructure while unlocking styling control. However, you'd be maintaining a fork indefinitely.

## Charting Library Comparison

| Library | Pros | Cons | Recommendation |
|---------|------|------|----------------|
| **Plotly.js** | Excellent defaults, good interactivity, wide chart variety | Larger bundle size | Best balance |
| **Highcharts** | Most polished, best animations | Commercial license | Good if licensed |
| **ECharts (direct)** | Powerful, Evidence uses it | Complex API | If familiar |
| **D3.js** | Ultimate flexibility | Requires building everything | Only for custom needs |
| **Chart.js** | Lightweight, simple | Limited customization | Too basic |
| **Observable Plot** | Modern, composable | Newer, less ecosystem | Worth watching |

## Final Recommendation

**Build a custom React frontend with Plotly.js**, keeping the existing SQL generation pipeline. This gives you:

1. **Tableau-level visual quality** through direct chart control
2. **Dashboard layouts** with multiple charts
3. **LLM-native design** where the model controls visual output directly
4. **Future flexibility** to add any visualization type
5. **Clear separation** between data (SQL) and presentation (JSON spec)

The existing Python engine and SQL generation are strong—the bottleneck is entirely in the Evidence rendering layer. Replacing that layer unlocks the full potential of the LLM-driven approach.

---

## Appendix: Current Test Results

### Standard Tests (30 tests)
| Provider | Pass Rate |
|----------|-----------|
| Claude | 97% (29/30) |
| OpenAI | 97% (29/30) |
| Gemini | 97% (29/30) |

### Advanced Tests (30 tests)
| Provider | Pass Rate |
|----------|-----------|
| Claude | 60% (18/30) |
| OpenAI | 57% (17/30) |
| Gemini | 53% (16/30) |

The ~40% drop on advanced tests reflects limitations in complex analytics (MoM growth, conditional aggregation, threshold filtering) rather than visual quality—these would persist regardless of frontend choice.

---

*Document created: 2026-01-24*
