import { create } from 'zustand'

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  sample_values: string[]
  null_count: number
  distinct_count: number
  min_value: string | null
  max_value: string | null
}

export interface UploadedSource {
  source_id: string
  filename: string
  row_count: number
  columns: ColumnInfo[]
}

export interface PreviewData {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
}

interface DataState {
  /** Current uploaded source metadata */
  source: UploadedSource | null
  /** Preview rows */
  preview: PreviewData | null
  /** Loading states */
  uploading: boolean
  loadingPreview: boolean
  /** Error message */
  error: string | null

  /** Actions */
  uploadCSV: (file: File) => Promise<void>
  pasteData: (text: string) => Promise<void>
  loadPreview: (sourceId: string) => Promise<void>
  reset: () => void
}

const API_BASE = '/api/data'

export const useDataStore = create<DataState>((set, get) => ({
  source: null,
  preview: null,
  uploading: false,
  loadingPreview: false,
  error: null,

  uploadCSV: async (file: File) => {
    set({ uploading: true, error: null, source: null, preview: null })

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Upload failed: ${res.status}`)
      }

      const source: UploadedSource = await res.json()
      set({ source, uploading: false })

      // Auto-load preview
      get().loadPreview(source.source_id)
    } catch (e) {
      set({ uploading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  pasteData: async (text: string) => {
    set({ uploading: true, error: null, source: null, preview: null })

    try {
      const res = await fetch(`${API_BASE}/paste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: text }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? `Paste failed: ${res.status}`)
      }

      const source: UploadedSource = await res.json()
      set({ source, uploading: false })

      // Auto-load preview
      get().loadPreview(source.source_id)
    } catch (e) {
      set({ uploading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  loadPreview: async (sourceId: string) => {
    set({ loadingPreview: true })

    try {
      const res = await fetch(`${API_BASE}/preview/${sourceId}?limit=10`)
      if (!res.ok) throw new Error(`Preview failed: ${res.status}`)

      const preview: PreviewData = await res.json()
      set({ preview, loadingPreview: false })
    } catch (e) {
      set({ loadingPreview: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  reset: () => {
    set({ source: null, preview: null, uploading: false, loadingPreview: false, error: null })
  },
}))
