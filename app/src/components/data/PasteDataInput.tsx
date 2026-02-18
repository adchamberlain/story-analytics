import { useCallback, useRef, useState } from 'react'

interface PasteDataInputProps {
  onSubmit: (text: string, name: string) => void
  uploading: boolean
}

export function PasteDataInput({ onSubmit, uploading }: PasteDataInputProps) {
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (trimmed) onSubmit(trimmed, name.trim())
  }, [text, name, onSubmit])

  const hasData = text.trim().length > 0

  return (
    <div
      className="rounded-2xl border border-border-strong bg-surface"
      style={{ padding: '24px' }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Paste data from a spreadsheet or CSV here.\nInclude the header row.'}
        disabled={uploading}
        className={`
          w-full rounded-lg border border-border-default bg-surface-secondary
          text-[14px] text-text-primary font-mono leading-relaxed
          placeholder:text-text-muted
          focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400
          resize-y transition-colors
          ${uploading ? 'opacity-50 pointer-events-none' : ''}
        `}
        style={{ padding: '14px 16px', minHeight: '160px', maxHeight: '400px' }}
      />

      <p className="text-[13px] text-text-muted" style={{ marginTop: '10px' }}>
        Tab-separated (from spreadsheets) or comma-separated
      </p>

      {/* Name input — shown once data is pasted */}
      {hasData && (
        <div style={{ marginTop: '14px' }}>
          <label className="block text-[13px] font-medium text-text-secondary" style={{ marginBottom: '6px' }}>
            Source name
          </label>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sales Data Q4"
            disabled={uploading}
            className="w-full px-3 py-2 text-[14px] border border-border-default rounded-lg bg-surface-secondary text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
        </div>
      )}

      <div className="flex justify-end" style={{ marginTop: '14px' }}>
        <button
          onClick={handleSubmit}
          disabled={!hasData || uploading}
          className="text-[14px] font-medium rounded-lg transition-colors"
          style={{
            padding: '8px 20px',
            backgroundColor: hasData && !uploading ? '#3b82f6' : '#e5e7eb',
            color: hasData && !uploading ? '#fff' : '#9ca3af',
            cursor: hasData && !uploading ? 'pointer' : 'default',
          }}
          onMouseEnter={(e) => {
            if (hasData && !uploading) e.currentTarget.style.backgroundColor = '#2563eb'
          }}
          onMouseLeave={(e) => {
            if (hasData && !uploading) e.currentTarget.style.backgroundColor = '#3b82f6'
          }}
        >
          {uploading ? 'Processing...' : 'Preview data'}
        </button>
      </div>
    </div>
  )
}
