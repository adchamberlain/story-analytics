import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RichDataTable } from '../RichDataTable'

const SAMPLE_DATA = [
  { name: 'Alice', revenue: 1200, growth: 0.15, region: 'West' },
  { name: 'Bob', revenue: 800, growth: -0.05, region: 'East' },
  { name: 'Charlie', revenue: 2400, growth: 0.32, region: 'West' },
  { name: 'Diana', revenue: 1600, growth: 0.08, region: 'North' },
  { name: 'Eve', revenue: 950, growth: -0.12, region: 'South' },
]

// Generate larger dataset for pagination tests
const LARGE_DATA = Array.from({ length: 55 }, (_, i) => ({
  id: i + 1,
  name: `Item ${i + 1}`,
  value: Math.round(Math.random() * 1000),
}))

describe('RichDataTable', () => {
  describe('basic rendering', () => {
    it('renders column headers from data keys', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      expect(screen.getByText('name')).toBeDefined()
      expect(screen.getByText('revenue')).toBeDefined()
      expect(screen.getByText('growth')).toBeDefined()
      expect(screen.getByText('region')).toBeDefined()
    })

    it('renders all rows when data fits one page', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      expect(screen.getByText('Alice')).toBeDefined()
      expect(screen.getByText('Bob')).toBeDefined()
      expect(screen.getByText('Charlie')).toBeDefined()
      expect(screen.getByText('Diana')).toBeDefined()
      expect(screen.getByText('Eve')).toBeDefined()
    })

    it('shows empty state for no data', () => {
      render(<RichDataTable data={[]} config={{}} />)
      expect(screen.getByText('No data')).toBeDefined()
    })

    it('renders row count info', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      expect(screen.getByText(/5 rows/)).toBeDefined()
    })
  })

  describe('sorting', () => {
    it('sorts ascending on first header click', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      fireEvent.click(screen.getByText('revenue'))
      const cells = screen.getAllByRole('cell')
      // revenue cells are at indices 1, 5, 9, 13, 17 (every 4th starting from 1)
      const revenueCells = cells.filter((_, i) => i % 4 === 1)
      const values = revenueCells.map((c) => Number(c.textContent!.replace(/,/g, '')))
      expect(values).toEqual([800, 950, 1200, 1600, 2400])
    })

    it('sorts descending on second header click', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      fireEvent.click(screen.getByText('revenue'))
      fireEvent.click(screen.getByText('revenue'))
      const cells = screen.getAllByRole('cell')
      const revenueCells = cells.filter((_, i) => i % 4 === 1)
      const values = revenueCells.map((c) => Number(c.textContent!.replace(/,/g, '')))
      expect(values).toEqual([2400, 1600, 1200, 950, 800])
    })

    it('resets sort on third header click', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      fireEvent.click(screen.getByText('revenue'))
      fireEvent.click(screen.getByText('revenue'))
      fireEvent.click(screen.getByText('revenue'))
      const cells = screen.getAllByRole('cell')
      const nameCells = cells.filter((_, i) => i % 4 === 0)
      // Should be back to original order
      expect(nameCells[0].textContent).toBe('Alice')
    })

    it('sorts strings alphabetically', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      fireEvent.click(screen.getByText('name'))
      const cells = screen.getAllByRole('cell')
      const nameCells = cells.filter((_, i) => i % 4 === 0)
      expect(nameCells.map((c) => c.textContent)).toEqual([
        'Alice',
        'Bob',
        'Charlie',
        'Diana',
        'Eve',
      ])
    })
  })

  describe('search', () => {
    it('filters rows by search term', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      const searchInput = screen.getByPlaceholderText(/search/i)
      fireEvent.change(searchInput, { target: { value: 'ali' } })
      expect(screen.getByText('Alice')).toBeDefined()
      expect(screen.queryByText('Bob')).toBeNull()
    })

    it('searches across all columns', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      const searchInput = screen.getByPlaceholderText(/search/i)
      fireEvent.change(searchInput, { target: { value: 'West' } })
      expect(screen.getByText('Alice')).toBeDefined()
      expect(screen.getByText('Charlie')).toBeDefined()
      expect(screen.queryByText('Bob')).toBeNull()
    })

    it('shows no results message when search matches nothing', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      const searchInput = screen.getByPlaceholderText(/search/i)
      fireEvent.change(searchInput, { target: { value: 'zzzzz' } })
      expect(screen.getByText(/no matching rows/i)).toBeDefined()
    })

    it('updates row count to reflect filtered results', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      const searchInput = screen.getByPlaceholderText(/search/i)
      fireEvent.change(searchInput, { target: { value: 'West' } })
      expect(screen.getByText(/2 of 5 rows/)).toBeDefined()
    })
  })

  describe('pagination', () => {
    it('shows only first page of rows', () => {
      render(<RichDataTable data={LARGE_DATA} config={{}} />)
      // Default page size is 25
      const rows = screen.getAllByRole('row')
      // Header row + 25 data rows = 26
      expect(rows.length).toBe(26)
    })

    it('navigates to next page', () => {
      render(<RichDataTable data={LARGE_DATA} config={{}} />)
      const nextBtn = screen.getByRole('button', { name: /next/i })
      fireEvent.click(nextBtn)
      // Second page should show 25 rows (items 26-50)
      const rows = screen.getAllByRole('row')
      expect(rows.length).toBe(26) // header + 25
    })

    it('shows page info', () => {
      render(<RichDataTable data={LARGE_DATA} config={{}} />)
      expect(screen.getByText(/page 1 of 3/i)).toBeDefined()
    })

    it('disables prev button on first page', () => {
      render(<RichDataTable data={LARGE_DATA} config={{}} />)
      const prevBtn = screen.getByRole('button', { name: /prev/i })
      expect(prevBtn).toHaveProperty('disabled', true)
    })

    it('allows changing page size', () => {
      render(<RichDataTable data={LARGE_DATA} config={{}} />)
      const pageSizeSelect = screen.getByRole('combobox')
      fireEvent.change(pageSizeSelect, { target: { value: '10' } })
      const rows = screen.getAllByRole('row')
      expect(rows.length).toBe(11) // header + 10
    })
  })

  describe('number formatting', () => {
    it('right-aligns numeric columns', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      const cells = screen.getAllByRole('cell')
      // revenue is column index 1, should have text-right class
      const revenueCell = cells[1]
      expect(revenueCell.className).toContain('text-right')
    })

    it('formats numbers with locale separators', () => {
      render(
        <RichDataTable
          data={[{ name: 'Test', revenue: 1234567.89 }]}
          config={{}}
        />,
      )
      // Should contain formatted number with comma separator
      expect(screen.getByText(/1,234,567/)).toBeDefined()
    })
  })

  describe('heatmap cells', () => {
    it('applies background color based on value range', () => {
      render(
        <RichDataTable
          data={SAMPLE_DATA}
          config={{
            tableColumns: {
              revenue: { type: 'heatmap' },
            },
          }}
        />,
      )
      const cells = screen.getAllByRole('cell')
      const revenueCells = cells.filter((_, i) => i % 4 === 1)
      // Highest value (2400) should have an inner span with background style
      const maxCell = revenueCells.find((c) => c.textContent?.includes('2,400'))
      const span = maxCell?.querySelector('span')
      expect(span?.style.backgroundColor).toBeTruthy()
    })
  })

  describe('bar cells', () => {
    it('renders inline bar proportional to value', () => {
      render(
        <RichDataTable
          data={SAMPLE_DATA}
          config={{
            tableColumns: {
              revenue: { type: 'bar' },
            },
          }}
        />,
      )
      // Bar cells should have a child div with width style
      const cells = screen.getAllByRole('cell')
      const revenueCells = cells.filter((_, i) => i % 4 === 1)
      const barDiv = revenueCells[0].querySelector('[data-testid="bar-fill"]')
      expect(barDiv).toBeTruthy()
    })
  })

  describe('sparkline cells', () => {
    it('renders SVG sparkline when column type is sparkline', () => {
      const sparkData = [
        { name: 'A', trend: [10, 20, 15, 30, 25] },
        { name: 'B', trend: [5, 8, 12, 6, 9] },
      ]
      render(
        <RichDataTable
          data={sparkData}
          config={{
            tableColumns: {
              trend: { type: 'sparkline' },
            },
          }}
        />,
      )
      const svgs = document.querySelectorAll('svg.sparkline')
      expect(svgs.length).toBe(2)
    })
  })

  describe('sticky header', () => {
    it('renders thead with sticky positioning', () => {
      render(<RichDataTable data={SAMPLE_DATA} config={{}} />)
      const thead = document.querySelector('thead')
      expect(thead?.className).toContain('sticky')
    })
  })

  describe('edge cases', () => {
    it('handles null and undefined values', () => {
      const dataWithNulls = [
        { name: 'Alice', value: null },
        { name: null, value: 100 },
        { name: 'Charlie', value: undefined },
      ]
      render(<RichDataTable data={dataWithNulls} config={{}} />)
      // Should render without crashing
      expect(screen.getByText('Alice')).toBeDefined()
      expect(screen.getByText('100')).toBeDefined()
    })

    it('handles single-row data', () => {
      render(<RichDataTable data={[{ a: 1, b: 2 }]} config={{}} />)
      expect(screen.getByText('1')).toBeDefined()
    })

    it('handles unicode data', () => {
      render(
        <RichDataTable
          data={[{ name: '日本語', value: 'Ñoño 🎉' }]}
          config={{}}
        />,
      )
      expect(screen.getByText('日本語')).toBeDefined()
      expect(screen.getByText('Ñoño 🎉')).toBeDefined()
    })

    it('handles wide tables with many columns', () => {
      const wideRow: Record<string, unknown> = {}
      for (let i = 0; i < 30; i++) wideRow[`col_${i}`] = i
      render(<RichDataTable data={[wideRow]} config={{}} />)
      expect(screen.getByText('col_0')).toBeDefined()
      expect(screen.getByText('col_29')).toBeDefined()
    })
  })
})
