import { useState } from 'react'
import { authFetch } from '../../utils/authFetch'

interface GoogleSheetsInputProps {
  onImport: (sourceId: string) => void
  importing?: boolean
}

export function GoogleSheetsInput({ onImport, importing }: GoogleSheetsInputProps) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!url.trim()) return
    setError(null)
    setLoading(true)

    try {
      const resp = await authFetch('/api/data/import/google-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), name: name.trim() || undefined }),
      })

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ detail: 'Import failed' }))
        throw new Error(typeof data.detail === 'string' ? data.detail : 'Import failed')
      }

      const data = await resp.json()
      onImport(data.source_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  const isLoading = loading || importing

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-[13px] font-medium text-text-secondary mb-1">
          Google Sheets URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          className="w-full px-3 py-2 text-[14px] border border-border-default rounded-lg bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          disabled={isLoading}
        />
        <p className="text-[12px] text-text-muted mt-1">
          The sheet must be publicly shared (Anyone with the link).
        </p>
      </div>

      <div>
        <label className="block text-[13px] font-medium text-text-secondary mb-1">
          Name <span className="text-text-muted font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sales Q4 2025"
          className="w-full px-3 py-2 text-[14px] border border-border-default rounded-lg bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          disabled={isLoading}
        />
      </div>

      {error && <p className="text-[13px] text-red-500">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!url.trim() || isLoading}
        className="self-start text-[14px] font-medium rounded-lg transition-colors disabled:opacity-40"
        style={{
          padding: '8px 20px',
          backgroundColor: '#3b82f6',
          color: '#fff',
        }}
        onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = '#2563eb' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#3b82f6' }}
      >
        {isLoading ? 'Importing...' : 'Import sheet'}
      </button>
    </div>
  )
}
