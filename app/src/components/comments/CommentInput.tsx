import { useState } from 'react'

interface CommentInputProps {
  onSubmit: (body: string) => void
  placeholder?: string
}

export function CommentInput({ onSubmit, placeholder = 'Add a comment...' }: CommentInputProps) {
  const [body, setBody] = useState('')

  const handleSubmit = () => {
    const trimmed = body.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setBody('')
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-3 py-2 text-sm rounded-lg bg-surface-input border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
      />
      <button
        onClick={handleSubmit}
        disabled={!body.trim()}
        className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
      >
        Post
      </button>
    </div>
  )
}
