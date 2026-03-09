import { useNotebookStore } from '../../stores/notebookStore'

interface CellToolbarProps {
  cellId: string
  cellType: 'code' | 'markdown' | 'sql'
}

export function CellToolbar({ cellId, cellType }: CellToolbarProps) {
  const { changeCellType, moveCell, deleteCell } = useNotebookStore()

  return (
    <div className="flex items-center gap-1">
      {/* Cell type dropdown */}
      <select
        value={cellType}
        onChange={(e) => changeCellType(cellId, e.target.value as 'code' | 'markdown' | 'sql')}
        className="text-xs rounded-md border border-border-default bg-surface px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="code">Python</option>
        <option value="sql">SQL</option>
        <option value="markdown">Markdown</option>
      </select>

      {/* Move up */}
      <button
        onClick={() => moveCell(cellId, 'up')}
        className="p-1 rounded text-text-icon hover:text-text-primary hover:bg-surface-secondary transition-colors"
        title="Move up"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
      </button>

      {/* Move down */}
      <button
        onClick={() => moveCell(cellId, 'down')}
        className="p-1 rounded text-text-icon hover:text-text-primary hover:bg-surface-secondary transition-colors"
        title="Move down"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Delete */}
      <button
        onClick={() => deleteCell(cellId)}
        className="p-1 rounded text-text-icon hover:text-red-500 hover:bg-surface-secondary transition-colors"
        title="Delete cell"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
          />
        </svg>
      </button>
    </div>
  )
}
