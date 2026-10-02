import { describe, expect, it } from 'vitest'
import type { LocalAssignee, LocalCompany, LocalEventCompany, LocalMeeting } from '@/db/local/db'
import {
  buildFieldRows,
  countByScope,
  defaultFilters,
  filterField,
  isHappeningNow,
  sortNow,
} from './list'

const company = (id: string, name: string, industry = ''): LocalCompany =>
  ({
    id,
    team_id: 't',
    name,
    name_normalized: name.toLowerCase(),
    industry,
    city: null,
    deleted_at: null,
  }) as LocalCompany
const target = (
  id: string,
  companyId: string,
  o: Partial<LocalEventCompany> = {},
): LocalEventCompany =>
  ({
    id,
    team_id: 't',
    event_id: 'e',
    company_id: companyId,
    stand_label: null,
    priority: null,
    deleted_at: null,
    ...o,
  }) as LocalEventCompany
const mine = (targetId: string): LocalAssignee => ({
  event_company_id: targetId,
  user_id: 'me',
  event_id: 'e',
  team_id: 't',
  deleted_at: null,
})
const meeting = (id: string, targetId: string, o: Partial<LocalMeeting> = {}): LocalMeeting =>
  ({
    id,
    team_id: 't',
    event_id: 'e',
    event_company_id: targetId,
    owner_id: 'me',
    status: 'to_see',
    deleted_at: null,
    planned_at: null,
    interest: null,
    ...o,
  }) as LocalMeeting

const companies = [
  company('c1', 'Carrefour', 'Retail'),
  company('c2', 'Décathlon', 'Sport'),
  company('c3', 'Zalando', 'Mode'),
  company('c4', 'Acme'),
]
const targets = [
  target('t1', 'c1', { priority: 'B', stand_label: 'B12' }),
  target('t2', 'c2', { priority: 'A', stand_label: 'B2' }),
  target('t3', 'c3', { priority: 'A', stand_label: 'A10' }),
  target('t4', 'c4'),
]
const now = new Date('2027-05-12T10:00:00Z')
const rows = (extra: Partial<Parameters<typeof buildFieldRows>[0]> = {}) =>
  buildFieldRows({
    targets,
    companies,
    assignees: [mine('t3')],
    meetings: [],
    userId: 'me',
    ...extra,
  })

describe('buildFieldRows', () => {
  it('joint cible et entreprise, marque mes cibles, statut « à voir » par défaut', () => {
    const r = rows()
    expect(r.map((x) => x.name)).toEqual(['Carrefour', 'Décathlon', 'Zalando', 'Acme'])
    expect(r.find((x) => x.id === 't3')).toMatchObject({
      mine: true,
      status: 'to_see',
      stand: 'A10',
    })
    expect(r.find((x) => x.id === 't1')!.mine).toBe(false)
  })
  it('prend le statut de MA rencontre la plus récente, pas celle d’un collègue', () => {
    const r = rows({
      meetings: [
        meeting('01', 't1', { status: 'done' }),
        meeting('02', 't1', { status: 'follow_up', interest: 4 }),
        meeting('03', 't2', { status: 'done', owner_id: 'marie' }),
      ],
    })
    expect(r.find((x) => x.id === 't1')).toMatchObject({ status: 'follow_up', interest: 4 })
    expect(r.find((x) => x.id === 't2')!.status).toBe('to_see')
  })
  it('écarte les lignes supprimées', () => {
    const r = rows({
      targets: [...targets, target('t5', 'c1', { deleted_at: 'x' })],
      meetings: [meeting('01', 't1', { status: 'done', deleted_at: 'x' })],
    })
    expect(r).toHaveLength(4)
    expect(r.find((x) => x.id === 't1')!.status).toBe('to_see')
  })
})

describe('filterField', () => {
  const all = rows({
    meetings: [
      meeting('01', 't1', { status: 'done' }),
      meeting('02', 't2', { status: 'follow_up' }),
      meeting('03', 't4', { status: 'not_interested' }),
    ],
  })
  it('par défaut : seulement ce qui reste à voir', () => {
    expect(filterField(all, defaultFilters).map((r) => r.id)).toEqual(['t3'])
  })
  it('filtres de statut rapides', () => {
    expect(filterField(all, { ...defaultFilters, scope: 'done' }).map((r) => r.id)).toEqual([
      't1',
      't4',
    ])
    expect(filterField(all, { ...defaultFilters, scope: 'follow_up' }).map((r) => r.id)).toEqual([
      't2',
    ])
    expect(filterField(all, { ...defaultFilters, scope: 'all' })).toHaveLength(4)
  })
  it('« Mes cibles » et « A » se cumulent', () => {
    expect(
      filterField(all, { ...defaultFilters, scope: 'all', mine: true }).map((r) => r.id),
    ).toEqual(['t3'])
    expect(
      filterField(all, { ...defaultFilters, scope: 'all', onlyA: true }).map((r) => r.id),
    ).toEqual(['t2', 't3'])
  })
  it('recherche instantanée sans accents ni casse, sur nom, stand et secteur', () => {
    const s = (search: string) =>
      filterField(all, { ...defaultFilters, scope: 'all', search }).map((r) => r.id)
    expect(s('DECATHLON')).toEqual(['t2'])
    expect(s('b12')).toEqual(['t1'])
    expect(s('mode')).toEqual(['t3'])
    expect(s('sport b2')).toEqual(['t2'])
  })
  it('compte par statut pour les pastilles', () => {
    expect(countByScope(all)).toEqual({ todo: 1, done: 2, follow_up: 1, all: 4 })
  })
})

describe('sortNow — « à voir maintenant »', () => {
  it('cibles A d’abord, puis B, C, sans priorité', () => {
    expect(sortNow(rows(), now).map((r) => r.id)).toEqual(['t3', 't2', 't1', 't4'])
  })
  it('à priorité égale, mes cibles avant les autres', () => {
    expect(
      sortNow(rows(), now)
        .slice(0, 2)
        .map((r) => r.id),
    ).toEqual(['t3', 't2']) // t3 est à moi
  })
  it('un rendez-vous imminent passe devant tout, même une cible A', () => {
    const r = rows({ meetings: [meeting('01', 't4', { planned_at: '2027-05-12T10:20:00Z' })] })
    expect(sortNow(r, now)[0]!.id).toBe('t4')
  })
  it('ignore un rendez-vous trop lointain ou déjà passé depuis longtemps', () => {
    expect(isHappeningNow('2027-05-12T12:00:00Z', now)).toBe(false)
    expect(isHappeningNow('2027-05-12T09:00:00Z', now)).toBe(false)
    expect(isHappeningNow('2027-05-12T09:50:00Z', now)).toBe(true)
    expect(isHappeningNow(null, now)).toBe(false)
  })
  it('classe les stands dans l’ordre naturel (B2 avant B12)', () => {
    const r = rows({
      targets: [
        target('a', 'c1', { priority: 'A', stand_label: 'B12' }),
        target('b', 'c2', { priority: 'A', stand_label: 'B2' }),
      ],
      assignees: [],
    })
    expect(sortNow(r, now).map((x) => x.id)).toEqual(['b', 'a'])
  })
})
