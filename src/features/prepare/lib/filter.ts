import { buildSearchKey, type Goal, type Priority, type Target } from '@/db/schemas/prepare'

export type Filters = {
  search: string
  /** Vide = toutes. `none` = sans priorité. */
  priorities: (Priority | 'none')[]
  /** Au moins un de ces tags (vide = indifférent). */
  tagIds: string[]
  /** Au moins un de ces salons (vide = indifférent). */
  showIds: string[]
  assignee: 'any' | 'none' | string
  goal: 'any' | 'none' | Goal
}

export const emptyFilters: Filters = {
  search: '',
  priorities: [],
  tagIds: [],
  showIds: [],
  assignee: 'any',
  goal: 'any',
}

export function countActiveFilters(f: Filters): number {
  return (
    (f.search.trim() ? 1 : 0) +
    (f.priorities.length ? 1 : 0) +
    (f.tagIds.length ? 1 : 0) +
    (f.showIds.length ? 1 : 0) +
    (f.assignee !== 'any' ? 1 : 0) +
    (f.goal !== 'any' ? 1 : 0)
  )
}

/** Recherche insensible à la casse et aux accents ; tous les mots doivent être présents (nom, stand, secteur, ville…). */
export function filterTargets(targets: Target[], f: Filters): Target[] {
  const terms = buildSearchKey([f.search]).split(/\s+/).filter(Boolean)
  const prios = new Set(f.priorities)
  const tags = new Set(f.tagIds)
  const shows = new Set(f.showIds)
  return targets.filter((t) => {
    if (terms.length && !terms.every((w) => t.searchKey.includes(w))) return false
    if (prios.size && !prios.has(t.priority ?? 'none')) return false
    if (tags.size && !t.tagIds.some((id) => tags.has(id))) return false
    if (shows.size && !t.tagIds.some((id) => shows.has(id))) return false
    if (f.assignee === 'none' && t.assigneeIds.length > 0) return false
    if (f.assignee !== 'any' && f.assignee !== 'none' && !t.assigneeIds.includes(f.assignee))
      return false
    if (f.goal === 'none' && t.goal !== null) return false
    if (f.goal !== 'any' && f.goal !== 'none' && t.goal !== f.goal) return false
    return true
  })
}
