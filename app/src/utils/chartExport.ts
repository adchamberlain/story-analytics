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

/** Render an SVG element to a PNG at 2x resolution and download */
export function exportPNG(svgElement: SVGSVGElement, filename: string, scale = 2): void {
  svgToCanvas(svgElement, scale)
    .then((canvas) => {
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

// ── Shared Helpers ──────────────────────────────────────────────────────────

/** Convert an SVG element to a canvas at a given scale */
function svgToCanvas(svgElement: SVGSVGElement, scale = 2): Promise<HTMLCanvasElement> {
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
