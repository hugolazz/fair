import { useCallback, useEffect, useRef, useState } from 'react'
import { visibleRange } from './lib/misc'

type Options = {
  /** La liste défile avec la page (et non dans son propre cadre) ; `ref` se pose alors sur le bloc qui contient l'en-tête et les lignes. */
  window?: boolean
  /** Hauteur de l'en-tête collant placé avant les lignes, en mode `window`. */
  headerHeight?: number
}

/**
 * Fenêtrage d'une longue liste à hauteur de ligne fixe : seules les lignes visibles sont rendues,
 * ce qui garde 5 000 participants fluides. Par défaut `ref` est à poser sur le conteneur qui défile ;
 * en mode `window`, c'est la page qui défile.
 */
export function useVirtualRows(
  count: number,
  rowHeight: number,
  overscan = 8,
  options: Options = {},
) {
  const { window: pageScroll = false, headerHeight = 0 } = options
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ scrollTop: 0, height: 600 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () =>
      setView(
        pageScroll
          ? {
              // Distance déjà défilée au-delà du début des lignes, et hauteur de la fenêtre du navigateur.
              scrollTop: Math.max(0, -el.getBoundingClientRect().top - headerHeight),
              height: window.innerHeight,
            }
          : { scrollTop: el.scrollTop, height: el.clientHeight },
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (pageScroll) {
      window.addEventListener('scroll', measure, { passive: true })
      window.addEventListener('resize', measure)
    }
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [pageScroll, headerHeight])

  const onScroll = useCallback(() => {
    const el = ref.current
    if (el && !pageScroll)
      setView((v) => (v.scrollTop === el.scrollTop ? v : { ...v, scrollTop: el.scrollTop }))
  }, [pageScroll])

  const { start, end } = visibleRange({
    scrollTop: view.scrollTop,
    viewportHeight: view.height,
    rowHeight,
    count,
    overscan,
  })
  return { ref, onScroll, start, end, totalHeight: count * rowHeight, offsetTop: start * rowHeight }
}
