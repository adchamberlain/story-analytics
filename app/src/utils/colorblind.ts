/**
 * Color vision deficiency simulation.
 *
 * Implements Brettel, Viénot & Mollon (1997) algorithm for simulating
 * protanopia, deuteranopia, and tritanopia color vision.
 *
 * Matrix values from: https://ixora.io/projects/colorblindness/color-blindness-simulation-research/
 */

export type CVDType = 'protanopia' | 'deuteranopia' | 'tritanopia'

// sRGB → linear RGB
function srgbToLinear(c: number): number {
  c = c / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

// linear RGB → sRGB
function linearToSrgb(c: number): number {
  c = Math.max(0, Math.min(1, c))
  return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)
}

/**
 * Simulation matrices for full dichromacy (severity = 1.0).
 * Each is a 3x3 matrix applied in linear RGB space.
 */
const MATRICES: Record<CVDType, number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
}

/**
 * Parse a hex color string to [r, g, b] (0-255).
 */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3
    ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    : h
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

/**
 * Convert [r, g, b] (0-255) to hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')
}

/**
 * Simulate how a color appears to someone with a color vision deficiency.
 *
 * @param hex - Input color as hex string (e.g., '#ff0000')
 * @param type - Type of color vision deficiency
 * @returns Simulated color as hex string
 */
export function simulateCVD(hex: string, type: CVDType): string {
  const [r, g, b] = hexToRgb(hex)

  // Convert to linear RGB
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  // Apply simulation matrix
  const m = MATRICES[type]
  const sr = m[0][0] * lr + m[0][1] * lg + m[0][2] * lb
  const sg = m[1][0] * lr + m[1][1] * lg + m[1][2] * lb
  const sb = m[2][0] * lr + m[2][1] * lg + m[2][2] * lb

  // Convert back to sRGB
  return rgbToHex(linearToSrgb(sr), linearToSrgb(sg), linearToSrgb(sb))
}

/**
 * Simulate a full palette through a color vision deficiency.
 */
export function simulatePalette(colors: string[], type: CVDType): string[] {
  return colors.map((c) => simulateCVD(c, type))
}

/**
 * Calculate WCAG relative luminance of a hex color.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/**
 * Calculate WCAG contrast ratio between two colors.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** All CVD types for iteration */
export const CVD_TYPES: { type: CVDType; label: string }[] = [
  { type: 'protanopia', label: 'Protanopia (no red)' },
  { type: 'deuteranopia', label: 'Deuteranopia (no green)' },
  { type: 'tritanopia', label: 'Tritanopia (no blue)' },
]

// ── Palette Accessibility Check ─────────────────────────────────────────────

export interface PaletteWarning {
  /** Which CVD type causes the confusion */
  cvdType: CVDType
  /** Pairs of color indices that become indistinguishable */
  pairs: [number, number][]
  /** Human-readable warning message */
  message: string
}

export interface PaletteAccessibility {
  /** True if palette is safe for all CVD types */
  safe: boolean
  /** Warnings per CVD type (empty if safe) */
  warnings: PaletteWarning[]
}

/**
 * Check if a color palette is accessible for colorblind users.
 *
 * For each CVD type, simulates the palette and checks all pairwise contrast
 * ratios. Pairs with contrast ratio below `minContrast` (default 3.0) are
 * flagged as potentially confusing.
 *
 * @param colors - Array of hex color strings
 * @param minContrast - Minimum contrast ratio between simulated pairs (default 3.0)
 */
export function checkPaletteAccessibility(colors: string[], minContrast = 3.0): PaletteAccessibility {
  if (colors.length < 2) return { safe: true, warnings: [] }

  const warnings: PaletteWarning[] = []

  for (const { type, label } of CVD_TYPES) {
    const simulated = simulatePalette(colors, type)
    const badPairs: [number, number][] = []

    for (let i = 0; i < simulated.length; i++) {
      for (let j = i + 1; j < simulated.length; j++) {
        const cr = contrastRatio(simulated[i], simulated[j])
        if (cr < minContrast) {
          badPairs.push([i, j])
        }
      }
    }

    if (badPairs.length > 0) {
      warnings.push({
        cvdType: type,
        pairs: badPairs,
        message: `${label}: ${badPairs.length} color pair${badPairs.length > 1 ? 's' : ''} may be hard to distinguish`,
      })
    }
  }

  return { safe: warnings.length === 0, warnings }
}
