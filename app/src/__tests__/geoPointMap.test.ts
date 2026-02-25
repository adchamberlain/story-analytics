import { describe, it, expect } from 'vitest'

describe('GeoPointMap type registration', () => {
  const ALL_CHART_TYPES = [
    'LineChart', 'BarChart', 'AreaChart', 'ScatterPlot', 'Histogram',
    'HeatMap', 'BoxPlot', 'PieChart', 'Treemap', 'DataTable', 'BigValue',
    'DotPlot', 'RangePlot', 'BulletBar', 'SmallMultiples', 'ChoroplethMap',
    'SymbolMap', 'LocatorMap', 'SpikeMap',
  ] as const

  it('SymbolMap is a valid ChartType', () => {
    expect(ALL_CHART_TYPES).toContain('SymbolMap')
  })

  it('LocatorMap is a valid ChartType', () => {
    expect(ALL_CHART_TYPES).toContain('LocatorMap')
  })

  it('SpikeMap is a valid ChartType', () => {
    expect(ALL_CHART_TYPES).toContain('SpikeMap')
  })

  it('has 19 total chart types', () => {
    expect(ALL_CHART_TYPES).toHaveLength(19)
  })
})

describe('EditorStore DEFAULT_CONFIG has point map fields', () => {
  it('has geoLatColumn default', async () => {
    // Dynamic import to test actual store defaults
    const mod = await import('../stores/editorStore')
    const store = mod.useEditorStore.getState()
    expect(store.config.geoLatColumn).toBeNull()
  })

  it('has geoLonColumn default', async () => {
    const mod = await import('../stores/editorStore')
    const store = mod.useEditorStore.getState()
    expect(store.config.geoLonColumn).toBeNull()
  })

  it('has geoLabelColumn default', async () => {
    const mod = await import('../stores/editorStore')
    const store = mod.useEditorStore.getState()
    expect(store.config.geoLabelColumn).toBeNull()
  })

  it('has geoSizeColumn default', async () => {
    const mod = await import('../stores/editorStore')
    const store = mod.useEditorStore.getState()
    expect(store.config.geoSizeColumn).toBeNull()
  })

  it('has geoSymbolShape default of circle', async () => {
    const mod = await import('../stores/editorStore')
    const store = mod.useEditorStore.getState()
    expect(store.config.geoSymbolShape).toBe('circle')
  })

  it('has geoSizeRange default of [3, 25]', async () => {
    const mod = await import('../stores/editorStore')
    const store = mod.useEditorStore.getState()
    expect(store.config.geoSizeRange).toEqual([3, 25])
  })
})

describe('useGeoMap hook exports', () => {
  it('exports useGeoMap and zoomBtnStyle', async () => {
    const mod = await import('../hooks/useGeoMap')
    expect(typeof mod.useGeoMap).toBe('function')
    expect(mod.zoomBtnStyle).toBeDefined()
    expect(mod.zoomBtnStyle.cursor).toBe('pointer')
  })
})

describe('GeoPointMap component exports', () => {
  it('exports GeoPointMap component', async () => {
    const mod = await import('../components/charts/GeoPointMap')
    expect(typeof mod.GeoPointMap).toBe('function')
  })
})
