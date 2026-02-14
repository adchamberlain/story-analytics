import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * React hook for mounting an Observable Plot into a container div.
 * Returns a ref to attach to a container element.
 * The renderFn receives the container width and should return a Plot SVG/HTML element.
 */
export function useObservablePlot(
  renderFn: (width: number) => HTMLElement | SVGSVGElement,
  deps: unknown[] = []
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  // Track container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
