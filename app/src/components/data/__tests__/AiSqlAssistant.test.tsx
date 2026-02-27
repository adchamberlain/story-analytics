import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { AiSqlAssistant } from '../AiSqlAssistant'

const defaultProps = {
  dialect: 'snowflake' as const,
  schemaContext: 'Table users: id INT, name VARCHAR',
  currentSql: '',
  errorMessage: null,
  onInsertSql: vi.fn(),
}

describe('AiSqlAssistant', () => {
  it('renders collapsed by default', () => {
    render(<MemoryRouter><AiSqlAssistant {...defaultProps} /></MemoryRouter>)
    expect(screen.getByText('AI Assistant')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/unique customer/i)).not.toBeInTheDocument()
  })

  it('expands on header click', () => {
    render(<MemoryRouter><AiSqlAssistant {...defaultProps} /></MemoryRouter>)
    fireEvent.click(screen.getByText('AI Assistant'))
    expect(screen.getByPlaceholderText(/unique customer/i)).toBeInTheDocument()
  })

  it('shows setup link when not configured', () => {
    render(<MemoryRouter><AiSqlAssistant {...defaultProps} aiConfigured={false} /></MemoryRouter>)
    expect(screen.getByText(/Set up AI provider/)).toBeInTheDocument()
  })

  it('collapses on second header click', () => {
    render(<MemoryRouter><AiSqlAssistant {...defaultProps} /></MemoryRouter>)
    const header = screen.getByText('AI Assistant')
    fireEvent.click(header) // expand
    fireEvent.click(header) // collapse
    expect(screen.queryByPlaceholderText(/unique customer/i)).not.toBeInTheDocument()
  })
})
