import { describe, expect, it } from 'vitest'
import type { TargetMeeting } from '@/db/schemas/prepare'
import { target } from './test-helpers'
import { buildTeamRows, filterTeamRows } from './team-view'

const meeting = (id: string, ownerId: string, o: Partial<TargetMeeting> = {}): TargetMeeting => ({
  id,
  plannedAt: '2026-10-20T09:00:00Z',
  durationMin: 15,
  reminderMin: null,
  ownerId,
  status: 'to_see',
  interest: null,
  nextStep: '',
  recontact: false,
  news: false,
  autoCreated: false,
  contactId: null,
  ...o,
})

const targets = [
  target('1', 'Acme', {
    assigneeIds: ['marie'],
    meetings: [meeting('m1', 'marie', { status: 'done', interest: 4, nextStep: 'Envoyer devis' })],
  }),
  target('2', 'Bolt', {
    assigneeIds: ['marie', 'paul'],
    meetings: [meeting('m2', 'marie', { status: 'done' })],
  }),
  target('3', 'Cyan', { assigneeIds: ['paul'], meetings: [meeting('m3', 'paul')] }),
  target('4', 'Dune'),
]

describe('buildTeamRows', () => {
  const rows = buildTeamRows(targets)
  const byName = (n: string) => rows.find((r) => r.target.name === n)!

  it('ignore les entreprises sans commercial ni rendez-vous', () => {
    expect(rows.map((r) => r.target.name)).not.toContain('Dune')
  })
  it('sépare ceux qui ont rencontré de ceux qui restent à voir', () => {
    expect(byName('Bolt').metBy).toEqual(['marie'])
    expect(byName('Bolt').pending).toEqual(['paul'])
    expect(byName('Cyan').metBy).toEqual([])
    expect(byName('Cyan').pending).toEqual(['paul'])
  })
  it('garde l’intérêt et la prochaine étape de la rencontre', () => {
    expect(byName('Acme').bestInterest).toBe(4)
    expect(byName('Acme').followUps).toEqual([{ ownerId: 'marie', nextStep: 'Envoyer devis' }])
  })
  it('signale le risque de doublon quand un collègue vise une entreprise déjà vue', () => {
    expect(byName('Bolt').duplicateRisk).toBe(true)
    expect(byName('Acme').duplicateRisk).toBe(false)
    expect(byName('Cyan').duplicateRisk).toBe(false)
  })
  it('met les doublons possibles en tête', () => {
    expect(rows[0]!.target.name).toBe('Bolt')
  })
  it('un rendez-vous seulement planifié ne compte pas comme rencontre', () => {
    expect(byName('Cyan').metBy).toHaveLength(0)
  })
})

describe('filterTeamRows', () => {
  const rows = buildTeamRows(targets)
  const names = (r: typeof rows) => r.map((x) => x.target.name).sort()

  it('filtre par état', () => {
    expect(names(filterTeamRows(rows, 'met', '', null))).toEqual(['Acme', 'Bolt'])
    expect(names(filterTeamRows(rows, 'notMet', '', null))).toEqual(['Cyan'])
    expect(names(filterTeamRows(rows, 'toFollowUp', '', null))).toEqual(['Acme'])
    expect(names(filterTeamRows(rows, 'duplicateRisk', '', null))).toEqual(['Bolt'])
  })
  it('filtre par commercial et par recherche', () => {
    expect(names(filterTeamRows(rows, 'all', '', 'paul'))).toEqual(['Bolt', 'Cyan'])
    expect(names(filterTeamRows(rows, 'all', 'acm', null))).toEqual(['Acme'])
  })
})
