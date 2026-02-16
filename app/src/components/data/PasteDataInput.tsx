import { useCallback, useState } from 'react'

interface PasteDataInputProps {
  onSubmit: (text: string) => void
  uploading: boolean
}

export function PasteDataInput({ onSubmit, uploading }: PasteDataInputProps) {
  const [text, setText] = useState('')

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (trimmed) onSubmit(trimmed)
  }, [text, onSubmit])

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

      <div className="flex items-center justify-between" style={{ marginTop: '14px' }}>
        <p className="text-[13px] text-text-muted">
          Tab-separated (from spreadsheets) or comma-separated
        </p>
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
          {uploading ? 'Processing...' : 'Use this data'}
        </button>
      </div>
    </div>
  )
}
