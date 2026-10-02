import { useState, type ReactNode } from 'react'
import type { Target } from '@/db/schemas/prepare'
import { ConflictDialog } from './conflict-dialog'
import { findAssignmentConflicts, type Conflict } from './lib/misc'
import type { TargetsApi } from './use-targets'

type Pending = { ids: string[]; userId: string; conflicts: Conflict[] }

/**
 * Assignation avec garde-fou : si une des cibles est déjà visée par un autre commercial, une alerte
 * propose d'ajouter quand même (deux commerciaux), de remplacer, d'ignorer ces cibles ou d'annuler.
 */
export function useAssignFlow(
  api: TargetsApi,
  targets: Target[] | undefined,
): {
  request: (ids: string[], userId: string) => void
  dialog: ReactNode
} {
  const [pending, setPending] = useState<Pending>()

  function request(ids: string[], userId: string) {
    const conflicts = findAssignmentConflicts(targets ?? [], ids, userId)
    if (conflicts.length === 0) void api.actions.assign(ids, userId)
    else setPending({ ids, userId, conflicts })
  }

  function resolve(choice: 'add' | 'replace' | 'skip' | 'cancel') {
    if (!pending) return
    const { ids, userId, conflicts } = pending
    setPending(undefined)
    if (choice === 'add') void api.actions.assign(ids, userId)
    else if (choice === 'replace') void api.actions.assign(ids, userId, true)
    else if (choice === 'skip') {
      const contested = new Set(conflicts.map((c) => c.target.id))
      const free = ids.filter((id) => !contested.has(id))
      if (free.length) void api.actions.assign(free, userId)
    }
  }

  const dialog = pending ? (
    <ConflictDialog
      userName={api.memberName(pending.userId)}
      conflicts={pending.conflicts}
      nameOf={api.memberName}
      onResolve={resolve}
    />
  ) : null
  return { request, dialog }
}
