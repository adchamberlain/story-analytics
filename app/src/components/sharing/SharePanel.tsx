import { useState, useCallback, useRef, useEffect } from 'react'

interface SharePanelProps {
  chartId: string
  /** When true, "Copy URL" copies the public (no-auth) link */
  published?: boolean
}

/**
 * Sharing controls: copy chart URL + embed code.
 * Export buttons (SVG/PNG/PDF/PPTX/CSV) live in ChartWrapper.
 */
export function SharePanel({ chartId, published }: SharePanelProps) {
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)

  const chartUrl = published
    ? `${window.location.origin}/public/chart/${chartId}`
    : `${window.location.origin}/chart/${chartId}`
  const embedUrl = `${window.location.origin}/embed/chart/${chartId}`
  const embedCode = `<iframe src="${embedUrl}" width="100%" height="400" frameborder="0" style="border: none; overflow: hidden;" loading="lazy"></iframe>`
  const urlCopyTimer = useRef<ReturnType<typeof setTimeout>>()
  const embedCopyTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => {
      clearTimeout(urlCopyTimer.current)
      clearTimeout(embedCopyTimer.current)
    }
  }, [])

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(chartUrl)
      setCopiedUrl(true)
      clearTimeout(urlCopyTimer.current)
      urlCopyTimer.current = setTimeout(() => setCopiedUrl(false), 2000)
    } catch {
      // Clipboard API can fail in insecure contexts or iframes — ignore silently
    }
  }, [chartUrl])

  const copyEmbed = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(embedCode)
      setCopiedEmbed(true)
      clearTimeout(embedCopyTimer.current)
      embedCopyTimer.current = setTimeout(() => setCopiedEmbed(false), 2000)
    } catch {
      // Clipboard API can fail in insecure contexts or iframes — ignore silently
    }
  }, [embedCode])

  const btnClass = 'text-xs px-3 py-1.5 rounded border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors'
  const successBtnClass = 'text-xs px-3 py-1.5 rounded border border-green-300 text-green-700 bg-green-50'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Copy URL */}
      <button
        onClick={copyUrl}
        className={copiedUrl ? successBtnClass : btnClass}
      >
        {copiedUrl ? 'Copied!' : published ? 'Copy Public URL' : 'Copy URL'}
      </button>

      {/* Copy embed code */}
      <button
        onClick={copyEmbed}
        className={copiedEmbed ? successBtnClass : btnClass}
      >
        {copiedEmbed ? 'Copied!' : 'Embed'}
      </button>
    </div>
  )
}
