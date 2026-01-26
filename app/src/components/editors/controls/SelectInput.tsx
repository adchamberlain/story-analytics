/**
 * Select input control for chart config dropdown values.
 */

interface SelectOption {
  value: string
  label: string
}

interface SelectInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  disabled?: boolean
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: SelectInputProps) {
  return (
    <div style={{ padding: 'var(--space-2) 0' }}>
      <label
        style={{
          display: 'block',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          color: 'var(--color-gray-200)',
          marginBottom: 'var(--space-2)',
        }}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: 'var(--space-2) var(--space-3)',
          backgroundColor: 'var(--color-gray-800)',
          border: '1px solid var(--color-gray-600)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-gray-200)',
          fontSize: 'var(--text-sm)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
