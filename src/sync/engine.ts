import type { Table } from 'dexie'
import { db, type OutboxOp, type Row, type SyncTableName } from '@/db/local/db'
import { PULL_ORDER, TABLES } from '@/db/local/tables'
import { rowKeyOf } from '@/db/local/write'
import { SyncError, type Remote, type SyncStatus } from './types'

const PAGE = 1000

type AnyTable = Table<Row, unknown>
const tableOf = (name: SyncTableName) => (db as unknown as Record<string, AnyTable>)[name]!

export type EngineOptions = {
  remote: Remote
  /** `false` : on n'essaie même pas (hors-ligne déclaré par le navigateur). */
  isOnline: () => boolean
  onStatus?: (patch: Partial<SyncStatus>) => void
}

export type PushResult = { sent: number; failed: number; stopped: boolean }

const cursorKey = (table: SyncTableName, eventId?: string) =>
  `cursor:${table}${eventId ? `:${eventId}` : ''}`

const extOf = (mime: string | null | undefined) =>
  mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'

/**
 * Moteur de synchronisation local-first.
 * - `push` : envoie l'outbox dans l'ordre de création (les parents précèdent les enfants), idempotent ;
 *   une erreur réseau arrête l'envoi (on réessaiera), un refus du serveur met l'opération en quarantaine.
 * - `pull` : lit les changements via `server_seq` (aucune horloge client) ; n'écrase jamais une ligne
 *   qui a une modification locale en attente.
 */
export function createEngine({ remote, isOnline, onStatus }: EngineOptions) {
  let running: Promise<void> | null = null

  /** Au démarrage : une opération restée « en cours » (onglet fermé en plein envoi) redevient envoyable. */
  async function recover() {
    await db.outbox.toCollection().modify((op) => {
      delete op.locked
    })
  }

  async function pushOne(op: OutboxOp): Promise<void> {
    let payload = op.payload
    // Photo : le fichier part dans le stockage AVANT la ligne qui le décrit.
    if (op.table === 'attachments' && op.kind === 'insert' && payload.status === 'pending') {
      const blob = await db.blobs.get(String(payload.id))
      if (blob) {
        const path = `${payload.team_id}/${payload.id}.${extOf(blob.mime)}`
        await remote.upload(path, blob.blob, blob.mime)
        payload = { ...payload, storage_path: path, status: 'uploaded' }
      }
    }
    await remote.push({ table: op.table, kind: op.kind, key: op.key, payload })
    if (op.table === 'attachments' && op.kind === 'insert' && payload !== op.payload) {
      await db.attachments.update(String(payload.id), {
        storage_path: payload.storage_path as string,
        status: 'uploaded',
      })
    }
  }

  async function push(): Promise<PushResult> {
    const result: PushResult = { sent: 0, failed: 0, stopped: false }
    if (!isOnline()) return { ...result, stopped: true }
    for (;;) {
      const op = (await db.outbox.orderBy('seq').toArray()).find((o) => !o.failed)
      if (!op) return result
      await db.outbox.update(op.seq!, { locked: true })
      try {
        await pushOne(op)
        await db.outbox.delete(op.seq!)
        result.sent++
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

  async function applyRows(name: SyncTableName, rows: Row[], pending: Set<string>) {
    const pk = TABLES[name].pk
    const keep = rows.filter(
      (r) => !pending.has(rowKeyOf(name, Object.fromEntries(pk.map((c) => [c, String(r[c])])))),
    )
    if (keep.length) await tableOf(name).bulkPut(keep)
  }

  async function pullTable(name: SyncTableName, eventId?: string) {
    const cfg = TABLES[name]
    if (cfg.scope === 'full') {
      const rows = await remote.pullAll(name)
      const pending = await pendingRowKeys()
      // Les lignes absentes du serveur ont été supprimées (taggings) : on remplace, sauf modifications locales en attente.
      const local = await tableOf(name).toArray()
      const remoteKeys = new Set(
        rows.map((r) => rowKeyOf(name, Object.fromEntries(cfg.pk.map((c) => [c, String(r[c])])))),
      )
      const stale = local.filter((r) => {
        const k = rowKeyOf(name, Object.fromEntries(cfg.pk.map((c) => [c, String(r[c])])))
        return !remoteKeys.has(k) && !pending.has(k)
      })
      for (const r of stale)
        await tableOf(name).delete(
          cfg.pk.length === 1 ? (r[cfg.pk[0]!] as string) : cfg.pk.map((c) => r[c]),
        )
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

  /** Lit les changements du serveur : tables d'équipe, puis celles du salon `eventId`. */
  async function pull(eventId?: string) {
    if (!isOnline()) return
    for (const name of PULL_ORDER) {
      if (TABLES[name].scope === 'event' && !eventId) continue
      await pullTable(name, eventId)
    }
  }

  /** Envoi puis lecture. Un seul cycle à la fois : un appel pendant un cycle attend le même résultat. */
  function sync(eventId?: string): Promise<void> {
    if (running) return running
    running = (async () => {
      if (!isOnline()) {
        onStatus?.({ phase: 'offline' })
        return
      }
      onStatus?.({ phase: 'syncing' })
      try {
        const pushed = await push()
        if (pushed.stopped) {
          onStatus?.({ phase: isOnline() ? 'error' : 'offline', lastError: 'push' })
          return
        }
        await pull(eventId)
        onStatus?.({ phase: 'idle', lastSyncAt: Date.now(), lastError: null })
      } catch (e) {
        onStatus?.({
          phase: isOnline() ? 'error' : 'offline',
          lastError: e instanceof Error ? e.message : String(e),
        })
      } finally {
        running = null
      }
    })()
    return running
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
