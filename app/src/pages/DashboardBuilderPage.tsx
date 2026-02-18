import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  GridLayout,
  useContainerWidth,
  type LayoutItem,
  type Layout,
} from 'react-grid-layout'
import { useDashboardBuilderStore } from '../stores/dashboardBuilderStore'
import { ChartPicker } from '../components/dashboard/ChartPicker'
import { ChartWrapper } from '../components/charts/ChartWrapper'
import { ObservableChartFactory } from '../components/charts/ObservableChartFactory'
import { PALETTES } from '../themes/plotTheme'
import type { ChartConfig, ChartType } from '../types/chart'
import type { PaletteKey } from '../themes/plotTheme'

/** Full chart data fetched for rendering previews in the builder. */
interface ChartFullData {
  chart_type: string
  title: string | null
  subtitle: string | null
  source: string | null
  x: string | null
  y: string | string[] | null
  series: string | null
  horizontal: boolean
  sort: boolean
  config: Record<string, unknown> | null
  data: Record<string, unknown>[]
  columns: string[]
}

/**
 * Dashboard builder: compose multiple charts, set title/description, save.
 * Supports both create (/dashboard/new) and edit (/dashboard/:id/edit).
 */
export function DashboardBuilderPage() {
  const { dashboardId } = useParams<{ dashboardId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const store = useDashboardBuilderStore()

  // Full chart data cache for rendering previews
  const [chartData, setChartData] = useState<Record<string, ChartFullData>>({})
  const [chartErrors, setChartErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Load existing dashboard if editing — clear stale chart cache on navigation
  useEffect(() => {
    setChartData({})
    setChartErrors({})
    if (dashboardId) {
      store.load(dashboardId)
    }
    return () => store.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId])

  // Auto-add chart when returning from chart creation flow.
  // Guard on store.dashboardId (not store.loading) because loading starts as false
  // and the load effect hasn't set it to true yet on the first render — using loading
  // as the guard causes a race where addChart fires before the dashboard is loaded.
  // dashboardId starts as null and only gets set when load() completes successfully.
  const addChartHandled = useRef(false)
  // Reset when dashboardId changes so addChart works across navigations
  useEffect(() => {
    addChartHandled.current = false
  }, [dashboardId])
  useEffect(() => {
    const addChartId = searchParams.get('addChart')
    if (!addChartId || !store.dashboardId || addChartHandled.current) return

    addChartHandled.current = true
    store.addChart(addChartId)
    store.save().then((id) => {
      if (id) navigate(`/dashboard/${id}`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, store.dashboardId])

  // Fetch full chart data for all referenced charts
  const chartIdKey = store.charts.map((c) => c.chart_id).join(',')
  useEffect(() => {
    if (store.charts.length === 0) return

    const missing = store.charts.filter((c) => !chartData[c.chart_id] && !chartErrors[c.chart_id])
    if (missing.length === 0) return

    const abortController = new AbortController()

    for (const ref of missing) {
      fetch(`/api/v2/charts/${ref.chart_id}`, { signal: abortController.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`Chart ${ref.chart_id} not found`)
          return res.json()
        })
        .then((result) => {
          if (abortController.signal.aborted) return
          const chart = result.chart
          setChartData((prev) => ({
            ...prev,
            [ref.chart_id]: {
              chart_type: chart.chart_type,
              title: chart.title,
              subtitle: chart.subtitle,
              source: chart.source,
              x: chart.x,
              y: chart.y,
              series: chart.series,
              horizontal: chart.horizontal ?? false,
              sort: chart.sort ?? true,
              config: chart.config,
              data: result.data ?? [],
              columns: result.columns ?? [],
            },
          }))
        })
        .catch((err) => {
          if (err.name === 'AbortError') return
          setChartErrors((prev) => ({ ...prev, [ref.chart_id]: 'Failed to load chart' }))
        })
    }

    return () => abortController.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartIdKey])

  const handleSave = useCallback(async () => {
    const id = await store.save()
    if (id) navigate(`/dashboard/${id}`)
  }, [store, navigate])

  const handleAddChart = useCallback((chartId: string) => {
    store.addChart(chartId)
    store.setPickerOpen(false)
  }, [store])

  const handleCreateNew = useCallback(() => {
    store.setPickerOpen(false)
    const url = dashboardId
      ? `/editor/new/source?returnToDashboard=${dashboardId}`
      : '/editor/new/source'
    navigate(url)
  }, [store, navigate, dashboardId])

  const handleDelete = useCallback(async () => {
    if (!dashboardId) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/v2/dashboards/${dashboardId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      navigate('/dashboards')
    } catch {
      setDeleteError('Failed to delete dashboard. Please try again.')
      setDeleting(false)
    }
  }, [dashboardId, navigate])

  // Generate strict 2-column layout from store charts
  const gridLayout = useMemo((): Layout => {
    const items: LayoutItem[] = []
    let x = 0
    let y = 0

    for (const chart of store.charts) {
      if (chart.layout) {
        const w = chart.layout.w >= 2 ? 2 : 1
        items.push({
          i: chart.chart_id,
          x: w === 2 ? 0 : (chart.layout.x >= 1 ? 1 : 0),
          y: chart.layout.y,
          w,
          h: chart.layout.h,
          minW: 1,
          maxW: 2,
          minH: 2,
        })
        continue
      }

      // Auto-generate: full → w=2, half → w=1
      const w = chart.width === 'full' ? 2 : 1
      const h = 5

      if (x + w > 2) {
        x = 0
        y += h
      }

      items.push({ i: chart.chart_id, x, y, w, h, minW: 1, maxW: 2, minH: 2 })
      x += w
      if (x >= 2) {
        x = 0
        y += h
      }
    }

    return items
  }, [store.charts])

  const { width, containerRef, mounted } = useContainerWidth()

  const handleLayoutChange = useCallback((layout: Layout) => {
    // Clamp to strict 2-col: w must be 1 or 2, x must be 0 or 1
    const clamped = [...layout].map(l => ({
      i: l.i,
      x: l.w >= 2 ? 0 : (l.x >= 1 ? 1 : 0),
      y: l.y,
      w: l.w >= 2 ? 2 : 1,
      h: l.h,
    }))
    store.updateLayouts(clamped)
  }, [store])

  if (store.loading) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-text-secondary">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Header */}
      <header className="bg-surface border-b border-border-default px-16 py-4 flex items-center justify-between">
        <button
          onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
          className="text-[15px] text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
        <div className="flex items-center gap-3">
          {dashboardId && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-[14px] px-4 py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors font-medium"
            >
              Delete
            </button>
          )}
          <button
            onClick={() => store.setPickerOpen(true)}
            className="text-[14px] px-5 py-2.5 rounded-xl border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors font-medium"
          >
            + Add Chart
          </button>
          <button
            onClick={handleSave}
            disabled={store.saving || !store.title.trim()}
            className="text-[14px] px-6 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {store.saving ? 'Saving...' : 'Save Dashboard'}
          </button>
        </div>
      </header>

      {/* Error banner */}
      {store.error && (
        <div className="border-b text-[14px] px-16 py-3 bg-red-50 border-red-200 text-red-600">
          {store.error}
        </div>
      )}

      <main className="px-16 py-12">
        {/* Title & description */}
        <div className="mb-10">
          <input
            type="text"
            value={store.title}
            onChange={(e) => store.setTitle(e.target.value)}
            placeholder="Dashboard title"
            className="w-full text-[28px] font-bold bg-transparent border-none focus:outline-none placeholder:text-text-muted text-text-primary tracking-tight mb-2"
          />
          <input
            type="text"
            value={store.description}
            onChange={(e) => store.setDescription(e.target.value)}
            placeholder="Add a description..."
            className="w-full text-[16px] bg-transparent border-none focus:outline-none placeholder:text-text-muted text-text-secondary"
          />
        </div>

        {/* Chart grid */}
        {store.charts.length === 0 ? (
          <div className="text-center border-2 border-dashed border-border-default rounded-2xl py-20 px-10">
            <svg className="mx-auto h-12 w-12 text-text-icon mb-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <h2 className="text-[17px] font-semibold text-text-primary mb-2">
              No charts yet
            </h2>
            <p className="text-[15px] text-text-secondary mb-6">
              Click "Add Chart" to get started.
            </p>
            <button
              onClick={() => store.setPickerOpen(true)}
              className="text-[14px] px-6 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
            >
              + Add Chart
            </button>
          </div>
        ) : (
          <div ref={containerRef as React.RefObject<HTMLDivElement>}>
            {mounted && (
              <GridLayout
                className="builder-grid"
                width={width}
                gridConfig={{
                  cols: 2,
                  rowHeight: 60,
                  margin: [24, 24] as [number, number],
                  containerPadding: [0, 0] as [number, number],
                }}
                layout={gridLayout}
                dragConfig={{ enabled: true }}
                resizeConfig={{ enabled: true, handles: ['se'] }}
                onLayoutChange={handleLayoutChange}
              >
                {store.charts.map((ref) => (
                  <div key={ref.chart_id}>
                    <BuilderGridCard
                      chartFullData={chartData[ref.chart_id]}
                      chartError={chartErrors[ref.chart_id]}
                      onRemove={() => store.removeChart(ref.chart_id)}
                    />
                  </div>
                ))}
              </GridLayout>
            )}
          </div>
        )}
      </main>

      {/* Chart picker modal */}
      {store.pickerOpen && (
        <ChartPicker
          excludeIds={store.charts.map((c) => c.chart_id)}
          onAdd={handleAddChart}
          onCreateNew={handleCreateNew}
          onClose={() => store.setPickerOpen(false)}
        />
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-raised rounded-2xl shadow-xl border border-border-default p-6 max-w-md mx-4">
            <h3 className="text-[16px] font-semibold text-text-primary mb-2">Delete dashboard</h3>
            <p className="text-[14px] text-text-muted leading-relaxed mb-5">
              Are you sure you want to delete <span className="font-medium text-text-secondary">"{store.title || 'Untitled'}"</span>? This cannot be undone.
            </p>
            {deleteError && (
              <p className="text-[13px] text-red-500 mb-3">{deleteError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-4 py-2 text-[14px] font-medium rounded-lg border border-border-default text-text-secondary hover:bg-surface-input transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-[14px] font-medium rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Builder Grid Card ───────────────────────────────────────────────────────

function BuilderGridCard({
  chartFullData,
  chartError,
  onRemove,
}: {
  chartFullData?: ChartFullData
  chartError?: string
  onRemove: () => void
}) {
  // Error loading chart
  if (chartError) {
    return (
      <div className="group relative bg-surface-raised rounded-2xl border border-red-500/30 shadow-card h-full flex items-center justify-center cursor-grab active:cursor-grabbing">
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="absolute top-2 right-2 z-10 text-[12px] text-red-400 hover:text-red-300 bg-surface-raised/80 backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 px-2 py-1 rounded-lg border border-red-500/20"
        >
          Remove
        </button>
        <div className="text-center px-4">
          <p className="text-sm font-medium text-red-400">Chart unavailable</p>
          <p className="text-xs text-text-muted mt-1">{chartError}</p>
        </div>
      </div>
    )
  }

  // Still loading chart data
  if (!chartFullData) {
    return (
      <div className="group bg-surface-raised rounded-2xl border border-border-default shadow-card h-full flex items-center justify-center cursor-grab active:cursor-grabbing">
        <div className="text-center">
          <svg className="animate-spin h-5 w-5 mx-auto text-text-muted mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-xs text-text-muted">Loading chart...</p>
        </div>
      </div>
    )
  }

  const chartType = (chartFullData.chart_type ?? 'BarChart') as ChartType

  const isMultiY = Array.isArray(chartFullData.y) && chartFullData.y.length > 1
  const chartConfig: ChartConfig = {
    x: chartFullData.x ?? undefined,
    y: isMultiY ? 'metric_value' : (Array.isArray(chartFullData.y) ? chartFullData.y[0] : chartFullData.y) ?? undefined,
    series: isMultiY ? 'metric_name' : chartFullData.series ?? undefined,
    horizontal: chartFullData.horizontal,
    sort: chartFullData.sort,
    stacked: (chartFullData.config?.stacked as boolean) ?? false,
    showGrid: (chartFullData.config?.showGrid as boolean) ?? true,
    showLegend: (chartFullData.config?.showLegend as boolean) ?? true,
    showValues: (chartFullData.config?.showValues as boolean) ?? false,
    xAxisTitle: (chartFullData.config?.xAxisTitle as string) || undefined,
    yAxisTitle: (chartFullData.config?.yAxisTitle as string) || undefined,
    annotations: chartFullData.config?.annotations as ChartConfig['annotations'],
    value: (chartFullData.config?.value as string) ?? undefined,
    comparisonValue: (chartFullData.config?.comparisonValue as string) ?? undefined,
    comparisonLabel: (chartFullData.config?.comparisonLabel as string) || undefined,
    valueFormat: (chartFullData.config?.valueFormat as ChartConfig['valueFormat']) || undefined,
    positiveIsGood: (chartFullData.config?.positiveIsGood as boolean) ?? true,
  }

  const palette = (chartFullData.config?.palette as PaletteKey) ?? 'default'
  const paletteColors = PALETTES[palette] ?? PALETTES.default
  if (palette !== 'default') {
    chartConfig.colorRange = paletteColors
  }

  return (
    <div className="group relative h-full">
      {/* Remove button overlay */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="absolute top-2 right-2 z-10 text-[12px] text-red-400 hover:text-red-300 bg-surface-raised/80 backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 px-2 py-1 rounded-lg border border-red-500/20"
      >
        Remove
      </button>
      <ChartWrapper
        title={chartFullData.title ?? undefined}
        subtitle={chartFullData.subtitle ?? undefined}
        source={chartFullData.source ?? undefined}
        sourceUrl={(chartFullData.config?.sourceUrl as string) ?? undefined}
        className="h-full cursor-grab active:cursor-grabbing"
        compact
      >
        <ObservableChartFactory
          data={chartFullData.data}
          config={chartConfig}
          chartType={chartType}
          autoHeight
        />
      </ChartWrapper>
    </div>
  )
}
