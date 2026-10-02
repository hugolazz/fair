import { describe, expect, it } from 'vitest'
import {
  centerOn,
  clampView,
  fitScale,
  fitView,
  focusScale,
  panBy,
  pinchView,
  planToScreen,
  scaleLimits,
  screenToPlan,
  zoomAt,
} from './viewport'

const content = { w: 4000, h: 3000 }
const phone = { w: 400, h: 700 }
const desktop = { w: 1200, h: 800 }

describe('vue de départ', () => {
  it('fait tenir tout le plan dans l’écran, centré', () => {
    const v = fitView(content, phone)
    expect(v.scale).toBeCloseTo((400 - 16) / 4000, 6)
    expect(v.x).toBeCloseTo((400 - 4000 * v.scale) / 2, 6)
    expect(v.y).toBeCloseTo((700 - 3000 * v.scale) / 2, 6)
    // Tout le plan est visible.
    expect(4000 * v.scale).toBeLessThanOrEqual(400)
    expect(3000 * v.scale).toBeLessThanOrEqual(700)
  })

  it('le zoom va de « tout le plan » à ×10', () => {
    const { min, max } = scaleLimits(content, phone)
    expect(min).toBe(fitScale(content, phone))
    expect(max).toBeCloseTo(Math.max(min * 10, 2), 6)
  })
})

describe('limites', () => {
  it('on ne peut pas zoomer au-delà des bornes', () => {
    const { min, max } = scaleLimits(content, desktop)
    expect(clampView({ scale: 0.0001, x: 0, y: 0 }, content, desktop).scale).toBe(min)
    expect(clampView({ scale: 99, x: 0, y: 0 }, content, desktop).scale).toBe(max)
  })

  it('le plan ne peut pas être poussé hors de l’écran quand il est zoomé', () => {
    const scale = 0.5 // 2000 × 1500 px à l'écran, plus grand que l'écran
    const far = clampView({ scale, x: 5000, y: 5000 }, content, desktop)
    expect(far.x).toBe(0)
    expect(far.y).toBe(0)
    const other = clampView({ scale, x: -9000, y: -9000 }, content, desktop)
    expect(other.x).toBe(desktop.w - 2000)
    expect(other.y).toBe(desktop.h - 1500)
  })

  it('un plan plus petit que l’écran reste centré', () => {
    const v = clampView({ scale: 0.1, x: 300, y: -50 }, { w: 1000, h: 500 }, { w: 1000, h: 800 })
    expect(v.scale).toBeGreaterThanOrEqual(
      scaleLimits({ w: 1000, h: 500 }, { w: 1000, h: 800 }).min,
    )
    expect(v.x).toBeCloseTo((1000 - 1000 * v.scale) / 2, 6)
  })
})

describe('zoom et déplacement', () => {
  it('le zoom garde en place le point sous le curseur', () => {
    const start = { scale: 0.4, x: -300, y: -200 }
    const at = { x: 500, y: 300 }
    const planBefore = screenToPlan(start, content, at)!
    const next = zoomAt(start, 1.5, at, content, desktop)
    expect(next.scale).toBeCloseTo(0.6, 6)
    const planAfter = screenToPlan(next, content, at)!
    expect(planAfter.x).toBeCloseTo(planBefore.x, 6)
    expect(planAfter.y).toBeCloseTo(planBefore.y, 6)
  })

  it('panBy déplace puis borne', () => {
    const start = { scale: 0.5, x: -100, y: -100 }
    expect(panBy(start, 40, 20, content, desktop)).toEqual({ scale: 0.5, x: -60, y: -80 })
    expect(panBy(start, 1000, 1000, content, desktop)).toMatchObject({ x: 0, y: 0 })
  })
})

describe('pincement à deux doigts', () => {
  const start = { scale: 0.4, x: -200, y: -100 }
  const a0 = { x: 400, y: 300 }
  const b0 = { x: 600, y: 300 }

  it('écarter les doigts zoome autour du milieu, qui reste sous les doigts', () => {
    const mid0 = { x: 500, y: 300 }
    const planUnder = screenToPlan(start, content, mid0)!
    const next = pinchView(start, a0, b0, { x: 300, y: 300 }, { x: 700, y: 300 }, content, desktop)
    expect(next.scale).toBeCloseTo(0.8, 6) // distance ×2
    const after = screenToPlan(next, content, mid0)!
    expect(after.x).toBeCloseTo(planUnder.x, 6)
    expect(after.y).toBeCloseTo(planUnder.y, 6)
  })

  it('déplacer les deux doigts ensemble déplace le plan sans changer le zoom', () => {
    const next = pinchView(start, a0, b0, { x: 430, y: 330 }, { x: 630, y: 330 }, content, desktop)
    expect(next.scale).toBeCloseTo(start.scale, 6)
    expect(next.x).toBeCloseTo(start.x + 30, 6)
    expect(next.y).toBeCloseTo(start.y + 30, 6)
  })

  it('rapprocher les doigts dézoome, jamais en dessous de « tout le plan »', () => {
    const next = pinchView(start, a0, b0, { x: 499, y: 300 }, { x: 501, y: 300 }, content, desktop)
    expect(next.scale).toBe(scaleLimits(content, desktop).min)
  })
})

describe('« Où est-ce ? »', () => {
  it('centre le plan sur le stand', () => {
    const scale = focusScale(content, desktop)
    const v = centerOn({ x: 0.5, y: 0.5 }, content, desktop, scale)
    const screen = planToScreen(v, content, { x: 0.5, y: 0.5 })
    expect(screen.x).toBeCloseTo(desktop.w / 2, 4)
    expect(screen.y).toBeCloseTo(desktop.h / 2, 4)
    expect(v.scale).toBeGreaterThan(scaleLimits(content, desktop).min) // zoomé, pas « tout le plan »
  })

  it('un stand au bord reste visible, sans vide autour du plan', () => {
    const v = centerOn({ x: 0.01, y: 0.02 }, content, desktop, focusScale(content, desktop))
    expect(v.x).toBeLessThanOrEqual(0)
    const screen = planToScreen(v, content, { x: 0.01, y: 0.02 })
    expect(screen.x).toBeGreaterThanOrEqual(0)
    expect(screen.x).toBeLessThanOrEqual(desktop.w)
  })
})

describe('conversions écran ↔ plan', () => {
  const v = { scale: 0.3, x: -120, y: 40 }
  it('aller-retour', () => {
    const p = { x: 0.37, y: 0.62 }
    const back = screenToPlan(v, content, planToScreen(v, content, p))!
    expect(back.x).toBeCloseTo(p.x, 9)
    expect(back.y).toBeCloseTo(p.y, 9)
  })
  it('un appui hors de l’image ne pose rien', () => {
    expect(screenToPlan(v, content, { x: -500, y: 10 })).toBeNull()
    expect(screenToPlan(v, content, { x: 5000, y: 10 })).toBeNull()
  })
})
