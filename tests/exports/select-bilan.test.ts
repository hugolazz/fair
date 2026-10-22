import { describe, expect, it } from 'vitest'
import { computeBilan } from '@shared/exports/bilan.ts'
import { memberNames } from '@shared/exports/select.ts'
import { sampleData } from './fixtures'

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
})

describe('auteur disparu (compte supprimé ou départ de l’équipe)', () => {
  it('s’affiche « Ancien membre », jamais « null » ni un identifiant', () => {
    const name = memberNames(sampleData())
    expect(name('')).toBe('Ancien membre')
    expect(name(null)).toBe('Ancien membre')
    expect(name('00000000-0000-0000-0000-000000000000')).toBe('Ancien membre')
  })
})
