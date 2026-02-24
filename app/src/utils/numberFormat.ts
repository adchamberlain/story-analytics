/**
 * Number formatting engine for charts and values.
 *
 * Supports: currency, percent, compact (1.2K, 3.4M), and raw number formatting.
 */

export type NumberFormatType = 'currency' | 'percent' | 'compact' | 'number'

export interface NumberFormatOptions {
  type?: NumberFormatType
  currency?: string      // e.g. 'USD', 'EUR'
  decimals?: number      // decimal places
  prefix?: string        // custom prefix
  suffix?: string        // custom suffix
  locale?: string        // BCP 47 locale tag (default: 'en-US')
}

const COMPACT_SUFFIXES = [
  { threshold: 1e12, suffix: 'T', divisor: 1e12 },
  { threshold: 1e9, suffix: 'B', divisor: 1e9 },
  { threshold: 1e6, suffix: 'M', divisor: 1e6 },
  { threshold: 1e3, suffix: 'K', divisor: 1e3 },
]

/**
 * Format a number according to the specified format type.
 */
export function formatNumber(value: number, opts: NumberFormatOptions = {}): string {
  const { type = 'number', currency = 'USD', decimals, prefix = '', suffix = '', locale = 'en-US' } = opts

  if (!isFinite(value)) return String(value)

  let formatted: string

  switch (type) {
    case 'currency': {
      const d = decimals ?? (value % 1 === 0 ? 0 : 2)
      formatted = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      }).format(value)
      break
    }

    case 'percent': {
      const d = decimals ?? 1
      formatted = `${(value).toFixed(d)}%`
      break
    }

    case 'compact': {
      const absVal = Math.abs(value)
      const match = COMPACT_SUFFIXES.find((s) => absVal >= s.threshold)
      if (match) {
        const d = decimals ?? 1
        formatted = `${(value / match.divisor).toFixed(d)}${match.suffix}`
      } else {
        formatted = value.toLocaleString(locale, {
          maximumFractionDigits: decimals ?? 0,
        })
      }
      break
    }

    default: {
      formatted = value.toLocaleString(locale, {
        minimumFractionDigits: decimals ?? 0,
        maximumFractionDigits: decimals ?? 2,
      })
      break
    }
  }

  return `${prefix}${formatted}${suffix}`
}

/**
 * Create a tick formatter function for Observable Plot axes.
 */
export function tickFormatter(opts: NumberFormatOptions = {}): (value: number) => string {
  // For axes, default to compact format for cleaner labels
  const axisOpts = { ...opts, type: opts.type ?? 'compact' as NumberFormatType }
  return (value: number) => formatNumber(value, axisOpts)
}

/**
 * Auto-detect the best format type from a sample value.
 */
export function detectFormat(value: number): NumberFormatType {
  const abs = Math.abs(value)
  if (abs >= 1000) return 'compact'
  return 'number'
}
