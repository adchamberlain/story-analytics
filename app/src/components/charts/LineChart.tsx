/**
 * Line chart component using Plotly.
 * Converts ChartSpec to Plotly line traces with professional styling.
 */

import { PlotlyChart, defaultLineStyle, createHoverTemplate } from './PlotlyChart'
import type { ChartConfig } from '../../types/chart'
import type { Data, Layout } from 'plotly.js'

interface LineChartProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function LineChart({ data, config }: LineChartProps) {
  const xColumn = config.x
  const yColumns = Array.isArray(config.y) ? config.y : config.y ? [config.y] : []
  const seriesColumn = config.series

  if (!xColumn || yColumns.length === 0) {
    return <div className="error-message">Missing x or y column configuration</div>
  }

  const traces: Data[] = []

  // Determine axis labels for hover template
  const xLabel = config.xAxisTitle || xColumn

  // Get line styling from config
  const lineWidth = config.lineWidth ?? defaultLineStyle.line?.width ?? 2
  const markerSize = config.markerSize ?? defaultLineStyle.marker?.size ?? 6

  if (seriesColumn) {
    // Group by series column - handle case-insensitive column matching
    // Find the actual column name in the data (may differ in case)
    const firstRow = data[0] || {}
    const actualSeriesColumn = Object.keys(firstRow).find(
      key => key.toLowerCase() === seriesColumn.toLowerCase()
    ) || seriesColumn

    const seriesValues = [...new Set(data.map(row => {
      const val = row[actualSeriesColumn]
      return val != null ? String(val) : null
    }).filter((v): v is string => v !== null && v !== 'null' && v !== 'undefined'))]

    // Explicit colors for each series to ensure visibility
    const seriesColors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

    for (let i = 0; i < seriesValues.length; i++) {
      const seriesValue = seriesValues[i]
      const seriesData = data.filter(row => String(row[actualSeriesColumn]) === seriesValue)

      for (const yColumn of yColumns) {
        const xValues = seriesData.map(row => row[xColumn])
        const yValues = seriesData.map(row => row[yColumn])

        const trace: Data = {
          type: 'scatter',
          mode: 'lines+markers',
          name: yColumns.length > 1 ? `${seriesValue} - ${yColumn}` : seriesValue,
          x: xValues as Plotly.Datum[],
          y: yValues as Plotly.Datum[],
          line: {
            ...defaultLineStyle.line,
            width: lineWidth,
            color: seriesColors[i % seriesColors.length],
          },
          marker: {
            ...defaultLineStyle.marker,
            size: markerSize,
            color: seriesColors[i % seriesColors.length],
          },
          hovertemplate: createHoverTemplate(xLabel, yColumn, {
            showName: seriesValues.length > 1 || yColumns.length > 1,
          }),
        }

        // Apply showValues config
        if (config.showValues) {
          trace.text = yValues as string[]
          trace.textposition = 'top center'
          trace.mode = 'text+lines+markers'
        }

        traces.push(trace)
      }
    }
  } else {
    // No series grouping - one trace per y column
    const customColor = config.color
    for (const yColumn of yColumns) {
      const yValues = data.map(row => row[yColumn])

      const trace: Data = {
        type: 'scatter',
        mode: 'lines+markers',
        name: yColumn,
        x: data.map(row => row[xColumn]) as Plotly.Datum[],
        y: yValues as Plotly.Datum[],
        line: {
          ...defaultLineStyle.line,
          width: lineWidth,
          color: customColor,
        },
        marker: {
          ...defaultLineStyle.marker,
          size: markerSize,
          color: customColor,
        },
        hovertemplate: createHoverTemplate(xLabel, yColumn, {
          showName: yColumns.length > 1,
        }),
      }

      // Apply showValues config
      if (config.showValues) {
        trace.text = yValues as string[]
        trace.textposition = 'top center'
        trace.mode = 'text+lines+markers'
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
    hovermode: 'x unified',
    paper_bgcolor: config.backgroundColor || 'transparent',
    plot_bgcolor: config.backgroundColor || 'transparent',
  }

  return <PlotlyChart data={traces} layout={layout} />
}
