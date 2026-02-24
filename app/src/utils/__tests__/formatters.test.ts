import { describe, it, expect } from 'vitest'
import {
  formatCompact,
  formatCurrency,
  formatPercent,
  formatNumber,
  autoFormat,
  formatTimeAgo,
  getAxisTickFormat,
} from '../formatters'

describe('formatCompact', () => {
  it('formats thousands', () => {
    expect(formatCompact(1500)).toBe('1.5K')
  })
  it('formats millions', () => {
    expect(formatCompact(2500000)).toBe('2.5M')
  })
  it('formats billions', () => {
    expect(formatCompact(3200000000)).toBe('3.2B')
  })
  it('handles zero', () => {
    // smartDecimals: absValue < 1 → toFixed(2)
    expect(formatCompact(0)).toBe('0.00')
  })
  it('handles negative thousands', () => {
    expect(formatCompact(-1500)).toBe('-1.5K')
  })
  it('handles small numbers without suffix', () => {
    // smartDecimals: 10 <= absValue < 100 → toFixed(1)
    expect(formatCompact(42)).toBe('42.0')
  })
  it('returns dash for null', () => {
    expect(formatCompact(null)).toBe('—')
  })
  it('returns dash for undefined', () => {
    expect(formatCompact(undefined)).toBe('—')
  })
  it('returns dash for NaN', () => {
    expect(formatCompact(NaN)).toBe('—')
  })
  it('respects decimals option', () => {
    expect(formatCompact(1500, { decimals: 2 })).toBe('1.50K')
  })
  it('respects prefix and suffix', () => {
    expect(formatCompact(1500, { prefix: '$', suffix: '!' })).toBe('$1.5K!')
  })
  it('shows positive sign when requested', () => {
    expect(formatCompact(1500, { showPositiveSign: true })).toBe('+1.5K')
  })
})

describe('formatCurrency', () => {
  it('formats USD by default', () => {
    const result = formatCurrency(1234.56)
    expect(result).toContain('1,234')
  })
  it('handles zero', () => {
    const result = formatCurrency(0)
    expect(result).toContain('0')
  })
  it('returns dash for null', () => {
    expect(formatCurrency(null)).toBe('—')
  })
  it('uses compact mode with symbol', () => {
    const result = formatCurrency(2500000, { compact: true })
    expect(result).toContain('$')
    expect(result).toContain('2.5M')
  })
  it('shows positive sign when requested', () => {
    const result = formatCurrency(100, { showPositiveSign: true })
    expect(result).toContain('+')
  })
})

describe('formatPercent', () => {
  it('converts decimal to percent', () => {
    expect(formatPercent(0.156)).toBe('15.6%')
  })
  it('handles fromDecimal=false', () => {
    expect(formatPercent(15.6, { fromDecimal: false })).toBe('15.6%')
  })
  it('returns dash for null', () => {
    expect(formatPercent(null)).toBe('—')
  })
  it('handles negative values', () => {
    expect(formatPercent(-0.05)).toBe('-5.0%')
  })
  it('shows positive sign when requested', () => {
    expect(formatPercent(0.1, { showPositiveSign: true })).toBe('+10.0%')
  })
})

describe('formatNumber', () => {
  it('adds commas', () => {
    expect(formatNumber(1234567)).toContain('1,234,567')
  })
  it('returns dash for null', () => {
    expect(formatNumber(null)).toBe('—')
  })
  it('handles zero', () => {
    expect(formatNumber(0)).toContain('0')
  })
  it('respects prefix and suffix', () => {
    const result = formatNumber(1000, { prefix: '#', suffix: ' items' })
    expect(result).toContain('#')
    expect(result).toContain('items')
  })
})

describe('autoFormat', () => {
  it('returns dash for null', () => {
    expect(autoFormat(null)).toBe('—')
  })
  it('returns dash for undefined', () => {
    expect(autoFormat(undefined)).toBe('—')
  })
  it('formats large numbers with compact notation', () => {
    const result = autoFormat(50000)
    expect(result).toContain('K')
  })
  it('formats small numbers without abbreviation', () => {
    const result = autoFormat(42)
    expect(result).not.toContain('K')
  })
  it('stringifies non-numbers', () => {
    expect(autoFormat('hello')).toBe('hello')
  })
  it('uses currency hint', () => {
    const result = autoFormat(1234, { hint: 'currency' })
    expect(result).toContain('$')
  })
  it('uses percent hint', () => {
    const result = autoFormat(0.5, { hint: 'percent' })
    expect(result).toContain('%')
  })
})

describe('formatTimeAgo', () => {
  it('returns "Just now" for recent timestamps', () => {
    expect(formatTimeAgo(new Date())).toBe('Just now')
  })
  it('returns minutes for < 1 hour', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    expect(formatTimeAgo(fiveMinAgo)).toBe('5 minutes ago')
  })
  it('returns hours for < 1 day', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)
    expect(formatTimeAgo(threeHoursAgo)).toBe('3 hours ago')
  })
  it('returns days for > 1 day', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    expect(formatTimeAgo(twoDaysAgo)).toBe('2 days ago')
  })
})

describe('getAxisTickFormat', () => {
  it('returns SI prefix for millions', () => {
    expect(getAxisTickFormat(5000000)).toBe('.2s')
  })
  it('returns SI prefix for thousands', () => {
    expect(getAxisTickFormat(5000)).toBe('.2s')
  })
  it('returns decimal format for small numbers', () => {
    expect(getAxisTickFormat(0.5)).toBe('.2f')
  })
  it('returns comma format for medium numbers', () => {
    expect(getAxisTickFormat(500)).toBe(',.0f')
  })
})
