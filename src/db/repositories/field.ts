// Mode terrain : toutes les écritures vont d'abord dans la base locale (IndexedDB) + outbox, quel que soit
// l'état du réseau. La synchronisation (src/sync) les envoie plus tard.
import { newId } from '@/lib/ids'
import { normalizeName } from '@/lib/normalize-name'
import { db, type LocalMeeting, type MeetingStatus } from '../local/db'
import { localInsert, localSoftDelete, localUpdate, localDelete } from '../local/write'

export type FieldCtx = { teamId: string; eventId: string; userId: string }

export const MEETING_STATUSES = [
  'to_see',
  'done',
  'follow_up',
  'not_interested',
] as const satisfies readonly MeetingStatus[]

/** Ma rencontre la plus récente avec cette cible (les identifiants UUIDv7 se trient par date de création). */
export async function findMyMeeting(
  ctx: FieldCtx,
  targetId: string,
): Promise<LocalMeeting | undefined> {
  const list = await db.meetings.where('event_company_id').equals(targetId).toArray()
  return list
    .filter((m) => m.owner_id === ctx.userId && !m.deleted_at)
    .sort((a, b) => a.id.localeCompare(b.id))
    .at(-1)
}

const ensuring = new Map<string, Promise<string>>()

/**
 * Identifiant de ma rencontre avec la cible ; elle est créée (en local) à la première saisie.
 * Deux écritures simultanées partagent la même création : jamais de doublon.
 */
export function ensureMeeting(ctx: FieldCtx, targetId: string): Promise<string> {
  const pending = ensuring.get(targetId)
  if (pending) return pending
  const p = (async () => {
    const existing = await findMyMeeting(ctx, targetId)
    if (existing) return existing.id
    const id = newId()
    await localInsert('meetings', {
      id,
      team_id: ctx.teamId,
      event_id: ctx.eventId,
      event_company_id: targetId,
      contact_id: null,
      owner_id: ctx.userId,
      status: 'to_see',
      is_unplanned: false,
      planned_at: null,
      planned_duration_min: 15,
      reminder_minutes: null,
      interest: null,
      need: null,
      budget: null,
      timing: null,
      decision_maker: null,
      next_step: null,
      deleted_at: null,
    })
    return id
  })().finally(() => ensuring.delete(targetId))
  ensuring.set(targetId, p)
  return p
}

export type MeetingPatch = Partial<
  Pick<
    LocalMeeting,
    'status' | 'interest' | 'need' | 'budget' | 'timing' | 'decision_maker' | 'next_step'
  >
>

/** Statut, intérêt et champs structurés : sauvegardés à chaque modification, sans bouton. */
export async function updateMeeting(
  ctx: FieldCtx,
  targetId: string,
  patch: MeetingPatch,
): Promise<void> {
  const id = await ensureMeeting(ctx, targetId)
  await localUpdate('meetings', { id }, patch)
}

// --- Notes ------------------------------------------------------------------------------------------------

export type NoteSource = 'typed' | 'dictated'

export async function createNote(
  ctx: FieldCtx,
  targetId: string,
  body: string,
  source: NoteSource = 'typed',
): Promise<string> {
  const meetingId = await ensureMeeting(ctx, targetId)
  const id = newId()
  await localInsert('notes', {
    id,
    team_id: ctx.teamId,
    meeting_id: meetingId,
    event_company_id: null,
    contact_id: null,
    author_id: ctx.userId,
    body,
    source,
    captured_at: new Date().toISOString(),
    deleted_at: null,
  })
  return id
}

/** Modifie le texte d'une note ; une note vidée est supprimée. */
export async function editNote(noteId: string, body: string): Promise<void> {
  if (body.trim() === '') await localSoftDelete('notes', { id: noteId })
  else await localUpdate('notes', { id: noteId }, { body })
}

// --- Tags (portent sur l'entreprise) ------------------------------------------------------------------------------

export async function setCompanyTag(
  teamId: string,
  companyId: string,
  tagId: string,
  on: boolean,
): Promise<void> {
  const key = { tag_id: tagId, taggable_table: 'companies', taggable_id: companyId }
  const exists = await db.taggings.get([tagId, 'companies', companyId])
  if (on && !exists) await localInsert('taggings', { ...key, team_id: teamId })
  else if (!on && exists) await localDelete('taggings', key)
}

// --- Photos de badge / cartes de visite ------------------------------------------------------------------------------

/** Enregistre la photo en local (fichier + pièce jointe « en attente ») ; elle part au retour du réseau. */
export async function addPhoto(
  ctx: FieldCtx,
  targetId: string,
  blob: Blob,
  mime: string,
): Promise<string> {
  const meetingId = await ensureMeeting(ctx, targetId)
  const id = newId()
  await db.blobs.put({ id, blob, mime })
  await localInsert('attachments', {
    id,
    team_id: ctx.teamId,
    owner_table: 'meetings',
    owner_id: meetingId,
    kind: 'badge_photo',
    storage_path: null,
    mime,
    size_bytes: blob.size,
    status: 'pending',
    deleted_at: null,
  })
  return id
}

export const removePhoto = (id: string) => localSoftDelete('attachments', { id })

// --- Rencontre imprévue ------------------------------------------------------------------------------------------------

export type UnplannedInput = { companyName: string; contactName: string; note: string }

function splitContactName(full: string): { first: string; last: string } {
  const s = full.trim().replace(/\s+/g, ' ')
  const comma = s.indexOf(',')
  if (comma > 0) return { last: s.slice(0, comma).trim(), first: s.slice(comma + 1).trim() }
  const i = s.indexOf(' ')
  return i === -1 ? { first: '', last: s } : { first: s.slice(0, i), last: s.slice(i + 1) }
}

/**
 * Crée en 3 champs une entreprise (ou retrouve celle déjà connue de l'équipe, même sous une autre graphie),
 * sa participation au salon, un contact, une rencontre « imprévue » et la première note.
 * Retourne l'identifiant de la cible pour ouvrir sa fiche.
 */
export async function createUnplanned(
  ctx: FieldCtx,
  input: UnplannedInput,
): Promise<{ targetId: string; meetingId: string }> {
  const name = input.companyName.trim().replace(/\s+/g, ' ')
  const key = normalizeName(name)

  const sameName = (await db.companies.where('name_normalized').equals(key).toArray()).filter(
    (c) => !c.deleted_at,
  )
  let companyId = sameName[0]?.id
  if (!companyId) {
    companyId = newId()
    await localInsert('companies', {
      id: companyId,
      team_id: ctx.teamId,
      name,
      name_normalized: key,
      domain: null,
      website: null,
      industry: null,
      country: null,
      city: null,
      source: 'manual',
      deleted_at: null,
    })
  }

  const existing = (await db.event_companies.where('company_id').equals(companyId).toArray()).find(
    (e) => e.event_id === ctx.eventId && !e.deleted_at,
  )
  let targetId = existing?.id
  if (!targetId) {
    targetId = newId()
    await localInsert('event_companies', {
      id: targetId,
      team_id: ctx.teamId,
      event_id: ctx.eventId,
      company_id: companyId,
      stand_label: null,
      priority: null,
      objective: null,
      prep_comment: null,
      deleted_at: null,
    })
  }

  const alreadyMine = await db.event_company_assignees.get([targetId, ctx.userId])
  if (!alreadyMine || alreadyMine.deleted_at) {
    await localInsert('event_company_assignees', {
      event_company_id: targetId,
      user_id: ctx.userId,
      event_id: ctx.eventId,
      team_id: ctx.teamId,
      deleted_at: null,
    })
  }

  let contactId: string | null = null
  if (input.contactName.trim()) {
    const { first, last } = splitContactName(input.contactName)
    contactId = newId()
    await localInsert('contacts', {
      id: contactId,
      team_id: ctx.teamId,
      company_id: companyId,
      first_name: first || null,
      last_name: last || null,
      job_title: null,
      email: null,
      phone: null,
      deleted_at: null,
    })
  }

  const meetingId = newId()
  await localInsert('meetings', {
    id: meetingId,
    team_id: ctx.teamId,
    event_id: ctx.eventId,
    event_company_id: targetId,
    contact_id: contactId,
    owner_id: ctx.userId,
    status: 'done', // on vient de la croiser : « vu »
    is_unplanned: true,
    planned_at: null,
    planned_duration_min: 15,
    reminder_minutes: null,
    interest: null,
    need: null,
    budget: null,
    timing: null,
    decision_maker: null,
    next_step: null,
    deleted_at: null,
  })
  if (input.note.trim()) {
    await localInsert('notes', {
      id: newId(),
      team_id: ctx.teamId,
      meeting_id: meetingId,
      event_company_id: null,
      contact_id: null,
      author_id: ctx.userId,
      body: input.note.trim(),
      source: 'typed',
      captured_at: new Date().toISOString(),
      deleted_at: null,
    })
  }
  return { targetId, meetingId }
}
