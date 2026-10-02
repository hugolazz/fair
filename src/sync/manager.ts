import { onLocalWrite } from '@/db/local/write'
import { createEngine, type Engine } from './engine'
import { setSyncStatus } from './status'
import { supabaseRemote } from './supabase-remote'

const INTERVAL_MS = 20_000
const WRITE_DEBOUNCE_MS = 700

let engine: Engine | undefined
const getEngine = () =>
  (engine ??= createEngine({
    remote: supabaseRemote,
    isOnline: () => navigator.onLine,
    onStatus: setSyncStatus,
  }))

/**
 * Démarre la synchronisation automatique d'un salon : au lancement, au retour du réseau, au retour au premier
 * plan, toutes les 20 s, et peu après chaque écriture locale (envoi seul, pour rester léger).
 * L'iOS Safari n'a pas de Background Sync : on ne dépend pas du service worker. Retourne la fonction d'arrêt.
 */
export function startSync(eventId: string): () => void {
  const e = getEngine()
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const full = () => void e.sync(eventId)
  const pushSoon = () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      if (stopped || !navigator.onLine) return
      const res = await e.push()
      if (res.stopped) setSyncStatus({ phase: 'error' })
    }, WRITE_DEBOUNCE_MS)
  }
  const onVisible = () => document.visibilityState === 'visible' && full()
  const goOffline = () => setSyncStatus({ phase: 'offline' })

  void e.recover().then(full)
  const interval = setInterval(full, INTERVAL_MS)
  window.addEventListener('online', full)
  window.addEventListener('offline', goOffline)
  document.addEventListener('visibilitychange', onVisible)
  const offWrite = onLocalWrite(pushSoon)
  if (!navigator.onLine) goOffline()

  return () => {
    stopped = true
    clearTimeout(timer)
    clearInterval(interval)
    window.removeEventListener('online', full)
    window.removeEventListener('offline', goOffline)
    document.removeEventListener('visibilitychange', onVisible)
    offWrite()
  }
}

/** « Forcer la sync » : redonne leur chance aux opérations refusées puis lance un cycle complet. */
export async function forceSync(eventId: string): Promise<void> {
  const e = getEngine()
  await e.retryFailed()
  await e.sync(eventId)
}
