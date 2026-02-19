import { describe, it, expect } from 'vitest'
import { formatBigValue, shouldShowGrid } from '../components/charts/bigValueHelpers'

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
})
