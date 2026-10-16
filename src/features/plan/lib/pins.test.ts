import { describe, expect, it } from 'vitest'
import type { PlanPin } from '@/db/schemas/plan'
import { buildSearchKey, type Target } from '@/db/schemas/prepare'
import { fitWithin, pdfRenderScale, PLAN_MAX_PIXELS, PLAN_MAX_SIDE } from './image-size'
import { buildPinViews, placedTargetIds, rankTargets } from './pins'
import { standKey } from './stand-key'

const target = (id: string, name: string, over: Partial<Target> = {}): Target => ({
  id,
  eventId: 'e',
  companyId: `c-${id}`,
  name,
  domain: '',
  website: '',
  industry: '',
  country: '',
  city: '',
  stand: '',
  priority: null,
  goal: null,
  prepComment: '',
  assigneeIds: [],
  tagIds: [],
  history: '',
  contactCount: 0,
  meetings: [],
  searchKey: buildSearchKey([name, over.stand]),
  ...over,
})

const pin = (id: string, over: Partial<PlanPin> = {}): PlanPin => ({
  id,
  floorplanId: 'p',
  targetId: null,
  standLabel: null,
  x: 0.5,
  y: 0.5,
  reviewStatus: 'confirmed',
  ...over,
})

describe('standKey', () => {
  it.each([
    ['B12', 'B12'],
    ['b-12', 'B12'],
    ['A 05', 'A5'],
    ['A005', 'A5'],
    ['A0', 'A0'],
    ['Hall 3 / D07', 'HALL3D7'],
    ['5005', '5005'],
  ])('%s → %s', (input, key) => expect(standKey(input)).toBe(key))

  it('rien de significatif → null', () => {
    expect(standKey('')).toBeNull()
    expect(standKey(null)).toBeNull()
    expect(standKey(' - ')).toBeNull()
  })
})

describe('buildPinViews', () => {
  const rows = [
    target('t1', 'Carrefour', { priority: 'A', stand: 'B12' }),
    target('t2', 'Décathlon', { priority: 'C' }),
  ]

  it('prend la priorité et le stand de l’entreprise reliée', () => {
    const [v] = buildPinViews([pin('p1', { targetId: 't1' })], rows)
    expect(v).toMatchObject({ targetId: 't1', name: 'Carrefour', stand: 'B12', priority: 'A' })
  })

  it('le numéro saisi sur le pin prime sur celui de la participation', () => {
    const [v] = buildPinViews([pin('p1', { targetId: 't1', standLabel: 'B-12 bis' })], rows)
    expect(v!.stand).toBe('B-12 bis')
  })

  it('un pin « stand seul » n’a pas de priorité', () => {
    const [v] = buildPinViews([pin('p1', { standLabel: 'C7' })], rows)
    expect(v).toMatchObject({ targetId: null, name: 'C7', stand: 'C7', priority: null })
  })

  it('une entreprise inconnue retombe sur le numéro de stand', () => {
    const [v] = buildPinViews([pin('p1', { targetId: 'inconnue', standLabel: 'D4' })], rows)
    expect(v).toMatchObject({ targetId: null, name: 'D4' })
  })

  it('signale les détections à confirmer', () => {
    const [v] = buildPinViews([pin('p2', { standLabel: 'A2', reviewStatus: 'suggested' })], rows)
    expect(v!.suggested).toBe(true)
  })
})

describe('placedTargetIds', () => {
  it('liste les participations déjà placées', () => {
    const set = placedTargetIds([pin('1', { targetId: 't1' }), pin('3', { standLabel: 'X' })])
    expect([...set]).toEqual(['t1'])
  })
})

describe('rankTargets (choisir l’entreprise d’un nouveau pin)', () => {
  const rows = [
    target('t1', 'Zalando', { priority: 'B', stand: 'A5' }),
    target('t2', 'Amazon', { priority: 'A', stand: 'B12' }),
    target('t3', 'Carrefour', { priority: 'A', stand: 'A-05' }),
    target('t4', 'Cdiscount', { priority: null }),
  ]
  const names = (r: Target[]) => r.map((x) => x.name)

  it('non placées d’abord, puis priorité, puis nom', () => {
    expect(names(rankTargets(rows, { placed: new Set(['t2']) }))).toEqual([
      'Carrefour',
      'Zalando',
      'Cdiscount',
      'Amazon',
    ])
  })

  it('le numéro de stand saisi remonte en tête les entreprises du même stand (« A 05 » = « A5 »)', () => {
    expect(names(rankTargets(rows, { placed: new Set(), standLabel: 'a 05' })).slice(0, 2)).toEqual(
      ['Carrefour', 'Zalando'],
    )
  })

  it('la recherche filtre par nom ou par stand, sans accent ni casse', () => {
    expect(names(rankTargets(rows, { placed: new Set(), query: 'CARRE' }))).toEqual(['Carrefour'])
    expect(names(rankTargets(rows, { placed: new Set(), query: 'b12' }))).toEqual(['Amazon'])
    expect(rankTargets(rows, { placed: new Set(), query: 'introuvable' })).toEqual([])
  })
})

describe('taille des images de plan', () => {
  it('ne grossit jamais une image déjà dans les limites', () => {
    expect(fitWithin(3000, 2000)).toEqual({ width: 3000, height: 2000, scale: 1 })
  })

  it('borne le côté long et le nombre de pixels, proportions conservées', () => {
    const wide = fitWithin(8000, 4000)
    expect(wide.width).toBe(PLAN_MAX_SIDE)
    expect(wide.height).toBe(2048)
    const big = fitWithin(4096, 4096)
    expect(big.width * big.height).toBeLessThanOrEqual(PLAN_MAX_PIXELS)
    expect(big.width).toBe(big.height)
  })

  it('un PDF A4 est rendu assez grand pour lire les numéros de stand', () => {
    const scale = pdfRenderScale(595, 842)
    expect(595 * scale).toBeGreaterThan(2000)
    expect(842 * scale).toBeLessThanOrEqual(PLAN_MAX_SIDE)
    expect(595 * scale * 842 * scale).toBeLessThanOrEqual(PLAN_MAX_PIXELS)
  })

  it('un très grand format (A0) est ramené dans les limites', () => {
    const scale = pdfRenderScale(2384, 3370)
    expect(3370 * scale).toBeLessThanOrEqual(PLAN_MAX_SIDE)
  })
})
