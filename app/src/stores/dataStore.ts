import { create } from 'zustand'
import { authFetch } from '../utils/authFetch'

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

  /** Whether a transform is in progress */
  transforming: boolean

  /** Actions */
  uploadCSV: (file: File, replace?: boolean) => Promise<void>
  confirmReplace: () => Promise<void>
  cancelReplace: () => void
  pasteData: (text: string, name?: string) => Promise<void>
  loadPreview: (sourceId: string) => Promise<void>
  reset: () => void

  /** Data transform actions — each calls backend, updates preview */
  transformTranspose: (sourceId: string) => Promise<PreviewData>
  transformRenameColumn: (sourceId: string, oldName: string, newName: string) => Promise<PreviewData>
  transformDeleteColumn: (sourceId: string, column: string) => Promise<PreviewData>
  transformReorderColumns: (sourceId: string, columns: string[]) => Promise<PreviewData>
  transformRound: (sourceId: string, column: string, decimals?: number) => Promise<PreviewData>
  transformPrependAppend: (sourceId: string, column: string, prepend?: string, append?: string) => Promise<PreviewData>
  transformEditCell: (sourceId: string, row: number, column: string, value: string | number | null) => Promise<PreviewData>
  transformCastType: (sourceId: string, column: string, type: string) => Promise<PreviewData>
}

const API_BASE = '/api/data'

/** Monotonically increasing counter to guard against stale preview responses. */
let previewRequestId = 0

/** Helper: POST a transform endpoint, return updated preview. */
async function _postTransform(
  sourceId: string,
  action: string,
  body?: Record<string, unknown>,
): Promise<PreviewData> {
  const res = await authFetch(`${API_BASE}/${sourceId}/transform/${action}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `Transform failed: ${res.status}`)
  }
  return await res.json()
}

export const useDataStore = create<DataState>((set, get) => ({
  source: null,
  preview: null,
  uploading: false,
  loadingPreview: false,
  transforming: false,
  error: null,
  duplicateConflict: null,

  uploadCSV: async (file: File, replace = false) => {
    set({ uploading: true, error: null, source: null, preview: null, duplicateConflict: null })

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (replace) formData.append('replace', 'true')

      const res = await authFetch(`${API_BASE}/upload`, {
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

  pasteData: async (text: string, name?: string) => {
    set({ uploading: true, error: null, source: null, preview: null })

    try {
      const payload: Record<string, string> = { data: text }
      if (name) payload.name = name

      const res = await authFetch(`${API_BASE}/paste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      const res = await authFetch(`${API_BASE}/preview/${sourceId}?limit=10`)
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
    set({ source: null, preview: null, uploading: false, loadingPreview: false, transforming: false, error: null, duplicateConflict: null })
  },

  // -- Data Transform methods -------------------------------------------------

  transformTranspose: async (sourceId: string) => {
    set({ transforming: true, error: null })
    try {
      const data = await _postTransform(sourceId, 'transpose')
      set({ preview: data, transforming: false })
      return data
    } catch (e) {
      set({ transforming: false, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  transformRenameColumn: async (sourceId: string, oldName: string, newName: string) => {
    set({ transforming: true, error: null })
    try {
      const data = await _postTransform(sourceId, 'rename-column', { old: oldName, new: newName })
      set({ preview: data, transforming: false })
      return data
    } catch (e) {
      set({ transforming: false, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  transformDeleteColumn: async (sourceId: string, column: string) => {
    set({ transforming: true, error: null })
    try {
      const data = await _postTransform(sourceId, 'delete-column', { column })
      set({ preview: data, transforming: false })
      return data
    } catch (e) {
      set({ transforming: false, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  transformReorderColumns: async (sourceId: string, columns: string[]) => {
    set({ transforming: true, error: null })
    try {
      const data = await _postTransform(sourceId, 'reorder-columns', { columns })
      set({ preview: data, transforming: false })
      return data
    } catch (e) {
      set({ transforming: false, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  transformRound: async (sourceId: string, column: string, decimals = 2) => {
    set({ transforming: true, error: null })
    try {
      const data = await _postTransform(sourceId, 'round', { column, decimals })
      set({ preview: data, transforming: false })
      return data
    } catch (e) {
      set({ transforming: false, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  transformPrependAppend: async (sourceId: string, column: string, prepend = '', append = '') => {
    set({ transforming: true, error: null })
    try {
      const data = await _postTransform(sourceId, 'prepend-append', { column, prepend, append })
      set({ preview: data, transforming: false })
      return data
    } catch (e) {
      set({ transforming: false, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  transformEditCell: async (sourceId: string, row: number, column: string, value: string | number | null) => {
    set({ transforming: true, error: null })
    try {
      const data = await _postTransform(sourceId, 'edit-cell', { row, column, value })
      set({ preview: data, transforming: false })
      return data
    } catch (e) {
      set({ transforming: false, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  transformCastType: async (sourceId: string, column: string, type: string) => {
    set({ transforming: true, error: null })
    try {
      const data = await _postTransform(sourceId, 'cast-type', { column, type })
      set({ preview: data, transforming: false })
      return data
    } catch (e) {
      set({ transforming: false, error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },
}))
