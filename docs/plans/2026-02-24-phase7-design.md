# Phase 7 Design: Embed Flags, Chart Types, Accessibility

> **Date**: 2026-02-24
> **Status**: Approved
> **Execution**: 3 parallel worktree sessions (K, L, M)

## Overview

Phase 7 closes the remaining high-impact Datawrapper parity gaps:
1. Embed render flags (5 query params)
2. Six additional chart types (19 → 25)
3. WCAG AA accessibility essentials

SVG/PDF export was identified as already implemented in `chartExport.ts` — removed from scope.

---

## Session K: Embed Render Flags

**Files**: `EmbedChartPage.tsx`, `EmbedDashboardPage.tsx`, tests

Add 5 query parameters to embed pages, parsed via `useSearchParams()` alongside the existing `?theme` param.

| Flag | Values | Behavior |
|------|--------|----------|
| `?plain=true` | `true`/`false` | Hide title, subtitle, source, footer — chart visualization only |
| `?static=true` | `true`/`false` | Disable tooltips, hover effects, zoom, click interactions |
| `?transparent=true` | `true`/`false` | Background becomes transparent instead of theme color |
| `?logo=on\|off` | `on`/`off` | Override theme logo visibility |
| `?search=<text>` | any string | Pre-fill table search box (DataTable charts only) |

### Implementation Details

- **plain**: Conditionally render header/footer wrapper divs based on flag
- **static**: Pass `interactive={false}` prop through to chart components; ChartWrapper skips mouse/touch event handlers; map zoom disabled
- **transparent**: Override container `background` style to `transparent`
- **logo**: Override `showLogo` in the theme config object before passing to ChartWrapper
- **search**: Pass as `initialSearch` prop to RichDataTable; ignored for non-table chart types

### Tests (~15 vitest)
- 3 per flag: both embed pages + edge case (e.g., search on non-table chart is no-op)

---

## Session L: Chart Types (6 New)

**Files**: `chart.ts`, `editorStore.ts`, `ChartTypeSelector.tsx`, `ObservableChartFactory.tsx`, tests

All types follow the established 5-file wiring pattern. Total chart types: 19 → 25.

### Stacked Column (`StackedColumn`)
- Observable Plot `barY` mark with `fill: series`, absolute stacking (`offset: null`)
- Vertical bars split into sub-categories
- Config: `x` (category), `y` (value), `series` (stack groups)

### Grouped Column (`GroupedColumn`)
- Observable Plot `barY` with `fx` facet for side-by-side grouping
- One bar per series value within each category
- Config: `x` (category), `y` (value), `series` (group variable)

### Split Bars (`SplitBars`)
- Two `barX` marks diverging from center (left/right)
- Classic population pyramid / diverging bar layout
- Config: `x` (category), `leftColumn`, `rightColumn` (two value columns)
- New EditorConfig fields: `leftColumn?: string`, `rightColumn?: string`

### Arrow Plot (`ArrowPlot`)
- Observable Plot `arrow` mark from `(startValue, category)` to `(endValue, category)`
- Horizontal arrows showing directional change per category
- Config: `x` (category), `startColumn`, `endColumn`
- New EditorConfig fields: `startColumn?: string`, `endColumn?: string`

### Election Donut (`ElectionDonut`)
- Custom React component (not Observable Plot) — hemicycle/parliament seat layout
- D3 arc generator arranged in semicircular rows
- Config: `x` (party/group name), `y` (seat count), palette for party colors
- Early return in factory, similar to PieChart/Treemap pattern

### Multiple Pies/Donuts (`MultiplePies`)
- Small multiples grid layout reusing `PieChartComponent`
- Each facet value gets its own pie/donut
- Config: `facetColumn` (split variable), `x` (category), `y` (value)
- New EditorConfig field: `pieVariant?: 'pie' | 'donut'`

### Tests (~20 vitest)
- Type registration tests (each type in ChartType union)
- Config field tests (new fields save/load correctly)
- Mark builder output tests (correct Plot marks generated)

---

## Session M: Accessibility (WCAG AA Essentials)

**Files**: `chart.ts`, `editorStore.ts`, `ObservableChartFactory.tsx`, `ChartWrapper.tsx`, `RichDataTable.tsx`, `ColorblindPreview.tsx`, `colorblind.ts`, Toolbox component, tests

### Alt Text Field
- Add `altText?: string` to `ChartConfig` in `chart.ts`
- Add textarea input in editor Toolbox (below source field)
- Render as `<desc>` element inside chart SVG
- Embed pages: set `<meta name="description" content={altText}>` for SEO/accessibility

### ARIA on SVG Charts
- Observable Plot SVG wrapper:
  - `role="img"` on SVG element
  - `aria-label` = alt text (fallback: chart title)
  - `aria-describedby` pointing to hidden data summary
- Auto-generated hidden summary `<div>`: "{chartType} showing {y} by {x} with {rowCount} data points"
- Map SVGs: `role="img"` + `aria-label` on map container

### Keyboard Focus Indicators
- `tabIndex={0}` on interactive chart containers (ChartWrapper)
- Focus ring: 2px blue outline via CSS (`outline: 2px solid #3b82f6; outline-offset: 2px`)
- RichDataTable: `tabIndex={0}` on sortable `<th>` elements; `Enter`/`Space` triggers sort
- Map zoom buttons: add visible focus ring styles (already have aria-labels)

### Colorblind Warnings
- Activate existing `contrastRatio()` in `colorblind.ts`
- `ColorblindPreview` enhancement:
  - After CVD simulation, compare all adjacent color pairs
  - If any pair contrast ratio < 3:1, show warning: "These colors may be hard to distinguish for viewers with {CVD type}"
  - Highlight problematic swatches with orange warning border
- Palette selector in Toolbox: show "Colorblind Safe" badge or warning indicator

### Tests (~20 vitest)
- ARIA attribute rendering (role, aria-label, aria-describedby)
- Alt text propagation from config to SVG desc
- Keyboard sort on table headers (Enter/Space)
- Colorblind warning threshold (pairs below 3:1 flagged)
- Warning badge display logic

---

## Session Dependencies & Merge Order

```
K (Embed Flags) ──┐
L (Chart Types) ───┤── all independent, merge any order
M (Accessibility) ─┘
```

Recommended merge order: K → L → M (simplest to most diffuse changes).

---

## Test Budget

| Session | Vitest | Total |
|---------|--------|-------|
| K: Embed Flags | ~15 | 15 |
| L: Chart Types | ~20 | 20 |
| M: Accessibility | ~20 | 20 |
| **Phase 7 Total** | | **~55** |

Running total after Phase 7: ~668 tests (613 + 55).
