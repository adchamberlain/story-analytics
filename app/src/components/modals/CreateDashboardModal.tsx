/**
 * Modal for creating a dashboard from selected charts.
 */

import { useState } from 'react'
import type { ChartLibraryItem } from '../../types/conversation'

interface CreateDashboardModalProps {
  selectedCharts: ChartLibraryItem[]
  onClose: () => void
  onSubmit: (title: string, description: string | null) => Promise<void>
  isLoading?: boolean
}

export function CreateDashboardModal({
  selectedCharts,
  onClose,
  onSubmit,
  isLoading = false,
}: CreateDashboardModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    try {
      await onSubmit(title.trim(), description.trim() || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create dashboard')
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--space-8)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--color-gray-800)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '480px',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--color-gray-700)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              color: 'var(--color-gray-200)',
            }}
          >
            Create Dashboard
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              width: '32px',
              height: '32px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-gray-400)',
              fontSize: '1.5rem',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div
            style={{
              padding: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            {/* Title input */}
            <div>
              <label
                htmlFor="dashboard-title"
                style={{
                  display: 'block',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: 'var(--color-gray-300)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                Title <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <input
                id="dashboard-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My Dashboard"
                autoFocus
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-gray-900)',
                  border: '1px solid var(--color-gray-700)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-200)',
                  fontSize: 'var(--text-base)',
                }}
              />
            </div>

            {/* Description input */}
            <div>
              <label
                htmlFor="dashboard-description"
                style={{
                  display: 'block',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: 'var(--color-gray-300)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                Description
              </label>
              <textarea
                id="dashboard-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-gray-900)',
                  border: '1px solid var(--color-gray-700)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-200)',
                  fontSize: 'var(--text-base)',
                  resize: 'vertical',
                  minHeight: '60px',
                }}
              />
            </div>

            {/* Selected charts */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: 'var(--color-gray-300)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                Selected Charts ({selectedCharts.length})
              </label>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  backgroundColor: 'var(--color-gray-900)',
                  border: '1px solid var(--color-gray-700)',
                  borderRadius: 'var(--radius-md)',
                  maxHeight: '150px',
                  overflow: 'auto',
                }}
              >
                {selectedCharts.map((chart) => (
                  <li
                    key={chart.id}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-gray-400)',
                      borderBottom: '1px solid var(--color-gray-800)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <span style={{ color: 'var(--color-primary)' }}>•</span>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {chart.title}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Error message */}
            {error && (
              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--color-error)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-error)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 'var(--space-3)',
              padding: 'var(--space-4) var(--space-6)',
              borderTop: '1px solid var(--color-gray-700)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: 'var(--color-gray-700)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-gray-200)',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !title.trim()}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: 'var(--color-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                cursor: isLoading || !title.trim() ? 'not-allowed' : 'pointer',
                opacity: isLoading || !title.trim() ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}
            >
              {isLoading ? (
                <>
                  <span
                    style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  Creating...
                </>
              ) : (
                'Create Dashboard'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
