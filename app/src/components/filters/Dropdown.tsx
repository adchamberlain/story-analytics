/**
 * Dropdown filter component.
 * Allows selection from a list of options.
 */

import { useState, useEffect } from 'react'
import type { FilterSpec } from '../../types/chart'
import { executeQuery } from '../../api/client'

interface DropdownProps {
  filter: FilterSpec
  value?: string
  onChange: (value: string) => void
}

export function Dropdown({ filter, value, onChange }: DropdownProps) {
  const [options, setOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load options from query if specified
  useEffect(() => {
    const loadOptions = async () => {
      if (!filter.optionsQuery) return

      setLoading(true)
      setError(null)

      try {
        const result = await executeQuery(filter.optionsQuery)
        // Extract values from the first column
        const column = filter.optionsColumn || result.columns[0]
        const values = result.data.map((row) => String(row[column])).filter(Boolean)
        setOptions([...new Set(values)]) // Deduplicate
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load options')
      } finally {
        setLoading(false)
      }
    }

    loadOptions()
  }, [filter.optionsQuery, filter.optionsColumn])

  // Use default value if no value provided
  const selectedValue = value ?? filter.defaultValue ?? ''

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
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
      <select
        value={selectedValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        style={{
          padding: '0.5rem 0.75rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-gray-300)',
          backgroundColor: 'white',
          fontSize: '0.875rem',
          color: 'var(--color-gray-800)',
          cursor: loading ? 'wait' : 'pointer',
          minWidth: '150px',
        }}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error && (
        <span style={{ color: 'var(--color-error)', fontSize: '0.75rem' }}>
          {error}
        </span>
      )}
    </div>
  )
}
