// Préparation du salon : cibles (event_companies), tags, assignations, rendez-vous, fiche et historique.
// Comme events.ts, écrit directement sur Supabase (la bascule Dexie/outbox viendra avec la synchronisation).
import { supabase } from '@/lib/supabase'
import { newId } from '@/lib/ids'
import {
  DEFAULT_TAGS,
  historyRowSchema,
  rowToTarget,
  toHistory,
  targetRowSchema,
  type Goal,
  type HistoryEntry,
  type Priority,
  type Tag,
  type Target,
  type TargetContact,
} from '../schemas/prepare'

const PAGE = 1000
const IN_CHUNK = 150 // ids par requête `in (...)` : l'URL reste courte
const WRITE_CHUNK = 500

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// --- Lecture ----------------------------------------------------------------------------------------------

const TARGET_SELECT =
  'id, event_id, company_id, stand_label, priority, objective, prep_comment, ' +
  'companies(id, name, domain, website, industry, country, city, contacts(count)), ' +
  'event_company_assignees(user_id, deleted_at), ' +
  'meetings(id, planned_at, planned_duration_min, reminder_minutes, owner_id, status, deleted_at)'

export async function fetchTags(): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, label, color')
    .eq('scope', 'company')
    .is('deleted_at', null)
    .order('label')
  if (error) throw error
  return (data ?? []).map((t) => ({
    id: t.id as string,
    label: t.label as string,
    color: (t.color as string | null) ?? '#475569',
  }))
}

/** Crée les tags par défaut (client, prospect, partenaire, concurrent, veille) si l'équipe n'en a aucun. */
export async function ensureDefaultTags(teamId: string): Promise<Tag[]> {
  const existing = await fetchTags()
  if (existing.length > 0) return existing
  const { error } = await supabase.from('tags').insert(
    DEFAULT_TAGS.map((t) => ({
      id: newId(),
      team_id: teamId,
      scope: 'company',
      label: t.label,
      color: t.color,
    })),
  )
  // 23505 : un collègue vient de les créer en même temps — rien à faire.
  if (error && error.code !== '23505') throw error
  return fetchTags()
}

/** Liens tag ↔ entreprise : entreprise → ids de tags. */
async function fetchCompanyTagLinks(): Promise<Map<string, string[]>> {
  const links = new Map<string, string[]>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('taggings')
      .select('tag_id, taggable_id')
      .eq('taggable_table', 'companies')
      .order('taggable_id')
      .order('tag_id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const r of data ?? []) {
      const list = links.get(r.taggable_id as string)
      if (list) list.push(r.tag_id as string)
      else links.set(r.taggable_id as string, [r.tag_id as string])
    }
    if ((data ?? []).length < PAGE) return links
  }
}

export async function listTargets(eventId: string): Promise<Target[]> {
  const links = await fetchCompanyTagLinks()
  const targets: Target[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('event_companies')
      .select(TARGET_SELECT)
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = targetRowSchema.array().parse(data ?? [])
    for (const r of rows) targets.push(rowToTarget(r, links.get(r.company_id) ?? []))
    if (rows.length < PAGE) return targets
  }
}

export async function fetchContacts(companyId: string): Promise<TargetContact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, job_title, email, phone')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('last_name')
  if (error) throw error
  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: [c.first_name, c.last_name].filter(Boolean).join(' '),
    jobTitle: (c.job_title as string | null) ?? '',
    email: (c.email as string | null) ?? '',
    phone: (c.phone as string | null) ?? '',
  }))
}

/** Rencontres et notes de la même entreprise lors des autres salons. */
export async function fetchHistory(
  companyId: string,
  currentEventId: string,
): Promise<HistoryEntry[]> {
  const { data, error } = await supabase
    .from('event_companies')
    .select(
      'id, event_id, stand_label, priority, objective, events(id, name, starts_on, city), ' +
        'meetings(id, status, temperature, outcome, next_step, planned_at, deleted_at, notes(id, body, captured_at, deleted_at)), ' +
        'notes(id, body, captured_at, deleted_at)',
    )
    .eq('company_id', companyId)
    .neq('event_id', currentEventId)
    .is('deleted_at', null)
  if (error) throw error
  return toHistory(historyRowSchema.array().parse(data ?? []))
}

// --- Écriture : champs de préparation ---------------------------------------------------------------------------

export type TargetPatch = {
  priority?: Priority | null
  objective?: Goal | null
  prep_comment?: string
}

export async function updateTargets(ids: string[], patch: TargetPatch): Promise<void> {
  for (const part of chunks(ids, IN_CHUNK)) {
    const { error } = await supabase.from('event_companies').update(patch).in('id', part)
    if (error) throw error
  }
}

// --- Tags -------------------------------------------------------------------------------------------------------------

export async function createTag(teamId: string, label: string, color: string): Promise<Tag> {
  const id = newId()
  const { error } = await supabase
    .from('tags')
    .insert({ id, team_id: teamId, scope: 'company', label, color })
  if (error) throw error
  return { id, label, color }
}

export async function updateTag(id: string, label: string, color: string): Promise<void> {
  const { error } = await supabase.from('tags').update({ label, color }).eq('id', id)
  if (error) throw error
}

/** Soft delete : le tag disparaît de l'interface, ses liens sont nettoyés. */
export async function deleteTag(id: string): Promise<void> {
  const { error } = await supabase
    .from('tags')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  const { error: linkError } = await supabase.from('taggings').delete().eq('tag_id', id)
  if (linkError) throw linkError
}

export async function setCompanyTag(
  teamId: string,
  companyIds: string[],
  tagId: string,
  on: boolean,
): Promise<void> {
  if (on) {
    for (const part of chunks(companyIds, WRITE_CHUNK)) {
      const { error } = await supabase.from('taggings').upsert(
        part.map((id) => ({
          tag_id: tagId,
          taggable_table: 'companies',
          taggable_id: id,
          team_id: teamId,
        })),
        { onConflict: 'tag_id,taggable_table,taggable_id' },
      )
      if (error) throw error
    }
    return
  }
  for (const part of chunks(companyIds, IN_CHUNK)) {
    const { error } = await supabase
      .from('taggings')
      .delete()
      .eq('tag_id', tagId)
      .eq('taggable_table', 'companies')
      .in('taggable_id', part)
    if (error) throw error
  }
}

// --- Assignations ------------------------------------------------------------------------------------------------------

export async function assignTargets(
  teamId: string,
  eventId: string,
  targetIds: string[],
  userId: string,
): Promise<void> {
  for (const part of chunks(targetIds, WRITE_CHUNK)) {
    const { error } = await supabase.from('event_company_assignees').upsert(
      part.map((id) => ({
        event_company_id: id,
        user_id: userId,
        event_id: eventId,
        team_id: teamId,
        deleted_at: null,
      })),
      { onConflict: 'event_company_id,user_id' },
    )
    if (error) throw error
  }
}

/** Retire un commercial des cibles (soft delete, réactivable). */
export async function unassignTargets(targetIds: string[], userId: string): Promise<void> {
  for (const part of chunks(targetIds, IN_CHUNK)) {
    const { error } = await supabase
      .from('event_company_assignees')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('event_company_id', part)
    if (error) throw error
  }
}

// --- Rendez-vous planifiés ----------------------------------------------------------------------------------------------

export type MeetingInput = {
  id?: string
  teamId: string
  eventId: string
  targetId: string
  ownerId: string
  plannedAt: string
  durationMin: number
  reminderMin: number | null
}

export async function saveMeeting(m: MeetingInput): Promise<string> {
  const id = m.id ?? newId()
  const { error } = await supabase.from('meetings').upsert(
    {
      id,
      team_id: m.teamId,
      event_id: m.eventId,
      event_company_id: m.targetId,
      owner_id: m.ownerId,
      planned_at: m.plannedAt,
      planned_duration_min: m.durationMin,
      reminder_minutes: m.reminderMin,
      deleted_at: null,
    },
    { onConflict: 'id' },
  )
  if (error) throw error
  return id
}

export async function deleteMeeting(id: string): Promise<void> {
  const { error } = await supabase
    .from('meetings')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
