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

  /** Custom CSS overrides scoped to the chart container */
  customCss?: string

  /** URL for loading a custom font (Google Fonts CSS URL or base64 data URL) */
  fontUrl?: string

  /** Base64 data URL of an uploaded logo image */
  logoUrl?: string

  /** Corner position for the logo overlay */
  logoPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

  /** Logo width in pixels (default 60) */
  logoSize?: number
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
    title: { size: 22, weight: 700, color: '' },
    subtitle: { size: 14, weight: 400, color: '' },
    source: { size: 12, weight: 400, color: '' },
    axis: { size: 12, weight: 400, color: '' },
    notes: { size: 12, weight: 400, color: '', italic: true },
    valueLabel: { size: 12, weight: 400 },
    tabularNums: true,
  },

  plot: {
    background: '',
    marginTop: 8,
    marginRight: 24,
    marginBottom: 36,
    marginLeft: 48,
    grid: { x: false, y: true, color: '', shapeRendering: 'crispEdges' },
    axes: { xLine: false, yLine: false, yStrokeWidth: 1 },
    baseline: { color: '', width: 2 },
    barTrack: true,
    barTrackColor: '',
    defaultLineWidth: 2.5,
  },

  pie: {
    innerRadius: 0,
    labelStyle: 'external',
    connectorColor: '',
    connectorDotRadius: 3,
    sliceStroke: '',
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

// -- Minimal Theme -----------------------------------------------------------

const minimalTheme: ChartTheme = {
  id: 'minimal',
  name: 'Minimal',
  description: 'Stripped-back Helvetica style, no visual chrome',

  palette: {
    colors: ['#333333', '#666666', '#999999', '#bbbbbb', '#555555', '#888888', '#aaaaaa', '#dddddd'],
    primary: '#333333',
  },

  font: {
    family: 'Helvetica Neue, Helvetica, Arial, sans-serif',
    title: { size: 20, weight: 700, color: '#1a1a1a' },
    subtitle: { size: 13, weight: 400, color: '#666666' },
    source: { size: 11, weight: 400, color: '#999999' },
    axis: { size: 11, weight: 400, color: '#666666' },
    notes: { size: 11, weight: 400, color: '#999999', italic: false },
    valueLabel: { size: 11, weight: 400 },
    tabularNums: true,
  },

  plot: {
    background: '#ffffff',
    marginTop: 8,
    marginRight: 16,
    marginBottom: 32,
    marginLeft: 44,
    grid: { x: false, y: false, color: '#e5e5e5', shapeRendering: 'crispEdges' },
    axes: { xLine: true, yLine: false, yStrokeWidth: 1 },
    baseline: { color: '#333333', width: 1 },
    barTrack: false,
    barTrackColor: '#f0f0f0',
    defaultLineWidth: 2,
  },

  pie: {
    innerRadius: 0,
    labelStyle: 'external',
    connectorColor: '#999999',
    connectorDotRadius: 2,
    sliceStroke: '#ffffff',
    sliceStrokeWidth: 1,
  },

  card: {
    background: '#ffffff',
    borderColor: '#e5e5e5',
    textSecondary: '#999999',
  },
}

// -- NYT Theme ---------------------------------------------------------------

const nytTheme: ChartTheme = {
  id: 'nyt',
  name: 'New York Times',
  description: 'Franklin Gothic headers, gray grid, red accent',

  palette: {
    colors: ['#d73027', '#4575b4', '#fdae61', '#abd9e9', '#f46d43', '#74add1', '#fee090', '#e0f3f8'],
    primary: '#d73027',
  },

  font: {
    family: '"Franklin Gothic Medium", "ITC Franklin Gothic", Arial, sans-serif',
    title: { size: 20, weight: 700, color: '#121212' },
    subtitle: { size: 14, weight: 400, color: '#555555' },
    source: { size: 11, weight: 400, color: '#888888' },
    axis: { size: 11, weight: 400, color: '#666666' },
    notes: { size: 11, weight: 400, color: '#888888', italic: true },
    valueLabel: { size: 11, weight: 500 },
    tabularNums: true,
  },

  plot: {
    background: '#ffffff',
    marginTop: 8,
    marginRight: 16,
    marginBottom: 40,
    marginLeft: 48,
    grid: { x: false, y: true, color: '#d9d9d9', shapeRendering: 'crispEdges' },
    axes: { xLine: true, yLine: false, yStrokeWidth: 1 },
    baseline: { color: '#999999', width: 1 },
    barTrack: false,
    barTrackColor: '#f0f0f0',
    defaultLineWidth: 2,
  },

  pie: {
    innerRadius: 0,
    labelStyle: 'external',
    connectorColor: '#999999',
    connectorDotRadius: 3,
    sliceStroke: '#ffffff',
    sliceStrokeWidth: 1.5,
  },

  card: {
    background: '#ffffff',
    borderColor: '#e2e2e2',
    textSecondary: '#666666',
  },
}

// -- Nature Theme ------------------------------------------------------------

const natureTheme: ChartTheme = {
  id: 'nature',
  name: 'Nature',
  description: 'Serif headers, blue palette, compact scientific styling',

  palette: {
    colors: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f'],
    primary: '#1f77b4',
  },

  font: {
    family: 'Georgia, "Times New Roman", serif',
    title: { size: 18, weight: 700, color: '#222222' },
    subtitle: { size: 13, weight: 400, color: '#555555' },
    source: { size: 10, weight: 400, color: '#888888' },
    axis: { size: 10, weight: 400, color: '#555555' },
    notes: { size: 10, weight: 400, color: '#888888', italic: true },
    valueLabel: { size: 10, weight: 400 },
    tabularNums: true,
  },

  plot: {
    background: '#ffffff',
    marginTop: 6,
    marginRight: 12,
    marginBottom: 36,
    marginLeft: 44,
    grid: { x: false, y: true, color: '#e0e0e0', shapeRendering: 'crispEdges' },
    axes: { xLine: true, yLine: true, yStrokeWidth: 0.8 },
    baseline: { color: '#555555', width: 1 },
    barTrack: false,
    barTrackColor: '#f5f5f5',
    defaultLineWidth: 1.8,
  },

  pie: {
    innerRadius: 0,
    labelStyle: 'external',
    connectorColor: '#aaaaaa',
    connectorDotRadius: 2,
    sliceStroke: '#ffffff',
    sliceStrokeWidth: 1,
  },

  card: {
    background: '#ffffff',
    borderColor: '#ddd',
    textSecondary: '#777777',
  },
}

// -- FiveThirtyEight Theme ---------------------------------------------------

const fiveThirtyEightTheme: ChartTheme = {
  id: 'fivethirtyeight',
  name: 'FiveThirtyEight',
  description: 'Bold headers, signature palette, light gray background',

  palette: {
    colors: ['#30a2da', '#fc4f30', '#e5ae38', '#6d904f', '#8b8b8b', '#b96db8', '#ff9e27', '#56bf8b'],
    primary: '#30a2da',
  },

  font: {
    family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    title: { size: 22, weight: 800, color: '#222222' },
    subtitle: { size: 14, weight: 400, color: '#555555' },
    source: { size: 11, weight: 400, color: '#aaaaaa' },
    axis: { size: 11, weight: 500, color: '#999999' },
    notes: { size: 11, weight: 400, color: '#aaaaaa', italic: true },
    valueLabel: { size: 11, weight: 500 },
    tabularNums: true,
  },

  plot: {
    background: '#f0f0f0',
    marginTop: 12,
    marginRight: 20,
    marginBottom: 40,
    marginLeft: 52,
    grid: { x: false, y: true, color: '#cbcbcb', shapeRendering: 'crispEdges' },
    axes: { xLine: false, yLine: false, yStrokeWidth: 0 },
    baseline: { color: '#cbcbcb', width: 0 },
    barTrack: false,
    barTrackColor: '#e0e0e0',
    defaultLineWidth: 3,
  },

  pie: {
    innerRadius: 0.35,
    labelStyle: 'external',
    connectorColor: '#cccccc',
    connectorDotRadius: 3,
    sliceStroke: '#f0f0f0',
    sliceStrokeWidth: 2,
  },

  card: {
    background: '#f0f0f0',
    borderColor: '#dcdcdc',
    textSecondary: '#999999',
  },
}

// -- Academic Theme -----------------------------------------------------------

const academicTheme: ChartTheme = {
  id: 'academic',
  name: 'Academic',
  description: 'Times New Roman, APA-style margins, grayscale-friendly',

  palette: {
    colors: ['#000000', '#555555', '#999999', '#cccccc', '#333333', '#777777', '#aaaaaa', '#e0e0e0'],
    primary: '#000000',
  },

  font: {
    family: '"Times New Roman", Times, Georgia, serif',
    title: { size: 16, weight: 700, color: '#000000' },
    subtitle: { size: 12, weight: 400, color: '#333333' },
    source: { size: 10, weight: 400, color: '#666666' },
    axis: { size: 10, weight: 400, color: '#333333' },
    notes: { size: 10, weight: 400, color: '#666666', italic: true },
    valueLabel: { size: 10, weight: 400 },
    tabularNums: true,
  },

  plot: {
    background: '#ffffff',
    marginTop: 8,
    marginRight: 12,
    marginBottom: 40,
    marginLeft: 52,
    grid: { x: false, y: true, color: '#e0e0e0', shapeRendering: 'crispEdges' },
    axes: { xLine: true, yLine: true, yStrokeWidth: 1 },
    baseline: { color: '#000000', width: 1 },
    barTrack: false,
    barTrackColor: '#f0f0f0',
    defaultLineWidth: 1.5,
  },

  pie: {
    innerRadius: 0,
    labelStyle: 'external',
    connectorColor: '#666666',
    connectorDotRadius: 2,
    sliceStroke: '#ffffff',
    sliceStrokeWidth: 1,
  },

  card: {
    background: '#ffffff',
    borderColor: '#cccccc',
    textSecondary: '#666666',
  },
}

// -- Dark Theme --------------------------------------------------------------

const darkTheme: ChartTheme = {
  id: 'dark',
  name: 'Dark',
  description: 'Dark background with vibrant, high-contrast accents',

  palette: {
    colors: ['#00d4aa', '#ff6b6b', '#4ecdc4', '#ffd93d', '#6c5ce7', '#fd79a8', '#a29bfe', '#81ecec'],
    primary: '#00d4aa',
  },

  font: {
    family: 'Inter, system-ui, sans-serif',
    title: { size: 20, weight: 700, color: '#f0f0f0' },
    subtitle: { size: 14, weight: 400, color: '#a0a0a0' },
    source: { size: 11, weight: 400, color: '#707070' },
    axis: { size: 11, weight: 400, color: '#909090' },
    notes: { size: 11, weight: 400, color: '#808080', italic: true },
    valueLabel: { size: 11, weight: 500 },
    tabularNums: true,
  },

  plot: {
    background: '#1a1a2e',
    marginTop: 8,
    marginRight: 20,
    marginBottom: 40,
    marginLeft: 52,
    grid: { x: false, y: true, color: '#2d2d44', shapeRendering: 'crispEdges' },
    axes: { xLine: false, yLine: false, yStrokeWidth: 0 },
    baseline: { color: '#3d3d5c', width: 1 },
    barTrack: false,
    barTrackColor: '#252540',
    defaultLineWidth: 2.5,
  },

  pie: {
    innerRadius: 0.4,
    labelStyle: 'external',
    connectorColor: '#555555',
    connectorDotRadius: 3,
    sliceStroke: '#1a1a2e',
    sliceStrokeWidth: 2,
  },

  card: {
    background: '#1a1a2e',
    borderColor: '#2d2d44',
    textSecondary: '#808080',
  },
}

// -- Pastel Theme ------------------------------------------------------------

const pastelTheme: ChartTheme = {
  id: 'pastel',
  name: 'Pastel',
  description: 'Soft colors, friendly rounded feel, approachable',

  palette: {
    colors: ['#b5e48c', '#99d98c', '#76c893', '#52b69a', '#34a0a4', '#168aad', '#1a759f', '#1e6091'],
    primary: '#52b69a',
  },

  font: {
    family: '"Nunito", "Rounded Mplus 1c", system-ui, sans-serif',
    title: { size: 20, weight: 700, color: '#2d3436' },
    subtitle: { size: 14, weight: 400, color: '#636e72' },
    source: { size: 11, weight: 400, color: '#b2bec3' },
    axis: { size: 11, weight: 500, color: '#636e72' },
    notes: { size: 11, weight: 400, color: '#b2bec3', italic: false },
    valueLabel: { size: 11, weight: 500 },
    tabularNums: true,
  },

  plot: {
    background: '#fefffe',
    marginTop: 8,
    marginRight: 20,
    marginBottom: 36,
    marginLeft: 48,
    grid: { x: false, y: true, color: '#e8f5e9', shapeRendering: 'crispEdges' },
    axes: { xLine: false, yLine: false, yStrokeWidth: 0 },
    baseline: { color: '#dfe6e9', width: 1 },
    barTrack: true,
    barTrackColor: '#f0faf0',
    defaultLineWidth: 2.5,
  },

  pie: {
    innerRadius: 0.3,
    labelStyle: 'external',
    connectorColor: '#b2bec3',
    connectorDotRadius: 3,
    sliceStroke: '#fefffe',
    sliceStrokeWidth: 2,
  },

  card: {
    background: '#fefffe',
    borderColor: '#e8f5e9',
    textSecondary: '#636e72',
  },
}

// -- Registry ----------------------------------------------------------------

export const CHART_THEMES: Record<string, ChartTheme> = {
  default: defaultTheme,
  economist: economistTheme,
  minimal: minimalTheme,
  nyt: nytTheme,
  nature: natureTheme,
  fivethirtyeight: fiveThirtyEightTheme,
  academic: academicTheme,
  dark: darkTheme,
  pastel: pastelTheme,
}

export type ChartThemeId = keyof typeof CHART_THEMES
