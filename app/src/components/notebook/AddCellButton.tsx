import { useState } from 'react'
import { useNotebookStore } from '../../stores/notebookStore'

interface AddCellButtonProps {
  index: number
}

export function AddCellButton({ index }: AddCellButtonProps) {
  const { addCell } = useNotebookStore()
  const [visible, setVisible] = useState(false)

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ height: '32px' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {/* Hover line */}
      <div
        className={`absolute inset-x-0 top-1/2 h-px bg-border-default transition-opacity ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Buttons */}
      <div
        className={`relative flex items-center gap-1 transition-opacity ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          onClick={() => addCell(index, 'code')}
          className="text-xs rounded-md border border-border-default bg-surface hover:bg-surface-secondary text-text-secondary hover:text-text-primary px-2.5 py-1 transition-colors font-medium"
        >
          + Python
        </button>
        <button
          onClick={() => addCell(index, 'sql')}
          className="text-xs rounded-md border border-border-default bg-surface hover:bg-surface-secondary text-text-secondary hover:text-text-primary px-2.5 py-1 transition-colors font-medium"
        >
          + SQL
        </button>
        <button
          onClick={() => addCell(index, 'markdown')}
          className="text-xs rounded-md border border-border-default bg-surface hover:bg-surface-secondary text-text-secondary hover:text-text-primary px-2.5 py-1 transition-colors font-medium"
        >
          + Markdown
        </button>
      </div>
    </div>
  )
}
