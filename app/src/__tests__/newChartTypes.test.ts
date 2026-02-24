import { describe, it, expect } from 'vitest'
import type { ChartType, ChartConfig } from '../types/chart'

/**
 * Tests for the 4 new chart types: DotPlot, RangePlot, BulletBar, SmallMultiples.
 * Verifies type system, config fields, and basic wiring.
 */

describe('ChartType union includes new types', () => {
  const newTypes: ChartType[] = ['DotPlot', 'RangePlot', 'BulletBar', 'SmallMultiples']

  it.each(newTypes)('%s is a valid ChartType', (type) => {
    // TypeScript compile-time check: if this file compiles, the types are valid
    const t: ChartType = type
    expect(t).toBe(type)
  })
})

describe('ChartConfig supports new type-specific fields', () => {
  it('RangePlot config accepts minColumn and maxColumn', () => {
    const config: ChartConfig = {
      x: 'category',
      minColumn: 'low',
      maxColumn: 'high',
    }
    expect(config.minColumn).toBe('low')
    expect(config.maxColumn).toBe('high')
  })

  it('BulletBar config accepts targetColumn', () => {
    const config: ChartConfig = {
      x: 'category',
      y: 'actual',
      targetColumn: 'goal',
    }
    expect(config.targetColumn).toBe('goal')
  })

  it('SmallMultiples config accepts facetColumn and chartSubtype', () => {
    const config: ChartConfig = {
      x: 'date',
      y: 'value',
      facetColumn: 'region',
      chartSubtype: 'bar',
    }
    expect(config.facetColumn).toBe('region')
    expect(config.chartSubtype).toBe('bar')
  })

  it('SmallMultiples chartSubtype accepts all 4 values', () => {
    const subtypes: ChartConfig['chartSubtype'][] = ['line', 'bar', 'area', 'scatter']
    subtypes.forEach((s) => {
      const config: ChartConfig = { chartSubtype: s }
      expect(config.chartSubtype).toBe(s)
    })
  })

  it('DotPlot config uses standard x/y fields', () => {
    const config: ChartConfig = {
      x: 'product',
      y: 'sales',
      markerSize: 6,
    }
    expect(config.x).toBe('product')
    expect(config.y).toBe('sales')
    expect(config.markerSize).toBe(6)
  })
})

describe('EditorConfig defaults for new chart types', () => {
  // Import the store to check DEFAULT_CONFIG values
  it('has null defaults for new optional fields', async () => {
    // Dynamic import to avoid side effects
    const { useEditorStore } = await import('../stores/editorStore')
    const state = useEditorStore.getState()

    expect(state.config.minColumn).toBeNull()
    expect(state.config.maxColumn).toBeNull()
    expect(state.config.targetColumn).toBeNull()
    expect(state.config.facetColumn).toBeNull()
    expect(state.config.chartSubtype).toBe('line')
  })
})
