import { useCallback, useRef } from 'react'
import { exportSVG, exportPNG, exportPDF } from '../../utils/chartExport'

interface ChartWrapperProps {
  title?: string
  subtitle?: string
  source?: string
  children: React.ReactNode
  className?: string
}

/**
 * Publication-ready chart wrapper with title, subtitle, source note, and export buttons.
 * Replaces the PoC ChartCard — no library badge, adds export functionality.
 */
export function ChartWrapper({ title, subtitle, source, children, className = '' }: ChartWrapperProps) {
  const chartAreaRef = useRef<HTMLDivElement>(null)

  const handleExportSVG = useCallback(() => {
    const svg = chartAreaRef.current?.querySelector('svg')
    if (svg) exportSVG(svg, title ?? 'chart')
  }, [title])

  const handleExportPNG = useCallback(() => {
    const svg = chartAreaRef.current?.querySelector('svg')
    if (svg) exportPNG(svg, title ?? 'chart')
  }, [title])

  const handleExportPDF = useCallback(async () => {
    const svg = chartAreaRef.current?.querySelector('svg')
    if (svg) await exportPDF(svg, title ?? 'chart', { title, source })
  }, [title, source])

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 flex flex-col ${className}`}>
      {/* Header */}
      {(title || subtitle) && (
        <div className="mb-1">
          {title && (
            <h3 className="text-lg font-semibold" style={{ color: '#1a1a1a', fontFamily: 'Inter, system-ui, sans-serif' }}>
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-sm mt-0.5" style={{ color: '#666666' }}>
              {subtitle}
            </p>
          )}
        </div>
      )}

      {/* Chart area */}
      <div ref={chartAreaRef} className="flex-1 min-h-0 mt-3">
        {children}
      </div>

      {/* Footer: source + export */}
      <div className="flex items-center justify-between mt-3">
        {source ? (
          <p className="text-xs" style={{ color: '#999999' }}>
            Source: {source}
          </p>
        ) : <div />}
        <div className="flex gap-2">
          <button
            onClick={handleExportSVG}
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            SVG
          </button>
          <button
            onClick={handleExportPNG}
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            PNG
          </button>
          <button
            onClick={handleExportPDF}
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            PDF
          </button>
        </div>
      </div>
    </div>
  )
}
