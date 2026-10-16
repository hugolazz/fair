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
