import { describe, expect, it } from 'vitest'
import type { TargetMeeting } from '@/db/schemas/prepare'
import { currentMeeting, isEmptyAutoMeeting } from './notepad'

const m = (id: string, ownerId: string, status: string): TargetMeeting => ({
  id,
  plannedAt: '2026-10-20T09:00:00Z',
  durationMin: 15,
  reminderMin: null,
  ownerId,
  status,
  interest: null,
  nextStep: '',
  recontact: false,
  news: false,
  autoCreated: false,
  contactId: null,
})

describe('currentMeeting', () => {
  it('ignore les rencontres des collègues', () => {
    expect(currentMeeting([m('1', 'paul', 'to_see')], 'moi')).toBeUndefined()
  })
  it('préfère la rencontre en cours, puis la prochaine à voir, puis la dernière', () => {
    expect(currentMeeting([m('1', 'moi', 'to_see'), m('2', 'moi', 'in_progress')], 'moi')?.id).toBe(
      '2',
    )
    expect(currentMeeting([m('1', 'moi', 'done'), m('2', 'moi', 'to_see')], 'moi')?.id).toBe('2')
    expect(currentMeeting([m('1', 'moi', 'done'), m('2', 'moi', 'done')], 'moi')?.id).toBe('2')
  })
})

describe('isEmptyAutoMeeting', () => {
  const none = {
    interest: null,
    recontact: false,
    news: false,
    contactAttached: false,
    noteCount: 0,
  }
  const auto = { autoCreated: true, nextStep: '' }

  it('une rencontre du bloc-notes vidée de tout est vide', () => {
    expect(isEmptyAutoMeeting(auto, none)).toBe(true)
  })

  it('la moindre trace la garde : note, intérêt, case, contact ou prochaine étape', () => {
    expect(isEmptyAutoMeeting(auto, { ...none, noteCount: 1 })).toBe(false)
    expect(isEmptyAutoMeeting(auto, { ...none, interest: 3 })).toBe(false)
    expect(isEmptyAutoMeeting(auto, { ...none, recontact: true })).toBe(false)
    expect(isEmptyAutoMeeting(auto, { ...none, news: true })).toBe(false)
    expect(isEmptyAutoMeeting(auto, { ...none, contactAttached: true })).toBe(false)
    expect(isEmptyAutoMeeting({ ...auto, nextStep: ' Rappeler ' }, none)).toBe(false)
  })

  it('un rendez-vous planifié à la main n’est jamais supprimé tout seul', () => {
    expect(isEmptyAutoMeeting({ autoCreated: false, nextStep: '' }, none)).toBe(false)
  })
})
