export const CHART_COLORS = ['#2166ac', '#d6604d', '#4dac26', '#b2abd2', '#e08214']

/** Shared Observable Plot marks/options for Datawrapper-style styling */
export const observableDefaults = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 12,
  labelColor: '#666666',
  gridColor: '#e5e5e5',
  axisColor: '#333333',
  background: '#ffffff',
} as const

/** Standard plot options to spread into Plot.plot() */
export function datawrapperPlotOptions(overrides: Record<string, unknown> = {}) {
  return {
    style: {
      fontFamily: observableDefaults.fontFamily,
      fontSize: `${observableDefaults.fontSize}px`,
      background: observableDefaults.background,
    },
    marginTop: 8,
    marginRight: 16,
    marginBottom: 48,
    marginLeft: 56,
    grid: true,
    x: { line: true, tickSize: 0, labelOffset: 8 },
    y: { line: true, tickSize: 0, labelOffset: 8, grid: true },
    color: { range: CHART_COLORS },
    ...overrides,
  }
}
