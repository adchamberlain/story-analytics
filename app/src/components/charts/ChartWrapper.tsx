import { useCallback, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { exportSVG, exportPNG, exportPDF } from '../../utils/chartExport'
import { useChartThemeStore } from '../../stores/chartThemeStore'

// -- Font injection helper ---------------------------------------------------

/** Inject the theme's font into the document head (Google Fonts link or @font-face for uploaded fonts). */
function injectThemeFont(fontUrl: string | undefined) {
  if (!fontUrl) return
  if (fontUrl.startsWith('data:')) {
    // Uploaded font — inject @font-face via <style>
    const id = `theme-font-face`
    let style = document.getElementById(id) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = id
      document.head.appendChild(style)
    }
    // We can't know the exact family name without the theme, so we use a stable name
    style.textContent = `@font-face { font-family: 'theme-custom-font'; src: url('${fontUrl}'); font-display: swap; }`
  } else if (fontUrl.startsWith('http')) {
    // Google Font URL — inject <link>
    if (!document.querySelector(`link[href="${fontUrl}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = fontUrl
      document.head.appendChild(link)
    }
  }
}

// -- Logo position map -------------------------------------------------------

const LOGO_POSITION_STYLES: Record<string, React.CSSProperties> = {
  'top-left': { position: 'absolute', top: 8, left: 8 },
  'top-right': { position: 'absolute', top: 8, right: 8 },
  'bottom-left': { position: 'absolute', bottom: 40, left: 8 },
  'bottom-right': { position: 'absolute', bottom: 40, right: 8 },
}

interface ChartWrapperProps {
  title?: string
  subtitle?: string
  source?: string
  sourceUrl?: string
  chartUrl?: string
  children: React.ReactNode
  className?: string
  compact?: boolean
}

/**
 * Publication-ready chart wrapper with title, subtitle, source note, and export buttons.
 * Replaces the PoC ChartCard — no library badge, adds export functionality.
 */
export function ChartWrapper({ title, subtitle, source, sourceUrl, chartUrl, children, className = '', compact = false }: ChartWrapperProps) {
  const chartAreaRef = useRef<HTMLDivElement>(null)
  const theme = useChartThemeStore((s) => s.theme)

  const handleExportSVG = useCallback(() => {
    const svg = chartAreaRef.current?.querySelector('svg')
    if (svg) exportSVG(svg, title ?? 'chart')
  }, [title])

  const handleExportPNG = useCallback(() => {
    const svg = chartAreaRef.current?.querySelector('svg')
    if (svg) exportPNG(svg, title ?? 'chart', 2, { title, subtitle, source })
  }, [title, subtitle, source])

  const handleExportPDF = useCallback(async () => {
    const svg = chartAreaRef.current?.querySelector('svg')
    if (svg) await exportPDF(svg, title ?? 'chart', { title, source })
  }, [title, source])

  // Inject theme font on mount / theme change
  useEffect(() => {
    injectThemeFont(theme.fontUrl)
  }, [theme.fontUrl])

  const hasAccent = !!theme.accent
  const cardBg = theme.card.background || undefined
  const cardBorder = theme.card.borderColor || undefined
  const btnColor = theme.card.textSecondary || undefined

  // Logo settings
  const logoUrl = theme.logoUrl
  const logoPosition = theme.logoPosition ?? 'top-left'
  const logoSize = theme.logoSize ?? 60

  return (
    <div
      className={`rounded-2xl border shadow-card flex flex-col overflow-hidden ${compact ? 'group' : ''} ${!cardBg ? 'bg-surface-raised' : ''} ${!cardBorder ? 'border-border-default' : ''} ${className}`}
      style={{
        position: 'relative',
        fontFamily: theme.font.family || undefined,
        ...(cardBg ? { backgroundColor: cardBg } : {}),
        ...(cardBorder ? { borderColor: cardBorder } : {}),
      }}
    >
      {/* Theme logo overlay */}
      {logoUrl && (
        <img
          src={logoUrl}
          alt="Chart logo"
          data-testid="chart-logo"
          style={{
            ...LOGO_POSITION_STYLES[logoPosition],
            width: logoSize,
            height: 'auto',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}
      {/* Accent bar + tag */}
      {hasAccent && (
        <div className="relative">
          <div
            style={{
              height: theme.accent!.barHeight,
              background: theme.accent!.color,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: theme.accent!.barHeight,
              left: 0,
              width: theme.accent!.tag.width,
              height: theme.accent!.tag.height,
              background: theme.accent!.color,
            }}
          />
        </div>
      )}

      {/* Content with padding */}
      <div className="p-5 flex flex-col flex-1 min-h-0">
        {/* Header */}
        {(title || subtitle) && (
          <div className="mb-1.5">
            {title && (
              <h3
                style={{
                  fontSize: theme.font.title.size,
                  fontWeight: theme.font.title.weight,
                  ...(theme.font.title.color ? { color: theme.font.title.color } : {}),
                }}
                className={!theme.font.title.color ? 'text-text-primary' : ''}
              >
                {chartUrl ? (
                  <Link to={chartUrl} className="hover:underline" style={theme.font.title.color ? { color: 'inherit' } : {}}>
                    {title}
                  </Link>
                ) : (
                  title
                )}
              </h3>
            )}
            {subtitle && (
              <p
                style={{
                  fontSize: theme.font.subtitle.size,
                  fontWeight: theme.font.subtitle.weight,
                  ...(theme.font.subtitle.color ? { color: theme.font.subtitle.color } : {}),
                }}
                className={`mt-0.5 ${!theme.font.subtitle.color ? 'text-text-secondary' : ''}`}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}

        {/* Chart area */}
        <div ref={chartAreaRef} className={`flex-1 min-h-0 overflow-hidden flex flex-col ${compact ? 'mt-2' : 'mt-3'}`}>
          {children}
        </div>

        {/* Footer: source + export */}
        <div className={`flex items-center justify-between ${compact ? 'mt-3' : 'mt-4'}`}>
          {source ? (
            <p
              style={{
                fontSize: theme.font.source.size,
                ...(theme.font.source.color ? { color: theme.font.source.color } : {}),
              }}
              className={!theme.font.source.color ? 'text-text-muted' : ''}
            >
              Source:{' '}
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80 transition-opacity"
                  style={{ color: '#1d81a2' }}
                >
                  {source}
                </a>
              ) : (
                source
              )}
            </p>
          ) : <div />}
          <div className={`flex gap-2 ${compact ? 'opacity-0 group-hover:opacity-100 transition-opacity' : ''}`}>
            {['SVG', 'PNG', 'PDF'].map((fmt) => (
              <button
                key={fmt}
                onClick={fmt === 'SVG' ? handleExportSVG : fmt === 'PNG' ? handleExportPNG : handleExportPDF}
                className={`text-[12px] px-2.5 py-1 rounded-lg border transition-colors ${
                  btnColor
                    ? 'hover:opacity-80'
                    : 'border-border-default text-text-secondary hover:bg-surface-secondary'
                }`}
                style={btnColor ? { color: btnColor, borderColor: cardBorder ?? undefined } : {}}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
