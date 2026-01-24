/**
 * DateRange filter component.
 * Allows selection of a date range with presets.
 */

import { useState, useMemo } from 'react'
import type { FilterSpec } from '../../types/chart'

interface DateRangeValue {
  start: string
  end: string
}

interface DateRangeProps {
  filter: FilterSpec
  value?: DateRangeValue
  onChange: (value: DateRangeValue) => void
}

// Preset date ranges
const PRESETS: { label: string; getDates: () => DateRangeValue }[] = [
  {
    label: 'Last 7 Days',
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 7)
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      }
    },
  },
  {
    label: 'Last 30 Days',
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      }
    },
  },
  {
    label: 'Last 90 Days',
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 90)
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      }
    },
  },
  {
    label: 'Last 6 Months',
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 6)
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      }
    },
  },
  {
    label: 'Last 12 Months',
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setFullYear(start.getFullYear() - 1)
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      }
    },
  },
  {
    label: 'Year to Date',
    getDates: () => {
      const end = new Date()
      const start = new Date(end.getFullYear(), 0, 1)
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      }
    },
  },
]

export function DateRange({ filter, value, onChange }: DateRangeProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>(filter.defaultValue || 'Last 12 Months')

  // Calculate current value
  const currentValue = useMemo(() => {
    if (value) return value

    // Use default dates if provided
    if (filter.defaultStart && filter.defaultEnd) {
      return { start: filter.defaultStart, end: filter.defaultEnd }
    }

    // Use preset
    const preset = PRESETS.find((p) => p.label === selectedPreset)
    return preset?.getDates() || PRESETS[4].getDates() // Default to Last 12 Months
  }, [value, filter.defaultStart, filter.defaultEnd, selectedPreset])

  const handlePresetChange = (presetLabel: string) => {
    setSelectedPreset(presetLabel)
    const preset = PRESETS.find((p) => p.label === presetLabel)
    if (preset) {
      onChange(preset.getDates())
    }
  }

  const handleCustomDateChange = (field: 'start' | 'end', dateValue: string) => {
    setSelectedPreset('Custom')
    onChange({
      ...currentValue,
      [field]: dateValue,
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      {filter.title && (
        <label
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'var(--color-gray-600)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {filter.title}
        </label>
      )}

      {/* Preset selector */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {PRESETS.slice(0, 4).map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePresetChange(preset.label)}
            style={{
              padding: '0.375rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid',
              borderColor:
                selectedPreset === preset.label
                  ? 'var(--color-primary)'
                  : 'var(--color-gray-300)',
              backgroundColor:
                selectedPreset === preset.label
                  ? 'var(--color-primary)'
                  : 'white',
              color:
                selectedPreset === preset.label
                  ? 'white'
                  : 'var(--color-gray-700)',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="date"
          value={currentValue.start}
          onChange={(e) => handleCustomDateChange('start', e.target.value)}
          style={{
            padding: '0.375rem 0.5rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-gray-300)',
            fontSize: '0.875rem',
            color: 'var(--color-gray-800)',
          }}
        />
        <span style={{ color: 'var(--color-gray-500)' }}>to</span>
        <input
          type="date"
          value={currentValue.end}
          onChange={(e) => handleCustomDateChange('end', e.target.value)}
          style={{
            padding: '0.375rem 0.5rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-gray-300)',
            fontSize: '0.875rem',
            color: 'var(--color-gray-800)',
          }}
        />
      </div>
    </div>
  )
}
