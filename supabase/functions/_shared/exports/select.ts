import type { ExportData, ExportFilters, MeetingRec } from './types.ts'

const isEmpty = (l: readonly unknown[]) => l.length === 0

/**
 * Applique les filtres d'export et renvoie des données cohérentes (contacts, rencontres, notes et relances
 * suivent les entreprises retenues).
 *
 * - priorité, tags : critères d'entreprise ;
 * - commercial : entreprises qui lui sont assignées OU où il a une rencontre ; seules ses rencontres sont gardées ;
 * - statut : rencontres de ce statut ; « none » garde aussi les entreprises sans aucune rencontre.
 */
export function applyFilters(data: ExportData, f: ExportFilters): ExportData {
  const byTarget = new Map<string, MeetingRec[]>()
  for (const m of data.meetings) byTarget.set(m.targetId, [...(byTarget.get(m.targetId) ?? []), m])

  const ownerOk = (m: MeetingRec) => isEmpty(f.assigneeIds) || f.assigneeIds.includes(m.ownerId)
  const statusOk = (m: MeetingRec) => isEmpty(f.statuses) || f.statuses.includes(m.status)
  const wantsNone = f.statuses.includes('none')

  const keptMeetings: MeetingRec[] = []
  const targets = data.targets.filter((t) => {
    if (!isEmpty(f.priorities) && !f.priorities.includes(t.priority ?? 'none')) return false
    if (!isEmpty(f.tagIds) && !t.tagIds.some((id) => f.tagIds.includes(id))) return false
    const own = (byTarget.get(t.id) ?? []).filter(ownerOk)
    const kept = own.filter(statusOk)
    if (
      !isEmpty(f.assigneeIds) &&
      !t.assigneeIds.some((u) => f.assigneeIds.includes(u)) &&
      own.length === 0
    )
      return false
    if (!isEmpty(f.statuses) && kept.length === 0 && !(wantsNone && own.length === 0)) return false
    keptMeetings.push(...kept)
    return true
  })

  const targetIds = new Set(targets.map((t) => t.id))
  const companyIds = new Set(targets.map((t) => t.companyId))
  const meetingIds = new Set(keptMeetings.map((m) => m.id))
  return {
    ...data,
    targets,
    contacts: data.contacts.filter((c) => c.companyId && companyIds.has(c.companyId)),
    meetings: keptMeetings,
    notes: data.notes.filter((n) =>
      n.meetingId ? meetingIds.has(n.meetingId) : n.targetId ? targetIds.has(n.targetId) : false,
    ),
    followUps: data.followUps.filter((u) => !u.meetingId || meetingIds.has(u.meetingId)),
  }
}

/** Nom d'un membre (ou « — » s'il n'est plus dans l'équipe). */
export function memberNames(data: ExportData): (userId: string | null | undefined) => string {
  const names = new Map(data.members.map((m) => [m.userId, m.name]))
  return (id) => (id ? (names.get(id) ?? '—') : '—')
}
