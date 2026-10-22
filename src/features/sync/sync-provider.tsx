import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import {
  executeOp,
  isRetryableError,
  mergeOps,
  opKey,
  opMeetingId,
  type SyncOp,
} from '@/db/repositories/sync'
import { Outbox } from '@/lib/outbox/outbox'
import { createStorage } from '@/lib/outbox/storage'
import { SyncContext, type SyncContextValue } from './use-sync'

/** L'envoi des écritures hors ligne d'un utilisateur : une file par utilisateur, conservée sur l'appareil. */
export function SyncProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const outbox = useMemo(
    () =>
      new Outbox<SyncOp>({
        storage: createStorage<SyncOp>(`fair-outbox:${userId}`),
        execute: executeOp,
        isRetryable: isRetryableError,
      }),
    [userId],
  )
  const snapshot = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot)

  useEffect(() => {
    void outbox.start()
    const poke = () => void outbox.flush()
    const onVisible = () => {
      if (!document.hidden) poke()
    }
    window.addEventListener('online', poke)
    document.addEventListener('visibilitychange', onVisible)
    // Filet de sécurité : `online` n'est pas toujours déclenché (Wi-Fi de salon sans accès réel).
    const interval = window.setInterval(() => {
      if (outbox.getSnapshot().pending > 0) poke()
    }, 15_000)
    return () => {
      window.removeEventListener('online', poke)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
      outbox.stop()
    }
  }, [outbox])

  // Quitter la page avec des modifications en attente : on prévient (là où le navigateur le permet).
  useEffect(() => {
    if (snapshot.pending === 0) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [snapshot.pending])

  const enqueue = useCallback(
    (op: SyncOp) => outbox.enqueue(op, { key: opKey(op), merge: mergeOps }),
    [outbox],
  )
  const cancelUnsentMeeting = useCallback(
    (meetingId: string) => {
      const created = outbox.hasUnsent(
        (e) => e.payload.type === 'meeting.upsert' && e.payload.input.id === meetingId,
      )
      if (!created) return false
      outbox.removeWhere((e) => opMeetingId(e.payload) === meetingId)
      return true
    },
    [outbox],
  )
  const value = useMemo<SyncContextValue>(
    () => ({
      snapshot,
      getSnapshot: outbox.getSnapshot,
      pendingOps: () => outbox.pendingPayloads(),
      enqueue,
      cancelUnsentMeeting,
      flush: () => void outbox.flush(),
      retryFailed: () => outbox.retryFailed(),
      discardFailed: () => outbox.discardFailed(),
    }),
    [snapshot, outbox, enqueue, cancelUnsentMeeting],
  )
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
