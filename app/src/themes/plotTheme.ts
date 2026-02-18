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

/** Monochrome palettes — reordered for max spread so any prefix is distinct */
export const PALETTES = {
  default: [...CHART_COLORS],
  blues: ['#08519c', '#c6dbef', '#6baed6', '#3182bd', '#9ecae1'],
  reds: ['#a50f15', '#fcbba1', '#fb6a4a', '#de2d26', '#fc9272'],
  greens: ['#006d2c', '#c7e9c0', '#74c476', '#31a354', '#a1d99b'],
} as const

export type PaletteKey = keyof typeof PALETTES

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
