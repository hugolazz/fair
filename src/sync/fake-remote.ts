import type { Row, SyncTableName } from '@/db/local/db'
import { TABLES } from '@/db/local/tables'
import { SyncError, type PushOp, type Remote } from './types'

/**
 * Faux serveur en mémoire (tests) : numérote chaque écriture comme le trigger `touch_row`
 * (`server_seq` global) et peut simuler une coupure réseau ou un refus.
 */
export class FakeRemote implements Remote {
  tables = new Map<SyncTableName, Row[]>()
  uploads = new Map<string, Blob>()
  pushLog: PushOp[] = []
  seq = 0
  /** `true` : toute requête échoue comme une coupure réseau. */
  offline = false
  /** Refus définitif de certaines opérations (RLS, contrainte…). */
  reject: (op: PushOp) => string | null = () => null

  private rows(table: SyncTableName) {
    if (!this.tables.has(table)) this.tables.set(table, [])
    return this.tables.get(table)!
  }
  private find(table: SyncTableName, key: Record<string, string>) {
    return this.rows(table).find((r) => Object.entries(key).every(([c, v]) => String(r[c]) === v))
  }
  private guard() {
    if (this.offline) throw new SyncError('Failed to fetch', true)
  }

  /** Écrit directement côté serveur (autre appareil / autre utilisateur). */
  serverWrite(table: SyncTableName, row: Row) {
    const key = Object.fromEntries(TABLES[table].pk.map((c) => [c, String(row[c])]))
    const existing = this.find(table, key)
    const next = { ...(existing ?? {}), ...row, server_seq: ++this.seq }
    if (existing) Object.assign(existing, next)
    else this.rows(table).push(next)
  }

  async pull({ table, eventId, sinceSeq, limit }: Parameters<Remote['pull']>[0]) {
    this.guard()
    return this.rows(table)
      .filter(
        (r) =>
          Number(r.server_seq) > sinceSeq &&
          (!eventId || TABLES[table].scope !== 'event' || r.event_id === eventId),
      )
      .sort((a, b) => Number(a.server_seq) - Number(b.server_seq))
      .slice(0, limit)
      .map((r) => ({ ...r }))
  }

  async pullAll(table: SyncTableName) {
    this.guard()
    return this.rows(table).map((r) => ({ ...r }))
  }

  async push(op: PushOp) {
    this.guard()
    this.pushLog.push(op)
    const refusal = this.reject(op)
    if (refusal) throw new SyncError(refusal, false)
    if (op.kind === 'insert') this.serverWrite(op.table, op.payload)
    else if (op.kind === 'update') {
      if (this.find(op.table, op.key)) this.serverWrite(op.table, { ...op.key, ...op.payload })
    } else {
      const list = this.rows(op.table)
      const i = list.findIndex((r) => Object.entries(op.key).every(([c, v]) => String(r[c]) === v))
      if (i >= 0) list.splice(i, 1)
    }
  }

  async upload(path: string, blob: Blob) {
    this.guard()
    this.uploads.set(path, blob)
  }
}
