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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          &larr; Back
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-xl font-semibold text-text-primary mb-2">Choose a data source</h1>
        <p className="text-sm text-text-muted mb-8">
          Select an existing source, connect a database, or upload a CSV file.
        </p>

        {/* Available sources */}
        {loading ? (
          <p className="text-sm text-text-secondary py-8 text-center">Loading sources...</p>
        ) : sources.length > 0 ? (
          <div className="space-y-2 mb-8">
            {sources.map((src) => (
              <button
                key={src.source_id}
                onClick={() => handleSelectSource(src.source_id)}
                className="w-full text-left px-5 py-4 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-colors flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">{src.name}</p>
                  <p className="text-xs mt-0.5 text-text-muted">
                    {src.row_count.toLocaleString()} rows &middot; {src.column_count} columns
                  </p>
                </div>
                <span className="text-xs text-blue-600 font-medium shrink-0 ml-3">Select</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 mb-8 border-2 border-dashed border-gray-200 rounded-xl">
            <p className="text-sm text-text-muted">No data sources loaded yet.</p>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs text-text-muted uppercase tracking-wider">or</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* Connect to Database */}
        <div className="mb-8">
          <DatabaseConnector onSynced={handleSynced} />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs text-text-muted uppercase tracking-wider">or</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* Upload CSV */}
        <FileDropzone
          onFileSelected={handleFileSelected}
          uploading={dataStore.uploading}
        />

        {dataStore.error && (
          <p className="mt-3 text-sm text-red-600">{dataStore.error}</p>
        )}
      </main>
    </div>
  )
}
