/**
 * ChatPage - Main chat interface.
 * Manages conversation flow with the backend.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useConversationStore } from '../stores/conversationStore'
import { Message } from '../components/chat/Message'
import { ChatInput, ChatInputHandle } from '../components/chat/ChatInput'
import { ProgressSteps } from '../components/chat/ProgressSteps'

// Phase labels for display
const PHASE_LABELS: Record<string, string> = {
  intent: 'Starting',
  context: 'Understanding context',
  generation: 'Generating',
  refinement: 'Refining',
  complete: 'Complete',
}

export default function ChatPage() {
  const {
    messages,
    phase,
    loading,
    currentTitle,
    conversationComplete,
    progressSteps,
    isStreaming,
    sendMessage,
    startNewConversation,
    loadConversation,
    loadConversationList,
    renameConversation,
    currentSessionId,
    getStepLabel,
  } = useConversationStore()

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<ChatInputHandle>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editingTitle, setEditingTitle] = useState('')
  const [prefillInput, setPrefillInput] = useState('')
  const [creationMode, setCreationMode] = useState<'chart' | 'dashboard' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Handle conversation loading based on URL params
  useEffect(() => {
    const sessionId = searchParams.get('session')
    const isNew = searchParams.get('new') === '1'

    if (isNew) {
      // Clear the query param and start fresh
      navigate('/chat', { replace: true })
      startNewConversation()
    } else if (sessionId) {
      // Load specific session, then clear param
      navigate('/chat', { replace: true })
      loadConversation(parseInt(sessionId, 10))
    } else {
      // Default: start fresh on chat page
      startNewConversation()
    }
    loadConversationList()
  }, []) // Only run on mount

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Get loading message based on phase
  const getLoadingMessage = useCallback(() => {
    switch (phase) {
      case 'intent':
        return 'Understanding your request...'
      case 'context':
        return messages.length <= 2
          ? 'Creating your dashboard plan...'
          : 'Updating the plan...'
      case 'generation':
        return 'Generating dashboard...'
      case 'refinement':
        return 'Applying your changes...'
      default:
        return 'Processing...'
    }
  }, [phase, messages.length])

  // Handle message submit
  const handleSubmit = async (content: string) => {
    setError(null)
    try {
      await sendMessage(content)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message'
      setError(errorMessage)
      console.error('Failed to send message:', err)
    }
  }

  // Handle option select (prefill input)
  const handleOptionSelect = (value: string) => {
    setPrefillInput(value)
  }

  // Handle action button click
  const handleActionClick = async (id: string) => {
    // View dashboard - open in new tab
    if (id.startsWith('view_dashboard:')) {
      const url = id.slice('view_dashboard:'.length)
      window.open(url, '_blank')
      return
    }

    // Done action - mark complete and navigate to charts/dashboards page
    if (id === 'done' || id === 'accept') {
      // Send action to backend to mark conversation complete
      try {
        await sendMessage(`__action:${id}`)
      } catch {
        // Continue even if backend call fails
      }
      // Navigate to appropriate page based on creation mode
      if (creationMode === 'chart') {
        navigate('/charts')
      } else {
        navigate('/dashboards')
      }
      return
    }

    // Creation actions - set mode and show chat input
    if (id === 'create_chart') {
      setCreationMode('chart')
      setTimeout(() => chatInputRef.current?.focus(), 100)
      return
    }
    if (id === 'create_dashboard') {
      setCreationMode('dashboard')
      setTimeout(() => chatInputRef.current?.focus(), 100)
      return
    }
    if (id === 'find_chart') {
      window.location.href = '/charts'
      return
    }
    if (id === 'find_dashboard') {
      window.location.href = '/dashboards'
      return
    }

    // Send action to backend
    setError(null)
    try {
      await sendMessage(`__action:${id}`)
      // Focus input for actions that expect user input (modify, edit, etc.)
      if (id === 'modify' || id === 'edit' || id === 'modify_plan') {
        setTimeout(() => chatInputRef.current?.focus(), 100)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Action failed'
      setError(errorMessage)
    }
  }

  // Title editing
  const startEditingTitle = () => {
    setIsEditingTitle(true)
    setEditingTitle(currentTitle || '')
  }

  const saveTitle = async () => {
    if (editingTitle.trim() && currentSessionId) {
      await renameConversation(currentSessionId, editingTitle.trim())
    }
    setIsEditingTitle(false)
  }

  const cancelEditTitle = () => {
    setIsEditingTitle(false)
    setEditingTitle('')
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveTitle()
    } else if (e.key === 'Escape') {
      cancelEditTitle()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'white',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--color-gray-200)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            minWidth: 0,
            flex: 1,
          }}
        >
          {isEditingTitle ? (
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              onBlur={saveTitle}
              autoFocus
              style={{
                fontWeight: 'var(--font-bold)' as unknown as number,
                color: 'var(--color-primary)',
                backgroundColor: 'white',
                border: '1px solid var(--color-primary)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 8px',
                outline: 'none',
                fontSize: 'var(--text-lg)',
              }}
            />
          ) : (
            <h2
              style={{
                fontWeight: 'var(--font-bold)' as unknown as number,
                fontFamily: 'var(--font-brand)',
                color: 'var(--color-brand)',
                fontSize: 'var(--text-lg)',
                margin: 0,
                cursor: 'pointer',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              onDoubleClick={startEditingTitle}
              title="Double-click to rename"
            >
              {currentTitle || 'New conversation'}
            </h2>
          )}
          <span
            style={{
              color: 'var(--color-gray-500)',
              fontSize: 'var(--text-sm)',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-brand)',
            }}
          >
            Phase: {loading ? 'Understanding...' : (PHASE_LABELS[phase] || phase)}
          </span>
        </div>
        <button
          onClick={startNewConversation}
          style={{
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-brand)',
            color: 'var(--color-gray-500)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 'var(--space-1) var(--space-2)',
            borderRadius: 'var(--radius-sm)',
            transition: 'color var(--transition-fast)',
            whiteSpace: 'nowrap',
            marginLeft: 'var(--space-2)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-gray-700)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-gray-500)'
          }}
        >
          + New
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-4)',
        }}
      >
        {messages.length === 0 && !creationMode ? (
          <WelcomeState onActionClick={handleActionClick} />
        ) : messages.length === 0 ? (
          <EmptyChat creationMode={creationMode} />
        ) : (
          <>
            {messages.map((message, index) => (
              <Message
                key={index}
                message={message}
                disabled={loading || conversationComplete}
                onOptionSelect={handleOptionSelect}
                onActionClick={handleActionClick}
              />
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Progress Steps */}
      <ProgressSteps
        steps={progressSteps}
        isStreaming={isStreaming}
        getStepLabel={getStepLabel}
      />

      {/* Error display */}
      {error && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: '#fef2f2',
            borderTop: '1px solid #fecaca',
            color: 'var(--color-error)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-brand)',
          }}
        >
          Error: {error}
        </div>
      )}

      {/* Input - only show when mode is selected or conversation has started, hide when complete */}
      {(creationMode || messages.length > 0) && !conversationComplete && (
        <div
          style={{
            padding: 'var(--space-4)',
            borderTop: '1px solid var(--color-gray-200)',
          }}
        >
          <ChatInput
            ref={chatInputRef}
            onSubmit={handleSubmit}
            disabled={loading}
            placeholder={
              creationMode === 'chart'
                ? 'Describe the chart you want to build...'
                : creationMode === 'dashboard'
                  ? 'Describe the dashboard you want to build...'
                  : undefined
            }
            loadingMessage={getLoadingMessage()}
            prefill={prefillInput}
            onPrefillClear={() => setPrefillInput('')}
          />
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Empty Chat State (after choosing mode)
// =============================================================================

interface EmptyChatProps {
  creationMode: 'chart' | 'dashboard' | null
}

function EmptyChat({ creationMode }: EmptyChatProps) {
  const message =
    creationMode === 'chart'
      ? 'Describe the chart you want to build below.'
      : creationMode === 'dashboard'
        ? 'Describe the dashboard you want to build below.'
        : 'Describe what you want to create below.'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--color-gray-400)',
        fontFamily: 'var(--font-brand)',
      }}
    >
      <p style={{ fontSize: 'var(--text-sm)' }}>{message}</p>
    </div>
  )
}

// =============================================================================
// Welcome State Component
// =============================================================================

interface WelcomeStateProps {
  onActionClick: (id: string) => void
}

function WelcomeState({ onActionClick }: WelcomeStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 'var(--space-8)',
        textAlign: 'center',
        color: 'var(--color-gray-500)',
        fontFamily: 'var(--font-brand)',
      }}
    >
      <h2
        style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--font-semibold)' as unknown as number,
          color: 'var(--color-brand)',
          marginBottom: 'var(--space-2)',
          fontFamily: 'var(--font-brand)',
        }}
      >
        Welcome to Story Analytics
      </h2>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          marginBottom: 'var(--space-8)',
          fontFamily: 'var(--font-brand)',
        }}
      >
        What would you like to do?
      </p>

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-6)',
          maxWidth: '600px',
          width: '100%',
        }}
      >
        {/* Charts Section */}
        <div
          style={{
            flex: 1,
            padding: 'var(--space-4)',
            border: '1px solid var(--color-gray-200)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-gray-50)',
          }}
        >
          <h3
            style={{
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--font-medium)' as unknown as number,
              color: 'var(--color-brand)',
              marginBottom: 'var(--space-3)',
              fontFamily: 'var(--font-brand)',
            }}
          >
            Charts
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <ActionButtonLarge
              label="Create New Chart"
              primary
              onClick={() => onActionClick('create_chart')}
            />
            <ActionButtonLarge
              label="Find / Edit Chart"
              onClick={() => onActionClick('find_chart')}
            />
          </div>
        </div>

        {/* Dashboards Section */}
        <div
          style={{
            flex: 1,
            padding: 'var(--space-4)',
            border: '1px solid var(--color-gray-200)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-gray-50)',
          }}
        >
          <h3
            style={{
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--font-medium)' as unknown as number,
              color: 'var(--color-brand)',
              marginBottom: 'var(--space-3)',
              fontFamily: 'var(--font-brand)',
            }}
          >
            Dashboards
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <ActionButtonLarge
              label="Create New Dashboard"
              primary
              onClick={() => onActionClick('create_dashboard')}
            />
            <ActionButtonLarge
              label="Find / Edit Dashboard"
              onClick={() => onActionClick('find_dashboard')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

interface ActionButtonLargeProps {
  label: string
  primary?: boolean
  onClick: () => void
}

function ActionButtonLarge({ label, primary = false, onClick }: ActionButtonLargeProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: 'var(--space-2) var(--space-4)',
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--font-medium)' as unknown as number,
        fontFamily: 'var(--font-brand)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        ...(primary
          ? {
              backgroundColor: 'var(--color-brand)',
              color: 'white',
              border: 'none',
            }
          : {
              backgroundColor: 'white',
              color: 'var(--color-gray-700)',
              border: '1px solid var(--color-gray-300)',
            }),
      }}
      onMouseEnter={(e) => {
        if (primary) {
          e.currentTarget.style.backgroundColor = 'var(--color-brand-dim)'
        } else {
          e.currentTarget.style.borderColor = 'var(--color-brand)'
          e.currentTarget.style.color = 'var(--color-brand)'
        }
      }}
      onMouseLeave={(e) => {
        if (primary) {
          e.currentTarget.style.backgroundColor = 'var(--color-brand)'
        } else {
          e.currentTarget.style.borderColor = 'var(--color-gray-300)'
          e.currentTarget.style.color = 'var(--color-gray-700)'
        }
      }}
    >
      {label}
    </button>
  )
}
