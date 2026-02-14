interface ColumnDropdownProps {
  label: string
  value: string | null
  columns: string[]
  allowNone?: boolean
  onChange: (value: string | null) => void
}

export function ColumnDropdown({ label, value, columns, allowNone = false, onChange }: ColumnDropdownProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:border-blue-400"
      >
        {allowNone && <option value="">None</option>}
        {!allowNone && !value && <option value="">Select...</option>}
        {columns.map((col) => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
    </div>
  )
}
