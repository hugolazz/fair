import { describe, expect, it } from 'vitest'
import { countActiveFilters, emptyFilters, filterTargets } from './filter'
import { sortTargets } from './sort'
import { target } from './test-helpers'

const data = [
  target('1', 'Carrefour', {
    stand: 'B12',
    industry: 'Distribution',
    priority: 'A',
    tagIds: ['client'],
    assigneeIds: ['u1'],
    goal: 'demo',
  }),
  target('2', 'Décathlon', {
    stand: 'B2',
    industry: 'Sport',
    priority: 'C',
    tagIds: ['prospect'],
    assigneeIds: ['u2'],
  }),
  target('3', 'Zalando', {
    stand: 'A10',
    industry: 'Mode',
    priority: 'B',
    tagIds: ['client', 'veille'],
    assigneeIds: ['u1', 'u2'],
    goal: 'watch',
  }),
  target('4', 'Acme Labs', { stand: '', industry: 'SaaS', priority: null, city: 'Lyon' }),
]
const ids = (ts: { id: string }[]) => ts.map((t) => t.id)

describe('filterTargets', () => {
  it('sans filtre, renvoie tout', () => {
    expect(filterTargets(data, emptyFilters)).toHaveLength(4)
    expect(countActiveFilters(emptyFilters)).toBe(0)
  })
  it('filtre par salon : au moins un des salons choisis', () => {
    const withShows = [
      target('1', 'Carrefour', { tagIds: ['client', 'nrf'] }),
      target('2', 'Décathlon', { tagIds: ['tfr'] }),
      target('3', 'Zalando', { tagIds: ['client'] }),
    ]
    expect(ids(filterTargets(withShows, { ...emptyFilters, showIds: ['nrf'] }))).toEqual(['1'])
    expect(ids(filterTargets(withShows, { ...emptyFilters, showIds: ['nrf', 'tfr'] }))).toEqual([
      '1',
      '2',
    ])
    expect(countActiveFilters({ ...emptyFilters, showIds: ['nrf'] })).toBe(1)
  })
  it('recherche sans casse ni accents, sur le nom, le stand, le secteur et la ville', () => {
    expect(ids(filterTargets(data, { ...emptyFilters, search: 'DECATHLON' }))).toEqual(['2'])
    expect(ids(filterTargets(data, { ...emptyFilters, search: 'b12' }))).toEqual(['1'])
    expect(ids(filterTargets(data, { ...emptyFilters, search: 'saas' }))).toEqual(['4'])
    expect(ids(filterTargets(data, { ...emptyFilters, search: 'lyon' }))).toEqual(['4'])
  })
  it('exige tous les mots de la recherche', () => {
    expect(ids(filterTargets(data, { ...emptyFilters, search: 'zalando mode' }))).toEqual(['3'])
    expect(filterTargets(data, { ...emptyFilters, search: 'zalando sport' })).toEqual([])
  })
  it('filtre par priorité, y compris « sans priorité »', () => {
    expect(ids(filterTargets(data, { ...emptyFilters, priorities: ['A', 'B'] }))).toEqual([
      '1',
      '3',
    ])
    expect(ids(filterTargets(data, { ...emptyFilters, priorities: ['none'] }))).toEqual(['4'])
  })
  it('filtre par tag (au moins un)', () => {
    expect(ids(filterTargets(data, { ...emptyFilters, tagIds: ['veille', 'prospect'] }))).toEqual([
      '2',
      '3',
    ])
  })
  it('filtre par assigné, y compris « non assignées »', () => {
    expect(ids(filterTargets(data, { ...emptyFilters, assignee: 'u1' }))).toEqual(['1', '3'])
    expect(ids(filterTargets(data, { ...emptyFilters, assignee: 'none' }))).toEqual(['4'])
  })
  it('filtre par objectif', () => {
    expect(ids(filterTargets(data, { ...emptyFilters, goal: 'demo' }))).toEqual(['1'])
    expect(ids(filterTargets(data, { ...emptyFilters, goal: 'none' }))).toEqual(['2', '4'])
  })
  it('combine les filtres (ET) et les compte', () => {
    const f = {
      ...emptyFilters,
      priorities: ['A' as const, 'B' as const],
      assignee: 'u2',
      search: 'zal',
    }
    expect(ids(filterTargets(data, f))).toEqual(['3'])
    expect(countActiveFilters(f)).toBe(3)
  })
})

describe('sortTargets', () => {
  it('trie par priorité A→C, sans priorité en dernier, puis par nom', () => {
    expect(ids(sortTargets(data, { key: 'priority', dir: 'asc' }))).toEqual(['1', '3', '2', '4'])
  })
  it('garde les valeurs vides en dernier même en ordre décroissant', () => {
    expect(ids(sortTargets(data, { key: 'priority', dir: 'desc' }))).toEqual(['2', '3', '1', '4'])
  })
  it('trie les stands de façon naturelle (B2 avant B12)', () => {
    expect(ids(sortTargets(data, { key: 'stand', dir: 'asc' }))).toEqual(['3', '2', '1', '4'])
  })
  it('trie les noms sans tenir compte des accents ni de la casse', () => {
    const r = sortTargets([target('a', 'élan'), target('b', 'Zed'), target('c', 'Dax')], {
      key: 'name',
      dir: 'asc',
    })
    expect(ids(r)).toEqual(
      ['c', 'a', 'b'].sort((x, y) => ['c', 'a', 'b'].indexOf(x) - ['c', 'a', 'b'].indexOf(y)),
    )
  })
  it('trie par assigné (nom) et par prochain rendez-vous', () => {
    const names: Record<string, string> = { u1: 'Zoé', u2: 'Alice' }
    expect(ids(sortTargets(data, { key: 'assignee', dir: 'asc' }, (u) => names[u]!))).toEqual([
      '2',
      '3',
      '1',
      '4',
    ])
    const withMeetings = [
      target('x', 'X', {
        meetings: [
          {
            id: 'm1',
            plannedAt: '2027-05-12T14:00:00Z',
            durationMin: 15,
            reminderMin: null,
            ownerId: 'u1',
            status: 'to_see',
            interest: null,
            nextStep: '',
            recontact: false,
            news: false,
          },
        ],
      }),
      target('y', 'Y', {
        meetings: [
          {
            id: 'm2',
            plannedAt: '2027-05-12T09:00:00Z',
            durationMin: 15,
            reminderMin: null,
            ownerId: 'u1',
            status: 'to_see',
            interest: null,
            nextStep: '',
            recontact: false,
            news: false,
          },
        ],
      }),
      target('z', 'Z'),
    ]
    expect(ids(sortTargets(withMeetings, { key: 'meeting', dir: 'asc' }))).toEqual(['y', 'x', 'z'])
  })
  it('ne modifie pas le tableau d’origine', () => {
    const copy = [...data]
    sortTargets(data, { key: 'name', dir: 'desc' })
    expect(data).toEqual(copy)
  })
})
