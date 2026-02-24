import { describe, it, expect } from 'vitest'
import { BASEMAPS, joinDataToFeatures } from '../utils/geoUtils'
import type { FeatureCollection } from 'geojson'

describe('geoUtils', () => {
  describe('BASEMAPS', () => {
    it('has 4 basemaps', () => {
      expect(BASEMAPS).toHaveLength(4)
    })

    it('each basemap has required fields', () => {
      for (const basemap of BASEMAPS) {
        expect(basemap.id).toBeTruthy()
        expect(basemap.label).toBeTruthy()
        expect(basemap.path).toMatch(/^\/basemaps\//)
        expect(basemap.objectKey).toBeTruthy()
        expect(basemap.idProperty).toBeTruthy()
        expect(basemap.defaultProjection).toMatch(/^geo/)
      }
    })

    it('has world, us-states, us-counties, europe', () => {
      const ids = BASEMAPS.map((b) => b.id)
      expect(ids).toContain('world')
      expect(ids).toContain('us-states')
      expect(ids).toContain('us-counties')
      expect(ids).toContain('europe')
    })
  })

  describe('joinDataToFeatures', () => {
    const mockGeoJSON: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', id: '840', properties: { name: 'United States' }, geometry: { type: 'Point', coordinates: [0, 0] } },
        { type: 'Feature', id: '826', properties: { name: 'United Kingdom' }, geometry: { type: 'Point', coordinates: [0, 0] } },
        { type: 'Feature', id: '276', properties: { name: 'Germany' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      ],
    }

    it('joins data by feature id', () => {
      const data = [
        { country_id: '840', gdp: 25000 },
        { country_id: '826', gdp: 3200 },
      ]
      const joined = joinDataToFeatures(mockGeoJSON, data, 'country_id', 'gdp', 'world')
      expect(joined).toHaveLength(3)
      expect(joined[0].value).toBe(25000)
      expect(joined[0].label).toBe('United States')
      expect(joined[1].value).toBe(3200)
      expect(joined[2].value).toBeNull() // Germany has no data
    })

    it('joins data by feature name', () => {
      const data = [
        { country: 'United States', pop: 330 },
        { country: 'Germany', pop: 83 },
      ]
      const joined = joinDataToFeatures(mockGeoJSON, data, 'country', 'pop', 'world')
      const usa = joined.find((j) => j.label === 'United States')
      const germany = joined.find((j) => j.label === 'Germany')
      expect(usa?.value).toBe(330)
      expect(germany?.value).toBe(83)
    })

    it('handles missing data gracefully', () => {
      const joined = joinDataToFeatures(mockGeoJSON, [], 'x', 'y', 'world')
      expect(joined).toHaveLength(3)
      expect(joined.every((j) => j.value === null)).toBe(true)
    })

    it('handles non-numeric values', () => {
      const data = [{ country_id: '840', gdp: 'N/A' }]
      const joined = joinDataToFeatures(mockGeoJSON, data, 'country_id', 'gdp', 'world')
      expect(joined[0].value).toBeNull()
    })
  })
})

describe('ChoroplethMap type registration', () => {
  it('ChoroplethMap is a valid ChartType', async () => {
    const { default: chartTypes } = await import('../types/chart').then((_m) => ({
      default: [
        'LineChart', 'BarChart', 'AreaChart', 'ScatterPlot', 'Histogram',
        'HeatMap', 'BoxPlot', 'PieChart', 'Treemap', 'DataTable', 'BigValue',
        'DotPlot', 'RangePlot', 'BulletBar', 'SmallMultiples', 'ChoroplethMap',
      ] as const,
    }))
    expect(chartTypes).toContain('ChoroplethMap')
  })
})
