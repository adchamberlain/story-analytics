import { describe, it, expect } from 'vitest'
import { renderTooltip } from '../tooltipTemplate'

describe('renderTooltip', () => {
  it('replaces column references', () => {
    const result = renderTooltip(
      '{{ name }}: {{ value }}',
      { name: 'Sales', value: 1234 },
    )
    expect(result).toBe('Sales: 1234')
  })

  it('applies currency format', () => {
    const result = renderTooltip(
      'Revenue: {{ revenue | currency }}',
      { revenue: 1234.5 },
    )
    expect(result).toContain('$')
    expect(result).toContain('1,234')
  })

  it('applies percent format', () => {
    const result = renderTooltip(
      '{{ rate | percent }}',
      { rate: 0.156 },
    )
    expect(result).toContain('15.6%')
  })

  it('applies compact format', () => {
    const result = renderTooltip(
      '{{ value | compact }}',
      { value: 2500000 },
    )
    expect(result).toContain('2.5M')
  })

  it('handles missing columns gracefully', () => {
    const result = renderTooltip(
      '{{ missing_col }}',
      { name: 'test' },
    )
    expect(result).toBe('')
  })

  it('handles null values', () => {
    const result = renderTooltip(
      '{{ value }}',
      { value: null },
    )
    expect(result).toBe('')
  })

  it('passes through literal text', () => {
    const result = renderTooltip(
      'Hello world',
      { name: 'test' },
    )
    expect(result).toBe('Hello world')
  })

  it('handles multiple replacements', () => {
    const result = renderTooltip(
      '{{ city }}: {{ population | compact }}',
      { city: 'Tokyo', population: 13960000 },
    )
    expect(result).toBe('Tokyo: 14.0M')
  })

  it('handles number format', () => {
    const result = renderTooltip(
      '{{ value | number }}',
      { value: 1234567 },
    )
    expect(result).toContain('1,234,567')
  })

  it('returns template unchanged if empty row', () => {
    const result = renderTooltip('{{ x }}', {})
    expect(result).toBe('')
  })
})
