import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { authFetch } from '../../utils/authFetch'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface AiSqlAssistantProps {
  dialect: string
  schemaContext: string
  currentSql: string
  errorMessage: string | null
  onInsertSql: (sql: string) => void
  aiConfigured?: boolean
  autoExpandWithError?: boolean
}

/** Extract SQL code blocks from markdown-ish AI response text. */
function extractSqlBlocks(text: string): { type: 'text' | 'sql'; content: string }[] {
  const parts: { type: 'text' | 'sql'; content: string }[] = []
  const regex = /```sql\s*\n([\s\S]*?)```/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'sql', content: match[1].trim() })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', content: text })
  }

  return parts
}

export function AiSqlAssistant({
  dialect,
  schemaContext,
  currentSql,
  errorMessage,
  onInsertSql,
  aiConfigured = true,
  autoExpandWithError = false,
}: AiSqlAssistantProps) {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevErrorRef = useRef<string | null>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // "Fix with AI" integration: auto-expand and send when error transitions from null to string
  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
      }

      setMessages((prev) => [...prev, userMsg])
      setLoading(true)

      try {
        const allMessages = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const res = await authFetch('/api/ai/sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: allMessages,
            dialect,
            schema_context: schemaContext,
            current_sql: currentSql,
            error_message: errorMessage,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          const assistantMsg: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: data.response ?? data.content ?? 'No response received.',
          }
          setMessages((prev) => [...prev, assistantMsg])
        } else {
          const assistantMsg: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: 'Sorry, something went wrong. Please try again.',
          }
          setMessages((prev) => [...prev, assistantMsg])
        }
      } catch {
        const assistantMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Network error. Please check your connection and try again.',
        }
        setMessages((prev) => [...prev, assistantMsg])
      } finally {
        setLoading(false)
      }
    },
    [messages, dialect, schemaContext, currentSql, errorMessage],
  )

  useEffect(() => {
    if (
      autoExpandWithError &&
      errorMessage !== null &&
      prevErrorRef.current === null
    ) {
      setExpanded(true)
      sendMessage(`Fix this SQL error: ${errorMessage}`)
    }
    prevErrorRef.current = errorMessage
  }, [errorMessage, autoExpandWithError, sendMessage])

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    sendMessage(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border border-border-default rounded-lg overflow-hidden bg-surface">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-surface-raised hover:bg-surface-inset transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span>AI Assistant</span>
          {!aiConfigured && (
            <span className="text-xs text-text-muted">
              {' \u2014 '}
              <Link
                to="/settings"
                className="underline hover:text-text-secondary transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                Set up AI provider in Settings
              </Link>
            </span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border-default">
          {/* Chat thread */}
          <div className="overflow-y-auto px-3 py-2 space-y-2" style={{ maxHeight: 200 }}>
            {messages.length === 0 && !loading && (
              <p className="text-xs text-text-muted text-center py-4">
                Ask me to write SQL, explain queries, or fix errors.
              </p>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`text-sm ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
              >
                <div
                  className={`inline-block px-3 py-1.5 rounded-lg max-w-[85%] ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-surface-inset text-text-primary'
                  }`}
                >
                  {msg.role === 'assistant'
                    ? extractSqlBlocks(msg.content).map((block, i) =>
                        block.type === 'sql' ? (
                          <div key={i} className="my-1">
                            <pre className="bg-gray-900 text-green-400 text-xs p-2 rounded overflow-x-auto">
                              <code>{block.content}</code>
                            </pre>
                            <button
                              onClick={() => onInsertSql(block.content)}
                              className="mt-1 text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                            >
                              Insert into SQL
                            </button>
                          </div>
                        ) : (
                          <span key={i}>{block.content}</span>
                        ),
                      )
                    : msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="text-left">
                <div className="inline-block px-3 py-1.5 rounded-lg bg-surface-inset text-text-muted text-sm">
                  Thinking...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-border-default px-3 py-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the data you want..."
                className="flex-1 px-2 py-1.5 text-sm border border-border-default rounded bg-surface text-text-primary focus:outline-none focus:border-blue-400"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 shrink-0"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
