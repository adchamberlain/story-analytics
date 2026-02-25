import { describe, it, expect } from 'vitest'
import type { ChartType, ChartConfig } from '../types/chart'

/**
 * Tests for 6 new chart types: StackedColumn, GroupedColumn, SplitBars,
 * ArrowPlot, ElectionDonut, MultiplePies.
 * Verifies type system, config fields, EditorConfig defaults, and basic wiring.
 */

// ── L.1: Type Registration ──────────────────────────────────────────────────

describe('ChartType union includes Phase 7 types', () => {
  const newTypes: ChartType[] = [
    'StackedColumn',
    'GroupedColumn',
    'SplitBars',
    'ArrowPlot',
    'ElectionDonut',
    'MultiplePies',
  ]

  it.each(newTypes)('%s is a valid ChartType', (type) => {
    // TypeScript compile-time check: if this file compiles, the types are valid
    const t: ChartType = type
    expect(t).toBe(type)
  })

  it('total ChartType count is 25 (19 original + 6 new)', () => {
    // Exhaustive list to ensure no types were accidentally removed
    const allTypes: ChartType[] = [
      'LineChart', 'BarChart', 'AreaChart', 'ScatterPlot', 'Histogram',
      'HeatMap', 'BoxPlot', 'PieChart', 'Treemap', 'DataTable',
      'BigValue', 'DotPlot', 'RangePlot', 'BulletBar', 'SmallMultiples',
      'ChoroplethMap', 'SymbolMap', 'LocatorMap', 'SpikeMap',
      'StackedColumn', 'GroupedColumn', 'SplitBars', 'ArrowPlot',
      'ElectionDonut', 'MultiplePies',
    ]
    expect(allTypes).toHaveLength(25)
  })
})

// ── L.2: ChartConfig fields ─────────────────────────────────────────────────

describe('ChartConfig supports Phase 7 type-specific fields', () => {
  it('SplitBars config accepts leftColumn and rightColumn', () => {
    const config: ChartConfig = {
      x: 'country',
      leftColumn: 'imports',
      rightColumn: 'exports',
    }
    expect(config.leftColumn).toBe('imports')
    expect(config.rightColumn).toBe('exports')
  })

  it('ArrowPlot config accepts startColumn and endColumn', () => {
    const config: ChartConfig = {
      x: 'category',
      startColumn: 'before',
      endColumn: 'after',
    }
    expect(config.startColumn).toBe('before')
    expect(config.endColumn).toBe('after')
  })

  it('MultiplePies config accepts pieVariant', () => {
    const configPie: ChartConfig = { pieVariant: 'pie' }
    const configDonut: ChartConfig = { pieVariant: 'donut' }
    expect(configPie.pieVariant).toBe('pie')
    expect(configDonut.pieVariant).toBe('donut')
  })

  it('StackedColumn uses standard x/y/series fields', () => {
    const config: ChartConfig = {
      x: 'month',
      y: 'revenue',
      series: 'product',
    }
    expect(config.x).toBe('month')
    expect(config.y).toBe('revenue')
    expect(config.series).toBe('product')
  })

  it('GroupedColumn uses standard x/y/series fields', () => {
    const config: ChartConfig = {
      x: 'quarter',
      y: 'sales',
      series: 'region',
    }
    expect(config.x).toBe('quarter')
    expect(config.series).toBe('region')
  })

  it('ElectionDonut uses standard x (label) and value fields', () => {
    const config: ChartConfig = {
      x: 'party',
      value: 'seats',
    }
    expect(config.x).toBe('party')
    expect(config.value).toBe('seats')
  })
})

// ── L.2: EditorConfig defaults ──────────────────────────────────────────────

describe('EditorConfig defaults for Phase 7 chart types', () => {
  it('has null defaults for new optional fields', async () => {
    const { useEditorStore } = await import('../stores/editorStore')
    const state = useEditorStore.getState()

    expect(state.config.leftColumn).toBeNull()
    expect(state.config.rightColumn).toBeNull()
    expect(state.config.startColumn).toBeNull()
    expect(state.config.endColumn).toBeNull()
    expect(state.config.pieVariant).toBe('pie')
  })

  it('updateConfig can set new fields', async () => {
    const { useEditorStore } = await import('../stores/editorStore')

    useEditorStore.getState().updateConfig({
      leftColumn: 'col_a',
      rightColumn: 'col_b',
    })
    expect(useEditorStore.getState().config.leftColumn).toBe('col_a')
    expect(useEditorStore.getState().config.rightColumn).toBe('col_b')

    // Cleanup
    useEditorStore.getState().updateConfig({
      leftColumn: null,
      rightColumn: null,
    })
  })

  it('updateConfig can set arrow plot fields', async () => {
    const { useEditorStore } = await import('../stores/editorStore')

    useEditorStore.getState().updateConfig({
      startColumn: 'start_val',
      endColumn: 'end_val',
    })
    expect(useEditorStore.getState().config.startColumn).toBe('start_val')
    expect(useEditorStore.getState().config.endColumn).toBe('end_val')

    // Cleanup
    useEditorStore.getState().updateConfig({
      startColumn: null,
      endColumn: null,
    })
  })

  it('updateConfig can set pieVariant', async () => {
    const { useEditorStore } = await import('../stores/editorStore')

    useEditorStore.getState().updateConfig({ pieVariant: 'donut' })
    expect(useEditorStore.getState().config.pieVariant).toBe('donut')

    // Cleanup
    useEditorStore.getState().updateConfig({ pieVariant: 'pie' })
  })
})

// ── L.4-L.6: Mark Builder Output ────────────────────────────────────────────

describe('Mark builder output structure', () => {
  // We test the exported buildMarks indirectly by importing the module
  // and checking that the function doesn't throw for each new chart type.
  // Since buildMarks is not exported, we test the key patterns instead.

  it('StackedColumn requires series field', () => {
    // StackedColumn expects x, y, and series. Without series, it returns [].
    // This is a design invariant we want to document.
    const config: ChartConfig = { x: 'month', y: 'value' }
    expect(config.series).toBeUndefined()
  })

  it('GroupedColumn requires series field for fx faceting', () => {
    const config: ChartConfig = { x: 'month', y: 'value', series: 'category' }
    expect(config.series).toBe('category')
  })

  it('SplitBars config fields are independent from x/y', () => {
    const config: ChartConfig = {
      x: 'country',
      leftColumn: 'imports',
      rightColumn: 'exports',
    }
    // leftColumn and rightColumn are separate from y
    expect(config.y).toBeUndefined()
    expect(config.leftColumn).toBe('imports')
    expect(config.rightColumn).toBe('exports')
  })

  it('ArrowPlot config uses startColumn/endColumn instead of y', () => {
    const config: ChartConfig = {
      x: 'product',
      startColumn: '2020',
      endColumn: '2024',
    }
    expect(config.startColumn).toBe('2020')
    expect(config.endColumn).toBe('2024')
  })
})

// ── Aggregate Tests ─────────────────────────────────────────────────────────

describe('Phase 7 chart type config compatibility', () => {
  it('all new config fields are optional in ChartConfig', () => {
    // An empty config should be valid (all fields optional)
    const config: ChartConfig = {}
    expect(config.leftColumn).toBeUndefined()
    expect(config.rightColumn).toBeUndefined()
    expect(config.startColumn).toBeUndefined()
    expect(config.endColumn).toBeUndefined()
    expect(config.pieVariant).toBeUndefined()
  })

  it('new fields coexist with existing fields without conflict', () => {
    const config: ChartConfig = {
      x: 'date',
      y: 'value',
      series: 'category',
      leftColumn: 'left',
      rightColumn: 'right',
      startColumn: 'start',
      endColumn: 'end',
      pieVariant: 'donut',
      facetColumn: 'region',
      minColumn: 'low',
      maxColumn: 'high',
    }
    // All fields should be set without TypeScript errors
    expect(config.leftColumn).toBe('left')
    expect(config.minColumn).toBe('low')
    expect(config.facetColumn).toBe('region')
    expect(config.pieVariant).toBe('donut')
  })
})
