/**
 * Area chart component using Plotly.
 * Supports stacked areas with comprehensive config options.
 */

import { PlotlyChart } from './PlotlyChart'
import type { ChartConfig } from '../../types/chart'
import type { Data, Layout } from 'plotly.js'

interface AreaChartProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function AreaChart({ data, config }: AreaChartProps) {
  const xColumn = config.x
  const yColumns = Array.isArray(config.y) ? config.y : config.y ? [config.y] : []
  const seriesColumn = config.series
  const isStacked = config.stacked

  if (!xColumn || yColumns.length === 0) {
    return <div className="error-message">Missing x or y column configuration</div>
  }

  const traces: Data[] = []
  let stackGroup = 0

  // Get styling from config
  const lineWidth = config.lineWidth ?? 1
  const customColor = config.color
  const fillColor = config.fillColor

  if (seriesColumn) {
    // Group by series column
    const seriesValues = [...new Set(data.map(row => String(row[seriesColumn])))]

    // Explicit colors for each series to ensure visibility
    const seriesColors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

    for (let i = 0; i < seriesValues.length; i++) {
      const seriesValue = seriesValues[i]
      const seriesData = data.filter(row => String(row[seriesColumn]) === seriesValue)

      for (const yColumn of yColumns) {
        const yValues = seriesData.map(row => row[yColumn])
        const trace: Data = {
          type: 'scatter',
          mode: 'lines',
          fill: 'tozeroy',
          name: yColumns.length > 1 ? `${seriesValue} - ${yColumn}` : seriesValue,
          x: seriesData.map(row => row[xColumn]) as Plotly.Datum[],
          y: yValues as Plotly.Datum[],
          stackgroup: isStacked ? `stack${stackGroup++}` : undefined,
          line: {
            width: lineWidth,
            color: seriesColors[i % seriesColors.length],
          },
          fillcolor: seriesColors[i % seriesColors.length] + '40', // Add transparency
        }

        // Apply showValues config
        if (config.showValues) {
          trace.text = yValues as string[]
          trace.textposition = 'top center'
          trace.mode = 'lines+text'
        }

        traces.push(trace)
      }
    }
  } else {
    // No series grouping - one trace per y column
    for (const yColumn of yColumns) {
      const yValues = data.map(row => row[yColumn])
      const trace: Data = {
        type: 'scatter',
        mode: 'lines',
        fill: isStacked ? 'tonexty' : 'tozeroy',
        name: yColumn,
        x: data.map(row => row[xColumn]) as Plotly.Datum[],
        y: yValues as Plotly.Datum[],
        stackgroup: isStacked ? 'stack' : undefined,
        line: {
          width: lineWidth,
          color: customColor,
        },
        fillcolor: fillColor || (customColor ? customColor + '40' : undefined),
      }

      // Apply showValues config
      if (config.showValues) {
        trace.text = yValues as string[]
        trace.textposition = 'top center'
        trace.mode = 'lines+text'
      }

      traces.push(trace)
    }
  }

  // Build layout with all config options
  const axisFontSize = config.axisFontSize || 12
  const tickAngle = config.tickAngle ?? 0
  const showGrid = config.showGrid !== false
  const gridColor = config.gridColor || '#e5e7eb'

  const layout: Partial<Layout> = {
    title: config.title
      ? {
          text: config.title,
          font: {
            size: config.titleFontSize || 14,
            color: '#374151',
          },
          x: 0.02,
          xanchor: 'left',
        }
      : undefined,
    xaxis: {
      title: config.xAxisTitle
        ? { text: config.xAxisTitle, font: { size: axisFontSize } }
        : undefined,
      tickangle: tickAngle,
      tickfont: { size: axisFontSize },
      showgrid: showGrid,
      gridcolor: gridColor,
    },
    yaxis: {
      title: config.yAxisTitle
        ? { text: config.yAxisTitle, font: { size: axisFontSize } }
        : undefined,
      tickfont: { size: axisFontSize },
      showgrid: showGrid,
      gridcolor: gridColor,
      range: config.yAxisMin != null || config.yAxisMax != null
        ? [config.yAxisMin ?? undefined, config.yAxisMax ?? undefined]
        : undefined,
    },
    showlegend: config.showLegend ?? traces.length > 1,
    legend: {
      orientation: 'h',
      y: -0.15,
      x: 0.5,
      xanchor: 'center',
      font: { size: config.legendFontSize || 11 },
    },
    paper_bgcolor: config.backgroundColor || 'transparent',
    plot_bgcolor: config.backgroundColor || 'transparent',
  }

  return <PlotlyChart data={traces} layout={layout} />
}
