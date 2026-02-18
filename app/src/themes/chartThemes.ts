/**
 * Chart theme definitions.
 *
 * Each theme controls palette, typography, plot styling, card chrome, and
 * optional accent elements (e.g. The Economist red bar).
 *
 * Convention: empty string '' for a color means "use the CSS variable"
 * (preserves dark/light mode). Explicit hex values override both modes.
 */

// -- Interface ---------------------------------------------------------------

export interface ChartTheme {
  id: string
  name: string
  description: string

  palette: {
    colors: string[]
    primary: string
  }

  font: {
    family: string
    title: { size: number; weight: number; color: string }
    subtitle: { size: number; weight: number; color: string }
    source: { size: number; weight: number; color: string }
    axis: { size: number; weight: number; color: string }
    notes: { size: number; weight: number; color: string; italic: boolean }
    valueLabel: { size: number; weight: number }
    tabularNums: boolean
  }

  plot: {
    background: string
    marginTop: number
    marginRight: number
    marginBottom: number
    marginLeft: number
    grid: { x: boolean; y: boolean; color: string; shapeRendering: string }
    axes: { xLine: boolean; yLine: boolean; yStrokeWidth: number }
    baseline: { color: string; width: number }
    barTrack: boolean
    barTrackColor: string
    defaultLineWidth: number
  }

  pie: {
    innerRadius: number
    labelStyle: 'external' | 'internal'
    connectorColor: string
    connectorDotRadius: number
    sliceStroke: string
    sliceStrokeWidth: number
  }

  card: {
    background: string
    borderColor: string
    textSecondary: string
  }

  accent?: {
    color: string
    barHeight: number
    tag: { width: number; height: number }
  }
}

// -- Story Analytics Default Theme -------------------------------------------

const defaultTheme: ChartTheme = {
  id: 'default',
  name: 'Story Analytics',
  description: 'Publication-ready charts with clean typography and minimal chrome',

  palette: {
    colors: ['#18a1cd', '#c0392b', '#3d918d', '#e6a817', '#8e6bb0', '#d4774a', '#6aa84f', '#cccccc'],
    primary: '#18a1cd',
  },

  font: {
    family: 'Roboto, sans-serif',
    title: { size: 22, weight: 700, color: '#1a1a1a' },
    subtitle: { size: 14, weight: 400, color: '#666666' },
    source: { size: 12, weight: 400, color: '#888888' },
    axis: { size: 12, weight: 400, color: '#555555' },
    notes: { size: 12, weight: 400, color: '#888888', italic: true },
    valueLabel: { size: 12, weight: 400 },
    tabularNums: true,
  },

  plot: {
    background: '',
    marginTop: 8,
    marginRight: 24,
    marginBottom: 36,
    marginLeft: 48,
    grid: { x: false, y: true, color: '#d9d9d9', shapeRendering: 'crispEdges' },
    axes: { xLine: false, yLine: false, yStrokeWidth: 1 },
    baseline: { color: '#333333', width: 2 },
    barTrack: true,
    barTrackColor: '#e5e5e5',
    defaultLineWidth: 2.5,
  },

  pie: {
    innerRadius: 0,
    labelStyle: 'external',
    connectorColor: '#999999',
    connectorDotRadius: 3,
    sliceStroke: '#ffffff',
    sliceStrokeWidth: 1,
  },

  card: {
    background: '',
    borderColor: '',
    textSecondary: '',
  },
}

// -- The Economist Theme -----------------------------------------------------

const economistTheme: ChartTheme = {
  id: 'economist',
  name: 'The Economist',
  description: 'Signature red accent bar, clean axes, horizontal gridlines',

  palette: {
    colors: [
      '#006BA2', '#3EBCD2', '#DB444B', '#379A8B',
      '#EBB434', '#B4BA39', '#9A607F', '#D1B07C',
    ],
    primary: '#006BA2',
  },

  font: {
    family: 'Inter, system-ui, sans-serif',
    title: { size: 18, weight: 700, color: '#1a1a1a' },
    subtitle: { size: 14, weight: 400, color: '#4a4a4a' },
    source: { size: 11, weight: 400, color: '#888888' },
    axis: { size: 12, weight: 400, color: '#555555' },
    notes: { size: 11, weight: 400, color: '#888888', italic: true },
    valueLabel: { size: 11, weight: 400 },
    tabularNums: true,
  },

  plot: {
    background: '#ffffff',
    marginTop: 8,
    marginRight: 16,
    marginBottom: 48,
    marginLeft: 56,
    grid: { x: false, y: true, color: '#c8c8c8', shapeRendering: 'crispEdges' },
    axes: { xLine: true, yLine: true, yStrokeWidth: 1.1 },
    baseline: { color: '#333333', width: 1.5 },
    barTrack: false,
    barTrackColor: '#e5e5e5',
    defaultLineWidth: 2,
  },

  pie: {
    innerRadius: 0.4,
    labelStyle: 'internal',
    connectorColor: '#999999',
    connectorDotRadius: 3,
    sliceStroke: '#ffffff',
    sliceStrokeWidth: 2,
  },

  card: {
    background: '#ffffff',
    borderColor: '#e0e0e0',
    textSecondary: '#888888',
  },

  accent: {
    color: '#E3120B',
    barHeight: 3,
    tag: { width: 60, height: 12 },
  },
}

// -- Registry ----------------------------------------------------------------

export const CHART_THEMES: Record<string, ChartTheme> = {
  default: defaultTheme,
  economist: economistTheme,
}

export type ChartThemeId = keyof typeof CHART_THEMES
