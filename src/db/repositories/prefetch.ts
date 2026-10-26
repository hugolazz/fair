import { writeManyCached } from '@/lib/cache/cache'
import { supabase } from '@/lib/supabase'
import { cacheKeys } from '../cache-keys'
import type { Target, TargetContact } from '../schemas/prepare'
import {
  fetchHistoryNetwork,
  forEachTeamContactPage,
  toMeetingNote,
  toTargetContact,
  type MeetingNote,
} from './targets'

// Copie locale d'un salon, téléchargée en arrière-plan après l'ouverture de la liste : contacts et notes de tout le
// salon, historique des entreprises qui me sont assignées (les autres se chargent quand on ouvre leur fiche). Sans elle,
// ouvrir une fiche sans réseau afficherait une fiche vide. Au mieux : une erreur arrête le téléchargement sans bruit.

export type PrefetchState = {
  status: 'idle' | 'running' | 'done' | 'failed'
  /** Avancement de 0 à 100 pendant le téléchargement. */
  percent: number
  finishedAt: number | null
}

let state: PrefetchState = { status: 'idle', percent: 0, finishedAt: null }
const listeners = new Set<() => void>()

function set(next: PrefetchState): void {
  state = next
  for (const l of listeners) l()
}

export const prefetchStatus = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: (): PrefetchState => state,
}

const PAGE = 1000
const IN_CHUNK = 100 // identifiants par requête `in (...)` : l'URL reste courte
const HISTORY_LIMIT = 150 // entreprises qui me sont assignées dont on charge l'historique
const HISTORY_CONCURRENCY = 3
/** En dessous de cet écart, rouvrir la liste ne relance pas le téléchargement. */
const MIN_GAP_MS = 10 * 60_000

const lastRun = new Map<string, number>()
let running: Promise<void> | undefined

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Télécharge la copie locale d'un salon. Sans effet si un téléchargement est en cours, ou si le salon a été copié il y a
 * moins de dix minutes (sauf `force`).
 */
export function prefetchEventData(
  eventId: string,
  targets: readonly Target[],
  meId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (running) return running
  const last = lastRun.get(eventId)
  if (!opts.force && last !== undefined && Date.now() - last < MIN_GAP_MS) return Promise.resolve()
  running = run(eventId, targets, meId).finally(() => {
    running = undefined
  })
  return running
}

async function run(eventId: string, targets: readonly Target[], meId: string): Promise<void> {
  const meetingIds = targets.flatMap((t) => t.meetings.map((m) => m.id))
  const mine = targets.filter((t) => t.assigneeIds.includes(meId)).slice(0, HISTORY_LIMIT)
  const contactCount = targets.reduce((n, t) => n + t.contactCount, 0)
  const contactPages = Math.max(1, Math.ceil(contactCount / PAGE) + 1)
  const noteChunks = chunks(meetingIds, IN_CHUNK).length
  const total = contactPages + noteChunks + mine.length
  let done = 0
  const tick = () =>
    set({
      status: 'running',
      percent: Math.min(99, Math.round((++done / total) * 100)),
      finishedAt: null,
    })
  set({ status: 'running', percent: 0, finishedAt: null })

  try {
    // 1. Contacts : toute l'équipe, rangée par entreprise (l'ordre de saisie est celui de l'identifiant).
    const byCompany = new Map<string, TargetContact[]>()
    await forEachTeamContactPage((rows) => {
      for (const row of rows) {
        const companyId = row.company_id as string | null
        if (!companyId) continue
        const list = byCompany.get(companyId)
        const contact = toTargetContact(row)
        if (list) list.push(contact)
        else byCompany.set(companyId, [contact])
      }
      tick()
    })
    // Une entreprise sans contact a aussi sa copie : « aucun contact » plutôt qu'une erreur hors ligne.
    await writeManyCached(
      targets.map((t) => ({
        key: cacheKeys.contacts(t.companyId),
        value: byCompany.get(t.companyId) ?? [],
      })),
    )

    // 2. Notes de toutes les rencontres du salon.
    const notesByMeeting = new Map<string, MeetingNote[]>()
    for (const part of chunks(meetingIds, IN_CHUNK)) {
      const { data, error } = await supabase
        .from('notes')
        .select('id, meeting_id, body, author_id, captured_at')
        .in('meeting_id', part)
        .is('deleted_at', null)
        .order('captured_at')
      if (error) throw error
      for (const row of data ?? []) {
        const meetingId = row.meeting_id as string
        const list = notesByMeeting.get(meetingId)
        if (list) list.push(toMeetingNote(row))
        else notesByMeeting.set(meetingId, [toMeetingNote(row)])
      }
      tick()
    }
    await writeManyCached(
      meetingIds.map((id) => ({ key: cacheKeys.notes(id), value: notesByMeeting.get(id) ?? [] })),
    )

    // 3. Historique des autres salons, pour les entreprises qui me sont assignées.
    let next = 0
    const worker = async () => {
      while (next < mine.length) {
        const target = mine[next++]!
        const history = await fetchHistoryNetwork(target.companyId, eventId)
        await writeManyCached([
          { key: cacheKeys.history(target.companyId, eventId), value: history },
        ])
        tick()
      }
    }
    await Promise.all(Array.from({ length: Math.min(HISTORY_CONCURRENCY, mine.length) }, worker))

    lastRun.set(eventId, Date.now())
    set({ status: 'done', percent: 100, finishedAt: Date.now() })
  } catch {
    // Réseau coupé en route, ou refus : la copie reste partielle, on réessaiera à la prochaine ouverture.
    set({ status: 'failed', percent: state.percent, finishedAt: null })
  }
}
