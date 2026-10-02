import { z } from 'zod'
import { stripDiacritics } from '@/lib/normalize-name'

export const PRIORITIES = ['A', 'B', 'C'] as const
export type Priority = (typeof PRIORITIES)[number]

export const GOALS = ['demo', 'intro_decision_maker', 'watch', 'other'] as const
export type Goal = (typeof GOALS)[number]

export type Tag = { id: string; label: string; color: string }

/** Couleurs proposées pour les tags (le libellé reste toujours affiché : jamais la couleur seule). */
export const TAG_COLORS = [
  '#0f766e',
  '#1d4ed8',
  '#7c3aed',
  '#be123c',
  '#b45309',
  '#475569',
] as const

export const DEFAULT_TAGS: Pick<Tag, 'label' | 'color'>[] = [
  { label: 'Client', color: '#0f766e' },
  { label: 'Prospect', color: '#1d4ed8' },
  { label: 'Partenaire', color: '#7c3aed' },
  { label: 'Concurrent', color: '#be123c' },
  { label: 'Veille', color: '#475569' },
]

export type TeamMember = { userId: string; name: string }

export type TargetMeeting = {
  id: string
  plannedAt: string
  durationMin: number
  reminderMin: number | null
  ownerId: string
  status: string
}

/** Une entreprise ciblée sur un salon (event_companies + entreprise + assignés + tags). */
export type Target = {
  id: string
  eventId: string
  companyId: string
  name: string
  domain: string
  website: string
  industry: string
  country: string
  city: string
  stand: string
  priority: Priority | null
  goal: Goal | null
  prepComment: string
  assigneeIds: string[]
  tagIds: string[]
  contactCount: number
  meetings: TargetMeeting[]
  /** Texte de recherche : minuscules, sans accents. */
  searchKey: string
}

export function buildSearchKey(parts: (string | null | undefined)[]): string {
  return stripDiacritics(parts.filter(Boolean).join(' ')).toLowerCase()
}

const str = z
  .string()
  .nullable()
  .transform((v) => v ?? '')

/** Ligne `event_companies` avec ses relations, telle que renvoyée par PostgREST. */
export const targetRowSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  company_id: z.string(),
  stand_label: str,
  priority: z.enum(PRIORITIES).nullable(),
  objective: z.enum(GOALS).nullable(),
  prep_comment: str,
  companies: z.object({
    id: z.string(),
    name: z.string(),
    domain: str,
    website: str,
    industry: str,
    country: str,
    city: str,
    contacts: z.array(z.object({ count: z.number() })).default([]),
  }),
  event_company_assignees: z
    .array(z.object({ user_id: z.string(), deleted_at: z.string().nullable() }))
    .default([]),
  meetings: z
    .array(
      z.object({
        id: z.string(),
        planned_at: z.string().nullable(),
        planned_duration_min: z.number(),
        reminder_minutes: z.number().nullable(),
        owner_id: z.string(),
        status: z.string(),
        deleted_at: z.string().nullable(),
      }),
    )
    .default([]),
})
export type TargetRow = z.infer<typeof targetRowSchema>

export function rowToTarget(row: TargetRow, tagIds: string[]): Target {
  const c = row.companies
  return {
    id: row.id,
    eventId: row.event_id,
    companyId: row.company_id,
    name: c.name,
    domain: c.domain,
    website: c.website,
    industry: c.industry,
    country: c.country,
    city: c.city,
    stand: row.stand_label,
    priority: row.priority,
    goal: row.objective,
    prepComment: row.prep_comment,
    assigneeIds: row.event_company_assignees.filter((a) => !a.deleted_at).map((a) => a.user_id),
    tagIds,
    contactCount: c.contacts[0]?.count ?? 0,
    meetings: row.meetings
      .filter((m) => !m.deleted_at && m.planned_at)
      .map((m) => ({
        id: m.id,
        plannedAt: m.planned_at!,
        durationMin: m.planned_duration_min,
        reminderMin: m.reminder_minutes,
        ownerId: m.owner_id,
        status: m.status,
      }))
      .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt)),
    searchKey: buildSearchKey([c.name, row.stand_label, c.industry, c.city, c.country, c.domain]),
  }
}

export type TargetContact = {
  id: string
  name: string
  jobTitle: string
  email: string
  phone: string
}

export type HistoryNote = { id: string; body: string; capturedAt: string }
export type HistoryMeeting = {
  id: string
  status: string
  temperature: string | null
  outcome: string
  nextStep: string
  plannedAt: string | null
  notes: HistoryNote[]
}
export type HistoryEntry = {
  id: string
  eventId: string
  eventName: string
  startsOn: string | null
  city: string
  stand: string
  priority: Priority | null
  goal: Goal | null
  meetings: HistoryMeeting[]
  notes: HistoryNote[]
}

const note = z.object({
  id: z.string(),
  body: z.string(),
  captured_at: z.string(),
  deleted_at: z.string().nullable(),
})

export const historyRowSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  stand_label: str,
  priority: z.enum(PRIORITIES).nullable(),
  objective: z.enum(GOALS).nullable(),
  events: z.object({
    id: z.string(),
    name: z.string(),
    starts_on: z.string().nullable(),
    city: str,
  }),
  meetings: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        temperature: z.string().nullable(),
        outcome: str,
        next_step: str,
        planned_at: z.string().nullable(),
        deleted_at: z.string().nullable(),
        notes: z.array(note).default([]),
      }),
    )
    .default([]),
  notes: z.array(note).default([]),
})
export type HistoryRow = z.infer<typeof historyRowSchema>

// --- Historique ------------------------------------------------------------------------------------------------

/** Rencontres et notes des autres salons : le plus récent d'abord, éléments supprimés écartés. */
export function toHistory(rows: HistoryRow[]): HistoryEntry[] {
  const newestFirst = <T>(items: T[], key: (i: T) => string | null) =>
    items.slice().sort((a, b) => (key(b) ?? '').localeCompare(key(a) ?? ''))
  const entries = rows.map<HistoryEntry>((r) => ({
    id: r.id,
    eventId: r.event_id,
    eventName: r.events.name,
    startsOn: r.events.starts_on,
    city: r.events.city,
    stand: r.stand_label,
    priority: r.priority,
    goal: r.objective,
    meetings: newestFirst(
      r.meetings
        .filter((m) => !m.deleted_at)
        .map((m) => ({
          id: m.id,
          status: m.status,
          temperature: m.temperature,
          outcome: m.outcome,
          nextStep: m.next_step,
          plannedAt: m.planned_at,
          notes: newestFirst(
            m.notes
              .filter((n) => !n.deleted_at)
              .map((n) => ({ id: n.id, body: n.body, capturedAt: n.captured_at })),
            (n) => n.capturedAt,
          ),
        })),
      (m) => m.plannedAt,
    ),
    notes: newestFirst(
      r.notes
        .filter((n) => !n.deleted_at)
        .map((n) => ({ id: n.id, body: n.body, capturedAt: n.captured_at })),
      (n) => n.capturedAt,
    ),
  }))
  return newestFirst(entries, (e) => e.startsOn)
}
