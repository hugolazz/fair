import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SyncTableName } from '@/db/local/db'
import type { Remote } from './types'

// Salons « téléchargés pour le terrain » : choix explicite de l'utilisateur, par appareil.
// Seuls ces salons sont lus en entier et gardés à jour hors-ligne.

const PIN = 'pinned:'

export type PinInfo = { pinnedAt: string; syncedAt: string | null }

export async function listPinnedIds(): Promise<string[]> {
  return (await db.sync_state.where('key').startsWith(PIN).toArray()).map((r) =>
    r.key.slice(PIN.length),
  )
}

export async function getPin(eventId: string): Promise<PinInfo | undefined> {
  return (await db.sync_state.get(PIN + eventId))?.value as PinInfo | undefined
}

export async function setPin(eventId: string, info: PinInfo): Promise<void> {
  await db.sync_state.put({ key: PIN + eventId, value: info })
}

/** Marque les salons téléchargés comme à jour (appelé après un cycle de synchronisation réussi). */
export async function touchPins(eventIds: string[], at = new Date()): Promise<void> {
  for (const id of eventIds) {
    const cur = await getPin(id)
    if (cur) await setPin(id, { ...cur, syncedAt: at.toISOString() })
  }
}

/** Salons téléchargés sur cet appareil (se met à jour tout seul). */
export function usePinned(): Map<string, PinInfo> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.sync_state.where('key').startsWith(PIN).toArray()
    return new Map(rows.map((r) => [r.key.slice(PIN.length), r.value as PinInfo]))
  }, [])
}

// --- Taille ------------------------------------------------------------------------------------------------

/** Poids moyen d'une ligne (octets, JSON local) : sert à annoncer la taille AVANT de télécharger. */
export const AVERAGE_ROW_BYTES: Partial<Record<SyncTableName, number>> = {
  event_companies: 380,
  companies: 420,
  contacts: 330,
  meetings: 520,
  notes: 330,
  event_company_assignees: 190,
  tags: 120,
}

export type DownloadEstimate = { bytes: number; targets: number }

/** Estimation de la taille d'un salon à télécharger, d'après les nombres de lignes côté serveur. */
export async function estimateDownload(remote: Remote, eventId: string): Promise<DownloadEstimate> {
  const eventTables: SyncTableName[] = ['event_companies', 'meetings', 'event_company_assignees']
  const teamTables: SyncTableName[] = ['companies', 'contacts', 'notes', 'tags']
  const counts = new Map<SyncTableName, number>()
  for (const t of eventTables) counts.set(t, await remote.count(t, eventId))
  for (const t of teamTables) counts.set(t, await remote.count(t))
  let bytes = 0
  for (const [t, n] of counts) bytes += n * (AVERAGE_ROW_BYTES[t] ?? 300)
  return { bytes, targets: counts.get('event_companies') ?? 0 }
}

const size = (rows: unknown[]) => rows.reduce<number>((n, r) => n + JSON.stringify(r).length, 0)

async function eventRows(eventId: string) {
  const targets = await db.event_companies.where('event_id').equals(eventId).toArray()
  const meetings = await db.meetings.where('event_id').equals(eventId).toArray()
  const assignees = await db.event_company_assignees.where('event_id').equals(eventId).toArray()
  const meetingIds = new Set(meetings.map((m) => m.id))
  const notes = (await db.notes.toArray()).filter(
    (n) => n.meeting_id && meetingIds.has(n.meeting_id),
  )
  const attachments = (await db.attachments.toArray()).filter((a) => meetingIds.has(a.owner_id))
  const companyIds = [...new Set(targets.map((t) => t.company_id))]
  const companies = (await db.companies.bulkGet(companyIds)).filter((c) => !!c)
  return { targets, meetings, assignees, notes, attachments, companies }
}

/** Poids réel du salon sur cet appareil : lignes + photos stockées. */
export async function localEventSize(eventId: string): Promise<number> {
  const r = await eventRows(eventId)
  let bytes =
    size(r.targets) +
    size(r.meetings) +
    size(r.assignees) +
    size(r.notes) +
    size(r.attachments) +
    size(r.companies)
  for (const a of r.attachments) bytes += (await db.blobs.get(a.id))?.blob.size ?? 0
  return bytes
}

/** Modifications locales pas encore envoyées (toutes tables) : elles bloquent le retrait d'un salon. */
export const pendingChanges = () => db.outbox.count()

/**
 * Retire un salon de l'appareil (libère l'espace). Refusé tant qu'il reste des modifications non envoyées :
 * on ne supprime jamais de données qui n'existent pas encore ailleurs.
 */
export async function removeEventFromDevice(
  eventId: string,
): Promise<{ ok: true } | { ok: false; pending: number }> {
  const pending = await pendingChanges()
  if (pending > 0) return { ok: false, pending }
  const r = await eventRows(eventId)
  const meetingIds = r.meetings.map((m) => m.id)
  await db.transaction(
    'rw',
    [
      db.event_companies,
      db.meetings,
      db.event_company_assignees,
      db.notes,
      db.attachments,
      db.blobs,
      db.sync_state,
    ],
    async () => {
      await db.notes.bulkDelete(r.notes.map((n) => n.id))
      await db.blobs.bulkDelete(r.attachments.map((a) => a.id))
      await db.attachments.bulkDelete(r.attachments.map((a) => a.id))
      await db.meetings.bulkDelete(meetingIds)
      await db.event_company_assignees.where('event_id').equals(eventId).delete()
      await db.event_companies.where('event_id').equals(eventId).delete()
      for (const t of ['event_companies', 'meetings', 'event_company_assignees'])
        await db.sync_state.delete(`cursor:${t}:${eventId}`)
      await db.sync_state.delete(PIN + eventId)
    },
  )
  return { ok: true }
}
