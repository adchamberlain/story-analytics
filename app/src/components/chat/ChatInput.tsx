/**
 * ChatInput component.
 * Auto-resizing textarea with submit on Enter.
 */

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'

interface ChatInputProps {
  onSubmit: (message: string) => void
  disabled?: boolean
  placeholder?: string
  loadingMessage?: string
  prefill?: string
  onPrefillClear?: () => void
}

export interface ChatInputHandle {
  focus: () => void
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  {
    onSubmit,
    disabled = false,
    placeholder = 'Describe a chart or dashboard, or ask what data is available...',
    loadingMessage = 'Processing...',
    prefill = '',
    onPrefillClear,
  },
  ref
) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      textareaRef.current?.focus()
    },
  }))

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [])

  // Handle prefill
  useEffect(() => {
    if (prefill) {
      setValue(prefill)
      onPrefillClear?.()
      // Focus input and trigger resize after setting value
      setTimeout(() => {
        autoResize()
        textareaRef.current?.focus()
        // Move cursor to end
        if (textareaRef.current) {
          textareaRef.current.selectionStart = prefill.length
          textareaRef.current.selectionEnd = prefill.length
        }
      }, 0)
    }
  }, [prefill, onPrefillClear, autoResize])

  // Handle keydown - Enter to submit, Shift+Enter for newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Handle submit
  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSubmit(value.trim())
      setValue('')
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    autoResize()
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-2)',
          backgroundColor: 'var(--color-gray-50)',
          border: '1px solid var(--color-gray-200)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3) var(--space-4)',
        }}
      >
        {/* Prompt indicator */}
        <span
          style={{
            color: 'var(--color-primary)',
            fontWeight: 'var(--font-bold)' as unknown as number,
            fontFamily: 'var(--font-mono)',
            paddingTop: '2px',
          }}
        >
          {'>'}
        </span>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-base)',
            lineHeight: 1.5,
            color: 'var(--color-gray-800)',
          }}
        />

        {/* Submit button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          style={{
            padding: '2px',
            background: 'transparent',
            border: 'none',
            cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
            color:
              disabled || !value.trim()
                ? 'var(--color-gray-400)'
                : 'var(--color-primary)',
            transition: 'color var(--transition-fast)',
          }}
          title="Send message"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Loading message */}
      {disabled && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-2)',
            color: 'var(--color-gray-500)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <span
            style={{
              animation: 'blink 1s step-end infinite',
            }}
          >
            _
          </span>
          <span>{loadingMessage}</span>
        </div>
      )}

      {/* Blink animation */}
      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
})
