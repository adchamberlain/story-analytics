import { useState } from 'react'
import { ChartWrapper } from '../charts/ChartWrapper'
import { ObservableChartFactory } from '../charts/ObservableChartFactory'
import type { ChartProposal as ChartProposalType } from '../../stores/createStore'
import type { ChartType, ChartConfig } from '../../types/chart'

interface ChartProposalProps {
  proposal: ChartProposalType
  onSave: () => void
  onTryDifferent: (hint: string) => void
  saving: boolean
  savedChartId: string | null
}

export function ChartProposal({
  proposal,
  onSave,
  onTryDifferent,
  saving,
  savedChartId,
}: ChartProposalProps) {
  const [hint, setHint] = useState('')
  const [showSQL, setShowSQL] = useState(false)

  const { config, reasoning, sql, data } = proposal

  // Map proposal config to ChartConfig for the factory
  const chartConfig: ChartConfig = {
    x: config.x ?? undefined,
    y: config.y ?? undefined,
    series: config.series ?? undefined,
    horizontal: config.horizontal,
    sort: config.sort,
  }

  const chartType = (config.chart_type ?? 'BarChart') as ChartType

  return (
    <div className="space-y-6">
      {/* AI reasoning */}
      {reasoning && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>
            AI recommendation
          </p>
          <p className="text-sm mt-1" style={{ color: '#666666' }}>
            {reasoning}
          </p>
        </div>
      )}

      {/* The chart */}
      <ChartWrapper
        title={config.title ?? undefined}
        subtitle={config.subtitle ?? undefined}
        source={config.source ?? undefined}
      >
        <ObservableChartFactory
          data={data}
          config={chartConfig}
          chartType={chartType}
          height={400}
        />
      </ChartWrapper>

      {/* SQL toggle */}
      {sql && (
        <div>
          <button
            onClick={() => setShowSQL(!showSQL)}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            {showSQL ? 'Hide SQL' : 'Show SQL'}
          </button>
          {showSQL && (
            <pre className="mt-2 bg-gray-900 text-gray-100 rounded-lg px-4 py-3 text-xs overflow-x-auto">
              {sql}
            </pre>
          )}
        </div>
      )}

      {/* Actions */}
      {savedChartId ? (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-green-700 font-medium">
            Chart saved successfully
          </p>
          <div className="flex items-center gap-3">
            <a
              href={`/editor/${savedChartId}`}
              className="text-sm text-blue-600 underline hover:text-blue-800"
            >
              Edit chart
            </a>
            <a
              href={`/chart/${savedChartId}`}
              className="text-sm text-green-700 underline hover:text-green-900"
            >
              View chart
            </a>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Chart'}
          </button>

          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="Try a different approach... (e.g., &quot;show as line chart&quot;)"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && hint.trim()) {
                  onTryDifferent(hint.trim())
                  setHint('')
                }
              }}
            />
            <button
              onClick={() => {
                if (hint.trim()) {
                  onTryDifferent(hint.trim())
                  setHint('')
                }
              }}
              disabled={!hint.trim()}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
