import { useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useEditorStore } from '../stores/editorStore'
import { useDataStore } from '../stores/dataStore'
import { ChartWrapper } from '../components/charts/ChartWrapper'
import { ObservableChartFactory } from '../components/charts/ObservableChartFactory'
import { Toolbox } from '../components/editor/Toolbox'
import { AIChat } from '../components/editor/AIChat'
import { PALETTES } from '../themes/plotTheme'
import type { ChartConfig } from '../types/chart'

export function EditorPage() {
  const { chartId } = useParams<{ chartId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const store = useEditorStore()

  const isNew = chartId === 'new'
  const sourceId = searchParams.get('sourceId')

  // Load chart or init new on mount; reset store before loading a different chart
  useEffect(() => {
    if (isNew && sourceId) {
      store.reset()
      store.initNew(sourceId)
    } else if (chartId && chartId !== 'new' && chartId !== store.chartId) {
      store.reset()
      store.loadChart(chartId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId, sourceId])

  // Dual save paths
  const returnToDashboard = searchParams.get('returnToDashboard')

  const handleSave = useCallback(async () => {
    if (isNew || !store.chartId) {
      const newId = await store.saveNew()
      if (newId) {
        if (returnToDashboard) {
          navigate(`/dashboard/${returnToDashboard}/edit?addChart=${newId}`)
        } else {
          navigate(`/chart/${newId}`)
        }
      }
    } else {
      await store.save()
    }
  }, [isNew, store, navigate, returnToDashboard])

  // Keyboard shortcuts — use getState() to avoid reinstalling on every Zustand update
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useEditorStore.getState().undo()
      } else if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        useEditorStore.getState().redo()
      } else if (mod && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  const isDirty = store.isDirty()

  // Save button enabled logic
  const canSave = (isNew || !store.chartId)
    ? store.config.dataMode === 'sql'
      ? !!store.sql && !store.error  // SQL mode: enabled when query has been run (even with 0 rows)
      : !!store.sql && !store.error  // Table mode: also gate on no error to prevent saving stale data
    : isDirty                        // Existing chart: enabled when dirty

  // Map EditorConfig → ChartConfig for the renderer
  // Multi-Y: backend UNPIVOT produces metric_name/metric_value columns
  const isMultiY = Array.isArray(store.config.y) && store.config.y.length > 1
  const chartConfig: ChartConfig = {
    x: store.config.x ?? undefined,
    y: isMultiY ? 'metric_value' : (Array.isArray(store.config.y) ? store.config.y[0] : store.config.y) ?? undefined,
    series: isMultiY ? 'metric_name' : store.config.series ?? undefined,
    horizontal: store.config.horizontal,
    sort: store.config.sort,
    stacked: store.config.stacked,
    showGrid: store.config.showGrid,
    showLegend: store.config.showLegend,
    showValues: store.config.showValues,
    xAxisTitle: store.config.xAxisTitle || undefined,
    yAxisTitle: store.config.yAxisTitle || undefined,
    annotations: store.config.annotations,
    value: store.config.value ?? undefined,
    comparisonValue: store.config.comparisonValue ?? undefined,
    comparisonLabel: store.config.comparisonLabel || undefined,
    valueFormat: store.config.valueFormat || undefined,
    positiveIsGood: store.config.positiveIsGood,
  }

  // Apply palette colors
  const paletteColors = PALETTES[store.config.palette] ?? PALETTES.default
  if (store.config.palette !== 'default') {
    chartConfig.colorRange = paletteColors
  }

  const handleBack = useCallback(() => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) return
    if (isNew || !store.chartId) {
      useDataStore.getState().reset()
      navigate('/library')
    } else {
      navigate(`/chart/${store.chartId}`)
    }
  }, [isDirty, navigate, isNew, store.chartId])

  if (store.loading) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-text-secondary">Loading chart...</p>
        </div>
      </div>
    )
  }

  if (store.error && !store.data.length && !isNew) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4 max-w-md">
          <p className="text-sm text-red-700 font-medium">Failed to load chart</p>
          <p className="text-sm text-red-600 mt-1">{store.error}</p>
        </div>
      </div>
    )
  }

  const showEmptyState = isNew && store.data.length === 0

  return (
    <div className="h-screen flex flex-col bg-surface-secondary">
      {/* Header */}
      <header className="bg-surface border-b border-border-default shadow-sm px-5 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-sm text-text-secondary hover:text-text-on-surface transition-colors"
          >
            &larr; Back
          </button>
          <span className="text-base font-semibold text-text-primary">
            {isNew && !store.chartId ? 'New Chart' : store.config.title || 'Untitled Chart'}
          </span>
          {isDirty && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              Unsaved
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={store.undo}
            disabled={store.configHistory.length === 0}
            className="px-3 py-2 text-xs rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            onClick={store.redo}
            disabled={store.configFuture.length === 0}
            className="px-3 py-2 text-xs rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors disabled:opacity-30"
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </button>
          <div className="w-px h-5 bg-border-default mx-1" />
          {store.chartId && (
            <button
              onClick={store.discard}
              disabled={!isDirty}
              className="px-3 py-2 text-xs rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors disabled:opacity-30"
            >
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave || store.saving}
            className="px-4 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            title="Save (Ctrl+S)"
          >
            {store.saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      {/* Error banner */}
      {store.error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700 shrink-0">
          {store.error}
        </div>
      )}

      {/* Three-pane layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Toolbox */}
        <aside className="w-[280px] border-r border-border-default bg-surface overflow-y-auto shrink-0">
          <Toolbox />
        </aside>

        {/* Center: Chart Preview */}
        <main className="flex-1 p-6 overflow-y-auto flex items-start justify-center">
          <div className="w-full max-w-3xl">
            {showEmptyState ? (
              <div className="flex items-center justify-center h-80 border-2 border-dashed border-border-default rounded-xl">
                <div className="text-center">
                  <p className="text-sm text-text-muted">
                    {store.config.dataMode === 'sql'
                      ? 'Write a SQL query and click Run to see your data.'
                      : 'Pick a chart type and map your columns in the toolbox to get started.'}
                  </p>
                </div>
              </div>
            ) : (
              <ChartWrapper
                title={store.config.title || undefined}
                subtitle={store.config.subtitle || undefined}
                source={store.config.source || undefined}
                sourceUrl={store.config.sourceUrl || undefined}
              >
                <ObservableChartFactory
                  data={store.data}
                  config={chartConfig}
                  chartType={store.config.chartType}
                  height={420}
                  editable
                />
              </ChartWrapper>
            )}
          </div>
        </main>

        {/* Right: AI Chat */}
        <aside className="w-[320px] border-l border-border-default bg-surface shrink-0">
          <AIChat />
        </aside>
      </div>
    </div>
  )
}
