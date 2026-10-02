import { describe, expect, it } from 'vitest'
import { computeBilan } from '@shared/exports/bilan.ts'
import { applyFilters } from '@shared/exports/select.ts'
import { NO_FILTERS } from '@shared/exports/types.ts'
import { sampleData } from './fixtures'

const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort()

describe('filtres d’export', () => {
  const data = sampleData()

  it('sans filtre : tout est gardé', () => {
    const r = applyFilters(data, NO_FILTERS)
    expect(r.targets).toHaveLength(6)
    expect(r.meetings).toHaveLength(8)
    expect(r.notes).toHaveLength(3)
  })

  it('priorité : ne garde que les entreprises concernées, et leurs contacts / rencontres / notes', () => {
    const r = applyFilters(data, { ...NO_FILTERS, priorities: ['A'] })
    expect(ids(r.targets)).toEqual(['ec1', 'ec5'])
    expect(ids(r.meetings)).toEqual(['m1', 'm2', 'm6'])
    expect(ids(r.contacts)).toEqual(['c1', 'c2'])
    expect(ids(r.notes)).toEqual(['n1', 'n3']) // n3 : note posée sur l'entreprise, sans rencontre
    expect(r.followUps.map((f) => f.id)).toEqual(['f1'])
  })

  it('« none » = entreprises sans priorité', () => {
    expect(ids(applyFilters(data, { ...NO_FILTERS, priorities: ['none'] }).targets)).toEqual([
      'ec4',
    ])
  })

  it('statut : garde les rencontres de ce statut et les entreprises qui en ont', () => {
    const r = applyFilters(data, { ...NO_FILTERS, statuses: ['follow_up'] })
    expect(ids(r.meetings)).toEqual(['m2', 'm8'])
    expect(ids(r.targets)).toEqual(['ec1', 'ec2'])
  })

  it('statut « none » : entreprises sans aucune rencontre', () => {
    const d = { ...data, targets: [...data.targets] }
    d.targets.push({ ...data.targets[0]!, id: 'ec9', companyId: 'co-ec9', name: 'Sans rencontre' })
    const r = applyFilters(d, { ...NO_FILTERS, statuses: ['none'] })
    expect(ids(r.targets)).toEqual(['ec9'])
    expect(r.meetings).toHaveLength(0)
  })

  it('commercial : entreprises assignées OU avec une de ses rencontres ; seules ses rencontres', () => {
    const r = applyFilters(data, { ...NO_FILTERS, assigneeIds: ['u2'] })
    // Marie : assignée à Carrefour et Décathlon, a une rencontre imprévue chez Leroy Merlin.
    expect(ids(r.targets)).toEqual(['ec1', 'ec2', 'ec6'])
    expect(ids(r.meetings)).toEqual(['m2', 'm3', 'm7', 'm8'])
  })

  it('tags : au moins un des tags demandés', () => {
    expect(ids(applyFilters(data, { ...NO_FILTERS, tagIds: ['t2'] }).targets)).toEqual([
      'ec2',
      'ec3',
    ])
  })

  it('critères combinés (ET entre critères, OU dans un critère)', () => {
    const r = applyFilters(data, {
      statuses: ['done'],
      priorities: ['A', 'B'],
      assigneeIds: ['u1', 'u2'],
      tagIds: [],
    })
    expect(ids(r.meetings)).toEqual(['m1', 'm3', 'm7'])
    expect(ids(r.targets)).toEqual(['ec1', 'ec2', 'ec6'])
  })

  it('ne modifie pas les données d’origine', () => {
    applyFilters(data, { ...NO_FILTERS, priorities: ['C'] })
    expect(data.targets).toHaveLength(6)
  })
})

describe('bilan du salon', () => {
  const b = computeBilan(sampleData())

  it('rencontres prévues vs réalisées', () => {
    // 7 prévues (m7 est imprévue) ; réalisées = vu / à relancer / pas intéressé : m1 m2 m3 m6 m8.
    expect(b.meetings).toEqual({
      planned: 7,
      held: 5,
      missed: 1,
      pending: 1,
      unplanned: 1,
      rate: 71,
    })
  })

  it('entreprises rencontrées', () => {
    expect(b.targets).toBe(6)
    expect(b.targetsMet).toBe(4) // Carrefour, Décathlon, Amazon (pas intéressé = rencontré), Leroy Merlin (imprévue)
  })

  it('répartition par statut (tous les statuts, y compris à zéro)', () => {
    const count = Object.fromEntries(b.byStatus.map((s) => [s.status, s.count]))
    expect(count).toMatchObject({
      done: 3,
      follow_up: 2,
      missed: 1,
      to_see: 1,
      not_interested: 1,
      in_progress: 0,
      skipped: 0,
    })
    expect(b.byStatus.reduce((n, s) => n + s.count, 0)).toBe(8)
  })

  it('répartition par priorité', () => {
    const a = b.byPriority.find((p) => p.priority === 'A')!
    expect(a).toEqual({ priority: 'A', targets: 2, met: 2, meetings: 3, held: 3 })
    expect(b.byPriority.find((p) => p.priority === 'none')).toMatchObject({ targets: 1, met: 0 })
  })

  it('répartition par commercial', () => {
    const marie = b.bySalesperson.find((s) => s.name === 'Marie')!
    expect(marie).toMatchObject({ targets: 2, planned: 3, held: 3, missed: 0 }) // Carrefour, Décathlon
    expect(marie.avgInterest).toBeCloseTo((4 + 3 + 4 + 3) / 4)
    const hugo = b.bySalesperson.find((s) => s.name === 'Hugo')!
    expect(hugo).toMatchObject({ planned: 2, held: 1, missed: 1 })
    // classés par rencontres réalisées
    expect(b.bySalesperson[0]!.name).toBe('Marie')
  })

  it('top opportunités : intérêt décroissant, hors « pas intéressé »', () => {
    expect(b.topOpportunities.map((o) => [o.company, o.interest])).toEqual([
      ['Carrefour', 5],
      ['Carrefour', 4],
      ['Leroy Merlin', 4],
      ['Décathlon', 3],
      ['Décathlon', 3],
    ])
    expect(b.topOpportunities.some((o) => o.company === 'Amazon France')).toBe(false)
    expect(b.topOpportunities[0]).toMatchObject({
      owner: 'Hugo',
      priority: 'A',
      nextStep: 'Envoyer le devis',
    })
  })

  it('actions de suivi en attente : relances ouvertes + rencontres « à relancer » sans relance', () => {
    expect(b.pendingActions.map((a) => [a.kind, a.company, a.action, a.dueOn])).toEqual([
      ['followUp', 'Carrefour', 'Envoyer le devis détaillé', '2027-05-20'],
      ['meeting', 'Carrefour', 'Rappeler mardi', null],
      ['meeting', 'Décathlon', null, null],
    ])
  })

  it('un salon vide ne plante pas', () => {
    const empty = computeBilan({
      ...sampleData(),
      targets: [],
      meetings: [],
      notes: [],
      contacts: [],
      followUps: [],
    })
    expect(empty.meetings.rate).toBeNull()
    expect(empty.topOpportunities).toEqual([])
  })

  it('suit les filtres : bilan d’un seul commercial', () => {
    const mine = computeBilan(applyFilters(sampleData(), { ...NO_FILTERS, assigneeIds: ['u3'] }))
    expect(mine.meetings.planned).toBe(2) // Fnac (à voir) et Amazon (pas intéressé)
    expect(mine.meetings.held).toBe(1)
  })
})
