import { describe, expect, it } from 'vitest'
import type { TargetMeeting } from '@/db/schemas/prepare'
import { currentMeeting } from './notepad'

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
