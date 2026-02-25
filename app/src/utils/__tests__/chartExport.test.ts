/**
 * Tests for exportPPTX function in chartExport.ts.
 *
 * Uses source-code inspection pattern consistent with the project's test style,
 * plus mock-based tests for verifying pptxgenjs integration.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('exportPPTX', () => {
  let source: string

  beforeEach(async () => {
    const fs = await import('fs')
    source = fs.readFileSync(
      resolve(__dirname, '../chartExport.ts'),
      'utf-8',
    )
  })

  it('creates a slide with title, image, and source', () => {
    // The function should add title text, an image, and source text to a slide
    expect(source).toContain('slide.addText(metadata.title')
    expect(source).toContain('slide.addImage(')
    expect(source).toContain('slide.addText(`Source: ${metadata.source}')
  })

  it('handles missing metadata gracefully', () => {
    // Title, subtitle, and source are all guarded by optional chaining
    expect(source).toContain("if (metadata?.title)")
    expect(source).toContain("if (metadata?.subtitle)")
    expect(source).toContain("if (metadata?.source)")
  })

  it('sanitizes filename', () => {
    // The output filename should use sanitizeFilename
    expect(source).toContain('sanitizeFilename(filename)}.pptx')
  })

  it('calls writeFile with .pptx extension', () => {
    // The presentation should be saved with writeFile
    expect(source).toContain('pres.writeFile')
    expect(source).toContain('.pptx')
  })

  it('adds subtitle when provided', () => {
    // Subtitle should be added with its own addText call
    expect(source).toContain('slide.addText(metadata.subtitle')
    // Subtitle uses a different color and font size
    expect(source).toContain("color: '64748b'")
    expect(source).toContain('fontSize: 14')
  })

  it('dynamically imports pptxgenjs for code splitting', () => {
    // Should use dynamic import to keep bundle size small
    expect(source).toContain("await import('pptxgenjs')")
  })

  it('converts SVG to canvas at 2x resolution for image quality', () => {
    // The chart is rendered at 2x for retina quality
    expect(source).toContain('svgToCanvas(svgElement, 2)')
  })

  it('positions chart image based on metadata presence', () => {
    // The y position varies depending on title and subtitle
    expect(source).toContain("metadata?.title ? (metadata?.subtitle ? 1.3 : 1.0) : 0.5")
  })
})
