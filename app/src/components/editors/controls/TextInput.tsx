/**
 * Text input control for chart config string values.
 */

interface TextInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: TextInputProps) {
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
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%',
          padding: 'var(--space-2) var(--space-3)',
          backgroundColor: 'var(--color-gray-800)',
          border: '1px solid var(--color-gray-600)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-gray-200)',
          fontSize: 'var(--text-sm)',
        }}
      />
    </div>
  )
}
