import { useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEditorStore } from '../stores/editorStore'
import { ChartWrapper } from '../components/charts/ChartWrapper'
import { ObservableChartFactory } from '../components/charts/ObservableChartFactory'
import { Toolbox } from '../components/editor/Toolbox'
import { AIChat } from '../components/editor/AIChat'
import { PALETTES } from '../themes/datawrapper'
import type { ChartConfig } from '../types/chart'

export function EditorPage() {
  const { chartId } = useParams<{ chartId: string }>()
  const navigate = useNavigate()
  const store = useEditorStore()

  // Load chart on mount
  useEffect(() => {
    if (chartId && chartId !== store.chartId) {
      store.loadChart(chartId)
    }
    return () => store.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        store.undo()
      } else if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        store.redo()
      } else if (mod && e.key === 's') {
        e.preventDefault()
        store.save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [store])

  const isDirty = store.isDirty()

  // Map EditorConfig → ChartConfig for the renderer
  const chartConfig: ChartConfig = {
    x: store.config.x ?? undefined,
    y: store.config.y ?? undefined,
    series: store.config.series ?? undefined,
    horizontal: store.config.horizontal,
    sort: store.config.sort,
    stacked: store.config.stacked,
    showGrid: store.config.showGrid,
    showLegend: store.config.showLegend,
    showValues: store.config.showValues,
    xAxisTitle: store.config.xAxisTitle || undefined,
    yAxisTitle: store.config.yAxisTitle || undefined,
  }

  // Apply palette colors
  const paletteColors = PALETTES[store.config.palette] ?? PALETTES.default
  if (store.config.palette !== 'default') {
    chartConfig.color = paletteColors[paletteColors.length - 1] as string
  }

  const handleBack = useCallback(() => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) return
    navigate(chartId ? `/chart/${chartId}` : '/create/ai')
  }, [isDirty, navigate, chartId])

  if (store.loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm" style={{ color: '#666' }}>Loading chart...</p>
        </div>
      </div>
    )
  }

  if (store.error && !store.data.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4 max-w-md">
          <p className="text-sm text-red-700 font-medium">Failed to load chart</p>
          <p className="text-sm text-red-600 mt-1">{store.error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            &larr; Back
          </button>
          <span className="text-sm font-medium" style={{ color: '#1a1a1a' }}>
            {store.config.title || 'Untitled Chart'}
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
            className="px-2.5 py-1.5 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            onClick={store.redo}
            disabled={store.configFuture.length === 0}
            className="px-2.5 py-1.5 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-30"
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </button>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button
            onClick={store.discard}
            disabled={!isDirty}
            className="px-3 py-1.5 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-30"
          >
            Discard
          </button>
          <button
            onClick={store.save}
            disabled={!isDirty || store.saving}
            className="px-4 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
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
        <aside className="w-[280px] border-r border-gray-200 bg-white overflow-y-auto shrink-0">
          <Toolbox />
        </aside>

        {/* Center: Chart Preview */}
        <main className="flex-1 p-6 overflow-y-auto flex items-start justify-center">
          <div className="w-full max-w-3xl">
            <ChartWrapper
              title={store.config.title || undefined}
              subtitle={store.config.subtitle || undefined}
              source={store.config.source || undefined}
            >
              <ObservableChartFactory
                data={store.data}
                config={chartConfig}
                chartType={store.config.chartType}
                height={420}
              />
            </ChartWrapper>
          </div>
        </main>

        {/* Right: AI Chat */}
        <aside className="w-[320px] border-l border-gray-200 bg-white shrink-0">
          <AIChat />
        </aside>
      </div>
    </div>
  )
}
