import { localDay } from './format.ts'
import { memberNames } from './select.ts'
import {
  HELD_STATUSES,
  type ExportData,
  type MeetingRec,
  type MeetingStatus,
  type Priority,
  type TargetRec,
} from './types.ts'

// Bilan du salon : calculs purs sur les données d'export (donc sur les mêmes filtres que les fichiers).

export type PriorityRow = {
  priority: Priority | 'none'
  targets: number
  /** Entreprises avec au moins une rencontre réalisée. */
  met: number
  /** Entreprises assignées restées sans aucune activité. */
  missed: number
}

export type SalespersonRow = {
  userId: string
  name: string
  /** Entreprises qui lui sont assignées. */
  targets: number
  /** Entreprises distinctes qu'il a rencontrées (une de ses rencontres a eu lieu). */
  met: number
  /** Parmi ses entreprises assignées : celles restées sans aucune activité. */
  missed: number
  avgInterest: number | null
}

export type Opportunity = {
  meetingId: string
  company: string
  stand: string | null
  priority: Priority | null
  owner: string
  interest: number
  status: MeetingStatus
  nextStep: string | null
}

export type PendingAction = {
  id: string
  kind: 'meeting' | 'followUp'
  company: string
  owner: string
  /** Prochaine étape / relance à faire. */
  action: string | null
  dueOn: string | null
}

export type Bilan = {
  targets: number
  /** Entreprises avec au moins une rencontre réalisée (vu, à relancer, pas intéressé). */
  targetsMet: number
  /** « Manquées » : entreprises assignées à un commercial et restées sans aucune activité (aucune rencontre réalisée). */
  missed: number
  /** « Imprévues » : entreprises ajoutées à la main (hors import) pendant les jours du salon. */
  unplanned: number
  byPriority: PriorityRow[]
  bySalesperson: SalespersonRow[]
  topOpportunities: Opportunity[]
  pendingActions: PendingAction[]
}

const PRIORITY_RANK: Record<string, number> = { A: 0, B: 1, C: 2, none: 3 }
const isHeld = (m: MeetingRec) => HELD_STATUSES.includes(m.status)

export const OPPORTUNITIES_LIMIT = 10

/**
 * Une entreprise « imprévue » : ajoutée à la main (`source = 'manual'`, ni import ni copie de salon) **pendant les jours du salon**, dans le
 * fuseau du salon. Une saisie faite avant le salon, ou une participation importée, n'en est jamais une ; sans dates de
 * salon, rien n'est détecté.
 */
export function isUnplanned(t: TargetRec, event: ExportData['event']): boolean {
  if (t.source !== 'manual' || !event.startsOn) return false
  const day = localDay(t.addedAt, event.timezone)
  return day !== null && day >= event.startsOn && day <= (event.endsOn ?? event.startsOn)
}

export function computeBilan(data: ExportData): Bilan {
  const owner = memberNames(data)
  const targetById = new Map(data.targets.map((t) => [t.id, t]))
  const meetings = data.meetings.filter((m) => targetById.has(m.targetId))
  const metTargets = new Set(meetings.filter(isHeld).map((m) => m.targetId))
  // Manquée : assignée à un commercial, sans aucune activité (aucune rencontre réalisée par personne).
  const isMissed = (t: TargetRec) => t.assigneeIds.length > 0 && !metTargets.has(t.id)

  const byPriority: PriorityRow[] = (['A', 'B', 'C', 'none'] as const).map((p) => {
    const ts = data.targets.filter((t) => (t.priority ?? 'none') === p)
    return {
      priority: p,
      targets: ts.length,
      met: ts.filter((t) => metTargets.has(t.id)).length,
      missed: ts.filter(isMissed).length,
    }
  })

  const userIds = new Set<string>([
    ...meetings.map((m) => m.ownerId),
    ...data.targets.flatMap((t) => t.assigneeIds),
  ])
  const bySalesperson: SalespersonRow[] = [...userIds]
    .map((userId) => {
      const held = meetings.filter((m) => m.ownerId === userId && isHeld(m))
      const interests = held.map((m) => m.interest).filter((i): i is number => i !== null)
      const assigned = data.targets.filter((t) => t.assigneeIds.includes(userId))
      return {
        userId,
        name: owner(userId),
        targets: assigned.length,
        met: new Set(held.map((m) => m.targetId)).size,
        missed: assigned.filter(isMissed).length,
        avgInterest: interests.length
          ? interests.reduce((a, b) => a + b, 0) / interests.length
          : null,
      }
    })
    .sort((a, b) => b.met - a.met || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))

  const topOpportunities: Opportunity[] = meetings
    .filter((m) => isHeld(m) && m.status !== 'not_interested' && m.interest !== null)
    .map((m) => ({ m, t: targetById.get(m.targetId)! }))
    .sort(
      (a, b) =>
        b.m.interest! - a.m.interest! ||
        (PRIORITY_RANK[a.t.priority ?? 'none'] ?? 3) -
          (PRIORITY_RANK[b.t.priority ?? 'none'] ?? 3) ||
        (b.m.plannedAt ?? '').localeCompare(a.m.plannedAt ?? '') ||
        a.t.name.localeCompare(b.t.name, 'fr', { sensitivity: 'base' }),
    )
    .slice(0, OPPORTUNITIES_LIMIT)
    .map(({ m, t }) => ({
      meetingId: m.id,
      company: t.name,
      stand: t.stand,
      priority: t.priority,
      owner: owner(m.ownerId),
      interest: m.interest!,
      status: m.status,
      nextStep: m.nextStep,
    }))

  const meetingById = new Map(meetings.map((m) => [m.id, m]))
  const withOpenFollowUp = new Set(
    data.followUps.filter((u) => u.status === 'todo' && u.meetingId).map((u) => u.meetingId!),
  )
  const pendingActions: PendingAction[] = [
    ...meetings
      .filter((m) => m.status === 'follow_up' && !withOpenFollowUp.has(m.id))
      .map((m) => ({
        id: m.id,
        kind: 'meeting' as const,
        company: targetById.get(m.targetId)!.name,
        owner: owner(m.ownerId),
        action: m.nextStep,
        dueOn: null,
      })),
    ...data.followUps
      .filter((u) => u.status === 'todo' && u.meetingId && meetingById.has(u.meetingId))
      .map((u) => {
        const m = meetingById.get(u.meetingId!)!
        return {
          id: u.id,
          kind: 'followUp' as const,
          company: targetById.get(m.targetId)!.name,
          owner: owner(u.assigneeId ?? m.ownerId),
          action: u.body ?? m.nextStep,
          dueOn: u.dueOn,
        }
      }),
  ].sort(
    (a, b) =>
      (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') ||
      a.company.localeCompare(b.company, 'fr', { sensitivity: 'base' }),
  )

  return {
    targets: data.targets.length,
    targetsMet: metTargets.size,
    missed: data.targets.filter(isMissed).length,
    unplanned: data.targets.filter((t) => isUnplanned(t, data.event)).length,
    byPriority,
    bySalesperson,
    topOpportunities,
    pendingActions,
  }
}
