/**
 * Datawrapper-inspired theme for Observable Plot charts.
 * Consolidated from the PoC observableTheme.ts.
 */

// -- Color Palettes ----------------------------------------------------------

/** Default multi-series palette (steel blue primary) */
export const CHART_COLORS = [
  '#2166ac', // steel blue (primary)
  '#d6604d', // muted red
  '#4dac26', // green
  '#b2abd2', // lavender
  '#e08214', // orange
] as const

/** Single-series default */
export const PRIMARY_COLOR = '#2166ac'

/** Sequential palettes for intensity encoding */
export const PALETTES = {
  default: [...CHART_COLORS],
  blues: ['#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'],
  reds: ['#fcbba1', '#fc9272', '#fb6a4a', '#de2d26', '#a50f15'],
  greens: ['#c7e9c0', '#a1d99b', '#74c476', '#31a354', '#006d2c'],
} as const

export type PaletteKey = keyof typeof PALETTES

// -- Typography & Spacing ----------------------------------------------------

export const FONT = {
  family: 'Inter, system-ui, sans-serif',
  title: { size: 18, weight: 600 },
  subtitle: { size: 14, weight: 400 },
  source: { size: 11, weight: 400 },
  axis: { size: 12, weight: 400 },
} as const

// -- CSS-var-aware color readers ---------------------------------------------

/** Read current theme colors from CSS custom properties at render time. */
function themeColors() {
  const s = getComputedStyle(document.documentElement)
  return {
    background: s.getPropertyValue('--color-surface').trim() || '#ffffff',
    grid: s.getPropertyValue('--color-grid').trim() || '#e5e5e5',
    axis: s.getPropertyValue('--color-axis').trim() || '#333333',
    textPrimary: s.getPropertyValue('--color-text-primary').trim() || '#1a1a1a',
    textSecondary: s.getPropertyValue('--color-text-secondary').trim() || '#666666',
    textMuted: s.getPropertyValue('--color-text-muted').trim() || '#999999',
  }
}

// -- Observable Plot Defaults ------------------------------------------------

/** Standard plot options to spread into Plot.plot() */
export function plotDefaults(overrides: Record<string, unknown> = {}) {
  const colors = themeColors()

  return {
    style: {
      fontFamily: FONT.family,
      fontSize: `${FONT.axis.size}px`,
      background: colors.background,
      color: colors.textSecondary,
    },
    marginTop: 8,
    marginRight: 16,
    marginBottom: 48,
    marginLeft: 56,
    grid: true,
    x: { line: true, tickSize: 0, labelOffset: 8 },
    y: { line: true, tickSize: 0, labelOffset: 8, grid: true },
    color: { range: [...CHART_COLORS] },
    ...overrides,
  }
}
