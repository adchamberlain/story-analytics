import { useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useNotebookStore } from '../stores/notebookStore'
import { NotebookCell } from '../components/notebook/NotebookCell'
import { AddCellButton } from '../components/notebook/AddCellButton'

export function NotebookEditorPage() {
  const { notebookId } = useParams<{ notebookId: string }>()
  const navigate = useNavigate()
  const store = useNotebookStore()

  // Load notebook on mount
  useEffect(() => {
    if (notebookId) {
      store.loadNotebook(notebookId)
    }
    return () => {
      store.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId])

  // Cmd+S to save
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        store.saveNotebook()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Kernel status dot color
  const statusColor = {
    disconnected: 'bg-gray-400',
    starting: 'bg-yellow-400 animate-pulse',
    idle: 'bg-green-500',
    busy: 'bg-orange-500 animate-pulse',
  }[store.kernelStatus]

  const statusLabel = {
    disconnected: 'Disconnected',
    starting: 'Starting...',
    idle: 'Idle',
    busy: 'Busy',
  }[store.kernelStatus]

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 72px)' }}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-default bg-surface shrink-0">
        <div className="flex items-center gap-4">
          {/* Back button */}
          <button
            onClick={() => navigate('/notebooks')}
            className="p-1.5 rounded-lg text-text-icon hover:text-text-primary hover:bg-surface-secondary transition-colors"
            title="Back to notebooks"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>

          {/* Editable title */}
          <input
            type="text"
            value={store.title}
            onChange={(e) => store.updateTitle(e.target.value)}
            className="text-lg font-semibold text-text-primary bg-transparent border-none outline-none focus:ring-0 min-w-0"
            style={{ maxWidth: '400px' }}
            placeholder="Untitled Notebook"
          />

          {/* Unsaved badge */}
          {store.dirty && (
            <span className="text-xs text-text-muted bg-surface-inset px-2 py-0.5 rounded-full">
              unsaved
            </span>
          )}

          {/* Kernel status */}
          <div className="flex items-center gap-1.5 ml-2">
            <div className={`h-2 w-2 rounded-full ${statusColor}`} />
            <span className="text-xs text-text-muted">{statusLabel}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => store.interruptKernel()}
            disabled={store.kernelStatus !== 'busy'}
            className="text-xs rounded-lg border border-border-default text-text-primary hover:bg-surface-secondary px-3 py-1.5 transition-colors font-medium disabled:opacity-40"
          >
            Interrupt
          </button>
          <button
            onClick={() => store.restartKernel()}
            disabled={store.kernelStatus === 'disconnected' || store.kernelStatus === 'starting'}
            className="text-xs rounded-lg border border-border-default text-text-primary hover:bg-surface-secondary px-3 py-1.5 transition-colors font-medium disabled:opacity-40"
          >
            Restart
          </button>
          <button
            onClick={() => store.executeAll()}
            disabled={store.kernelStatus === 'disconnected' || store.kernelStatus === 'starting'}
            className="text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 transition-colors font-medium disabled:opacity-50"
          >
            Run All
          </button>
          <button
            onClick={() => store.saveNotebook()}
            disabled={!store.dirty}
            className="text-xs rounded-lg border border-border-default text-text-primary hover:bg-surface-secondary px-3 py-1.5 transition-colors font-medium disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      {/* Body — scrollable cell list */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto py-8 px-4" style={{ maxWidth: '900px' }}>
          {/* Add cell button at top */}
          <AddCellButton index={0} />

          {store.cells.map((cell, i) => (
            <div key={cell.id}>
              <NotebookCell cell={cell} />
              <AddCellButton index={i + 1} />
            </div>
          ))}

          {/* Empty state */}
          {store.cells.length === 0 && store.kernelStatus !== 'starting' && (
            <div className="text-center py-16">
              <p className="text-sm text-text-secondary mb-4">
                This notebook is empty. Add a cell to get started.
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => store.addCell(0, 'code')}
                  className="text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 transition-colors font-medium"
                >
                  + Python
                </button>
                <button
                  onClick={() => store.addCell(0, 'sql')}
                  className="text-sm rounded-lg border border-border-default text-text-primary hover:bg-surface-secondary px-4 py-2 transition-colors font-medium"
                >
                  + SQL
                </button>
                <button
                  onClick={() => store.addCell(0, 'markdown')}
                  className="text-sm rounded-lg border border-border-default text-text-primary hover:bg-surface-secondary px-4 py-2 transition-colors font-medium"
                >
                  + Markdown
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
