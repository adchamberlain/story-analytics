import { useState, useEffect, useCallback } from 'react'
import { authFetch } from '../../utils/authFetch'

interface SourceSummary {
  source_id: string
  name: string
  row_count: number
  column_count: number
}

export function NotebookSourcesPanel() {
  const [sources, setSources] = useState<SourceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchSources = useCallback(() => {
    setLoading(true)
    authFetch('/api/data/sources')
      .then((res) => {
        if (!res.ok) throw new Error(`Sources fetch failed: ${res.status}`)
        return res.json()
      })
      .then((data: SourceSummary[]) => {
        setSources(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchSources()
  }, [fetchSources])

  const copyTableName = (sourceId: string) => {
    const tableName = `src_${sourceId}`
    navigator.clipboard.writeText(tableName).then(() => {
      setCopiedId(sourceId)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
        <h3 className="text-sm font-semibold text-text-primary">Data Sources</h3>
        <button
          onClick={fetchSources}
          className="p-1 rounded-md text-text-icon hover:text-text-primary hover:bg-surface-secondary transition-colors"
          title="Refresh sources"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-xs text-text-muted py-4">Loading...</p>
        ) : sources.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="w-8 h-8 mx-auto text-text-muted/40 mb-2"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75"
              />
            </svg>
            <p className="text-xs text-text-muted mb-2">No data sources uploaded yet</p>
            <a
              href="/sources"
              className="text-xs text-blue-500 hover:text-blue-400 underline transition-colors"
            >
              Go to Data Sources
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map((s) => {
              const tableName = `src_${s.source_id}`
              const isCopied = copiedId === s.source_id
              return (
                <div
                  key={s.source_id}
                  className="rounded-lg border border-border-default bg-surface-input px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate" title={s.name}>
                        {s.name}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {s.row_count.toLocaleString()} rows · {s.column_count} cols
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <code className="text-[10px] font-mono text-text-secondary bg-surface-secondary px-1.5 py-0.5 rounded truncate">
                      {tableName}
                    </code>
                    <button
                      onClick={() => copyTableName(s.source_id)}
                      className="p-0.5 rounded text-text-icon hover:text-text-primary hover:bg-surface-secondary transition-colors shrink-0"
                      title="Copy table name"
                    >
                      {isCopied ? (
                        <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
