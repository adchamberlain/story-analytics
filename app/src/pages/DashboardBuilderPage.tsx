import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDashboardBuilderStore } from '../stores/dashboardBuilderStore'
import { ChartPicker } from '../components/dashboard/ChartPicker'
import type { DashboardChartRef } from '../stores/dashboardBuilderStore'

const CHART_TYPE_LABELS: Record<string, string> = {
  BarChart: 'Bar',
  LineChart: 'Line',
  AreaChart: 'Area',
  ScatterPlot: 'Scatter',
  Histogram: 'Histogram',
  BigValue: 'KPI',
  DataTable: 'Table',
}

/** Minimal chart metadata fetched for the builder cards. */
interface ChartMeta {
  id: string
  chart_type: string
  title: string
  subtitle: string | null
}

/**
 * Dashboard builder: compose multiple charts, set title/description, save.
 * Supports both create (/dashboard/new) and edit (/dashboard/:id/edit).
 */
export function DashboardBuilderPage() {
  const { dashboardId } = useParams<{ dashboardId: string }>()
  const navigate = useNavigate()
  const store = useDashboardBuilderStore()

  // Chart metadata cache (fetched once for display in builder cards)
  const [chartMeta, setChartMeta] = useState<Record<string, ChartMeta>>({})

  // Load existing dashboard if editing
  useEffect(() => {
    if (dashboardId) {
      store.load(dashboardId)
    }
    return () => store.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId])

  // Fetch chart metadata for all referenced charts
  useEffect(() => {
    if (store.charts.length === 0) return

    const missing = store.charts.filter((c) => !chartMeta[c.chart_id])
    if (missing.length === 0) return

    fetch('/api/v2/charts/')
      .then((res) => res.json())
      .then((charts: ChartMeta[]) => {
        const map: Record<string, ChartMeta> = { ...chartMeta }
        for (const c of charts) map[c.id] = c
        setChartMeta(map)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.charts.length])

  const handleSave = useCallback(async () => {
    const id = await store.save()
    if (id) navigate(`/dashboard/v2/${id}`)
  }, [store, navigate])

  const handleAddChart = useCallback((chartId: string) => {
    store.addChart(chartId)
    store.setPickerOpen(false)
  }, [store])

  if (store.loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm" style={{ color: '#666' }}>Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          &larr; Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => store.setPickerOpen(true)}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            + Add Chart
          </button>
          <button
            onClick={handleSave}
            disabled={store.saving || !store.title.trim()}
            className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {store.saving ? 'Saving...' : 'Save Dashboard'}
          </button>
        </div>
      </header>

      {/* Error banner */}
      {store.error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-xs text-red-700">
          {store.error}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Title & description */}
        <div className="space-y-3 mb-8">
          <input
            type="text"
            value={store.title}
            onChange={(e) => store.setTitle(e.target.value)}
            placeholder="Dashboard title"
            className="w-full text-2xl font-semibold bg-transparent border-none focus:outline-none placeholder:text-gray-300"
            style={{ color: '#1a1a1a' }}
          />
          <input
            type="text"
            value={store.description}
            onChange={(e) => store.setDescription(e.target.value)}
            placeholder="Add a description..."
            className="w-full text-sm bg-transparent border-none focus:outline-none placeholder:text-gray-300"
            style={{ color: '#666' }}
          />
        </div>

        {/* Chart list */}
        {store.charts.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
            <p className="text-sm" style={{ color: '#999' }}>
              No charts yet. Click "Add Chart" to get started.
            </p>
            <button
              onClick={() => store.setPickerOpen(true)}
              className="mt-3 text-sm text-blue-600 underline hover:text-blue-800"
            >
              Add your first chart
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {store.charts.map((ref, idx) => (
              <BuilderChartCard
                key={ref.chart_id}
                ref_={ref}
                index={idx}
                total={store.charts.length}
                meta={chartMeta[ref.chart_id]}
                onMove={(dir) => store.moveChart(ref.chart_id, dir)}
                onWidthToggle={() =>
                  store.setChartWidth(ref.chart_id, ref.width === 'full' ? 'half' : 'full')
                }
                onRemove={() => store.removeChart(ref.chart_id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Chart picker modal */}
      {store.pickerOpen && (
        <ChartPicker
          excludeIds={store.charts.map((c) => c.chart_id)}
          onAdd={handleAddChart}
          onClose={() => store.setPickerOpen(false)}
        />
      )}
    </div>
  )
}

// ── Builder Chart Card ──────────────────────────────────────────────────────

function BuilderChartCard({
  ref_,
  index,
  total,
  meta,
  onMove,
  onWidthToggle,
  onRemove,
}: {
  ref_: DashboardChartRef
  index: number
  total: number
  meta?: ChartMeta
  onMove: (dir: 'up' | 'down') => void
  onWidthToggle: () => void
  onRemove: () => void
}) {
  const typeLabel = meta
    ? CHART_TYPE_LABELS[meta.chart_type] ?? meta.chart_type
    : '...'

  const btnClass = 'text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-30'

  return (
    <div className="bg-white rounded-lg border border-gray-200 px-5 py-4 flex items-center gap-4">
      {/* Order controls */}
      <div className="flex flex-col gap-1">
        <button onClick={() => onMove('up')} disabled={index === 0} className={btnClass}>
          &uarr;
        </button>
        <button onClick={() => onMove('down')} disabled={index === total - 1} className={btnClass}>
          &darr;
        </button>
      </div>

      {/* Chart info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: '#1a1a1a' }}>
          {meta?.title ?? `Chart ${ref_.chart_id}`}
        </p>
        <p className="text-xs" style={{ color: '#999' }}>
          {typeLabel}
          {meta?.subtitle ? ` — ${meta.subtitle}` : ''}
        </p>
      </div>

      {/* Width toggle */}
      <button
        onClick={onWidthToggle}
        className={`text-xs px-3 py-1.5 rounded border transition-colors ${
          ref_.width === 'full'
            ? 'border-blue-300 text-blue-600 bg-blue-50'
            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
        }`}
      >
        {ref_.width === 'full' ? 'Full width' : 'Half width'}
      </button>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="text-xs px-2.5 py-1.5 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
      >
        Remove
      </button>
    </div>
  )
}
