import type { Target } from '@/db/schemas/prepare'
import { sortTargets } from './sort'

// --- Assignations ---------------------------------------------------------------------------------

export type Conflict = { target: Target; others: string[] }

/** Cibles de la sélection déjà visées par un autre commercial que `userId`. */
export function findAssignmentConflicts(
  targets: Target[],
  ids: Iterable<string>,
  userId: string,
): Conflict[] {
  const wanted = new Set(ids)
  const out: Conflict[] = []
  for (const t of targets) {
    if (!wanted.has(t.id)) continue
    const others = t.assigneeIds.filter((u) => u !== userId)
    if (others.length > 0) out.push({ target: t, others })
  }
  return out
}

/** Plusieurs commerciaux visent cette entreprise. */
export const isContested = (t: Target) => t.assigneeIds.length > 1

// --- Sélection ----------------------------------------------------------------------------------------

/** Ids entre deux lignes (incluses) dans l'ordre affiché — sélection par plage avec Maj. */
export function rangeSelect(orderedIds: string[], fromId: string, toId: string): string[] {
  const a = orderedIds.indexOf(fromId)
  const b = orderedIds.indexOf(toId)
  if (a === -1 || b === -1) return b === -1 ? [] : [toId]
  return orderedIds.slice(Math.min(a, b), Math.max(a, b) + 1)
}

// --- Liste virtualisée ----------------------------------------------------------------------------------------

/** Lignes à rendre pour une liste à hauteur de ligne fixe (fenêtrage). `end` est exclu. */
export function visibleRange(o: {
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  count: number
  overscan?: number
}): { start: number; end: number } {
  const overscan = o.overscan ?? 8
  const first = Math.floor(o.scrollTop / o.rowHeight)
  const last = Math.ceil((o.scrollTop + o.viewportHeight) / o.rowHeight)
  return { start: Math.max(0, first - overscan), end: Math.min(o.count, last + overscan) }
}

// --- Ma liste -----------------------------------------------------------------------------------------------

/** Mes cibles, par priorité (A, B, C, sans priorité), puis prochain rendez-vous, puis nom. */
export function myList(targets: Target[], userId: string): Target[] {
  const mine = targets.filter((t) => t.assigneeIds.includes(userId))
  return sortTargets(mine, [
    { key: 'priority', dir: 'asc' },
    { key: 'meeting', dir: 'asc' },
  ])
}
