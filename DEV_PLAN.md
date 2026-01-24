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

### Phase 1: Foundation (Recommended First Step)
- Build React frontend with Plotly.js
- Implement JSON spec parser
- Create basic layout grid
- Connect to existing SQL pipeline
- Parallel: Keep Evidence running for comparison

### Phase 2: Visual Polish
- Professional design system (typography, spacing, colors)
- KPI cards with trend indicators
- Chart annotations and reference lines
- Loading states and animations

### Phase 3: Intelligence Layer
- Auto-generated insights from data
- Anomaly highlighting
- Comparative analysis (vs. previous period)
- Natural language explanations

### Phase 4: Interactivity
- Cross-filtering between charts
- Drill-down capabilities
- Export (PDF, PNG, data)
- Sharing and embedding

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
