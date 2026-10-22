import { describe, expect, it } from 'vitest'
import type { SyncOp } from '@/db/repositories/sync'
import type { Target, TargetMeeting } from '@/db/schemas/prepare'
import type { MeetingNote } from '@/db/repositories/targets'
import { applyMeetingPatch, overlayMeetingOps, overlayNotes } from './overlay'
import { target } from './test-helpers'

const meeting = (id: string, over: Partial<TargetMeeting> = {}): TargetMeeting => ({
  id,
  plannedAt: '2026-10-20T09:00:00.000Z',
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
  ...over,
})

const withMeetings = (id: string, meetings: TargetMeeting[]): Target => ({
  ...target(id, `Entreprise ${id}`),
  meetings,
})

const upsert = (id: string, targetId: string, plannedAt = '2026-10-21T10:00:00.000Z'): SyncOp => ({
  type: 'meeting.upsert',
  input: {
    id,
    teamId: 't',
    eventId: 'e',
    targetId,
    ownerId: 'moi',
    plannedAt,
    durationMin: 15,
    reminderMin: null,
    auto: true,
  },
})

describe('applyMeetingPatch', () => {
  it('ne change que les champs fournis', () => {
    const m = applyMeetingPatch(meeting('m1', { interest: 2 }), { recontact: true, status: 'done' })
    expect(m).toMatchObject({ interest: 2, recontact: true, status: 'done', news: false })
    expect(applyMeetingPatch(m, { interest: null }).interest).toBeNull()
  })
})

describe('overlayMeetingOps', () => {
  it('sans modification en attente, rend les données telles quelles', () => {
    const targets = [withMeetings('a', [meeting('m1')])]
    expect(overlayMeetingOps(targets, [])).toBe(targets)
    expect(overlayMeetingOps(targets, [{ type: 'note.delete', id: 'n', meetingId: 'm1' }])).toBe(
      targets,
    )
  })

  it('une rencontre créée hors ligne apparaît, puis ses changements s’y ajoutent dans l’ordre', () => {
    const out = overlayMeetingOps(
      [withMeetings('a', []), withMeetings('b', [])],
      [
        upsert('m1', 'a'),
        { type: 'meeting.patch', id: 'm1', patch: { status: 'done' } },
        { type: 'meeting.patch', id: 'm1', patch: { interest: 4, recontact: true } },
      ],
    )
    expect(out[0]!.meetings).toHaveLength(1)
    expect(out[0]!.meetings[0]).toMatchObject({
      id: 'm1',
      status: 'done',
      interest: 4,
      recontact: true,
      autoCreated: true,
    })
    expect(out[1]!.meetings).toEqual([]) // les autres entreprises ne bougent pas
  })

  it('modifie et supprime une rencontre déjà connue', () => {
    const base = [
      withMeetings('a', [meeting('m1'), meeting('m2', { plannedAt: '2026-10-22T09:00:00.000Z' })]),
    ]
    const out = overlayMeetingOps(base, [
      { type: 'meeting.patch', id: 'm1', patch: { news: true } },
      { type: 'meeting.delete', id: 'm2' },
    ])
    expect(out[0]!.meetings.map((m) => [m.id, m.news])).toEqual([['m1', true]])
  })

  it('est rejouable : appliquer deux fois donne le même résultat', () => {
    const ops: SyncOp[] = [
      upsert('m1', 'a'),
      { type: 'meeting.patch', id: 'm1', patch: { status: 'done' } },
    ]
    const once = overlayMeetingOps([withMeetings('a', [])], ops)
    const twice = overlayMeetingOps(once, ops)
    expect(twice[0]!.meetings).toEqual(once[0]!.meetings)
  })

  it('une replanification garde le statut et l’intérêt déjà saisis', () => {
    const out = overlayMeetingOps(
      [withMeetings('a', [meeting('m1', { status: 'done', interest: 5 })])],
      [{ ...upsert('m1', 'a', '2026-11-01T10:00:00.000Z') }],
    )
    expect(out[0]!.meetings[0]).toMatchObject({
      status: 'done',
      interest: 5,
      plannedAt: '2026-11-01T10:00:00.000Z',
    })
  })

  it('ignore un changement sur une rencontre inconnue', () => {
    const base = [withMeetings('a', [])]
    const out = overlayMeetingOps(base, [
      { type: 'meeting.patch', id: 'inconnue', patch: { news: true } },
    ])
    expect(out[0]!.meetings).toEqual([])
  })
})

describe('overlayNotes', () => {
  const note = (
    id: string,
    body: string,
    authorId = 'moi',
    capturedAt = '2026-10-20T10:00:00.000Z',
  ): MeetingNote => ({
    id,
    body,
    authorId,
    capturedAt,
  })
  const upsert = (id: string, body: string, adopt = false, meetingId = 'm1'): SyncOp => ({
    type: 'note.upsert',
    note: {
      id,
      teamId: 't',
      meetingId,
      authorId: 'moi',
      body,
      capturedAt: '2026-10-21T10:00:00.000Z',
      adopt,
    },
  })

  it('ma note écrite hors ligne apparaît ; sans écriture en attente, la liste est inchangée', () => {
    const base = [note('n1', 'd\u2019un coll\u00e8gue', 'paul')]
    expect(overlayNotes(base, [], 'm1')).toEqual(base)
    const out = overlayNotes(base, [upsert('n2', 'Ma note hors ligne')], 'm1')
    expect(out.map((n) => [n.id, n.body])).toEqual([
      ['n1', 'd\u2019un coll\u00e8gue'],
      ['n2', 'Ma note hors ligne'],
    ])
  })

  it('un nouveau texte remplace l\u2019ancien (m\u00eame identifiant), en gardant l\u2019heure d\u2019origine', () => {
    const out = overlayNotes([note('n1', 'ancien')], [upsert('n1', 'corrig\u00e9')], 'm1')
    expect(out).toEqual([note('n1', 'corrig\u00e9')])
  })

  it('une note supprim\u00e9e ne revient pas', () => {
    const out = overlayNotes(
      [note('n1', 'a'), note('n2', 'b', 'paul', '2026-10-20T11:00:00.000Z')],
      [{ type: 'note.delete', id: 'n1', meetingId: 'm1' }],
      'm1',
    )
    expect(out.map((n) => n.id)).toEqual(['n2'])
  })

  it('\u00e9crite sans avoir pu lire l\u2019existante (adopt) : la mienne s\u2019affiche comme corrig\u00e9e, pas en double', () => {
    const out = overlayNotes(
      [note('existante', 'avant')],
      [upsert('nouvelle', 'apr\u00e8s', true)],
      'm1',
    )
    expect(out).toEqual([note('existante', 'apr\u00e8s')])
  })

  it('ne touche pas aux notes des autres rencontres', () => {
    const out = overlayNotes([note('n1', 'a')], [upsert('n9', 'ailleurs', false, 'm2')], 'm1')
    expect(out).toEqual([note('n1', 'a')])
  })

  it('est rejouable : appliquer deux fois donne le m\u00eame r\u00e9sultat', () => {
    const ops = [upsert('n1', 'texte')]
    const once = overlayNotes([], ops, 'm1')
    expect(overlayNotes(once, ops, 'm1')).toEqual(once)
  })
})
