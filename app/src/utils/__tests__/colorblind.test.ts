import { describe, it, expect } from 'vitest'
import {
  hexToRgb, rgbToHex, simulateCVD, simulatePalette,
  relativeLuminance, contrastRatio,
} from '../colorblind'

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#ff0000')).toEqual([255, 0, 0])
    expect(hexToRgb('#00ff00')).toEqual([0, 255, 0])
    expect(hexToRgb('#0000ff')).toEqual([0, 0, 255])
  })

  it('parses 3-digit hex', () => {
    expect(hexToRgb('#f00')).toEqual([255, 0, 0])
  })

  it('handles without hash', () => {
    expect(hexToRgb('ff0000')).toEqual([255, 0, 0])
  })
})

describe('rgbToHex', () => {
  it('converts to hex', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000')
    expect(rgbToHex(0, 128, 255)).toBe('#0080ff')
  })

  it('clamps out-of-range values', () => {
    expect(rgbToHex(300, -10, 128)).toBe('#ff0080')
  })
})

describe('simulateCVD', () => {
  it('pure red shifts for protanopia', () => {
    const result = simulateCVD('#ff0000', 'protanopia')
    // Red should shift toward yellow/brown for protanopia
    const [r, g, b] = hexToRgb(result)
    expect(r).toBeLessThan(255)
    expect(g).toBeGreaterThan(0) // gains some green
    expect(b).toBeLessThanOrEqual(10) // stays low blue
  })

  it('pure green shifts for deuteranopia', () => {
    const result = simulateCVD('#00ff00', 'deuteranopia')
    const [r, , b] = hexToRgb(result)
    expect(r).toBeGreaterThan(0) // gains some red
    expect(b).toBeLessThan(80) // stays relatively low blue
  })

  it('pure blue shifts for tritanopia', () => {
    const result = simulateCVD('#0000ff', 'tritanopia')
    const [, g] = hexToRgb(result)
    // Blue should shift for tritanopia
    expect(g).toBeGreaterThan(0) // gains some green
  })

  it('white stays white', () => {
    expect(simulateCVD('#ffffff', 'protanopia')).toBe('#ffffff')
    expect(simulateCVD('#ffffff', 'deuteranopia')).toBe('#ffffff')
    expect(simulateCVD('#ffffff', 'tritanopia')).toBe('#ffffff')
  })

  it('black stays black', () => {
    expect(simulateCVD('#000000', 'protanopia')).toBe('#000000')
    expect(simulateCVD('#000000', 'deuteranopia')).toBe('#000000')
    expect(simulateCVD('#000000', 'tritanopia')).toBe('#000000')
  })
})

describe('simulatePalette', () => {
  it('transforms all colors', () => {
    const palette = ['#ff0000', '#00ff00', '#0000ff']
    const result = simulatePalette(palette, 'protanopia')
    expect(result).toHaveLength(3)
    // Each color should be a valid hex
    for (const color of result) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('relativeLuminance', () => {
  it('white has luminance ~1', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 2)
  })

  it('black has luminance ~0', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 2)
  })

  it('mid-gray is between 0 and 1', () => {
    const lum = relativeLuminance('#808080')
    expect(lum).toBeGreaterThan(0.1)
    expect(lum).toBeLessThan(0.5)
  })
})

describe('contrastRatio', () => {
  it('black/white is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('same color is 1:1', () => {
    expect(contrastRatio('#ff0000', '#ff0000')).toBeCloseTo(1, 1)
  })

  it('is symmetric', () => {
    const ratio1 = contrastRatio('#ff0000', '#0000ff')
    const ratio2 = contrastRatio('#0000ff', '#ff0000')
    expect(ratio1).toBeCloseTo(ratio2, 5)
  })
})
