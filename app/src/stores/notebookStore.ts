import { create } from 'zustand'
import { authFetch } from '../utils/authFetch'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CellOutput {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error'
  name?: string // stream
  text?: string // stream
  data?: Record<string, string> // execute_result / display_data
  metadata?: Record<string, unknown>
  ename?: string // error
  evalue?: string // error
  traceback?: string[] // error
}

export interface NotebookCell {
  id: string
  cell_type: 'code' | 'markdown' | 'sql'
  source: string
  outputs: CellOutput[]
  execution_count: number | null
  running: boolean
  chartId: string | null
}

export interface NotebookMeta {
  id: string
  title: string
  cell_count: number
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type KernelStatus = 'disconnected' | 'starting' | 'idle' | 'busy'

interface NotebookState {
  // List page
  notebooks: NotebookMeta[]
  loadingList: boolean

  // Current notebook
  notebookId: string | null
  title: string
  cells: NotebookCell[]
  dirty: boolean
  kernelStatus: KernelStatus

  // List actions
  fetchNotebooks: () => Promise<void>
  createNotebook: (title: string) => Promise<string>
  uploadNotebook: (file: File) => Promise<string>
  deleteNotebook: (id: string) => Promise<void>

  // Editor actions
  loadNotebook: (id: string) => Promise<void>
  saveNotebook: () => Promise<void>
  updateTitle: (title: string) => void
  addCell: (index: number, type: 'code' | 'markdown' | 'sql') => void
  deleteCell: (id: string) => void
  moveCell: (id: string, direction: 'up' | 'down') => void
  updateCellSource: (id: string, source: string) => void
  changeCellType: (id: string, newType: 'code' | 'markdown' | 'sql') => void

  // Execution actions
  executeCell: (id: string) => Promise<void>
  executeAll: () => Promise<void>
  interruptKernel: () => Promise<void>
  restartKernel: () => Promise<void>

  // DataFrame bridge
  getDataframes: () => Promise<string[]>
  chartDataframe: (dfName: string) => Promise<{ sourceId: string }>

  // Cleanup
  reset: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = '/api/notebooks'

let cellCounter = 0

function makeCellId(): string {
  return `cell-${Date.now()}-${++cellCounter}`
}

/** Parse an .ipynb cell into our NotebookCell format. */
function parseIpynbCell(raw: {
  cell_type: string
  source: string[] | string
  outputs?: CellOutput[]
  execution_count?: number | null
  metadata?: Record<string, unknown>
}): NotebookCell {
  const source = Array.isArray(raw.source) ? raw.source.join('') : raw.source
  let cellType: NotebookCell['cell_type'] = 'code'
  if (raw.cell_type === 'markdown') {
    cellType = 'markdown'
  } else if (raw.metadata?.sa_cell_type === 'sql') {
    cellType = 'sql'
  }
  return {
    id: makeCellId(),
    cell_type: cellType,
    source,
    outputs: raw.outputs ?? [],
    execution_count: raw.execution_count ?? null,
    running: false,
    chartId: null,
  }
}

/** Export cells back to .ipynb format (SQL → code with metadata flag). */
function exportCell(cell: NotebookCell) {
  const base: Record<string, unknown> = {
    id: cell.id,
    cell_type: cell.cell_type === 'sql' ? 'code' : cell.cell_type,
    source: cell.source,
    outputs: cell.outputs,
    execution_count: cell.execution_count,
  }
  if (cell.cell_type === 'sql') {
    base.metadata = { sa_cell_type: 'sql' }
  }
  return base
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useNotebookStore = create<NotebookState>((set, get) => ({
  notebooks: [],
  loadingList: false,
  notebookId: null,
  title: '',
  cells: [],
  dirty: false,
  kernelStatus: 'disconnected',

  // -- List actions ----------------------------------------------------------

  fetchNotebooks: async () => {
    set({ loadingList: true })
    try {
      const res = await authFetch(`${API}/`)
      if (!res.ok) throw new Error(`Failed to fetch notebooks: ${res.status}`)
      const data: NotebookMeta[] = await res.json()
      set({ notebooks: data, loadingList: false })
    } catch {
      set({ loadingList: false })
    }
  },

  createNotebook: async (title: string) => {
    const res = await authFetch(`${API}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(body.detail ?? `Create failed: ${res.status}`)
    }
    const nb = await res.json()
    return nb.id as string
  },

  uploadNotebook: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await authFetch(`${API}/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(body.detail ?? `Upload failed: ${res.status}`)
    }
    const nb = await res.json()
    return nb.id as string
  },

  deleteNotebook: async (id: string) => {
    const res = await authFetch(`${API}/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
    set((s) => ({ notebooks: s.notebooks.filter((n) => n.id !== id) }))
  },

  // -- Editor actions --------------------------------------------------------

  loadNotebook: async (id: string) => {
    set({ notebookId: id, kernelStatus: 'starting' })
    try {
      const res = await authFetch(`${API}/${id}`)
      if (!res.ok) throw new Error(`Load failed: ${res.status}`)
      const nb = await res.json()
      const cells: NotebookCell[] = (nb.cells ?? []).map(parseIpynbCell)
      set({
        notebookId: id,
        title: nb.title ?? 'Untitled',
        cells,
        dirty: false,
        kernelStatus: 'idle',
      })
    } catch {
      set({ kernelStatus: 'disconnected' })
    }
  },

  saveNotebook: async () => {
    const { notebookId, title, cells } = get()
    if (!notebookId) return
    const body = {
      title,
      cells: cells.map(exportCell),
    }
    const res = await authFetch(`${API}/${notebookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Save failed: ${res.status}`)
    set({ dirty: false })
  },

  updateTitle: (title: string) => {
    set({ title, dirty: true })
  },

  addCell: (index: number, type: 'code' | 'markdown' | 'sql') => {
    const cell: NotebookCell = {
      id: makeCellId(),
      cell_type: type,
      source: '',
      outputs: [],
      execution_count: null,
      running: false,
      chartId: null,
    }
    set((s) => {
      const cells = [...s.cells]
      cells.splice(index, 0, cell)
      return { cells, dirty: true }
    })
  },

  deleteCell: (id: string) => {
    set((s) => ({
      cells: s.cells.filter((c) => c.id !== id),
      dirty: true,
    }))
  },

  moveCell: (id: string, direction: 'up' | 'down') => {
    set((s) => {
      const cells = [...s.cells]
      const idx = cells.findIndex((c) => c.id === id)
      if (idx < 0) return s
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= cells.length) return s
      ;[cells[idx], cells[target]] = [cells[target], cells[idx]]
      return { cells, dirty: true }
    })
  },

  updateCellSource: (id: string, source: string) => {
    set((s) => ({
      cells: s.cells.map((c) => (c.id === id ? { ...c, source } : c)),
      dirty: true,
    }))
  },

  changeCellType: (id: string, newType: 'code' | 'markdown' | 'sql') => {
    set((s) => ({
      cells: s.cells.map((c) =>
        c.id === id ? { ...c, cell_type: newType, outputs: [], execution_count: null } : c,
      ),
      dirty: true,
    }))
  },

  // -- Execution actions -----------------------------------------------------

  executeCell: async (id: string) => {
    const { notebookId, cells } = get()
    if (!notebookId) return

    const cell = cells.find((c) => c.id === id)
    if (!cell) return

    // Mark running
    set((s) => ({
      cells: s.cells.map((c) => (c.id === id ? { ...c, running: true, outputs: [] } : c)),
      kernelStatus: 'busy',
    }))

    try {
      const endpoint =
        cell.cell_type === 'sql'
          ? `${API}/${notebookId}/execute-sql`
          : `${API}/${notebookId}/execute`

      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cell_id: id, source: cell.source }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        set((s) => ({
          cells: s.cells.map((c) =>
            c.id === id
              ? {
                  ...c,
                  running: false,
                  outputs: [
                    {
                      output_type: 'error' as const,
                      ename: 'ExecutionError',
                      evalue: body.detail ?? `Execution failed: ${res.status}`,
                      traceback: [],
                    },
                  ],
                }
              : c,
          ),
          kernelStatus: 'idle',
        }))
        return
      }

      const result = await res.json()
      set((s) => ({
        cells: s.cells.map((c) =>
          c.id === id
            ? {
                ...c,
                running: false,
                outputs: result.outputs ?? [],
                execution_count: result.execution_count ?? c.execution_count,
              }
            : c,
        ),
        kernelStatus: 'idle',
      }))
    } catch {
      set((s) => ({
        cells: s.cells.map((c) => (c.id === id ? { ...c, running: false } : c)),
        kernelStatus: 'idle',
      }))
    }
  },

  executeAll: async () => {
    const { notebookId } = get()
    if (!notebookId) return

    // Save first
    await get().saveNotebook()

    set({ kernelStatus: 'busy' })
    try {
      const res = await authFetch(`${API}/${notebookId}/execute-all`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`Execute all failed: ${res.status}`)

      const result = await res.json()
      // result.cells contains updated cell data with outputs
      if (result.cells && Array.isArray(result.cells)) {
        set((s) => ({
          cells: s.cells.map((c) => {
            const updated = result.cells.find(
              (rc: { cell_id: string; outputs: CellOutput[]; execution_count: number | null }) =>
                rc.cell_id === c.id,
            )
            if (updated) {
              return {
                ...c,
                outputs: updated.outputs ?? [],
                execution_count: updated.execution_count ?? c.execution_count,
                running: false,
              }
            }
            return c
          }),
          kernelStatus: 'idle',
          dirty: false,
        }))
      } else {
        set({ kernelStatus: 'idle' })
      }
    } catch {
      set({ kernelStatus: 'idle' })
    }
  },

  interruptKernel: async () => {
    const { notebookId } = get()
    if (!notebookId) return
    await authFetch(`${API}/${notebookId}/interrupt`, { method: 'POST' })
    set((s) => ({
      cells: s.cells.map((c) => (c.running ? { ...c, running: false } : c)),
      kernelStatus: 'idle',
    }))
  },

  restartKernel: async () => {
    const { notebookId } = get()
    if (!notebookId) return
    set({ kernelStatus: 'starting' })
    await authFetch(`${API}/${notebookId}/restart`, { method: 'POST' })
    // Clear all outputs after restart
    set((s) => ({
      cells: s.cells.map((c) => ({
        ...c,
        outputs: [],
        execution_count: null,
        running: false,
      })),
      kernelStatus: 'idle',
    }))
  },

  // -- DataFrame bridge ------------------------------------------------------

  getDataframes: async () => {
    const { notebookId } = get()
    if (!notebookId) return []
    const res = await authFetch(`${API}/${notebookId}/dataframes`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.dataframes ?? []) as string[]
  },

  chartDataframe: async (dfName: string) => {
    const { notebookId } = get()
    if (!notebookId) throw new Error('No notebook loaded')
    const res = await authFetch(`${API}/${notebookId}/dataframes/${dfName}/to-source`, {
      method: 'POST',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(body.detail ?? `Chart dataframe failed: ${res.status}`)
    }
    const data = await res.json()
    return { sourceId: data.source_id as string }
  },

  // -- Cleanup ---------------------------------------------------------------

  reset: () => {
    set({
      notebookId: null,
      title: '',
      cells: [],
      dirty: false,
      kernelStatus: 'disconnected',
    })
  },
}))
