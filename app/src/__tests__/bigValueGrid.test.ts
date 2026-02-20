import { describe, it, expect } from 'vitest'
import { formatBigValue, shouldShowGrid, unitToFormat, computePctDelta, formatDelta } from '../components/charts/bigValueHelpers'

describe('shouldShowGrid', () => {
  it('returns false when data has 1 row', () => {
    expect(shouldShowGrid(1, 'metric')).toBe(false)
  })
  it('returns false when metricLabel is undefined', () => {
    expect(shouldShowGrid(5, undefined)).toBe(false)
  })
  it('returns true when data has multiple rows and metricLabel is set', () => {
    expect(shouldShowGrid(5, 'metric')).toBe(true)
  })
})

describe('formatBigValue', () => {
  it('formats currency', () => {
    expect(formatBigValue(1284500, 'currency')).toBe('$1,284,500')
  })
  it('formats percent', () => {
    expect(formatBigValue(3.8, 'percent')).toBe('3.8%')
  })
  it('formats number with locale', () => {
    expect(formatBigValue(45230, 'number')).toBe('45,230')
  })
  it('formats number by default (no format)', () => {
    expect(formatBigValue(45230, undefined)).toBe('45,230')
  })
  it('returns dash for null', () => {
    expect(formatBigValue(null, undefined)).toBe('—')
  })
  it('returns string value as-is', () => {
    expect(formatBigValue('hello', undefined)).toBe('hello')
  })
  it('uses per-row unit to override global format', () => {
    // Global format is undefined, but unit says USD → currency
    expect(formatBigValue(1284500, undefined, 'USD')).toBe('$1,284,500')
    // Global format is undefined, unit says percent → percent
    expect(formatBigValue(3.8, undefined, 'percent')).toBe('3.8%')
    // Global format is undefined, unit says count → number
    expect(formatBigValue(45230, undefined, 'count')).toBe('45,230')
  })
  it('per-row unit overrides global format', () => {
    // Global format says currency, but unit says percent → percent wins
    expect(formatBigValue(3.8, 'currency', 'percent')).toBe('3.8%')
  })
  it('falls back to global format when unit is unrecognized', () => {
    expect(formatBigValue(1284500, 'currency', 'widgets')).toBe('$1,284,500')
  })
  it('falls back to global format when unit is undefined', () => {
    expect(formatBigValue(1284500, 'currency', undefined)).toBe('$1,284,500')
  })
})

describe('unitToFormat', () => {
  it('maps USD variants to currency', () => {
    expect(unitToFormat('USD')).toBe('currency')
    expect(unitToFormat('$')).toBe('currency')
    expect(unitToFormat('dollar')).toBe('currency')
    expect(unitToFormat('dollars')).toBe('currency')
  })
  it('maps percent variants', () => {
    expect(unitToFormat('percent')).toBe('percent')
    expect(unitToFormat('%')).toBe('percent')
    expect(unitToFormat('pct')).toBe('percent')
  })
  it('maps count/number variants', () => {
    expect(unitToFormat('count')).toBe('number')
    expect(unitToFormat('score')).toBe('number')
    expect(unitToFormat('number')).toBe('number')
  })
  it('returns undefined for unrecognized units', () => {
    expect(unitToFormat('widgets')).toBeUndefined()
    expect(unitToFormat(null)).toBeUndefined()
    expect(unitToFormat(undefined)).toBeUndefined()
  })
})

describe('computePctDelta', () => {
  it('computes percentage difference', () => {
    // 1284500 vs 1200000 → +7.04%
    expect(computePctDelta(1284500, 1200000)).toBeCloseTo(7.04, 1)
  })
  it('computes negative percentage', () => {
    // 45230 vs 50000 → -9.54%
    expect(computePctDelta(45230, 50000)).toBeCloseTo(-9.54, 1)
  })
  it('returns null when comparison is zero', () => {
    expect(computePctDelta(100, 0)).toBeNull()
  })
  it('returns null for non-numeric values', () => {
    expect(computePctDelta('abc', 100)).toBeNull()
    expect(computePctDelta(100, null)).toBeNull()
  })
})

describe('formatDelta', () => {
  it('formats positive delta with + sign', () => {
    expect(formatDelta(7.04)).toBe('+7.0%')
  })
  it('formats negative delta', () => {
    expect(formatDelta(-9.54)).toBe('-9.5%')
  })
  it('formats zero as positive', () => {
    expect(formatDelta(0)).toBe('+0.0%')
  })
})
