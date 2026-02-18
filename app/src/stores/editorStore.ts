import { create } from 'zustand'
import type { ChartType, Annotations } from '../types/chart'
import type { PaletteKey } from '../themes/plotTheme'
import { buildDataSummary } from '../utils/dataSummary'

// ── Editor Config ──────────────────────────────────────────────────────────

export type AggregationType = 'none' | 'sum' | 'avg' | 'median' | 'count' | 'min' | 'max'
export type TimeGrain = 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year'
export type DataMode = 'table' | 'sql'

export interface EditorConfig {
  chartType: ChartType
  title: string
  subtitle: string
  source: string
  sourceUrl: string
  x: string | null
  y: string | string[] | null
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
  aggregation: AggregationType
  timeGrain: TimeGrain
  dataMode: DataMode
  annotations: Annotations
  // BigValue / KPI fields
  value: string | null
  comparisonValue: string | null
  comparisonLabel: string
  valueFormat: 'currency' | 'percent' | 'number' | ''
  positiveIsGood: boolean
}

const DEFAULT_CONFIG: EditorConfig = {
  chartType: 'BarChart',
  title: '',
  subtitle: '',
  source: '',
  sourceUrl: '',
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
  aggregation: 'none',
  timeGrain: 'none',
  dataMode: 'table',
  annotations: { lines: [], texts: [], ranges: [] },
  value: null,
  comparisonValue: null,
  comparisonLabel: '',
  valueFormat: '',
  positiveIsGood: true,
}

export interface TableInfoItem {
  source_id: string
  table_name: string
  display_name: string
  row_count: number
  column_count: number
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

  // Column type metadata (column name → DuckDB type)
  columnTypes: Record<string, string>

  // SQL mode state
  customSql: string
  sqlError: string | null
  sqlExecuting: boolean
  availableTables: TableInfoItem[]

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

  // Annotation placement (click-to-place)
  placingAnnotationId: string | null
  setPlacingAnnotation: (id: string | null) => void

  // Computed
  isDirty: () => boolean

  // Actions
  loadChart: (chartId: string) => Promise<void>
  initNew: (sourceId: string) => Promise<void>
  buildQuery: () => Promise<void>
  saveNew: () => Promise<string | null>
  updateConfig: (partial: Partial<EditorConfig>) => void
  setDataMode: (mode: DataMode) => void
  setCustomSql: (sql: string) => void
  executeCustomSql: () => Promise<void>
  fetchAvailableTables: () => Promise<void>
  undo: () => void
  redo: () => void
  save: () => Promise<void>
  discard: () => void
  sendChatMessage: (message: string) => Promise<void>
  reset: () => void
}

const MAX_HISTORY = 50

/** Keys that trigger auto build-query in new chart mode */
const DATA_KEYS: (keyof EditorConfig)[] = ['x', 'y', 'series', 'aggregation', 'timeGrain']

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
  chartId: null,
  sourceId: null,
  data: [],
  columns: [],
  sql: null,
  columnTypes: {},
  customSql: '',
  sqlError: null,
  sqlExecuting: false,
  availableTables: [],
  config: { ...DEFAULT_CONFIG },
  savedConfig: null,
  configHistory: [],
  configFuture: [],
  chatMessages: [],
  chatLoading: false,
  loading: false,
  saving: false,
  error: null,
  placingAnnotationId: null,
  setPlacingAnnotation: (id) => set({ placingAnnotationId: id }),

  isDirty: () => {
    const { config, savedConfig, data, chartId } = get()
    // New unsaved chart: dirty if we have data
    if (!chartId && !savedConfig) return data.length > 0
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
        sourceUrl: chart.config?.sourceUrl ?? '',
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
        aggregation: chart.config?.aggregation ?? 'none',
        timeGrain: chart.config?.timeGrain ?? 'none',
        dataMode: (chart.config?.dataMode as DataMode) ?? 'table',
        annotations: chart.config?.annotations ?? { lines: [], texts: [], ranges: [] },
        value: chart.config?.value ?? null,
        comparisonValue: chart.config?.comparisonValue ?? null,
        comparisonLabel: chart.config?.comparisonLabel ?? '',
        valueFormat: chart.config?.valueFormat ?? '',
        positiveIsGood: chart.config?.positiveIsGood ?? true,
      }

      const loadedDataMode = config.dataMode

      // Fetch column types from schema
      let columnTypes: Record<string, string> = {}
      try {
        const schemaRes = await fetch(`/api/data/schema/${chart.source_id}`)
        if (schemaRes.ok) {
          const schemaData = await schemaRes.json()
          for (const col of schemaData.columns ?? []) {
            columnTypes[col.name] = col.type
          }
        }
      } catch {
        // Non-critical — column types are just UI hints
      }

      set({
        loading: false,
        sourceId: chart.source_id,
        data: result.data ?? [],
        columns: result.columns ?? [],
        columnTypes,
        sql: chart.sql ?? null,
        customSql: loadedDataMode === 'sql' ? (chart.sql ?? '') : '',
        sqlError: null,
        sqlExecuting: false,
        config,
        savedConfig: { ...config },
        configHistory: [],
        configFuture: [],
        chatMessages: [],
      })

      // If loading a SQL-mode chart, fetch available tables
      if (loadedDataMode === 'sql') {
        get().fetchAvailableTables()
      }
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  },

  initNew: async (sourceId: string) => {
    set({ loading: true, error: null, chartId: null, sourceId, savedConfig: null })

    try {
      const res = await fetch(`/api/data/schema/${sourceId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Schema fetch failed: ${res.status}`)
      }

      const schema = await res.json()
      const columns = (schema.columns ?? []).map((c: { name: string }) => c.name)
      const columnTypes: Record<string, string> = {}
      for (const col of schema.columns ?? []) {
        columnTypes[col.name] = col.type
      }

      set({
        loading: false,
        columns,
        columnTypes,
        data: [],
        sql: null,
        customSql: '',
        sqlError: null,
        sqlExecuting: false,
        availableTables: [],
        config: { ...DEFAULT_CONFIG },
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

  buildQuery: async () => {
    const { sourceId, config } = get()
    if (config.dataMode === 'sql') return  // Never auto-build in SQL mode
    if (!sourceId || !config.x) return

    try {
      const res = await fetch('/api/v2/charts/build-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: sourceId,
          x: config.x,
          y: config.y,
          // Multi-Y uses UNPIVOT for implicit series; don't send explicit series
          series: Array.isArray(config.y) && config.y.length > 1 ? null : config.series,
          aggregation: config.aggregation,
          time_grain: config.timeGrain,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Query build failed: ${res.status}`)
      }

      const result = await res.json()
      if (result.success) {
        set({
          data: result.data ?? [],
          sql: result.sql ?? null,
          error: null,
        })
      } else {
        set({ error: result.error ?? 'Query build failed' })
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  saveNew: async () => {
    const { sourceId, config, sql } = get()
    if (!sourceId || !sql) return null

    set({ saving: true, error: null })

    try {
      const res = await fetch('/api/v2/charts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: sourceId,
          chart_type: config.chartType,
          title: config.title || 'Untitled Chart',
          sql,
          x: config.x,
          y: config.y,
          series: config.series,
          horizontal: config.horizontal,
          sort: config.sort,
          subtitle: config.subtitle || null,
          source: config.source || null,
          config: {
            stacked: config.stacked,
            showGrid: config.showGrid,
            showLegend: config.showLegend,
            showValues: config.showValues,
            palette: config.palette,
            xAxisTitle: config.xAxisTitle,
            yAxisTitle: config.yAxisTitle,
            aggregation: config.aggregation,
            timeGrain: config.timeGrain,
            sourceUrl: config.sourceUrl || undefined,
            dataMode: config.dataMode,
            annotations: config.annotations,
            value: config.value,
            comparisonValue: config.comparisonValue,
            comparisonLabel: config.comparisonLabel,
            valueFormat: config.valueFormat || undefined,
            positiveIsGood: config.positiveIsGood,
          },
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Save failed: ${res.status}`)
      }

      const saved = await res.json()
      set({
        saving: false,
        chartId: saved.id,
        savedConfig: { ...config },
        configHistory: [],
        configFuture: [],
      })
      return saved.id as string
    } catch (e) {
      set({ saving: false, error: e instanceof Error ? e.message : String(e) })
      return null
    }
  },

  updateConfig: (partial: Partial<EditorConfig>) => {
    const { config, configHistory, chartId } = get()

    // Push current config to history (for undo)
    const newHistory = [...configHistory, { ...config }].slice(-MAX_HISTORY)

    // Reset timeGrain when aggregation is turned off
    if (partial.aggregation === 'none' && config.timeGrain !== 'none') {
      partial = { ...partial, timeGrain: 'none' }
    }

    set({
      config: { ...config, ...partial },
      configHistory: newHistory,
      configFuture: [], // Clear redo stack on new change
    })

    // Auto-trigger buildQuery in new chart mode when data-relevant keys change
    // Skip in SQL mode — user controls query execution manually
    const currentConfig = get().config
    if (!chartId && currentConfig.dataMode !== 'sql') {
      const changedKeys = Object.keys(partial) as (keyof EditorConfig)[]
      if (changedKeys.some((k) => DATA_KEYS.includes(k))) {
        // Use setTimeout to let the state update settle before reading it
        setTimeout(() => get().buildQuery(), 0)
      }
    }
  },

  setDataMode: (mode: DataMode) => {
    const { config, sql, sourceId } = get()
    if (mode === config.dataMode) return

    if (mode === 'sql') {
      // Switching to SQL: populate customSql with current generated SQL, fetch tables
      set({
        customSql: sql ?? '',
        sqlError: null,
        config: { ...config, dataMode: 'sql' },
      })
      get().fetchAvailableTables()
    } else {
      // Switching back to Table: restore source columns, clear SQL-specific state.
      // Preserve entire user config including x/y/series — validate after schema loads.
      set({
        customSql: '',
        sqlError: null,
        sqlExecuting: false,
        data: [],
        sql: null,
        config: { ...config, dataMode: 'table' },
      })
      // Restore original source columns, then validate x/y/series and rebuild query
      if (sourceId) {
        fetch(`/api/data/schema/${sourceId}`)
          .then((res) => res.ok ? res.json() : Promise.reject(res.statusText))
          .then((schema) => {
            const columns = (schema.columns ?? []).map((c: { name: string }) => c.name)
            const columnTypes: Record<string, string> = {}
            for (const col of schema.columns ?? []) {
              columnTypes[col.name] = col.type
            }
            const colSet = new Set(columns)
            const cur = get().config
            // Clear any column mappings that don't exist in the source
            const patch: Partial<EditorConfig> = {}
            if (cur.x && !colSet.has(cur.x)) patch.x = null
            if (Array.isArray(cur.y)) {
              const valid = cur.y.filter((c) => colSet.has(c))
              patch.y = valid.length > 0 ? valid : null
            } else if (cur.y && !colSet.has(cur.y)) {
              patch.y = null
            }
            if (cur.series && !colSet.has(cur.series)) patch.series = null

            set({
              columns,
              columnTypes,
              ...(Object.keys(patch).length > 0 ? { config: { ...cur, ...patch } } : {}),
            })
            // Rebuild query with restored/validated columns
            get().buildQuery()
          })
          .catch(() => {})
      }
    }
  },

  setCustomSql: (sql: string) => {
    set({ customSql: sql, sqlError: null })
  },

  executeCustomSql: async () => {
    const { customSql } = get()
    if (!customSql.trim()) return

    set({ sqlExecuting: true, sqlError: null })

    try {
      const res = await fetch('/api/data/query-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: customSql }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Query failed: ${res.status}`)
      }

      const result = await res.json()
      if (result.success) {
        // Build columnTypes from result column_types
        const columnTypes: Record<string, string> = {}
        result.columns.forEach((col: string, i: number) => {
          columnTypes[col] = result.column_types?.[i] ?? 'VARCHAR'
        })

        set({
          sqlExecuting: false,
          data: result.rows ?? [],
          columns: result.columns ?? [],
          columnTypes,
          sql: customSql,
          sqlError: null,
          error: null,
        })
      } else {
        set({ sqlExecuting: false, sqlError: result.error ?? 'Query failed' })
      }
    } catch (e) {
      set({
        sqlExecuting: false,
        sqlError: e instanceof Error ? e.message : String(e),
      })
    }
  },

  fetchAvailableTables: async () => {
    try {
      const res = await fetch('/api/data/tables')
      if (res.ok) {
        const tables = await res.json()
        set({ availableTables: tables })
      }
    } catch {
      // Non-critical — table list is a convenience feature
    }
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
    const { chartId, config, sql } = get()
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
          sql,
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
            aggregation: config.aggregation,
            timeGrain: config.timeGrain,
            sourceUrl: config.sourceUrl || undefined,
            dataMode: config.dataMode,
            annotations: config.annotations,
            value: config.value,
            comparisonValue: config.comparisonValue,
            comparisonLabel: config.comparisonLabel,
            valueFormat: config.valueFormat || undefined,
            positiveIsGood: config.positiveIsGood,
          },
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Save failed: ${res.status}`)
      }

      // Snapshot saved state and clear undo/redo history
      set({ saving: false, savedConfig: { ...config }, configHistory: [], configFuture: [] })
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
    const { chartId, config, columns, data, columnTypes, chatMessages } = get()
    if (!chartId) {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Please save your chart first before using the AI Assistant.',
        timestamp: Date.now(),
      }
      set({ chatMessages: [...chatMessages, errorMsg] })
      return
    }

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
      const dataSummary = data.length > 0 ? buildDataSummary(data, columns, columnTypes) : null

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
            annotations: config.annotations,
          },
          columns,
          data_summary: dataSummary,
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
      if (rc.annotations !== undefined) newConfig.annotations = rc.annotations

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
      columnTypes: {},
      customSql: '',
      sqlError: null,
      sqlExecuting: false,
      availableTables: [],
      config: { ...DEFAULT_CONFIG },
      savedConfig: null,
      configHistory: [],
      configFuture: [],
      chatMessages: [],
      chatLoading: false,
      loading: false,
      saving: false,
      error: null,
      placingAnnotationId: null,
    })
  },
}))
