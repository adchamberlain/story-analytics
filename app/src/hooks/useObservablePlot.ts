import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * React hook for mounting an Observable Plot into a container div.
 * Returns a ref to attach to a container element.
 * Uses a callback ref so the ResizeObserver re-attaches when the DOM element
 * is remounted (e.g. switching between Plot-based and non-Plot chart types).
 *
 * The render function receives both measured width and height. Height is 0 if
 * the container has no intrinsic height yet (e.g. flex layout not resolved).
 */
export function useObservablePlot(
  renderFn: (width: number, height: number) => HTMLElement | SVGSVGElement | null,
  deps: unknown[] = []
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const renderFnRef = useRef(renderFn)
  renderFnRef.current = renderFn
  const [size, setSize] = useState({ width: 0, height: 0 })

  // Track container size via ResizeObserver.
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
        const { width, height } = entry.contentRect
        if (width > 0) {
          setSize((prev) => {
            if (prev.width === width && prev.height === height) return prev
            return { width, height }
          })
        }
      }
    })
    ro.observe(el)
    observerRef.current = ro

    // Seed size immediately so the render effect can fire
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height })

    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps])

  // Render plot when size or deps change
  useEffect(() => {
    const el = containerRef.current
    if (!el || size.width === 0) return

    let plot: HTMLElement | SVGSVGElement | null
    try {
      plot = renderFnRef.current(size.width, size.height)
    } catch (err) {
      console.error('[useObservablePlot] render error:', err)
      el.replaceChildren()
      const msg = document.createElement('p')
      msg.textContent = `Chart render error: ${err instanceof Error ? err.message : String(err)}`
      msg.style.cssText = 'color:#ef4444;font-size:13px;padding:16px;text-align:center'
      el.appendChild(msg)
      return
    }
    if (!plot) return // render deferred (e.g. waiting for height measurement)
    el.replaceChildren(plot)

    // Allow tooltips and labels to overflow the SVG boundary
    const svg = el.querySelector('svg')
    if (svg) svg.style.overflow = 'visible'

    return () => {
      plot?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, ...deps])

  /** Get the rendered SVG element for export */
  const getSvgElement = useCallback((): SVGSVGElement | null => {
    return containerRef.current?.querySelector('svg') ?? null
  }, [])

  return { containerRef, getSvgElement }
}
