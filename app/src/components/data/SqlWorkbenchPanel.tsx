import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { SchemaTree, SchemaData } from './SchemaTree'
import { SqlEditor, SqlEditorRef } from './SqlEditor'
import { AiSqlAssistant } from './AiSqlAssistant'
import { QueryResults, QueryResultData } from './QueryResults'
import { authFetch } from '../../utils/authFetch'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SqlWorkbenchPanelProps {
  connectionId: string | null // null = panel closed
  connectionName: string
  dbType: string // "snowflake" | "postgres" | "bigquery"
  onClose: () => void
  initialSql?: string // Pre-populate the editor (e.g. "SELECT * FROM table LIMIT 100")
  onImportSource?: (sourceId: string, rowCount: number) => void // Import mode: sync query result as source
}

const TYPE_BADGES: Record<string, string> = {
  csv: 'bg-emerald-500/15 text-emerald-500',
  snowflake: 'bg-sky-500/15 text-sky-400',
  postgres: 'bg-blue-500/15 text-blue-400',
  bigquery: 'bg-amber-500/15 text-amber-500',
}

/** Derive a friendly source name from a SQL query by extracting the main table name. */
function deriveSourceName(sql: string): string {
  // Match first table name after FROM, ignoring schema/db prefixes like db.schema.table
  const match = sql.match(/\bFROM\s+(?:[\w"]+\.)*"?(\w+)"?/i)
  return match ? match[1] : 'SQL Query Result'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SqlWorkbenchPanel({
  connectionId,
  connectionName,
  dbType,
  onClose,
  initialSql,
  onImportSource,
}: SqlWorkbenchPanelProps) {
  const navigate = useNavigate()
  const editorRef = useRef<SqlEditorRef>(null)
  const [importLoading, setImportLoading] = useState(false)

  // Schema state
  const [schemas, setSchemas] = useState<SchemaData[]>([])
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)

  // Query state
  const [queryResult, setQueryResult] = useState<QueryResultData | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [queryLoading, setQueryLoading] = useState(false)

  // Editor / AI state
  const [currentSql, setCurrentSql] = useState('')
  const [aiConfigured, setAiConfigured] = useState(true)
  const [aiProvider, setAiProvider] = useState<string | null>(null)
  const [autoExpandWithError, setAutoExpandWithError] = useState(false)
  const [fixErrorTrigger, setFixErrorTrigger] = useState(0)

  // Panel open/close animation — keep panel mounted during slide-out
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)

  // ---------- Build auto-complete map from schemas ----------
  const schemaCompletions = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const s of schemas) {
      for (const t of s.tables) {
        const cols = t.columns.map((c) => c.name)
        if (dbType === 'csv') {
          // CSV: use bare DuckDB table name (src_xxx), no schema prefix
          map[t.name] = cols
        } else {
          map[`${s.name}.${t.name}`] = cols
        }
      }
    }
    return map
  }, [schemas, dbType])

  // ---------- Build schema context string for AI ----------
  const schemaContext = useMemo(() => {
    return schemas
      .flatMap((s) =>
        s.tables.map(
          (t) =>
            `Schema ${s.name}: Table ${t.name} (${t.columns.map((c) => `${c.name} ${c.type}`).join(', ')})`,
        ),
      )
      .join('\n')
  }, [schemas])

  // ---------- Fetch schema ----------
  const fetchSchema = useCallback(async () => {
    if (!connectionId) return
    setSchemaLoading(true)
    setSchemaError(null)
    try {
      let schemasResult: SchemaData[]

      if (dbType === 'csv') {
        // CSV sources: fetch schema from DuckDB data endpoint
        const res = await authFetch(`/api/data/schema/${connectionId}`)
        if (res.ok) {
          const data = await res.json()
          // Transform CSV schema into SchemaData[] format
          const tableName = `src_${connectionId}`
          schemasResult = [{
            name: data.filename ?? 'uploaded_data',
            tables: [{
              name: tableName,
              columns: (data.columns ?? []).map((c: { name: string; type: string }) => ({
                name: c.name,
                type: c.type,
              })),
              row_count: data.row_count ?? null,
            }],
          }]
        } else {
          const errData = await res.json().catch(() => null)
          setSchemaError(errData?.detail ?? `Schema fetch failed (${res.status})`)
          setSchemaLoading(false)
          return
        }
      } else {
        // External DB connections: fetch schema from connections endpoint
        const res = await authFetch(`/api/connections/${connectionId}/schema`, {
          method: 'POST',
        })
        if (res.ok) {
          const data = await res.json()
          schemasResult = data.schemas ?? data ?? []
        } else {
          const errData = await res.json().catch(() => null)
          setSchemaError(errData?.detail ?? `Schema fetch failed (${res.status})`)
          setSchemaLoading(false)
          return
        }
      }

      setSchemas(schemasResult)
    } catch {
      setSchemaError('Network error fetching schema')
    } finally {
      setSchemaLoading(false)
    }
  }, [connectionId, dbType])

  // ---------- Check AI configuration ----------
  const checkAiConfig = useCallback(async () => {
    try {
      const res = await authFetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        setAiConfigured(!!data.ai_provider)
        setAiProvider(data.ai_provider || null)
      }
    } catch {
      // Settings not available; default to configured
    }
  }, [])

  // ---------- On mount / connectionId change ----------
  useEffect(() => {
    if (connectionId) {
      // Reset state
      setSchemas([])
      setSchemaError(null)
      setQueryResult(null)
      setQueryError(null)
      setCurrentSql(initialSql || '')
      setAutoExpandWithError(false)
      setImportLoading(false)

      // Fetch data
      fetchSchema()
      checkAiConfig()

      // Pre-populate and run initial SQL if provided (delayed to allow editor mount)
      if (initialSql) {
        setTimeout(() => {
          editorRef.current?.setValue(initialSql)
          runQuery(initialSql)
        }, 100)
      }

      // Mount immediately, then trigger slide-in animation
      setMounted(true)
      requestAnimationFrame(() => setVisible(true))
    } else {
      // Slide out first, then unmount after transition
      setVisible(false)
    }
  }, [connectionId, fetchSchema, checkAiConfig])

  // ---------- Escape key to close ----------
  useEffect(() => {
    if (!connectionId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [connectionId, onClose])

  // ---------- Run query ----------
  const runQuery = useCallback(
    async (sqlToRun?: string) => {
      if (!connectionId) return
      const sqlText = sqlToRun ?? currentSql
      if (!sqlText.trim()) return

      setQueryLoading(true)
      setQueryError(null)
      setAutoExpandWithError(false)

      const startMs = performance.now()

      try {
        if (dbType === 'csv') {
          // CSV sources: query DuckDB directly
          const res = await authFetch('/api/data/query-raw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: sqlText }),
          })
          if (res.ok) {
            const data = await res.json()
            if (data.success) {
              // Transform dict rows to array rows for QueryResultData
              const rows = (data.rows ?? []).map((row: Record<string, unknown>) =>
                data.columns.map((col: string) => row[col] ?? null),
              )
              setQueryResult({
                columns: data.columns ?? [],
                column_types: data.column_types ?? [],
                rows,
                row_count: data.row_count ?? rows.length,
                truncated: data.row_count >= 10000,
                execution_time_ms: Math.round(performance.now() - startMs),
              })
              setQueryError(null)
            } else {
              setQueryError(data.error ?? 'Query failed')
              setQueryResult(null)
            }
          } else {
            const errData = await res.json().catch(() => null)
            setQueryError(errData?.detail ?? `Query failed (${res.status})`)
            setQueryResult(null)
          }
        } else {
          // External DB connections
          const res = await authFetch(`/api/connections/${connectionId}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: sqlText }),
          })
          if (res.ok) {
            const data = await res.json()
            setQueryResult(data)
            setQueryError(null)
          } else {
            const errData = await res.json().catch(() => null)
            setQueryError(errData?.detail ?? `Query failed (${res.status})`)
            setQueryResult(null)
          }
        }
      } catch {
        setQueryError('Network error running query')
        setQueryResult(null)
      } finally {
        setQueryLoading(false)
      }
    },
    [connectionId, currentSql, dbType],
  )

  // ---------- Schema tree interactions ----------
  const handleSelectTable = useCallback(
    (schema: string, table: string) => {
      // CSV sources: table is already the DuckDB table name (src_xxx), no schema prefix
      const sql = dbType === 'csv'
        ? `SELECT * FROM ${table} LIMIT 10`
        : `SELECT * FROM ${schema}.${table} LIMIT 10`
      setCurrentSql(sql)
      editorRef.current?.setValue(sql)
      runQuery(sql)
    },
    [runQuery, dbType],
  )

  const handleInsertColumn = useCallback(
    (_schema: string, _table: string, column: string) => {
      editorRef.current?.insertAtCursor(`"${column}"`)
    },
    [],
  )

  // ---------- AI assistant: insert SQL ----------
  const handleAiInsertSql = useCallback((sql: string) => {
    editorRef.current?.setValue(sql)
    setCurrentSql(sql)
  }, [])

  // ---------- "Fix with AI" ----------
  const handleFixWithAi = useCallback(() => {
    setAutoExpandWithError(true)
    setFixErrorTrigger((n) => n + 1)
  }, [])

  // ---------- "Import as Source" (import mode) ----------
  const handleImportSource = useCallback(async () => {
    if (!connectionId || !currentSql.trim() || !onImportSource) return
    setImportLoading(true)

    try {
      const res = await authFetch(`/api/connections/${connectionId}/sync-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: currentSql, source_name: deriveSourceName(currentSql) }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.source_id) {
          onImportSource(data.source_id, data.row_count)
          onClose()
        }
      }
    } catch {
      // sync-query failed
    } finally {
      setImportLoading(false)
    }
  }, [connectionId, currentSql, onImportSource, onClose])

  // ---------- "Chart this" ----------
  const handleChartThis = useCallback(async () => {
    if (!connectionId || !currentSql.trim()) return

    if (dbType === 'csv') {
      // CSV data is already in DuckDB — navigate directly
      navigate(`/editor/new?sourceId=${connectionId}`)
      return
    }

    try {
      const res = await authFetch(`/api/connections/${connectionId}/sync-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: currentSql, source_name: deriveSourceName(currentSql) }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.source_id) {
          navigate(`/editor/new?sourceId=${data.source_id}`)
        }
      }
    } catch {
      // sync-query not yet available
    }
  }, [connectionId, currentSql, navigate, dbType])

  // ---------- Render nothing when fully closed ----------
  if (!mounted) return null

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="workbench-backdrop"
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-[60%] max-w-[1200px] min-w-[480px] flex flex-col bg-surface border-l border-border-default shadow-2xl transition-transform duration-300 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
        onTransitionEnd={() => {
          if (!visible) setMounted(false)
        }}
      >
        {/* ---- Header ---- */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border-default bg-surface-secondary shrink-0">
          {/* DB type badge */}
          <span
            className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium uppercase ${
              TYPE_BADGES[dbType] ?? 'bg-gray-500/15 text-gray-400'
            }`}
          >
            {dbType}
          </span>

          {/* Connection name */}
          <h2 className="text-sm font-semibold text-text-primary truncate flex-1">
            {connectionName}
          </h2>

          {/* Refresh schema button */}
          <button
            onClick={fetchSchema}
            title="Refresh schema"
            className="p-1.5 rounded hover:bg-surface-inset text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114.4-4.8M20 15a8 8 0 01-14.4 4.8" />
            </svg>
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            title="Close"
            className="p-1.5 rounded hover:bg-surface-inset text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ---- Scrollable body ---- */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-5">
          {/* Schema tree */}
          <div className="border border-border-default rounded-lg overflow-hidden max-h-[240px] overflow-y-auto bg-surface">
            <div className="px-3 py-2 border-b border-border-default bg-surface-secondary text-xs font-semibold text-text-muted uppercase tracking-wider">
              Schema
            </div>
            {schemaError ? (
              <div className="px-3 py-3 text-[13px] text-red-400">{schemaError}</div>
            ) : (
              <SchemaTree
                schemas={schemas}
                loading={schemaLoading}
                onSelectTable={handleSelectTable}
                onInsertColumn={handleInsertColumn}
              />
            )}
          </div>

          {/* SQL Editor */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                SQL Editor
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-muted">
                  {'\u2318'}+Enter to run
                </span>
                <button
                  onClick={() => runQuery()}
                  disabled={queryLoading || !currentSql.trim()}
                  className="px-3 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                >
                  Run
                </button>
              </div>
            </div>
            <div className="border border-border-default rounded-lg overflow-hidden">
              <SqlEditor
                ref={editorRef}
                schema={schemaCompletions}
                placeholder="Write SQL... (Cmd+Enter to run)"
                onRun={(sql) => {
                  setCurrentSql(sql)
                  runQuery(sql)
                }}
                onChange={setCurrentSql}
              />
            </div>
          </div>

          {/* Query Results */}
          <QueryResults
            data={queryResult}
            error={queryError}
            loading={queryLoading}
            onChartThis={onImportSource ? handleImportSource : handleChartThis}
            onFixWithAi={handleFixWithAi}
            actionLabel={onImportSource ? 'Import as Source' : undefined}
            actionLoading={importLoading}
          />

          {/* AI SQL Assistant */}
          <AiSqlAssistant
            dialect={dbType === 'csv' ? 'duckdb' : dbType}
            schemaContext={schemaContext}
            currentSql={currentSql}
            errorMessage={queryError}
            onInsertSql={handleAiInsertSql}
            aiConfigured={aiConfigured}
            aiProvider={aiProvider}
            autoExpandWithError={autoExpandWithError}
            fixErrorTrigger={fixErrorTrigger}
          />
        </div>
      </div>
    </>
  )
}
