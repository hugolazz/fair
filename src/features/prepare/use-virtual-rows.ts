import { useCallback, useEffect, useRef, useState } from 'react'
import { visibleRange } from './lib/misc'

/**
 * Fenêtrage d'une longue liste à hauteur de ligne fixe : seules les lignes visibles sont rendues,
 * ce qui garde 5 000 participants fluides. `ref` est à poser sur le conteneur qui défile.
 */
export function useVirtualRows(count: number, rowHeight: number, overscan = 8) {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ scrollTop: 0, height: 600 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setView({ scrollTop: el.scrollTop, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const onScroll = useCallback(() => {
    const el = ref.current
    if (el) setView((v) => (v.scrollTop === el.scrollTop ? v : { ...v, scrollTop: el.scrollTop }))
  }, [])

  const { start, end } = visibleRange({
    scrollTop: view.scrollTop,
    viewportHeight: view.height,
    rowHeight,
    count,
    overscan,
  })
  return { ref, onScroll, start, end, totalHeight: count * rowHeight, offsetTop: start * rowHeight }
}
