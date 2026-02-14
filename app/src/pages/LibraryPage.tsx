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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-text-primary">
            Chart Library
          </h1>
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard/new"
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors font-medium"
            >
              New Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <input
            type="text"
            value={store.search}
            onChange={(e) => store.setSearch(e.target.value)}
            placeholder="Search charts..."
            className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
          />

          {/* Type filter */}
          <select
            value={store.typeFilter ?? ''}
            onChange={(e) => store.setTypeFilter(e.target.value || null)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
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
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
          >
            <option value="updated_at">Last modified</option>
            <option value="created_at">Date created</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 pb-12">
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
          <div className="text-center py-20">
            <p className="text-sm text-text-secondary">
              {store.search || store.typeFilter
                ? 'No charts match your filters.'
                : 'No charts yet.'}
            </p>
            {!store.search && !store.typeFilter && (
              <Link
                to="/dashboard/new"
                className="text-sm text-blue-600 underline mt-2 inline-block"
              >
                Create your first dashboard
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
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
    <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col hover:border-gray-300 transition-colors">
      {/* Type badge + date */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-chart-blue">
          <span className="font-mono mr-1">{typeInfo.icon}</span>
          {typeInfo.label}
        </span>
        <span className="text-xs text-text-muted">{date}</span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold mb-1 line-clamp-2 text-text-primary">
        {chart.title || 'Untitled'}
      </h3>

      {/* Subtitle */}
      {chart.subtitle && (
        <p className="text-xs mb-3 line-clamp-2 text-text-secondary">
          {chart.subtitle}
        </p>
      )}

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
        <Link
          to={`/chart/${chart.id}`}
          className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          View
        </Link>
        <Link
          to={`/editor/${chart.id}`}
          className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Edit
        </Link>
        <div className="flex-1" />
        <button
          onClick={onDelete}
          disabled={deleting}
          className="text-xs px-3 py-1.5 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
