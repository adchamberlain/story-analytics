# KPI Grid + Data Shape Advisor — Design

## Problem

Users with row-oriented KPI data (metric name, value, target per row) can't use BigValue charts because BigValue only reads the first row. More broadly, users don't know what data shape each chart type expects, leading to confusion when charts render incorrectly or show nothing useful.

## Solution

Two features:

1. **KPI Grid mode** — BigValue auto-switches to a responsive card grid when data has multiple rows and a label column is mapped.
2. **Data Shape Advisor** — A rules-based analyzer that detects data/chart mismatches and shows a helpful banner with suggestions and actions.

---

## 1. KPI Grid — BigValue Enhancement

### Behavior

- `data.length === 1` or no `metricLabel` set: current single-value rendering (backward compatible).
- `data.length > 1` and `metricLabel` is set: grid mode — one card per data row.

### New Config Field

`metricLabel: string | null` — column containing metric names (e.g. "metric"). Added to `EditorConfig` and `ChartConfig` with default `null`.

### Editor UI (Toolbox)

New "Label column" dropdown in `BigValueColumnMapping`, above the existing "Value column". Populated from string-type columns. When set, enables grid mode.

### Rendering (BigValueChart)

- Responsive CSS grid: 3 columns wide, 2 medium, 1 narrow.
- Each card: label text from `metricLabel` column, formatted value, optional delta vs comparison.
- `valueFormat` applies globally to all cards.

### Example Flow (user's CSV)

1. Upload `kpi.csv` (6 rows: Total Revenue, Active Users, etc.)
2. Select BigValue chart type
3. Set Label = "metric", Value = "value", Goal = "target", Format = "Number"
4. See all 6 KPIs in a grid

---

## 2. Data Shape Advisor

### Core Utility

`analyzeDataShape(data, columns, columnTypes, chartType, config) → ShapeAdvice[]`

Pure function, no React dependency, trivially testable.

```ts
interface ShapeAdvice {
  level: 'info' | 'warning'
  message: string
  action?: {
    label: string
    type: 'switchChart' | 'hint'
    chartType?: ChartType
  }
}
```

### Rules (starting set)

| Chart Type | Condition | Message | Action |
|------------|-----------|---------|--------|
| BigValue | rows > 20 | "KPI charts work best with a few summary rows. You have {n}." | Switch to Bar |
| BigValue | rows > 1, no metricLabel | "Multiple rows detected — set a Label column to show a KPI grid." | hint |
| BigValue | rows === 0 | "No data rows. Check your query." | — |
| Line | no date/timestamp column | "Line charts need a time column. None detected." | Switch to Bar |
| Pie | distinct categories > 10 | "Pie charts work best with <10 slices. You have {n}." | Switch to Bar |
| Pie | rows === 1 | "Pie charts need multiple rows." | Switch to BigValue |
| Bar | rows === 1 | "Bar charts need multiple rows. You have 1." | Switch to BigValue |
| Bar | rows > 500 | "Large dataset ({n} rows). Consider aggregating." | hint |

Rules are functions: `(data, config, columns) → ShapeAdvice | null`. Easy to add more over time.

### UI

Slim banner below the chart type selector in Toolbox. Amber background for warnings, blue for info. Each item: one line of text + optional action button. Dismissible per session. Hidden when no advice.

### When It Runs

On changes to `data`, `chartType`, or BigValue config fields. Computed via `useMemo` — no API calls, pure client-side.

### Action Behavior

- `switchChart`: calls `store.updateConfig({ chartType })` — same as clicking a chart type button.
- `hint`: informational only, no state change.

---

## Integration

- Advisor runs in Toolbox via useMemo, banner renders conditionally.
- KPI Grid export: cards are divs, captured by existing PNG/SVG export pipeline.
- Dashboard embed: grid columns collapse responsively within cell.
- Saved charts with `metricLabel` set reload into grid mode automatically.

## Not in Scope (YAGNI)

- Per-card formatting from a `unit` column — global `valueFormat` for now.
- Sparklines inside grid cards.
- Auto-detection of KPI data before user picks BigValue.
- Modal or blocking UI — banner only.
