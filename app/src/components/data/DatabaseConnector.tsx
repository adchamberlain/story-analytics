import { useState, useEffect } from 'react'

type Step = 'closed' | 'pick' | 'form' | 'tables' | 'syncing'

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

export function DatabaseConnector({ onSynced }: DatabaseConnectorProps) {
  const [step, setStep] = useState<Step>('closed')
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([])
  const [loadingConnections, setLoadingConnections] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form fields
  const [name, setName] = useState('')
  const [account, setAccount] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [database, setDatabase] = useState('')
  const [schema, setSchema] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // Test / tables state
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [tables, setTables] = useState<string[]>([])
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set())
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)

  // Fetch saved connections when opening the picker
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
    setDatabase('')
    setSchema('')
    setUsername('')
    setPassword('')
    setError(null)
    setTestMessage(null)
    setTables([])
    setSelectedTables(new Set())
    setActiveConnectionId(null)
    setTesting(false)
  }

  const handleOpen = () => {
    resetForm()
    setStep('pick')
  }

  const handleClose = () => {
    resetForm()
    setStep('closed')
  }

  const handleNewConnection = () => {
    setError(null)
    setTestMessage(null)
    setStep('form')
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
        body: JSON.stringify({ username: username || null, password: password || null }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'Test failed')
        setTesting(false)
        return
      }

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

  const handleTestConnection = async () => {
    if (!name.trim() || !account.trim() || !database.trim() || !schema.trim()) {
      setError('Name, Account, Database, and Schema are required.')
      return
    }

    setError(null)
    setTesting(true)
    setTestMessage(null)

    try {
      // Reuse existing connection if we already created one, otherwise create new
      let connectionId = activeConnectionId

      if (!connectionId) {
        const createRes = await fetch('/api/connections/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            db_type: 'snowflake',
            config: {
              account: account.trim(),
              warehouse: warehouse.trim(),
              database: database.trim(),
              schema: schema.trim(),
            },
          }),
        })
        const createData = await createRes.json()

        if (!createRes.ok) {
          setError(createData.detail || 'Failed to save connection')
          setTesting(false)
          return
        }

        connectionId = createData.connection_id
        setActiveConnectionId(connectionId)
      }

      // Test it
      const testRes = await fetch(`/api/connections/${connectionId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username || null, password: password || null }),
      })
      const testData = await testRes.json()

      if (!testRes.ok) {
        setError(testData.detail || 'Test failed')
        setTesting(false)
        return
      }

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
      if (next.has(table)) {
        next.delete(table)
      } else {
        next.add(table)
      }
      return next
    })
  }

  const handleToggleAll = () => {
    if (selectedTables.size === tables.length) {
      setSelectedTables(new Set())
    } else {
      setSelectedTables(new Set(tables))
    }
  }

  const handleSync = async () => {
    if (!activeConnectionId || selectedTables.size === 0) return

    setStep('syncing')
    setError(null)

    try {
      const res = await fetch(`/api/connections/${activeConnectionId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: Array.from(selectedTables),
          username: username || null,
          password: password || null,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'Sync failed')
        setStep('tables')
        return
      }

      // Success — notify parent and reset
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
        className="w-full border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors bg-white"
      >
        <svg className="h-10 w-10 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
        <p className="text-sm font-medium text-text-primary">Connect to Database</p>
        <p className="text-xs mt-1 text-text-muted">Snowflake, with more coming soon</p>
      </button>
    )
  }

  // ── Pick saved connection ─────────────────────────────────────────────────
  if (step === 'pick') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Connect to Database</h3>
          <button onClick={handleClose} className="text-xs text-gray-400 hover:text-gray-600">&times; Close</button>
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
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors flex items-center justify-between disabled:opacity-50"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">{conn.name}</p>
                    <p className="text-xs mt-0.5 text-text-muted">
                      {conn.config.database}.{conn.config.schema}
                    </p>
                  </div>
                  <span className="text-xs text-blue-600 font-medium shrink-0 ml-3">
                    {testing && activeConnectionId === conn.connection_id ? 'Testing...' : 'Connect'}
                  </span>
                </button>
              ))}

              <button
                onClick={handleNewConnection}
                className="w-full px-4 py-3 rounded-lg border border-dashed border-gray-300 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm text-text-muted text-center"
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
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">New Snowflake Connection</h3>
          <button onClick={handleClose} className="text-xs text-gray-400 hover:text-gray-600">&times; Close</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-text-secondary mb-1">Connection Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Analytics DB"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Account</label>
              <input
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="abc12345.us-east-1"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Warehouse</label>
              <input
                type="text"
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                placeholder="COMPUTE_WH"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Database</label>
              <input
                type="text"
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                placeholder="ANALYTICS_POC"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Schema</label>
              <input
                type="text"
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                placeholder="SAAS_DEMO"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-text-muted mb-3">
              A browser window will open for Snowflake login (MFA supported). Username falls back to .env if blank.
            </p>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Username <span className="text-text-muted font-normal">(optional)</span></label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="From .env if blank"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {testing && (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
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
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Select Tables to Import</h3>
          <button onClick={handleClose} className="text-xs text-gray-400 hover:text-gray-600">&times; Close</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Success banner */}
          {testMessage && (
            <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200">
              <p className="text-sm text-green-700">{testMessage}</p>
            </div>
          )}

          {/* Select all toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleToggleAll}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              {selectedTables.size === tables.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-xs text-text-muted">
              {selectedTables.size} of {tables.length} selected
            </span>
          </div>

          {/* Table list */}
          <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
            {tables.map((table) => (
              <label
                key={table}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedTables.has(table)}
                  onChange={() => handleToggleTable(table)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
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
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <svg className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm font-medium text-text-primary">Importing tables...</p>
        <p className="text-xs mt-1 text-text-muted">This may take a moment</p>
      </div>
    )
  }

  return null
}
