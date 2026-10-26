import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import {
  clampWidth,
  dropTarget,
  minWidthOf,
  moveColumn,
  SELECT_WIDTH,
  setWidth,
  shiftVisible,
  visibleColumns,
  WIDTH_MAX,
  WIDTH_MIN,
  WIDTH_STEP,
  type ColumnKey,
  type ColumnPrefs,
} from './lib/columns'

/** En dessous de ce déplacement (pixels), un appui sur un en-tête reste un clic (tri), pas un glisser. */
const DRAG_THRESHOLD = 6

/** Ce que le tableau pose en variables CSS (`--cols`, `--min`) pour un réglage donné. */
export type ColumnLayout = { template: string; minWidth: string }

/**
 * Réglage du tableau « comme dans un tableur » : tirer le bord droit d'un en-tête pour changer la largeur de la colonne
 * (double-clic : largeur d'origine ; flèches du clavier sur la poignée), tirer l'en-tête pour changer la colonne de place.
 *
 * Pendant le geste, **rien n'est redessiné par React** : la grille est une variable CSS (`--cols`) du tableau que l'on écrit
 * directement, et l'en-tête déplacé suit la souris par `transform` ; une centaine de lignes ne sont donc pas recalculées à
 * chaque mouvement. Le réglage n'est enregistré (et le tableau redessiné) qu'à la fin du geste.
 */
export function useColumnDrag(
  base: ColumnPrefs,
  onCommit: (next: ColumnPrefs) => void,
  layoutOf: (prefs: ColumnPrefs) => ColumnLayout,
) {
  const headerRef = useRef<HTMLDivElement>(null)
  const suppressClick = useRef(false)

  const cell = (key: ColumnKey) =>
    headerRef.current?.querySelector<HTMLElement>(`[data-col="${key}"]`) ?? null

  /** Écrit la grille directement sur le tableau (le parent de l'en-tête). */
  function paint(prefs: ColumnPrefs) {
    const root = headerRef.current?.parentElement
    if (!root) return
    const { template, minWidth } = layoutOf(prefs)
    root.style.setProperty('--cols', template)
    root.style.setProperty('--min', minWidth)
  }

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
        paint(setWidth(base, key, width))
      },
      () => {
        paint(base) // si rien ne change, la grille retrouve exactement sa valeur d'avant
        if (Math.round(width) !== Math.round(startWidth)) onCommit(setWidth(base, key, width))
      },
    )
  }

  /** Flèches gauche / droite sur la poignée : la largeur au clavier (Maj : pas ×4) ; avec Alt, la place de la colonne. */
  function onHandleKey(e: KeyboardEvent, key: ColumnKey) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    // Alt + flèche : la colonne change de place (alternative au glisser).
    if (e.altKey) return onCommit(shiftVisible(base, key, dir === 1 ? 1 : -1))
    const now = cell(key)?.getBoundingClientRect().width ?? WIDTH_MIN
    onCommit(setWidth(base, key, now + dir * WIDTH_STEP * (e.shiftKey ? 4 : 1)))
  }

  /** Double-clic sur le bord : la colonne retrouve sa largeur d'origine. */
  const resetWidth = (key: ColumnKey) => onCommit(setWidth(base, key, null))

  /** Tirer un en-tête : la colonne suit la souris, un trait montre où elle sera déposée. */
  function startReorder(e: PointerEvent, key: ColumnKey) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-no-drag]')) return
    const shown = visibleColumns(base)
    const rects = shown.flatMap((k) => {
      const r = cell(k)?.getBoundingClientRect()
      return r ? [{ key: k, left: r.left, width: r.width }] : []
    })
    const dragged = cell(key)
    const startX = e.clientX
    let active = false
    const clearDrop = () => {
      for (const k of shown) delete cell(k)?.dataset['drop']
    }
    track(
      (ev) => {
        const dx = ev.clientX - startX
        if (!active && Math.abs(dx) < DRAG_THRESHOLD) return
        active = true
        if (dragged) {
          dragged.dataset['dragging'] = 'true'
          dragged.style.transform = `translateX(${dx}px)`
        }
        // Le trait de dépôt : à gauche de la colonne visée, ou à droite de la dernière.
        clearDrop()
        const before = dropTarget(rects, ev.clientX)
        if (before !== null && before !== key) {
          const target = cell(before)
          if (target) target.dataset['drop'] = 'before'
        } else if (before === null) {
          const last = cell(shown[shown.length - 1]!)
          if (last && shown[shown.length - 1] !== key) last.dataset['drop'] = 'after'
        }
      },
      (ev) => {
        clearDrop()
        if (dragged) {
          delete dragged.dataset['dragging']
          dragged.style.transform = ''
        }
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

  return { headerRef, startResize, onHandleKey, resetWidth, startReorder, consumeClick }
}
