interface ColumnDropdownProps {
  label: string
  value: string | null
  columns: string[]
  columnTypes?: Record<string, string>
  allowNone?: boolean
  onChange: (value: string | null) => void
}

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

export function ColumnDropdown({ label, value, columns, columnTypes, allowNone = false, onChange }: ColumnDropdownProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-2 py-1.5 text-sm border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:border-blue-400"
      >
        {allowNone && <option value="">None</option>}
        {!allowNone && !value && <option value="">Select...</option>}
        {columns.map((col) => (
          <option key={col} value={col}>
            {col}{columnTypes?.[col] ? ` (${shortType(columnTypes[col])})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
