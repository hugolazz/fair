import type {
  LocalAssignee,
  LocalCompany,
  LocalEventCompany,
  LocalMeeting,
  MeetingStatus,
} from '@/db/local/db'
import { buildSearchKey } from '@/db/schemas/prepare'

export type FieldRow = {
  id: string
  companyId: string
  name: string
  stand: string
  industry: string
  priority: 'A' | 'B' | 'C' | null
  mine: boolean
  /** Statut de MA rencontre ; « à voir » tant qu'il n'y en a pas. */
  status: MeetingStatus
  interest: number | null
  /** Prochain créneau planifié pour moi (ISO). */
  plannedAt: string | null
  searchKey: string
}

export type Scope = 'todo' | 'done' | 'follow_up' | 'all'
export type FieldFilters = { search: string; mine: boolean; onlyA: boolean; scope: Scope }

export const defaultFilters: FieldFilters = { search: '', mine: false, onlyA: false, scope: 'todo' }

const FINISHED: MeetingStatus[] = ['done', 'not_interested']

export function buildFieldRows(input: {
  targets: LocalEventCompany[]
  companies: LocalCompany[]
  assignees: LocalAssignee[]
  meetings: LocalMeeting[]
  userId: string
}): FieldRow[] {
  const companyById = new Map(input.companies.map((c) => [c.id, c]))
  const mine = new Set(
    input.assignees
      .filter((a) => a.user_id === input.userId && !a.deleted_at)
      .map((a) => a.event_company_id),
  )
  // Ma rencontre la plus récente par cible (les UUIDv7 se trient par date de création).
  const meetingOf = new Map<string, LocalMeeting>()
  for (const m of input.meetings) {
    if (m.owner_id !== input.userId || m.deleted_at) continue
    const cur = meetingOf.get(m.event_company_id)
    if (!cur || m.id > cur.id) meetingOf.set(m.event_company_id, m)
  }
  const rows: FieldRow[] = []
  for (const t of input.targets) {
    if (t.deleted_at) continue
    const c = companyById.get(t.company_id)
    if (!c || c.deleted_at) continue
    const m = meetingOf.get(t.id)
    rows.push({
      id: t.id,
      companyId: t.company_id,
      name: c.name,
      stand: t.stand_label ?? '',
      industry: c.industry ?? '',
      priority: t.priority,
      mine: mine.has(t.id),
      status: m?.status ?? 'to_see',
      interest: m?.interest ?? null,
      plannedAt: m?.planned_at ?? null,
      searchKey: buildSearchKey([c.name, t.stand_label, c.industry, c.city]),
    })
  }
  return rows
}

export function filterField(rows: FieldRow[], f: FieldFilters): FieldRow[] {
  const terms = buildSearchKey([f.search]).split(/\s+/).filter(Boolean)
  return rows.filter((r) => {
    if (f.mine && !r.mine) return false
    if (f.onlyA && r.priority !== 'A') return false
    if (f.scope === 'todo' && r.status !== 'to_see') return false
    if (f.scope === 'done' && !FINISHED.includes(r.status)) return false
    if (f.scope === 'follow_up' && r.status !== 'follow_up') return false
    return terms.every((w) => r.searchKey.includes(w))
  })
}

const PRIORITY_RANK = { A: 0, B: 1, C: 2 } as const
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

/** Fenêtre « maintenant » d'un rendez-vous planifié : de 15 min avant à 45 min après le début. */
export const NOW_WINDOW = { beforeMin: 45, afterMin: 15 }

export const isHappeningNow = (plannedAt: string | null, now: Date) => {
  if (!plannedAt) return false
  const d = (new Date(plannedAt).getTime() - now.getTime()) / 60_000
  return d <= NOW_WINDOW.beforeMin && d >= -NOW_WINDOW.afterMin
}

/**
 * Ordre « à voir maintenant » : rendez-vous imminents d'abord, puis priorité A, B, C, sans priorité,
 * mes cibles avant les autres, puis stand (ordre naturel) et nom.
 */
export function sortNow(rows: FieldRow[], now: Date): FieldRow[] {
  const key = (r: FieldRow) => [
    isHappeningNow(r.plannedAt, now) ? 0 : 1,
    r.priority ? PRIORITY_RANK[r.priority] : 3,
    r.mine ? 0 : 1,
  ]
  return rows.slice().sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!
    if (isHappeningNow(a.plannedAt, now) && a.plannedAt !== b.plannedAt)
      return a.plannedAt!.localeCompare(b.plannedAt!)
    if (!!a.stand !== !!b.stand) return a.stand ? -1 : 1
    return collator.compare(a.stand, b.stand) || collator.compare(a.name, b.name)
  })
}

export type ScopeCounts = Record<Scope, number>

export function countByScope(rows: FieldRow[]): ScopeCounts {
  return {
    todo: rows.filter((r) => r.status === 'to_see').length,
    done: rows.filter((r) => FINISHED.includes(r.status)).length,
    follow_up: rows.filter((r) => r.status === 'follow_up').length,
    all: rows.length,
  }
}
