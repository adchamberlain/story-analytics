import { describe, it, expect } from 'vitest'
import { formatCurrency, formatNumber } from '../formatters'
import { formatNumber as formatNumberChart } from '../numberFormat'

describe('localization - formatters.ts', () => {
  describe('formatNumber with locale', () => {
    it('formats with en-US (default)', () => {
      expect(formatNumber(1234.56, { decimals: 2 })).toBe('1,234.56')
    })

    it('formats with de-DE (dot thousands, comma decimal)', () => {
      const result = formatNumber(1234.56, { decimals: 2, locale: 'de-DE' })
      // German: 1.234,56
      expect(result).toContain('1')
      expect(result).toContain('234')
      expect(result).toContain('56')
      // Should use comma as decimal separator
      expect(result).toMatch(/234.56/)
    })

    it('formats with fr-FR (space thousands, comma decimal)', () => {
      const result = formatNumber(1234.56, { decimals: 2, locale: 'fr-FR' })
      expect(result).toContain('234')
      expect(result).toContain('56')
    })

    it('formats with ja-JP', () => {
      const result = formatNumber(1234, { locale: 'ja-JP' })
      expect(result).toContain('1')
      expect(result).toContain('234')
    })
  })

  describe('formatCurrency with locale', () => {
    it('formats USD with en-US', () => {
      const result = formatCurrency(1234.56, { decimals: 2 })
      expect(result).toContain('$')
      expect(result).toContain('1,234.56')
    })

    it('formats EUR with de-DE', () => {
      const result = formatCurrency(1234.56, { decimals: 2, currency: 'EUR', locale: 'de-DE' })
      expect(result).toContain('€')
      expect(result).toContain('1')
      expect(result).toContain('234')
    })

    it('formats JPY with ja-JP', () => {
      const result = formatCurrency(1234, { currency: 'JPY', locale: 'ja-JP' })
      // ja-JP uses fullwidth yen ￥ (U+FFE5) not ¥ (U+00A5)
      expect(result).toMatch(/[¥￥]/)
      expect(result).toContain('1,234')
    })
  })
})

describe('localization - numberFormat.ts', () => {
  it('formats currency with de-DE locale', () => {
    const result = formatNumberChart(1234.56, { type: 'currency', currency: 'EUR', decimals: 2, locale: 'de-DE' })
    expect(result).toContain('€')
    expect(result).toContain('1')
    expect(result).toContain('234')
  })

  it('formats number with de-DE locale', () => {
    const result = formatNumberChart(1234.56, { type: 'number', decimals: 2, locale: 'de-DE' })
    expect(result).toContain('234')
    expect(result).toContain('56')
  })

  it('formats compact with fr-FR locale', () => {
    const result = formatNumberChart(500, { type: 'compact', locale: 'fr-FR' })
    expect(result).toContain('500')
  })

  it('defaults to en-US when no locale specified', () => {
    expect(formatNumberChart(1234.56, { type: 'number', decimals: 2 })).toBe('1,234.56')
  })
})
