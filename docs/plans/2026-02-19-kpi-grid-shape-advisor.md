# KPI Grid + Data Shape Advisor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** BigValue charts support a KPI grid mode for multi-row metric data, and a shape advisor warns users about data/chart mismatches with actionable suggestions.

**Architecture:** Two independent features sharing no state. The KPI grid is an enhancement to BigValueChart that detects multi-row data when a `metricLabel` column is mapped. The shape advisor is a pure utility (`analyzeDataShape`) called from Toolbox via `useMemo`, rendering a banner when advice exists.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest

---

### Task 1: Add `metricLabel` to type definitions and store

**Files:**
- Modify: `app/src/types/chart.ts:174-187` — add `metricLabel` to ChartConfig
- Modify: `app/src/stores/editorStore.ts:12-69` — add `metricLabel` to EditorConfig + DEFAULT_CONFIG
- Modify: `app/src/pages/EditorPage.tsx:96-114` — pass `metricLabel` through to ChartConfig

**Step 1: Add `metricLabel` to ChartConfig**

In `app/src/types/chart.ts`, after line 173 (`legendLabel?: string`), within the KPI/BigValue options block (before `comparisonValue`), add:

```ts
  /** Column containing metric name labels for KPI grid mode */
  metricLabel?: string
```

**Step 2: Add `metricLabel` to EditorConfig + default**

In `app/src/stores/editorStore.ts`:

- After `positiveIsGood: boolean` (line 39), add: `metricLabel: string | null`
- In `DEFAULT_CONFIG` after `positiveIsGood: true,` (line 68), add: `metricLabel: null,`

**Step 3: Pass through in EditorPage**

In `app/src/pages/EditorPage.tsx`, after the `positiveIsGood` line (113), add:

```ts
    metricLabel: store.config.metricLabel ?? undefined,
```

**Step 4: Commit**

```
feat: add metricLabel field to BigValue config
```

---

### Task 2: KPI grid rendering in BigValueChart

**Files:**
- Modify: `app/src/components/charts/ObservableChartFactory.tsx:1172-1212` — enhance BigValueChart
- Test: `app/src/__tests__/bigValueGrid.test.ts` — new test file

**Step 1: Write the failing tests**

Create `app/src/__tests__/bigValueGrid.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

// Test the grid detection logic as a pure function
// (extracted from BigValueChart for testability)

import { formatBigValue, shouldShowGrid } from '../components/charts/bigValueHelpers'

describe('shouldShowGrid', () => {
  it('returns false when data has 1 row', () => {
    expect(shouldShowGrid(1, 'metric')).toBe(false)
  })

  it('returns false when metricLabel is undefined', () => {
    expect(shouldShowGrid(5, undefined)).toBe(false)
  })

  it('returns true when data has multiple rows and metricLabel is set', () => {
    expect(shouldShowGrid(5, 'metric')).toBe(true)
  })
})

describe('formatBigValue', () => {
  it('formats currency', () => {
    expect(formatBigValue(1284500, 'currency')).toBe('$1,284,500')
  })

  it('formats percent', () => {
    expect(formatBigValue(3.8, 'percent')).toBe('3.8%')
  })

  it('formats number with locale', () => {
    expect(formatBigValue(45230, 'number')).toBe('45,230')
  })

  it('formats number by default (no format)', () => {
    expect(formatBigValue(45230, undefined)).toBe('45,230')
  })

  it('returns dash for null', () => {
    expect(formatBigValue(null, undefined)).toBe('—')
  })

  it('returns string value as-is', () => {
    expect(formatBigValue('hello', undefined)).toBe('hello')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/__tests__/bigValueGrid.test.ts`
Expected: FAIL — module not found

**Step 3: Create bigValueHelpers.ts**

Create `app/src/components/charts/bigValueHelpers.ts`:

```ts
export function shouldShowGrid(
  rowCount: number,
  metricLabel: string | undefined,
): boolean {
  return rowCount > 1 && !!metricLabel
}

export function formatBigValue(
  value: unknown,
  format: 'currency' | 'percent' | 'number' | undefined,
): string {
  if (value == null) return '—'
  if (typeof value !== 'number') return String(value)
  if (format === 'currency') return `$${value.toLocaleString()}`
  if (format === 'percent') return `${value.toFixed(1)}%`
  return value.toLocaleString()
}
```

**Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/__tests__/bigValueGrid.test.ts`
Expected: PASS (all 6 tests)

**Step 5: Enhance BigValueChart rendering**

In `app/src/components/charts/ObservableChartFactory.tsx`, replace the `BigValueChart` function (lines 1172–1212) with:

```tsx
function BigValueChart({ data, config }: { data: Record<string, unknown>[]; config: ChartConfig }) {
  if (data.length === 0) return null

  const { shouldShowGrid, formatBigValue } = require('./bigValueHelpers')

  // Grid mode: multiple rows + metricLabel set
  if (shouldShowGrid(data.length, config.metricLabel)) {
    const positiveIsGood = config.positiveIsGood !== false
    return (
      <div
        className="grid gap-4 w-full py-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        {data.map((row, i) => {
          const label = config.metricLabel ? String(row[config.metricLabel] ?? '') : `Metric ${i + 1}`
          const valueField = config.value ?? (Array.isArray(config.y) ? config.y[0] : config.y)
          const value = valueField ? row[valueField as string] : null
          const compValue = config.comparisonValue ? row[config.comparisonValue] : null
          const delta = (typeof value === 'number' && typeof compValue === 'number')
            ? value - compValue
            : null

          return (
            <div
              key={i}
              className="rounded-xl border border-border-default bg-surface p-4 flex flex-col"
            >
              <div className="text-xs font-medium text-text-muted mb-1 truncate">{label}</div>
              <div className="text-2xl font-bold text-chart-blue">
                {formatBigValue(value, config.valueFormat)}
              </div>
              {delta !== null && (
                <div
                  className={`text-xs mt-1 font-medium ${
                    (delta >= 0) === positiveIsGood ? 'text-chart-green' : 'text-chart-red'
                  }`}
                >
                  {delta >= 0 ? '+' : ''}{delta.toLocaleString()}
                  {config.comparisonLabel && (
                    <span className="text-text-muted ml-1 font-normal">{config.comparisonLabel}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Single-value mode (original behavior)
  const row = data[0]
  const valueField = config.value ?? (Array.isArray(config.y) ? config.y[0] : config.y)
  const value = valueField ? row[valueField as string] : null
  const compValue = config.comparisonValue ? row[config.comparisonValue] : null
  const positiveIsGood = config.positiveIsGood !== false

  const delta = (typeof value === 'number' && typeof compValue === 'number')
    ? value - compValue
    : null

  return (
    <div className="flex flex-col items-center justify-center h-full py-8">
      <div className="text-4xl font-bold text-chart-blue">
        {formatBigValue(value, config.valueFormat)}
      </div>
      {delta !== null && (
        <div
          className={`text-sm mt-2 font-medium ${
            (delta >= 0) === positiveIsGood ? 'text-chart-green' : 'text-chart-red'
          }`}
        >
          {delta >= 0 ? '+' : ''}{delta.toLocaleString()}
          {config.comparisonLabel && (
            <span className="text-text-muted ml-1 font-normal">{config.comparisonLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}
```

Note: Use a proper ESM import at the top of the file instead of `require()` — add `import { shouldShowGrid, formatBigValue } from './bigValueHelpers'` alongside the other imports near the top of the file.

**Step 6: Run all tests**

Run: `cd app && npx vitest run`
Expected: All pass

**Step 7: Commit**

```
feat: add KPI grid rendering for multi-row BigValue data
```

---

### Task 3: Label column dropdown in Toolbox

**Files:**
- Modify: `app/src/components/editor/Toolbox.tsx:552-613` — add Label column dropdown to BigValueColumnMapping

**Step 1: Add Label column dropdown**

In the `BigValueColumnMapping` function (line 567), add a new `ColumnDropdown` as the **first** item inside the `<div className="space-y-2">`:

```tsx
      <ColumnDropdown
        label="Label column"
        value={config.metricLabel}
        columns={columns}
        columnTypes={columnTypes}
        allowNone
        onChange={(metricLabel) => updateConfig({ metricLabel })}
      />
```

This goes **before** the existing "Value column" dropdown (line 568).

**Step 2: Verify build**

Run: `cd app && ./node_modules/.bin/tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
feat: add Label column dropdown for KPI grid mode
```

---

### Task 4: Data Shape Advisor utility + tests

**Files:**
- Create: `app/src/utils/analyzeDataShape.ts`
- Test: `app/src/__tests__/analyzeDataShape.test.ts`

**Step 1: Write the failing tests**

Create `app/src/__tests__/analyzeDataShape.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { analyzeDataShape, type ShapeAdvice } from '../utils/analyzeDataShape'

describe('analyzeDataShape', () => {
  // BigValue rules
  it('warns BigValue with many rows', () => {
    const data = Array.from({ length: 25 }, (_, i) => ({ val: i }))
    const result = analyzeDataShape(data, ['val'], { val: 'INTEGER' }, 'BigValue', {})
    expect(result.some((a) => a.message.includes('few summary rows'))).toBe(true)
    expect(result.find((a) => a.message.includes('few summary rows'))!.action?.type).toBe('switchChart')
  })

  it('hints BigValue with multiple rows but no metricLabel', () => {
    const data = [{ m: 'A', v: 1 }, { m: 'B', v: 2 }]
    const result = analyzeDataShape(data, ['m', 'v'], { m: 'VARCHAR', v: 'INTEGER' }, 'BigValue', {})
    expect(result.some((a) => a.message.includes('Label column'))).toBe(true)
  })

  it('no advice for BigValue with 1 row', () => {
    const data = [{ val: 42 }]
    const result = analyzeDataShape(data, ['val'], { val: 'INTEGER' }, 'BigValue', {})
    expect(result).toEqual([])
  })

  it('no advice for BigValue with metricLabel set', () => {
    const data = [{ m: 'A', v: 1 }, { m: 'B', v: 2 }]
    const result = analyzeDataShape(data, ['m', 'v'], { m: 'VARCHAR', v: 'INTEGER' }, 'BigValue', { metricLabel: 'm' })
    expect(result).toEqual([])
  })

  // Line chart rules
  it('warns Line chart with no date column', () => {
    const data = [{ a: 'x', b: 1 }]
    const result = analyzeDataShape(data, ['a', 'b'], { a: 'VARCHAR', b: 'INTEGER' }, 'LineChart', {})
    expect(result.some((a) => a.message.includes('time column'))).toBe(true)
  })

  it('no advice for Line chart with date column', () => {
    const data = [{ dt: '2025-01-01', b: 1 }]
    const result = analyzeDataShape(data, ['dt', 'b'], { dt: 'DATE', b: 'INTEGER' }, 'LineChart', {})
    expect(result).toEqual([])
  })

  // Pie chart rules
  it('warns Pie with too many categories', () => {
    const data = Array.from({ length: 15 }, (_, i) => ({ cat: `c${i}`, val: i }))
    const result = analyzeDataShape(data, ['cat', 'val'], { cat: 'VARCHAR', val: 'INTEGER' }, 'PieChart', {})
    expect(result.some((a) => a.message.includes('fewer than 10'))).toBe(true)
  })

  it('warns Pie with 1 row', () => {
    const data = [{ cat: 'A', val: 1 }]
    const result = analyzeDataShape(data, ['cat', 'val'], { cat: 'VARCHAR', val: 'INTEGER' }, 'PieChart', {})
    expect(result.some((a) => a.message.includes('multiple rows'))).toBe(true)
  })

  // Bar chart rules
  it('warns Bar with 1 row', () => {
    const data = [{ cat: 'A', val: 1 }]
    const result = analyzeDataShape(data, ['cat', 'val'], { cat: 'VARCHAR', val: 'INTEGER' }, 'BarChart', {})
    expect(result.some((a) => a.message.includes('multiple rows'))).toBe(true)
  })

  it('warns Bar with 500+ rows', () => {
    const data = Array.from({ length: 501 }, (_, i) => ({ cat: `c${i}`, val: i }))
    const result = analyzeDataShape(data, ['cat', 'val'], { cat: 'VARCHAR', val: 'INTEGER' }, 'BarChart', {})
    expect(result.some((a) => a.message.includes('aggregating'))).toBe(true)
  })

  // Unknown chart type returns empty
  it('returns empty for unknown chart type', () => {
    const result = analyzeDataShape([{ a: 1 }], ['a'], { a: 'INTEGER' }, 'Histogram' as any, {})
    expect(result).toEqual([])
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/__tests__/analyzeDataShape.test.ts`
Expected: FAIL — module not found

**Step 3: Implement analyzeDataShape**

Create `app/src/utils/analyzeDataShape.ts`:

```ts
import type { ChartType } from '../types/chart'

export interface ShapeAdvice {
  level: 'info' | 'warning'
  message: string
  action?: {
    label: string
    type: 'switchChart' | 'hint'
    chartType?: ChartType
  }
}

type Rule = (
  data: Record<string, unknown>[],
  columns: string[],
  columnTypes: Record<string, string>,
  config: Record<string, unknown>,
) => ShapeAdvice | null

function isDateType(type: string): boolean {
  const t = type.toUpperCase()
  return t.includes('DATE') || t.includes('TIMESTAMP') || t.includes('TIME')
}

const RULES: Record<string, Rule[]> = {
  BigValue: [
    (data, _cols, _types, config) => {
      if (data.length > 20) {
        return {
          level: 'warning',
          message: `KPI charts work best with a few summary rows. You have ${data.length}.`,
          action: { label: 'Switch to Bar', type: 'switchChart', chartType: 'BarChart' },
        }
      }
      return null
    },
    (data, _cols, _types, config) => {
      if (data.length > 1 && !config.metricLabel) {
        return {
          level: 'info',
          message: 'Multiple rows detected — set a Label column to show a KPI grid.',
          action: { label: 'Set Label column', type: 'hint' },
        }
      }
      return null
    },
  ],
  LineChart: [
    (_data, _cols, types) => {
      const hasDate = Object.values(types).some(isDateType)
      if (!hasDate) {
        return {
          level: 'warning',
          message: 'Line charts need a time column. None detected in your data.',
          action: { label: 'Switch to Bar', type: 'switchChart', chartType: 'BarChart' },
        }
      }
      return null
    },
  ],
  AreaChart: [
    (_data, _cols, types) => {
      const hasDate = Object.values(types).some(isDateType)
      if (!hasDate) {
        return {
          level: 'warning',
          message: 'Area charts need a time column. None detected in your data.',
          action: { label: 'Switch to Bar', type: 'switchChart', chartType: 'BarChart' },
        }
      }
      return null
    },
  ],
  PieChart: [
    (data) => {
      if (data.length === 1) {
        return {
          level: 'warning',
          message: 'Pie charts need multiple rows to show proportions.',
          action: { label: 'Switch to KPI', type: 'switchChart', chartType: 'BigValue' },
        }
      }
      return null
    },
    (data) => {
      if (data.length > 10) {
        return {
          level: 'warning',
          message: `Pie charts work best with fewer than 10 slices. You have ${data.length}.`,
          action: { label: 'Switch to Bar', type: 'switchChart', chartType: 'BarChart' },
        }
      }
      return null
    },
  ],
  BarChart: [
    (data) => {
      if (data.length === 1) {
        return {
          level: 'info',
          message: 'Bar charts need multiple rows. You have 1.',
          action: { label: 'Switch to KPI', type: 'switchChart', chartType: 'BigValue' },
        }
      }
      return null
    },
    (data) => {
      if (data.length > 500) {
        return {
          level: 'info',
          message: `Large dataset (${data.length} rows). Consider aggregating or filtering.`,
          action: { label: 'Add aggregation', type: 'hint' },
        }
      }
      return null
    },
  ],
}

export function analyzeDataShape(
  data: Record<string, unknown>[],
  columns: string[],
  columnTypes: Record<string, string>,
  chartType: ChartType | string,
  config: Record<string, unknown>,
): ShapeAdvice[] {
  const rules = RULES[chartType]
  if (!rules) return []

  const advice: ShapeAdvice[] = []
  for (const rule of rules) {
    const result = rule(data, columns, columnTypes, config)
    if (result) advice.push(result)
  }
  return advice
}
```

**Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/__tests__/analyzeDataShape.test.ts`
Expected: All 12 tests pass

**Step 5: Commit**

```
feat: add data shape advisor utility with rules for BigValue, Line, Pie, Bar
```

---

### Task 5: Shape Advisor banner in Toolbox

**Files:**
- Modify: `app/src/components/editor/Toolbox.tsx` — add advisor banner below chart type selector

**Step 1: Add imports and advisor computation**

At the top of `Toolbox.tsx`, add the import:

```ts
import { analyzeDataShape } from '../../utils/analyzeDataShape'
```

Inside the `Toolbox` function body (after line 62 where `isMultiY` is computed), add:

```ts
  const shapeAdvice = useMemo(
    () => data.length > 0
      ? analyzeDataShape(data, columns, columnTypes, config.chartType, config as unknown as Record<string, unknown>)
      : [],
    [data, columns, columnTypes, config.chartType, config.metricLabel, config.value],
  )
```

Add `useMemo` to the React import at the top of the file if not already present.

**Step 2: Render the advisor banner**

In the JSX, immediately after the `</Section>` that closes the "Chart Type" section (after the `<ChartTypeSelector>` block), add:

```tsx
        {shapeAdvice.length > 0 && (
          <div className="space-y-1.5 px-0.5">
            {shapeAdvice.map((advice, i) => (
              <div
                key={i}
                className={`text-xs rounded-lg px-3 py-2 ${
                  advice.level === 'warning'
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                }`}
              >
                <span>{advice.message}</span>
                {advice.action && advice.action.type === 'switchChart' && advice.action.chartType && (
                  <button
                    onClick={() => updateConfig({ chartType: advice.action!.chartType! })}
                    className={`ml-1.5 font-medium underline ${
                      advice.level === 'warning' ? 'text-amber-900' : 'text-blue-900'
                    }`}
                  >
                    {advice.action.label}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
```

**Step 3: Verify build**

Run: `cd app && ./node_modules/.bin/tsc --noEmit`
Expected: No errors

**Step 4: Run all tests**

Run: `cd app && npx vitest run`
Expected: All pass

**Step 5: Commit**

```
feat: add shape advisor banner to editor Toolbox
```

---

### Task 6: Final verification

**Step 1: Run full Python test suite**

Run: `python -m pytest engine/tests/ -v`
Expected: All pass (no backend changes in this feature)

**Step 2: Run full frontend test suite**

Run: `cd app && npx vitest run`
Expected: All pass including new bigValueGrid and analyzeDataShape tests

**Step 3: TypeScript check**

Run: `cd app && ./node_modules/.bin/tsc --noEmit`
Expected: 0 errors

**Step 4: Manual smoke test checklist**

1. Upload `kpi.csv`, select BigValue → see advisor hint "Multiple rows detected — set a Label column"
2. Set Label = "metric", Value = "value", Goal = "target" → see 6-card KPI grid
3. Switch to Bar chart → advisor hint disappears, bar chart renders
4. Switch to Line chart → advisor warns "Line charts need a time column"
5. Upload a time-series CSV, select Line → no advisor warnings
6. Existing single-row BigValue charts still render correctly (backward compat)

**Step 5: Final commit if any fixes needed**

---

## File Summary

| File | Action |
|------|--------|
| `app/src/types/chart.ts` | Add `metricLabel` to ChartConfig |
| `app/src/stores/editorStore.ts` | Add `metricLabel` to EditorConfig + default |
| `app/src/pages/EditorPage.tsx` | Pass `metricLabel` through to ChartConfig |
| `app/src/components/charts/bigValueHelpers.ts` | New — pure helpers for BigValue |
| `app/src/components/charts/ObservableChartFactory.tsx` | Enhance BigValueChart with grid mode |
| `app/src/components/editor/Toolbox.tsx` | Add Label dropdown + advisor banner |
| `app/src/utils/analyzeDataShape.ts` | New — shape analysis utility |
| `app/src/__tests__/bigValueGrid.test.ts` | New — grid detection + formatting tests |
| `app/src/__tests__/analyzeDataShape.test.ts` | New — shape advisor rule tests |

## Build Order

1. Type definitions (independent foundation)
2. BigValue grid rendering + tests (needs types)
3. Toolbox Label dropdown (needs types, wires to grid)
4. Shape advisor utility + tests (independent)
5. Shape advisor banner in Toolbox (needs advisor utility)
6. Final verification
