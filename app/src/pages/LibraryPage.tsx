import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibraryStore } from '../stores/libraryStore'
import type { SortField, LibraryChart } from '../stores/libraryStore'

// Chart type → display label + icon character
const CHART_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  BarChart: { label: 'Bar', icon: '|||' },
  LineChart: { label: 'Line', icon: '/' },
  AreaChart: { label: 'Area', icon: '~' },
  ScatterPlot: { label: 'Scatter', icon: '::' },
  Histogram: { label: 'Histogram', icon: '|#' },
  BigValue: { label: 'KPI', icon: '#' },
  DataTable: { label: 'Table', icon: '=' },
}

/**
 * Chart library: grid of saved charts with search, type filter, and sort.
 */
export function LibraryPage() {
  const store = useLibraryStore()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    store.loadCharts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const charts = store.filteredCharts()

  // Collect unique chart types for filter dropdown
  const chartTypes = [...new Set(store.charts.map((c) => c.chart_type))].sort()

  const handleDelete = async (chart: LibraryChart) => {
    if (!window.confirm(`Delete "${chart.title}"? This cannot be undone.`)) return
    setDeletingId(chart.id)
    await store.deleteChart(chart.id)
    setDeletingId(null)
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Chart Library</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search */}
        <input
          type="text"
          value={store.search}
          onChange={(e) => store.setSearch(e.target.value)}
          placeholder="Search charts..."
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-surface text-text-primary transition-colors"
        />

        {/* Type filter */}
        <select
          value={store.typeFilter ?? ''}
          onChange={(e) => store.setTypeFilter(e.target.value || null)}
          className="px-3 py-2 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-surface text-text-primary transition-colors"
        >
          <option value="">All types</option>
          {chartTypes.map((type) => (
            <option key={type} value={type}>
              {CHART_TYPE_LABELS[type]?.label ?? type}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={store.sortBy}
          onChange={(e) => store.setSortBy(e.target.value as SortField)}
          className="px-3 py-2 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-surface text-text-primary transition-colors"
        >
          <option value="updated_at">Last modified</option>
          <option value="created_at">Date created</option>
          <option value="title">Title A-Z</option>
        </select>
      </div>

      {/* Content */}
      {store.loading ? (
        <div className="text-center py-20">
          <svg className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-text-secondary">Loading charts...</p>
        </div>
      ) : store.error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4 text-center">
          <p className="text-sm text-red-700">{store.error}</p>
        </div>
      ) : charts.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-border-default rounded-xl">
          <svg className="mx-auto h-12 w-12 text-text-icon mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <h2 className="text-base font-semibold text-text-primary mb-1">
            {store.search || store.typeFilter ? 'No charts match your filters' : 'No charts yet'}
          </h2>
          {!store.search && !store.typeFilter && (
            <>
              <p className="text-sm text-text-secondary mb-5">Create a dashboard to start building charts.</p>
              <Link
                to="/dashboard/new"
                className="inline-flex items-center px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
              >
                + New Dashboard
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {charts.map((chart) => (
            <ChartCard
              key={chart.id}
              chart={chart}
              deleting={deletingId === chart.id}
              onDelete={() => handleDelete(chart)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Chart Card ──────────────────────────────────────────────────────────────

function ChartCard({
  chart,
  deleting,
  onDelete,
}: {
  chart: LibraryChart
  deleting: boolean
  onDelete: () => void
}) {
  const typeInfo = CHART_TYPE_LABELS[chart.chart_type] ?? { label: chart.chart_type, icon: '?' }
  const date = new Date(chart.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="bg-surface-raised rounded-xl border border-border-default shadow-card hover:shadow-card-hover p-6 flex flex-col transition-shadow">
      {/* Type badge + date */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-blue-50 text-chart-blue">
          <span className="font-mono mr-1">{typeInfo.icon}</span>
          {typeInfo.label}
        </span>
        <span className="text-xs text-text-muted">{date}</span>
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold mb-1 line-clamp-2 text-text-primary">
        {chart.title || 'Untitled'}
      </h3>

      {/* Subtitle */}
      {chart.subtitle && (
        <p className="text-sm mb-3 line-clamp-2 text-text-secondary">
          {chart.subtitle}
        </p>
      )}

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border-subtle">
        <Link
          to={`/chart/${chart.id}`}
          className="text-xs px-3 py-1.5 rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors"
        >
          View
        </Link>
        <Link
          to={`/editor/${chart.id}`}
          className="text-xs px-3 py-1.5 rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors"
        >
          Edit
        </Link>
        <div className="flex-1" />
        <button
          onClick={onDelete}
          disabled={deleting}
          className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
