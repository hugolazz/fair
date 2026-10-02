import type { Table } from 'dexie'
import { db, type OutboxOp, type Row, type SyncTableName } from './db'
import { TABLES } from './tables'

// Écriture « local d'abord » : la ligne est modifiée dans IndexedDB ET une opération est ajoutée à
// l'outbox dans la MÊME transaction. Rien n'attend le réseau, rien ne se perd si l'onglet est fermé.

type AnyTable = Table<Row, unknown>

const table = (name: SyncTableName) => (db as unknown as Record<string, AnyTable>)[name]!

/** Écouteurs notifiés après chaque écriture locale (le gestionnaire de sync s'en sert pour envoyer vite). */
const listeners = new Set<() => void>()
export const onLocalWrite = (fn: () => void) => {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
const notify = () => listeners.forEach((fn) => fn())

export function keyOf(name: SyncTableName, row: Row): Record<string, string> {
  return Object.fromEntries(TABLES[name].pk.map((c) => [c, String(row[c])]))
}
export const rowKeyOf = (name: SyncTableName, key: Record<string, string>) =>
  `${name}:${TABLES[name].pk.map((c) => key[c]).join('|')}`
export const dexieKey = (name: SyncTableName, key: Record<string, string>) => {
  const parts = TABLES[name].pk.map((c) => key[c]!)
  return parts.length === 1 ? parts[0]! : parts
}

/** Dernière opération « ouverte » (non verrouillée, non refusée) d'une ligne. */
async function openOp(rowKey: string): Promise<OutboxOp | undefined> {
  const ops = await db.outbox.where('rowKey').equals(rowKey).toArray()
  return ops.reverse().find((o) => !o.locked && !o.failed)
}

const newOpId = () => crypto.randomUUID()

/** Crée une ligne. `row` doit contenir toutes les colonnes obligatoires et un identifiant généré côté client. */
export async function localInsert(name: SyncTableName, row: Row): Promise<void> {
  const key = keyOf(name, row)
  await db.transaction('rw', [table(name), db.outbox], async () => {
    await table(name).put(row)
    await db.outbox.add({
      id: newOpId(),
      table: name,
      key,
      rowKey: rowKeyOf(name, key),
      kind: 'insert',
      payload: { ...row },
      createdAt: Date.now(),
      attempts: 0,
    })
  })
  notify()
}

/** Horloge de l'appareil, injectable pour les tests (heure de modification des champs). */
let clock: () => Date = () => new Date()
export const setClock = (fn: () => Date) => {
  clock = fn
}

/** Tables résolues « dernier écrit gagne » champ par champ (heure de chaque champ conservée). */
const LWW_TABLES = new Set<SyncTableName>(['meetings'])

/**
 * Modifie des colonnes ; les modifications successives d'une même ligne sont fusionnées dans l'outbox.
 * Pour les tables « dernier écrit gagne », on mémorise l'heure de chaque champ modifié : le serveur ne
 * garde que l'écriture la plus récente de chaque champ, quel que soit l'ordre d'arrivée.
 */
export async function localUpdate(
  name: SyncTableName,
  key: Record<string, string>,
  patch: Row,
): Promise<void> {
  const rowKey = rowKeyOf(name, key)
  const lww = LWW_TABLES.has(name)
  const at = clock().toISOString()
  const edited = lww ? Object.fromEntries(Object.keys(patch).map((c) => [c, at])) : undefined
  await db.transaction('rw', [table(name), db.outbox], async () => {
    const current = await table(name).get(dexieKey(name, key))
    if (!current) return
    const times = lww
      ? {
          field_updated_at: { ...((current.field_updated_at as Row | undefined) ?? {}), ...edited },
        }
      : {}
    await table(name).put({ ...current, ...patch, ...times })
    const open = await openOp(rowKey)
    if (open && open.kind === 'insert') {
      // Pas encore parti : la ligne complète porte déjà ces modifications (et leurs heures).
      await db.outbox.update(open.seq!, { payload: { ...open.payload, ...patch, ...times } })
    } else if (open && open.kind === 'update') {
      await db.outbox.update(open.seq!, {
        payload: { ...open.payload, ...patch },
        ...(lww ? { edited: { ...open.edited, ...edited } } : {}),
      })
    } else {
      await db.outbox.add({
        id: newOpId(),
        table: name,
        key,
        rowKey,
        kind: 'update',
        payload: { ...patch },
        ...(lww ? { edited } : {}),
        createdAt: Date.now(),
        attempts: 0,
      })
    }
  })
  notify()
}
/** Suppression physique (taggings). Si la ligne n'est jamais partie au serveur, tout s'annule sans rien envoyer. */
export async function localDelete(name: SyncTableName, key: Record<string, string>): Promise<void> {
  const rowKey = rowKeyOf(name, key)
  await db.transaction('rw', [table(name), db.outbox], async () => {
    await table(name).delete(dexieKey(name, key))
    const ops = await db.outbox.where('rowKey').equals(rowKey).toArray()
    const unsentInsert = ops.find((o) => o.kind === 'insert' && !o.locked && !o.failed)
    if (unsentInsert) {
      await db.outbox.bulkDelete(ops.filter((o) => !o.locked).map((o) => o.seq!))
      return
    }
    await db.outbox.bulkDelete(
      ops.filter((o) => !o.locked && o.kind === 'update').map((o) => o.seq!),
    )
    await db.outbox.add({
      id: newOpId(),
      table: name,
      key,
      rowKey,
      kind: 'delete',
      payload: {},
      createdAt: Date.now(),
      attempts: 0,
    })
  })
  notify()
}

/** Suppression logique (colonne `deleted_at`) : se propage aux autres appareils via la synchronisation. */
export const localSoftDelete = (name: SyncTableName, key: Record<string, string>) =>
  localUpdate(name, key, { deleted_at: new Date().toISOString() })
