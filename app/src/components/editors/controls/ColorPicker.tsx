/**
 * Color picker control for chart color configuration.
 */

import { useState } from 'react'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

// Preset colors for quick selection
const PRESET_COLORS = [
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Gray', hex: '#6b7280' },
]

export function ColorPicker({
  label,
  value,
  onChange,
  disabled = false,
}: ColorPickerProps) {
  const [showPresets, setShowPresets] = useState(false)

  // Validate hex color format
  const isValidHex = (hex: string) => /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex)

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

      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
        {/* Color preview */}
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: isValidHex(value) ? value : '#808080',
            border: '2px solid var(--color-gray-600)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          onClick={() => !disabled && setShowPresets(!showPresets)}
        />

        {/* Hex input */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#3b82f6"
          disabled={disabled}
          style={{
            flex: 1,
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'var(--color-gray-800)',
            border: `1px solid ${!value || isValidHex(value) ? 'var(--color-gray-600)' : 'var(--color-error)'}`,
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-gray-200)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-mono)',
          }}
        />
      </div>

      {/* Preset colors */}
      {showPresets && !disabled && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-2)',
            padding: 'var(--space-2)',
            backgroundColor: 'var(--color-gray-800)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {PRESET_COLORS.map((color) => (
            <button
              key={color.hex}
              type="button"
              title={color.name}
              onClick={() => {
                onChange(color.hex)
                setShowPresets(false)
              }}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: color.hex,
                border: value === color.hex ? '2px solid white' : '2px solid transparent',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
