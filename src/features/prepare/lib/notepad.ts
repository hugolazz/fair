import type { TargetMeeting } from '@/db/schemas/prepare'

/**
 * Rencontre sur laquelle les notes sont prises : celle du commercial, de préférence en cours, sinon la prochaine
 * non terminée, sinon la dernière. `undefined` = aucune : elle sera créée à la première note.
 */
export function currentMeeting(
  meetings: readonly TargetMeeting[],
  meId: string,
): TargetMeeting | undefined {
  const mine = meetings.filter((m) => m.ownerId === meId)
  return (
    mine.find((m) => m.status === 'in_progress') ??
    mine.find((m) => m.status === 'to_see') ??
    mine[mine.length - 1]
  )
}

/**
 * Une rencontre créée toute seule par le bloc-notes, dont on a retiré tout ce qu'on y avait mis (note, intérêt, cases,
 * contact, prochaine étape), n'a plus de raison d'exister : sa date disparaît des listes. Un rendez-vous planifié à la
 * main (`autoCreated` faux) n'est jamais concerné.
 */
export function isEmptyAutoMeeting(
  m: Pick<TargetMeeting, 'autoCreated' | 'nextStep'>,
  state: {
    interest: number | null
    recontact: boolean
    news: boolean
    contactAttached: boolean
    noteCount: number
  },
): boolean {
  return (
    m.autoCreated &&
    state.interest === null &&
    !state.recontact &&
    !state.news &&
    !state.contactAttached &&
    m.nextStep.trim() === '' &&
    state.noteCount === 0
  )
}
