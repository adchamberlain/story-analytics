import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { forwardRef } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { SqlWorkbenchPanel } from '../SqlWorkbenchPanel'

// Mock subcomponents to isolate panel logic
vi.mock('../SchemaTree', () => ({
  SchemaTree: (props: Record<string, unknown>) => (
    <div data-testid="schema-tree" data-loading={String(props.loading)} />
  ),
}))

vi.mock('../SqlEditor', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SqlEditor: forwardRef((_props: any, _ref: any) => <div data-testid="sql-editor" />),
}))

vi.mock('../AiSqlAssistant', () => ({
  AiSqlAssistant: (props: Record<string, unknown>) => (
    <div data-testid="ai-assistant" data-dialect={props.dialect} />
  ),
}))

vi.mock('../QueryResults', () => ({
  QueryResults: () => <div data-testid="query-results" />,
}))

// Mock authFetch
vi.mock('../../../utils/authFetch', () => ({
  authFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ schemas: [] }),
  }),
}))

// Mock useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

function renderPanel(props: Partial<React.ComponentProps<typeof SqlWorkbenchPanel>> = {}) {
  const defaultProps = {
    connectionId: 'abc123',
    connectionName: 'Test Snowflake',
    dbType: 'snowflake',
    onClose: vi.fn(),
  }
  return render(
    <MemoryRouter>
      <SqlWorkbenchPanel {...defaultProps} {...props} />
    </MemoryRouter>,
  )
}

describe('SqlWorkbenchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when connectionId is null', () => {
    const { container } = render(
      <MemoryRouter>
        <SqlWorkbenchPanel
          connectionId={null}
          connectionName=""
          dbType="snowflake"
          onClose={() => {}}
        />
      </MemoryRouter>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders panel with connection name', () => {
    renderPanel({ connectionName: 'Test Snowflake' })
    expect(screen.getByText('Test Snowflake')).toBeInTheDocument()
  })

  it('renders db type badge', () => {
    renderPanel({ dbType: 'snowflake' })
    expect(screen.getByText('snowflake')).toBeInTheDocument()
  })

  it('renders all subcomponents', () => {
    renderPanel()
    expect(screen.getByTestId('schema-tree')).toBeInTheDocument()
    expect(screen.getByTestId('sql-editor')).toBeInTheDocument()
    expect(screen.getByTestId('ai-assistant')).toBeInTheDocument()
    expect(screen.getByTestId('query-results')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    renderPanel({ onClose })
    fireEvent.click(screen.getByTitle('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn()
    renderPanel({ onClose })
    fireEvent.click(screen.getByTestId('workbench-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    renderPanel({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders refresh schema button', () => {
    renderPanel()
    expect(screen.getByTitle('Refresh schema')).toBeInTheDocument()
  })

  it('shows Run button', () => {
    renderPanel()
    expect(screen.getByText('Run')).toBeInTheDocument()
  })

  it('applies correct badge colors for postgres', () => {
    renderPanel({ dbType: 'postgres' })
    const badge = screen.getByText('postgres')
    expect(badge.className).toContain('bg-blue-500/15')
  })

  it('applies correct badge colors for bigquery', () => {
    renderPanel({ dbType: 'bigquery' })
    const badge = screen.getByText('bigquery')
    expect(badge.className).toContain('bg-amber-500/15')
  })
})
