import { onLocalWrite } from '@/db/local/write'
import { createEngine, type Engine, type PullProgress } from './engine'
import {
  estimateDownload,
  getPin,
  listPinnedIds,
  setPin,
  touchPins,
  type DownloadEstimate,
} from './offline-events'
import { getSyncStatus, setSyncStatus } from './status'
import { supabaseRemote } from './supabase-remote'

const INTERVAL_MS = 20_000
const MAX_BACKOFF_MS = 60_000
const WRITE_DEBOUNCE_MS = 700

let engine: Engine | undefined
const getEngine = () =>
  (engine ??= createEngine({
    remote: supabaseRemote,
    isOnline: () => navigator.onLine,
    onStatus: setSyncStatus,
  }))

let failures = 0

/** Un cycle complet : envoi des modifications, puis lecture des salons téléchargés. */
async function cycle() {
  const ids = await listPinnedIds()
  await getEngine().sync(ids)
  const { phase } = getSyncStatus()
  if (phase === 'idle') {
    failures = 0
    await touchPins(ids)
  } else if (phase === 'error') failures++
}

/** Délai avant le prochain essai : 20 s en temps normal, puis 4 s, 8 s, 16 s… (max 60 s) après des échecs. */
export const nextDelay = (failureCount: number) =>
  failureCount === 0 ? INTERVAL_MS : Math.min(MAX_BACKOFF_MS, 2000 * 2 ** failureCount)

/**
 * Synchronisation automatique, démarrée une fois l'utilisateur connecté (quelle que soit la page) :
 * au lancement, au retour du réseau, au retour au premier plan, périodiquement (avec reprise espacée après
 * échec), et peu après chaque écriture locale (envoi seul, pour rester léger).
 * iOS Safari n'a pas de Background Sync : on ne dépend pas du service worker.
 */
export function startSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let writeTimer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      if (stopped) return
      await cycle()
      schedule()
    }, nextDelay(failures))
  }
  const now = async () => {
    if (stopped) return
    failures = 0
    await cycle()
    schedule()
  }
  const pushSoon = () => {
    clearTimeout(writeTimer)
    writeTimer = setTimeout(async () => {
      if (stopped || !navigator.onLine) return
      const res = await getEngine().push()
      if (res.stopped) setSyncStatus({ phase: 'error' })
    }, WRITE_DEBOUNCE_MS)
  }
  const onVisible = () => document.visibilityState === 'visible' && void now()
  const goOffline = () => setSyncStatus({ phase: 'offline' })

  void getEngine().recover().then(now)
  window.addEventListener('online', now)
  window.addEventListener('offline', goOffline)
  document.addEventListener('visibilitychange', onVisible)
  const offWrite = onLocalWrite(pushSoon)
  if (!navigator.onLine) goOffline()

  return () => {
    stopped = true
    clearTimeout(timer)
    clearTimeout(writeTimer)
    window.removeEventListener('online', now)
    window.removeEventListener('offline', goOffline)
    document.removeEventListener('visibilitychange', onVisible)
    offWrite()
  }
}

/** « Forcer la sync » : redonne leur chance aux opérations refusées puis lance un cycle complet. */
export async function forceSync(): Promise<void> {
  await getEngine().retryFailed()
  failures = 0
  await cycle()
}

/** Taille estimée d'un salon avant téléchargement (nécessite le réseau). */
export function estimateEvent(eventId: string): Promise<DownloadEstimate> {
  return estimateDownload(supabaseRemote, eventId)
}

/**
 * Télécharge un salon pour le terrain : lit les tables d'équipe et celles du salon, puis le marque comme
 * « téléchargé ». Il est ensuite gardé à jour à chaque synchronisation. Rejoue sans danger si interrompu.
 */
export async function downloadEvent(eventId: string, onProgress?: PullProgress): Promise<void> {
  if (!navigator.onLine) throw new Error('offline')
  const e = getEngine()
  await e.push() // d'abord nos modifications en attente
  await e.pull([eventId], onProgress)
  const now = new Date().toISOString()
  await setPin(eventId, { pinnedAt: (await getPin(eventId))?.pinnedAt ?? now, syncedAt: now })
}
