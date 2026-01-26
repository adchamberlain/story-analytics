/**
 * Modal for enhancing semantic layer with user business context.
 *
 * Allows users to paste existing metric definitions, data dictionaries,
 * or other business context which the LLM will parse and merge.
 */

import { useState } from 'react'
import {
  enhanceSemanticLayer,
  type SemanticEnhanceResponse,
  type SemanticChange,
} from '../../api/client'
import { useSourceStore } from '../../stores/sourceStore'

interface EnhanceSemanticModalProps {
  isOpen: boolean
  onClose: () => void
  sourceName: string
}

// Example placeholder text
const PLACEHOLDER_TEXT = `# Example formats you can paste:

## Metric Definitions
MRR (Monthly Recurring Revenue): Sum of all active subscription amounts
Churn Rate: Percentage of customers who cancelled in a given period

## Data Dictionary
CUSTOMERS table: Contains all customer account records
- PLAN_TIER: Customer's subscription tier (Free, Starter, Pro, Enterprise)
- COMPANY_SIZE: Segment based on employee count

## Golden SQL Queries
-- MRR Calculation
SELECT
  DATE_TRUNC('month', created_at) as month,
  SUM(amount) as mrr
FROM subscriptions
WHERE status = 'active'
GROUP BY 1
`

type ViewMode = 'input' | 'preview' | 'loading'

export function EnhanceSemanticModal({ isOpen, onClose, sourceName }: EnhanceSemanticModalProps) {
  const { loadSemanticLayer } = useSourceStore()

  const [userContext, setUserContext] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('input')
  const [error, setError] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<SemanticEnhanceResponse | null>(null)
  const [applying, setApplying] = useState(false)

  if (!isOpen) return null

  const handlePreview = async () => {
    if (!userContext.trim()) {
      setError('Please paste some business context to add')
      return
    }

    setViewMode('loading')
    setError(null)

    try {
      const response = await enhanceSemanticLayer(sourceName, {
        user_context: userContext,
        preview: true,
      })

      if (!response.success) {
        setError(response.message)
        setViewMode('input')
        return
      }

      if (!response.changes || response.changes.length === 0) {
        setError('No changes detected. The AI could not extract new information from the provided context.')
        setViewMode('input')
        return
      }

      setPreviewData(response)
      setViewMode('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to analyze context')
      setViewMode('input')
    }
  }

  const handleApply = async () => {
    setApplying(true)
    setError(null)

    try {
      const response = await enhanceSemanticLayer(sourceName, {
        user_context: userContext,
        preview: false,
      })

      if (!response.success) {
        setError(response.message)
        setApplying(false)
        return
      }

      // Reload semantic layer to show changes
      await loadSemanticLayer(sourceName)

      // Close modal
      handleClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply changes')
      setApplying(false)
    }
  }

  const handleClose = () => {
    setUserContext('')
    setViewMode('input')
    setError(null)
    setPreviewData(null)
    setApplying(false)
    onClose()
  }

  const handleBack = () => {
    setViewMode('input')
    setError(null)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110, // Above SchemaBrowser
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-gray-900)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-gray-700)',
          width: '90%',
          maxWidth: '800px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-4)',
            borderBottom: '1px solid var(--color-gray-700)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 'var(--text-lg)',
                fontFamily: 'var(--font-brand)',
                color: 'var(--color-gray-100)',
              }}
            >
              {viewMode === 'preview' ? 'Review Proposed Changes' : 'Add Business Context'}
            </h2>
            <p
              style={{
                margin: 'var(--space-1) 0 0',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-gray-400)',
              }}
            >
              {viewMode === 'preview'
                ? `${previewData?.changes?.length || 0} changes will be applied to your semantic layer`
                : 'Paste your metric definitions, data dictionary, or SQL queries'}
            </p>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-gray-400)',
              cursor: 'pointer',
              fontSize: 'var(--text-xl)',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-4)' }}>
          {viewMode === 'loading' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-8)',
                minHeight: '300px',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  border: '3px solid var(--color-gray-700)',
                  borderTopColor: 'var(--color-primary)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginBottom: 'var(--space-4)',
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <h3
                style={{
                  margin: '0 0 var(--space-2)',
                  fontSize: 'var(--text-lg)',
                  fontFamily: 'var(--font-brand)',
                  color: 'var(--color-gray-100)',
                }}
              >
                Analyzing Business Context...
              </h3>
              <p style={{ margin: 0, color: 'var(--color-gray-400)', textAlign: 'center' }}>
                AI is parsing your input and identifying changes
                <br />
                to merge with your semantic layer.
              </p>
            </div>
          )}

          {viewMode === 'input' && (
            <>
              <textarea
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                placeholder={PLACEHOLDER_TEXT}
                style={{
                  width: '100%',
                  height: '350px',
                  backgroundColor: 'var(--color-gray-800)',
                  color: 'var(--color-gray-100)',
                  border: '1px solid var(--color-gray-600)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-mono)',
                  resize: 'vertical',
                }}
              />

              {/* Format hints */}
              <div
                style={{
                  marginTop: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-gray-800)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-gray-700)',
                }}
              >
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-gray-400)',
                    textTransform: 'uppercase',
                    marginBottom: 'var(--space-2)',
                    fontFamily: 'var(--font-brand)',
                  }}
                >
                  Supported Formats
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--space-2)',
                  }}
                >
                  {[
                    'dbt semantic layer YAML',
                    'Looker LookML',
                    'Data dictionaries',
                    'Markdown docs',
                    'SQL with comments',
                    'Plain text definitions',
                  ].map((format) => (
                    <span
                      key={format}
                      style={{
                        padding: 'var(--space-1) var(--space-2)',
                        backgroundColor: 'var(--color-gray-700)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-gray-300)',
                      }}
                    >
                      {format}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {viewMode === 'preview' && previewData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* Summary */}
              {previewData.summary && (
                <div
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-primary-dark)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-primary)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontFamily: 'var(--font-brand)',
                      color: 'var(--color-gray-100)',
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    Summary
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 'var(--space-3)',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-gray-200)',
                    }}
                  >
                    {previewData.summary.metrics_added && (
                      <span>+{previewData.summary.metrics_added} metrics</span>
                    )}
                    {previewData.summary.terms_added && (
                      <span>+{previewData.summary.terms_added} terms</span>
                    )}
                    {previewData.summary.columns_enhanced && (
                      <span>{previewData.summary.columns_enhanced} columns enhanced</span>
                    )}
                    {previewData.summary.patterns_added && (
                      <span>+{previewData.summary.patterns_added} query patterns</span>
                    )}
                    {previewData.summary.tables_enhanced &&
                      previewData.summary.tables_enhanced.length > 0 && (
                        <span>Tables: {previewData.summary.tables_enhanced.join(', ')}</span>
                      )}
                  </div>
                </div>
              )}

              {/* Changes list */}
              <div
                style={{
                  maxHeight: '400px',
                  overflowY: 'auto',
                  border: '1px solid var(--color-gray-700)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {previewData.changes?.map((change, index) => (
                  <ChangeRow key={index} change={change} />
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div
              style={{
                marginTop: 'var(--space-3)',
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
            padding: 'var(--space-4)',
            borderTop: '1px solid var(--color-gray-700)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-3)',
          }}
        >
          {viewMode === 'input' && (
            <>
              <button
                onClick={handleClose}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-gray-600)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-300)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePreview}
                disabled={!userContext.trim()}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor: userContext.trim()
                    ? 'var(--color-primary)'
                    : 'var(--color-gray-700)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: userContext.trim() ? 'white' : 'var(--color-gray-500)',
                  cursor: userContext.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-brand)',
                }}
              >
                Preview Changes
              </button>
            </>
          )}

          {viewMode === 'preview' && (
            <>
              <button
                onClick={handleBack}
                disabled={applying}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-gray-600)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-300)',
                  cursor: applying ? 'not-allowed' : 'pointer',
                  fontSize: 'var(--text-sm)',
                  opacity: applying ? 0.5 : 1,
                }}
              >
                Back
              </button>
              <button
                onClick={handleApply}
                disabled={applying}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor: 'var(--color-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'white',
                  cursor: applying ? 'not-allowed' : 'pointer',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-brand)',
                  opacity: applying ? 0.7 : 1,
                }}
              >
                {applying ? 'Applying...' : 'Apply Changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Individual change row component
function ChangeRow({ change }: { change: SemanticChange }) {
  const [expanded, setExpanded] = useState(false)

  // Parse the path to get friendly labels
  const pathParts = change.path.split('.')
  const isBusinessContext = pathParts[0] === 'business_context'
  const isTable = pathParts[0] === 'tables'
  const isQueryPattern = pathParts[0] === 'query_patterns'

  let label = change.path
  let category = ''

  if (isBusinessContext) {
    category = 'Business Context'
    label = pathParts.slice(1).join(' > ')
  } else if (isTable) {
    category = `Table: ${pathParts[1]}`
    if (pathParts[2] === 'columns') {
      label = `Column ${pathParts[3]}: ${pathParts[4] || ''}`
    } else {
      label = pathParts.slice(2).join(' > ')
    }
  } else if (isQueryPattern) {
    category = 'Query Patterns'
    label = pathParts[1]
  }

  const actionColors = {
    add: 'var(--color-success)',
    update: 'var(--color-warning)',
    enhance: 'var(--color-primary)',
  }

  const actionLabels = {
    add: 'ADD',
    update: 'UPDATE',
    enhance: 'ENHANCE',
  }

  return (
    <div
      style={{
        borderBottom: '1px solid var(--color-gray-700)',
        padding: 'var(--space-3)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span
          style={{
            fontSize: 'var(--text-xs)',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: actionColors[change.action],
            color: 'white',
            fontFamily: 'var(--font-brand)',
          }}
        >
          {actionLabels[change.action]}
        </span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-gray-500)',
          }}
        >
          {category}
        </span>
        <span
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-gray-200)',
            flex: 1,
          }}
        >
          {label}
        </span>
        <span style={{ color: 'var(--color-gray-500)' }}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {expanded && (
        <div
          style={{
            marginTop: 'var(--space-2)',
            paddingLeft: 'var(--space-4)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {change.current_value !== null && change.current_value !== undefined && (
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <span style={{ color: 'var(--color-gray-500)' }}>Current: </span>
              <span
                style={{
                  color: 'var(--color-gray-400)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                {typeof change.current_value === 'object'
                  ? JSON.stringify(change.current_value, null, 2)
                  : String(change.current_value)}
              </span>
            </div>
          )}
          <div>
            <span style={{ color: 'var(--color-gray-500)' }}>New: </span>
            <span
              style={{
                color: 'var(--color-success)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
              }}
            >
              {typeof change.new_value === 'object'
                ? JSON.stringify(change.new_value, null, 2)
                : String(change.new_value)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
