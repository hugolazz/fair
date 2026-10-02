import { memberNames } from './select.ts'
import {
  HELD_STATUSES,
  MEETING_STATUSES,
  MISSED_STATUSES,
  type ExportData,
  type MeetingRec,
  type MeetingStatus,
  type Priority,
} from './types.ts'

// Bilan du salon : calculs purs sur les données d'export (donc sur les mêmes filtres que les fichiers).

export type PriorityRow = {
  priority: Priority | 'none'
  targets: number
  /** Entreprises avec au moins une rencontre réalisée. */
  met: number
  meetings: number
  held: number
}

export type SalespersonRow = {
  userId: string
  name: string
  targets: number
  planned: number
  held: number
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
  targetsMet: number
  meetings: {
    /** Rencontres prévues (planifiées à l'avance). */
    planned: number
    /** Parmi les prévues : réalisées (vu, à relancer, pas intéressé). */
    held: number
    /** Parmi les prévues : manquées ou écartées. */
    missed: number
    /** Parmi les prévues : pas encore traitées. */
    pending: number
    /** Rencontres imprévues (hors planning). */
    unplanned: number
    /** Taux de réalisation en % (réalisées / prévues), null sans rencontre prévue. */
    rate: number | null
  }
  byStatus: { status: MeetingStatus; count: number }[]
  byPriority: PriorityRow[]
  bySalesperson: SalespersonRow[]
  topOpportunities: Opportunity[]
  pendingActions: PendingAction[]
}

const PRIORITY_RANK: Record<string, number> = { A: 0, B: 1, C: 2, none: 3 }
const isHeld = (m: MeetingRec) => HELD_STATUSES.includes(m.status)
const isMissed = (m: MeetingRec) => MISSED_STATUSES.includes(m.status)

export const OPPORTUNITIES_LIMIT = 10

export function computeBilan(data: ExportData): Bilan {
  const owner = memberNames(data)
  const targetById = new Map(data.targets.map((t) => [t.id, t]))
  const meetings = data.meetings.filter((m) => targetById.has(m.targetId))
  const planned = meetings.filter((m) => !m.unplanned)
  const held = planned.filter(isHeld).length
  const missed = planned.filter(isMissed).length

  const metTargets = new Set(meetings.filter(isHeld).map((m) => m.targetId))

  const byPriority: PriorityRow[] = (['A', 'B', 'C', 'none'] as const).map((p) => {
    const ts = data.targets.filter((t) => (t.priority ?? 'none') === p)
    const ids = new Set(ts.map((t) => t.id))
    const ms = meetings.filter((m) => ids.has(m.targetId))
    return {
      priority: p,
      targets: ts.length,
      met: ts.filter((t) => metTargets.has(t.id)).length,
      meetings: ms.length,
      held: ms.filter(isHeld).length,
    }
  })

  const userIds = new Set<string>([
    ...meetings.map((m) => m.ownerId),
    ...data.targets.flatMap((t) => t.assigneeIds),
  ])
  const bySalesperson: SalespersonRow[] = [...userIds]
    .map((userId) => {
      const mine = meetings.filter((m) => m.ownerId === userId)
      const mp = mine.filter((m) => !m.unplanned)
      const interests = mine
        .filter(isHeld)
        .map((m) => m.interest)
        .filter((i): i is number => i !== null)
      return {
        userId,
        name: owner(userId),
        targets: data.targets.filter((t) => t.assigneeIds.includes(userId)).length,
        planned: mp.length,
        held: mp.filter(isHeld).length,
        missed: mp.filter(isMissed).length,
        avgInterest: interests.length
          ? interests.reduce((a, b) => a + b, 0) / interests.length
          : null,
      }
    })
    .sort((a, b) => b.held - a.held || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))

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
    meetings: {
      planned: planned.length,
      held,
      missed,
      pending: planned.length - held - missed,
      unplanned: meetings.length - planned.length,
      rate: planned.length === 0 ? null : Math.round((held / planned.length) * 100),
    },
    byStatus: MEETING_STATUSES.map((status) => ({
      status,
      count: meetings.filter((m) => m.status === status).length,
    })),
    byPriority,
    bySalesperson,
    topOpportunities,
    pendingActions,
  }
}
