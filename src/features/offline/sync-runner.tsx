import { useEffect } from 'react'
import { startSync } from '@/sync/manager'

/** Lance la synchronisation en arrière-plan tant que l'utilisateur est connecté, quelle que soit la page. */
export function SyncRunner() {
  useEffect(() => startSync(), [])
  return null
}
