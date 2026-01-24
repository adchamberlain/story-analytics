/**
 * ChatPage - Main chat interface.
 * Manages conversation flow with the backend.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useConversationStore } from '../stores/conversationStore'
import { Message } from '../components/chat/Message'
import { ChatInput } from '../components/chat/ChatInput'
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

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editingTitle, setEditingTitle] = useState('')
  const [prefillInput, setPrefillInput] = useState('')

  // Load conversation on mount
  useEffect(() => {
    loadConversation()
    loadConversationList()
  }, [loadConversation, loadConversationList])

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
    try {
      await sendMessage(content)
    } catch (error) {
      console.error('Failed to send message:', error)
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

    // Navigation actions
    if (id === 'create_chart') {
      window.location.href = '/charts/new'
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
    await sendMessage(`__action:${id}`)
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
                color: 'var(--color-primary)',
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
            }}
          >
            Phase: {PHASE_LABELS[phase] || phase}
          </span>
        </div>
        <button
          onClick={startNewConversation}
          style={{
            fontSize: 'var(--text-sm)',
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
        {messages.length === 0 ? (
          <WelcomeState onActionClick={handleActionClick} />
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

      {/* Input */}
      <div
        style={{
          padding: 'var(--space-4)',
          borderTop: '1px solid var(--color-gray-200)',
        }}
      >
        <ChatInput
          onSubmit={handleSubmit}
          disabled={loading}
          loadingMessage={getLoadingMessage()}
          prefill={prefillInput}
          onPrefillClear={() => setPrefillInput('')}
        />
      </div>
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
      }}
    >
      <h2
        style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--font-semibold)' as unknown as number,
          color: 'var(--color-gray-700)',
          marginBottom: 'var(--space-2)',
        }}
      >
        Welcome to Story Analytics
      </h2>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          marginBottom: 'var(--space-8)',
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
              color: 'var(--color-primary)',
              marginBottom: 'var(--space-3)',
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
              color: 'var(--color-primary)',
              marginBottom: 'var(--space-3)',
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
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        ...(primary
          ? {
              backgroundColor: 'var(--color-primary)',
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
          e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'
        } else {
          e.currentTarget.style.borderColor = 'var(--color-primary)'
          e.currentTarget.style.color = 'var(--color-primary)'
        }
      }}
      onMouseLeave={(e) => {
        if (primary) {
          e.currentTarget.style.backgroundColor = 'var(--color-primary)'
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
