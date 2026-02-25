import type { ChartConfig } from '../types/chart'
import { PALETTES, type PaletteKey } from '../themes/plotTheme'

/**
 * Build a ChartConfig from an API chart response.
 * Shared by ChartViewPage, EmbedChartPage, PublicChartPage, and DashboardGrid
 * to avoid duplicating config field mappings.
 */
export function buildChartConfig(chart: {
  x?: string | null
  y?: string | string[] | null
  series?: string | null
  horizontal?: boolean
  sort?: boolean
  config?: Record<string, unknown> | null
  title?: string | null
  subtitle?: string | null
}): ChartConfig {
  const cfg = chart.config ?? {}

  // Multi-Y: backend UNPIVOT produces metric_name/metric_value columns
  const isMultiY = Array.isArray(chart.y) && chart.y.length > 1

  const chartConfig: ChartConfig = {
    x: chart.x ?? undefined,
    y: isMultiY ? 'metric_value' : (Array.isArray(chart.y) ? chart.y[0] : chart.y) ?? undefined,
    series: isMultiY ? 'metric_name' : (chart.series as string) ?? undefined,
    horizontal: chart.horizontal,
    sort: chart.sort,

    // Display options
    stacked: (cfg.stacked as boolean) ?? false,
    showGrid: (cfg.showGrid as boolean) ?? true,
    showLegend: (cfg.showLegend as boolean) ?? true,
    showValues: (cfg.showValues as boolean) ?? false,

    // Axis titles
    xAxisTitle: (cfg.xAxisTitle as string) || undefined,
    yAxisTitle: (cfg.yAxisTitle as string) || undefined,

    // Annotations
    annotations: cfg.annotations as ChartConfig['annotations'],

    // BigValue / KPI fields
    value: (cfg.value as string) ?? undefined,
    comparisonValue: (cfg.comparisonValue as string) ?? undefined,
    comparisonLabel: (cfg.comparisonLabel as string) || undefined,
    valueFormat: (cfg.valueFormat as ChartConfig['valueFormat']) || undefined,
    positiveIsGood: (cfg.positiveIsGood as boolean) ?? true,
    metricLabel: (cfg.metricLabel as string) ?? undefined,
    unitColumn: (cfg.unitColumn as string) ?? undefined,

    // Line/scatter options
    lineWidth: (cfg.lineWidth as number) ?? undefined,
    markerSize: (cfg.markerSize as number) ?? undefined,

    // Tooltip
    tooltipTemplate: (cfg.tooltipTemplate as string) || undefined,

    // RangePlot
    minColumn: (cfg.minColumn as string) ?? undefined,
    maxColumn: (cfg.maxColumn as string) ?? undefined,

    // BulletBar
    targetColumn: (cfg.targetColumn as string) ?? undefined,

    // SmallMultiples
    facetColumn: (cfg.facetColumn as string) ?? undefined,
    chartSubtype: (cfg.chartSubtype as ChartConfig['chartSubtype']) ?? undefined,

    // SplitBars
    leftColumn: (cfg.leftColumn as string) ?? undefined,
    rightColumn: (cfg.rightColumn as string) ?? undefined,

    // ArrowPlot
    startColumn: (cfg.startColumn as string) ?? undefined,
    endColumn: (cfg.endColumn as string) ?? undefined,

    // MultiplePies / ElectionDonut
    pieVariant: (cfg.pieVariant as ChartConfig['pieVariant']) ?? undefined,

    // DataTable
    tableColumns: (cfg.tableColumns as ChartConfig['tableColumns']) ?? undefined,

    // Choropleth map
    basemap: (cfg.basemap as string) || undefined,
    geoJoinColumn: (cfg.geoJoinColumn as string) ?? undefined,
    geoValueColumn: (cfg.geoValueColumn as string) ?? undefined,
    geoColorScale: (cfg.geoColorScale as string) || undefined,
    geoProjection: (cfg.geoProjection as string) || undefined,

    // Point map (Symbol/Locator/Spike)
    geoLatColumn: (cfg.geoLatColumn as string) ?? undefined,
    geoLonColumn: (cfg.geoLonColumn as string) ?? undefined,
    geoLabelColumn: (cfg.geoLabelColumn as string) ?? undefined,
    geoSizeColumn: (cfg.geoSizeColumn as string) ?? undefined,
    geoSymbolShape: (cfg.geoSymbolShape as ChartConfig['geoSymbolShape']) ?? undefined,
    geoSizeRange: (cfg.geoSizeRange as ChartConfig['geoSizeRange']) ?? undefined,
  }

  // Pass title and subtitle so detectValueUnit() can infer units from them
  if (chart.title) chartConfig.title = chart.title
  if (chart.subtitle) chartConfig.extraProps = { ...chartConfig.extraProps, subtitle: chart.subtitle }

  // Apply palette colors
  const palette = (cfg.palette as PaletteKey) ?? 'default'
  const paletteColors = PALETTES[palette] ?? PALETTES.default
  if (palette !== 'default') {
    chartConfig.colorRange = paletteColors
  }

  return chartConfig
}
