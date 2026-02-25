/**
 * Client-side chart export utilities.
 * Observable Plot renders SVG natively, so export is straightforward.
 */

/** Download an SVG element as a .svg file */
export function exportSVG(svgElement: SVGSVGElement, filename: string): void {
  const clone = svgElement.cloneNode(true) as SVGSVGElement

  // Ensure the SVG has explicit dimensions for standalone viewing
  if (!clone.getAttribute('width')) {
    const bbox = svgElement.getBoundingClientRect()
    clone.setAttribute('width', String(bbox.width))
    clone.setAttribute('height', String(bbox.height))
  }

  // Add XML namespace for standalone SVG
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

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
  metadata?: { title?: string; source?: string }
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const canvas = await svgToCanvas(svgElement, 2)

  // Size page to chart aspect ratio using A4 dimensions
  const imgWidth = canvas.width || 1  // Guard against zero-width canvas
  const imgHeight = canvas.height || 1
  const isLandscape = imgWidth > imgHeight
  const pdfWidth = isLandscape ? 297 : 210  // A4 landscape vs portrait width in mm
  const pdfHeight = (imgHeight / imgWidth) * pdfWidth

  const doc = new jsPDF({
    unit: 'mm',
    format: [pdfWidth, pdfHeight + 30], // Extra space for title/source
  })

  let yOffset = 10

  // Title
  if (metadata?.title) {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(metadata.title, 10, yOffset)
    yOffset += 10
  }

  // Chart image
  const imgData = canvas.toDataURL('image/png')
  doc.addImage(imgData, 'PNG', 0, yOffset, pdfWidth, pdfHeight)
  yOffset += pdfHeight + 5

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

  // Title
  if (metadata?.title) {
    slide.addText(metadata.title, {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.5,
      fontSize: 24,
      bold: true,
      color: '1e293b',
    })
  }

  // Subtitle
  if (metadata?.subtitle) {
    slide.addText(metadata.subtitle, {
      x: 0.5,
      y: 0.8,
      w: 9,
      h: 0.4,
      fontSize: 14,
      color: '64748b',
    })
  }

  // Chart image (centered, 80% width)
  const canvas = await svgToCanvas(svgElement, 2)
  const imgData = canvas.toDataURL('image/png')
  const yPos = metadata?.title ? (metadata?.subtitle ? 1.3 : 1.0) : 0.5
  slide.addImage({
    data: imgData,
    x: 0.75,
    y: yPos,
    w: 8.5,
    h: 4.5,
    sizing: { type: 'contain', w: 8.5, h: 4.5 },
  })

  // Source
  if (metadata?.source) {
    slide.addText(`Source: ${metadata.source}`, {
      x: 0.5,
      y: 6.8,
      w: 9,
      h: 0.3,
      fontSize: 9,
      color: '94a3b8',
    })
  }

  await pres.writeFile({ fileName: `${sanitizeFilename(filename)}.pptx` })
}

// ── Shared Helpers ──────────────────────────────────────────────────────────

/** Convert an SVG element to a canvas at a given scale */
export function svgToCanvas(svgElement: SVGSVGElement, scale = 2): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const bbox = svgElement.getBoundingClientRect()
    const width = bbox.width * scale
    const height = bbox.height * scale

    const clone = svgElement.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(bbox.width))
    clone.setAttribute('height', String(bbox.height))
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(clone)
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`

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
