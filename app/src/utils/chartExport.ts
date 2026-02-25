/**
 * Client-side chart export utilities.
 * Observable Plot renders SVG natively, so export is straightforward.
 */

/** Download an SVG element as a .svg file */
export async function exportSVG(svgElement: SVGSVGElement, filename: string): Promise<void> {
  const clone = svgElement.cloneNode(true) as SVGSVGElement

  // Compute content bounds including overflow (annotations, labels)
  const bounds = getSvgContentBounds(svgElement)
  clone.setAttribute('width', String(bounds.viewW))
  clone.setAttribute('height', String(bounds.viewH))
  clone.setAttribute('viewBox', `${bounds.viewX} ${bounds.viewY} ${bounds.viewW} ${bounds.viewH}`)
  clone.style.overflow = 'hidden'

  // Add XML namespace for standalone SVG
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  // Inline computed fonts and embed web font data for standalone rendering
  inlineComputedFonts(svgElement, clone)
  await embedFontsInSvg(clone)

  const serializer = new XMLSerializer()
  const svgString = serializer.serializeToString(clone)
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })

  downloadBlob(blob, `${sanitizeFilename(filename)}.svg`)
}

/** Render an SVG element to a PNG at 2x resolution and download.
 *  Optionally draws title, subtitle, and source text around the chart. */
export function exportPNG(
  svgElement: SVGSVGElement,
  filename: string,
  scale = 2,
  metadata?: { title?: string; subtitle?: string; source?: string },
): void {
  svgToCanvas(svgElement, scale)
    .then((chartCanvas) => {
      const canvas = addTextToCanvas(chartCanvas, scale, metadata)
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, `${sanitizeFilename(filename)}.png`)
        } else {
          console.error('PNG export failed: canvas.toBlob returned null')
        }
      }, 'image/png')
    })
    .catch((err) => {
      console.error('PNG export failed:', err)
    })
}

/** Render an SVG element to a PDF and download */
export async function exportPDF(
  svgElement: SVGSVGElement,
  filename: string,
  metadata?: { title?: string; subtitle?: string; source?: string }
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const canvas = await svgToCanvas(svgElement, 2)

  // Size page to chart aspect ratio — always landscape (charts are wider than tall)
  const imgWidth = canvas.width || 1
  const imgHeight = canvas.height || 1
  const pdfWidth = 297 // A4 landscape width in mm
  const pdfHeight = (imgHeight / imgWidth) * pdfWidth

  // Calculate header/footer heights dynamically
  let headerH = 5 // top margin
  if (metadata?.title) headerH += 8
  if (metadata?.subtitle) headerH += 6
  let footerH = 3 // bottom margin
  if (metadata?.source) footerH += 6

  const pageH = pdfHeight + headerH + footerH
  const doc = new jsPDF({
    unit: 'mm',
    format: [pdfWidth, pageH],
    orientation: pdfWidth > pageH ? 'landscape' : 'portrait',
  })

  let yOffset = 5

  // Title
  if (metadata?.title) {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(metadata.title, 10, yOffset + 5)
    yOffset += 8
  }

  // Subtitle
  if (metadata?.subtitle) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(metadata.subtitle, 10, yOffset + 3)
    yOffset += 6
    doc.setTextColor(0) // reset
  }

  // Chart image
  const imgData = canvas.toDataURL('image/png')
  doc.addImage(imgData, 'PNG', 0, yOffset, pdfWidth, pdfHeight)
  yOffset += pdfHeight + 3

  // Source note
  if (metadata?.source) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150)
    doc.text(`Source: ${metadata.source}`, 10, yOffset)
  }

  doc.save(`${sanitizeFilename(filename)}.pdf`)
}

/** Export chart as a PowerPoint (.pptx) slide */
export async function exportPPTX(
  svgElement: SVGSVGElement,
  filename: string,
  metadata?: { title?: string; subtitle?: string; source?: string },
): Promise<void> {
  const pptxgenjs = await import('pptxgenjs')
  const PptxGenJS = pptxgenjs.default
  const pres = new PptxGenJS()

  const slide = pres.addSlide()

  // Slide is 10" x 5.625" (16:9 default). All y-positions must stay within 5.625".

  // Title
  if (metadata?.title) {
    slide.addText(metadata.title, {
      x: 0.5,
      y: 0.2,
      w: 9,
      h: 0.45,
      fontSize: 24,
      bold: true,
      color: '1e293b',
    })
  }

  // Subtitle
  if (metadata?.subtitle) {
    slide.addText(metadata.subtitle, {
      x: 0.5,
      y: 0.65,
      w: 9,
      h: 0.35,
      fontSize: 14,
      color: '64748b',
    })
  }

  // Chart image — sized to fit within slide bounds
  const canvas = await svgToCanvas(svgElement, 2)
  const imgData = canvas.toDataURL('image/png')
  const chartY = metadata?.title ? (metadata?.subtitle ? 1.1 : 0.8) : 0.3
  const chartH = metadata?.source ? 5.625 - chartY - 0.55 : 5.625 - chartY - 0.15
  slide.addImage({
    data: imgData,
    x: 0.75,
    y: chartY,
    w: 8.5,
    h: chartH,
    sizing: { type: 'contain', w: 8.5, h: chartH },
  })

  // Source — positioned above slide bottom (5.625")
  if (metadata?.source) {
    slide.addText(`Source: ${metadata.source}`, {
      x: 0.5,
      y: 5.25,
      w: 9,
      h: 0.3,
      fontSize: 9,
      color: '94a3b8',
    })
  }

  await pres.writeFile({ fileName: `${sanitizeFilename(filename)}.pptx` })
}

// ── Shared Helpers ──────────────────────────────────────────────────────────

/** Convert an SVG element to a canvas at a given scale.
 *  Detects overflow content (Observable Plot sets overflow:visible on SVGs)
 *  by measuring each child element's bounds in SVG coordinate space.
 *  Embeds web fonts so annotation text renders correctly in the exported image. */
export async function svgToCanvas(svgElement: SVGSVGElement, scale = 2): Promise<HTMLCanvasElement> {
  const { viewX, viewY, viewW, viewH } = getSvgContentBounds(svgElement)

  const width = Math.round(viewW * scale)
  const height = Math.round(viewH * scale)

  const clone = svgElement.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', String(viewW))
  clone.setAttribute('height', String(viewH))
  clone.setAttribute('viewBox', `${viewX} ${viewY} ${viewW} ${viewH}`)
  clone.style.overflow = 'hidden' // viewBox handles bounds now
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  // Inline computed font-family on text elements that inherit from page CSS
  // (the clone is detached from the DOM and can't inherit those styles)
  inlineComputedFonts(svgElement, clone)

  // Embed web font data so text renders correctly in the serialized SVG image
  await embedFontsInSvg(clone)

  const serializer = new XMLSerializer()
  const svgString = serializer.serializeToString(clone)
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Could not get canvas context')); return }

      // White background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      resolve(canvas)
    }
    img.onerror = reject
    img.src = svgDataUrl
  })
}

/** Compose title/subtitle/source text around a chart canvas */
function addTextToCanvas(
  chartCanvas: HTMLCanvasElement,
  scale: number,
  metadata?: { title?: string; subtitle?: string; source?: string },
): HTMLCanvasElement {
  if (!metadata?.title && !metadata?.subtitle && !metadata?.source) return chartCanvas

  const pad = 20 * scale
  const titleSize = 18 * scale
  const subtitleSize = 13 * scale
  const sourceSize = 10 * scale
  const lineGap = 6 * scale

  // Measure header height
  let headerH = pad
  if (metadata.title) headerH += titleSize + lineGap
  if (metadata.subtitle) headerH += subtitleSize + lineGap

  // Measure footer height
  let footerH = pad
  if (metadata.source) footerH += sourceSize + lineGap

  const totalW = chartCanvas.width + pad * 2
  const totalH = headerH + chartCanvas.height + footerH

  const canvas = document.createElement('canvas')
  canvas.width = totalW
  canvas.height = totalH
  const ctx = canvas.getContext('2d')
  if (!ctx) return chartCanvas

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, totalW, totalH)

  // Title
  let y = pad
  if (metadata.title) {
    ctx.fillStyle = '#1e293b'
    ctx.font = `bold ${titleSize}px Inter, system-ui, sans-serif`
    ctx.fillText(metadata.title, pad, y + titleSize * 0.85)
    y += titleSize + lineGap
  }

  // Subtitle
  if (metadata.subtitle) {
    ctx.fillStyle = '#64748b'
    ctx.font = `${subtitleSize}px Inter, system-ui, sans-serif`
    ctx.fillText(metadata.subtitle, pad, y + subtitleSize * 0.85)
    y += subtitleSize + lineGap
  }

  // Chart image
  ctx.drawImage(chartCanvas, pad, headerH)

  // Source
  if (metadata.source) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = `${sourceSize}px Inter, system-ui, sans-serif`
    ctx.fillText(`Source: ${metadata.source}`, pad, headerH + chartCanvas.height + sourceSize + lineGap)
  }

  return canvas
}

// ── Font Embedding ──────────────────────────────────────────────────────────

const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
  'math', 'emoji', 'fangsong',
])

/** Copy computed font-family from the live SVG onto clone text elements
 *  that don't have an explicit font-family attribute (they'd inherit from
 *  page CSS, which the detached clone can't access). */
function inlineComputedFonts(liveSvg: SVGSVGElement, clone: SVGSVGElement): void {
  const liveTexts = liveSvg.querySelectorAll('text')
  const cloneTexts = clone.querySelectorAll('text')
  for (let i = 0; i < liveTexts.length && i < cloneTexts.length; i++) {
    if (!cloneTexts[i].getAttribute('font-family')) {
      const computed = getComputedStyle(liveTexts[i]).fontFamily
      if (computed) cloneTexts[i].setAttribute('font-family', computed)
    }
  }
}

/** Parse a CSS font-family string and add non-generic family names to the set. */
function parseFontFamilies(familyString: string, set: Set<string>): void {
  for (const f of familyString.split(',')) {
    const name = f.trim().replace(/['"]/g, '')
    if (name && !GENERIC_FAMILIES.has(name.toLowerCase())) set.add(name)
  }
}

/** Collect all @font-face CSS rules from the document's stylesheets.
 *  Handles both same-origin sheets (reads cssRules directly) and cross-origin
 *  sheets like Google Fonts (fetches the CSS text). */
async function collectFontFaceRules(): Promise<string[]> {
  const rules: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSFontFaceRule) {
          rules.push(rule.cssText)
        }
      }
    } catch {
      // Cross-origin stylesheet — fetch CSS text
      if (sheet.href) {
        try {
          const resp = await fetch(sheet.href)
          const css = await resp.text()
          const matches = css.match(/@font-face\s*\{[^}]+\}/g)
          if (matches) rules.push(...matches)
        } catch {
          // Skip unreachable stylesheets
        }
      }
    }
  }
  return rules
}

/** Convert a Blob to a base64 data URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/** Replace external url() references in a @font-face rule with inline base64 data URLs. */
async function inlineFontUrls(rule: string): Promise<string> {
  let result = rule
  const urlMatches = [...rule.matchAll(/url\(["']?([^"')]+)["']?\)/g)]
  for (const m of urlMatches) {
    const url = m[1]
    if (url.startsWith('data:')) continue // already inline
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const dataUrl = await blobToDataUrl(blob)
      result = result.replace(m[0], `url("${dataUrl}")`)
    } catch {
      // Skip fonts that can't be fetched
    }
  }
  return result
}

/** Embed web fonts used by text elements as inline @font-face rules in the SVG.
 *  This makes the SVG self-contained so fonts render correctly when serialized
 *  to a data URL for canvas/PNG export or downloaded as a standalone file. */
async function embedFontsInSvg(svgClone: SVGSVGElement): Promise<void> {
  // 1. Collect unique font families used in the SVG
  const usedFamilies = new Set<string>()

  // From text element attributes and inline styles
  for (const el of svgClone.querySelectorAll('text, [font-family]')) {
    const attr = el.getAttribute('font-family')
    const style = (el as HTMLElement).style?.fontFamily
    if (attr) parseFontFamilies(attr, usedFamilies)
    if (style) parseFontFamilies(style, usedFamilies)
  }

  // From embedded <style> elements (Observable Plot may set font-family there)
  for (const styleEl of svgClone.querySelectorAll('style')) {
    const css = styleEl.textContent ?? ''
    for (const m of css.matchAll(/font-family:\s*([^;}"]+)/g)) {
      parseFontFamilies(m[1], usedFamilies)
    }
  }

  if (usedFamilies.size === 0) return

  // 2. Collect @font-face rules from document stylesheets
  const allRules = await collectFontFaceRules()
  if (allRules.length === 0) return

  // 3. Filter to rules whose font-family matches a used family
  const relevant = allRules.filter((rule) => {
    const familyMatch = rule.match(/font-family:\s*['"]?([^'";,}]+)['"]?/)
    if (!familyMatch) return false
    const ruleFamily = familyMatch[1].trim()
    for (const used of usedFamilies) {
      if (ruleFamily.toLowerCase() === used.toLowerCase()) return true
    }
    return false
  })
  if (relevant.length === 0) return

  // 4. Inline external font URLs as base64 data URLs (parallel fetch)
  const inlined = await Promise.all(relevant.map(inlineFontUrls))

  // 5. Insert <style> with @font-face rules into SVG
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleEl.textContent = inlined.join('\n')
  svgClone.insertBefore(styleEl, svgClone.firstChild)
}

/** Compute the full content bounds of an SVG, including overflow from annotations/labels.
 *  Iterates direct children's getBBox() to detect content extending past the SVG viewport.
 *  Returns viewBox parameters that encompass all visible content. */
function getSvgContentBounds(svgElement: SVGSVGElement) {
  const vb = svgElement.viewBox.baseVal
  const svgWidth = svgElement.width.baseVal.value
    || (vb.width > 0 ? vb.width : svgElement.getBoundingClientRect().width)
  const svgHeight = svgElement.height.baseVal.value
    || (vb.height > 0 ? vb.height : svgElement.getBoundingClientRect().height)

  let minX = 0, minY = 0, maxX = svgWidth, maxY = svgHeight
  for (const child of Array.from(svgElement.children)) {
    if (child instanceof SVGGraphicsElement) {
      try {
        const bb = child.getBBox()
        if (bb.width > 0 || bb.height > 0) {
          minX = Math.min(minX, bb.x)
          minY = Math.min(minY, bb.y)
          maxX = Math.max(maxX, bb.x + bb.width)
          maxY = Math.max(maxY, bb.y + bb.height)
        }
      } catch {
        // <style>, <defs>, etc. don't support getBBox — skip
      }
    }
  }

  const pad = 4
  return {
    viewX: minX - pad,
    viewY: minY - pad,
    viewW: maxX - minX + pad * 2,
    viewH: maxY - minY + pad * 2,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'chart'
}
