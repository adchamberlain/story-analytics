/**
 * Bar chart component using Plotly.
 * Supports horizontal, stacked, and grouped bars with professional styling.
 */

import { PlotlyChart, defaultBarStyle, createHoverTemplate } from './PlotlyChart'
import type { ChartConfig } from '../../types/chart'
import type { Data, Layout } from 'plotly.js'

interface BarChartProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function BarChart({ data, config }: BarChartProps) {
  const xColumn = config.x
  const yColumns = Array.isArray(config.y) ? config.y : config.y ? [config.y] : []
  const seriesColumn = config.series
  const isHorizontal = config.horizontal
  const isStacked = config.stacked

  if (!xColumn || yColumns.length === 0) {
    return <div className="error-message">Missing x or y column configuration</div>
  }

  const traces: Data[] = []

  // Determine axis labels for hover template
  const categoryLabel = config.xAxisTitle || xColumn
  const valueLabel = config.yAxisTitle || yColumns[0]

  // Get custom color from config
  const customColor = config.color

  if (seriesColumn) {
    // Group by series column
    const seriesValues = [...new Set(data.map(row => String(row[seriesColumn])))]

    for (const seriesValue of seriesValues) {
      const seriesData = data.filter(row => String(row[seriesColumn]) === seriesValue)

      for (const yColumn of yColumns) {
        const trace: Data = {
          type: 'bar',
          name: yColumns.length > 1 ? `${seriesValue} - ${yColumn}` : seriesValue,
          orientation: isHorizontal ? 'h' : 'v',
          ...defaultBarStyle,
          hovertemplate: isHorizontal
            ? createHoverTemplate(valueLabel, categoryLabel, { showName: true })
            : createHoverTemplate(categoryLabel, yColumn, { showName: true }),
        }

        if (isHorizontal) {
          trace.y = seriesData.map(row => row[xColumn]) as Plotly.Datum[]
          trace.x = seriesData.map(row => row[yColumn]) as Plotly.Datum[]
        } else {
          trace.x = seriesData.map(row => row[xColumn]) as Plotly.Datum[]
          trace.y = seriesData.map(row => row[yColumn]) as Plotly.Datum[]
        }

        // Apply showValues config
        if (config.showValues) {
          trace.text = (isHorizontal
            ? seriesData.map(row => row[yColumn])
            : seriesData.map(row => row[yColumn])
          ) as string[]
          trace.textposition = 'auto'
        }

        traces.push(trace)
      }
    }
  } else {
    // No series grouping - one trace per y column
    for (const yColumn of yColumns) {
      const trace: Data = {
        type: 'bar',
        name: yColumn,
        orientation: isHorizontal ? 'h' : 'v',
        ...defaultBarStyle,
        hovertemplate: isHorizontal
          ? createHoverTemplate(valueLabel, categoryLabel, { showName: yColumns.length > 1 })
          : createHoverTemplate(categoryLabel, yColumn, { showName: yColumns.length > 1 }),
      }

      // Apply custom color if provided
      if (customColor) {
        trace.marker = { ...trace.marker, color: customColor }
      }

      if (isHorizontal) {
        trace.y = data.map(row => row[xColumn]) as Plotly.Datum[]
        trace.x = data.map(row => row[yColumn]) as Plotly.Datum[]
      } else {
        trace.x = data.map(row => row[xColumn]) as Plotly.Datum[]
        trace.y = data.map(row => row[yColumn]) as Plotly.Datum[]
      }

      // Apply showValues config
      if (config.showValues) {
        trace.text = data.map(row => row[yColumn]) as string[]
        trace.textposition = 'auto'
      }

      traces.push(trace)
    }
  }

  // Build layout with all config options
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
    barmode: isStacked ? 'stack' : traces.length > 1 ? 'group' : undefined,
    bargap: config.barGap ?? 0.15,
    bargroupgap: config.barGroupGap ?? 0.1,
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

  // Configure axes
  const axisFontSize = config.axisFontSize || 12
  const tickAngle = config.tickAngle ?? (data.length > 8 ? -45 : 0)
  const showGrid = config.showGrid !== false
  const gridColor = config.gridColor || '#e5e7eb'

  if (isHorizontal) {
    layout.yaxis = {
      title: config.xAxisTitle
        ? { text: config.xAxisTitle, font: { size: axisFontSize } }
        : undefined,
      automargin: true,
      categoryorder: 'total ascending',
      tickfont: { size: axisFontSize },
      showgrid: showGrid,
      gridcolor: gridColor,
    }
    layout.xaxis = {
      title: config.yAxisTitle
        ? { text: config.yAxisTitle, font: { size: axisFontSize } }
        : undefined,
      tickfont: { size: axisFontSize },
      showgrid: showGrid,
      gridcolor: gridColor,
      range: config.yAxisMin != null || config.yAxisMax != null
        ? [config.yAxisMin ?? undefined, config.yAxisMax ?? undefined]
        : undefined,
    }
  } else {
    layout.xaxis = {
      title: config.xAxisTitle
        ? { text: config.xAxisTitle, font: { size: axisFontSize } }
        : undefined,
      tickangle: tickAngle,
      tickfont: { size: axisFontSize },
      showgrid: showGrid,
      gridcolor: gridColor,
    }
    layout.yaxis = {
      title: config.yAxisTitle
        ? { text: config.yAxisTitle, font: { size: axisFontSize } }
        : undefined,
      tickfont: { size: axisFontSize },
      showgrid: showGrid,
      gridcolor: gridColor,
      range: config.yAxisMin != null || config.yAxisMax != null
        ? [config.yAxisMin ?? undefined, config.yAxisMax ?? undefined]
        : undefined,
    }
  }

  return <PlotlyChart data={traces} layout={layout} />
}
