/**
 * ChartCard component.
 * Wraps a chart with title, options menu, loading states, and styling.
 * Optionally shows SQL code with inline editing.
 */

import { useState } from 'react'
import type { ChartRenderData, ChartType } from '../../types/chart'
import { ChartFactory } from '../charts/ChartFactory'
import { ChartSkeleton } from '../skeletons'
import { updateChart } from '../../api/client'

interface ChartCardProps {
  chart?: ChartRenderData
  /** Chart ID for editing (required for SQL editing) */
  chartId?: string
  showTitle?: boolean
  /** Show loading skeleton */
  loading?: boolean
  /** Error message to display */
  error?: string
  /** Skeleton type hint for loading state */
  skeletonType?: 'line' | 'bar' | 'bigvalue' | 'table'
  /** Show "View Code" section below chart */
  showCode?: boolean
  /** Callback when SQL is updated (triggers chart refresh) */
  onSqlUpdate?: (chartId: string, newSql: string) => void
}

/**
 * Map chart types to skeleton types.
 */
function getSkeletonType(chartType?: ChartType): 'line' | 'bar' | 'bigvalue' | 'table' {
  if (!chartType) return 'line'

  switch (chartType) {
    case 'BarChart':
    case 'Histogram':
      return 'bar'
    case 'BigValue':
      return 'bigvalue'
    case 'DataTable':
      return 'table'
    default:
      return 'line'
  }
}

export function ChartCard({
  chart,
  chartId,
  showTitle = true,
  loading = false,
  error,
  skeletonType,
  showCode = false,
  onSqlUpdate,
}: ChartCardProps) {
  const [codeExpanded, setCodeExpanded] = useState(false)

  // SQL editing state
  const [isEditingSQL, setIsEditingSQL] = useState(false)
  const [editedSQL, setEditedSQL] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const title = chart?.spec.config?.title
  const actualSkeletonType = skeletonType || getSkeletonType(chart?.spec.chartType)

  const sql = chart?.spec.sql || ''
  const canEdit = !!chartId && !!onSqlUpdate

  const handleStartEdit = () => {
    setEditedSQL(sql)
    setSaveError(null)
    setIsEditingSQL(true)
  }

  const handleCancelEdit = () => {
    setEditedSQL('')
    setSaveError(null)
    setIsEditingSQL(false)
  }

  const handleSaveSQL = async () => {
    if (!chartId || !onSqlUpdate) return

    setIsSaving(true)
    setSaveError(null)

    try {
      const result = await updateChart(chartId, { sql: editedSQL })
      if (result.success) {
        onSqlUpdate(chartId, editedSQL)
        setIsEditingSQL(false)
      } else {
        setSaveError(result.error || 'Failed to save SQL')
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save SQL')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fade-in"
      style={{
        backgroundColor: 'white',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
        transition: 'box-shadow var(--transition-base)',
      }}
    >
      {/* Header */}
      {showTitle && (title || loading) && (
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-gray-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {loading ? (
            <div
              className="skeleton"
              style={{
                width: '40%',
                height: '1.25rem',
                borderRadius: 'var(--radius-sm)',
              }}
            />
          ) : (
            <h3
              style={{
                fontSize: 'var(--text-base)',
                fontWeight: 'var(--font-semibold)' as unknown as number,
                color: 'var(--color-gray-900)',
                margin: 0,
              }}
            >
              {title}
            </h3>
          )}

          {/* Options menu */}
          {!loading && (
            <button
              style={{
                padding: 'var(--space-1)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-gray-400)',
                borderRadius: 'var(--radius-sm)',
                transition: 'color var(--transition-fast)',
              }}
              title="Options"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-gray-600)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-gray-400)'
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Content area */}
      <div
        style={{
          padding: 'var(--space-4)',
          minHeight: 200,
        }}
      >
        {/* Loading state */}
        {loading && <ChartSkeleton type={actualSkeletonType} showTitle={false} />}

        {/* Error state */}
        {!loading && error && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200,
              padding: 'var(--space-6)',
              textAlign: 'center',
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-error)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginBottom: 'var(--space-4)', opacity: 0.6 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p
              style={{
                color: 'var(--color-error)',
                fontSize: 'var(--text-sm)',
                margin: 0,
                maxWidth: 300,
              }}
            >
              {error}
            </p>
          </div>
        )}

        {/* Chart content */}
        {!loading && !error && chart && (
          <ChartFactory spec={chart.spec} data={chart.data} columns={chart.columns} />
        )}

        {/* Empty state (no data) */}
        {!loading && !error && !chart && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200,
              padding: 'var(--space-6)',
              textAlign: 'center',
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-gray-300)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginBottom: 'var(--space-4)' }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            <p
              style={{
                color: 'var(--color-gray-400)',
                fontSize: 'var(--text-sm)',
                margin: 0,
              }}
            >
              No data available
            </p>
          </div>
        )}
      </div>

      {/* View Code section */}
      {showCode && chart && !loading && !error && (
        <div
          style={{
            borderTop: '1px solid var(--color-gray-100)',
          }}
        >
          {/* Toggle button */}
          <button
            onClick={() => setCodeExpanded(!codeExpanded)}
            style={{
              width: '100%',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-gray-50)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: 'var(--color-gray-600)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              View Code
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: codeExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform var(--transition-fast)',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Code content */}
          {codeExpanded && (
            <div style={{ backgroundColor: 'var(--color-gray-900)' }}>
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-2) var(--space-4)',
                  borderBottom: '1px solid var(--color-gray-700)',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-gray-400)',
                    fontWeight: 500,
                  }}
                >
                  SQL
                </span>
              </div>

              {/* Code block or edit textarea */}
              {isEditingSQL ? (
                <div style={{ padding: 'var(--space-4)' }}>
                  <textarea
                    value={editedSQL}
                    onChange={(e) => setEditedSQL(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '200px',
                      padding: 'var(--space-3)',
                      backgroundColor: 'var(--color-gray-800)',
                      border: '1px solid var(--color-gray-600)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-gray-200)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      lineHeight: 1.5,
                      resize: 'vertical',
                    }}
                  />
                  {saveError && (
                    <p
                      style={{
                        margin: 'var(--space-2) 0 0 0',
                        color: 'var(--color-error)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      {saveError}
                    </p>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    padding: 'var(--space-4)',
                    maxHeight: '300px',
                    overflow: 'auto',
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      lineHeight: 1.5,
                      color: 'var(--color-gray-300)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {sql}
                  </pre>
                </div>
              )}

              {/* Action buttons */}
              <div
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  borderTop: '1px solid var(--color-gray-700)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {isEditingSQL ? (
                  <>
                    <div />
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button
                        onClick={handleCancelEdit}
                        style={{
                          padding: 'var(--space-1) var(--space-3)',
                          backgroundColor: 'var(--color-gray-700)',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-gray-300)',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveSQL}
                        disabled={isSaving}
                        style={{
                          padding: 'var(--space-1) var(--space-3)',
                          backgroundColor: 'var(--color-primary)',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          color: 'white',
                          fontSize: 'var(--text-xs)',
                          cursor: isSaving ? 'not-allowed' : 'pointer',
                          opacity: isSaving ? 0.7 : 1,
                        }}
                      >
                        {isSaving ? 'Saving...' : 'Save & Run'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Edit button (when editing is enabled) */}
                    {canEdit ? (
                      <button
                        onClick={handleStartEdit}
                        style={{
                          padding: 'var(--space-1) var(--space-3)',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--color-gray-600)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-gray-400)',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                        }}
                      >
                        Edit SQL
                      </button>
                    ) : (
                      <div />
                    )}

                    {/* Copy button */}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(sql)
                      }}
                      style={{
                        padding: 'var(--space-1) var(--space-3)',
                        backgroundColor: 'var(--color-gray-700)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-gray-300)',
                        fontSize: 'var(--text-xs)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-1)',
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
