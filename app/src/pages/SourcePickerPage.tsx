import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileDropzone } from '../components/data/FileDropzone'
import { PasteDataInput } from '../components/data/PasteDataInput'
import { GoogleSheetsInput } from '../components/data/GoogleSheetsInput'
import { UrlSourceInput } from '../components/data/UrlSourceInput'
import { DatabaseConnector, type SyncedInfo } from '../components/data/DatabaseConnector'
import { DataShaper } from '../components/data/DataShaper'
import { DataPreview } from '../components/data/DataPreview'
import { useDataStore } from '../stores/dataStore'

interface SourceSummary {
  source_id: string
  name: string
  row_count: number
  column_count: number
}

export function SourcePickerPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo')
  const returnToDashboard = searchParams.get('returnToDashboard')
  const [sources, setSources] = useState<SourceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showRecent, setShowRecent] = useState(false)
  const [inputMode, setInputMode] = useState<'upload' | 'paste' | 'sheets' | 'url'>('upload')
  const [sourceName, setSourceName] = useState('')

  // Database wizard state
  const [dbStep, setDbStep] = useState<'connector' | 'shaper'>('connector')
  const [syncedInfo, setSyncedInfo] = useState<SyncedInfo | null>(null)

  const dataStore = useDataStore()

  // Reset stale data source state from a previous visit so the user always
  // starts on the "Choose a data source" step instead of the old preview.
  useEffect(() => {
    useDataStore.getState().reset()
  }, [])

  // Validate returnTo is a same-origin relative path to prevent open redirect.
  const safeReturnTo = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : null

  // Initialize source name when a source is loaded (strip .csv extension for editing)
  useEffect(() => {
    if (dataStore.source) {
      const fn = dataStore.source.filename
      const isPaste = fn === '__paste__.csv'
      setSourceName(isPaste ? '' : fn.replace(/\.csv$/i, ''))
    }
  }, [dataStore.source])

  useEffect(() => {
    setLoading(true)
    fetch('/api/data/sources')
      .then((res) => {
        if (!res.ok) throw new Error(`Sources fetch failed: ${res.status}`)
        return res.json()
      })
      .then((data: SourceSummary[]) => {
        setSources(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [refreshKey])

  const handleSelectSource = useCallback(
    (sourceId: string) => {
      const params = new URLSearchParams({ sourceId })
      if (returnToDashboard) params.set('returnToDashboard', returnToDashboard)
      navigate(`/editor/new?${params}`)
    },
    [navigate, returnToDashboard]
  )

  const handleFileSelected = useCallback(
    async (file: File) => {
      await dataStore.uploadCSV(file)
    },
    [dataStore]
  )

  const handlePasteSubmit = useCallback(
    async (text: string, name: string) => {
      await dataStore.pasteData(text, name || undefined)
    },
    [dataStore]
  )

  const handleSynced = useCallback((info: SyncedInfo) => {
    setSyncedInfo(info)
    setDbStep('shaper')
    setRefreshKey((k) => k + 1)
  }, [])

  const handleShaperApprove = useCallback((sql: string) => {
    if (!syncedInfo) return
    const params = new URLSearchParams({ sourceId: syncedInfo.sourceId })
    if (returnToDashboard) params.set('returnToDashboard', returnToDashboard)
    navigate(`/editor/new?${params}`, { state: { initialSql: sql } })
  }, [syncedInfo, navigate, returnToDashboard])

  const handleShaperSkip = useCallback(() => {
    if (!syncedInfo) return
    const params = new URLSearchParams({ sourceId: syncedInfo.sourceId })
    if (returnToDashboard) params.set('returnToDashboard', returnToDashboard)
    navigate(`/editor/new?${params}`)
  }, [syncedInfo, navigate, returnToDashboard])

  const handleShaperBack = useCallback(() => {
    setSyncedInfo(null)
    setDbStep('connector')
  }, [])

  // Deduplicate sources by name, keeping only the most recent (last in the list)
  const deduped = sources.reduce<SourceSummary[]>((acc, src) => {
    const existing = acc.findIndex((s) => s.name === src.name)
    if (existing >= 0) {
      acc[existing] = src // replace with more recent
    } else {
      acc.push(src)
    }
    return acc
  }, [])

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Header */}
      <header
        className="bg-surface border-b border-border-default flex items-center"
        style={{ padding: '16px 64px' }}
      >
        <button
          onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
          className="text-[15px] text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
      </header>

      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '48px 40px' }}>
        {/* DataShaper wizard step (after DB sync) */}
        {dbStep === 'shaper' && syncedInfo ? (
          <DataShaper
            sourceId={syncedInfo.sourceId}
            tableName={syncedInfo.tableName}
            rowCount={syncedInfo.rowCount}
            columns={syncedInfo.columns}
            onApprove={handleShaperApprove}
            onSkip={handleShaperSkip}
            onBack={handleShaperBack}
          />
        ) : dataStore.source ? (
          /* Step 2: Data preview (CSV/paste) */
          <>
            <h1 className="text-[28px] font-bold text-text-primary tracking-tight" style={{ marginBottom: '8px' }}>
              Check your data
            </h1>
            <p className="text-[15px] text-text-muted leading-relaxed" style={{ marginBottom: '24px' }}>
              {dataStore.source.row_count.toLocaleString()} rows, {dataStore.source.columns.length} columns
            </p>

            {/* Source name input */}
            <div style={{ marginBottom: '24px' }}>
              <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '6px' }}>
                Name
              </label>
              <input
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="e.g. Sales Data Q4"
                className="w-full px-3 py-2 text-[15px] border border-border-default rounded-lg bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>

            <DataPreview
              filename={dataStore.source.filename}
              rowCount={dataStore.source.row_count}
              columns={dataStore.source.columns}
              preview={dataStore.preview}
              loadingPreview={dataStore.loadingPreview}
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={async () => {
                  const sid = dataStore.source!.source_id
                  // Rename if user provided a name different from current filename
                  const trimmed = sourceName.trim()
                  if (trimmed) {
                    try {
                      await fetch(`/api/data/sources/${sid}/rename`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: trimmed }),
                      })
                    } catch {
                      // Non-critical — continue even if rename fails
                    }
                  }
                  // Navigate: back to returnTo page, or to editor
                  if (safeReturnTo) {
                    dataStore.reset()
                    navigate(safeReturnTo)
                  } else {
                    const params = new URLSearchParams({ sourceId: sid })
                    if (returnToDashboard) params.set('returnToDashboard', returnToDashboard)
                    navigate(`/editor/new?${params}`)
                  }
                }}
                className="text-[15px] font-medium rounded-lg transition-colors"
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#2563eb' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#3b82f6' }}
              >
                Use this data
              </button>
              <button
                onClick={() => dataStore.reset()}
                className="text-[15px] font-medium text-text-secondary hover:text-text-primary rounded-lg border border-border-default hover:border-border-hover transition-colors"
                style={{ padding: '10px 24px' }}
              >
                Choose different data
              </button>
            </div>
          </>
        ) : (
          /* Step 1: Upload / connect */
          <>
            <h1 className="text-[28px] font-bold text-text-primary tracking-tight" style={{ marginBottom: '8px' }}>
              Choose a data source
            </h1>
            <p className="text-[15px] text-text-muted leading-relaxed" style={{ marginBottom: '40px' }}>
              Upload a CSV, paste data, import from a URL, or connect to a database.
            </p>

            {/* Primary options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px' }}>
              {/* Input mode tabs */}
              <div className="flex flex-wrap" style={{ gap: '4px', marginBottom: '4px' }}>
                {([
                  ['upload', 'Upload CSV'],
                  ['paste', 'Paste data'],
                  ['sheets', 'Google Sheets'],
                  ['url', 'From URL'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setInputMode(mode)}
                    className={`text-[14px] font-medium rounded-lg transition-colors ${
                      inputMode === mode
                        ? 'text-text-primary bg-surface-raised'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                    style={{ padding: '6px 14px' }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {inputMode === 'upload' ? (
                <FileDropzone
                  onFileSelected={handleFileSelected}
                  uploading={dataStore.uploading}
                />
              ) : inputMode === 'paste' ? (
                <PasteDataInput
                  onSubmit={handlePasteSubmit}
                  uploading={dataStore.uploading}
                />
              ) : inputMode === 'sheets' ? (
                <GoogleSheetsInput
                  onImport={handleSelectSource}
                  importing={dataStore.uploading}
                />
              ) : (
                <UrlSourceInput
                  onImport={handleSelectSource}
                  importing={dataStore.uploading}
                />
              )}

              {dataStore.error && (
                <p className="text-[14px]" style={{ color: '#ef4444', marginTop: '-8px' }}>{dataStore.error}</p>
              )}

              {/* Divider */}
              <div className="flex items-center" style={{ gap: '16px', margin: '8px 0' }}>
                <div className="flex-1 border-t border-border-default" />
                <span className="text-[13px] text-text-muted uppercase tracking-wider">or</span>
                <div className="flex-1 border-t border-border-default" />
              </div>

              {/* Connect to Database */}
              <DatabaseConnector onSynced={handleSynced} />
            </div>

            {/* Recent sources (collapsible) */}
            {!loading && deduped.length > 0 && (
              <div>
                <button
                  onClick={() => setShowRecent(!showRecent)}
                  className="text-[14px] font-medium text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-2"
                  style={{ marginBottom: showRecent ? '16px' : '0' }}
                >
                  <svg
                    className="h-4 w-4 transition-transform"
                    style={{ transform: showRecent ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  Use existing source ({deduped.length})
                </button>

                {showRecent && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {deduped.map((src) => (
                      <button
                        key={src.source_id}
                        onClick={() => handleSelectSource(src.source_id)}
                        className="w-full text-left rounded-xl border border-border-default bg-surface-raised hover:border-blue-400 transition-all flex items-center justify-between"
                        style={{ padding: '16px 20px' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
                      >
                        <div>
                          <p className="text-[15px] font-medium text-text-primary">{src.name}</p>
                          <p className="text-[13px] text-text-muted" style={{ marginTop: '2px' }}>
                            {src.row_count.toLocaleString()} rows · {src.column_count} columns
                          </p>
                        </div>
                        <span className="text-[13px] font-medium shrink-0" style={{ color: '#3b82f6', marginLeft: '16px' }}>
                          Select
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Duplicate file confirmation modal */}
      {dataStore.duplicateConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-raised rounded-2xl shadow-xl border border-border-default p-6 max-w-md mx-4">
            <h3 className="text-[16px] font-semibold text-text-primary mb-2">File already exists</h3>
            <p className="text-[14px] text-text-muted leading-relaxed mb-5">
              <span className="font-medium text-text-secondary">"{dataStore.duplicateConflict.filename}"</span> has already been uploaded. Replace it with the new version?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => dataStore.cancelReplace()}
                className="px-4 py-2 text-[14px] font-medium rounded-lg border border-border-default text-text-secondary hover:bg-surface-input transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => dataStore.confirmReplace()}
                className="px-4 py-2 text-[14px] font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
