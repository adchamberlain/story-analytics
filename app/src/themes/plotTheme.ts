/**
 * Story Analytics default chart theme for Observable Plot.
 * Provides color palettes, typography, and plot configuration.
 */

import type { ChartTheme } from './chartThemes'

// -- Color Palettes ----------------------------------------------------------

/** Default multi-series palette (teal primary) */
export const CHART_COLORS = [
  '#18a1cd', // teal blue (primary)
  '#c0392b', // brick red
  '#3d918d', // deep teal-green
  '#e6a817', // amber
  '#8e6bb0', // purple
  '#d4774a', // warm orange
  '#6aa84f', // green
  '#cccccc', // neutral gray
] as const

/** Single-series default */
export const PRIMARY_COLOR = '#18a1cd'

/** Named palettes — reordered for max spread so any prefix is distinct */
export const PALETTES = {
  // -- Categorical --
  default: [...CHART_COLORS],
  tableau10: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7'],
  colorbrewer_set2: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
  colorbrewer_paired: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00'],
  datawrapper: ['#1d81a2', '#e6574f', '#9bc53d', '#ffa630', '#6e52b5', '#43b08c', '#d4459c', '#a0522d'],
  vibrant: ['#ee4035', '#f37736', '#fdf498', '#7bc043', '#0392cf', '#d63ce0', '#e8d21d', '#1ab394'],
  // -- Sequential --
  blues: ['#08519c', '#c6dbef', '#6baed6', '#3182bd', '#9ecae1'],
  reds: ['#a50f15', '#fcbba1', '#fb6a4a', '#de2d26', '#fc9272'],
  greens: ['#006d2c', '#c7e9c0', '#74c476', '#31a354', '#a1d99b'],
  purples: ['#3f007d', '#dadaeb', '#9e9ac8', '#6a51a3', '#bcbddc'],
  oranges: ['#7f2704', '#fdd0a2', '#fd8d3c', '#d94701', '#fdae6b'],
  warm: ['#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#993404', '#662506'],
  cool: ['#e0f3db', '#a8ddb5', '#7bccc4', '#4eb3d3', '#2b8cbe', '#0868ac', '#084081'],
  // -- Diverging --
  redBlue: ['#b2182b', '#ef8a62', '#fddbc7', '#f7f7f7', '#d1e5f0', '#67a9cf', '#2166ac'],
  brownTeal: ['#8c510a', '#d8b365', '#f6e8c3', '#f5f5f5', '#c7eae5', '#5ab4ac', '#01665e'],
  pinkGreen: ['#c51b7d', '#e9a3c9', '#fde0ef', '#f7f7f7', '#e6f5d0', '#a1d76a', '#4d9221'],
} as const

export type PaletteKey = keyof typeof PALETTES

/** Palette category labels for UI grouping */
export const PALETTE_CATEGORIES: { label: string; keys: PaletteKey[] }[] = [
  {
    label: 'Categorical',
    keys: ['default', 'tableau10', 'colorbrewer_set2', 'colorbrewer_paired', 'datawrapper', 'vibrant'],
  },
  {
    label: 'Sequential',
    keys: ['blues', 'reds', 'greens', 'purples', 'oranges', 'warm', 'cool'],
  },
  {
    label: 'Diverging',
    keys: ['redBlue', 'brownTeal', 'pinkGreen'],
  },
]

// -- Typography & Spacing ----------------------------------------------------

export const FONT = {
  family: 'Roboto, sans-serif',
  title: { size: 22, weight: 700 },
  subtitle: { size: 14, weight: 400 },
  source: { size: 12, weight: 400 },
  axis: { size: 12, weight: 400 },
} as const

// -- CSS-var-aware color readers ---------------------------------------------

/** Read current theme colors from CSS custom properties at render time. */
function themeColors() {
  const s = getComputedStyle(document.documentElement)
  return {
    background: s.getPropertyValue('--color-surface').trim() || '#ffffff',
    grid: s.getPropertyValue('--color-grid').trim() || '#d9d9d9',
    axis: s.getPropertyValue('--color-axis').trim() || '#333333',
    textPrimary: s.getPropertyValue('--color-text-primary').trim() || '#1a1a1a',
    textSecondary: s.getPropertyValue('--color-text-secondary').trim() || '#666666',
    textMuted: s.getPropertyValue('--color-text-muted').trim() || '#999999',
  }
}

/**
 * Resolve a color value: if the chart theme provides a non-empty string, use it;
 * otherwise fall back to the CSS variable value.
 */
function resolveColor(themeValue: string, cssVarValue: string): string {
  return themeValue || cssVarValue
}

// -- Observable Plot Defaults ------------------------------------------------

/** Standard plot options to spread into Plot.plot() */
export function plotDefaults(overrides: Record<string, unknown> = {}, chartTheme?: ChartTheme) {
  const cssColors = themeColors()

  const fontFamily = chartTheme?.font.family || FONT.family
  const fontSize = chartTheme?.font.axis.size ?? FONT.axis.size
  const background = resolveColor(chartTheme?.plot.background ?? '', cssColors.background)
  const textColor = resolveColor(chartTheme?.font.axis.color ?? '', cssColors.textSecondary)
  const gridColor = resolveColor(chartTheme?.plot.grid.color ?? '', cssColors.grid)

  const gridY = chartTheme?.plot.grid.y ?? true
  const xLine = chartTheme?.plot.axes.xLine ?? false
  const yLine = chartTheme?.plot.axes.yLine ?? false

  const palette = chartTheme?.palette.colors ?? [...CHART_COLORS]

  return {
    style: {
      fontFamily,
      fontSize: `${fontSize}px`,
      background,
      color: textColor,
      fontVariantNumeric: chartTheme?.font.tabularNums !== false ? 'tabular-nums' : 'normal',
    },
    marginTop: chartTheme?.plot.marginTop ?? 8,
    marginRight: chartTheme?.plot.marginRight ?? 24,
    marginBottom: chartTheme?.plot.marginBottom ?? 36,
    marginLeft: chartTheme?.plot.marginLeft ?? 48,
    grid: false, // top-level grid (x-axis) — controlled per chart type
    x: { line: xLine, tickSize: 0, labelOffset: 8 },
    y: { line: yLine, tickSize: 0, labelOffset: 8, grid: !gridY ? false : (gridColor || true) },
    color: { range: [...palette] },
    ...overrides,
  }
}
