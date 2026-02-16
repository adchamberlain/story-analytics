import { useCallback, useRef } from 'react'
import { exportSVG, exportPNG, exportPDF } from '../../utils/chartExport'

interface ChartWrapperProps {
  title?: string
  subtitle?: string
  source?: string
  sourceUrl?: string
  children: React.ReactNode
  className?: string
}

/**
 * Publication-ready chart wrapper with title, subtitle, source note, and export buttons.
 * Replaces the PoC ChartCard — no library badge, adds export functionality.
 */
export function ChartWrapper({ title, subtitle, source, sourceUrl, children, className = '' }: ChartWrapperProps) {
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
    <div className={`bg-surface-raised rounded-2xl border border-border-default shadow-card p-7 flex flex-col ${className}`}>
      {/* Header */}
      {(title || subtitle) && (
        <div className="mb-1">
          {title && (
            <h3 className="text-[18px] font-semibold text-text-primary">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-[14px] mt-0.5 text-text-secondary">
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
          <p className="text-xs text-text-muted">
            Source:{' '}
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-text-secondary transition-colors"
              >
                {source}
              </a>
            ) : (
              source
            )}
          </p>
        ) : <div />}
        <div className="flex gap-2">
          <button
            onClick={handleExportSVG}
            className="text-[12px] px-2.5 py-1 rounded-lg border border-border-default text-text-secondary hover:bg-surface-secondary transition-colors"
          >
            SVG
          </button>
          <button
            onClick={handleExportPNG}
            className="text-[12px] px-2.5 py-1 rounded-lg border border-border-default text-text-secondary hover:bg-surface-secondary transition-colors"
          >
            PNG
          </button>
          <button
            onClick={handleExportPDF}
            className="text-[12px] px-2.5 py-1 rounded-lg border border-border-default text-text-secondary hover:bg-surface-secondary transition-colors"
          >
            PDF
          </button>
        </div>
      </div>
    </div>
  )
}
