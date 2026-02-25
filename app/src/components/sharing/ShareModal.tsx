import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { authFetch } from '../../utils/authFetch'

type Visibility = 'private' | 'team' | 'public'

interface ShareModalProps {
  dashboardId: string
  onClose: () => void
}

/**
 * Modal for managing dashboard visibility and sharing.
 * Allows setting private/team/public visibility and copying share links.
 */
export function ShareModal({ dashboardId, onClose }: ShareModalProps) {
  const { token } = useAuthStore()
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>()
  const embedTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => {
      clearTimeout(copyTimer.current)
      clearTimeout(embedTimer.current)
    }
  }, [])

  const buildHeaders = () => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }

  // Fetch current visibility
  useEffect(() => {
    const abortController = new AbortController()
    const fetchMeta = async () => {
      try {
        const res = await authFetch(`/api/v2/dashboards/${dashboardId}/sharing`, {
          headers: buildHeaders(),
          signal: abortController.signal,
        })
        if (res.ok) {
          const data = await res.json()
          setVisibility(data.visibility ?? 'private')
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Default to private if endpoint not available
      } finally {
        if (!abortController.signal.aborted) setLoading(false)
      }
    }
    fetchMeta()
    return () => abortController.abort()
  }, [dashboardId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleVisibilityChange = async (newVisibility: Visibility) => {
    const prev = visibility
    setVisibility(newVisibility)
    setSaving(true)
    setError(null)
    try {
      const res = await authFetch(`/api/v2/dashboards/${dashboardId}/sharing`, {
        method: 'PUT',
        headers: buildHeaders(),
        body: JSON.stringify({ visibility: newVisibility }),
      })
      if (!res.ok) throw new Error(`Save failed: ${res.status}`)
    } catch {
      setVisibility(prev)
      setError('Failed to update visibility. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const shareUrl = `${window.location.origin}/dashboard/${dashboardId}`
  const embedCode = `<iframe src="${window.location.origin}/embed/dashboard/${dashboardId}" width="100%" height="600" frameborder="0"></iframe>`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopiedLink(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // Clipboard API can fail in insecure contexts or iframes — ignore silently
    }
  }

  const handleCopyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode)
      setCopiedEmbed(true)
      clearTimeout(embedTimer.current)
      embedTimer.current = setTimeout(() => setCopiedEmbed(false), 2000)
    } catch {
      // Clipboard API can fail in insecure contexts or iframes — ignore silently
    }
  }

  const visibilityOptions: { value: Visibility; label: string; description: string }[] = [
    { value: 'private', label: 'Private', description: 'Only you can view this dashboard' },
    { value: 'public', label: 'Public', description: 'Anyone with the link can view' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-surface rounded-xl shadow-xl border border-border-default w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <h2 className="text-base font-semibold text-text-primary">Share Dashboard</h2>
          <button
            onClick={onClose}
            className="text-text-icon hover:text-text-icon-hover transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : (
            <>
              {/* Visibility */}
              <div>
                <label className="text-sm font-medium text-text-primary block mb-2">Visibility</label>
                <div className="space-y-2">
                  {visibilityOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        visibility === opt.value
                          ? 'border-blue-500/40 bg-blue-500/10'
                          : 'border-border-default hover:bg-surface-secondary'
                      }`}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        value={opt.value}
                        checked={visibility === opt.value}
                        onChange={() => handleVisibilityChange(opt.value)}
                        disabled={saving}
                        className="mt-0.5"
                      />
                      <div>
                        <span className="text-sm font-medium text-text-primary">{opt.label}</span>
                        <p className="text-xs text-text-secondary mt-0.5">{opt.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {saving && (
                  <p className="text-xs text-text-muted mt-1">Saving...</p>
                )}
                {error && (
                  <p className="text-xs text-red-500 mt-1">{error}</p>
                )}
              </div>

              {/* Share link */}
              {visibility !== 'private' && (
                <div>
                  <label className="text-sm font-medium text-text-primary block mb-2">Share Link</label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={shareUrl}
                      className="flex-1 text-xs px-3 py-2 rounded-lg border border-border-default bg-surface-secondary text-text-secondary"
                    />
                    <button
                      onClick={handleCopyLink}
                      className={`text-xs px-3 py-2 rounded-lg border transition-colors whitespace-nowrap ${
                        copiedLink
                          ? 'border-green-300 text-green-700 bg-green-50'
                          : 'border-border-default text-text-on-surface hover:bg-surface-secondary'
                      }`}
                    >
                      {copiedLink ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              {/* Embed code */}
              {visibility !== 'private' && (
                <div>
                  <label className="text-sm font-medium text-text-primary block mb-2">Embed Code</label>
                  <div className="flex items-start gap-2">
                    <textarea
                      readOnly
                      value={embedCode}
                      rows={3}
                      className="flex-1 text-xs px-3 py-2 rounded-lg border border-border-default bg-surface-secondary text-text-secondary font-mono resize-none"
                    />
                    <button
                      onClick={handleCopyEmbed}
                      className={`text-xs px-3 py-2 rounded-lg border transition-colors whitespace-nowrap ${
                        copiedEmbed
                          ? 'border-green-300 text-green-700 bg-green-50'
                          : 'border-border-default text-text-on-surface hover:bg-surface-secondary'
                      }`}
                    >
                      {copiedEmbed ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border-default flex justify-end">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
