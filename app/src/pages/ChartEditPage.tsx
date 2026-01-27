/**
 * Focused chart edit page.
 * Provides an immersive editing experience with live chart preview,
 * chat input for AI modifications, and Done/Cancel flow.
 *
 * Layout: Chart preview on left, chat panel on right (like Cursor).
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getChart,
  getChartSession,
  fetchChartRenderData,
  sendChartMessageStream,
  updateChart,
  updateChartConfig,
} from '../api/client'
import type { ChartStreamCallbacks, ChartMessageResponse } from '../api/client'
import { ChartFactory } from '../components/charts/ChartFactory'
import type { ChartRenderData } from '../types/chart'
import type { ChartLibraryItem, ProgressEvent } from '../types/conversation'

// Edit history message type
interface EditMessage {
  role: 'user' | 'assistant'
  content: string
}

export function ChartEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Chart data state
  const [chart, setChart] = useState<ChartLibraryItem | null>(null)
  const [renderData, setRenderData] = useState<ChartRenderData | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)

  // Original data for cancel/revert
  const [originalChart, setOriginalChart] = useState<ChartLibraryItem | null>(null)

  // Edit history
  const [editHistory, setEditHistory] = useState<EditMessage[]>([])

  // UI state
  const [inputValue, setInputValue] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [chartVersion, setChartVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Refs
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const historyRef = useRef<HTMLDivElement>(null)

  // Load chart data on mount
  useEffect(() => {
    async function loadChart() {
      if (!id) return

      setIsLoading(true)
      setError(null)

      try {
        // Load chart data and session in parallel
        const [chartData, sessionData, renderResult] = await Promise.all([
          getChart(id),
          getChartSession(id),
          fetchChartRenderData(id),
        ])

        setChart(chartData)
        setOriginalChart(JSON.parse(JSON.stringify(chartData)))
        setSessionId(sessionData.session_id)
        setRenderData(renderResult)
      } catch (err) {
        console.error('Failed to load chart:', err)
        setError(err instanceof Error ? err.message : 'Failed to load chart')
      } finally {
        setIsLoading(false)
      }
    }

    loadChart()
  }, [id])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current()
      }
    }
  }, [])

  // Auto-scroll history when new messages arrive
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight
    }
  }, [editHistory, isProcessing])

  // Handle sending a modification request
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || !sessionId || !id || isProcessing) return

    const userMessage = inputValue.trim()

    // Add user message to history immediately
    setEditHistory((prev) => [...prev, { role: 'user', content: userMessage }])

    setIsProcessing(true)
    setError(null)
    setProgressMessage('Thinking...')
    setInputValue('')

    const callbacks: ChartStreamCallbacks = {
      onProgress: (event: ProgressEvent) => {
        setProgressMessage(event.message || 'Processing...')
      },
      onComplete: async (response: ChartMessageResponse) => {
        try {
          // Add AI response to history
          if (response.response) {
            setEditHistory((prev) => [...prev, { role: 'assistant', content: response.response }])
          }

          // Refresh chart data and render
          const [newChart, newRenderData] = await Promise.all([
            getChart(id),
            fetchChartRenderData(id),
          ])

          setChart(newChart)
          setRenderData(newRenderData)
          setChartVersion((v) => v + 1)
          setHasChanges(true)
          setProgressMessage(null)
          inputRef.current?.focus()
        } catch (err) {
          console.error('Failed to refresh chart:', err)
          setError('Chart was updated but failed to refresh preview')
        } finally {
          setIsProcessing(false)
        }
      },
      onError: (errorMsg: string) => {
        // Add error as assistant message
        setEditHistory((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${errorMsg}` },
        ])
        setError(errorMsg)
        setProgressMessage(null)
        setIsProcessing(false)
      },
    }

    abortRef.current = sendChartMessageStream(userMessage, sessionId, callbacks)
  }, [inputValue, sessionId, id, isProcessing])

  // Handle Done - save changes and return
  const handleDone = useCallback(() => {
    navigate('/charts')
  }, [navigate])

  // Handle Cancel - revert all changes and return
  const handleCancel = useCallback(async () => {
    if (hasChanges && originalChart && id) {
      try {
        // Restore original chart data
        await updateChart(id, {
          sql: originalChart.sql,
          title: originalChart.title,
          description: originalChart.description,
        })

        // Restore original config (convert null to undefined for type compatibility)
        const configToRestore: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(originalChart.config)) {
          configToRestore[key] = value === null ? undefined : value
        }
        await updateChartConfig(id, configToRestore)
      } catch (err) {
        console.error('Failed to revert changes:', err)
        // Still navigate away even if revert fails
      }
    }

    navigate('/charts')
  }, [hasChanges, originalChart, id, navigate])

  // Handle Enter key to send (Shift+Enter for newline)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  // Loading state
  if (isLoading) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-gray-900)',
          color: 'var(--color-gray-400)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid var(--color-gray-700)',
              borderTopColor: 'var(--color-primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto var(--space-4)',
            }}
          />
          Loading chart...
        </div>
      </div>
    )
  }

  // Error state
  if (error && !chart) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-gray-900)',
          color: 'var(--color-gray-400)',
          gap: 'var(--space-4)',
        }}
      >
        <span style={{ color: 'var(--color-error)' }}>{error}</span>
        <button
          onClick={() => navigate('/charts')}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            backgroundColor: 'var(--color-gray-700)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-gray-300)',
            cursor: 'pointer',
          }}
        >
          Back to Charts
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-gray-900)',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--color-gray-700)',
          gap: 'var(--space-3)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleCancel}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-gray-400)',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '1.2em' }}>&larr;</span>
          Back
        </button>

        <div style={{ flex: 1 }} />

        <h1
          style={{
            margin: 0,
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            color: 'var(--color-gray-200)',
          }}
        >
          Editing: {chart?.title}
        </h1>

        <div style={{ flex: 1 }} />

        {/* Action buttons in header */}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            onClick={handleCancel}
            disabled={isProcessing}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              backgroundColor: 'var(--color-gray-700)',
              border: '1px solid var(--color-gray-600)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-gray-200)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              opacity: isProcessing ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleDone}
            disabled={isProcessing}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              backgroundColor: 'var(--color-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'white',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              opacity: isProcessing ? 0.5 : 1,
            }}
          >
            Done
          </button>
        </div>
      </header>

      {/* Main content - side by side */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Left: Chart preview */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: 'var(--space-4)',
            minWidth: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              backgroundColor: 'white',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {renderData ? (
              <ChartFactory
                key={`chart-${id}-v${chartVersion}`}
                spec={renderData.spec}
                data={renderData.data}
                columns={renderData.columns}
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
                Failed to load chart preview
              </div>
            )}

            {/* Processing overlay */}
            {isProcessing && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      border: '3px solid rgba(255, 255, 255, 0.3)',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto var(--space-3)',
                    }}
                  />
                  {progressMessage || 'Updating...'}
                </div>
              </div>
            )}
          </div>

          {/* Original request */}
          <div
            style={{
              marginTop: 'var(--space-3)',
              padding: 'var(--space-2) var(--space-3)',
              backgroundColor: 'var(--color-gray-800)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-gray-500)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <span style={{ color: 'var(--color-gray-400)' }}>Original: </span>
            {chart?.original_request || chart?.description}
          </div>
        </div>

        {/* Right: Chat panel */}
        <div
          style={{
            width: '380px',
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid var(--color-gray-700)',
            backgroundColor: 'var(--color-gray-850)',
          }}
        >
          {/* Chat header */}
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              borderBottom: '1px solid var(--color-gray-700)',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-gray-300)',
              }}
            >
              Edit History
            </h2>
          </div>

          {/* Chat history */}
          <div
            ref={historyRef}
            style={{
              flex: 1,
              overflow: 'auto',
              padding: 'var(--space-3)',
            }}
          >
            {editHistory.length === 0 && !isProcessing && (
              <div
                style={{
                  color: 'var(--color-gray-500)',
                  fontSize: 'var(--text-sm)',
                  textAlign: 'center',
                  padding: 'var(--space-8) var(--space-4)',
                }}
              >
                Describe what you'd like to change about this chart.
              </div>
            )}

            {editHistory.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  marginBottom: 'var(--space-3)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-2)',
                    alignItems: 'flex-start',
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      color:
                        msg.role === 'user' ? 'var(--color-warning)' : 'var(--color-primary)',
                      minWidth: '20px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {msg.role === 'user' ? '$' : '~'}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      color:
                        msg.role === 'user' ? 'var(--color-gray-200)' : 'var(--color-gray-400)',
                      lineHeight: 1.5,
                    }}
                  >
                    {msg.content}
                  </span>
                </div>
              </div>
            ))}

            {/* Show typing indicator while processing */}
            {isProcessing && (
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-2)',
                    alignItems: 'flex-start',
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      color: 'var(--color-primary)',
                      minWidth: '20px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    ~
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-gray-500)',
                      fontStyle: 'italic',
                    }}
                  >
                    {progressMessage || 'Thinking...'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div
              style={{
                padding: '0 var(--space-3)',
                marginBottom: 'var(--space-2)',
              }}
            >
              <div
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--color-error)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-error)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                {error}
              </div>
            </div>
          )}

          {/* Input area */}
          <div
            style={{
              padding: 'var(--space-3)',
              borderTop: '1px solid var(--color-gray-700)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your changes..."
                disabled={isProcessing}
                rows={3}
                style={{
                  width: '100%',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-gray-800)',
                  border: '1px solid var(--color-gray-600)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-200)',
                  fontSize: 'var(--text-sm)',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-gray-500)',
                  }}
                >
                  Shift+Enter for newline
                </span>
                <button
                  onClick={handleSend}
                  disabled={isProcessing || !inputValue.trim()}
                  style={{
                    padding: 'var(--space-2) var(--space-4)',
                    backgroundColor: 'var(--color-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    cursor: isProcessing || !inputValue.trim() ? 'not-allowed' : 'pointer',
                    opacity: isProcessing || !inputValue.trim() ? 0.5 : 1,
                  }}
                >
                  {isProcessing ? 'Updating...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
