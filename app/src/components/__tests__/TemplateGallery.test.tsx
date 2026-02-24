import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TemplateGallery, type Template } from '../TemplateGallery'

const MOCK_TEMPLATES: Template[] = [
  {
    id: 'tmpl-1',
    name: 'Sales Overview',
    description: 'A bar chart showing monthly revenue',
    chart_type: 'BarChart',
    config: { palette: 'blue' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'tmpl-2',
    name: 'Growth Trend',
    description: 'A line chart tracking weekly growth',
    chart_type: 'LineChart',
    config: { palette: 'green' },
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
]

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  ;(globalThis as Record<string, unknown>).fetch = fetchMock
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TemplateGallery', () => {
  it('renders loading state initially', () => {
    // Never resolve fetch to keep loading state
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<TemplateGallery onSelect={() => {}} />)

    expect(screen.getByTestId('template-loading')).toBeDefined()
    expect(screen.getByText('Loading templates...')).toBeDefined()
  })

  it('renders template cards after successful fetch', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_TEMPLATES),
    })

    render(<TemplateGallery onSelect={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Sales Overview')).toBeDefined()
    })

    expect(screen.getByText('Growth Trend')).toBeDefined()

    const cards = screen.getAllByTestId('template-card')
    expect(cards.length).toBe(2)
  })

  it('renders "Use Template" buttons that call onSelect', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_TEMPLATES),
    })

    const handleSelect = vi.fn()
    render(<TemplateGallery onSelect={handleSelect} />)

    await waitFor(() => {
      expect(screen.getAllByTestId('use-template-btn').length).toBe(2)
    })

    const buttons = screen.getAllByTestId('use-template-btn')
    fireEvent.click(buttons[0])

    expect(handleSelect).toHaveBeenCalledTimes(1)
    expect(handleSelect).toHaveBeenCalledWith(MOCK_TEMPLATES[0])
  })

  it('renders empty state when no templates exist', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    render(<TemplateGallery onSelect={() => {}} />)

    await waitFor(() => {
      expect(screen.getByTestId('template-empty')).toBeDefined()
    })
    expect(screen.getByText('No templates available yet.')).toBeDefined()
  })

  it('filters templates by search query', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_TEMPLATES),
    })

    render(<TemplateGallery onSelect={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Sales Overview')).toBeDefined()
    })

    // Type in search box
    const input = screen.getByPlaceholderText('Search templates...')
    fireEvent.change(input, { target: { value: 'Growth' } })

    // "Sales Overview" should be filtered out
    expect(screen.queryByText('Sales Overview')).toBeNull()
    expect(screen.getByText('Growth Trend')).toBeDefined()
  })
})
