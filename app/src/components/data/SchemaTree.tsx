import { useState } from 'react'

export interface SchemaData {
  name: string
  tables: {
    name: string
    columns: { name: string; type: string }[]
    row_count: number | null
  }[]
}

export interface SchemaTreeProps {
  schemas: SchemaData[]
  onSelectTable: (schema: string, table: string) => void
  onInsertColumn: (schema: string, table: string, column: string) => void
  loading?: boolean
}

export function SchemaTree({ schemas, onSelectTable, onInsertColumn, loading }: SchemaTreeProps) {
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set())
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

  const toggleSchema = (name: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleTable = (key: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-muted" style={{ padding: '16px' }}>
        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-[13px]">Loading schemas...</span>
      </div>
    )
  }

  if (schemas.length === 0) {
    return (
      <div className="text-[13px] text-text-muted" style={{ padding: '16px' }}>
        No schemas found
      </div>
    )
  }

  return (
    <div className="text-[13px]">
      {schemas.map((schema) => {
        const isSchemaExpanded = expandedSchemas.has(schema.name)
        return (
          <div key={schema.name}>
            {/* Schema row */}
            <button
              onClick={() => toggleSchema(schema.name)}
              className="w-full flex items-center gap-1.5 text-left hover:bg-surface-secondary transition-colors text-text-primary font-medium"
              style={{ padding: '6px 12px' }}
            >
              <svg
                className="h-3.5 w-3.5 text-text-icon shrink-0 transition-transform"
                style={{ transform: isSchemaExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span>{schema.name}</span>
            </button>

            {/* Tables */}
            {isSchemaExpanded && (
              <div>
                {schema.tables.map((table) => {
                  const tableKey = `${schema.name}.${table.name}`
                  const isTableExpanded = expandedTables.has(tableKey)
                  return (
                    <div key={table.name}>
                      {/* Table row */}
                      <div
                        className="flex items-center gap-1.5 hover:bg-surface-secondary transition-colors"
                        style={{ paddingLeft: '28px', paddingRight: '12px', paddingTop: '4px', paddingBottom: '4px' }}
                      >
                        <button
                          onClick={() => toggleTable(tableKey)}
                          className="shrink-0 text-text-icon hover:text-text-primary"
                        >
                          <svg
                            className="h-3 w-3 transition-transform"
                            style={{ transform: isTableExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => onSelectTable(schema.name, table.name)}
                          className="flex items-center gap-2 text-left text-text-primary hover:text-blue-500 transition-colors min-w-0"
                        >
                          <span className="truncate">{table.name}</span>
                          {table.row_count != null && (
                            <span className="shrink-0 text-[11px] text-text-muted bg-surface-inset rounded px-1.5 py-0.5">
                              {table.row_count.toLocaleString()}
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Columns */}
                      {isTableExpanded && (
                        <div>
                          {table.columns.map((col) => (
                            <button
                              key={col.name}
                              onClick={() => onInsertColumn(schema.name, table.name, col.name)}
                              className="w-full flex items-center gap-2 text-left hover:bg-surface-secondary transition-colors text-text-secondary hover:text-text-primary"
                              style={{ paddingLeft: '52px', paddingRight: '12px', paddingTop: '3px', paddingBottom: '3px' }}
                            >
                              <span className="truncate">{col.name}</span>
                              <span className="shrink-0 text-[11px] text-text-muted font-mono">
                                {col.type}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
