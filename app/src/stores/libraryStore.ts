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
  folder_id: string | null
  archived_at: string | null
}

export type SortField = 'updated_at' | 'created_at' | 'title'
export type ArchiveFilter = 'active' | 'archived' | 'all'

interface LibraryState {
  charts: LibraryChart[]
  loading: boolean
  error: string | null

  // Filters
  search: string
  typeFilter: string | null
  folderFilter: string | null  // null = all, 'unfiled' = no folder, else folder_id
  archiveFilter: ArchiveFilter
  sortBy: SortField

  // Actions
  loadCharts: () => Promise<void>
  deleteChart: (id: string) => Promise<void>
  moveToFolder: (chartId: string, folderId: string | null) => Promise<void>
  duplicateChart: (id: string) => Promise<string | null>
  archiveChart: (id: string) => Promise<void>
  restoreChart: (id: string) => Promise<void>
  setSearch: (search: string) => void
  setTypeFilter: (type: string | null) => void
  setFolderFilter: (folderId: string | null) => void
  setArchiveFilter: (filter: ArchiveFilter) => void
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
  folderFilter: null,
  archiveFilter: 'active',
  sortBy: 'updated_at',

  loadCharts: async () => {
    set({ loading: true, error: null })
    try {
      const { archiveFilter } = get()
      const res = await fetch(`/api/v2/charts/?status=${archiveFilter}`)
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

  moveToFolder: async (chartId, folderId) => {
    try {
      const res = await fetch(`/api/v2/charts/${chartId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folderId }),
      })
      if (!res.ok) throw new Error('Move failed')
      set((state) => ({
        charts: state.charts.map((c) =>
          c.id === chartId ? { ...c, folder_id: folderId } : c,
        ),
      }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  duplicateChart: async (id: string) => {
    try {
      const res = await fetch(`/api/v2/charts/${id}/duplicate`, { method: 'POST' })
      if (!res.ok) throw new Error(`Duplicate failed: ${res.statusText}`)
      const newChart: LibraryChart = await res.json()
      set((state) => ({ charts: [newChart, ...state.charts] }))
      return newChart.id
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      return null
    }
  },

  archiveChart: async (id: string) => {
    try {
      const res = await fetch(`/api/v2/charts/${id}/archive`, { method: 'PUT' })
      if (!res.ok) throw new Error(`Archive failed: ${res.statusText}`)
      // Remove from current view (since active view won't show archived)
      set((state) => ({ charts: state.charts.filter((c) => c.id !== id) }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  restoreChart: async (id: string) => {
    try {
      const res = await fetch(`/api/v2/charts/${id}/restore`, { method: 'PUT' })
      if (!res.ok) throw new Error(`Restore failed: ${res.statusText}`)
      // Remove from current view (since archived view won't show active)
      set((state) => ({ charts: state.charts.filter((c) => c.id !== id) }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  setSearch: (search) => set({ search }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setFolderFilter: (folderFilter) => set({ folderFilter }),
  setArchiveFilter: (archiveFilter) => {
    set({ archiveFilter })
    // Reload charts with the new filter
    get().loadCharts()
  },
  setSortBy: (sortBy) => set({ sortBy }),

  filteredCharts: () => {
    const { charts, search, typeFilter, folderFilter, sortBy } = get()

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

    // Filter by folder
    if (folderFilter === 'unfiled') {
      filtered = filtered.filter((c) => !c.folder_id)
    } else if (folderFilter) {
      filtered = filtered.filter((c) => c.folder_id === folderFilter)
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
