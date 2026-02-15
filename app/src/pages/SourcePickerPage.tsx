import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileDropzone } from '../components/data/FileDropzone'
import { DatabaseConnector } from '../components/data/DatabaseConnector'
import { useDataStore } from '../stores/dataStore'

interface SourceSummary {
  source_id: string
  name: string
  row_count: number
  column_count: number
}

export function SourcePickerPage() {
  const navigate = useNavigate()
  const [sources, setSources] = useState<SourceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showRecent, setShowRecent] = useState(false)

  const dataStore = useDataStore()

  useEffect(() => {
    setLoading(true)
    fetch('/api/data/sources')
      .then((res) => res.json())
      .then((data: SourceSummary[]) => {
        setSources(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [refreshKey])

  const handleSelectSource = useCallback(
    (sourceId: string) => {
      navigate(`/editor/new?sourceId=${sourceId}`)
    },
    [navigate]
  )

  const handleFileSelected = useCallback(
    async (file: File) => {
      await dataStore.uploadCSV(file)
      const source = dataStore.source
      if (source) {
        navigate(`/editor/new?sourceId=${source.source_id}`)
      }
    },
    [dataStore, navigate]
  )

  const handleSynced = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  // Re-check after upload completes (source may be set asynchronously)
  useEffect(() => {
    if (dataStore.source && !dataStore.uploading) {
      navigate(`/editor/new?sourceId=${dataStore.source.source_id}`)
    }
  }, [dataStore.source, dataStore.uploading, navigate])

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
          onClick={() => navigate(-1)}
          className="text-[15px] text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
      </header>

      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '48px 40px' }}>
        <h1 className="text-[28px] font-bold text-text-primary tracking-tight" style={{ marginBottom: '8px' }}>
          Choose a data source
        </h1>
        <p className="text-[15px] text-text-muted leading-relaxed" style={{ marginBottom: '40px' }}>
          Upload a CSV file or connect to a database.
        </p>

        {/* Two primary options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px' }}>
          {/* Upload CSV */}
          <FileDropzone
            onFileSelected={handleFileSelected}
            uploading={dataStore.uploading}
          />

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
      </main>
    </div>
  )
}
