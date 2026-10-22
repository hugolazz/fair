import type { SyncOp } from '@/db/repositories/sync'
import type { MeetingReportPatch } from '@/db/repositories/targets'
import type { Target, TargetMeeting } from '@/db/schemas/prepare'

/** Applique un changement de compte-rendu (statut, intérêt, cases, contact) à une rencontre. */
export function applyMeetingPatch(m: TargetMeeting, patch: MeetingReportPatch): TargetMeeting {
  return {
    ...m,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.interest !== undefined ? { interest: patch.interest } : {}),
    ...(patch.nextStep !== undefined ? { nextStep: patch.nextStep } : {}),
    ...(patch.recontact !== undefined ? { recontact: patch.recontact } : {}),
    ...(patch.news !== undefined ? { news: patch.news } : {}),
    ...(patch.contactId !== undefined ? { contactId: patch.contactId } : {}),
  }
}

/** La rencontre telle qu'elle apparaît juste après sa création (ou sa replanification, qui garde le reste). */
export function meetingFromInput(
  input: Extract<SyncOp, { type: 'meeting.upsert' }>['input'],
  prev?: TargetMeeting,
): TargetMeeting {
  return {
    id: input.id,
    plannedAt: input.plannedAt,
    durationMin: input.durationMin,
    reminderMin: input.reminderMin,
    ownerId: input.ownerId,
    // Replanifier ne change ni le statut, ni l'intérêt, ni la prochaine étape déjà saisis.
    status: prev?.status ?? 'to_see',
    interest: prev?.interest ?? null,
    nextStep: prev?.nextStep ?? '',
    recontact: prev?.recontact ?? false,
    news: prev?.news ?? false,
    autoCreated: input.auto === true,
    contactId: prev?.contactId ?? null,
  }
}

const byPlannedAt = (a: TargetMeeting, b: TargetMeeting) => a.plannedAt.localeCompare(b.plannedAt)

/**
 * Rejoue par-dessus des données lues sur le serveur les modifications de rencontres qui n'y sont pas encore arrivées
 * (file d'attente hors ligne) : on ne voit jamais l'ancienne version d'une rencontre qu'on vient de modifier.
 * Rejouable sans risque : appliquer deux fois la même modification donne le même résultat.
 */
export function overlayMeetingOps(targets: Target[], ops: readonly SyncOp[]): Target[] {
  const relevant = ops.filter(
    (o) => o.type === 'meeting.upsert' || o.type === 'meeting.patch' || o.type === 'meeting.delete',
  )
  if (relevant.length === 0) return targets

  const owner = new Map<string, string>() // rencontre → entreprise ciblée qui la porte
  for (const t of targets) for (const m of t.meetings) owner.set(m.id, t.id)
  const changed = new Map<string, TargetMeeting[]>() // entreprise ciblée → ses rencontres modifiées
  const meetingsOf = (targetId: string) =>
    changed.get(targetId) ?? [...(targets.find((t) => t.id === targetId)?.meetings ?? [])]

  for (const op of relevant) {
    if (op.type === 'meeting.upsert') {
      const targetId = op.input.targetId
      const list = meetingsOf(targetId)
      const prev = list.find((m) => m.id === op.input.id)
      owner.set(op.input.id, targetId)
      changed.set(
        targetId,
        [...list.filter((m) => m.id !== op.input.id), meetingFromInput(op.input, prev)].sort(
          byPlannedAt,
        ),
      )
    } else {
      const targetId = owner.get(op.id)
      if (!targetId) continue
      const list = meetingsOf(targetId)
      changed.set(
        targetId,
        op.type === 'meeting.delete'
          ? list.filter((m) => m.id !== op.id)
          : list.map((m) => (m.id === op.id ? applyMeetingPatch(m, op.patch) : m)),
      )
    }
  }
  return targets.map((t) => (changed.has(t.id) ? { ...t, meetings: changed.get(t.id)! } : t))
}
