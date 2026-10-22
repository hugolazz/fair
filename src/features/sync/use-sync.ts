import { createContext, useContext } from 'react'
import type { SyncOp } from '@/db/repositories/sync'
import type { OutboxSnapshot } from '@/lib/outbox/outbox'

export type SyncContextValue = {
  snapshot: OutboxSnapshot
  /** Lit l'état courant (pas celui du dernier rendu) : pour savoir, au moment d'agir, s'il reste des envois en attente. */
  getSnapshot: () => OutboxSnapshot
  /** Les modifications pas encore envoyées, dans l'ordre. */
  pendingOps: () => SyncOp[]
  /** Garde la modification sur l'appareil puis l'envoie dès que le réseau le permet. */
  enqueue: (op: SyncOp) => void
  /**
   * Une rencontre créée puis supprimée avant que rien ne soit parti n'a jamais existé côté serveur : on retire tout ce qui
   * la concerne de la file. Renvoie `true` si c'était le cas (il n'y a alors rien à envoyer).
   */
  cancelUnsentMeeting: (meetingId: string) => boolean
  /** Tente un envoi tout de suite. */
  flush: () => void
  retryFailed: () => void
  discardFailed: () => void
}

export const SyncContext = createContext<SyncContextValue | null>(null)

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync doit être utilisé dans <SyncProvider>')
  return ctx
}
