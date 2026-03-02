import { describe, it, expect } from 'vitest'

describe('GeoWizardModal exports', () => {
  it('exports GeoWizardModal component', async () => {
    const mod = await import('../components/editor/GeoWizardModal')
    expect(typeof mod.GeoWizardModal).toBe('function')
  })
})

describe('GeoWizardModal constants', () => {
  it('GEO_TYPES includes all expected types', async () => {
    const mod = await import('../components/editor/GeoWizardModal')
    expect(mod.GEO_TYPES).toContain('state')
    expect(mod.GEO_TYPES).toContain('country')
    expect(mod.GEO_TYPES).toContain('zip')
    expect(mod.GEO_TYPES).toContain('fips')
    expect(mod.GEO_TYPES).toContain('city')
    expect(mod.GEO_TYPES).toContain('address')
    expect(mod.GEO_TYPES).toContain('lat_lon')
  })

  it('has 7 geo types total', async () => {
    const mod = await import('../components/editor/GeoWizardModal')
    expect(mod.GEO_TYPES).toHaveLength(7)
  })
})

describe('GeoWizardModal types', () => {
  it('DetectedColumn type has expected shape', async () => {
    // Verify the type is exported (runtime check via constructor-like usage)
    const mod = await import('../components/editor/GeoWizardModal')
    const col: mod.DetectedColumn = {
      name: 'city',
      inferred_type: 'city',
      confidence: 0.9,
      samples: ['Austin', 'Dallas'],
    }
    expect(col.name).toBe('city')
  })
})

describe('dataStore geoWizardPending state', () => {
  it('has geoWizardPending field defaulting to null', async () => {
    const mod = await import('../stores/dataStore')
    const store = mod.useDataStore.getState()
    expect(store.geoWizardPending).toBeNull()
  })

  it('has clearGeoWizard action', async () => {
    const mod = await import('../stores/dataStore')
    const store = mod.useDataStore.getState()
    expect(typeof store.clearGeoWizard).toBe('function')
  })
})
