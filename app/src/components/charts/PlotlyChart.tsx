/**
 * Base Plotly chart wrapper component.
 * Handles common Plotly configuration and styling.
 */

import Plot from 'react-plotly.js'
import type { Data, Layout, Config } from 'plotly.js'

interface PlotlyChartProps {
  data: Data[]
  layout?: Partial<Layout>
  config?: Partial<Config>
  style?: React.CSSProperties
  className?: string
  onRelayout?: (event: Readonly<Plotly.PlotRelayoutEvent>) => void
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
    gridcolor: '#e5e7eb', // gray-200
    linecolor: '#d1d5db', // gray-300
    tickcolor: '#9ca3af', // gray-400
    tickfont: { color: '#6b7280' }, // gray-500
  },
  yaxis: {
    gridcolor: '#e5e7eb',
    linecolor: '#d1d5db',
    tickcolor: '#9ca3af',
    tickfont: { color: '#6b7280' },
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
}

export function PlotlyChart({
  data,
  layout,
  config,
  style,
  className,
  onRelayout,
}: PlotlyChartProps) {
  const mergedLayout = {
    ...defaultLayout,
    ...layout,
    xaxis: { ...defaultLayout.xaxis, ...layout?.xaxis },
    yaxis: { ...defaultLayout.yaxis, ...layout?.yaxis },
  }

  const mergedConfig = {
    ...defaultConfig,
    ...config,
  }

  return (
    <Plot
      data={data}
      layout={mergedLayout}
      config={mergedConfig}
      style={{
        width: '100%',
        height: '400px',
        ...style,
      }}
      className={className}
      useResizeHandler
      onRelayout={onRelayout}
    />
  )
}
