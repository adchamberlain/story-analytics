import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * React hook for mounting an Observable Plot into a container div.
 * Returns a ref to attach to a container element.
 * Uses a callback ref so the ResizeObserver re-attaches when the DOM element
 * is remounted (e.g. switching between Plot-based and non-Plot chart types).
 */
export function useObservablePlot(
  renderFn: (width: number) => HTMLElement | SVGSVGElement,
  deps: unknown[] = []
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const [width, setWidth] = useState(0)

  // Track container width via ResizeObserver.
  // Re-run whenever deps change so we re-attach if the element was remounted.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Already observing this exact element
    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        if (w > 0) setWidth(w)
      }
    })
    ro.observe(el)
    observerRef.current = ro

    // Seed width immediately so the render effect can fire
    const rect = el.getBoundingClientRect()
    if (rect.width > 0) setWidth(rect.width)

    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps])

  // Render plot when width or deps change
  useEffect(() => {
    const el = containerRef.current
    if (!el || width === 0) return

    const plot = renderFn(width)
    el.replaceChildren(plot)

    return () => {
      plot.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, ...deps])

  /** Get the rendered SVG element for export */
  const getSvgElement = useCallback((): SVGSVGElement | null => {
    return containerRef.current?.querySelector('svg') ?? null
  }, [])

  return { containerRef, getSvgElement }
}
