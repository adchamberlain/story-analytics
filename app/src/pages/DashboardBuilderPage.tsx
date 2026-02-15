import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  GridLayout,
  useContainerWidth,
  type LayoutItem,
  type Layout,
} from 'react-grid-layout'
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
  HeatMap: 'Heatmap',
  BoxPlot: 'Box Plot',
  PieChart: 'Pie',
  Treemap: 'Treemap',
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
    if (id) navigate(`/dashboard/${id}`)
  }, [store, navigate])

  const handleAddChart = useCallback((chartId: string) => {
    store.addChart(chartId)
    store.setPickerOpen(false)
  }, [store])

  const handleCreateNew = useCallback(() => {
    store.setPickerOpen(false)
    navigate('/editor/new/source')
  }, [store, navigate])

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
  }, [store.charts, chartMeta])

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
          onClick={() => navigate(-1)}
          className="text-[15px] text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
        <div className="flex items-center gap-3">
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
                      ref_={ref}
                      meta={chartMeta[ref.chart_id]}
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
    </div>
  )
}

// ── Builder Grid Card ───────────────────────────────────────────────────────

function BuilderGridCard({
  ref_,
  meta,
  onRemove,
}: {
  ref_: DashboardChartRef
  meta?: ChartMeta
  onRemove: () => void
}) {
  const typeLabel = meta
    ? CHART_TYPE_LABELS[meta.chart_type] ?? meta.chart_type
    : '...'

  return (
    <div className="group bg-surface-raised rounded-2xl border border-border-default shadow-card h-full flex flex-col cursor-grab active:cursor-grabbing">
      {/* Drag handle area */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Drag grip icon */}
          <svg className="h-4 w-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="7" r="1.5" /><circle cx="15" cy="7" r="1.5" />
            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="17" r="1.5" /><circle cx="15" cy="17" r="1.5" />
          </svg>
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
            {typeLabel}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="text-[12px] text-red-400 hover:text-red-300 transition-colors opacity-0 group-hover:opacity-100 px-2 py-1 rounded-lg"
        >
          Remove
        </button>
      </div>

      {/* Chart title */}
      <div className="flex-1 flex items-start px-5 pb-4">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold truncate text-text-primary">
            {meta?.title ?? `Chart ${ref_.chart_id.slice(0, 8)}...`}
          </p>
          {meta?.subtitle && (
            <p className="text-[13px] text-text-muted mt-0.5 truncate">
              {meta.subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
