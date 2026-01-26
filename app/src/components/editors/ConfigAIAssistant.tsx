/**
 * AI assistant panel for natural language config changes.
 */

import { useState } from 'react'
import type { ChartConfig, ChartType } from '../../types/chart'
import { getConfigSuggestion } from '../../api/client'

interface ConfigAIAssistantProps {
  chartId: string
  chartType: ChartType
  currentConfig: Partial<ChartConfig>
  onApplySuggestion: (config: Partial<ChartConfig>) => void
}

// Example suggestions based on chart type
const EXAMPLE_CHIPS: Record<string, string[]> = {
  BarChart: ['Make horizontal', 'Stack the bars', 'Change to blue', 'Add axis labels'],
  LineChart: ['Change to green', 'Stack the series', 'Add chart title'],
  AreaChart: ['Stack the areas', 'Change color to purple', 'Add axis titles'],
  BigValue: ['Format as currency', 'Positive is bad', 'Hide trend arrow', 'Use bar sparkline'],
  default: ['Change color to blue', 'Add axis labels', 'Add chart title'],
}

export function ConfigAIAssistant({
  chartId,
  chartType,
  currentConfig,
  onApplySuggestion,
}: ConfigAIAssistantProps) {
  const [request, setRequest] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [suggestion, setSuggestion] = useState<{
    config: Partial<ChartConfig>
    explanation: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const examples = EXAMPLE_CHIPS[chartType] || EXAMPLE_CHIPS.default

  const handleSubmit = async (text: string) => {
    if (!text.trim()) return

    setIsLoading(true)
    setError(null)
    setSuggestion(null)

    try {
      const response = await getConfigSuggestion(chartId, currentConfig, chartType, text)

      if (Object.keys(response.suggested_config).length === 0) {
        setError(response.explanation || 'Could not generate a suggestion for that request.')
      } else {
        setSuggestion({
          config: response.suggested_config,
          explanation: response.explanation,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get suggestion')
    } finally {
      setIsLoading(false)
    }
  }

  const handleApply = () => {
    if (suggestion) {
      onApplySuggestion(suggestion.config)
      setSuggestion(null)
      setRequest('')
    }
  }

  const handleChipClick = (text: string) => {
    setRequest(text)
    handleSubmit(text)
  }

  return (
    <div>
      <div
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: 'var(--color-gray-400)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 'var(--space-2)',
        }}
      >
        AI Assistant
      </div>

      {/* Input area */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <input
          type="text"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit(request)}
          placeholder="What would you like to change?"
          disabled={isLoading}
          style={{
            flex: 1,
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'var(--color-gray-800)',
            border: '1px solid var(--color-gray-600)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-gray-200)',
            fontSize: 'var(--text-sm)',
          }}
        />
        <button
          onClick={() => handleSubmit(request)}
          disabled={isLoading || !request.trim()}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            backgroundColor: 'var(--color-primary)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: 'white',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: isLoading || !request.trim() ? 'not-allowed' : 'pointer',
            opacity: isLoading || !request.trim() ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {isLoading ? 'Thinking...' : 'Suggest'}
        </button>
      </div>

      {/* Example chips */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-3)',
        }}
      >
        {examples.map((example) => (
          <button
            key={example}
            onClick={() => handleChipClick(example)}
            disabled={isLoading}
            style={{
              padding: 'var(--space-1) var(--space-2)',
              backgroundColor: 'var(--color-gray-700)',
              border: '1px solid var(--color-gray-600)',
              borderRadius: 'var(--radius-full)',
              color: 'var(--color-gray-300)',
              fontSize: 'var(--text-xs)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {example}
          </button>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--color-error)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-error)',
            }}
          >
            {error}
          </div>
        </div>
      )}

      {/* Suggestion display */}
      {suggestion && (
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-gray-800)',
            border: '1px solid var(--color-gray-600)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-gray-200)',
              marginBottom: 'var(--space-2)',
            }}
          >
            {suggestion.explanation}
          </div>

          {/* Show what will change */}
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-gray-400)',
              fontFamily: 'var(--font-mono)',
              padding: 'var(--space-2)',
              backgroundColor: 'var(--color-gray-900)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 'var(--space-3)',
            }}
          >
            {Object.entries(suggestion.config).map(([key, value]) => (
              <div key={key}>
                {key}: {JSON.stringify(value)}
              </div>
            ))}
          </div>

          <button
            onClick={handleApply}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              backgroundColor: 'var(--color-success)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'white',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Apply Suggestion
          </button>
        </div>
      )}
    </div>
  )
}
