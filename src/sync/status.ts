import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import { db } from '@/db/local/db'
import type { SyncStatus } from './types'

let status: SyncStatus = { phase: 'idle', lastSyncAt: null, lastError: null }
const subscribers = new Set<() => void>()

export const getSyncStatus = () => status

export function setSyncStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  subscribers.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  subscribers.add(fn)
  return () => void subscribers.delete(fn)
}

export const useSyncStatus = () => useSyncExternalStore(subscribe, getSyncStatus, getSyncStatus)

/** Nombre de modifications locales pas encore envoyées, et de celles refusées par le serveur. */
export function usePendingCount(): { pending: number; failed: number } {
  return useLiveQuery(
    async () => {
      const ops = await db.outbox.toArray()
      return {
        pending: ops.filter((o) => !o.failed).length,
        failed: ops.filter((o) => o.failed).length,
      }
    },
    [],
    { pending: 0, failed: 0 },
  )
}
