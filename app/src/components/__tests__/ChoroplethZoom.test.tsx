import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock the editorStore before importing ChoroplethMap
vi.mock('../../stores/editorStore', () => ({
  useEditorStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ customGeoData: null }),
}))

// Mock geoUtils to avoid fetching real basemaps
vi.mock('../../utils/geoUtils', () => ({
  BASEMAPS: [{ id: 'world', label: 'World', path: '/basemaps/world.json', objectKey: 'countries', idProperty: 'id', defaultProjection: 'geoEqualEarth' }],
  loadBasemap: vi.fn(() =>
    Promise.resolve({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: '840',
          properties: { name: 'United States' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        },
      ],
    })
  ),
  joinDataToFeatures: vi.fn(() => [
    {
      feature: {
        type: 'Feature',
        id: '840',
        properties: { name: 'United States' },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      },
      value: 100,
      label: 'United States',
    },
  ]),
}))

// Mock d3-zoom to avoid actual SVG manipulation in JSDOM
vi.mock('d3-zoom', () => ({
  zoom: () => {
    const behavior = {
      scaleExtent: () => behavior,
      on: () => behavior,
      scaleBy: vi.fn(),
      transform: vi.fn(),
    }
    const callable = Object.assign(vi.fn(), behavior)
    return callable
  },
  zoomIdentity: { k: 1, x: 0, y: 0 },
}))

// We need to mock ResizeObserver for JSDOM
beforeEach(() => {
  ;(globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

import { ChoroplethMap } from '../charts/ChoroplethMap'

describe('ChoroplethMap zoom controls', () => {
  const defaultProps = {
    data: [{ country_id: '840', gdp: 100 }],
    config: { x: 'country_id', y: 'gdp' },
    height: 400,
  }

  it('renders zoom controls with +, -, Reset buttons', async () => {
    render(<ChoroplethMap {...defaultProps} />)

    // Wait for async loadBasemap to resolve and component to re-render
    await waitFor(() => {
      expect(screen.getByTestId('zoom-controls')).toBeDefined()
    })

    const zoomControls = screen.getByTestId('zoom-controls')
    const buttons = zoomControls.querySelectorAll('button')
    expect(buttons.length).toBe(3)
  })

  it('renders zoom in button with + text', async () => {
    render(<ChoroplethMap {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('Zoom in')).toBeDefined()
    })

    const btn = screen.getByLabelText('Zoom in')
    expect(btn.textContent).toBe('+')
  })

  it('renders zoom out button with - text', async () => {
    render(<ChoroplethMap {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('Zoom out')).toBeDefined()
    })

    const btn = screen.getByLabelText('Zoom out')
    expect(btn.textContent).toBe('-')
  })

  it('renders reset button with Reset text', async () => {
    render(<ChoroplethMap {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('Reset zoom')).toBeDefined()
    })

    const btn = screen.getByLabelText('Reset zoom')
    expect(btn.textContent).toBe('Reset')
  })
})
