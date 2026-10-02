import type { Table } from 'dexie'
import { db, type OutboxOp, type Row, type SyncTableName } from '@/db/local/db'
import { PULL_ORDER, TABLES } from '@/db/local/tables'
import { dexieKey, localInsert, rowKeyOf } from '@/db/local/write'
import { newId } from '@/lib/ids'
import {
  SyncError,
  type PushResult as RemotePushResult,
  type Remote,
  type SyncStatus,
} from './types'

const PAGE = 1000

type AnyTable = Table<Row, unknown>
const tableOf = (name: SyncTableName) => (db as unknown as Record<string, AnyTable>)[name]!

export type EngineOptions = {
  remote: Remote
  /** `false` : on n'essaie même pas (hors-ligne déclaré par le navigateur). */
  isOnline: () => boolean
  onStatus?: (patch: Partial<SyncStatus>) => void
}

export type PushResult = { sent: number; failed: number; conflicts: number; stopped: boolean }
export type PullProgress = (table: SyncTableName, done: number, total: number) => void

const cursorKey = (table: SyncTableName, eventId?: string) =>
  `cursor:${table}${eventId ? `:${eventId}` : ''}`
const extOf = (mime: string | null | undefined) =>
  mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
const asIds = (ids?: string | string[]) =>
  ids === undefined ? [] : Array.isArray(ids) ? ids : [ids]

/**
 * Moteur de synchronisation local-first (voir docs/sync.md).
 * - `push` : envoie l'outbox dans l'ordre de création (parents avant enfants), idempotent. Les photos partent
 *   en dernier : un envoi lent ne retarde jamais les notes. Erreur réseau = arrêt et nouvel essai ; refus du
 *   serveur = quarantaine ; modification concurrente d'une note = les deux versions sont conservées.
 * - `pull` : lit les changements via `server_seq` (aucune horloge dans le curseur) et n'écrase jamais une
 *   ligne qui a une modification locale en attente.
 */
export function createEngine({ remote, isOnline, onStatus }: EngineOptions) {
  let running: Promise<void> | null = null

  /** Au démarrage : une opération restée « en cours » (onglet fermé en plein envoi) redevient envoyable. */
  async function recover() {
    await db.outbox.toCollection().modify((op) => {
      delete op.locked
    })
  }

  /** Photo : le fichier part dans le stockage AVANT la ligne qui le décrit. */
  async function uploadIfNeeded(op: OutboxOp): Promise<Row> {
    const payload = op.payload
    if (op.table === 'attachments' && op.kind === 'insert' && payload.status === 'pending') {
      const blob = await db.blobs.get(String(payload.id))
      if (blob) {
        const path = `${payload.team_id}/${payload.id}.${extOf(blob.mime)}`
        await remote.upload(path, blob.blob, blob.mime)
        return { ...payload, storage_path: path, status: 'uploaded' }
      }
    }
    return payload
  }

  /** Les deux versions d'une note modifiée en parallèle sont conservées ; l'utilisateur peut trancher. */
  async function keepBothVersions(op: OutboxOp, serverBody: string, serverSeq: number) {
    const local = await db.notes.get(String(op.key.id))
    const mine = String(op.payload.body)
    const copyId = newId()
    if (local) {
      await localInsert('notes', {
        id: copyId,
        team_id: local.team_id,
        meeting_id: local.meeting_id,
        event_company_id: local.event_company_id,
        contact_id: local.contact_id ?? null,
        author_id: local.author_id,
        body: mine,
        source: local.source,
        captured_at: new Date().toISOString(),
        deleted_at: null,
      })
      // L'original reprend la version du serveur ; notre texte vit désormais dans la copie.
      await db.notes.update(local.id, { body: serverBody, server_seq: serverSeq })
    }
    await db.conflicts.add({
      id: newId(),
      table: 'notes',
      rowId: String(op.key.id),
      copyId,
      mine,
      theirs: serverBody,
      createdAt: new Date().toISOString(),
      status: 'open',
    })
  }

  async function pushOne(op: OutboxOp): Promise<{ conflict: boolean }> {
    const payload = await uploadIfNeeded(op)
    let baseSeq: number | undefined
    if (op.table === 'notes' && op.kind === 'update' && typeof payload.body === 'string') {
      const local = await db.notes.get(String(op.key.id))
      baseSeq = local?.server_seq === undefined ? undefined : Number(local.server_seq)
    }
    const res: RemotePushResult = await remote.push({
      table: op.table,
      kind: op.kind,
      key: op.key,
      payload,
      ...(op.edited ? { edited: op.edited } : {}),
      ...(baseSeq !== undefined ? { baseSeq } : {}),
    })
    if (res.conflict) {
      await keepBothVersions(op, res.conflict.serverBody, res.conflict.serverSeq)
      return { conflict: true }
    }
    if (payload !== op.payload) {
      await db.attachments.update(String(payload.id), {
        storage_path: payload.storage_path as string,
        status: 'uploaded',
      })
    }
    // Mémorise la version serveur obtenue : la prochaine modification partira de la bonne base.
    if (res.serverSeq !== undefined && op.kind !== 'delete' && TABLES[op.table].scope !== 'full') {
      await tableOf(op.table).update(dexieKey(op.table, op.key), { server_seq: res.serverSeq })
    }
    return { conflict: false }
  }

  /** Prochaine opération : tout sauf les photos d'abord, puis les photos (dans l'ordre de création). */
  function pickNext(ops: OutboxOp[]): OutboxOp | undefined {
    const open = ops.filter((o) => !o.failed)
    return open.find((o) => !(o.table === 'attachments' && o.kind === 'insert')) ?? open[0]
  }

  async function push(): Promise<PushResult> {
    const result: PushResult = { sent: 0, failed: 0, conflicts: 0, stopped: false }
    if (!isOnline()) return { ...result, stopped: true }
    for (;;) {
      const op = pickNext(await db.outbox.orderBy('seq').toArray())
      if (!op) return result
      await db.outbox.update(op.seq!, { locked: true })
      try {
        const { conflict } = await pushOne(op)
        await db.outbox.delete(op.seq!)
        result.sent++
        if (conflict) result.conflicts++
      } catch (e) {
        const retryable = e instanceof SyncError ? e.retryable : true
        const message = e instanceof Error ? e.message : String(e)
        if (retryable) {
          await db.outbox.update(op.seq!, {
            locked: false,
            attempts: op.attempts + 1,
            lastError: message,
          })
          return { ...result, stopped: true }
        }
        // Refus définitif : on met l'opération de côté pour ne pas bloquer les suivantes.
        await db.outbox.update(op.seq!, {
          locked: false,
          failed: true,
          attempts: op.attempts + 1,
          lastError: message,
        })
        result.failed++
      }
    }
  }

  async function pendingRowKeys(): Promise<Set<string>> {
    return new Set((await db.outbox.toArray()).map((o) => o.rowKey))
  }

  const rowKeyFor = (name: SyncTableName, r: Row) =>
    rowKeyOf(name, Object.fromEntries(TABLES[name].pk.map((c) => [c, String(r[c])])))

  async function applyRows(name: SyncTableName, rows: Row[], pending: Set<string>) {
    const keep = rows.filter((r) => !pending.has(rowKeyFor(name, r)))
    if (keep.length) await tableOf(name).bulkPut(keep)
  }

  async function pullTable(name: SyncTableName, eventId?: string) {
    const cfg = TABLES[name]
    if (cfg.scope === 'full') {
      const rows = await remote.pullAll(name)
      const pending = await pendingRowKeys()
      // Les lignes absentes du serveur ont été supprimées (taggings) : on remplace, sauf modifications locales en attente.
      const remoteKeys = new Set(rows.map((r) => rowKeyFor(name, r)))
      for (const r of await tableOf(name).toArray()) {
        const k = rowKeyFor(name, r)
        if (!remoteKeys.has(k) && !pending.has(k)) {
          await tableOf(name).delete(
            cfg.pk.length === 1 ? (r[cfg.pk[0]!] as string) : cfg.pk.map((c) => r[c]),
          )
        }
      }
      await applyRows(name, rows, pending)
      return
    }
    const key = cursorKey(name, cfg.scope === 'event' ? eventId : undefined)
    let since = ((await db.sync_state.get(key))?.value as number | undefined) ?? 0
    for (;;) {
      const rows = await remote.pull({
        table: name,
        ...(cfg.scope === 'event' && eventId ? { eventId } : {}),
        sinceSeq: since,
        limit: PAGE,
      })
      if (rows.length === 0) return
      await applyRows(name, rows, await pendingRowKeys())
      since = Math.max(since, ...rows.map((r) => Number(r.server_seq)))
      await db.sync_state.put({ key, value: since })
      if (rows.length < PAGE) return
    }
  }

  /**
   * Lit les changements du serveur : tables d'équipe, puis celles de chaque salon téléchargé.
   * Sans salon téléchargé, rien n'est lu (seuls les envois ont lieu).
   */
  async function pull(eventIds?: string | string[], onProgress?: PullProgress) {
    const events = asIds(eventIds)
    if (!isOnline() || events.length === 0) return
    const steps = PULL_ORDER.flatMap((name): [SyncTableName, string | undefined][] =>
      TABLES[name].scope === 'event'
        ? events.map((e): [SyncTableName, string] => [name, e])
        : [[name, undefined]],
    )
    let done = 0
    for (const [name, eventId] of steps) {
      await pullTable(name, eventId)
      onProgress?.(name, ++done, steps.length)
    }
  }

  /** Envoi puis lecture. Un seul cycle à la fois : un appel pendant un cycle attend le même résultat. */
  function sync(eventIds?: string | string[]): Promise<void> {
    if (running) return running
    const cycle = (async () => {
      try {
        if (!isOnline()) {
          onStatus?.({ phase: 'offline' })
          return
        }
        onStatus?.({ phase: 'syncing' })
        const pushed = await push()
        if (pushed.stopped) {
          onStatus?.({ phase: isOnline() ? 'error' : 'offline', lastError: 'push' })
          return
        }
        await pull(eventIds)
        onStatus?.({ phase: 'idle', lastSyncAt: Date.now(), lastError: null })
      } catch (e) {
        onStatus?.({
          phase: isOnline() ? 'error' : 'offline',
          lastError: e instanceof Error ? e.message : String(e),
        })
      }
    })()
    // Le verrou n'est posé qu'APRÈS la création de la promesse : un cycle qui se termine tout de suite
    // (hors-ligne) ne doit pas laisser un verrou périmé.
    running = cycle
    void cycle.finally(() => {
      if (running === cycle) running = null
    })
    return cycle
  }

  /** « Forcer la sync » : redonne leur chance aux opérations mises en quarantaine. */
  async function retryFailed() {
    await db.outbox.toCollection().modify((op) => {
      delete op.failed
    })
  }

  return { push, pull, sync, recover, retryFailed }
}

export type Engine = ReturnType<typeof createEngine>
