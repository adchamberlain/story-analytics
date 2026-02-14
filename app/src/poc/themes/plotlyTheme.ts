import type { Layout } from 'plotly.js'

export const CHART_COLORS = ['#2166ac', '#d6604d', '#4dac26', '#b2abd2', '#e08214']

export const datawrapperPlotlyLayout: Partial<Layout> = {
  font: {
    family: 'Inter, system-ui, sans-serif',
    size: 12,
    color: '#666666',
  },
  paper_bgcolor: '#ffffff',
  plot_bgcolor: '#ffffff',
  margin: { t: 8, r: 16, b: 48, l: 56 },
  xaxis: {
    gridcolor: 'rgba(0,0,0,0)',
    linecolor: '#333333',
    linewidth: 1,
    tickfont: { size: 12, color: '#666666' },
    zeroline: false,
  },
  yaxis: {
    gridcolor: '#e5e5e5',
    gridwidth: 1,
    linecolor: '#333333',
    linewidth: 1,
    tickfont: { size: 12, color: '#666666' },
    zeroline: false,
  },
  legend: {
    orientation: 'h' as const,
    yanchor: 'bottom' as const,
    y: 1.02,
    xanchor: 'left' as const,
    x: 0,
    font: { size: 12, color: '#666666' },
    bgcolor: 'rgba(0,0,0,0)',
  },
  hoverlabel: {
    bgcolor: '#1a1a1a',
    font: { family: 'Inter, system-ui, sans-serif', size: 13, color: '#ffffff' },
    bordercolor: 'rgba(0,0,0,0)',
  },
  showlegend: true,
}

export const plotlyConfig = {
  displayModeBar: false,
  responsive: true,
} as const
