import { useState, useRef, useEffect } from 'react'

/** Map DuckDB types to short display labels */
function shortType(duckdbType: string): string {
  const t = duckdbType.toUpperCase()
  if (t.includes('VARCHAR') || t.includes('TEXT') || t.includes('STRING')) return 'text'
  if (t.includes('BIGINT') || t.includes('INTEGER') || t.includes('SMALLINT') || t.includes('TINYINT') || t.includes('HUGEINT')) return 'int'
  if (t.includes('DOUBLE') || t.includes('FLOAT') || t.includes('DECIMAL') || t.includes('NUMERIC') || t.includes('REAL')) return 'decimal'
  if (t.includes('TIMESTAMP')) return 'datetime'
  if (t.includes('DATE')) return 'date'
  if (t.includes('TIME')) return 'time'
  if (t.includes('BOOLEAN') || t.includes('BOOL')) return 'bool'
  return duckdbType.toLowerCase()
}

interface MultiColumnSelectProps {
  label: string
  value: string | string[] | null
  columns: string[]
  columnTypes?: Record<string, string>
  onChange: (value: string | string[] | null) => void
}

export function MultiColumnSelect({ label, value, columns, columnTypes, onChange }: MultiColumnSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Normalize value to array
  const selected: string[] = Array.isArray(value) ? value : value ? [value] : []

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (col: string) => {
    let next: string[]
    if (selected.includes(col)) {
      next = selected.filter((c) => c !== col)
    } else {
      next = [...selected, col]
    }
    // Emit: empty → null, single → string, multi → array
    if (next.length === 0) onChange(null)
    else if (next.length === 1) onChange(next[0])
    else onChange(next)
  }

  // Button label
  let buttonText: string
  if (selected.length === 0) {
    buttonText = 'Select...'
  } else if (selected.length === 1) {
    buttonText = selected[0]
  } else {
    buttonText = `${selected.length} columns`
  }

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-2 py-1.5 text-sm border border-border-default rounded-md bg-surface text-text-primary text-left focus:outline-none focus:border-blue-400 flex items-center justify-between"
      >
        <span className={selected.length === 0 ? 'text-text-muted' : ''}>
          {buttonText}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-icon shrink-0 ml-1">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-surface border border-border-default rounded-md shadow-lg max-h-60 overflow-y-auto">
          {columns.map((col) => (
            <label
              key={col}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-secondary cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selected.includes(col)}
                onChange={() => toggle(col)}
                className="rounded border-border-strong text-blue-600 focus:ring-blue-500"
              />
              <span className="text-text-primary truncate">{col}</span>
              {columnTypes?.[col] && (
                <span className="text-[10px] text-text-muted ml-auto shrink-0">
                  {shortType(columnTypes[col])}
                </span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
