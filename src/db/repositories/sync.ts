import { patchCached } from '@/lib/cache/cache'
import { cacheKeys } from '../cache-keys'
import {
  deleteMeeting,
  deleteMeetingNote,
  findMyMeetingNote,
  saveMeeting,
  updateMeetingNote,
  updateMeetingReport,
  upsertMeetingNote,
  type MeetingInput,
  type MeetingNote,
  type MeetingReportPatch,
} from './targets'

// Écritures qui passent par la file d'attente hors ligne (voir `src/lib/outbox`). Chacune est rejouable sans risque :
// les identifiants sont connus d'avance et les envois sont des « créer ou remplacer ».

export type SyncOp =
  | { type: 'meeting.upsert'; input: MeetingInput & { id: string } }
  | { type: 'meeting.patch'; id: string; patch: MeetingReportPatch }
  | { type: 'meeting.delete'; id: string }
  | {
      type: 'note.upsert'
      note: {
        id: string
        teamId: string
        meetingId: string
        authorId: string
        body: string
        capturedAt: string
        /** On ignore si une note de moi existe déjà sur cette rencontre (écrite hors ligne, sans l'avoir relue) : on la reprend. */
        adopt: boolean
      }
    }
  | { type: 'note.delete'; id: string; meetingId: string }

/** Clé de fusion : deux envois de même clé encore en attente n'en font qu'un (le dernier texte d'une note, par exemple). */
export function opKey(op: SyncOp): string {
  switch (op.type) {
    case 'meeting.upsert':
      return `meeting.upsert:${op.input.id}`
    case 'meeting.patch':
      return `meeting.patch:${op.id}`
    case 'meeting.delete':
      return `meeting.delete:${op.id}`
    case 'note.upsert':
      return `note:${op.note.id}`
    case 'note.delete':
      return `note.delete:${op.id}`
  }
}

/** Fond deux envois de même clé : les changements d'une rencontre s'additionnent, le reste est remplacé. */
export function mergeOps(prev: SyncOp, next: SyncOp): SyncOp {
  if (prev.type === 'meeting.patch' && next.type === 'meeting.patch') {
    return { ...next, patch: { ...prev.patch, ...next.patch } }
  }
  return next
}

/** La rencontre concernée, pour tout retirer d'un coup quand elle est créée puis supprimée avant d'être partie. */
export function opMeetingId(op: SyncOp): string {
  switch (op.type) {
    case 'meeting.upsert':
      return op.input.id
    case 'meeting.patch':
    case 'meeting.delete':
      return op.id
    case 'note.upsert':
    case 'note.delete':
      return op.type === 'note.upsert' ? op.note.meetingId : op.meetingId
  }
}

const NOT_FOUND = 'not allowed or not found'
const isNotFound = (e: unknown) => e instanceof Error && e.message === NOT_FOUND

/** Ce qui n'existe plus n'a pas à être supprimé ni modifié : l'envoi est alors un succès. */
async function ignoringNotFound(run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (e) {
    if (!isNotFound(e)) throw e
  }
}

export async function executeOp(op: SyncOp): Promise<void> {
  switch (op.type) {
    case 'meeting.upsert':
      await saveMeeting(op.input)
      return
    case 'meeting.patch':
      return ignoringNotFound(() => updateMeetingReport(op.id, op.patch))
    case 'meeting.delete':
      return ignoringNotFound(() => deleteMeeting(op.id))
    case 'note.upsert': {
      const { note } = op
      if (note.adopt) {
        const mine = await findMyMeetingNote(note.meetingId, note.authorId)
        if (mine) {
          await updateMeetingNote(mine.id, note.body)
          return
        }
      }
      await upsertMeetingNote(note)
      return
    }
    case 'note.delete':
      return ignoringNotFound(() => deleteMeetingNote(op.id))
  }
}

/**
 * Applique une écriture de note à une liste de notes : ma note écrite hors ligne apparaît, une note supprimée disparaît.
 * Rejouable sans risque. Sert à afficher les écritures en attente et à tenir la copie locale à jour.
 */
export function applyNoteOp(notes: readonly MeetingNote[], op: SyncOp): MeetingNote[] {
  if (op.type === 'note.upsert') {
    const { note } = op
    // Écrite sans avoir pu lire l'existante (`adopt`) : l'envoi reprendra la mienne, on l'affiche comme corrigée.
    const target =
      notes.find((n) => n.id === note.id) ??
      (note.adopt ? notes.find((n) => n.authorId === note.authorId) : undefined)
    const next: MeetingNote = {
      id: target?.id ?? note.id,
      body: note.body,
      authorId: note.authorId,
      capturedAt: target?.capturedAt ?? note.capturedAt,
    }
    return (target ? notes.map((n) => (n.id === target.id ? next : n)) : [...notes, next]).sort(
      (a, b) => a.capturedAt.localeCompare(b.capturedAt),
    )
  }
  if (op.type === 'note.delete') return notes.filter((n) => n.id !== op.id)
  return [...notes]
}

/** La copie locale des notes d'une rencontre suit l'écriture locale : la rouvrir hors ligne montre ce qu'on vient d'écrire. */
export async function applyOpToCache(op: SyncOp): Promise<void> {
  if (op.type !== 'note.upsert' && op.type !== 'note.delete') return
  const meetingId = op.type === 'note.upsert' ? op.note.meetingId : op.meetingId
  if (!meetingId) return
  await patchCached<MeetingNote[]>(cacheKeys.notes(meetingId), (prev) =>
    applyNoteOp(prev ?? [], op),
  )
}

export { isRetryableError } from '@/lib/network-error'
