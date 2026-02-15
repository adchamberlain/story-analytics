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

interface DatabaseConnectorProps {
  onSynced: () => void
}

const DB_LABELS: Record<DbType, string> = {
  snowflake: 'Snowflake',
  postgres: 'PostgreSQL',
  bigquery: 'BigQuery',
}

const DB_ICONS: Record<DbType, string> = {
  snowflake: '\u2744', // snowflake
  postgres: '\u{1F418}', // elephant
  bigquery: '\u{1F50D}', // magnifying glass
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
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set())
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)

  // Fetch saved connections
  useEffect(() => {
    if (step === 'pick') {
      setLoadingConnections(true)
      setError(null)
      fetch('/api/connections/')
        .then((res) => res.json())
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
    setSelectedTables(new Set())
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
    setError(null)
    setTesting(true)
    setTestMessage(null)

    try {
      const res = await fetch(`/api/connections/${conn.connection_id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: buildCredentials(), username: username || null }),
      })
      const data = await res.json()

      if (!res.ok) { setError(data.detail || 'Test failed'); return }
      if (data.success) {
        setTestMessage(data.message)
        setTables(data.tables || [])
        setSelectedTables(new Set(data.tables || []))
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
        setSelectedTables(new Set(testData.tables || []))
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

  const handleToggleTable = (table: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev)
      if (next.has(table)) next.delete(table)
      else next.add(table)
      return next
    })
  }

  const handleToggleAll = () => {
    setSelectedTables(selectedTables.size === tables.length ? new Set() : new Set(tables))
  }

  const handleSync = async () => {
    if (!activeConnectionId || selectedTables.size === 0) return
    setStep('syncing')
    setError(null)

    try {
      const res = await fetch(`/api/connections/${activeConnectionId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: Array.from(selectedTables), credentials: buildCredentials(), username: username || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Sync failed'); setStep('tables'); return }
      onSynced()
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
        className="w-full border-2 border-dashed border-border-strong rounded-xl p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors bg-surface"
      >
        <svg className="h-10 w-10 mx-auto text-text-icon mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
        <p className="text-sm font-medium text-text-primary">Connect to Database</p>
        <p className="text-xs mt-1 text-text-muted">PostgreSQL, Snowflake, or BigQuery</p>
      </button>
    )
  }

  // ── Pick saved connection ─────────────────────────────────────────────────
  if (step === 'pick') {
    return (
      <div className="rounded-lg border border-border-default bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Connect to Database</h3>
          <button onClick={handleClose} className="text-xs text-text-icon hover:text-text-icon-hover">&times; Close</button>
        </div>
        <div className="p-5 space-y-3">
          {loadingConnections ? (
            <p className="text-sm text-text-muted text-center py-4">Loading saved connections...</p>
          ) : (
            <>
              {savedConnections.map((conn) => (
                <button
                  key={conn.connection_id}
                  onClick={() => handleSelectSaved(conn)}
                  disabled={testing}
                  className="w-full text-left px-4 py-3 rounded-lg border border-border-default hover:border-blue-300 hover:bg-blue-50 transition-colors flex items-center justify-between disabled:opacity-50"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      <span className="mr-1.5">{DB_ICONS[conn.db_type as DbType] ?? ''}</span>
                      {conn.name}
                    </p>
                    <p className="text-xs mt-0.5 text-text-muted">
                      {conn.db_type === 'bigquery'
                        ? `${conn.config.project_id}.${conn.config.dataset}`
                        : `${conn.config.database}${conn.config.schema ? '.' + conn.config.schema : ''}`
                      }
                    </p>
                  </div>
                  <span className="text-xs text-blue-600 font-medium shrink-0 ml-3">
                    {testing && activeConnectionId === conn.connection_id ? 'Testing...' : 'Connect'}
                  </span>
                </button>
              ))}
              <button
                onClick={handleNewConnection}
                className="w-full px-4 py-3 rounded-lg border border-dashed border-border-strong hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm text-text-muted text-center"
              >
                + New Connection
              </button>
            </>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    )
  }

  // ── New connection form ───────────────────────────────────────────────────
  if (step === 'form') {
    return (
      <div className="rounded-lg border border-border-default bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">New Connection</h3>
          <button onClick={handleClose} className="text-xs text-text-icon hover:text-text-icon-hover">&times; Close</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Database Type Tabs */}
          <div className="flex bg-surface-inset rounded-lg p-1 gap-1">
            {(['postgres', 'snowflake', 'bigquery'] as DbType[]).map((t) => (
              <button
                key={t}
                onClick={() => setDbType(t)}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  dbType === t
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-on-surface'
                }`}
              >
                {DB_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Connection Name */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Connection Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Analytics DB"
              className="w-full px-3 py-2 text-sm border border-border-default rounded-lg bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Dynamic fields per DB type */}
          {dbType === 'snowflake' && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Account" value={account} onChange={setAccount} placeholder="abc12345.us-east-1" />
              <FormField label="Warehouse" value={warehouse} onChange={setWarehouse} placeholder="COMPUTE_WH" />
              <FormField label="Database" value={database} onChange={setDatabase} placeholder="ANALYTICS_POC" />
              <FormField label="Schema" value={schema} onChange={setSchema} placeholder="SAAS_DEMO" />
              <div className="col-span-2 border-t border-border-subtle pt-3">
                <p className="text-xs text-text-muted mb-2">Username falls back to .env if blank.</p>
                <FormField label="Username (optional)" value={username} onChange={setUsername} placeholder="From .env if blank" />
              </div>
            </div>
          )}

          {dbType === 'postgres' && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Host" value={host} onChange={setHost} placeholder="localhost" />
              <FormField label="Port" value={port} onChange={setPort} placeholder="5432" />
              <FormField label="Database" value={database} onChange={setDatabase} placeholder="mydb" />
              <FormField label="Schema" value={schema} onChange={setSchema} placeholder="public" />
              <FormField label="Username" value={username} onChange={setUsername} placeholder="postgres" />
              <FormField label="Password" value={password} onChange={setPassword} placeholder="" type="password" />
            </div>
          )}

          {dbType === 'bigquery' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Project ID" value={projectId} onChange={setProjectId} placeholder="my-gcp-project" />
                <FormField label="Dataset" value={dataset} onChange={setDataset} placeholder="analytics" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Service Account JSON</label>
                <textarea
                  value={serviceAccountJson}
                  onChange={(e) => setServiceAccountJson(e.target.value)}
                  placeholder='Paste service account JSON key or upload file...'
                  rows={4}
                  className="w-full px-3 py-2 text-xs font-mono border border-border-default rounded-lg bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {testing && <Spinner />}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={() => setStep('pick')}
              className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Table picker ──────────────────────────────────────────────────────────
  if (step === 'tables') {
    return (
      <div className="rounded-lg border border-border-default bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Select Tables to Import</h3>
          <button onClick={handleClose} className="text-xs text-text-icon hover:text-text-icon-hover">&times; Close</button>
        </div>
        <div className="p-5 space-y-4">
          {testMessage && (
            <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200">
              <p className="text-sm text-green-700">{testMessage}</p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button onClick={handleToggleAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              {selectedTables.size === tables.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-xs text-text-muted">{selectedTables.size} of {tables.length} selected</span>
          </div>
          <div className="max-h-64 overflow-y-auto border border-border-subtle rounded-lg divide-y divide-border-subtle">
            {tables.map((table) => (
              <label key={table} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTables.has(table)}
                  onChange={() => handleToggleTable(table)}
                  className="rounded border-border-strong text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-text-primary">{table}</span>
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSync}
              disabled={selectedTables.size === 0}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Import {selectedTables.size} Table{selectedTables.size !== 1 ? 's' : ''}
            </button>
            <button onClick={handleClose} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Syncing state ─────────────────────────────────────────────────────────
  if (step === 'syncing') {
    return (
      <div className="rounded-lg border border-border-default bg-surface p-8 text-center">
        <Spinner className="h-8 w-8 mx-auto text-blue-500 mb-4" />
        <p className="text-sm font-medium text-text-primary">Importing tables...</p>
        <p className="text-xs mt-1 text-text-muted">This may take a moment</p>
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
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-border-default rounded-lg bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
