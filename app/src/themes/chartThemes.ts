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
  }

  plot: {
    background: string
    marginTop: number
    marginRight: number
    marginBottom: number
    marginLeft: number
    grid: { x: boolean; y: boolean; color: string }
    axes: { xLine: boolean; yLine: boolean; yStrokeWidth: number }
    defaultLineWidth: number
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

// -- Default Theme -----------------------------------------------------------

const defaultTheme: ChartTheme = {
  id: 'default',
  name: 'Default',
  description: 'Clean Datawrapper-inspired style with dark/light mode support',

  palette: {
    colors: ['#2166ac', '#d6604d', '#4dac26', '#b2abd2', '#e08214'],
    primary: '#2166ac',
  },

  font: {
    family: '',
    title: { size: 18, weight: 600, color: '' },
    subtitle: { size: 14, weight: 400, color: '' },
    source: { size: 11, weight: 400, color: '' },
    axis: { size: 12, weight: 400, color: '' },
  },

  plot: {
    background: '',
    marginTop: 8,
    marginRight: 16,
    marginBottom: 48,
    marginLeft: 56,
    grid: { x: false, y: true, color: '' },
    axes: { xLine: true, yLine: true, yStrokeWidth: 1 },
    defaultLineWidth: 2,
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
  },

  plot: {
    background: '#ffffff',
    marginTop: 8,
    marginRight: 16,
    marginBottom: 48,
    marginLeft: 56,
    grid: { x: false, y: true, color: '#c8c8c8' },
    axes: { xLine: true, yLine: true, yStrokeWidth: 1.1 },
    defaultLineWidth: 2,
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
