import { HELD_STATUSES } from '@shared/exports/types.ts'
import type { Target } from '@/db/schemas/prepare'

/** Statuts qui comptent comme « rencontrée » : la rencontre a eu lieu (ou est en cours). */
const MET_STATUSES = new Set<string>([...HELD_STATUSES, 'in_progress'])

export type TeamRow = {
  target: Target
  /** Commerciaux ayant rencontré l'entreprise (sans doublon, dans l'ordre des rendez-vous). */
  metBy: string[]
  /** Commerciaux assignés qui n'ont pas encore rencontré l'entreprise. */
  pending: string[]
  /** Prochaines étapes à relancer, avec leur auteur. */
  followUps: { ownerId: string; nextStep: string }[]
  /** Intérêt le plus élevé constaté. */
  bestInterest: number | null
  /** Plusieurs commerciaux sur la même entreprise : risque de relance en double. */
  duplicateRisk: boolean
}

export type TeamFilter = 'all' | 'met' | 'toFollowUp' | 'duplicateRisk' | 'notMet'

const unique = (values: string[]) => [...new Set(values)]

/** Une ligne par entreprise qui a au moins un commercial assigné ou un rendez-vous. */
export function buildTeamRows(targets: readonly Target[]): TeamRow[] {
  const rows: TeamRow[] = []
  for (const target of targets) {
    if (target.assigneeIds.length === 0 && target.meetings.length === 0) continue
    const met = target.meetings.filter((m) => MET_STATUSES.has(m.status))
    const metBy = unique(met.map((m) => m.ownerId))
    const pending = target.assigneeIds.filter((u) => !metBy.includes(u))
    const followUps = met
      .filter((m) => m.nextStep.trim() !== '')
      .map((m) => ({ ownerId: m.ownerId, nextStep: m.nextStep.trim() }))
    const interests = met.map((m) => m.interest).filter((i): i is number => i !== null)
    const involved = unique([...metBy, ...target.assigneeIds])
    rows.push({
      target,
      metBy,
      pending,
      followUps,
      bestInterest: interests.length ? Math.max(...interests) : null,
      // Doublon possible : deux personnes l'ont vue, ou quelqu'un d'autre vise encore une entreprise déjà vue.
      duplicateRisk: involved.length > 1 && (metBy.length > 0 || target.assigneeIds.length > 1),
    })
  }
  return rows.sort(
    (a, b) =>
      Number(b.duplicateRisk) - Number(a.duplicateRisk) ||
      b.metBy.length - a.metBy.length ||
      a.target.name.localeCompare(b.target.name, 'fr'),
  )
}

export function filterTeamRows(
  rows: readonly TeamRow[],
  filter: TeamFilter,
  search: string,
  userId: string | null,
): TeamRow[] {
  const q = search.trim().toLowerCase()
  return rows.filter((r) => {
    if (q && !r.target.searchKey.includes(q)) return false
    if (userId && !r.metBy.includes(userId) && !r.target.assigneeIds.includes(userId)) return false
    switch (filter) {
      case 'met':
        return r.metBy.length > 0
      case 'notMet':
        return r.metBy.length === 0
      case 'toFollowUp':
        return r.followUps.length > 0
      case 'duplicateRisk':
        return r.duplicateRisk
      default:
        return true
    }
  })
}
