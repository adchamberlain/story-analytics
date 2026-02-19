import { useState, useEffect } from 'react'

type Step = 'closed' | 'pick' | 'form' | 'tables' | 'syncing'
type DbType = 'snowflake' | 'postgres' | 'bigquery'

interface SavedConnection {
  connection_id: string
  name: string
  db_type: string
  config: Record<string, string>
  created_at: string
}

export interface SyncedColumnInfo {
  name: string
  type: string
  nullable: boolean
  sample_values: string[]
  null_count: number
  distinct_count: number
  min_value: string | null
  max_value: string | null
}

export interface SyncedInfo {
  sourceId: string
  tableName: string
  rowCount: number
  columns: SyncedColumnInfo[]
}

interface DatabaseConnectorProps {
  onSynced: (info: SyncedInfo) => void
}

const DB_LABELS: Record<DbType, string> = {
  snowflake: 'Snowflake',
  postgres: 'PostgreSQL',
  bigquery: 'BigQuery',
}

export function DatabaseConnector({ onSynced }: DatabaseConnectorProps) {
  const [step, setStep] = useState<Step>('closed')
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([])
  const [loadingConnections, setLoadingConnections] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form fields — shared
  const [dbType, setDbType] = useState<DbType>('postgres')
  const [name, setName] = useState('')

  // Snowflake-specific
  const [account, setAccount] = useState('')
  const [warehouse, setWarehouse] = useState('')

  // Shared fields (different names per DB)
  const [host, setHost] = useState('')
  const [port, setPort] = useState('5432')
  const [database, setDatabase] = useState('')
  const [schema, setSchema] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // BigQuery-specific
  const [projectId, setProjectId] = useState('')
  const [dataset, setDataset] = useState('')
  const [serviceAccountJson, setServiceAccountJson] = useState('')

  // Test / tables state
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)

  // Fetch saved connections
  useEffect(() => {
    if (step === 'pick') {
      setLoadingConnections(true)
      setError(null)
      fetch('/api/connections/')
        .then((res) => {
          if (!res.ok) throw new Error(`Connections fetch failed: ${res.status}`)
          return res.json()
        })
        .then((data: SavedConnection[]) => {
          setSavedConnections(data)
          setLoadingConnections(false)
        })
        .catch((err) => {
          setError(`Failed to load connections: ${err.message}`)
          setLoadingConnections(false)
        })
    }
  }, [step])

  const resetForm = () => {
    setName('')
    setAccount('')
    setWarehouse('')
    setHost('')
    setPort('5432')
    setDatabase('')
    setSchema('')
    setUsername('')
    setPassword('')
    setProjectId('')
    setDataset('')
    setServiceAccountJson('')
    setError(null)
    setTestMessage(null)
    setTables([])
    setSelectedTable(null)
    setActiveConnectionId(null)
    setTesting(false)
  }

  const handleOpen = () => { resetForm(); setStep('pick') }
  const handleClose = () => { resetForm(); setStep('closed') }
  const handleNewConnection = () => { setError(null); setTestMessage(null); setStep('form') }

  // Build config object based on selected DB type
  const buildConfig = (): Record<string, string> => {
    switch (dbType) {
      case 'snowflake':
        return { account: account.trim(), warehouse: warehouse.trim(), database: database.trim(), schema: schema.trim() }
      case 'postgres':
        return { host: host.trim(), port: port.trim(), database: database.trim(), schema: schema.trim() || 'public' }
      case 'bigquery':
        return { project_id: projectId.trim(), dataset: dataset.trim() }
    }
  }

  // Build credentials for test/sync requests
  const buildCredentials = (): Record<string, string> => {
    switch (dbType) {
      case 'snowflake':
        return { ...(username ? { username } : {}), ...(password ? { password } : {}) }
      case 'postgres':
        return { username, password }
      case 'bigquery':
        return { service_account_json: serviceAccountJson }
    }
  }

  const handleSelectSaved = async (conn: SavedConnection) => {
    setActiveConnectionId(conn.connection_id)
    setDbType(conn.db_type as DbType)
    setError(null)
    setTesting(true)
    setTestMessage(null)

    try {
      // Send empty credentials — server merges with saved config and env vars
      const res = await fetch(`/api/connections/${conn.connection_id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: {}, username: null }),
      })
      const data = await res.json()

      if (!res.ok) { setError(data.detail || 'Test failed'); return }
      if (data.success) {
        setTestMessage(data.message)
        setTables(data.tables || [])
        setSelectedTable(null)
        setStep('tables')
      } else {
        setError(data.message)
      }
    } catch (err: unknown) {
      setError(`Connection test failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      setTesting(false)
    }
  }

  const validateForm = (): boolean => {
    if (!name.trim()) { setError('Connection name is required.'); return false }
    switch (dbType) {
      case 'snowflake':
        if (!account.trim() || !database.trim() || !schema.trim()) { setError('Account, Database, and Schema are required.'); return false }
        break
      case 'postgres':
        if (!host.trim() || !database.trim() || !username.trim() || !password.trim()) { setError('Host, Database, Username, and Password are required.'); return false }
        break
      case 'bigquery':
        if (!projectId.trim() || !dataset.trim() || !serviceAccountJson.trim()) { setError('Project ID, Dataset, and Service Account JSON are required.'); return false }
        break
    }
    return true
  }

  const handleTestConnection = async () => {
    if (!validateForm()) return

    setError(null)
    setTesting(true)
    setTestMessage(null)

    try {
      let connectionId = activeConnectionId

      if (!connectionId) {
        const createRes = await fetch('/api/connections/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), db_type: dbType, config: buildConfig() }),
        })
        const createData = await createRes.json()
        if (!createRes.ok) { setError(createData.detail || 'Failed to save connection'); return }
        connectionId = createData.connection_id
        setActiveConnectionId(connectionId)
      }

      const testRes = await fetch(`/api/connections/${connectionId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: buildCredentials(), username: username || null }),
      })
      const testData = await testRes.json()
      if (!testRes.ok) { setError(testData.detail || 'Test failed'); return }

      if (testData.success) {
        setTestMessage(testData.message)
        setTables(testData.tables || [])
        setSelectedTable(null)
        setStep('tables')
      } else {
        setError(testData.message)
      }
    } catch (err: unknown) {
      setError(`Connection test failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      setTesting(false)
    }
  }

  const handleSync = async () => {
    if (!activeConnectionId || !selectedTable) return
    setStep('syncing')
    setError(null)

    try {
      const res = await fetch(`/api/connections/${activeConnectionId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: [selectedTable], credentials: buildCredentials(), username: username || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Sync failed'); setStep('tables'); return }

      // The sync response contains synced_sources: [{ source_id, table_name, row_count }]
      // Fetch full schema for the synced source to get column metadata
      const synced = data.synced_sources?.[0]
      if (!synced) { setError('Sync completed but no source returned'); setStep('tables'); return }

      const schemaRes = await fetch(`/api/data/schema/${synced.source_id}`)
      if (!schemaRes.ok) { setError('Failed to fetch schema after sync'); setStep('tables'); return }
      const schemaData = await schemaRes.json()

      onSynced({
        sourceId: synced.source_id,
        tableName: selectedTable,
        rowCount: schemaData.row_count,
        columns: schemaData.columns,
      })
      resetForm()
      setStep('closed')
    } catch (err: unknown) {
      setError(`Sync failed: ${err instanceof Error ? err.message : err}`)
      setStep('tables')
    }
  }

  // ── Closed state ──────────────────────────────────────────────────────────
  if (step === 'closed') {
    return (
      <button
        onClick={handleOpen}
        className="w-full border-2 border-dashed border-border-strong rounded-2xl text-center cursor-pointer hover:border-text-icon transition-colors bg-surface"
        style={{ padding: '40px 32px' }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.04)' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
      >
        <svg style={{ width: '40px', height: '40px', margin: '0 auto 16px auto', display: 'block' }} className="text-text-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
        <p style={{ fontSize: '15px', fontWeight: 500 }} className="text-text-primary">Connect to Database</p>
        <p style={{ fontSize: '13px', marginTop: '6px' }} className="text-text-muted">PostgreSQL, Snowflake, or BigQuery</p>
      </button>
    )
  }

  // ── Pick saved connection ─────────────────────────────────────────────────
  if (step === 'pick') {
    return (
      <div className="rounded-2xl border border-border-default bg-surface-raised overflow-hidden">
        <div
          className="border-b border-border-default flex items-center justify-between"
          style={{ padding: '20px 28px' }}
        >
          <h3 className="text-[17px] font-semibold text-text-primary">Connect to Database</h3>
          <button
            onClick={handleClose}
            className="flex items-center justify-center rounded-lg text-text-icon hover:text-text-primary hover:bg-surface-secondary transition-colors"
            style={{ width: '36px', height: '36px' }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loadingConnections ? (
            <div className="flex items-center justify-center" style={{ padding: '32px 0' }}>
              <Spinner className="h-6 w-6 text-blue-500" />
            </div>
          ) : (
            <>
              {savedConnections.map((conn) => (
                <button
                  key={conn.connection_id}
                  onClick={() => handleSelectSaved(conn)}
                  disabled={testing}
                  className="w-full text-left rounded-xl border border-border-default hover:border-blue-400 transition-all flex items-center justify-between disabled:opacity-50"
                  style={{ padding: '16px 20px' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                >
                  <div>
                    <p className="text-[15px] font-medium text-text-primary">
                      {conn.name}
                    </p>
                    <p className="text-[13px] text-text-muted" style={{ marginTop: '2px' }}>
                      {DB_LABELS[conn.db_type as DbType] ?? conn.db_type} · {conn.db_type === 'bigquery'
                        ? `${conn.config.project_id}.${conn.config.dataset}`
                        : `${conn.config.database}${conn.config.schema ? '.' + conn.config.schema : ''}`
                      }
                    </p>
                  </div>
                  <span className="text-[13px] font-medium shrink-0" style={{ color: '#3b82f6', marginLeft: '16px' }}>
                    {testing && activeConnectionId === conn.connection_id ? 'Testing...' : 'Connect'}
                  </span>
                </button>
              ))}
              <button
                onClick={handleNewConnection}
                className="w-full rounded-xl border-2 border-dashed border-border-strong hover:border-text-icon transition-colors text-[15px] text-text-muted text-center"
                style={{ padding: '16px 20px' }}
              >
                + New Connection
              </button>
            </>
          )}
          {error && <p className="text-[14px]" style={{ color: '#ef4444' }}>{error}</p>}
        </div>
      </div>
    )
  }

  // ── New connection form ───────────────────────────────────────────────────
  if (step === 'form') {
    return (
      <div className="rounded-2xl border border-border-default bg-surface-raised overflow-hidden">
        <div
          className="border-b border-border-default flex items-center justify-between"
          style={{ padding: '20px 28px' }}
        >
          <h3 className="text-[17px] font-semibold text-text-primary">New Connection</h3>
          <button
            onClick={handleClose}
            className="flex items-center justify-center rounded-lg text-text-icon hover:text-text-primary hover:bg-surface-secondary transition-colors"
            style={{ width: '36px', height: '36px' }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Database Type Tabs */}
          <div className="flex bg-surface-inset rounded-xl" style={{ padding: '4px', gap: '4px' }}>
            {(['postgres', 'snowflake', 'bigquery'] as DbType[]).map((t) => (
              <button
                key={t}
                onClick={() => setDbType(t)}
                className={`flex-1 text-[14px] font-medium rounded-lg transition-colors ${
                  dbType === t
                    ? 'bg-surface-raised text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-on-surface'
                }`}
                style={{ padding: '10px 16px' }}
              >
                {DB_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Connection Name */}
          <FormField label="Connection Name" value={name} onChange={setName} placeholder="My Analytics DB" />

          {/* Dynamic fields per DB type */}
          {dbType === 'snowflake' && (
            <div className="grid grid-cols-2" style={{ gap: '16px' }}>
              <FormField label="Account" value={account} onChange={setAccount} placeholder="abc12345.us-east-1" />
              <FormField label="Warehouse" value={warehouse} onChange={setWarehouse} placeholder="COMPUTE_WH" />
              <FormField label="Database" value={database} onChange={setDatabase} placeholder="ANALYTICS_POC" />
              <FormField label="Schema" value={schema} onChange={setSchema} placeholder="SAAS_DEMO" />
              <div className="col-span-2 border-t border-border-subtle" style={{ paddingTop: '16px' }}>
                <p className="text-[13px] text-text-muted" style={{ marginBottom: '12px' }}>Username falls back to .env if blank.</p>
                <FormField label="Username (optional)" value={username} onChange={setUsername} placeholder="From .env if blank" />
              </div>
            </div>
          )}

          {dbType === 'postgres' && (
            <div className="grid grid-cols-2" style={{ gap: '16px' }}>
              <FormField label="Host" value={host} onChange={setHost} placeholder="localhost" />
              <FormField label="Port" value={port} onChange={setPort} placeholder="5432" />
              <FormField label="Database" value={database} onChange={setDatabase} placeholder="mydb" />
              <FormField label="Schema" value={schema} onChange={setSchema} placeholder="public" />
              <FormField label="Username" value={username} onChange={setUsername} placeholder="postgres" />
              <FormField label="Password" value={password} onChange={setPassword} placeholder="" type="password" />
            </div>
          )}

          {dbType === 'bigquery' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="grid grid-cols-2" style={{ gap: '16px' }}>
                <FormField label="Project ID" value={projectId} onChange={setProjectId} placeholder="my-gcp-project" />
                <FormField label="Dataset" value={dataset} onChange={setDataset} placeholder="analytics" />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '6px' }}>Service Account JSON</label>
                <textarea
                  value={serviceAccountJson}
                  onChange={(e) => setServiceAccountJson(e.target.value)}
                  placeholder='Paste service account JSON key...'
                  rows={4}
                  className="w-full text-[14px] font-mono border border-border-default rounded-xl bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y transition-colors"
                  style={{ padding: '12px 16px' }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-[14px]" style={{ color: '#ef4444' }}>{error}</p>}

          <div className="flex items-center" style={{ gap: '12px', paddingTop: '4px' }}>
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="text-[14px] rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
              style={{ padding: '10px 24px' }}
            >
              {testing && <Spinner />}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={() => setStep('pick')}
              className="text-[14px] text-text-muted hover:text-text-primary transition-colors font-medium"
              style={{ padding: '10px 16px' }}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Table picker (single select) ───────────────────────────────────────────
  if (step === 'tables') {
    return (
      <div className="rounded-2xl border border-border-default bg-surface-raised overflow-hidden">
        <div
          className="border-b border-border-default flex items-center justify-between"
          style={{ padding: '20px 28px' }}
        >
          <h3 className="text-[17px] font-semibold text-text-primary">Choose a Table</h3>
          <button
            onClick={handleClose}
            className="flex items-center justify-center rounded-lg text-text-icon hover:text-text-primary hover:bg-surface-secondary transition-colors"
            style={{ width: '36px', height: '36px' }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {testMessage && (
            <div className="rounded-xl" style={{ padding: '14px 18px', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <p className="text-[14px]" style={{ color: '#22c55e' }}>{testMessage}</p>
            </div>
          )}
          <p className="text-[13px] text-text-muted">{tables.length} table{tables.length !== 1 ? 's' : ''} available</p>
          <div className="overflow-y-auto border border-border-default rounded-xl divide-y divide-border-subtle" style={{ maxHeight: '280px' }}>
            {tables.map((table) => (
              <label
                key={table}
                className="flex items-center cursor-pointer hover:bg-surface-secondary transition-colors"
                style={{ gap: '14px', padding: '14px 20px' }}
              >
                <input
                  type="radio"
                  name="table-select"
                  checked={selectedTable === table}
                  onChange={() => setSelectedTable(table)}
                  className="border-border-strong text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[15px] text-text-primary">{table}</span>
              </label>
            ))}
          </div>
          {error && <p className="text-[14px]" style={{ color: '#ef4444' }}>{error}</p>}
          <div className="flex items-center" style={{ gap: '12px', paddingTop: '4px' }}>
            <button
              onClick={handleSync}
              disabled={!selectedTable}
              className="text-[14px] rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
              style={{ padding: '10px 24px' }}
            >
              Import Table
            </button>
            <button
              onClick={handleClose}
              className="text-[14px] text-text-muted hover:text-text-primary transition-colors font-medium"
              style={{ padding: '10px 16px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Syncing state ─────────────────────────────────────────────────────────
  if (step === 'syncing') {
    return (
      <div className="rounded-2xl border border-border-default bg-surface-raised text-center" style={{ padding: '48px 32px' }}>
        <Spinner className="h-8 w-8 mx-auto text-blue-500" />
        <p className="text-[15px] font-medium text-text-primary" style={{ marginTop: '16px' }}>Importing table...</p>
        <p className="text-[13px] text-text-muted" style={{ marginTop: '6px' }}>This may take a moment</p>
      </div>
    )
  }

  return null
}

// ── Helper Components ───────────────────────────────────────────────────────

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '6px' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-[15px] border border-border-default rounded-xl bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
        style={{ padding: '11px 16px' }}
      />
    </div>
  )
}

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
