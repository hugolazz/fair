// Géométrie de la visionneuse de plan : fonctions pures (testées), sans DOM.
// Une vue = « écran = plan × scale + (x, y) », en pixels CSS ; le plan est mesuré en pixels de l'image.

export type Size = { w: number; h: number }
export type Point = { x: number; y: number }
export type View = { scale: number; x: number; y: number }

/** Échelle qui fait tenir tout le plan dans l'écran. */
export function fitScale(content: Size, viewport: Size, padding = 8): number {
  const sx = (viewport.w - padding * 2) / content.w
  const sy = (viewport.h - padding * 2) / content.h
  return Math.max(0.01, Math.min(sx, sy))
}

/** Bornes de zoom : de « tout le plan » à environ 10 fois plus (assez pour lire les numéros d'un grand plan). */
export function scaleLimits(content: Size, viewport: Size): { min: number; max: number } {
  const min = fitScale(content, viewport)
  return { min, max: Math.max(min * 10, 2) }
}

export function fitView(content: Size, viewport: Size): View {
  const scale = fitScale(content, viewport)
  return clampView(
    { scale, x: (viewport.w - content.w * scale) / 2, y: (viewport.h - content.h * scale) / 2 },
    content,
    viewport,
  )
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Un axe : plan plus petit que l'écran = centré ; sinon son bord ne peut pas s'éloigner du bord de l'écran. */
function clampAxis(pos: number, contentPx: number, portPx: number): number {
  if (contentPx <= portPx) return (portPx - contentPx) / 2
  return clamp(pos, portPx - contentPx, 0)
}

/** Garde la vue dans des limites raisonnables : zoom borné, plan jamais poussé hors de l'écran. */
export function clampView(view: View, content: Size, viewport: Size): View {
  const { min, max } = scaleLimits(content, viewport)
  const scale = clamp(view.scale, min, max)
  return {
    scale,
    x: clampAxis(view.x, content.w * scale, viewport.w),
    y: clampAxis(view.y, content.h * scale, viewport.h),
  }
}

/** Zoom par `factor` autour d'un point de l'écran (le point sous le doigt / le curseur reste en place). */
export function zoomAt(view: View, factor: number, at: Point, content: Size, viewport: Size): View {
  const { min, max } = scaleLimits(content, viewport)
  const scale = clamp(view.scale * factor, min, max)
  const k = scale / view.scale
  return clampView(
    { scale, x: at.x - (at.x - view.x) * k, y: at.y - (at.y - view.y) * k },
    content,
    viewport,
  )
}

export function panBy(view: View, dx: number, dy: number, content: Size, viewport: Size): View {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, content, viewport)
}

/**
 * Pincement à deux doigts : `start` = vue au moment où le deuxième doigt a touché, `a0/b0` = positions des doigts à
 * ce moment, `a1/b1` = positions actuelles. Le point du plan situé entre les doigts au départ suit le milieu des doigts.
 */
export function pinchView(
  start: View,
  a0: Point,
  b0: Point,
  a1: Point,
  b1: Point,
  content: Size,
  viewport: Size,
): View {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y) || 1
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }
  const { min, max } = scaleLimits(content, viewport)
  const scale = clamp((start.scale * d1) / d0, min, max)
  const planX = (m0.x - start.x) / start.scale
  const planY = (m0.y - start.y) / start.scale
  return clampView({ scale, x: m1.x - planX * scale, y: m1.y - planY * scale }, content, viewport)
}

/** Vue qui place le point `p` (0..1) au centre de l'écran, à l'échelle demandée (par défaut : lisible, jamais moins que l'actuelle). */
export function centerOn(p: Point, content: Size, viewport: Size, scale: number): View {
  const { min, max } = scaleLimits(content, viewport)
  const s = clamp(scale, min, max)
  return clampView(
    {
      scale: s,
      x: viewport.w / 2 - p.x * content.w * s,
      y: viewport.h / 2 - p.y * content.h * s,
    },
    content,
    viewport,
  )
}

/** Échelle « lisible » pour retrouver un stand : assez zoomé pour distinguer les stands voisins. */
export function focusScale(content: Size, viewport: Size): number {
  const { min, max } = scaleLimits(content, viewport)
  return clamp(min * 4, min, max)
}

/** Point de l'écran → coordonnées normalisées du plan (0..1), `null` hors du plan. */
export function screenToPlan(view: View, content: Size, screen: Point): Point | null {
  const x = (screen.x - view.x) / (view.scale * content.w)
  const y = (screen.y - view.y) / (view.scale * content.h)
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  return { x, y }
}

/** Coordonnées normalisées du plan → point de l'écran. */
export function planToScreen(view: View, content: Size, p: Point): Point {
  return { x: view.x + p.x * content.w * view.scale, y: view.y + p.y * content.h * view.scale }
}
