import { useState } from 'react'
import { authFetch } from '../../utils/authFetch'

interface UrlSourceInputProps {
  onImport: (sourceId: string) => void
  importing?: boolean
}

export function UrlSourceInput({ onImport, importing }: UrlSourceInputProps) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [showHeaders, setShowHeaders] = useState(false)
  const [headerKey, setHeaderKey] = useState('')
  const [headerValue, setHeaderValue] = useState('')
  const [headers, setHeaders] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function addHeader() {
    if (!headerKey.trim()) return
    setHeaders({ ...headers, [headerKey.trim()]: headerValue })
    setHeaderKey('')
    setHeaderValue('')
  }

  function removeHeader(key: string) {
    const next = { ...headers }
    delete next[key]
    setHeaders(next)
  }

  async function handleSubmit() {
    if (!url.trim()) return
    setError(null)
    setLoading(true)

    try {
      const body: Record<string, unknown> = {
        url: url.trim(),
        name: name.trim() || undefined,
      }
      if (Object.keys(headers).length > 0) {
        body.headers = headers
      }

      const resp = await authFetch('/api/data/import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
          URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/data.csv"
          className="w-full px-3 py-2 text-[14px] border border-border-default rounded-lg bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          disabled={isLoading}
        />
        <p className="text-[12px] text-text-muted mt-1">
          CSV or JSON (array of objects). Must be publicly accessible.
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
          placeholder="e.g. API Data"
          className="w-full px-3 py-2 text-[14px] border border-border-default rounded-lg bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          disabled={isLoading}
        />
      </div>

      {/* Optional headers */}
      <button
        type="button"
        onClick={() => setShowHeaders(!showHeaders)}
        className="self-start text-[13px] text-text-muted hover:text-text-secondary transition-colors"
      >
        {showHeaders ? '− Hide' : '+'} HTTP Headers {Object.keys(headers).length > 0 && `(${Object.keys(headers).length})`}
      </button>

      {showHeaders && (
        <div className="flex flex-col gap-2 pl-2 border-l-2 border-border-subtle">
          {Object.entries(headers).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-[13px]">
              <span className="font-mono text-text-secondary">{k}:</span>
              <span className="text-text-muted truncate">{v}</span>
              <button
                onClick={() => removeHeader(k)}
                className="text-red-400 hover:text-red-500 ml-auto"
              >
                x
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="text"
              value={headerKey}
              onChange={(e) => setHeaderKey(e.target.value)}
              placeholder="Header name"
              className="flex-1 px-2 py-1 text-[13px] border border-border-default rounded bg-surface text-text-primary placeholder:text-text-muted"
            />
            <input
              type="text"
              value={headerValue}
              onChange={(e) => setHeaderValue(e.target.value)}
              placeholder="Value"
              className="flex-1 px-2 py-1 text-[13px] border border-border-default rounded bg-surface text-text-primary placeholder:text-text-muted"
            />
            <button
              onClick={addHeader}
              disabled={!headerKey.trim()}
              className="px-2 py-1 text-[13px] text-blue-500 hover:text-blue-600 disabled:opacity-30"
            >
              Add
            </button>
          </div>
        </div>
      )}

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
        {isLoading ? 'Importing...' : 'Import data'}
      </button>
    </div>
  )
}
