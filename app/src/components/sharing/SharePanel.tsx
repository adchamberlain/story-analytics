import { useState, useCallback, useRef, useEffect } from 'react'
import { exportSVG, exportPNG, exportPDF } from '../../utils/chartExport'

interface SharePanelProps {
  chartId: string
  title?: string
  source?: string
  /** Ref to the container holding the SVG */
  chartRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Sharing controls: copy URL, embed code, SVG/PNG/PDF export.
 */
export function SharePanel({ chartId, title, source, chartRef }: SharePanelProps) {
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  const chartUrl = `${window.location.origin}/chart/${chartId}`
  const embedCode = `<iframe src="${chartUrl}" width="100%" height="450" frameborder="0"></iframe>`
  const copyTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(copyTimer.current)
  }, [])

  const copyToClipboard = useCallback(async (text: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text)
      setter(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setter(false), 2000)
    } catch {
      // Clipboard API can fail in insecure contexts or iframes — ignore silently
    }
  }, [])

  const getSvg = useCallback((): SVGSVGElement | null => {
    return chartRef.current?.querySelector('svg') ?? null
  }, [chartRef])

  const handleExportSVG = useCallback(() => {
    const svg = getSvg()
    if (svg) exportSVG(svg, title ?? 'chart')
  }, [getSvg, title])

  const handleExportPNG = useCallback(() => {
    const svg = getSvg()
    if (svg) exportPNG(svg, title ?? 'chart')
  }, [getSvg, title])

  const handleExportPDF = useCallback(async () => {
    const svg = getSvg()
    if (!svg) return
    setExportingPdf(true)
    try {
      await exportPDF(svg, title ?? 'chart', { title, source })
    } finally {
      setExportingPdf(false)
    }
  }, [getSvg, title, source])

  const btnClass = 'text-xs px-3 py-1.5 rounded border border-border-default text-text-on-surface hover:bg-surface-secondary transition-colors'
  const successBtnClass = 'text-xs px-3 py-1.5 rounded border border-green-300 text-green-700 bg-green-50'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Copy URL */}
      <button
        onClick={() => copyToClipboard(chartUrl, setCopiedUrl)}
        className={copiedUrl ? successBtnClass : btnClass}
      >
        {copiedUrl ? 'Copied!' : 'Copy URL'}
      </button>

      {/* Copy embed code */}
      <button
        onClick={() => copyToClipboard(embedCode, setCopiedEmbed)}
        className={copiedEmbed ? successBtnClass : btnClass}
      >
        {copiedEmbed ? 'Copied!' : 'Embed'}
      </button>

      <div className="w-px h-5 bg-border-default" />

      {/* Export buttons */}
      <button onClick={handleExportSVG} className={btnClass}>SVG</button>
      <button onClick={handleExportPNG} className={btnClass}>PNG</button>
      <button
        onClick={handleExportPDF}
        disabled={exportingPdf}
        className={`${btnClass} disabled:opacity-50`}
      >
        {exportingPdf ? 'Exporting...' : 'PDF'}
      </button>
    </div>
  )
}
