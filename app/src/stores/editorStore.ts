import { create } from 'zustand'
import type { ChartType } from '../types/chart'
import type { PaletteKey } from '../themes/datawrapper'

// ── Editor Config ──────────────────────────────────────────────────────────

export interface EditorConfig {
  chartType: ChartType
  title: string
  subtitle: string
  source: string
  x: string | null
  y: string | null
  series: string | null
  horizontal: boolean
  sort: boolean
  stacked: boolean
  showGrid: boolean
  showLegend: boolean
  showValues: boolean
  palette: PaletteKey
  xAxisTitle: string
  yAxisTitle: string
}

const DEFAULT_CONFIG: EditorConfig = {
  chartType: 'BarChart',
  title: '',
  subtitle: '',
  source: '',
  x: null,
  y: null,
  series: null,
  horizontal: false,
  sort: true,
  stacked: false,
  showGrid: true,
  showLegend: true,
  showValues: false,
  palette: 'default',
  xAxisTitle: '',
  yAxisTitle: '',
}

// ── Chat Messages ──────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// ── Store ──────────────────────────────────────────────────────────────────

interface EditorState {
  // Chart data
  chartId: string | null
  sourceId: string | null
  data: Record<string, unknown>[]
  columns: string[]
  sql: string | null

  // Editable config
  config: EditorConfig
  savedConfig: EditorConfig | null

  // History (undo/redo)
  configHistory: EditorConfig[]
  configFuture: EditorConfig[]

  // Chat
  chatMessages: ChatMessage[]
  chatLoading: boolean

  // UI state
  loading: boolean
  saving: boolean
  error: string | null

  // Computed
  isDirty: () => boolean

  // Actions
  loadChart: (chartId: string) => Promise<void>
  updateConfig: (partial: Partial<EditorConfig>) => void
  undo: () => void
  redo: () => void
  save: () => Promise<void>
  discard: () => void
  sendChatMessage: (message: string) => Promise<void>
  reset: () => void
}

const MAX_HISTORY = 50

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
  chartId: null,
  sourceId: null,
  data: [],
  columns: [],
  sql: null,
  config: { ...DEFAULT_CONFIG },
  savedConfig: null,
  configHistory: [],
  configFuture: [],
  chatMessages: [],
  chatLoading: false,
  loading: false,
  saving: false,
  error: null,

  isDirty: () => {
    const { config, savedConfig } = get()
    if (!savedConfig) return false
    return JSON.stringify(config) !== JSON.stringify(savedConfig)
  },

  loadChart: async (chartId: string) => {
    set({ loading: true, error: null, chartId })

    try {
      const res = await fetch(`/api/v2/charts/${chartId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Load failed: ${res.status}`)
      }

      const result = await res.json()
      const chart = result.chart

      // Map saved chart fields → EditorConfig
      const config: EditorConfig = {
        chartType: (chart.chart_type ?? 'BarChart') as ChartType,
        title: chart.title ?? '',
        subtitle: chart.subtitle ?? '',
        source: chart.source ?? '',
        x: chart.x ?? null,
        y: chart.y ?? null,
        series: chart.series ?? null,
        horizontal: chart.horizontal ?? false,
        sort: chart.sort ?? true,
        stacked: chart.config?.stacked ?? false,
        showGrid: chart.config?.showGrid ?? true,
        showLegend: chart.config?.showLegend ?? true,
        showValues: chart.config?.showValues ?? false,
        palette: chart.config?.palette ?? 'default',
        xAxisTitle: chart.config?.xAxisTitle ?? '',
        yAxisTitle: chart.config?.yAxisTitle ?? '',
      }

      set({
        loading: false,
        sourceId: chart.source_id,
        data: result.data ?? [],
        columns: result.columns ?? [],
        sql: chart.sql ?? null,
        config,
        savedConfig: { ...config },
        configHistory: [],
        configFuture: [],
        chatMessages: [],
      })
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  },

  updateConfig: (partial: Partial<EditorConfig>) => {
    const { config, configHistory } = get()

    // Push current config to history (for undo)
    const newHistory = [...configHistory, { ...config }].slice(-MAX_HISTORY)

    set({
      config: { ...config, ...partial },
      configHistory: newHistory,
      configFuture: [], // Clear redo stack on new change
    })
  },

  undo: () => {
    const { config, configHistory, configFuture } = get()
    if (configHistory.length === 0) return

    const previous = configHistory[configHistory.length - 1]
    set({
      config: previous,
      configHistory: configHistory.slice(0, -1),
      configFuture: [{ ...config }, ...configFuture],
    })
  },

  redo: () => {
    const { config, configHistory, configFuture } = get()
    if (configFuture.length === 0) return

    const next = configFuture[0]
    set({
      config: next,
      configHistory: [...configHistory, { ...config }],
      configFuture: configFuture.slice(1),
    })
  },

  save: async () => {
    const { chartId, config } = get()
    if (!chartId) return

    set({ saving: true, error: null })

    try {
      const res = await fetch(`/api/v2/charts/${chartId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_type: config.chartType,
          title: config.title,
          subtitle: config.subtitle || null,
          source: config.source || null,
          x: config.x,
          y: config.y,
          series: config.series,
          horizontal: config.horizontal,
          sort: config.sort,
          config: {
            stacked: config.stacked,
            showGrid: config.showGrid,
            showLegend: config.showLegend,
            showValues: config.showValues,
            palette: config.palette,
            xAxisTitle: config.xAxisTitle,
            yAxisTitle: config.yAxisTitle,
          },
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Save failed: ${res.status}`)
      }

      // Snapshot saved state
      set({ saving: false, savedConfig: { ...config } })
    } catch (e) {
      set({ saving: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  discard: () => {
    const { savedConfig } = get()
    if (!savedConfig) return

    set({
      config: { ...savedConfig },
      configHistory: [],
      configFuture: [],
    })
  },

  sendChatMessage: async (message: string) => {
    const { chartId, config, columns, chatMessages } = get()
    if (!chartId) return

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: Date.now(),
    }

    set({
      chatMessages: [...chatMessages, userMsg],
      chatLoading: true,
      error: null,
    })

    try {
      const res = await fetch('/api/v2/charts/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: chartId,
          message,
          current_config: {
            chart_type: config.chartType,
            title: config.title,
            subtitle: config.subtitle,
            source: config.source,
            x: config.x,
            y: config.y,
            series: config.series,
            horizontal: config.horizontal,
            sort: config.sort,
            stacked: config.stacked,
            show_grid: config.showGrid,
            show_legend: config.showLegend,
            show_values: config.showValues,
            palette: config.palette,
            x_axis_title: config.xAxisTitle,
            y_axis_title: config.yAxisTitle,
          },
          columns,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Edit failed: ${res.status}`)
      }

      const result = await res.json()

      // Map LLM response config back to EditorConfig
      const newConfig: Partial<EditorConfig> = {}
      const rc = result.config
      if (rc.chart_type) newConfig.chartType = rc.chart_type as ChartType
      if (rc.title !== undefined) newConfig.title = rc.title ?? ''
      if (rc.subtitle !== undefined) newConfig.subtitle = rc.subtitle ?? ''
      if (rc.source !== undefined) newConfig.source = rc.source ?? ''
      if (rc.x !== undefined) newConfig.x = rc.x
      if (rc.y !== undefined) newConfig.y = rc.y
      if (rc.series !== undefined) newConfig.series = rc.series
      if (rc.horizontal !== undefined) newConfig.horizontal = rc.horizontal
      if (rc.sort !== undefined) newConfig.sort = rc.sort
      if (rc.stacked !== undefined) newConfig.stacked = rc.stacked
      if (rc.show_grid !== undefined) newConfig.showGrid = rc.show_grid
      if (rc.show_legend !== undefined) newConfig.showLegend = rc.show_legend
      if (rc.show_values !== undefined) newConfig.showValues = rc.show_values
      if (rc.palette !== undefined) newConfig.palette = rc.palette
      if (rc.x_axis_title !== undefined) newConfig.xAxisTitle = rc.x_axis_title
      if (rc.y_axis_title !== undefined) newConfig.yAxisTitle = rc.y_axis_title

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: result.explanation ?? 'Done.',
        timestamp: Date.now(),
      }

      // Apply config update through updateConfig (so undo works)
      get().updateConfig(newConfig)

      set((state) => ({
        chatMessages: [...state.chatMessages, assistantMsg],
        chatLoading: false,
      }))
    } catch (e) {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${e instanceof Error ? e.message : String(e)}`,
        timestamp: Date.now(),
      }

      set((state) => ({
        chatMessages: [...state.chatMessages, errorMsg],
        chatLoading: false,
      }))
    }
  },

  reset: () => {
    set({
      chartId: null,
      sourceId: null,
      data: [],
      columns: [],
      sql: null,
      config: { ...DEFAULT_CONFIG },
      savedConfig: null,
      configHistory: [],
      configFuture: [],
      chatMessages: [],
      chatLoading: false,
      loading: false,
      saving: false,
      error: null,
    })
  },
}))
