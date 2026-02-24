import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import type { ChartTheme } from '../../themes/chartThemes'
import { CHART_THEMES } from '../../themes/chartThemes'

// Mock the theme store — must be before component import
const mockTheme: { current: ChartTheme } = { current: structuredClone(CHART_THEMES.default) }

vi.mock('../../stores/chartThemeStore', () => ({
  useChartThemeStore: (selector: (s: { theme: ChartTheme }) => ChartTheme) =>
    selector({ theme: mockTheme.current }),
}))

// Mock chart export utils (not relevant to these tests)
vi.mock('../../utils/chartExport', () => ({
  exportSVG: vi.fn(),
  exportPNG: vi.fn(),
  exportPDF: vi.fn(),
}))

// Import after mocks
import { ChartWrapper } from '../charts/ChartWrapper'

function renderWrapper(children = <div>chart content</div>) {
  return render(
    <BrowserRouter>
      <ChartWrapper title="Test Chart">{children}</ChartWrapper>
    </BrowserRouter>
  )
}

describe('ChartWrapper logo rendering', () => {
  beforeEach(() => {
    mockTheme.current = structuredClone(CHART_THEMES.default)
  })

  it('does not render a logo when logoUrl is not set', () => {
    renderWrapper()
    expect(screen.queryByTestId('chart-logo')).toBeNull()
  })

  it('renders a logo image when logoUrl is set', () => {
    mockTheme.current.logoUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    renderWrapper()

    const logo = screen.getByTestId('chart-logo') as HTMLImageElement
    expect(logo).toBeTruthy()
    expect(logo.tagName).toBe('IMG')
    expect(logo.src).toContain('data:image/png;base64')
    expect(logo.alt).toBe('Chart logo')
  })

  it('positions logo top-right correctly', () => {
    mockTheme.current.logoUrl = 'data:image/png;base64,abc123'
    mockTheme.current.logoPosition = 'top-right'
    renderWrapper()

    const logo = screen.getByTestId('chart-logo') as HTMLImageElement
    expect(logo.style.position).toBe('absolute')
    expect(logo.style.top).toBe('8px')
    expect(logo.style.right).toBe('8px')
  })

  it('positions logo bottom-left correctly', () => {
    mockTheme.current.logoUrl = 'data:image/png;base64,abc123'
    mockTheme.current.logoPosition = 'bottom-left'
    renderWrapper()

    const logo = screen.getByTestId('chart-logo') as HTMLImageElement
    expect(logo.style.position).toBe('absolute')
    expect(logo.style.bottom).toBe('40px')
    expect(logo.style.left).toBe('8px')
  })

  it('positions logo bottom-right correctly', () => {
    mockTheme.current.logoUrl = 'data:image/png;base64,abc123'
    mockTheme.current.logoPosition = 'bottom-right'
    renderWrapper()

    const logo = screen.getByTestId('chart-logo') as HTMLImageElement
    expect(logo.style.position).toBe('absolute')
    expect(logo.style.bottom).toBe('40px')
    expect(logo.style.right).toBe('8px')
  })

  it('defaults to top-left position when logoPosition is not set', () => {
    mockTheme.current.logoUrl = 'data:image/png;base64,abc123'
    // logoPosition not set — should default to top-left
    renderWrapper()

    const logo = screen.getByTestId('chart-logo') as HTMLImageElement
    expect(logo.style.position).toBe('absolute')
    expect(logo.style.top).toBe('8px')
    expect(logo.style.left).toBe('8px')
  })

  it('applies the correct logo size', () => {
    mockTheme.current.logoUrl = 'data:image/png;base64,abc123'
    mockTheme.current.logoSize = 100
    renderWrapper()

    const logo = screen.getByTestId('chart-logo') as HTMLImageElement
    expect(logo.style.width).toBe('100px')
    expect(logo.style.height).toBe('auto')
  })

  it('uses default size of 60px when logoSize is not set', () => {
    mockTheme.current.logoUrl = 'data:image/png;base64,abc123'
    // logoSize not set — should default to 60
    renderWrapper()

    const logo = screen.getByTestId('chart-logo') as HTMLImageElement
    expect(logo.style.width).toBe('60px')
  })

  it('sets the outer container to position:relative', () => {
    renderWrapper()
    // The outermost div should have position: relative for absolute logo positioning
    const container = screen.getByText('Test Chart').closest('.rounded-2xl') as HTMLElement
    expect(container).toBeTruthy()
    expect(container.style.position).toBe('relative')
  })
})
