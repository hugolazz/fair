import type { Target, TargetMeeting } from '@/db/schemas/prepare'

// Valeurs des colonnes supplémentaires du tableau qui se déduisent des rencontres de l'entreprise à ce salon.

/** La rencontre la plus récente (date de rendez-vous) parmi celles qui satisfont `keep`. */
function latest(
  meetings: readonly TargetMeeting[],
  keep: (m: TargetMeeting) => boolean,
): TargetMeeting | undefined {
  return meetings.filter(keep).sort((a, b) => b.plannedAt.localeCompare(a.plannedAt))[0]
}

/** Dernier intérêt renseigné (1 à 5) ; `null` si aucune rencontre n'en a. */
export function interestOf(t: Target): number | null {
  return latest(t.meetings, (m) => m.interest !== null)?.interest ?? null
}

/** Statut de la rencontre la plus récente ; `null` sans rencontre. */
export function statusOf(t: Target): string | null {
  return latest(t.meetings, () => true)?.status ?? null
}

/** Vrai si une rencontre de l'entreprise à ce salon est à recontacter. */
export const recontactOf = (t: Target): boolean => t.meetings.some((m) => m.recontact)

/** Vrai si une rencontre de l'entreprise à ce salon a la case optionnelle (« Actualité ? ») cochée. */
export const newsOf = (t: Target): boolean => t.meetings.some((m) => m.news)
