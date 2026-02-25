import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { authFetch } from '../../utils/authFetch'

interface VersionMeta {
  version: number
  created_at: string
  trigger: string
  label: string | null
}

/**
 * Format an ISO timestamp to a relative human-readable string.
 * e.g. "2 minutes ago", "1 hour ago", "3 days ago"
 */
function relativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`

  return date.toLocaleDateString()
}

/**
 * Badge color/label for version trigger type.
 */
function TriggerBadge({ trigger }: { trigger: string }) {
  const styles: Record<string, string> = {
    auto: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    manual: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    publish: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${styles[trigger] ?? styles.auto}`}>
      {trigger}
    </span>
  )
}

export function VersionHistoryPanel() {
  const chartId = useEditorStore((s) => s.chartId)
  const setVersionHistoryOpen = useEditorStore((s) => s.setVersionHistoryOpen)
  const loadChart = useEditorStore((s) => s.loadChart)

  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null)

  const fetchVersions = useCallback(async () => {
    if (!chartId) return
    setLoading(true)
    try {
      const res = await authFetch(`/api/v2/charts/${chartId}/versions`)
      if (res.ok) {
        setVersions(await res.json())
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false)
    }
  }, [chartId])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  const handleRestore = useCallback(async (version: number) => {
    if (!chartId) return
    setRestoring(version)
    try {
      const res = await authFetch(`/api/v2/charts/${chartId}/versions/${version}/restore`, {
        method: 'POST',
      })
      if (res.ok) {
        // Reload the chart to pick up restored state
        await loadChart(chartId)
        setVersionHistoryOpen(false)
      }
    } catch {
      // Non-critical
    } finally {
      setRestoring(null)
      setConfirmRestore(null)
    }
  }, [chartId, loadChart, setVersionHistoryOpen])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
        <h3 className="text-sm font-semibold text-text-primary">Version History</h3>
        <button
          onClick={() => setVersionHistoryOpen(false)}
          className="text-text-muted hover:text-text-secondary transition-colors text-lg leading-none"
          aria-label="Close version history"
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="text-text-muted text-sm mb-2">No versions yet</div>
            <p className="text-text-muted text-xs max-w-[200px]">
              Versions are created automatically as you edit and publish, or manually via "Save Version".
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-default" role="list">
            {versions.map((v) => (
              <li key={v.version} className="px-4 py-3 hover:bg-surface-secondary transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-text-primary">
                      v{v.version}
                    </span>
                    <TriggerBadge trigger={v.trigger} />
                  </div>
                  <span className="text-[10px] text-text-muted">
                    {relativeTime(v.created_at)}
                  </span>
                </div>
                {v.label && (
                  <p className="text-xs text-text-secondary truncate mb-1.5">{v.label}</p>
                )}
                <div>
                  {confirmRestore === v.version ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-amber-600">Restore this version?</span>
                      <button
                        onClick={() => handleRestore(v.version)}
                        disabled={restoring === v.version}
                        className="text-[10px] px-2 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                      >
                        {restoring === v.version ? 'Restoring...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmRestore(null)}
                        className="text-[10px] px-2 py-0.5 rounded text-text-muted hover:text-text-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRestore(v.version)}
                      className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Restore
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
