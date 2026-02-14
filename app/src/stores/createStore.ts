import { create } from 'zustand'

export type CreateStep = 'upload' | 'preview' | 'proposing' | 'result'

export interface ChartProposal {
  config: {
    chart_type: string
    title: string | null
    subtitle: string | null
    source: string | null
    x: string | null
    y: string | null
    series: string | null
    horizontal: boolean
    sort: boolean
  }
  reasoning: string | null
  sql: string | null
  data: Record<string, unknown>[]
  columns: string[]
}

interface CreateState {
  step: CreateStep
  sourceId: string | null
  proposal: ChartProposal | null
  proposing: boolean
  saving: boolean
  error: string | null
  savedChartId: string | null

  /** Actions */
  setSourceId: (sourceId: string) => void
  proposeChart: (sourceId: string, userHint?: string) => Promise<void>
  saveChart: () => Promise<void>
  tryDifferent: (hint: string) => Promise<void>
  reset: () => void
}

const API_BASE = '/api/v2/charts'

export const useCreateStore = create<CreateState>((set, get) => ({
  step: 'upload',
  sourceId: null,
  proposal: null,
  proposing: false,
  saving: false,
  error: null,
  savedChartId: null,

  setSourceId: (sourceId: string) => {
    set({ sourceId, step: 'preview' })
  },

  proposeChart: async (sourceId: string, userHint?: string) => {
    set({ proposing: true, error: null, step: 'proposing', proposal: null })

    try {
      const res = await fetch(`${API_BASE}/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId, user_hint: userHint }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Propose failed: ${res.status}`)
      }

      const result = await res.json()

      if (!result.success) {
        throw new Error(result.error ?? 'Chart proposal failed')
      }

      set({
        proposing: false,
        step: 'result',
        proposal: {
          config: result.config,
          reasoning: result.reasoning,
          sql: result.sql,
          data: result.data ?? [],
          columns: result.columns ?? [],
        },
      })
    } catch (e) {
      set({
        proposing: false,
        step: 'preview',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  },

  saveChart: async () => {
    const { proposal, sourceId } = get()
    if (!proposal || !sourceId) return

    set({ saving: true, error: null })

    try {
      const res = await fetch(`${API_BASE}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: sourceId,
          chart_type: proposal.config.chart_type,
          title: proposal.config.title ?? 'Untitled Chart',
          sql: proposal.sql,
          x: proposal.config.x,
          y: proposal.config.y,
          series: proposal.config.series,
          horizontal: proposal.config.horizontal,
          sort: proposal.config.sort,
          subtitle: proposal.config.subtitle,
          source: proposal.config.source,
          reasoning: proposal.reasoning,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Save failed: ${res.status}`)
      }

      const saved = await res.json()
      set({ saving: false, savedChartId: saved.id })
    } catch (e) {
      set({ saving: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  tryDifferent: async (hint: string) => {
    const { sourceId } = get()
    if (!sourceId) return
    get().proposeChart(sourceId, hint)
  },

  reset: () => {
    set({
      step: 'upload',
      sourceId: null,
      proposal: null,
      proposing: false,
      saving: false,
      error: null,
      savedChartId: null,
    })
  },
}))
