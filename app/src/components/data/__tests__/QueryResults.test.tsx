import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { QueryResults } from '../QueryResults'

const mockData = {
  columns: ['id', 'name', 'email'],
  column_types: ['INTEGER', 'VARCHAR', 'VARCHAR'],
  rows: [
    [1, 'Alice', 'alice@example.com'],
    [2, 'Bob', 'bob@example.com'],
  ],
  row_count: 2,
  truncated: false,
  execution_time_ms: 342,
}

describe('QueryResults', () => {
  it('renders column headers', () => {
    render(<QueryResults data={mockData} error={null} onChartThis={() => {}} />)
    expect(screen.getByText('id')).toBeInTheDocument()
    expect(screen.getByText('name')).toBeInTheDocument()
  })

  it('renders row data', () => {
    render(<QueryResults data={mockData} error={null} onChartThis={() => {}} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows row count and execution time', () => {
    render(<QueryResults data={mockData} error={null} onChartThis={() => {}} />)
    expect(screen.getByText(/2 rows/)).toBeInTheDocument()
    expect(screen.getByText(/0\.3s/)).toBeInTheDocument()
  })

  it('shows Chart this button', () => {
    render(<QueryResults data={mockData} error={null} onChartThis={() => {}} />)
    expect(screen.getByText('Chart this')).toBeInTheDocument()
  })

  it('calls onChartThis when clicked', () => {
    const handler = vi.fn()
    render(<QueryResults data={mockData} error={null} onChartThis={handler} />)
    fireEvent.click(screen.getByText('Chart this'))
    expect(handler).toHaveBeenCalled()
  })

  it('shows error with Fix with AI button', () => {
    const onFix = vi.fn()
    render(<QueryResults data={null} error="column 'foo' not found" onChartThis={() => {}} onFixWithAi={onFix} />)
    expect(screen.getByText(/column 'foo' not found/)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Fix with AI/))
    expect(onFix).toHaveBeenCalled()
  })

  it('shows truncation warning', () => {
    const truncData = { ...mockData, truncated: true }
    render(<QueryResults data={truncData} error={null} onChartThis={() => {}} />)
    expect(screen.getByText(/limited/i)).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<QueryResults data={null} error={null} loading={true} onChartThis={() => {}} />)
    expect(screen.getByText(/Running/)).toBeInTheDocument()
  })

  it('sorts columns when header is clicked', () => {
    const sortData = {
      ...mockData,
      rows: [
        [2, 'Bob', 'bob@example.com'],
        [1, 'Alice', 'alice@example.com'],
      ] as (string | number | boolean | null)[][],
    }
    render(<QueryResults data={sortData} error={null} onChartThis={() => {}} />)

    // Click "name" header to sort ascending
    fireEvent.click(screen.getByText('name'))
    const cells = screen.getAllByRole('cell')
    // After ascending sort on name: Alice should come before Bob
    const nameValues = cells.filter((_, i) => i % 3 === 1).map((c) => c.textContent)
    expect(nameValues).toEqual(['Alice', 'Bob'])
  })

  it('renders null values as italic "null"', () => {
    const nullData = {
      ...mockData,
      rows: [[1, null, 'alice@example.com']] as (string | number | boolean | null)[][],
    }
    render(<QueryResults data={nullData} error={null} onChartThis={() => {}} />)
    const nullCell = screen.getByText('null')
    expect(nullCell).toBeInTheDocument()
    expect(nullCell.tagName).toBe('SPAN')
    expect(nullCell.className).toContain('italic')
  })

  it('returns null when no data and no error', () => {
    const { container } = render(<QueryResults data={null} error={null} onChartThis={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
