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

export interface DuplicateConflict {
  filename: string
  file: File
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
  /** Pending duplicate conflict awaiting user confirmation */
  duplicateConflict: DuplicateConflict | null

  /** Actions */
  uploadCSV: (file: File, replace?: boolean) => Promise<void>
  confirmReplace: () => Promise<void>
  cancelReplace: () => void
  pasteData: (text: string) => Promise<void>
  loadPreview: (sourceId: string) => Promise<void>
  reset: () => void
}

const API_BASE = '/api/data'

/** Monotonically increasing counter to guard against stale preview responses. */
let previewRequestId = 0

export const useDataStore = create<DataState>((set, get) => ({
  source: null,
  preview: null,
  uploading: false,
  loadingPreview: false,
  error: null,
  duplicateConflict: null,

  uploadCSV: async (file: File, replace = false) => {
    set({ uploading: true, error: null, source: null, preview: null, duplicateConflict: null })

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (replace) formData.append('replace', 'true')

      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (res.status === 409) {
        const body = await res.json()
        const detail = body.detail
        if (detail?.code === 'DUPLICATE_FILENAME') {
          // Store the conflict — UI will show a confirmation modal
          set({ uploading: false, duplicateConflict: { filename: detail.filename, file } })
          return
        }
      }

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

  confirmReplace: async () => {
    const { duplicateConflict: conflict, uploading } = get()
    if (!conflict || uploading) return
    // Keep conflict state until upload succeeds (uploadCSV clears it via set())
    const file = conflict.file
    await get().uploadCSV(file, true)
  },

  cancelReplace: () => {
    set({ duplicateConflict: null })
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
    const requestId = ++previewRequestId
    set({ loadingPreview: true })

    try {
      const res = await fetch(`${API_BASE}/preview/${sourceId}?limit=10`)
      if (!res.ok) throw new Error(`Preview failed: ${res.status}`)

      const preview: PreviewData = await res.json()
      // Only apply data if this is still the latest request (stale-guard)
      if (requestId === previewRequestId) {
        set({ preview, loadingPreview: false })
      } else {
        // Still clear the spinner even for stale responses
        set({ loadingPreview: false })
      }
    } catch (e) {
      if (requestId === previewRequestId) {
        set({ loadingPreview: false, error: e instanceof Error ? e.message : String(e) })
      } else {
        set({ loadingPreview: false })
      }
    }
  },

  reset: () => {
    set({ source: null, preview: null, uploading: false, loadingPreview: false, error: null, duplicateConflict: null })
  },
}))
