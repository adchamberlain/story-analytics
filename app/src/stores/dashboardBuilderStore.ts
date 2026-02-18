import { create } from 'zustand'

// ── Types ───────────────────────────────────────────────────────────────────

export interface GridLayout {
  x: number
  y: number
  w: number
  h: number
}

export interface DashboardChartRef {
  chart_id: string
  width: 'full' | 'half'
  layout?: GridLayout
}

interface DashboardBuilderState {
  // Dashboard metadata
  dashboardId: string | null
  title: string
  description: string

  // Charts in order
  charts: DashboardChartRef[]

  // UI state
  loading: boolean
  saving: boolean
  error: string | null
  pickerOpen: boolean

  // Actions
  setTitle: (title: string) => void
  setDescription: (description: string) => void
  addChart: (chartId: string, width?: 'full' | 'half') => void
  removeChart: (chartId: string) => void
  moveChart: (chartId: string, direction: 'up' | 'down') => void
  setChartWidth: (chartId: string, width: 'full' | 'half') => void
  setPickerOpen: (open: boolean) => void
  updateLayouts: (layouts: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void
  save: () => Promise<string | null>
  load: (dashboardId: string) => Promise<void>
  reset: () => void
}

export const useDashboardBuilderStore = create<DashboardBuilderState>((set, get) => ({
  dashboardId: null,
  title: '',
  description: '',
  charts: [],
  loading: false,
  saving: false,
  error: null,
  pickerOpen: false,

  setTitle: (title) => set({ title }),
  setDescription: (description) => set({ description }),

  addChart: (chartId, width = 'half') => {
    const { charts } = get()
    // Don't add duplicates
    if (charts.some((c) => c.chart_id === chartId)) return
    set({ charts: [...charts, { chart_id: chartId, width }] })
  },

  removeChart: (chartId) => {
    set((state) => ({ charts: state.charts.filter((c) => c.chart_id !== chartId) }))
  },

  moveChart: (chartId, direction) => {
    const { charts } = get()
    const idx = charts.findIndex((c) => c.chart_id === chartId)
    if (idx < 0) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === charts.length - 1) return

    const newCharts = [...charts]
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[newCharts[idx], newCharts[swapIdx]] = [newCharts[swapIdx], newCharts[idx]]
    set({ charts: newCharts })
  },

  setChartWidth: (chartId, width) => {
    set((state) => ({
      charts: state.charts.map((c) =>
        c.chart_id === chartId ? { ...c, width } : c
      ),
    }))
  },

  setPickerOpen: (open) => set({ pickerOpen: open }),

  updateLayouts: (layouts) => {
    set((state) => ({
      charts: state.charts.map((c) => {
        const l = layouts.find((lay) => lay.i === c.chart_id)
        if (!l) return c
        return { ...c, layout: { x: l.x, y: l.y, w: l.w, h: l.h } }
      }),
    }))
  },

  save: async () => {
    const { dashboardId, title, description, charts, saving } = get()
    if (saving) return null  // Prevent concurrent saves (e.g. double-click)
    if (!title.trim()) {
      set({ error: 'Dashboard title is required' })
      return null
    }

    set({ saving: true, error: null })

    try {
      const url = dashboardId
        ? `/api/v2/dashboards/${dashboardId}`
        : '/api/v2/dashboards/'
      const method = dashboardId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: description || null, charts }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Save failed: ${res.status}`)
      }

      const result = await res.json()
      set({ saving: false, dashboardId: result.id })
      return result.id as string
    } catch (e) {
      set({ saving: false, error: e instanceof Error ? e.message : String(e) })
      return null
    }
  },

  load: async (dashboardId) => {
    set({ loading: true, error: null })

    try {
      // Fetch single dashboard metadata by ID
      const res = await fetch(`/api/v2/dashboards/${dashboardId}`)
      if (!res.ok) {
        if (res.status === 404) throw new Error('Dashboard not found')
        throw new Error(`Load failed: ${res.statusText}`)
      }

      const dashboard = await res.json()

      set({
        loading: false,
        dashboardId: dashboard.id,
        title: dashboard.title,
        description: dashboard.description ?? '',
        charts: (dashboard.charts ?? []).map((c: { chart_id: string; width?: string; layout?: GridLayout }) => ({
          chart_id: c.chart_id,
          width: (c.width === 'full' ? 'full' : 'half') as 'full' | 'half',
          ...(c.layout ? { layout: c.layout } : {}),
        })),
      })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  reset: () => {
    set({
      dashboardId: null,
      title: '',
      description: '',
      charts: [],
      loading: false,
      saving: false,
      error: null,
      pickerOpen: false,
    })
  },
}))
