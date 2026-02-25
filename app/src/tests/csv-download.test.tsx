import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ChartTheme } from '../themes/chartThemes'
import { CHART_THEMES } from '../themes/chartThemes'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockTheme: { current: ChartTheme } = { current: structuredClone(CHART_THEMES.default) }

vi.mock('../stores/chartThemeStore', () => ({
  useChartThemeStore: (selector: (s: { theme: ChartTheme }) => ChartTheme) =>
    selector({ theme: mockTheme.current }),
}))

vi.mock('../utils/chartExport', () => ({
  exportSVG: vi.fn(),
  exportPNG: vi.fn(),
  exportPDF: vi.fn(),
  exportPPTX: vi.fn(),
}))

// Mock ObservableChartFactory to avoid deep dependency chain (theme store, D3, etc.)
vi.mock('../components/charts/ObservableChartFactory', () => ({
  ObservableChartFactory: () => <div data-testid="mock-chart">Chart</div>,
}))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock ResizeObserver for jsdom (must be a class, not arrow fn, for `new` keyword)
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

// Mock window.matchMedia for jsdom (used by EmbedChartPage dark mode)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Import after mocks
import { ChartWrapper } from '../components/charts/ChartWrapper'
import { EmbedChartPage } from '../pages/EmbedChartPage'

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderChartWrapper(props: Record<string, unknown> = {}) {
  return render(
    <BrowserRouter>
      <ChartWrapper title="Test Chart" {...props}>
        <div>chart content</div>
      </ChartWrapper>
    </BrowserRouter>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CSV download — ChartWrapper', () => {
  beforeEach(() => {
    mockTheme.current = structuredClone(CHART_THEMES.default)
  })

  it('shows CSV button when chartId and allowDataDownload are provided', () => {
    renderChartWrapper({ chartId: 'abc123', allowDataDownload: true })
    expect(screen.getByText('CSV')).toBeTruthy()
  })

  it('hides CSV button when chartId is not provided', () => {
    renderChartWrapper({ allowDataDownload: true })
    expect(screen.queryByText('CSV')).toBeNull()
  })

  it('hides CSV button when allowDataDownload is false', () => {
    renderChartWrapper({ chartId: 'abc123', allowDataDownload: false })
    expect(screen.queryByText('CSV')).toBeNull()
  })

  it('always shows SVG/PNG/PDF/PPTX buttons regardless of chartId', () => {
    renderChartWrapper()
    expect(screen.getByText('SVG')).toBeTruthy()
    expect(screen.getByText('PNG')).toBeTruthy()
    expect(screen.getByText('PDF')).toBeTruthy()
    expect(screen.getByText('PPTX')).toBeTruthy()
  })
})

describe('CSV download — EmbedChartPage', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('shows "Get the data" link when allowDataDownload is true', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          chart_type: 'BarChart',
          title: 'Test Chart',
          subtitle: null,
          source: 'Test Source',
          x: 'name',
          y: 'value',
          series: null,
          horizontal: false,
          sort: true,
          config: { allowDataDownload: true },
        },
        data: [{ name: 'A', value: 1 }],
        columns: ['name', 'value'],
      }),
    })

    render(
      <MemoryRouter initialEntries={['/embed/chart/chart123']}>
        <Routes>
          <Route path="/embed/chart/:chartId" element={<EmbedChartPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const link = await screen.findByTestId('get-the-data')
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/api/v2/charts/chart123/data.csv')
  })

  it('hides "Get the data" link when allowDataDownload is false', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          chart_type: 'BarChart',
          title: 'Hidden Download',
          subtitle: null,
          source: null,
          x: 'name',
          y: 'value',
          series: null,
          horizontal: false,
          sort: true,
          config: { allowDataDownload: false },
        },
        data: [{ name: 'A', value: 1 }],
        columns: ['name', 'value'],
      }),
    })

    render(
      <MemoryRouter initialEntries={['/embed/chart/chart456']}>
        <Routes>
          <Route path="/embed/chart/:chartId" element={<EmbedChartPage />} />
        </Routes>
      </MemoryRouter>,
    )

    // Wait for chart to render by finding the title
    await screen.findByText('Hidden Download')
    expect(screen.queryByTestId('get-the-data')).toBeNull()
  })
})
