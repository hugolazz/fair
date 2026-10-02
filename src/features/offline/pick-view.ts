export type ViewKey = 'ok' | 'offline' | 'syncing' | 'pending' | 'error' | 'conflicts'

/** État affiché, par ordre de gravité : conflits > hors-ligne > erreur > synchronisation > en attente > à jour. */
export function pickView(o: { phase: string; pending: number; conflicts: number }): ViewKey {
  if (o.conflicts > 0) return 'conflicts'
  if (o.phase === 'offline') return 'offline'
  if (o.phase === 'error') return 'error'
  if (o.phase === 'syncing') return 'syncing'
  if (o.pending > 0) return 'pending'
  return 'ok'
}
