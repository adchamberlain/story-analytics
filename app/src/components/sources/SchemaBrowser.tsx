/**
 * Schema Browser modal component.
 * Shows tables and columns with semantic metadata editing.
 */

import { useState } from 'react'
import { useSourceStore, getMergedTableData } from '../../stores/sourceStore'
import type { TableSemantic, ColumnSemantic } from '../../api/client'
import { EnhanceSemanticModal } from './EnhanceSemanticModal'

// Role icons
const ROLE_ICONS: Record<string, string> = {
  primary_key: '\u{1F511}', // key emoji
  foreign_key: '\u{1F517}', // link emoji
  dimension: '\u{1F4CA}', // bar chart
  measure: '\u{1F4C8}', // chart increasing
  date: '\u{1F4C5}', // calendar
  identifier: '\u{1F194}', // ID
}

// Role labels
const ROLE_LABELS: Record<string, string> = {
  primary_key: 'Primary Key',
  foreign_key: 'Foreign Key',
  dimension: 'Dimension',
  measure: 'Measure',
  date: 'Date',
  identifier: 'Identifier',
}

export function SchemaBrowser() {
  const {
    schemaBrowserOpen,
    closeSchemaBrowser,
    sources,
    selectedSource,
    selectSource,
    semanticLayer,
    semanticLoading,
    semanticError,
    selectedTable,
    selectTable,
    pendingChanges,
    updateTableField,
    updateColumnField,
    saveChanges,
    discardChanges,
    saving,
    saveError,
    generating,
    generateError,
    generateSemantic,
  } = useSourceStore()

  const [expandedColumn, setExpandedColumn] = useState<string | null>(null)
  const [showEnhanceModal, setShowEnhanceModal] = useState(false)

  if (!schemaBrowserOpen) return null

  // Get current table with merged changes
  const currentTableData = semanticLayer?.tables.find((t) => t.name === selectedTable)
  const currentTable = currentTableData
    ? getMergedTableData(currentTableData, pendingChanges)
    : null

  const hasChanges = pendingChanges.size > 0

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSchemaBrowser()
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-gray-900)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-gray-700)',
          width: '90%',
          maxWidth: '1000px',
          height: '80vh',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <h2
              style={{
                margin: 0,
                fontSize: 'var(--text-lg)',
                fontFamily: 'var(--font-brand)',
                color: 'var(--color-gray-100)',
              }}
            >
              Schema Browser
            </h2>
            {sources.length > 1 && (
              <select
                value={selectedSource || ''}
                onChange={(e) => selectSource(e.target.value)}
                style={{
                  backgroundColor: 'var(--color-gray-800)',
                  color: 'var(--color-gray-200)',
                  border: '1px solid var(--color-gray-600)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-1) var(--space-2)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {sources.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {/* Enhance with Context button - only show if semantic layer exists */}
            {semanticLayer?.has_semantic_layer && !generating && (
              <button
                onClick={() => setShowEnhanceModal(true)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-gray-600)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-300)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <span style={{ fontSize: '14px' }}>{'\u2728'}</span>
                Enhance with Context
              </button>
            )}
            <button
              onClick={closeSchemaBrowser}
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
        </div>

        {/* Business Context (collapsed by default) */}
        {semanticLayer?.business_context && (
          <BusinessContextSection context={semanticLayer.business_context} />
        )}

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Check if we need to show generate prompt */}
          {!semanticLoading && !generating && semanticLayer && !semanticLayer.has_semantic_layer ? (
            <GenerateSemanticPrompt
              sourceName={selectedSource || ''}
              onGenerate={() => generateSemantic()}
              error={generateError}
            />
          ) : generating ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-8)',
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
                Generating Semantic Layer...
              </h3>
              <p style={{ margin: 0, color: 'var(--color-gray-400)', textAlign: 'center' }}>
                AI is analyzing your database schema and sample data
                <br />
                to generate descriptions, roles, and relationships.
              </p>
            </div>
          ) : (
            <>
              {/* Table list */}
              <div
                style={{
                  width: '200px',
                  borderRight: '1px solid var(--color-gray-700)',
                  overflowY: 'auto',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-gray-500)',
                    textTransform: 'uppercase',
                    fontFamily: 'var(--font-brand)',
                  }}
                >
                  Tables
                </div>
                {semanticLoading ? (
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      textAlign: 'center',
                      color: 'var(--color-gray-500)',
                    }}
                  >
                    Loading...
                  </div>
                ) : semanticError ? (
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      textAlign: 'center',
                      color: 'var(--color-error)',
                    }}
                  >
                    {semanticError}
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {semanticLayer?.tables.map((table) => (
                      <li key={table.name}>
                        <button
                          onClick={() => selectTable(table.name)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: 'var(--space-2) var(--space-3)',
                            background:
                              selectedTable === table.name
                                ? 'var(--color-gray-800)'
                                : 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color:
                              selectedTable === table.name
                                ? 'var(--color-primary)'
                                : 'var(--color-gray-300)',
                            fontSize: 'var(--text-sm)',
                            fontFamily: 'var(--font-brand)',
                          }}
                        >
                          <div>{table.name}</div>
                          <div
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--color-gray-500)',
                            }}
                          >
                            {table.columns.length} columns
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Table details */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)' }}>
                {currentTable ? (
                  <TableDetails
                    table={currentTable}
                    expandedColumn={expandedColumn}
                    setExpandedColumn={setExpandedColumn}
                    onTableFieldChange={(field, value) =>
                      updateTableField(currentTable.name, field, value)
                    }
                    onColumnFieldChange={(colName, field, value) =>
                      updateColumnField(currentTable.name, colName, field, value)
                    }
                  />
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      color: 'var(--color-gray-500)',
                      paddingTop: 'var(--space-8)',
                    }}
                  >
                    Select a table to view details
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer with save/discard */}
        {hasChanges && (
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              borderTop: '1px solid var(--color-gray-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--color-gray-850)',
            }}
          >
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-warning)' }}>
              You have unsaved changes
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {saveError && (
                <span style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>
                  {saveError}
                </span>
              )}
              <button
                onClick={discardChanges}
                disabled={saving}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-gray-400)',
                  border: '1px solid var(--color-gray-600)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                }}
              >
                Discard
              </button>
              <button
                onClick={saveChanges}
                disabled={saving}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Enhance Semantic Modal */}
      <EnhanceSemanticModal
        isOpen={showEnhanceModal}
        onClose={() => setShowEnhanceModal(false)}
        sourceName={selectedSource || ''}
      />
    </div>
  )
}

// Generate semantic layer prompt
function GenerateSemanticPrompt({
  sourceName,
  onGenerate,
  error,
}: {
  sourceName: string
  onGenerate: () => void
  error: string | null
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-gray-800)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--space-4)',
          fontSize: '32px',
        }}
      >
        {'\u2728'}
      </div>
      <h3
        style={{
          margin: '0 0 var(--space-2)',
          fontSize: 'var(--text-xl)',
          fontFamily: 'var(--font-brand)',
          color: 'var(--color-gray-100)',
        }}
      >
        Generate Semantic Layer
      </h3>
      <p
        style={{
          margin: '0 0 var(--space-4)',
          color: 'var(--color-gray-400)',
          maxWidth: '400px',
          lineHeight: 1.5,
        }}
      >
        No semantic layer exists for <strong>{sourceName}</strong> yet.
        <br />
        AI will analyze your database schema and sample data to generate:
      </p>
      <ul
        style={{
          listStyle: 'none',
          margin: '0 0 var(--space-4)',
          padding: 0,
          color: 'var(--color-gray-300)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <li style={{ marginBottom: 'var(--space-1)' }}>
          {'\u2713'} Table and column descriptions
        </li>
        <li style={{ marginBottom: 'var(--space-1)' }}>
          {'\u2713'} Business context and domain identification
        </li>
        <li style={{ marginBottom: 'var(--space-1)' }}>
          {'\u2713'} Column roles (keys, dimensions, measures)
        </li>
        <li style={{ marginBottom: 'var(--space-1)' }}>
          {'\u2713'} Relationships between tables
        </li>
        <li>
          {'\u2713'} Common query patterns
        </li>
      </ul>
      {error && (
        <div
          style={{
            marginBottom: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--color-error)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-error)',
            fontSize: 'var(--text-sm)',
            maxWidth: '400px',
          }}
        >
          {error}
        </div>
      )}
      <button
        onClick={onGenerate}
        style={{
          padding: 'var(--space-3) var(--space-6)',
          backgroundColor: 'var(--color-primary)',
          color: 'white',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          fontSize: 'var(--text-md)',
          fontFamily: 'var(--font-brand)',
          fontWeight: 500,
        }}
      >
        Generate with AI
      </button>
    </div>
  )
}

// Business context section
function BusinessContextSection({
  context,
}: {
  context: NonNullable<import('../../api/client').BusinessContext>
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        borderBottom: '1px solid var(--color-gray-700)',
        backgroundColor: 'var(--color-gray-850)',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-2) var(--space-4)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-gray-400)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <span>
          {context.domain && <strong style={{ color: 'var(--color-primary)' }}>{context.domain}</strong>}
          {' - '}
          {context.description?.slice(0, 80)}
          {(context.description?.length || 0) > 80 && '...'}
        </span>
        <span>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && (
        <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <p style={{ margin: '0 0 var(--space-3)', color: 'var(--color-gray-300)' }}>
            {context.description}
          </p>
          {context.key_metrics && context.key_metrics.length > 0 && (
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <strong style={{ color: 'var(--color-gray-400)', fontSize: 'var(--text-xs)' }}>
                Key Metrics:
              </strong>{' '}
              <span style={{ color: 'var(--color-gray-300)', fontSize: 'var(--text-sm)' }}>
                {context.key_metrics.join(', ')}
              </span>
            </div>
          )}
          {context.key_dimensions && context.key_dimensions.length > 0 && (
            <div>
              <strong style={{ color: 'var(--color-gray-400)', fontSize: 'var(--text-xs)' }}>
                Key Dimensions:
              </strong>{' '}
              <span style={{ color: 'var(--color-gray-300)', fontSize: 'var(--text-sm)' }}>
                {context.key_dimensions.join(', ')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Table details panel
function TableDetails({
  table,
  expandedColumn,
  setExpandedColumn,
  onTableFieldChange,
  onColumnFieldChange,
}: {
  table: TableSemantic
  expandedColumn: string | null
  setExpandedColumn: (col: string | null) => void
  onTableFieldChange: (field: string, value: unknown) => void
  onColumnFieldChange: (colName: string, field: string, value: unknown) => void
}) {
  return (
    <div>
      {/* Table header */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h3
          style={{
            margin: '0 0 var(--space-2)',
            fontSize: 'var(--text-lg)',
            fontFamily: 'var(--font-brand)',
            color: 'var(--color-gray-100)',
          }}
        >
          {table.name}
        </h3>

        {/* Editable description */}
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-gray-500)',
              marginBottom: 'var(--space-1)',
            }}
          >
            Description
          </label>
          <textarea
            value={table.description || ''}
            onChange={(e) => onTableFieldChange('description', e.target.value)}
            placeholder="Describe what this table contains..."
            style={{
              width: '100%',
              minHeight: '60px',
              padding: 'var(--space-2)',
              backgroundColor: 'var(--color-gray-800)',
              color: 'var(--color-gray-200)',
              border: '1px solid var(--color-gray-600)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Editable business role */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-gray-500)',
              marginBottom: 'var(--space-1)',
            }}
          >
            Business Role
          </label>
          <input
            type="text"
            value={table.business_role || ''}
            onChange={(e) => onTableFieldChange('business_role', e.target.value)}
            placeholder="What business purpose does this table serve?"
            style={{
              width: '100%',
              padding: 'var(--space-2)',
              backgroundColor: 'var(--color-gray-800)',
              color: 'var(--color-gray-200)',
              border: '1px solid var(--color-gray-600)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
            }}
          />
        </div>
      </div>

      {/* Columns section */}
      <div>
        <h4
          style={{
            margin: '0 0 var(--space-2)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-brand)',
            color: 'var(--color-gray-400)',
            textTransform: 'uppercase',
          }}
        >
          Columns ({table.columns.length})
        </h4>

        <div
          style={{
            border: '1px solid var(--color-gray-700)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          {table.columns.map((col, idx) => (
            <ColumnRow
              key={col.name}
              column={col}
              isExpanded={expandedColumn === col.name}
              onToggle={() =>
                setExpandedColumn(expandedColumn === col.name ? null : col.name)
              }
              onFieldChange={(field, value) => onColumnFieldChange(col.name, field, value)}
              isLast={idx === table.columns.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Typical questions */}
      {table.typical_questions && table.typical_questions.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <h4
            style={{
              margin: '0 0 var(--space-2)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-brand)',
              color: 'var(--color-gray-400)',
              textTransform: 'uppercase',
            }}
          >
            Typical Questions
          </h4>
          <ul
            style={{
              margin: 0,
              padding: '0 0 0 var(--space-4)',
              color: 'var(--color-gray-300)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {table.typical_questions.map((q, i) => (
              <li key={i} style={{ marginBottom: 'var(--space-1)' }}>
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Column row component
function ColumnRow({
  column,
  isExpanded,
  onToggle,
  onFieldChange,
  isLast,
}: {
  column: ColumnSemantic
  isExpanded: boolean
  onToggle: () => void
  onFieldChange: (field: string, value: unknown) => void
  isLast: boolean
}) {
  return (
    <div
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--color-gray-700)',
      }}
    >
      {/* Column header row */}
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          background: isExpanded ? 'var(--color-gray-800)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--color-gray-500)', fontSize: 'var(--text-xs)' }}>
          {isExpanded ? '\u25BC' : '\u25B6'}
        </span>
        <span
          style={{
            flex: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-gray-200)',
          }}
        >
          {column.name}
        </span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-gray-500)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {column.type}
        </span>
        {column.role && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              padding: '2px 6px',
              backgroundColor: 'var(--color-gray-700)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-gray-300)',
            }}
            title={ROLE_LABELS[column.role] || column.role}
          >
            {ROLE_ICONS[column.role] || ''} {ROLE_LABELS[column.role] || column.role}
          </span>
        )}
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div
          style={{
            padding: 'var(--space-3)',
            paddingLeft: 'var(--space-6)',
            backgroundColor: 'var(--color-gray-850)',
          }}
        >
          {/* Description */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-gray-500)',
                marginBottom: 'var(--space-1)',
              }}
            >
              Description
            </label>
            <input
              type="text"
              value={column.description || ''}
              onChange={(e) => onFieldChange('description', e.target.value)}
              placeholder="What does this column represent?"
              style={{
                width: '100%',
                padding: 'var(--space-2)',
                backgroundColor: 'var(--color-gray-800)',
                color: 'var(--color-gray-200)',
                border: '1px solid var(--color-gray-600)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
              }}
            />
          </div>

          {/* Role */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-gray-500)',
                marginBottom: 'var(--space-1)',
              }}
            >
              Role
            </label>
            <select
              value={column.role || ''}
              onChange={(e) => onFieldChange('role', e.target.value || null)}
              style={{
                padding: 'var(--space-2)',
                backgroundColor: 'var(--color-gray-800)',
                color: 'var(--color-gray-200)',
                border: '1px solid var(--color-gray-600)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
              }}
            >
              <option value="">Not specified</option>
              <option value="primary_key">Primary Key</option>
              <option value="foreign_key">Foreign Key</option>
              <option value="dimension">Dimension</option>
              <option value="measure">Measure</option>
              <option value="date">Date</option>
              <option value="identifier">Identifier</option>
            </select>
          </div>

          {/* Business meaning */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-gray-500)',
                marginBottom: 'var(--space-1)',
              }}
            >
              Business Meaning
            </label>
            <textarea
              value={column.business_meaning || ''}
              onChange={(e) => onFieldChange('business_meaning', e.target.value)}
              placeholder="Explain the business context and possible values..."
              style={{
                width: '100%',
                minHeight: '50px',
                padding: 'var(--space-2)',
                backgroundColor: 'var(--color-gray-800)',
                color: 'var(--color-gray-200)',
                border: '1px solid var(--color-gray-600)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Aggregation hint (for measures) */}
          {(column.role === 'measure' || column.aggregation_hint) && (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-gray-500)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                Aggregation Hint
              </label>
              <select
                value={column.aggregation_hint || ''}
                onChange={(e) => onFieldChange('aggregation_hint', e.target.value || null)}
                style={{
                  padding: 'var(--space-2)',
                  backgroundColor: 'var(--color-gray-800)',
                  color: 'var(--color-gray-200)',
                  border: '1px solid var(--color-gray-600)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <option value="">Not specified</option>
                <option value="SUM">SUM</option>
                <option value="COUNT">COUNT</option>
                <option value="AVG">AVG</option>
                <option value="MIN">MIN</option>
                <option value="MAX">MAX</option>
              </select>
            </div>
          )}

          {/* References (for foreign keys) */}
          {column.references && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-gray-500)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                References
              </label>
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-primary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                \u2192 {column.references}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
