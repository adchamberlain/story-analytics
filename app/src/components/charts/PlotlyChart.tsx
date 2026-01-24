/**
 * Base Plotly chart wrapper component.
 * Handles common Plotly configuration, styling, and animations.
 */

import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { Data, Layout, Config } from 'plotly.js'
import { getAxisTickFormat } from '../../utils/formatters'

interface PlotlyChartProps {
  data: Data[]
  layout?: Partial<Layout>
  config?: Partial<Config>
  style?: React.CSSProperties
  className?: string
  onRelayout?: (event: Readonly<Plotly.PlotRelayoutEvent>) => void
  /** Enable animation on initial render */
  animate?: boolean
}

// Default Plotly configuration for consistent styling
const defaultConfig: Partial<Config> = {
  responsive: true,
  displayModeBar: 'hover',
  displaylogo: false,
  modeBarButtonsToRemove: [
    'select2d',
    'lasso2d',
    'autoScale2d',
    'toggleSpikelines',
    'hoverClosestCartesian',
    'hoverCompareCartesian',
  ],
}

// Default layout settings matching our design system
const defaultLayout: Partial<Layout> = {
  font: {
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    size: 12,
    color: '#374151', // gray-700
  },
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  margin: {
    l: 60,
    r: 20,
    t: 40,
    b: 60,
  },
  xaxis: {
    gridcolor: 'rgba(229, 231, 235, 0.5)', // gray-200 with transparency
    linecolor: '#d1d5db', // gray-300
    tickcolor: '#9ca3af', // gray-400
    tickfont: { color: '#6b7280', size: 11 }, // gray-500
    zeroline: true,
    zerolinecolor: '#d1d5db', // gray-300
    zerolinewidth: 1,
    showgrid: true,
    gridwidth: 1,
  },
  yaxis: {
    gridcolor: 'rgba(229, 231, 235, 0.5)', // gray-200 with transparency
    linecolor: '#d1d5db',
    tickcolor: '#9ca3af',
    tickfont: { color: '#6b7280', size: 11 },
    zeroline: true,
    zerolinecolor: '#d1d5db',
    zerolinewidth: 1,
    showgrid: true,
    gridwidth: 1,
  },
  colorway: [
    '#6366f1', // primary (indigo)
    '#8b5cf6', // secondary (violet)
    '#22c55e', // success (green)
    '#f59e0b', // warning (amber)
    '#ef4444', // error (red)
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#f97316', // orange
  ],
  hoverlabel: {
    bgcolor: '#1f2937', // gray-800
    bordercolor: 'transparent',
    font: { color: '#f9fafb', size: 12 }, // gray-50
  },
  // Default legend styling
  legend: {
    font: { size: 11, color: '#4b5563' }, // gray-600
    bgcolor: 'transparent',
    borderwidth: 0,
  },
  // Animation defaults
  transition: {
    duration: 300,
    easing: 'cubic-in-out',
  },
}


export function PlotlyChart({
  data,
  layout,
  config,
  style,
  className,
  onRelayout,
  animate = true,
}: PlotlyChartProps) {
  // Calculate smart axis formatting based on data
  const smartLayout = useMemo(() => {
    const yAxisFormat = getSmartYAxisFormat(data)

    return {
      ...defaultLayout,
      ...layout,
      xaxis: {
        ...defaultLayout.xaxis,
        ...layout?.xaxis,
      },
      yaxis: {
        ...defaultLayout.yaxis,
        tickformat: yAxisFormat,
        ...layout?.yaxis,
      },
    }
  }, [data, layout])

  const mergedConfig = {
    ...defaultConfig,
    ...config,
  }

  // Add animation to data traces
  const animatedData = useMemo(() => {
    if (!animate) return data

    return data.map((trace) => ({
      ...trace,
    }))
  }, [data, animate])

  return (
    <div className="fade-in">
      <Plot
        data={animatedData}
        layout={smartLayout}
        config={mergedConfig}
        style={{
          width: '100%',
          height: '400px',
          ...style,
        }}
        className={className}
        useResizeHandler
        onRelayout={onRelayout}
        onInitialized={() => {
          // Animation handled by Plotly's transition config
        }}
      />
    </div>
  )
}

/**
 * Determine smart Y-axis formatting based on data values.
 */
function getSmartYAxisFormat(data: Data[]): string {
  let maxValue = 0

  for (const trace of data) {
    const yValues = (trace as { y?: (number | null)[] }).y
    if (Array.isArray(yValues)) {
      for (const val of yValues) {
        if (typeof val === 'number' && !isNaN(val)) {
          maxValue = Math.max(maxValue, Math.abs(val))
        }
      }
    }
  }

  return getAxisTickFormat(maxValue)
}

/**
 * Default trace styling for line charts.
 */
export const defaultLineStyle = {
  line: {
    width: 2,
    shape: 'spline' as const,
    smoothing: 0.8,
  },
  marker: {
    size: 6,
  },
}

/**
 * Default trace styling for bar charts.
 */
export const defaultBarStyle = {
  marker: {
    line: {
      width: 0,
    },
  },
}

/**
 * Generate a professional hovertemplate.
 */
export function createHoverTemplate(
  xLabel: string,
  yLabel: string,
  options: {
    showName?: boolean
    yFormat?: string
  } = {}
): string {
  const { showName = true, yFormat = ',.2s' } = options

  const namePart = showName ? '<b>%{fullData.name}</b><br>' : ''

  return `${namePart}<b>${xLabel}:</b> %{x}<br><b>${yLabel}:</b> %{y:${yFormat}}<extra></extra>`
}
