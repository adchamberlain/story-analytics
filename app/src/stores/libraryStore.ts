import { create } from 'zustand'

// ── Types ───────────────────────────────────────────────────────────────────

export interface LibraryChart {
  id: string
  source_id: string
  chart_type: string
  title: string
  subtitle: string | null
  source: string | null
  created_at: string
  updated_at: string
}

export type SortField = 'updated_at' | 'created_at' | 'title'

interface LibraryState {
  charts: LibraryChart[]
  loading: boolean
  error: string | null

  // Filters
  search: string
  typeFilter: string | null
  sortBy: SortField

  // Actions
  loadCharts: () => Promise<void>
  deleteChart: (id: string) => Promise<void>
  setSearch: (search: string) => void
  setTypeFilter: (type: string | null) => void
  setSortBy: (field: SortField) => void

  // Computed
  filteredCharts: () => LibraryChart[]
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  charts: [],
  loading: false,
  error: null,
  search: '',
  typeFilter: null,
  sortBy: 'updated_at',

  loadCharts: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch('/api/v2/charts/')
      if (!res.ok) throw new Error(`Failed to load charts: ${res.statusText}`)
      const charts: LibraryChart[] = await res.json()
      set({ charts, loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  deleteChart: async (id: string) => {
    try {
      const res = await fetch(`/api/v2/charts/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`)
      set((state) => ({ charts: state.charts.filter((c) => c.id !== id) }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  setSearch: (search) => set({ search }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setSortBy: (sortBy) => set({ sortBy }),

  filteredCharts: () => {
    const { charts, search, typeFilter, sortBy } = get()

    let filtered = charts

    // Search by title
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        (c.subtitle?.toLowerCase().includes(q) ?? false)
      )
    }

    // Filter by chart type
    if (typeFilter) {
      filtered = filtered.filter((c) => c.chart_type === typeFilter)
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title)
      // Date fields: newest first
      return b[sortBy].localeCompare(a[sortBy])
    })

    return filtered
  },
}))
