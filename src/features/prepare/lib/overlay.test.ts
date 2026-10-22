import { describe, expect, it } from 'vitest'
import type { SyncOp } from '@/db/repositories/sync'
import type { Target, TargetMeeting } from '@/db/schemas/prepare'
import { applyMeetingPatch, overlayMeetingOps } from './overlay'
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
