import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { checkPaletteAccessibility, contrastRatio, simulateCVD } from '../utils/colorblind'

// ── M.1: Alt text field in config ─────────────────────────────────────────────

describe('M.1: Alt text field', () => {
  it('ChartConfig accepts altText property', async () => {
    // Type-level compile test: importing the type and using altText
    const { } = await import('../types/chart')
    type TestConfig = import('../types/chart').ChartConfig
    const config: TestConfig = { altText: 'A bar chart showing sales by region' }
    expect(config.altText).toBe('A bar chart showing sales by region')
  })

  it('altText defaults to empty string in EditorConfig', async () => {
    // Verify DEFAULT_CONFIG includes altText
    // We cannot import DEFAULT_CONFIG directly (not exported), but we can test
    // the store initializes with an empty altText
    const { useEditorStore } = await import('../stores/editorStore')
    const config = useEditorStore.getState().config
    expect(config.altText).toBe('')
  })

  it('updateConfig can set altText', async () => {
    const { useEditorStore } = await import('../stores/editorStore')
    useEditorStore.getState().updateConfig({ altText: 'Test description' })
    expect(useEditorStore.getState().config.altText).toBe('Test description')
    // Reset
    useEditorStore.getState().updateConfig({ altText: '' })
  })
})

// ── M.2: ARIA attribute rendering ─────────────────────────────────────────────

describe('M.2: ARIA attributes on ChartWrapper', () => {
  // Mock the chart theme store
  vi.mock('../stores/chartThemeStore', () => ({
    useChartThemeStore: (selector: (s: unknown) => unknown) =>
      selector({
        theme: {
          font: {
            family: '',
            title: { size: 16, weight: 600 },
            subtitle: { size: 13, weight: 400 },
            source: { size: 11 },
          },
          card: {},
          palette: { colors: [] },
        },
      }),
  }))

  it('renders role="img" on chart area', async () => {
    const { ChartWrapper } = await import('../components/charts/ChartWrapper')
    render(
      <ChartWrapper title="Sales Chart">
        <div>chart content</div>
      </ChartWrapper>
    )
    const imgEl = screen.getByRole('img')
    expect(imgEl).toBeTruthy()
  })

  it('uses altText as aria-label when provided', async () => {
    const { ChartWrapper } = await import('../components/charts/ChartWrapper')
    render(
      <ChartWrapper title="Sales" altText="Bar chart of Q4 sales by region">
        <div>chart</div>
      </ChartWrapper>
    )
    const imgEl = screen.getByRole('img')
    expect(imgEl.getAttribute('aria-label')).toBe('Bar chart of Q4 sales by region')
  })

  it('falls back to title when altText is not provided', async () => {
    const { ChartWrapper } = await import('../components/charts/ChartWrapper')
    render(
      <ChartWrapper title="Revenue Overview">
        <div>chart</div>
      </ChartWrapper>
    )
    const imgEl = screen.getByRole('img')
    expect(imgEl.getAttribute('aria-label')).toBe('Revenue Overview')
  })

  it('generates auto-summary when chartType is provided', async () => {
    const { ChartWrapper } = await import('../components/charts/ChartWrapper')
    render(
      <ChartWrapper chartType="BarChart" xColumn="region" yColumn="sales" dataLength={42}>
        <div>chart</div>
      </ChartWrapper>
    )
    const imgEl = screen.getByRole('img')
    expect(imgEl.getAttribute('aria-label')).toBe('BarChart showing sales by region with 42 data points')
  })

  it('renders hidden sr-only summary div with aria-describedby', async () => {
    const { ChartWrapper } = await import('../components/charts/ChartWrapper')
    render(
      <ChartWrapper title="Test" chartType="LineChart" xColumn="date" yColumn="price" dataLength={100}>
        <div>chart</div>
      </ChartWrapper>
    )
    const imgEl = screen.getByRole('img')
    const describedById = imgEl.getAttribute('aria-describedby')
    expect(describedById).toBeTruthy()
    const summaryDiv = document.getElementById(describedById!)
    expect(summaryDiv).toBeTruthy()
    expect(summaryDiv!.textContent).toContain('LineChart')
    expect(summaryDiv!.textContent).toContain('price')
    expect(summaryDiv!.textContent).toContain('date')
    expect(summaryDiv!.textContent).toContain('100')
  })

  it('chart area has tabIndex={0}', async () => {
    const { ChartWrapper } = await import('../components/charts/ChartWrapper')
    render(
      <ChartWrapper title="Test">
        <div>chart</div>
      </ChartWrapper>
    )
    const imgEl = screen.getByRole('img')
    expect(imgEl.getAttribute('tabindex')).toBe('0')
  })
})

// ── M.3: Keyboard sort on table headers ───────────────────────────────────────

describe('M.3: Keyboard sort on RichDataTable headers', () => {
  const sampleData = [
    { name: 'Alice', score: 95 },
    { name: 'Bob', score: 87 },
    { name: 'Charlie', score: 92 },
  ]
  const config = {}

  it('table headers have tabIndex={0}', async () => {
    const { RichDataTable } = await import('../components/charts/table/RichDataTable')
    render(<RichDataTable data={sampleData} config={config as never} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers.length).toBe(2) // name, score
    headers.forEach((th) => {
      expect(th.getAttribute('tabindex')).toBe('0')
    })
  })

  it('table headers have role="columnheader"', async () => {
    const { RichDataTable } = await import('../components/charts/table/RichDataTable')
    render(<RichDataTable data={sampleData} config={config as never} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers.length).toBeGreaterThan(0)
  })

  it('headers have aria-sort="none" initially', async () => {
    const { RichDataTable } = await import('../components/charts/table/RichDataTable')
    render(<RichDataTable data={sampleData} config={config as never} />)
    const headers = screen.getAllByRole('columnheader')
    headers.forEach((th) => {
      expect(th.getAttribute('aria-sort')).toBe('none')
    })
  })

  it('Enter key triggers sort on header', async () => {
    const { RichDataTable } = await import('../components/charts/table/RichDataTable')
    render(<RichDataTable data={sampleData} config={config as never} />)
    const nameHeader = screen.getAllByRole('columnheader')[0]
    fireEvent.keyDown(nameHeader, { key: 'Enter' })
    expect(nameHeader.getAttribute('aria-sort')).toBe('ascending')
  })

  it('Space key triggers sort on header', async () => {
    const { RichDataTable } = await import('../components/charts/table/RichDataTable')
    render(<RichDataTable data={sampleData} config={config as never} />)
    const scoreHeader = screen.getAllByRole('columnheader')[1]
    fireEvent.keyDown(scoreHeader, { key: ' ' })
    expect(scoreHeader.getAttribute('aria-sort')).toBe('ascending')
    // Press again for descending
    fireEvent.keyDown(scoreHeader, { key: ' ' })
    expect(scoreHeader.getAttribute('aria-sort')).toBe('descending')
  })

  it('third press clears sort (aria-sort back to none)', async () => {
    const { RichDataTable } = await import('../components/charts/table/RichDataTable')
    render(<RichDataTable data={sampleData} config={config as never} />)
    const header = screen.getAllByRole('columnheader')[0]
    fireEvent.keyDown(header, { key: 'Enter' }) // asc
    fireEvent.keyDown(header, { key: 'Enter' }) // desc
    fireEvent.keyDown(header, { key: 'Enter' }) // clear
    expect(header.getAttribute('aria-sort')).toBe('none')
  })
})

// ── M.4: checkPaletteAccessibility ────────────────────────────────────────────

describe('M.4: checkPaletteAccessibility', () => {
  it('returns safe for high-contrast palette', () => {
    const result = checkPaletteAccessibility(['#000000', '#ffffff'])
    expect(result.safe).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('returns safe for single color palette', () => {
    const result = checkPaletteAccessibility(['#ff0000'])
    expect(result.safe).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('flags red+green palette for protanopia', () => {
    // Red and green are classic confusable pair for protanopia
    const result = checkPaletteAccessibility(['#ff0000', '#00aa00'])
    expect(result.safe).toBe(false)
    // Should have at least a protanopia warning
    const protanopia = result.warnings.find((w) => w.cvdType === 'protanopia')
    expect(protanopia).toBeTruthy()
    expect(protanopia!.pairs.length).toBeGreaterThan(0)
    expect(protanopia!.message).toContain('Protanopia')
  })

  it('accepts custom minContrast threshold', () => {
    // With a very low threshold, even similar colors should pass
    const result = checkPaletteAccessibility(['#ff0000', '#00aa00'], 1.0)
    expect(result.safe).toBe(true)
  })

  it('warning pairs reference correct indices', () => {
    const result = checkPaletteAccessibility(['#ff0000', '#00aa00', '#0000ff'])
    for (const warning of result.warnings) {
      for (const [a, b] of warning.pairs) {
        expect(a).toBeGreaterThanOrEqual(0)
        expect(b).toBeGreaterThan(a)
        expect(b).toBeLessThan(3)
      }
    }
  })

  it('contrastRatio of identical colors is 1.0', () => {
    expect(contrastRatio('#ff0000', '#ff0000')).toBeCloseTo(1.0, 2)
  })

  it('contrastRatio of black and white is 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('simulateCVD returns a hex string', () => {
    const result = simulateCVD('#ff0000', 'protanopia')
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
  })
})

// ── M.5: Warning badge display logic ──────────────────────────────────────────

describe('M.5: ColorblindPreview warning badges', () => {
  // Mock colorblind utils are already real — we just test the component behavior
  vi.mock('../stores/chartThemeStore', () => ({
    useChartThemeStore: (selector: (s: unknown) => unknown) =>
      selector({
        theme: {
          font: {
            family: '',
            title: { size: 16, weight: 600 },
            subtitle: { size: 13, weight: 400 },
            source: { size: 11 },
          },
          card: {},
          palette: { colors: [] },
        },
      }),
  }))

  it('shows "Safe" badge for high-contrast palette', async () => {
    const { ColorblindPreview } = await import('../components/editor/ColorblindPreview')
    render(<ColorblindPreview colors={['#000000', '#ffffff']} />)
    expect(screen.getByText('Safe')).toBeTruthy()
  })

  it('shows warning count badge for confusable palette', async () => {
    const { ColorblindPreview } = await import('../components/editor/ColorblindPreview')
    render(<ColorblindPreview colors={['#ff0000', '#00aa00']} />)
    // Should show a warnings badge (not "Safe")
    const safeBadge = screen.queryByText('Safe')
    expect(safeBadge).toBeNull()
    // Should show warning count
    const warningBadge = screen.getByText(/warning/)
    expect(warningBadge).toBeTruthy()
  })

  it('shows warning message when CVD type with issues is active', async () => {
    const { ColorblindPreview } = await import('../components/editor/ColorblindPreview')
    render(<ColorblindPreview colors={['#ff0000', '#00aa00']} />)
    // Click the Protanopia button
    const protanBtn = screen.getByText(/Protanopia/)
    fireEvent.click(protanBtn)
    // Warning message should appear
    const warningMsg = screen.getByText(/may be hard to distinguish/)
    expect(warningMsg).toBeTruthy()
  })
})
