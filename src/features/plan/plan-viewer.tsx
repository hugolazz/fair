import {
  createContext,
  useCallback,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { cn } from '@/lib/cn'
import {
  centerOn,
  clampView,
  fitView,
  focusScale,
  panBy,
  pinchView,
  scaleLimits,
  screenToPlan,
  zoomAt,
  type Point,
  type Size,
  type View,
} from './lib/viewport'

// Visionneuse de plan : déplacement, zoom (molette, boutons, clavier) et pincement à deux doigts.
// Pour rester fluide, l'état de la vue vit dans une référence et s'applique directement au DOM (une transformation
// par image) : React ne refait JAMAIS le rendu pendant un geste. Les pins sont dans une couche à part, repositionnés
// à chaque image à leur taille réelle (ils restent nets et à taille constante, quel que soit le zoom).

export type PlanViewerHandle = {
  fit(): void
  zoomBy(factor: number): void
  /** Centre le plan sur un point (0..1), avec un zoom lisible. */
  focus(p: Point, opts?: { scale?: number }): void
}

type Anchor = { el: HTMLElement; x: number; y: number }
const AnchorContext = createContext<((a: Anchor) => () => void) | null>(null)

/** Les dernières vues par plan : revenir d'une fiche retrouve le plan là où on l'avait laissé. */
const viewCache = new Map<string, View>()

const TAP_SLOP = 8 // px : au-delà, c'est un déplacement
const TAP_MAX_MS = 700
const ZOOM_NEAR = 2.2 // zoom relatif (par rapport au plan entier) à partir duquel les noms s'affichent

type Gesture =
  | { kind: 'pan'; start: Point; view: View; moved: boolean; t0: number; onPin: boolean }
  | { kind: 'pinch'; ids: [number, number]; a0: Point; b0: Point; view: View }

type Props = {
  ref?: Ref<PlanViewerHandle>
  /** Identifie le plan : mémorise la vue et la réinitialise quand on change de plan. */
  viewKey: string
  src: string
  /** Dimensions de l'image en pixels. */
  width: number
  height: number
  label: string
  /**
   * Centre le plan sur ce point (0..1) quand `key` change (« Où est-ce ? »). Déclaratif : rejouer la demande
   * (double exécution des effets en développement) donne le même résultat.
   */
  focus?: { x: number; y: number; key: string } | undefined
  /** Appui (sans déplacement) sur une zone vide du plan ; coordonnées normalisées 0..1. */
  onTap?: (p: Point) => void
  cursor?: 'grab' | 'crosshair'
  /** Pins et marqueurs (des `PinAnchor`). */
  children?: ReactNode
  className?: string
}

export function PlanViewer({
  ref,
  viewKey,
  src,
  width,
  height,
  label,
  focus,
  onTap,
  cursor = 'grab',
  children,
  className,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 })
  const viewport = useRef<Size>({ w: 0, h: 0 })
  const hasView = useRef(false)
  const interacted = useRef(false)
  const anchors = useRef(new Set<Anchor>())
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  const frame = useRef(0)
  const anim = useRef(0)
  const justMoved = useRef(false)
  const zoomLevel = useRef('far')
  const sizeRef = useRef<Size>({ w: width, h: height })
  const onTapRef = useRef(onTap)
  const focusRef = useRef(focus)
  useLayoutEffect(() => {
    sizeRef.current = { w: width, h: height }
    onTapRef.current = onTap
    focusRef.current = focus
  })

  const place = useCallback((a: Anchor) => {
    const v = viewRef.current
    const { w, h } = sizeRef.current
    a.el.style.transform = `translate3d(${v.x + a.x * w * v.scale}px, ${v.y + a.y * h * v.scale}px, 0)`
  }, [])

  const render = useCallback(() => {
    frame.current = 0
    const v = viewRef.current
    const c = content.current
    if (c) c.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.scale})`
    anchors.current.forEach(place)
    const el = container.current
    if (el) {
      const relative = v.scale / scaleLimits(sizeRef.current, viewport.current).min
      const level = relative >= ZOOM_NEAR ? 'near' : 'far'
      if (level !== zoomLevel.current) {
        zoomLevel.current = level
        el.dataset.zoom = level
      }
    }
    viewCache.set(viewKey, v)
  }, [place, viewKey])

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(render)
  }, [render])

  const setView = useCallback(
    (v: View) => {
      viewRef.current = v
      schedule()
    },
    [schedule],
  )

  const stopAnimation = useCallback(() => {
    cancelAnimationFrame(anim.current)
    anim.current = 0
  }, [])

  const animateTo = useCallback(
    (target: View, ms = 260) => {
      stopAnimation()
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) return setView(target)
      const from = viewRef.current
      const t0 = performance.now()
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / ms)
        const e = 1 - Math.pow(1 - k, 3)
        setView({
          scale: from.scale + (target.scale - from.scale) * e,
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
        })
        if (k < 1) anim.current = requestAnimationFrame(step)
      }
      anim.current = requestAnimationFrame(step)
    },
    [setView, stopAnimation],
  )

  useImperativeHandle(
    ref,
    () => ({
      fit() {
        interacted.current = false
        animateTo(fitView(sizeRef.current, viewport.current))
      },
      zoomBy(factor) {
        interacted.current = true
        const { w, h } = viewport.current
        animateTo(
          zoomAt(
            viewRef.current,
            factor,
            { x: w / 2, y: h / 2 },
            sizeRef.current,
            viewport.current,
          ),
          160,
        )
      },
      focus(p, opts) {
        interacted.current = true
        const scale =
          opts?.scale ??
          Math.max(viewRef.current.scale, focusScale(sizeRef.current, viewport.current))
        animateTo(centerOn(p, sizeRef.current, viewport.current, scale))
      },
    }),
    [animateTo],
  )

  /** Taille de la zone visible : première mise en place (vue mémorisée ou « tout le plan »), puis rotation / redimensionnement. */
  useLayoutEffect(() => {
    const el = container.current
    if (!el) return
    hasView.current = false
    interacted.current = false
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w === 0 || h === 0) return
      viewport.current = { w, h }
      const cached = viewCache.get(viewKey)
      if (!hasView.current) {
        hasView.current = true
        interacted.current = !!cached
        viewRef.current = cached
          ? clampView(cached, sizeRef.current, viewport.current)
          : fitView(sizeRef.current, viewport.current)
      } else {
        viewRef.current = interacted.current
          ? clampView(viewRef.current, sizeRef.current, viewport.current)
          : fitView(sizeRef.current, viewport.current)
      }
      render()
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewKey, width, height, render])

  const focusKey = focus?.key
  useEffect(() => {
    const target = focusRef.current
    if (focusKey === undefined || !target) return
    interacted.current = true
    const scale = Math.max(viewRef.current.scale, focusScale(sizeRef.current, viewport.current))
    animateTo(centerOn(target, sizeRef.current, viewport.current, scale))
  }, [focusKey, animateTo])

  useEffect(() => {
    const el = container.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      interacted.current = true
      stopAnimation()
      const rect = el.getBoundingClientRect()
      const unit = e.deltaMode === 1 ? 16 : 1
      const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015))
      setView(
        zoomAt(
          viewRef.current,
          factor,
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          sizeRef.current,
          viewport.current,
        ),
      )
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setView, stopAnimation])

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      cancelAnimationFrame(anim.current)
    },
    [],
  )

  const register = useCallback(
    (a: Anchor) => {
      anchors.current.add(a)
      place(a) // positionné avant le premier affichage
      return () => void anchors.current.delete(a)
    },
    [place],
  )

  const rel = (e: PointerEvent): Point => {
    const r = container.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const startPan = (start: Point, onPin: boolean, t0: number, moved = false) => {
    gesture.current = { kind: 'pan', start, view: viewRef.current, moved, t0, onPin }
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    stopAnimation()
    const p = rel(e)
    pointers.current.set(e.pointerId, p)
    if (pointers.current.size === 1) {
      startPan(p, !!(e.target as Element).closest('[data-pin]'), e.timeStamp)
    } else if (pointers.current.size === 2) {
      const [[ida, a0], [idb, b0]] = [...pointers.current.entries()] as [
        [number, Point],
        [number, Point],
      ]
      gesture.current = { kind: 'pinch', ids: [ida, idb], a0, b0, view: viewRef.current }
      capture(e.pointerId)
    }
  }

  /** Le pointeur peut avoir disparu entre-temps : perdre la capture ne doit jamais casser le geste. */
  function capture(pointerId: number) {
    try {
      container.current?.setPointerCapture(pointerId)
    } catch {
      /* pointeur déjà terminé */
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    const p = rel(e)
    pointers.current.set(e.pointerId, p)
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pan') {
      const dx = p.x - g.start.x
      const dy = p.y - g.start.y
      if (!g.moved) {
        if (Math.hypot(dx, dy) < TAP_SLOP) return
        g.moved = true
        interacted.current = true
        capture(e.pointerId)
      }
      setView(panBy(g.view, dx, dy, sizeRef.current, viewport.current))
    } else {
      const a1 = pointers.current.get(g.ids[0])
      const b1 = pointers.current.get(g.ids[1])
      if (!a1 || !b1) return
      interacted.current = true
      setView(pinchView(g.view, g.a0, g.b0, a1, b1, sizeRef.current, viewport.current))
    }
  }

  function endPointer(e: PointerEvent) {
    const g = gesture.current
    const known = pointers.current.delete(e.pointerId)
    if (!known) return
    if (g?.kind === 'pan') {
      if (g.moved) {
        justMoved.current = true
        setTimeout(() => (justMoved.current = false), 0)
      } else if (
        e.type === 'pointerup' &&
        !g.onPin &&
        e.timeStamp - g.t0 < TAP_MAX_MS &&
        onTapRef.current
      ) {
        const at = screenToPlan(viewRef.current, sizeRef.current, rel(e))
        if (at) onTapRef.current(at)
      }
    }
    if (pointers.current.size === 0) gesture.current = null
    else if (pointers.current.size === 1) {
      // Un doigt levé après un pincement : le doigt restant continue en déplacement (jamais un appui).
      const [only] = [...pointers.current.values()]
      startPan(only!, true, e.timeStamp, true)
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return
    const step = 80
    const v = viewRef.current
    const { w, h } = viewport.current
    const keys: Record<string, () => View> = {
      ArrowLeft: () => panBy(v, step, 0, sizeRef.current, viewport.current),
      ArrowRight: () => panBy(v, -step, 0, sizeRef.current, viewport.current),
      ArrowUp: () => panBy(v, 0, step, sizeRef.current, viewport.current),
      ArrowDown: () => panBy(v, 0, -step, sizeRef.current, viewport.current),
      '+': () => zoomAt(v, 1.4, { x: w / 2, y: h / 2 }, sizeRef.current, viewport.current),
      '=': () => zoomAt(v, 1.4, { x: w / 2, y: h / 2 }, sizeRef.current, viewport.current),
      '-': () => zoomAt(v, 1 / 1.4, { x: w / 2, y: h / 2 }, sizeRef.current, viewport.current),
      '0': () => fitView(sizeRef.current, viewport.current),
    }
    const next = keys[e.key]
    if (!next) return
    e.preventDefault()
    interacted.current = e.key !== '0'
    animateTo(next(), 120)
  }

  return (
    <div
      ref={container}
      role="group"
      aria-roledescription="plan"
      aria-label={label}
      tabIndex={0}
      data-zoom="far"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onKeyDown={onKeyDown}
      onClickCapture={(e) => {
        if (justMoved.current) {
          e.stopPropagation()
          e.preventDefault()
        }
      }}
      className={cn(
        'group/plan relative touch-none overflow-hidden bg-slate-200 outline-offset-[-3px] select-none',
        cursor === 'crosshair' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing',
        className,
      )}
    >
      <div
        ref={content}
        style={{ width, height, transformOrigin: '0 0' }}
        className="pointer-events-none absolute top-0 left-0"
      >
        <img
          src={src}
          width={width}
          height={height}
          alt=""
          draggable={false}
          decoding="async"
          className="block max-w-none"
        />
      </div>
      <AnchorContext.Provider value={register}>
        <div className="pointer-events-none absolute inset-0">{children}</div>
      </AnchorContext.Provider>
    </div>
  )
}

/**
 * Point d'ancrage dans le plan (x, y de 0 à 1) : son contenu est centré sur ce point, toujours à taille réelle.
 * Le déplacement suit le zoom sans rendu React.
 */
export function PinAnchor({
  x,
  y,
  zIndex,
  children,
}: {
  x: number
  y: number
  zIndex?: number
  children: ReactNode
}) {
  const el = useRef<HTMLDivElement>(null)
  const register = useContext(AnchorContext)
  useLayoutEffect(() => {
    if (!el.current || !register) return
    return register({ el: el.current, x, y })
  }, [register, x, y])
  return (
    <div ref={el} className="absolute top-0 left-0 will-change-transform" style={{ zIndex }}>
      {children}
    </div>
  )
}
