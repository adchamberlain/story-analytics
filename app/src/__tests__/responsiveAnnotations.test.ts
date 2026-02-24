import { describe, it, expect } from 'vitest'
import {
  resolveResponsiveOffset,
  computeRatios,
  shouldCollapseAnnotations,
} from '../utils/annotationDefaults'

describe('resolveResponsiveOffset', () => {
  it('returns pixel dx/dy when no ratios are set', () => {
    const result = resolveResponsiveOffset({ dx: 30, dy: -20 }, 800, 400)
    expect(result).toEqual({ dx: 30, dy: -20 })
  })

  it('computes pixel offsets from ratios when available', () => {
    const result = resolveResponsiveOffset(
      { dx: 30, dy: -20, dxRatio: 0.05, dyRatio: -0.1 },
      800,
      400,
    )
    // dxRatio * plotWidth = 0.05 * 800 = 40
    // dyRatio * plotHeight = -0.1 * 400 = -40
    expect(result).toEqual({ dx: 40, dy: -40 })
  })

  it('falls back to resolveOffset when plotWidth is 0', () => {
    const result = resolveResponsiveOffset({ dx: 30, dy: -20, dxRatio: 0.05, dyRatio: -0.1 }, 0, 0)
    expect(result).toEqual({ dx: 30, dy: -20 })
  })

  it('falls back to legacy position when no dx/dy or ratios', () => {
    const result = resolveResponsiveOffset({ position: 'below' as const }, 800, 400)
    expect(result).toEqual({ dx: 0, dy: 20 })
  })
})

describe('computeRatios', () => {
  it('computes proportional dx/dy ratios from pixel offsets', () => {
    const result = computeRatios(40, -40, 800, 400)
    expect(result.dxRatio).toBeCloseTo(0.05)
    expect(result.dyRatio).toBeCloseTo(-0.1)
  })

  it('returns 0 ratios when plot dimensions are 0', () => {
    const result = computeRatios(40, -40, 0, 0)
    expect(result.dxRatio).toBe(0)
    expect(result.dyRatio).toBe(0)
  })
})

describe('annotation footnote collapse', () => {
  it('should collapse annotations below 400px', () => {
    expect(shouldCollapseAnnotations(375)).toBe(true)
    expect(shouldCollapseAnnotations(400)).toBe(false)
    expect(shouldCollapseAnnotations(1280)).toBe(false)
  })
})
