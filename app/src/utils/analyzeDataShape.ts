import type { ChartType } from '../types/chart'

export interface ShapeAdvice {
  level: 'info' | 'warning'
  message: string
  action?: {
    label: string
    type: 'switchChart' | 'hint'
    chartType?: ChartType
  }
}

type Rule = (
  data: Record<string, unknown>[],
  columns: string[],
  columnTypes: Record<string, string>,
  config: Record<string, unknown>,
) => ShapeAdvice | null

function isDateType(type: string): boolean {
  const t = type.toUpperCase()
  return t.includes('DATE') || t.includes('TIMESTAMP') || t.includes('TIME')
}

const RULES: Record<string, Rule[]> = {
  BigValue: [
    (data, _cols, _types, _config) => {
      if (data.length > 20) {
        return {
          level: 'warning',
          message: `KPI charts work best with a few summary rows. You have ${data.length}.`,
          action: { label: 'Switch to Bar', type: 'switchChart', chartType: 'BarChart' },
        }
      }
      return null
    },
    (data, _cols, _types, config) => {
      if (data.length > 1 && !config.metricLabel) {
        return {
          level: 'info',
          message: 'Multiple rows detected — set a Label column to show a KPI grid.',
          action: { label: 'Set Label column', type: 'hint' },
        }
      }
      return null
    },
  ],
  LineChart: [
    (_data, _cols, types) => {
      const hasDate = Object.values(types).some(isDateType)
      if (!hasDate) {
        return {
          level: 'warning',
          message: 'Line charts need a time column. None detected in your data.',
          action: { label: 'Switch to Bar', type: 'switchChart', chartType: 'BarChart' },
        }
      }
      return null
    },
  ],
  AreaChart: [
    (_data, _cols, types) => {
      const hasDate = Object.values(types).some(isDateType)
      if (!hasDate) {
        return {
          level: 'warning',
          message: 'Area charts need a time column. None detected in your data.',
          action: { label: 'Switch to Bar', type: 'switchChart', chartType: 'BarChart' },
        }
      }
      return null
    },
  ],
  PieChart: [
    (data) => {
      if (data.length === 1) {
        return {
          level: 'warning',
          message: 'Pie charts need multiple rows to show proportions.',
          action: { label: 'Switch to KPI', type: 'switchChart', chartType: 'BigValue' },
        }
      }
      return null
    },
    (data) => {
      if (data.length > 10) {
        return {
          level: 'warning',
          message: `Pie charts work best with fewer than 10 slices. You have ${data.length}.`,
          action: { label: 'Switch to Bar', type: 'switchChart', chartType: 'BarChart' },
        }
      }
      return null
    },
  ],
  BarChart: [
    (data) => {
      if (data.length === 1) {
        return {
          level: 'info',
          message: 'Bar charts need multiple rows. You have 1.',
          action: { label: 'Switch to KPI', type: 'switchChart', chartType: 'BigValue' },
        }
      }
      return null
    },
    (data) => {
      if (data.length > 500) {
        return {
          level: 'info',
          message: `Large dataset (${data.length} rows). Consider aggregating or filtering.`,
          action: { label: 'Add aggregation', type: 'hint' },
        }
      }
      return null
    },
  ],
}

export function analyzeDataShape(
  data: Record<string, unknown>[],
  columns: string[],
  columnTypes: Record<string, string>,
  chartType: ChartType | string,
  config: Record<string, unknown>,
): ShapeAdvice[] {
  const rules = RULES[chartType]
  if (!rules) return []

  const advice: ShapeAdvice[] = []
  for (const rule of rules) {
    const result = rule(data, columns, columnTypes, config)
    if (result) advice.push(result)
  }
  return advice
}
