import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SchemaTree } from '../SchemaTree'

const mockSchema = [
  {
    name: 'PUBLIC',
    tables: [
      {
        name: 'CUSTOMERS',
        columns: [
          { name: 'id', type: 'INTEGER' },
          { name: 'name', type: 'VARCHAR' },
        ],
        row_count: 1200,
      },
    ],
  },
]

describe('SchemaTree', () => {
  it('renders schema names', () => {
    render(<SchemaTree schemas={mockSchema} onSelectTable={() => {}} onInsertColumn={() => {}} />)
    expect(screen.getByText('PUBLIC')).toBeInTheDocument()
  })

  it('expands schema to show tables on click', () => {
    render(<SchemaTree schemas={mockSchema} onSelectTable={() => {}} onInsertColumn={() => {}} />)
    fireEvent.click(screen.getByText('PUBLIC'))
    expect(screen.getByText('CUSTOMERS')).toBeInTheDocument()
  })

  it('calls onSelectTable when table is clicked', () => {
    const onSelect = vi.fn()
    render(<SchemaTree schemas={mockSchema} onSelectTable={onSelect} onInsertColumn={() => {}} />)
    fireEvent.click(screen.getByText('PUBLIC'))
    fireEvent.click(screen.getByText('CUSTOMERS'))
    expect(onSelect).toHaveBeenCalledWith('PUBLIC', 'CUSTOMERS')
  })

  it('shows row count next to table', () => {
    render(<SchemaTree schemas={mockSchema} onSelectTable={() => {}} onInsertColumn={() => {}} />)
    fireEvent.click(screen.getByText('PUBLIC'))
    expect(screen.getByText(/1,200/)).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<SchemaTree schemas={[]} loading={true} onSelectTable={() => {}} onInsertColumn={() => {}} />)
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('shows empty state', () => {
    render(<SchemaTree schemas={[]} onSelectTable={() => {}} onInsertColumn={() => {}} />)
    expect(screen.getByText(/No schemas/)).toBeInTheDocument()
  })

  it('expands table to show columns on chevron click', () => {
    render(<SchemaTree schemas={mockSchema} onSelectTable={() => {}} onInsertColumn={() => {}} />)
    // Expand schema first
    fireEvent.click(screen.getByText('PUBLIC'))
    // Find the table row chevron (small expand button next to CUSTOMERS)
    const chevronButtons = screen.getAllByRole('button')
    // The chevron button for the table is the one that is NOT the schema toggle and NOT the table name
    // We look for the small chevron button next to the table row
    const tableChevron = chevronButtons.find(
      (btn) => btn.querySelector('svg.h-3')
    )
    expect(tableChevron).toBeTruthy()
    fireEvent.click(tableChevron!)
    // Now columns should be visible
    expect(screen.getByText('id')).toBeInTheDocument()
    expect(screen.getByText('INTEGER')).toBeInTheDocument()
    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('VARCHAR')).toBeInTheDocument()
  })

  it('calls onInsertColumn when column is clicked', () => {
    const onInsert = vi.fn()
    render(<SchemaTree schemas={mockSchema} onSelectTable={() => {}} onInsertColumn={onInsert} />)
    // Expand schema
    fireEvent.click(screen.getByText('PUBLIC'))
    // Expand table
    const chevronButtons = screen.getAllByRole('button')
    const tableChevron = chevronButtons.find(
      (btn) => btn.querySelector('svg.h-3')
    )
    fireEvent.click(tableChevron!)
    // Click on a column
    fireEvent.click(screen.getByText('id'))
    expect(onInsert).toHaveBeenCalledWith('PUBLIC', 'CUSTOMERS', 'id')
  })

  it('collapses schema on second click', () => {
    render(<SchemaTree schemas={mockSchema} onSelectTable={() => {}} onInsertColumn={() => {}} />)
    // Expand
    fireEvent.click(screen.getByText('PUBLIC'))
    expect(screen.getByText('CUSTOMERS')).toBeInTheDocument()
    // Collapse
    fireEvent.click(screen.getByText('PUBLIC'))
    expect(screen.queryByText('CUSTOMERS')).not.toBeInTheDocument()
  })
})
