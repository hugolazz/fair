import { describe, expect, it } from 'vitest'
import { toHistory, type HistoryRow } from '@/db/schemas/prepare'
import { buildIcs, dueReminders } from './ics'
import { findAssignmentConflicts, isContested, myList, rangeSelect, visibleRange } from './misc'
import { target } from './test-helpers'

describe('findAssignmentConflicts', () => {
  const ts = [
    target('1', 'A', { assigneeIds: ['marie'] }),
    target('2', 'B', { assigneeIds: ['moi'] }),
    target('3', 'C', { assigneeIds: ['marie', 'paul'] }),
    target('4', 'D'),
  ]
  it('signale les cibles déjà visées par quelqu’un d’autre', () => {
    const c = findAssignmentConflicts(ts, ['1', '2', '3', '4'], 'moi')
    expect(c.map((x) => [x.target.id, x.others])).toEqual([
      ['1', ['marie']],
      ['3', ['marie', 'paul']],
    ])
  })
  it('ignore les cibles hors sélection, déjà à soi ou libres', () => {
    expect(findAssignmentConflicts(ts, ['2', '4'], 'moi')).toEqual([])
    expect(findAssignmentConflicts(ts, ['1'], 'marie')).toEqual([])
  })
  it('repère une entreprise ciblée par plusieurs commerciaux', () => {
    expect(isContested(ts[2]!)).toBe(true)
    expect(isContested(ts[0]!)).toBe(false)
  })
})

describe('rangeSelect', () => {
  const order = ['a', 'b', 'c', 'd', 'e']
  it('sélectionne la plage dans les deux sens, bornes incluses', () => {
    expect(rangeSelect(order, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangeSelect(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })
  it('gère une ancre absente (liste filtrée entre-temps)', () => {
    expect(rangeSelect(order, 'zz', 'c')).toEqual(['c'])
    expect(rangeSelect(order, 'a', 'zz')).toEqual([])
  })
})

describe('visibleRange', () => {
  it('rend la fenêtre visible plus la marge', () => {
    expect(
      visibleRange({
        scrollTop: 400,
        viewportHeight: 200,
        rowHeight: 40,
        count: 5000,
        overscan: 2,
      }),
    ).toEqual({ start: 8, end: 17 })
  })
  it('borne au début et à la fin de la liste', () => {
    expect(visibleRange({ scrollTop: 0, viewportHeight: 200, rowHeight: 40, count: 3 })).toEqual({
      start: 0,
      end: 3,
    })
    expect(
      visibleRange({ scrollTop: 10_000, viewportHeight: 200, rowHeight: 40, count: 100 }).end,
    ).toBe(100)
  })
  it('ne rend qu’une petite fenêtre sur 5 000 lignes', () => {
    const r = visibleRange({ scrollTop: 80_000, viewportHeight: 700, rowHeight: 40, count: 5000 })
    expect(r.end - r.start).toBeLessThan(40)
  })
})

describe('myList', () => {
  const meet = (iso: string) => [
    {
      id: iso,
      plannedAt: iso,
      durationMin: 15,
      reminderMin: null,
      ownerId: 'moi',
      status: 'to_see',
      interest: null,
      nextStep: '',
      recontact: false,
      news: false,
      autoCreated: false,
      contactId: null,
    },
  ]
  it('ne garde que mes cibles, triées par priorité, rendez-vous puis nom', () => {
    const ts = [
      target('1', 'Zeta', { assigneeIds: ['moi'], priority: 'B' }),
      target('2', 'Alpha', { assigneeIds: ['moi'], priority: 'B' }),
      target('3', 'Autre', { assigneeIds: ['marie'], priority: 'A' }),
      target('4', 'Sans', { assigneeIds: ['moi'] }),
      target('5', 'Prio A', { assigneeIds: ['moi', 'marie'], priority: 'A' }),
      target('6', 'Matin', {
        assigneeIds: ['moi'],
        priority: 'B',
        meetings: meet('2027-05-12T09:00:00Z'),
      }),
    ]
    expect(myList(ts, 'moi').map((t) => t.id)).toEqual(['5', '6', '2', '1', '4'])
  })
})

describe('buildIcs', () => {
  const base = {
    uid: 'abc',
    title: 'RDV Acme, démo',
    start: new Date('2027-05-12T09:30:00Z'),
    durationMin: 20,
    reminderMin: 15,
    now: new Date('2027-05-01T00:00:00Z'),
  }
  it('produit un VEVENT avec dates UTC, durée et rappel', () => {
    const ics = buildIcs({
      ...base,
      location: 'Hall 5, stand B12',
      description: 'Objectif : démo\nApporter le POC',
    })
    expect(ics).toContain('BEGIN:VCALENDAR\r\n')
    expect(ics).toContain('DTSTART:20270512T093000Z\r\n')
    expect(ics).toContain('DTEND:20270512T095000Z\r\n')
    expect(ics).toContain('SUMMARY:RDV Acme\\, démo\r\n')
    expect(ics).toContain('LOCATION:Hall 5\\, stand B12\r\n')
    expect(ics).toContain('DESCRIPTION:Objectif : démo\\nApporter le POC\r\n')
    expect(ics).toContain('TRIGGER:-PT15M\r\n')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })
  it('signe l’exporteur « fair » en minuscules', () => {
    expect(buildIcs(base)).toContain('PRODID:-//fair//')
  })
  it('omet l’alarme sans rappel', () => {
    expect(buildIcs({ ...base, reminderMin: null })).not.toContain('VALARM')
  })
  it('plie les lignes à 75 octets sans couper un caractère', () => {
    const ics = buildIcs({ ...base, description: 'é'.repeat(200) })
    for (const line of ics.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(ics.replace(/\r\n /g, '')).toContain('é'.repeat(200))
  })
})

describe('dueReminders', () => {
  const items = [
    {
      meetingId: 'm1',
      targetId: 't1',
      plannedAt: '2027-05-12T10:00:00Z',
      durationMin: 30,
      reminderMin: 15,
    },
    {
      meetingId: 'm2',
      targetId: 't2',
      plannedAt: '2027-05-12T10:00:00Z',
      durationMin: 30,
      reminderMin: null,
    },
  ]
  it('se déclenche de « début − rappel » à la fin du créneau', () => {
    expect(dueReminders(items, new Date('2027-05-12T09:44:59Z'))).toEqual([])
    expect(dueReminders(items, new Date('2027-05-12T09:45:00Z')).map((i) => i.meetingId)).toEqual([
      'm1',
    ])
    expect(dueReminders(items, new Date('2027-05-12T10:29:00Z')).map((i) => i.meetingId)).toEqual([
      'm1',
    ])
    expect(dueReminders(items, new Date('2027-05-12T10:30:00Z'))).toEqual([])
  })
})

describe('toHistory', () => {
  const row = (
    id: string,
    startsOn: string | null,
    extra: Partial<HistoryRow> = {},
  ): HistoryRow => ({
    id,
    event_id: `ev-${id}`,
    stand_label: 'B1',
    priority: 'A',
    objective: null,
    events: { id: `ev-${id}`, name: `Salon ${id}`, starts_on: startsOn, city: 'Paris' },
    meetings: [],
    notes: [],
    ...extra,
  })
  const withNote = (id: string) => ({
    notes: [{ id: `n-${id}`, body: 'x', captured_at: '2026-01-01T10:00:00Z', deleted_at: null }],
  })
  it('classe les salons du plus récent au plus ancien, sans date en dernier', () => {
    const h = toHistory([
      row('a', '2025-03-01', withNote('a')),
      row('b', '2026-06-01', withNote('b')),
      row('c', null, withNote('c')),
    ])
    expect(h.map((e) => e.eventName)).toEqual(['Salon b', 'Salon a', 'Salon c'])
  })
  it('écarte les salons où rien n’a été enregistré (ni rencontre ni note)', () => {
    const h = toHistory([row('a', '2025-03-01'), row('b', '2026-06-01', withNote('b'))])
    expect(h.map((e) => e.eventName)).toEqual(['Salon b'])
  })
  it('regroupe rencontres et notes, récents d’abord, en écartant les éléments supprimés', () => {
    const n = (id: string, at: string, deleted: string | null = null) => ({
      id,
      body: id,
      captured_at: at,
      deleted_at: deleted,
    })
    const h = toHistory([
      row('a', '2026-06-01', {
        notes: [
          n('n1', '2026-06-01T10:00:00Z'),
          n('n2', '2026-06-02T10:00:00Z'),
          n('n3', '2026-06-03T10:00:00Z', 'x'),
        ],
        meetings: [
          {
            id: 'm1',
            status: 'done',
            temperature: 'hot',
            outcome: 'Intéressé',
            next_step: 'Envoyer devis',
            planned_at: '2026-06-01T09:00:00Z',
            deleted_at: null,
            notes: [n('n4', '2026-06-01T09:30:00Z')],
          },
          {
            id: 'm2',
            status: 'done',
            temperature: null,
            outcome: '',
            next_step: '',
            planned_at: '2026-06-02T09:00:00Z',
            deleted_at: null,
            notes: [],
          },
          {
            id: 'm3',
            status: 'skipped',
            temperature: null,
            outcome: '',
            next_step: '',
            planned_at: null,
            deleted_at: 'x',
            notes: [],
          },
        ],
      }),
    ])
    expect(h[0]!.notes.map((x) => x.id)).toEqual(['n2', 'n1'])
    expect(h[0]!.meetings.map((m) => m.id)).toEqual(['m2', 'm1'])
    expect(h[0]!.meetings[1]).toMatchObject({
      outcome: 'Intéressé',
      nextStep: 'Envoyer devis',
      temperature: 'hot',
    })
    expect(h[0]!.meetings[1]!.notes[0]!.body).toBe('n4')
  })
})
