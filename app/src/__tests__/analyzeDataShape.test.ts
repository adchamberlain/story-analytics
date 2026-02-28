import { describe, it, expect } from 'vitest'
import { analyzeDataShape } from '../utils/analyzeDataShape'

describe('analyzeDataShape', () => {
  it('warns BigValue with many rows', () => {
    const data = Array.from({ length: 25 }, (_, i) => ({ val: i }))
    const result = analyzeDataShape(data, ['val'], { val: 'INTEGER' }, 'BigValue', {})
    expect(result.some((a) => a.message.includes('few summary rows'))).toBe(true)
    expect(result.find((a) => a.message.includes('few summary rows'))!.action?.type).toBe('switchChart')
  })

  it('hints BigValue with multiple rows but no metricLabel', () => {
    const data = [{ m: 'A', v: 1 }, { m: 'B', v: 2 }]
    const result = analyzeDataShape(data, ['m', 'v'], { m: 'VARCHAR', v: 'INTEGER' }, 'BigValue', {})
    expect(result.some((a) => a.message.includes('Label column'))).toBe(true)
  })

  it('no advice for BigValue with 1 row', () => {
    const data = [{ val: 42 }]
    const result = analyzeDataShape(data, ['val'], { val: 'INTEGER' }, 'BigValue', {})
    expect(result).toEqual([])
  })

  it('no advice for BigValue with metricLabel set', () => {
    const data = [{ m: 'A', v: 1 }, { m: 'B', v: 2 }]
    const result = analyzeDataShape(data, ['m', 'v'], { m: 'VARCHAR', v: 'INTEGER' }, 'BigValue', { metricLabel: 'm' })
    expect(result).toEqual([])
  })

  it('shows info for Line chart with no date column', () => {
    const data = [{ a: 'x', b: 1 }]
    const result = analyzeDataShape(data, ['a', 'b'], { a: 'VARCHAR', b: 'INTEGER' }, 'LineChart', {})
    expect(result.length).toBe(1)
    expect(result[0].level).toBe('info')
    expect(result[0].message).toContain('time or sequential')
    expect(result[0].action).toBeUndefined()
  })

  it('no advice for Line chart with date column', () => {
    const data = [{ dt: '2025-01-01', b: 1 }]
    const result = analyzeDataShape(data, ['dt', 'b'], { dt: 'DATE', b: 'INTEGER' }, 'LineChart', {})
    expect(result).toEqual([])
  })

  it('warns Pie with too many categories', () => {
    const data = Array.from({ length: 15 }, (_, i) => ({ cat: `c${i}`, val: i }))
    const result = analyzeDataShape(data, ['cat', 'val'], { cat: 'VARCHAR', val: 'INTEGER' }, 'PieChart', {})
    expect(result.some((a) => a.message.includes('fewer than 10'))).toBe(true)
  })

  it('warns Pie with 1 row', () => {
    const data = [{ cat: 'A', val: 1 }]
    const result = analyzeDataShape(data, ['cat', 'val'], { cat: 'VARCHAR', val: 'INTEGER' }, 'PieChart', {})
    expect(result.some((a) => a.message.includes('multiple rows'))).toBe(true)
  })

  it('warns Bar with 1 row', () => {
    const data = [{ cat: 'A', val: 1 }]
    const result = analyzeDataShape(data, ['cat', 'val'], { cat: 'VARCHAR', val: 'INTEGER' }, 'BarChart', {})
    expect(result.some((a) => a.message.includes('multiple rows'))).toBe(true)
  })

  it('warns Bar with 500+ rows', () => {
    const data = Array.from({ length: 501 }, (_, i) => ({ cat: `c${i}`, val: i }))
    const result = analyzeDataShape(data, ['cat', 'val'], { cat: 'VARCHAR', val: 'INTEGER' }, 'BarChart', {})
    expect(result.some((a) => a.message.includes('aggregating'))).toBe(true)
  })

  it('returns empty for unknown chart type', () => {
    const result = analyzeDataShape([{ a: 1 }], ['a'], { a: 'INTEGER' }, 'Histogram' as any, {})
    expect(result).toEqual([])
  })
})
