import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DataTransformGrid } from '../components/editor/DataTransformGrid'

const mockData = {
  columns: ['name', 'age', 'city'],
  rows: [
    { name: 'Alice', age: '30', city: 'NYC' },
    { name: 'Bob', age: '25', city: 'LA' },
  ],
  row_count: 2,
}

describe('DataTransformGrid', () => {
  it('renders column headers', () => {
    render(<DataTransformGrid data={mockData} sourceId="abc" onTransform={vi.fn()} />)
    expect(screen.getByText('name')).toBeDefined()
    expect(screen.getByText('age')).toBeDefined()
    expect(screen.getByText('city')).toBeDefined()
  })

  it('renders all data rows', () => {
    render(<DataTransformGrid data={mockData} sourceId="abc" onTransform={vi.fn()} />)
    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('Bob')).toBeDefined()
    expect(screen.getByText('NYC')).toBeDefined()
    expect(screen.getByText('LA')).toBeDefined()
  })

  it('renders row numbers', () => {
    render(<DataTransformGrid data={mockData} sourceId="abc" onTransform={vi.fn()} />)
    expect(screen.getByText('1')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
  })

  it('renders row count summary', () => {
    render(<DataTransformGrid data={mockData} sourceId="abc" onTransform={vi.fn()} />)
    expect(screen.getByText('2 rows | 3 columns')).toBeDefined()
  })

  it('enters edit mode on cell click', () => {
    render(<DataTransformGrid data={mockData} sourceId="abc" onTransform={vi.fn()} />)
    fireEvent.click(screen.getByText('Alice'))
    expect(screen.getByDisplayValue('Alice')).toBeDefined()
  })

  it('shows column dropdown menu on header button click', () => {
    render(<DataTransformGrid data={mockData} sourceId="abc" onTransform={vi.fn()} />)
    // Click the dropdown trigger on a data column header (skip the row-number '#' header)
    const menuButton = screen.getByLabelText('Column menu for name')
    fireEvent.click(menuButton)
    expect(screen.getByText('Rename')).toBeDefined()
    expect(screen.getByText('Delete Column')).toBeDefined()
    expect(screen.getByText('Round...')).toBeDefined()
  })

  it('calls onTransform with edit-cell when cell is edited and blurred', async () => {
    const onTransform = vi.fn().mockResolvedValue(undefined)
    render(<DataTransformGrid data={mockData} sourceId="abc" onTransform={onTransform} />)
    fireEvent.click(screen.getByText('Alice'))
    const input = screen.getByDisplayValue('Alice')
    fireEvent.change(input, { target: { value: 'Alicia' } })
    fireEvent.blur(input)
    expect(onTransform).toHaveBeenCalledWith('edit-cell', { row: 0, column: 'name', value: 'Alicia' })
  })

  it('calls onTransform with transpose on Transpose button click', () => {
    const onTransform = vi.fn().mockResolvedValue(undefined)
    render(<DataTransformGrid data={mockData} sourceId="abc" onTransform={onTransform} />)
    fireEvent.click(screen.getByText('Transpose'))
    expect(onTransform).toHaveBeenCalledWith('transpose', {})
  })

  it('shows empty state when no columns', () => {
    const emptyData = { columns: [], rows: [], row_count: 0 }
    render(<DataTransformGrid data={emptyData} sourceId="abc" onTransform={vi.fn()} />)
    expect(screen.getByText('No data to display')).toBeDefined()
  })

  it('renders null values with italic styling', () => {
    const dataWithNull = {
      columns: ['name', 'value'],
      rows: [{ name: 'Alice', value: null }],
      row_count: 1,
    }
    render(<DataTransformGrid data={dataWithNull} sourceId="abc" onTransform={vi.fn()} />)
    const nullCell = screen.getByText('null')
    expect(nullCell.className).toContain('italic')
  })
})
