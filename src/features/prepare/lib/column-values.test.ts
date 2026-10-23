import { describe, expect, it } from 'vitest'
import type { Target, TargetMeeting } from '@/db/schemas/prepare'
import { interestOf, newsOf, recontactOf, statusOf } from './column-values'

const meeting = (over: Partial<TargetMeeting>): TargetMeeting => ({
  id: 'm',
  plannedAt: '2027-05-12T10:00:00.000Z',
  durationMin: 15,
  reminderMin: null,
  ownerId: 'u',
  status: 'done',
  interest: null,
  nextStep: '',
  recontact: false,
  news: false,
  autoCreated: false,
  contactId: null,
  ...over,
})
const target = (meetings: TargetMeeting[]) => ({ meetings }) as unknown as Target

describe('valeurs des colonnes déduites des rencontres', () => {
  it('sans rencontre : tout est vide', () => {
    const t = target([])
    expect(interestOf(t)).toBeNull()
    expect(statusOf(t)).toBeNull()
    expect(recontactOf(t)).toBe(false)
    expect(newsOf(t)).toBe(false)
  })

  it('l’intérêt est le dernier renseigné ; une rencontre plus récente sans intérêt ne l’efface pas', () => {
    const t = target([
      meeting({ id: 'a', plannedAt: '2027-05-12T09:00:00.000Z', interest: 2 }),
      meeting({ id: 'b', plannedAt: '2027-05-12T11:00:00.000Z', interest: 4 }),
      meeting({ id: 'c', plannedAt: '2027-05-13T09:00:00.000Z', interest: null }),
    ])
    expect(interestOf(t)).toBe(4)
  })

  it('le statut est celui de la rencontre la plus récente', () => {
    const t = target([
      meeting({ id: 'a', plannedAt: '2027-05-12T09:00:00.000Z', status: 'to_see' }),
      meeting({ id: 'b', plannedAt: '2027-05-13T09:00:00.000Z', status: 'missed' }),
    ])
    expect(statusOf(t)).toBe('missed')
  })

  it('« à recontacter » et la case optionnelle valent oui dès qu’une rencontre les a cochées', () => {
    const t = target([meeting({ id: 'a' }), meeting({ id: 'b', recontact: true, news: true })])
    expect(recontactOf(t)).toBe(true)
    expect(newsOf(t)).toBe(true)
  })
})
