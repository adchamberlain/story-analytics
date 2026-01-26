/**
 * Main chart configuration editor component.
 * Combines form controls with AI assistant in a slide-out panel.
 */

import { useState, useEffect } from 'react'
import type { ChartConfig, ChartType, ChartRenderData } from '../../types/chart'
import { ConfigFormPanel } from './ConfigFormPanel'
import { ConfigAIAssistant } from './ConfigAIAssistant'
import { ChartFactory } from '../charts/ChartFactory'
import { updateChartConfig, fetchChartRenderData } from '../../api/client'

interface ChartConfigEditorProps {
  chartId: string
  chartType: ChartType
  initialConfig: Partial<ChartConfig>
  onClose: () => void
  onSave: () => void
}

export function ChartConfigEditor({
  chartId,
  chartType,
  initialConfig,
  onClose,
  onSave,
}: ChartConfigEditorProps) {
  // Local config state for live preview
  const [editedConfig, setEditedConfig] = useState<Partial<ChartConfig>>(initialConfig)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // State for live preview
  const [previewData, setPreviewData] = useState<ChartRenderData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)

  // Load chart data for preview
  useEffect(() => {
    setPreviewLoading(true)
    fetchChartRenderData(chartId)
      .then((data) => {
        setPreviewData(data)
      })
      .catch((err) => {
        console.error('Failed to load chart preview:', err)
      })
      .finally(() => {
        setPreviewLoading(false)
      })
  }, [chartId])

  // Handle form changes
  const handleConfigChange = (newConfig: Partial<ChartConfig>) => {
    setEditedConfig(newConfig)
    setError(null)
  }

  // Handle AI suggestion application
  const handleApplySuggestion = (suggestedConfig: Partial<ChartConfig>) => {
    setEditedConfig((prev) => ({
      ...prev,
      ...suggestedConfig,
    }))
    setError(null)
  }

  // Handle save
  const handleSave = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const result = await updateChartConfig(chartId, editedConfig)
      if (result.success) {
        onSave()
        onClose()
      } else {
        setError(result.error || 'Failed to save changes')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  // Check if config has changed
  const hasChanges = JSON.stringify(editedConfig) !== JSON.stringify(initialConfig)

  // Create preview spec with edited config
  const previewSpec = previewData
    ? {
        ...previewData.spec,
        config: {
          ...previewData.spec.config,
          ...editedConfig,
        },
      }
    : null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001,
        padding: 'var(--space-4)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--color-gray-800)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '1200px',
          height: '90vh',
          maxHeight: '800px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--color-gray-700)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              color: 'var(--color-gray-200)',
            }}
          >
            Edit Chart Configuration
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-gray-400)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            &times;
          </button>
        </div>

        {/* Main content - split view */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {/* Left side - Chart preview */}
          <div
            style={{
              flex: 1,
              padding: 'var(--space-4)',
              backgroundColor: 'white',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--color-gray-500)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 'var(--space-2)',
              }}
            >
              Live Preview
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
              }}
            >
              {previewLoading ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--color-gray-400)',
                  }}
                >
                  Loading preview...
                </div>
              ) : previewSpec && previewData ? (
                <ChartFactory
                  key={JSON.stringify(editedConfig)}
                  spec={previewSpec}
                  data={previewData.data}
                  columns={previewData.columns}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--color-gray-400)',
                  }}
                >
                  Failed to load preview
                </div>
              )}
            </div>
          </div>

          {/* Right side - Config editor */}
          <div
            style={{
              width: '380px',
              borderLeft: '1px solid var(--color-gray-700)',
              overflow: 'auto',
              padding: 'var(--space-4)',
            }}
          >
            {/* AI Assistant */}
            <ConfigAIAssistant
              chartId={chartId}
              chartType={chartType}
              currentConfig={editedConfig}
              onApplySuggestion={handleApplySuggestion}
            />

            {/* Divider */}
            <div
              style={{
                height: '1px',
                backgroundColor: 'var(--color-gray-700)',
                margin: 'var(--space-4) 0',
              }}
            />

            {/* Form controls */}
            <ConfigFormPanel
              chartType={chartType}
              config={editedConfig}
              onChange={handleConfigChange}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-4) var(--space-6)',
            borderTop: '1px solid var(--color-gray-700)',
          }}
        >
          {/* Error message */}
          {error && (
            <div
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-error)',
              }}
            >
              {error}
            </div>
          )}
          {!error && <div />}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              onClick={onClose}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: 'var(--color-gray-700)',
                border: '1px solid var(--color-gray-600)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-gray-200)',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: hasChanges ? 'var(--color-primary)' : 'var(--color-gray-600)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                cursor: isSaving || !hasChanges ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? 'Saving...' : 'Apply Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
