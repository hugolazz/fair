import { describe, expect, it } from 'vitest'
import { computeBilan, isUnplanned } from '@shared/exports/bilan.ts'
import { memberNames } from '@shared/exports/select.ts'
import { sampleData } from './fixtures'

describe('bilan du salon', () => {
  const b = computeBilan(sampleData())

  it('entreprises rencontrées : au moins une rencontre réalisée (vu, à relancer, pas intéressé)', () => {
    expect(b.targets).toBe(6)
    expect(b.targetsMet).toBe(4) // Carrefour, Décathlon, Amazon (pas intéressé = rencontré), Leroy Merlin
  })

  it('manquées : entreprises assignées restées sans aucune activité', () => {
    // Zalando (rencontre marquée manquée) et Fnac Darty (rencontre jamais traitée) ; Leroy Merlin n'est assignée à
    // personne, donc jamais « manquée ».
    expect(b.missed).toBe(2)
  })

  it('imprévues : ajoutées à la main pendant le salon, pas avant, pas par un import', () => {
    // Leroy Merlin (saisie le 12/05) ; Zalando, saisie à la main le 20/04, n'en est pas une.
    expect(b.unplanned).toBe(1)
  })

  it('répartition par priorité', () => {
    expect(b.byPriority.find((p) => p.priority === 'A')).toEqual({
      priority: 'A',
      targets: 2,
      met: 2,
      missed: 0,
    })
    expect(b.byPriority.find((p) => p.priority === 'C')).toEqual({
      priority: 'C',
      targets: 1,
      met: 0,
      missed: 1,
    })
    expect(b.byPriority.find((p) => p.priority === 'none')).toMatchObject({
      targets: 1,
      met: 0,
      missed: 1,
    })
  })

  it('répartition par commercial', () => {
    const marie = b.bySalesperson.find((s) => s.name === 'Marie')!
    // Assignée à Carrefour et Décathlon ; elle a rencontré 3 entreprises (dont Leroy Merlin, imprévue).
    expect(marie).toMatchObject({ targets: 2, met: 3, missed: 0 })
    expect(marie.avgInterest).toBeCloseTo((4 + 3 + 4 + 3) / 4)
    expect(b.bySalesperson.find((s) => s.name === 'Hugo')).toMatchObject({
      targets: 2,
      met: 1,
      missed: 1, // Zalando
    })
    // classés par entreprises rencontrées
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
    expect(empty).toMatchObject({ targets: 0, targetsMet: 0, missed: 0, unplanned: 0 })
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

describe('rencontre imprévue : détection d’une entreprise ajoutée à la main pendant le salon', () => {
  const event = sampleData().event // 12 et 13 mai 2027, fuseau de Paris
  const added = (addedAt: string | null, imported = false) =>
    ({ imported, addedAt }) as Parameters<typeof isUnplanned>[0]

  it('à la main pendant les jours du salon : oui', () => {
    expect(isUnplanned(added('2027-05-12T08:00:00.000Z'), event)).toBe(true)
    expect(isUnplanned(added('2027-05-13T20:00:00.000Z'), event)).toBe(true)
  })

  it('avant ou après le salon : non (pas de faux positif pour une saisie de préparation)', () => {
    expect(isUnplanned(added('2027-05-11T09:00:00.000Z'), event)).toBe(false)
    expect(isUnplanned(added('2027-05-14T09:00:00.000Z'), event)).toBe(false)
    expect(isUnplanned(added('2027-04-01T09:00:00.000Z'), event)).toBe(false)
  })

  it('un import de fichier n’est jamais une rencontre imprévue, même pendant le salon', () => {
    expect(isUnplanned(added('2027-05-12T08:00:00.000Z', true), event)).toBe(false)
  })

  it('les jours se comptent dans le fuseau du salon, pas en UTC', () => {
    // 11/05 23:30 UTC = 12/05 01:30 à Paris : déjà le salon ; 13/05 22:30 UTC = 14/05 00:30 : déjà fini.
    expect(isUnplanned(added('2027-05-11T23:30:00.000Z'), event)).toBe(true)
    expect(isUnplanned(added('2027-05-13T22:30:00.000Z'), event)).toBe(false)
  })

  it('salon d’un seul jour, ou sans dates, ou date d’ajout inconnue', () => {
    expect(isUnplanned(added('2027-05-12T09:00:00.000Z'), { ...event, endsOn: null })).toBe(true)
    expect(isUnplanned(added('2027-05-13T09:00:00.000Z'), { ...event, endsOn: null })).toBe(false)
    expect(isUnplanned(added('2027-05-12T09:00:00.000Z'), { ...event, startsOn: null })).toBe(false)
    expect(isUnplanned(added(null), event)).toBe(false)
  })
})
