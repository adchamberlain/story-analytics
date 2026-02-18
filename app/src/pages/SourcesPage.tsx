import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

interface DataSource {
  source_id: string
  name: string
  type: string
  row_count: number
  column_count: number
}

const TYPE_BADGES: Record<string, string> = {
  csv: 'bg-emerald-500/15 text-emerald-500',
  snowflake: 'bg-sky-500/15 text-sky-400',
  postgres: 'bg-blue-500/15 text-blue-400',
  bigquery: 'bg-amber-500/15 text-amber-500',
}

export function SourcesPage() {
  const navigate = useNavigate()
  const [sources, setSources] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const fetchSources = useCallback(() => {
    fetch('/api/settings/sources')
      .then((res) => {
        if (!res.ok) throw new Error(`Sources fetch failed: ${res.status}`)
        return res.json()
      })
      .then((data: DataSource[]) => {
        setSources(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchSources()
  }, [fetchSources])

  const handleDelete = async (source: DataSource) => {
    setDeleting(source.source_id)
    try {
      const url =
        source.type === 'csv'
          ? `/api/data/sources/${source.source_id}`
          : `/api/connections/${source.source_id}`
      const res = await fetch(url, { method: 'DELETE' })
      if (res.ok) {
        setSources((prev) => prev.filter((s) => s.source_id !== source.source_id))
      }
    } catch {
      // silently fail — source will remain in list
    } finally {
      setDeleting(null)
      setConfirmId(null)
    }
  }

  return (
    <div className="px-12 py-12 max-w-[900px]">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[28px] font-bold text-text-primary tracking-tight">Data Sources</h1>
        <button
          onClick={() => navigate('/editor/new/source?returnTo=/sources')}
          className="px-5 py-2.5 text-[14px] font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          Add Data Source
        </button>
      </div>

      {loading ? (
        <p className="text-[14px] text-text-muted py-8">Loading...</p>
      ) : sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg
            className="w-12 h-12 text-text-muted/40 mb-4"
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
          <p className="text-[16px] font-medium text-text-secondary mb-1.5">No data sources yet</p>
          <p className="text-[14px] text-text-muted mb-6">Upload a CSV or connect a database to get started.</p>
          <button
            onClick={() => navigate('/editor/new/source?returnTo=/sources')}
            className="px-5 py-2.5 text-[14px] font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            Add Data Source
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Database Connections */}
          <SourceSection
            title="Database Connections"
            subtitle="Connected databases and warehouses."
            items={sources.filter((s) => s.type !== 'csv')}
            emptyMessage="No database connections."
            confirmId={confirmId}
            deleting={deleting}
            onConfirm={setConfirmId}
            onCancel={() => setConfirmId(null)}
            onDelete={handleDelete}
          />

          {/* Uploaded Files */}
          <SourceSection
            title="Uploaded Files"
            subtitle="CSV files and pasted data."
            items={sources.filter((s) => s.type === 'csv')}
            emptyMessage="No uploaded files."
            confirmId={confirmId}
            deleting={deleting}
            onConfirm={setConfirmId}
            onCancel={() => setConfirmId(null)}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  )
}

function SourceSection({
  title,
  subtitle,
  items,
  emptyMessage,
  confirmId,
  deleting,
  onConfirm,
  onCancel,
  onDelete,
}: {
  title: string
  subtitle: string
  items: DataSource[]
  emptyMessage: string
  confirmId: string | null
  deleting: string | null
  onConfirm: (id: string) => void
  onCancel: () => void
  onDelete: (source: DataSource) => void
}) {
  return (
    <section className="bg-surface-raised rounded-2xl shadow-card border border-border-default p-7">
      <div className="mb-4">
        <h2 className="text-[17px] font-semibold text-text-primary mb-1">{title}</h2>
        <p className="text-[14px] text-text-muted">{subtitle}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-[14px] text-text-muted py-3">{emptyMessage}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((s) => (
            <div
              key={s.source_id}
              className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-input border border-border-default"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`text-[12px] font-semibold uppercase px-2 py-0.5 rounded-md shrink-0 ${
                    TYPE_BADGES[s.type] ?? 'bg-gray-500/15 text-gray-400'
                  }`}
                >
                  {s.type}
                </span>
                <span className="text-[14px] text-text-primary font-medium truncate">{s.name}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex items-center gap-4 text-[13px] text-text-muted">
                  {s.row_count > 0 && <span>{s.row_count.toLocaleString()} rows</span>}
                  {s.column_count > 0 && <span>{s.column_count} cols</span>}
                </div>
                {confirmId === s.source_id ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onDelete(s)}
                      disabled={deleting === s.source_id}
                      className="px-3 py-1.5 text-[13px] font-medium rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                    >
                      {deleting === s.source_id ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button
                      onClick={onCancel}
                      className="px-3 py-1.5 text-[13px] font-medium rounded-lg border border-border-default text-text-secondary hover:bg-surface-input transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onConfirm(s.source_id)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete source"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
