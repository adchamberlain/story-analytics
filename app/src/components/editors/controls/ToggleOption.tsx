/**
 * Toggle option control for boolean chart config values.
 */

interface ToggleOptionProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function ToggleOption({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: ToggleOptionProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) 0',
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        style={{
          position: 'relative',
          width: '44px',
          height: '24px',
          backgroundColor: checked ? 'var(--color-primary)' : 'var(--color-gray-600)',
          border: 'none',
          borderRadius: '12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'background-color var(--transition-fast)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '22px' : '2px',
            width: '20px',
            height: '20px',
            backgroundColor: 'white',
            borderRadius: '50%',
            transition: 'left var(--transition-fast)',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
          }}
        />
      </button>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: 'var(--color-gray-200)',
          }}
        >
          {label}
        </div>
        {description && (
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-gray-400)',
              marginTop: '2px',
            }}
          >
            {description}
          </div>
        )}
      </div>
    </div>
  )
}
