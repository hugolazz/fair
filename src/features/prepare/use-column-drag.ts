import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  clampWidth,
  dropTarget,
  minWidthOf,
  moveColumn,
  SELECT_WIDTH,
  setWidth,
  visibleColumns,
  WIDTH_MAX,
  WIDTH_MIN,
  WIDTH_STEP,
  type ColumnKey,
  type ColumnPrefs,
} from './lib/columns'

/** En dessous de ce déplacement (pixels), un appui sur un en-tête reste un clic (tri), pas un glisser. */
const DRAG_THRESHOLD = 6

type Dragging = { key: ColumnKey; dx: number; before: ColumnKey | null }

/**
 * Réglage du tableau « comme dans un tableur » : tirer le bord droit d'un en-tête pour changer la largeur de la colonne
 * (double-clic : largeur d'origine ; flèches du clavier sur la poignée), tirer l'en-tête pour changer la colonne de place.
 * Pendant le geste, le tableau suit en direct ; le réglage n'est enregistré qu'à la fin.
 */
export function useColumnDrag(base: ColumnPrefs, onCommit: (next: ColumnPrefs) => void) {
  const headerRef = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<ColumnPrefs | null>(null)
  const [dragging, setDragging] = useState<Dragging | null>(null)
  const prefs = live ?? base
  const suppressClick = useRef(false)

  // Largeur affichée de chaque colonne (pour la valeur courante de la poignée, lue par les lecteurs d'écran).
  const [measured, setMeasured] = useState<Partial<Record<ColumnKey, number>>>({})
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const measure = () => {
      const next: Partial<Record<ColumnKey, number>> = {}
      for (const el of header.querySelectorAll<HTMLElement>('[data-col]'))
        next[el.dataset['col'] as ColumnKey] = Math.round(el.getBoundingClientRect().width)
      setMeasured((cur) =>
        Object.keys(next).length === Object.keys(cur).length &&
        Object.entries(next).every(([k, v]) => cur[k as ColumnKey] === v)
          ? cur
          : next,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [prefs])

  const cell = (key: ColumnKey) =>
    headerRef.current?.querySelector<HTMLElement>(`[data-col="${key}"]`) ?? null

  function track(
    onMove: (e: globalThis.PointerEvent) => void,
    onEnd: (e: globalThis.PointerEvent) => void,
  ) {
    document.body.style.userSelect = 'none'
    const up = (e: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.style.userSelect = ''
      onEnd(e)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  /** Tirer le bord droit d'un en-tête : la colonne prend la largeur voulue, sans jamais faire déborder le tableau. */
  function startResize(e: PointerEvent, key: ColumnKey) {
    const header = headerRef.current
    const el = cell(key)
    if (!header || !el || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const style = getComputedStyle(header)
    const content =
      header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const othersMin = visibleColumns(base)
      .filter((k) => k !== key)
      .reduce((sum, k) => sum + (base.widths[k] ?? minWidthOf(k)), SELECT_WIDTH)
    const max = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, content - othersMin))
    const startX = e.clientX
    const startWidth = el.getBoundingClientRect().width
    let width = startWidth
    track(
      (ev) => {
        width = Math.min(max, clampWidth(startWidth + ev.clientX - startX))
        setLive(setWidth(base, key, width))
      },
      () => {
        setLive(null)
        if (Math.round(width) !== Math.round(startWidth)) onCommit(setWidth(base, key, width))
      },
    )
  }

  /** Flèches gauche / droite sur la poignée : la même chose au clavier (Maj : pas ×4). */
  function onHandleKey(e: KeyboardEvent, key: ColumnKey) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const now = cell(key)?.getBoundingClientRect().width ?? WIDTH_MIN
    onCommit(setWidth(base, key, now + dir * WIDTH_STEP * (e.shiftKey ? 4 : 1)))
  }

  /** Double-clic sur le bord : la colonne retrouve sa largeur d'origine. */
  const resetWidth = (key: ColumnKey) => onCommit(setWidth(base, key, null))

  /** Tirer un en-tête : la colonne suit la souris, un trait montre où elle sera déposée. */
  function startReorder(e: PointerEvent, key: ColumnKey) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-no-drag]')) return
    const rects = visibleColumns(base).flatMap((k) => {
      const r = cell(k)?.getBoundingClientRect()
      return r ? [{ key: k, left: r.left, width: r.width }] : []
    })
    const startX = e.clientX
    let active = false
    track(
      (ev) => {
        const dx = ev.clientX - startX
        if (!active && Math.abs(dx) < DRAG_THRESHOLD) return
        active = true
        setDragging({ key, dx, before: dropTarget(rects, ev.clientX) })
      },
      (ev) => {
        setDragging(null)
        if (!active) return
        // Le clic qui suit le relâchement ne doit pas trier la colonne.
        suppressClick.current = true
        setTimeout(() => (suppressClick.current = false), 0)
        onCommit(moveColumn(base, key, dropTarget(rects, ev.clientX)))
      },
    )
  }

  /** Vrai (une fois) juste après un glisser : le clic de fin de geste est à ignorer. */
  const consumeClick = () => {
    const was = suppressClick.current
    suppressClick.current = false
    return was
  }

  return {
    prefs,
    measured,
    headerRef,
    dragging,
    startResize,
    onHandleKey,
    resetWidth,
    startReorder,
    consumeClick,
  }
}
