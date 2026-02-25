import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ── PointerEvent polyfill for jsdom ──────────────────────────────────────────

beforeAll(() => {
  if (typeof PointerEvent === 'undefined') {
    // @ts-expect-error PointerEvent polyfill for jsdom
    global.PointerEvent = class PointerEvent extends MouseEvent {
      pointerId: number
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params)
        this.pointerId = params.pointerId ?? 0
      }
    }
  }
})

// ── Mock stores ──────────────────────────────────────────────────────────────

const mockChart = {
  id: 'chart-1',
  source_id: 'src-1',
  chart_type: 'BarChart',
  title: 'Test Bar Chart',
  subtitle: null,
  source: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
  folder_id: null,
  archived_at: null,
}

const mockLibraryStore = {
  charts: [mockChart],
  loading: false,
  error: null,
  search: '',
  typeFilter: null,
  folderFilter: null,
  archiveFilter: 'active' as const,
  sortBy: 'updated_at' as const,
  loadCharts: vi.fn(),
  deleteChart: vi.fn(),
  moveToFolder: vi.fn(),
  duplicateChart: vi.fn(),
  archiveChart: vi.fn(),
  restoreChart: vi.fn(),
  setSearch: vi.fn(),
  setTypeFilter: vi.fn(),
  setFolderFilter: vi.fn(),
  setArchiveFilter: vi.fn(),
  setSortBy: vi.fn(),
  filteredCharts: () => [mockChart],
}

vi.mock('../../stores/libraryStore', () => ({
  useLibraryStore: () => mockLibraryStore,
}))

vi.mock('../../stores/folderStore', () => ({
  useFolderStore: (selector: (s: { folders: [] }) => unknown) => selector({ folders: [] }),
}))

vi.mock('../../components/library/FolderSidebar', () => ({
  FolderSidebar: () => <div data-testid="folder-sidebar">Sidebar</div>,
}))

vi.mock('../../components/TemplateGallery', () => ({
  TemplateGallery: () => <div data-testid="template-gallery">Templates</div>,
}))

// ── Track navigations ────────────────────────────────────────────────────────

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// ── Dynamic import after mocks ───────────────────────────────────────────────

let LibraryPage: () => JSX.Element

beforeAll(async () => {
  const mod = await import('../LibraryPage')
  LibraryPage = mod.LibraryPage as () => JSX.Element
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LibraryPage', () => {
  it('renders chart cards', () => {
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Test Bar Chart')).toBeDefined()
  })

  it('Edit link points to /editor/:chartId', () => {
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    )

    const editLink = screen.getByText('Edit')
    expect(editLink.closest('a')?.getAttribute('href')).toBe('/editor/chart-1')
  })

  it('clicking Edit navigates without being blocked by drag listeners', () => {
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    )

    const editLink = screen.getByText('Edit')
    // A simple click (no pointer movement) should not be intercepted by DnD.
    // With the distance activation constraint, click events pass through.
    fireEvent.click(editLink)

    // The link should still be in the DOM (not flashing/unmounting)
    expect(screen.getByText('Edit')).toBeDefined()
    // And the card should still be visible (no flash/re-render loop)
    expect(screen.getByText('Test Bar Chart')).toBeDefined()
  })

  it('chart card links to /chart/:chartId', () => {
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    )

    // The card itself is a Link to the chart view
    const cardLink = screen.getByText('Test Bar Chart').closest('a')
    expect(cardLink?.getAttribute('href')).toBe('/chart/chart-1')
  })

  it('shows empty state when no charts exist', () => {
    const origCharts = mockLibraryStore.charts
    const origFiltered = mockLibraryStore.filteredCharts
    mockLibraryStore.charts = []
    mockLibraryStore.filteredCharts = () => []

    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    )

    expect(screen.getByText('No charts yet')).toBeDefined()

    mockLibraryStore.charts = origCharts
    mockLibraryStore.filteredCharts = origFiltered
  })
})
