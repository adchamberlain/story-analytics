import { useState, useCallback, useRef, useEffect } from 'react'

interface TransformData {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
}

interface DataTransformGridProps {
  data: TransformData
  sourceId?: string
  onTransform: (action: string, params: Record<string, unknown>) => Promise<void>
  transforming?: boolean
}

export function DataTransformGrid({ data, onTransform, transforming }: DataTransformGridProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [menuCol, setMenuCol] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuCol) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuCol(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuCol])

  const handleCellClick = useCallback((row: number, col: string, value: string) => {
    setEditingCell({ row, col })
    setEditValue(value)
  }, [])

  const handleCellBlur = useCallback(async () => {
    if (!editingCell) return
    const { row, col } = editingCell
    setEditingCell(null)
    // Only save if value actually changed
    const currentVal = String(data.rows[row]?.[col] ?? '')
    if (editValue !== currentVal) {
      await onTransform('edit-cell', {
        row,
        column: col,
        value: editValue,
      })
    }
  }, [editingCell, editValue, onTransform, data.rows])

  const handleCellKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === 'Escape') {
      setEditingCell(null)
    }
  }, [])

  const handleColumnAction = useCallback(async (col: string, action: string) => {
    setMenuCol(null)
    switch (action) {
      case 'delete':
        await onTransform('delete-column', { column: col })
        break
      case 'rename': {
        const newName = prompt('New column name:', col)
        if (newName && newName !== col) {
          await onTransform('rename-column', { old: col, new: newName })
        }
        break
      }
      case 'round': {
        const decimals = prompt('Round to N decimals:', '2')
        if (decimals != null) {
          await onTransform('round', { column: col, decimals: parseInt(decimals) })
        }
        break
      }
      case 'cast-number':
        await onTransform('cast-type', { column: col, type: 'number' })
        break
      case 'cast-text':
        await onTransform('cast-type', { column: col, type: 'text' })
        break
      case 'prepend-append': {
        const prepend = prompt('Prepend text (leave empty for none):', '') ?? ''
        const append = prompt('Append text (leave empty for none):', '') ?? ''
        if (prepend || append) {
          await onTransform('prepend-append', { column: col, prepend, append })
        }
        break
      }
    }
  }, [onTransform])

  if (!data.columns.length) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-text-muted">
        No data to display
      </div>
    )
  }

  return (
    <div className="overflow-auto border border-border-default rounded-lg">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-border-default bg-surface-secondary">
        <button
          onClick={() => onTransform('transpose', {})}
          disabled={transforming}
          className="px-2.5 py-1 text-xs border border-border-default rounded hover:bg-surface-tertiary transition-colors disabled:opacity-50"
        >
          Transpose
        </button>
        <span className="text-xs text-text-muted ml-auto">
          {data.row_count} row{data.row_count !== 1 ? 's' : ''} | {data.columns.length} column{data.columns.length !== 1 ? 's' : ''}
        </span>
        {transforming && (
          <span className="text-xs text-blue-600">Applying...</span>
        )}
      </div>

      {/* Data grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1.5 border-b border-r border-border-default bg-surface-secondary text-center text-xs text-text-muted w-10 sticky left-0 z-10">
                #
              </th>
              {data.columns.map((col) => (
                <th
                  key={col}
                  role="columnheader"
                  className="relative px-3 py-2 border-b border-border-default font-medium text-left bg-surface-secondary text-xs"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">{col}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuCol(menuCol === col ? null : col)
                      }}
                      className="shrink-0 px-1 text-text-muted hover:text-text-primary rounded hover:bg-surface-tertiary"
                      aria-label={`Column menu for ${col}`}
                    >
                      &#9662;
                    </button>
                  </div>
                  {/* Dropdown menu */}
                  {menuCol === col && (
                    <div
                      ref={menuRef}
                      className="absolute top-full left-0 z-20 mt-1 bg-white dark:bg-gray-800 border border-border-default rounded-md shadow-lg py-1 min-w-[140px]"
                    >
                      <button onClick={() => handleColumnAction(col, 'rename')} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-surface-secondary">
                        Rename
                      </button>
                      <button onClick={() => handleColumnAction(col, 'round')} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-surface-secondary">
                        Round...
                      </button>
                      <button onClick={() => handleColumnAction(col, 'cast-number')} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-surface-secondary">
                        Cast to Number
                      </button>
                      <button onClick={() => handleColumnAction(col, 'cast-text')} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-surface-secondary">
                        Cast to Text
                      </button>
                      <button onClick={() => handleColumnAction(col, 'prepend-append')} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-surface-secondary">
                        Prepend / Append...
                      </button>
                      <hr className="my-1 border-border-default" />
                      <button onClick={() => handleColumnAction(col, 'delete')} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-surface-secondary text-red-600">
                        Delete Column
                      </button>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-surface-secondary/50">
                <td className="px-2 py-1 border-b border-r border-border-subtle text-center text-xs text-text-muted bg-surface-secondary sticky left-0">
                  {ri + 1}
                </td>
                {data.columns.map((col) => {
                  const rawVal = row[col]
                  const val = rawVal == null ? '' : String(rawVal)
                  const isEditing = editingCell?.row === ri && editingCell?.col === col
                  return (
                    <td
                      key={col}
                      className="px-3 py-1 border-b border-border-subtle cursor-text whitespace-nowrap max-w-[200px] truncate"
                      onClick={() => !isEditing && handleCellClick(ri, col, val)}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeyDown}
                          className="w-full px-1 py-0 text-sm border border-blue-400 rounded outline-none bg-white dark:bg-gray-900"
                        />
                      ) : (
                        <span className={rawVal == null ? 'text-text-muted italic' : ''}>
                          {rawVal == null ? 'null' : val}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
