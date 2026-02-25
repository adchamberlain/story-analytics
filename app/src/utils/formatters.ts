/**
 * Number and value formatting utilities for charts and KPIs.
 * Provides consistent formatting across all visualizations.
 */

export interface FormatOptions {
  /** Number of decimal places (default: auto) */
  decimals?: number
  /** Use compact notation for large numbers (default: true) */
  compact?: boolean
  /** Prefix to add (e.g., '$') */
  prefix?: string
  /** Suffix to add (e.g., '%') */
  suffix?: string
  /** Show sign for positive numbers (default: false) */
  showPositiveSign?: boolean
  /** BCP 47 locale tag (default: 'en-US') */
  locale?: string
}

/**
 * Format a number with smart abbreviation (K, M, B).
 * Examples: 1500 -> "1.5K", 2300000 -> "2.3M"
 */
export function formatCompact(
  value: number | null | undefined,
  options: FormatOptions = {}
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—'
  }

  const { decimals, prefix = '', suffix = '', showPositiveSign = false } = options
  const absValue = Math.abs(value)
  const sign = value < 0 ? '-' : showPositiveSign && value > 0 ? '+' : ''

  let formatted: string
  let abbreviation: string

  if (absValue >= 1_000_000_000) {
    const num = absValue / 1_000_000_000
    formatted = decimals !== undefined ? num.toFixed(decimals) : smartDecimals(num)
    abbreviation = 'B'
  } else if (absValue >= 1_000_000) {
    const num = absValue / 1_000_000
    formatted = decimals !== undefined ? num.toFixed(decimals) : smartDecimals(num)
    abbreviation = 'M'
  } else if (absValue >= 1_000) {
    const num = absValue / 1_000
    formatted = decimals !== undefined ? num.toFixed(decimals) : smartDecimals(num)
    abbreviation = 'K'
  } else {
    formatted = decimals !== undefined ? absValue.toFixed(decimals) : smartDecimals(absValue)
    abbreviation = ''
  }

  return `${sign}${prefix}${formatted}${abbreviation}${suffix}`
}

/**
 * Format a number as currency with optional compact notation.
 * Examples: 1500 -> "$1,500", 2300000 -> "$2.3M" (with compact: true)
 */
export function formatCurrency(
  value: number | null | undefined,
  options: FormatOptions & { currency?: string } = {}
): string {
  const { compact = false, currency = 'USD', showPositiveSign = false, ...rest } = options

  if (value === null || value === undefined || isNaN(value)) {
    return '—'
  }

  if (compact) {
    // Use compact formatting with currency symbol
    const symbol = getCurrencySymbol(currency)
    return formatCompact(value, { prefix: symbol, showPositiveSign, ...rest })
  }

  // Use Intl.NumberFormat for full currency formatting
  const sign = showPositiveSign && value > 0 ? '+' : ''
  const formatted = new Intl.NumberFormat(rest.locale || 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: rest.decimals ?? 0,
    maximumFractionDigits: rest.decimals ?? 2,
  }).format(value)

  return sign + formatted
}

/**
 * Format a number as a percentage.
 * Input is assumed to be a decimal (0.15 -> "15%").
 * Use `fromDecimal: false` if input is already percentage (15 -> "15%").
 */
export function formatPercent(
  value: number | null | undefined,
  options: FormatOptions & { fromDecimal?: boolean } = {}
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—'
  }

  const { decimals = 1, fromDecimal = true, showPositiveSign = false } = options
  const percentValue = fromDecimal ? value * 100 : value
  const sign = percentValue < 0 ? '-' : showPositiveSign && percentValue > 0 ? '+' : ''
  const formatted = Math.abs(percentValue).toFixed(decimals)

  return `${sign}${formatted}%`
}

/**
 * Format a number with locale-aware separators.
 * Examples: 1500 -> "1,500", 1234567.89 -> "1,234,567.89"
 */
export function formatNumber(
  value: number | null | undefined,
  options: FormatOptions = {}
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—'
  }

  const { decimals, prefix = '', suffix = '', showPositiveSign = false, locale } = options
  const sign = value < 0 ? '-' : showPositiveSign && value > 0 ? '+' : ''

  const formatted = new Intl.NumberFormat(locale || 'en-US', {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 2,
  }).format(Math.abs(value))

  return `${sign}${prefix}${formatted}${suffix}`
}

/**
 * Automatically format a value based on its magnitude and type.
 * Useful when format is not explicitly specified.
 */
export function autoFormat(
  value: unknown,
  options: FormatOptions & { hint?: 'currency' | 'percent' | 'number' } = {}
): string {
  if (value === null || value === undefined) {
    return '—'
  }

  if (typeof value === 'number') {
    const { hint } = options

    if (hint === 'currency') {
      return formatCurrency(value, { compact: true, ...options })
    }

    if (hint === 'percent') {
      return formatPercent(value, options)
    }

    // Use compact for large numbers, regular for small
    if (Math.abs(value) >= 10_000) {
      return formatCompact(value, options)
    }

    return formatNumber(value, options)
  }

  // For non-numbers, just stringify
  return String(value)
}

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Smart decimal places - show more decimals for smaller numbers.
 */
function smartDecimals(value: number): string {
  const absValue = Math.abs(value)

  if (absValue >= 100) {
    return value.toFixed(0)
  }
  if (absValue >= 10) {
    return value.toFixed(1)
  }
  if (absValue >= 1) {
    return value.toFixed(1)
  }
  return value.toFixed(2)
}

/**
 * Get currency symbol for a currency code.
 */
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '\u20AC',
    GBP: '\u00A3',
    JPY: '\u00A5',
    CNY: '\u00A5',
    INR: '\u20B9',
    CAD: 'C$',
    AUD: 'A$',
  }
  return symbols[currency] || currency + ' '
}

// =============================================================================
// Time formatting helpers
// =============================================================================

/**
 * Format a Date as a relative timestamp ("Just now", "2 minutes ago", etc.).
 */
export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 0) return 'Just now'  // Future dates (clock skew)
  if (seconds < 10) return 'Just now'
  if (seconds < 60) return `${seconds} seconds ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes === 1) return '1 minute ago'
  if (minutes < 60) return `${minutes} minutes ago`

  const hours = Math.floor(minutes / 60)
  if (hours === 1) return '1 hour ago'
  if (hours < 24) return `${hours} hours ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

// =============================================================================
// Plotly-specific formatting helpers
// =============================================================================

/**
 * Generate SI prefix tick format for Plotly axes.
 * Returns a d3-format string for use with tickformat.
 */
export function getAxisTickFormat(maxValue: number): string {
  const absMax = Math.abs(maxValue)

  if (absMax >= 1_000_000_000) {
    return '.2s' // SI prefix (1.2G)
  }
  if (absMax >= 1_000_000) {
    return '.2s' // SI prefix (1.2M)
  }
  if (absMax >= 1_000) {
    return '.2s' // SI prefix (1.2k)
  }
  if (absMax < 1 && absMax > 0) {
    return '.2f' // Decimals for small numbers
  }
  return ',.0f' // Comma-separated integers
}

/**
 * Generate a hovertemplate string for Plotly with formatted values.
 */
export function getHoverTemplate(
  xLabel: string,
  yLabel: string,
  options: { yFormat?: 'currency' | 'percent' | 'number' } = {}
): string {
  const { yFormat = 'number' } = options

  let yFormatSpec: string
  switch (yFormat) {
    case 'currency':
      yFormatSpec = '$,.2f'
      break
    case 'percent':
      yFormatSpec = '.1%'
      break
    default:
      yFormatSpec = ',.2s'
  }

  return `<b>${xLabel}:</b> %{x}<br><b>${yLabel}:</b> %{y:${yFormatSpec}}<extra></extra>`
}

/**
 * Detect scale/currency hints from natural language in titles and subtitles.
 * e.g. "in billions of dollars" → { prefix: '$', suffix: 'B' }
 */
export function detectScaleFromText(text: string): { prefix: string; suffix: string } | null {
  if (!text) return null
  const t = text.toLowerCase()
  const hasDollar = /\bdollars?\b|\busd\b|\$/.test(t)
  const prefix = hasDollar ? '$' : ''
  if (/\btrillions?\b|\btn\b/.test(t)) return { prefix, suffix: 'T' }
  if (/\bbillions?\b|\bbn\b/.test(t)) return { prefix, suffix: 'B' }
  if (/\bmillions?\b|\bmm\b/.test(t)) return { prefix, suffix: 'M' }
  if (/\bthousands?\b/.test(t)) return { prefix, suffix: 'K' }
  if (hasDollar) return { prefix: '$', suffix: '' }
  return null
}

/** Wrap a formatted value string with prefix/suffix from unit detection. */
export function fmtWithUnit(rawVal: string, unit: { prefix: string; suffix: string }): string {
  if (!rawVal) return ''
  return `${unit.prefix}${rawVal}${unit.suffix}`
}

/**
 * Detect units from chart title and subtitle text.
 * Returns { prefix, suffix } for formatting tooltip values.
 */
export function detectUnitFromTitleSubtitle(title?: string, subtitle?: string): { prefix: string; suffix: string } {
  const none = { prefix: '', suffix: '' }
  if (subtitle) {
    const fromSub = detectScaleFromText(subtitle)
    if (fromSub) return fromSub
  }
  if (title) {
    const fromTitle = detectScaleFromText(title)
    if (fromTitle) return fromTitle
  }
  return none
}
