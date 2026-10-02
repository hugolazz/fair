import { useLiveQuery } from 'dexie-react-hooks'
import { db, type LocalConflict } from '../local/db'
import { localSoftDelete, localUpdate } from '../local/write'

/** Conflits de notes encore à examiner. */
export function useOpenConflicts(): LocalConflict[] {
  return useLiveQuery(
    () => db.conflicts.where('status').equals('open').toArray(),
    [],
    [] as LocalConflict[],
  )
}

export type ConflictChoice = 'both' | 'mine' | 'theirs'

/**
 * Résout un conflit de note :
 * - `both`   : on garde les deux notes (rien d'autre à faire) ;
 * - `mine`   : la note d'origine prend NOTRE texte, la copie disparaît ;
 * - `theirs` : on garde la version de l'autre appareil, notre copie disparaît.
 */
export async function resolveConflict(id: string, choice: ConflictChoice): Promise<void> {
  const c = await db.conflicts.get(id)
  if (!c || c.status === 'resolved') return
  if (choice === 'mine') {
    await localUpdate('notes', { id: c.rowId }, { body: c.mine })
    await localSoftDelete('notes', { id: c.copyId })
  } else if (choice === 'theirs') {
    await localSoftDelete('notes', { id: c.copyId })
  }
  await db.conflicts.update(id, { status: 'resolved' })
}
