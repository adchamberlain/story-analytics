import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useEditorStore } from '../../stores/editorStore'

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  google: 'Google (Gemini)',
}

export function AIChat() {
  const chatMessages = useEditorStore((s) => s.chatMessages)
  const chatLoading = useEditorStore((s) => s.chatLoading)
  const sendChatMessage = useEditorStore((s) => s.sendChatMessage)

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  const handleSend = () => {
    const text = input.trim()
    if (!text || chatLoading) return
    setInput('')
    sendChatMessage(text)
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
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

  const [aiStatus, setAiStatus] = useState<{ available: boolean; provider: string } | null>(null)
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)

  // Check if AI is available and which provider
  useEffect(() => {
    fetch('/api/v2/charts/ai-status')
      .then((res) => {
        if (!res.ok) {
          setAiAvailable(false)
          return
        }
        return res.json()
      })
      .then((data) => {
        if (data) {
          setAiStatus(data)
          setAiAvailable(true)
        }
      })
      .catch(() => setAiAvailable(false))
  }, [])

  const providerLabel = aiStatus?.provider
    ? PROVIDER_LABELS[aiStatus.provider] ?? aiStatus.provider
    : null

  if (aiAvailable === false) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-border-default shrink-0">
          <h3 className="text-sm font-semibold text-text-primary">AI Assistant</h3>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <svg className="w-8 h-8 mx-auto text-text-icon mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            <p className="text-sm font-medium text-text-secondary mb-1">No AI provider configured</p>
            <p className="text-xs text-text-muted">
              Add an API key in Settings to enable AI-assisted chart editing.
              Supports Anthropic, OpenAI, Google, or local models.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-default shrink-0">
        <h3 className="text-sm font-semibold text-text-primary">AI Assistant</h3>
        <p className="text-xs mt-0.5 text-text-muted">
          {providerLabel ? (
            <>Using <Link to="/settings" className="underline hover:text-text-secondary transition-colors">{providerLabel}</Link></>
          ) : (
            'Describe changes in natural language'
          )}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {chatMessages.length === 0 && !chatLoading && (
          <div className="text-center py-8">
            <p className="text-xs text-text-muted">
              Try: "Make bars horizontal", "Change to line chart", "Use blue palette"
            </p>
          </div>
        )}

        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`text-sm ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
          >
            <div
              className={`inline-block px-3 py-2 rounded-lg max-w-[85%] ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-surface-inset text-text-primary'
              }`}
            >
              {msg.content}
            </div>
            <div className="text-[10px] mt-0.5 text-text-muted">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}

        {chatLoading && (
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
            placeholder="Describe a change..."
            rows={1}
            className="flex-1 px-3 py-2 text-sm border border-border-default rounded-lg resize-none bg-surface text-text-primary focus:outline-none focus:border-blue-400"
            style={{ minHeight: 36, maxHeight: 120 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || chatLoading}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 shrink-0 self-end"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
