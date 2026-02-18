import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileDropzone } from '../components/data/FileDropzone'
import { PasteDataInput } from '../components/data/PasteDataInput'
import { DatabaseConnector } from '../components/data/DatabaseConnector'
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
  const [inputMode, setInputMode] = useState<'upload' | 'paste'>('upload')

  const dataStore = useDataStore()

  // When returnTo is set (e.g. from Manage Sources), redirect after upload completes
  useEffect(() => {
    if (returnTo && dataStore.source && !dataStore.uploading) {
      dataStore.reset()
      navigate(returnTo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnTo, dataStore.source, dataStore.uploading, navigate])

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
    async (text: string) => {
      await dataStore.pasteData(text)
    },
    [dataStore]
  )

  const handleSynced = useCallback(() => {
    setRefreshKey((k) => k + 1)
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
        {dataStore.source ? (
          /* Step 2: Data preview */
          <>
            <h1 className="text-[28px] font-bold text-text-primary tracking-tight" style={{ marginBottom: '8px' }}>
              Check your data
            </h1>
            <p className="text-[15px] text-text-muted leading-relaxed" style={{ marginBottom: '32px' }}>
              {dataStore.source.filename} — {dataStore.source.row_count.toLocaleString()} rows, {dataStore.source.columns.length} columns
            </p>

            <DataPreview
              filename={dataStore.source.filename}
              rowCount={dataStore.source.row_count}
              columns={dataStore.source.columns}
              preview={dataStore.preview}
              loadingPreview={dataStore.loadingPreview}
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => {
                  const params = new URLSearchParams({ sourceId: dataStore.source!.source_id })
                  if (returnToDashboard) params.set('returnToDashboard', returnToDashboard)
                  navigate(`/editor/new?${params}`)
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
              Upload a CSV file, paste data, or connect to a database.
            </p>

            {/* Two primary options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px' }}>
              {/* Upload / Paste toggle */}
              <div className="flex" style={{ gap: '4px', marginBottom: '4px' }}>
                <button
                  onClick={() => setInputMode('upload')}
                  className={`text-[14px] font-medium rounded-lg transition-colors ${
                    inputMode === 'upload'
                      ? 'text-text-primary bg-surface-raised'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                  style={{ padding: '6px 14px' }}
                >
                  Upload CSV
                </button>
                <button
                  onClick={() => setInputMode('paste')}
                  className={`text-[14px] font-medium rounded-lg transition-colors ${
                    inputMode === 'paste'
                      ? 'text-text-primary bg-surface-raised'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                  style={{ padding: '6px 14px' }}
                >
                  Paste data
                </button>
              </div>

              {inputMode === 'upload' ? (
                <FileDropzone
                  onFileSelected={handleFileSelected}
                  uploading={dataStore.uploading}
                />
              ) : (
                <PasteDataInput
                  onSubmit={handlePasteSubmit}
                  uploading={dataStore.uploading}
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
