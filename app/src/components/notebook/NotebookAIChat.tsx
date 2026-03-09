import { useState, useRef, useEffect, useCallback } from 'react'
import { authFetch } from '../../utils/authFetch'
import { useNotebookStore } from '../../stores/notebookStore'

type CodeBlockType = 'python' | 'sql' | 'text'

interface ContentBlock {
  type: CodeBlockType
  content: string
}

/** Extract code blocks (python, sql) from markdown-formatted AI responses. */
function extractCodeBlocks(text: string): ContentBlock[] {
  const parts: ContentBlock[] = []
  const regex = /```(python|sql|py)?\s*\n([\s\S]*?)```/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index).trim()
      if (textContent) parts.push({ type: 'text', content: textContent })
    }
    const lang = (match[1] || '').toLowerCase()
    const blockType: CodeBlockType = lang === 'sql' ? 'sql' : 'python'
    parts.push({ type: blockType, content: match[2].trim() })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim()
    if (remaining) parts.push({ type: 'text', content: remaining })
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', content: text })
  }

  return parts
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  google: 'Google (Gemini)',
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface NotebookAIChatProps {
  notebookId: string
}

export function NotebookAIChat({ notebookId }: NotebookAIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const cells = useNotebookStore((s) => s.cells)
  const addCell = useNotebookStore((s) => s.addCell)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleInsertCell = useCallback(
    (code: string, type: 'python' | 'sql') => {
      const cellType = type === 'sql' ? 'sql' : 'code'
      addCell(cells.length, cellType, code)
    },
    [cells.length, addCell],
  )

  const [aiStatus, setAiStatus] = useState<{ available: boolean; provider: string; available_providers: string[] } | null>(null)

  // Check AI status on mount
  useEffect(() => {
    const abortController = new AbortController()
    authFetch('/api/v2/charts/ai-status', { signal: abortController.signal })
      .then((res) => {
        if (abortController.signal.aborted) return
        if (!res.ok) return
        return res.json()
      })
      .then((data) => {
        if (abortController.signal.aborted) return
        if (data) setAiStatus(data)
      })
      .catch(() => {})
    return () => abortController.abort()
  }, [])

  const providerLabel = aiStatus?.provider
    ? PROVIDER_LABELS[aiStatus.provider] ?? aiStatus.provider
    : null

  const handleProviderChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value
    try {
      await authFetch('/api/settings/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_provider: newProvider }),
      })
      setAiStatus((prev) => prev ? { ...prev, provider: newProvider } : prev)
    } catch {}
  }

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // Build conversation history for the LLM
    const allMessages = [...messages, userMsg]
    const apiMessages = allMessages.map((m) => ({ role: m.role, content: m.content }))

    // Include current notebook cell contents for context
    const cellContents = cells
      .filter((c) => c.source.trim())
      .map((c) => ({ cell_type: c.cell_type, source: c.source, df_var: c.dfVar }))

    authFetch(`/api/notebooks/${notebookId}/ai-assist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages, cells: cellContents }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error(body.detail ?? `Request failed: ${res.status}`)
        }
        return res.json()
      })
      .then((data: { content: string }) => {
        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: data.content,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, assistantMsg])
        setLoading(false)
      })
      .catch((err) => {
        const errorMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${err.message}`,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, errorMsg])
        setLoading(false)
      })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-default shrink-0">
        <h3 className="text-sm font-semibold text-text-primary">AI Assistant</h3>
        <p className="text-xs mt-0.5 text-text-muted">
          {aiStatus && aiStatus.available_providers.length > 1 ? (
            <>
              Using{' '}
              <select
                value={aiStatus.provider}
                onChange={handleProviderChange}
                className="text-xs bg-transparent border border-border-default rounded px-1 py-0.5 text-text-secondary cursor-pointer focus:outline-none focus:border-blue-400"
              >
                {aiStatus.available_providers.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p] ?? p}
                  </option>
                ))}
              </select>
            </>
          ) : providerLabel ? (
            <>Using <a href="/settings" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-secondary transition-colors">{providerLabel}</a></>
          ) : (
            'Get help writing Python or SQL code'
          )}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center py-8">
            <svg className="w-8 h-8 mx-auto text-text-icon mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            <p className="text-xs text-text-muted">
              Try: "Write a SQL query to group by month", "Plot a histogram of column X"
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`text-sm ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
          >
            {msg.role === 'user' ? (
              <div className="inline-block px-3 py-2 rounded-lg max-w-[85%] bg-blue-600 text-white">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[95%]">
                {extractCodeBlocks(msg.content).map((block, i) =>
                  block.type !== 'text' ? (
                    <div key={i} className="my-2">
                      <div className="flex items-center justify-between px-2 py-1 bg-gray-800 rounded-t text-[10px] text-gray-400">
                        <span>{block.type === 'sql' ? 'SQL' : 'Python'}</span>
                      </div>
                      <pre className="bg-gray-900 text-green-400 text-xs p-2.5 rounded-b overflow-x-auto">
                        <code>{block.content}</code>
                      </pre>
                      <button
                        onClick={() => handleInsertCell(block.content, block.type as 'python' | 'sql')}
                        className="mt-1 text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Insert as {block.type === 'sql' ? 'SQL' : 'Python'} cell
                      </button>
                    </div>
                  ) : (
                    <p key={i} className="text-sm text-text-primary bg-surface-inset rounded-lg px-3 py-2 my-1 whitespace-pre-wrap">
                      {block.content}
                    </p>
                  ),
                )}
              </div>
            )}
            <div className="text-[10px] mt-0.5 text-text-muted">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}

        {loading && (
          <div className="text-left">
            <div className="inline-block px-3 py-2 rounded-lg bg-surface-inset text-text-secondary text-sm">
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border-default shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            className="flex-1 px-3 py-2 text-sm border border-border-default rounded-lg resize-none bg-surface text-text-primary focus:outline-none focus:border-blue-400"
            style={{ minHeight: 36, maxHeight: 120 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 shrink-0 self-end"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
