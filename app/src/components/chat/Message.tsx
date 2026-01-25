/**
 * Message component for chat UI.
 * Renders user and assistant messages with markdown support.
 */

import ReactMarkdown from 'react-markdown'
import type { ExtendedMessage, ActionButton, ClarifyingOption } from '../../types/conversation'

interface MessageProps {
  message: ExtendedMessage
  disabled?: boolean
  onOptionSelect?: (value: string) => void
  onActionClick?: (id: string) => void
}

export function Message({
  message,
  disabled = false,
  onOptionSelect,
  onActionClick,
}: MessageProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className="fade-in"
      style={{
        padding: 'var(--space-3) 0',
        borderLeft: isUser ? '2px solid var(--color-primary)' : 'none',
        paddingLeft: 'var(--space-4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        {/* Role indicator */}
        <span
          style={{
            fontWeight: 'var(--font-bold)' as unknown as number,
            flexShrink: 0,
            color: isUser ? 'var(--color-primary)' : 'var(--color-warning)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {isUser ? '>' : '$'}
        </span>

        {/* Message content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {isUser ? (
            <p
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                color: 'var(--color-gray-800)',
              }}
            >
              {message.content}
            </p>
          ) : (
            <>
              {/* Markdown content */}
              <div className="markdown-content" style={{ fontFamily: 'var(--font-brand)' }}>
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1
                        style={{
                          fontSize: 'var(--text-base)',
                          fontWeight: 600,
                          color: 'var(--color-brand)',
                          fontFamily: 'var(--font-brand)',
                          margin: 'var(--space-4) 0 var(--space-2) 0',
                          textTransform: 'none',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2
                        style={{
                          fontSize: 'var(--text-sm)',
                          fontWeight: 600,
                          color: 'var(--color-brand-dim)',
                          fontFamily: 'var(--font-brand)',
                          margin: 'var(--space-3) 0 var(--space-2) 0',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3
                        style={{
                          fontSize: 'var(--text-sm)',
                          fontWeight: 600,
                          color: 'var(--color-gray-700)',
                          fontFamily: 'var(--font-brand)',
                          margin: 'var(--space-2) 0 var(--space-1) 0',
                        }}
                      >
                        {children}
                      </h3>
                    ),
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--color-brand)' }}
                      >
                        {children}
                      </a>
                    ),
                    p: ({ children }) => (
                      <p
                        style={{
                          margin: '0 0 var(--space-2) 0',
                          fontSize: 'var(--text-sm)',
                          lineHeight: 1.6,
                          color: 'var(--color-gray-700)',
                        }}
                      >
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul
                        style={{
                          margin: '0 0 var(--space-2) 0',
                          paddingLeft: 'var(--space-4)',
                          fontSize: 'var(--text-sm)',
                          color: 'var(--color-gray-700)',
                        }}
                      >
                        {children}
                      </ul>
                    ),
                    li: ({ children }) => (
                      <li style={{ marginBottom: 'var(--space-1)', lineHeight: 1.5 }}>{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong style={{ fontWeight: 600, color: 'var(--color-gray-800)' }}>
                        {children}
                      </strong>
                    ),
                    pre: ({ children }) => (
                      <pre
                        style={{
                          backgroundColor: 'var(--color-gray-900)',
                          color: 'var(--color-brand)',
                          padding: 'var(--space-3)',
                          borderRadius: 'var(--radius-md)',
                          margin: 'var(--space-2) 0',
                          overflow: 'auto',
                          fontSize: 'var(--text-xs)',
                          lineHeight: 1.5,
                        }}
                      >
                        {children}
                      </pre>
                    ),
                    code: ({ children, className }) => {
                      // Check if it's a code block (has language class) or inline code
                      const isCodeBlock = className?.includes('language-')
                      if (isCodeBlock) {
                        return (
                          <code style={{ fontFamily: 'var(--font-brand)' }}>{children}</code>
                        )
                      }
                      return (
                        <code
                          style={{
                            fontFamily: 'var(--font-brand)',
                            backgroundColor: 'var(--color-gray-100)',
                            padding: '0.125rem 0.375rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-gray-800)',
                          }}
                        >
                          {children}
                        </code>
                      )
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>

              {/* Dashboard Preview */}
              {message.dashboard_slug && (
                <DashboardPreview slug={message.dashboard_slug} />
              )}

              {/* Clarifying Options */}
              {message.clarifying_options && message.clarifying_options.length > 0 && (
                <ClarifyingOptionsButtons
                  options={message.clarifying_options}
                  disabled={disabled}
                  onSelect={onOptionSelect}
                />
              )}

              {/* Action Buttons */}
              {message.action_buttons && message.action_buttons.length > 0 && (
                <ActionButtons
                  buttons={message.action_buttons}
                  disabled={disabled}
                  onClick={onActionClick}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

interface ClarifyingOptionsButtonsProps {
  options: ClarifyingOption[]
  disabled: boolean
  onSelect?: (value: string) => void
}

function ClarifyingOptionsButtons({
  options,
  disabled,
  onSelect,
}: ClarifyingOptionsButtonsProps) {
  return (
    <div
      style={{
        marginTop: 'var(--space-3)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
      }}
    >
      {options.map((option, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onSelect?.(option.value)}
          disabled={disabled}
          style={{
            padding: 'var(--space-2) var(--space-3)',
            fontSize: 'var(--text-sm)',
            backgroundColor: 'white',
            border: '1px solid var(--color-gray-300)',
            borderRadius: 'var(--radius-md)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.borderColor = 'var(--color-primary)'
              e.currentTarget.style.color = 'var(--color-primary)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-gray-300)'
            e.currentTarget.style.color = 'inherit'
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface ActionButtonsProps {
  buttons: ActionButton[]
  disabled: boolean
  onClick?: (id: string) => void
}

function ActionButtons({ buttons, disabled, onClick }: ActionButtonsProps) {
  return (
    <div
      style={{
        marginTop: 'var(--space-4)',
        padding: 'var(--space-3)',
        backgroundColor: 'var(--color-gray-50)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
      }}
    >
      {buttons.map((button) => {
        const isViewDashboard = button.id.startsWith('view_dashboard:')
        const buttonDisabled = disabled && !isViewDashboard
        const isPrimary = button.style === 'primary'

        return (
          <button
            key={button.id}
            type="button"
            onClick={() => onClick?.(button.id)}
            disabled={buttonDisabled}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              fontFamily: 'var(--font-brand)',
              borderRadius: 'var(--radius-md)',
              cursor: buttonDisabled ? 'not-allowed' : 'pointer',
              opacity: buttonDisabled ? 0.5 : 1,
              transition: 'all var(--transition-fast)',
              ...(isPrimary
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
              if (!buttonDisabled) {
                if (isPrimary) {
                  e.currentTarget.style.backgroundColor = 'var(--color-brand-dim)'
                } else {
                  e.currentTarget.style.borderColor = 'var(--color-brand)'
                  e.currentTarget.style.color = 'var(--color-brand)'
                }
              }
            }}
            onMouseLeave={(e) => {
              if (isPrimary) {
                e.currentTarget.style.backgroundColor = 'var(--color-brand)'
              } else {
                e.currentTarget.style.borderColor = 'var(--color-gray-300)'
                e.currentTarget.style.color = 'var(--color-gray-700)'
              }
            }}
          >
            {button.label}
          </button>
        )
      })}
    </div>
  )
}

// =============================================================================
// Dashboard Preview
// =============================================================================

interface DashboardPreviewProps {
  slug: string
}

function DashboardPreview({ slug }: DashboardPreviewProps) {
  return (
    <div
      style={{
        marginTop: 'var(--space-4)',
        border: '1px solid var(--color-gray-200)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        backgroundColor: 'white',
      }}
    >
      <div
        style={{
          padding: 'var(--space-2) var(--space-3)',
          backgroundColor: 'var(--color-gray-50)',
          borderBottom: '1px solid var(--color-gray-200)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-gray-500)',
          fontFamily: 'var(--font-brand)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Preview</span>
        <a
          href={`/dashboard/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--color-brand)',
            textDecoration: 'none',
            fontSize: 'var(--text-xs)',
          }}
        >
          Open full size ↗
        </a>
      </div>
      <iframe
        src={`/dashboard/${slug}`}
        title="Dashboard Preview"
        style={{
          width: '100%',
          height: '400px',
          border: 'none',
          display: 'block',
        }}
      />
    </div>
  )
}
