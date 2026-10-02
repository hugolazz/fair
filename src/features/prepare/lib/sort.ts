import { PRIORITIES, type Target } from '@/db/schemas/prepare'

export type SortKey = 'priority' | 'name' | 'stand' | 'industry' | 'goal' | 'assignee' | 'meeting'
export type Sort = { key: SortKey; dir: 'asc' | 'desc' }

// Tri « naturel » : B2 avant B12, accents et casse ignorés.
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

const PRIORITY_RANK: Record<string, number> = Object.fromEntries(PRIORITIES.map((p, i) => [p, i]))

/** Valeur de tri d'une cible ; `null` = vide (toujours placé en dernier, quel que soit le sens). */
function valueOf(
  t: Target,
  key: SortKey,
  nameOf: (userId: string) => string,
): string | number | null {
  switch (key) {
    case 'priority':
      return t.priority ? PRIORITY_RANK[t.priority]! : null
    case 'name':
      return t.name
    case 'stand':
      return t.stand || null
    case 'industry':
      return t.industry || null
    case 'goal':
      return t.goal
    case 'assignee':
      return t.assigneeIds.length
        ? t.assigneeIds.map(nameOf).sort(collator.compare).join(', ')
        : null
    case 'meeting':
      return t.meetings[0]?.plannedAt ?? null
  }
}

/** Tri sur un ou plusieurs critères successifs ; à égalité, par nom. Ne modifie pas le tableau d'origine. */
export function sortTargets(
  targets: Target[],
  sort: Sort | Sort[],
  nameOf: (userId: string) => string = (id) => id,
): Target[] {
  const keys = Array.isArray(sort) ? sort : [sort]
  const keyed = targets.map((t) => ({ t, v: keys.map((k) => valueOf(t, k.key, nameOf)) }))
  keyed.sort((a, b) => {
    for (const [i, k] of keys.entries()) {
      const x = a.v[i]!
      const y = b.v[i]!
      if (x === null || y === null) {
        if (x === y) continue
        return x === null ? 1 : -1
      }
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : collator.compare(String(x), String(y))
      if (c !== 0) return k.dir === 'asc' ? c : -c
    }
    return collator.compare(a.t.name, b.t.name)
  })
  return keyed.map((k) => k.t)
}
