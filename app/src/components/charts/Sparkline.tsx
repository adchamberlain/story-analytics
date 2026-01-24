/**
 * Sparkline component.
 * A minimal inline chart for showing trends in KPIs.
 * Uses Plotly with staticPlot for performance.
 */

import Plot from 'react-plotly.js'
import type { Data, Layout, Config } from 'plotly.js'

export type SparklineType = 'line' | 'bar'

interface SparklineProps {
  /** Y values for the sparkline */
  data: number[]
  /** Optional X values (defaults to indices) */
  xData?: (string | number | Date)[]
  /** Type of sparkline */
  type?: SparklineType
  /** Width in pixels (default: 100) */
  width?: number
  /** Height in pixels (default: 32) */
  height?: number
  /** Line/bar color (default: primary color) */
  color?: string
  /** Show filled area under line (default: false) */
  fill?: boolean
  /** Custom className */
  className?: string
  /** Custom style */
  style?: React.CSSProperties
}

const defaultConfig: Partial<Config> = {
  staticPlot: true,
  responsive: false,
  displayModeBar: false,
}

export function Sparkline({
  data,
  xData,
  type = 'line',
  width = 100,
  height = 32,
  color = 'var(--color-primary)',
  fill = false,
  className = '',
  style = {},
}: SparklineProps) {
  if (!data || data.length === 0) {
    return null
  }

  // Use indices if no xData provided
  const xValues = xData || data.map((_, i) => i)

  // Resolve CSS variable to hex for Plotly
  const resolvedColor = color.startsWith('var(')
    ? getComputedColor(color)
    : color

  const trace: Data =
    type === 'line'
      ? {
          type: 'scatter',
          mode: 'lines',
          x: xValues,
          y: data,
          line: {
            color: resolvedColor,
            width: 1.5,
            shape: 'spline',
            smoothing: 0.8,
          },
          fill: fill ? 'tozeroy' : 'none',
          fillcolor: fill
            ? resolvedColor.replace(')', ', 0.1)').replace('rgb', 'rgba')
            : undefined,
          hoverinfo: 'none',
        }
      : {
          type: 'bar',
          x: xValues,
          y: data,
          marker: {
            color: resolvedColor,
          },
          hoverinfo: 'none',
        }

  const layout: Partial<Layout> = {
    width,
    height,
    margin: { l: 0, r: 0, t: 0, b: 0, pad: 0 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    xaxis: {
      visible: false,
      showgrid: false,
      zeroline: false,
      fixedrange: true,
    },
    yaxis: {
      visible: false,
      showgrid: false,
      zeroline: false,
      fixedrange: true,
    },
    showlegend: false,
    hovermode: false,
  }

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        ...style,
      }}
    >
      <Plot
        data={[trace]}
        layout={layout}
        config={defaultConfig}
        style={{ width, height }}
      />
    </div>
  )
}

/**
 * Resolve CSS variable to computed color.
 * Fallback to primary indigo if cannot resolve.
 */
function getComputedColor(cssVar: string): string {
  if (typeof document === 'undefined') {
    return '#6366f1' // Default primary color
  }

  // Extract variable name from var(--name) or var(--name, fallback)
  const match = cssVar.match(/var\(--([^,)]+)/)
  if (!match) {
    return '#6366f1'
  }

  const computed = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${match[1]}`)
    .trim()

  return computed || '#6366f1'
}

/**
 * Create sparkline data from chart data rows.
 */
export function extractSparklineData(
  rows: Record<string, unknown>[],
  yColumn: string,
  xColumn?: string
): { data: number[]; xData?: (string | number)[] } {
  const data = rows
    .map((row) => {
      const val = row[yColumn]
      return typeof val === 'number' ? val : parseFloat(String(val))
    })
    .filter((v) => !isNaN(v))

  if (xColumn) {
    const xData = rows.map((row) => {
      const val = row[xColumn]
      return typeof val === 'string' || typeof val === 'number' ? val : String(val)
    })
    return { data, xData }
  }

  return { data }
}
