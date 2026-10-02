import type { Row, SyncTableName } from '@/db/local/db'
import { TABLES } from '@/db/local/tables'
import { SyncError, type PushOp, type PushResult, type Remote } from './types'

const MEETING_FIELDS = [
  'status',
  'interest',
  'need',
  'budget',
  'timing',
  'decision_maker',
  'next_step',
  'temperature',
  'outcome',
  'planned_at',
  'planned_duration_min',
  'reminder_minutes',
  'contact_id',
  'deleted_at',
]

/**
 * Faux serveur en mémoire (tests). Reproduit ce que fait la base : numérotation `server_seq` à chaque
 * écriture (trigger `touch_row`), `patch_meeting` (dernier écrit gagne par champ, heure d'édition bornée à
 * « maintenant ») et `patch_note` (compare-and-swap). Partagé entre plusieurs « appareils ».
 */
export class FakeServer {
  tables = new Map<SyncTableName, Row[]>()
  uploads = new Map<string, Blob>()
  seq = 0
  /** Horloge du serveur (injectable). */
  now: () => number = () => Date.now()

  rows(table: SyncTableName) {
    if (!this.tables.has(table)) this.tables.set(table, [])
    return this.tables.get(table)!
  }
  find(table: SyncTableName, key: Record<string, string>) {
    return this.rows(table).find((r) => Object.entries(key).every(([c, v]) => String(r[c]) === v))
  }

  /** Écriture directe côté serveur (autre utilisateur, autre appareil déjà synchronisé). */
  write(table: SyncTableName, row: Row): number {
    const key = Object.fromEntries(TABLES[table].pk.map((c) => [c, String(row[c])]))
    const existing = this.find(table, key)
    const seq = ++this.seq
    if (existing) Object.assign(existing, row, { server_seq: seq })
    else this.rows(table).push({ ...row, server_seq: seq })
    return seq
  }

  apply(op: PushOp): PushResult {
    const { table, key, payload } = op
    if (op.kind === 'insert') return { serverSeq: this.write(table, payload) }
    if (op.kind === 'delete') {
      const list = this.rows(table)
      const i = list.findIndex((r) => Object.entries(key).every(([c, v]) => String(r[c]) === v))
      if (i >= 0) list.splice(i, 1)
      return {}
    }
    const row = this.find(table, key)
    if (!row) return {}

    if (table === 'meetings') {
      const fu = { ...((row.field_updated_at as Record<string, string>) ?? {}) }
      const applied: Row = {}
      for (const f of MEETING_FIELDS) {
        if (!(f in payload)) continue
        const edited = Math.min(
          Date.parse(op.edited?.[f] ?? new Date(this.now()).toISOString()),
          this.now(),
        )
        const known = fu[f] ? Date.parse(fu[f]) : undefined
        if (known === undefined || edited >= known) {
          applied[f] = payload[f]
          fu[f] = new Date(edited).toISOString()
        }
      }
      return { serverSeq: this.write(table, { ...key, ...applied, field_updated_at: fu }) }
    }

    if (table === 'notes' && typeof payload.body === 'string' && op.baseSeq !== undefined) {
      if (row.body === payload.body) return { serverSeq: Number(row.server_seq) }
      if (Number(row.server_seq) !== op.baseSeq) {
        return { conflict: { serverBody: String(row.body), serverSeq: Number(row.server_seq) } }
      }
    }
    return { serverSeq: this.write(table, { ...key, ...payload }) }
  }
}

/** Vue d'UN appareil sur le faux serveur : sa propre connexion (coupée ou non), son journal d'envois. */
export class FakeRemote implements Remote {
  /** `true` : toute requête échoue comme une coupure réseau. */
  offline = false
  pushLog: PushOp[] = []
  /** 	rue : l'envoi des fichiers échoue (réseau instable) alors que le reste passe. */
  uploadFails = false
  /** Coupure réseau en plein envoi : après N envois réussis, la connexion tombe. */
  pushesLeft = Infinity
  /** Refus définitif de certaines opérations (RLS, contrainte…). */
  reject: (op: PushOp) => string | null = () => null

  constructor(public server = new FakeServer()) {}

  get tables() {
    return this.server.tables
  }
  get uploads() {
    return this.server.uploads
  }
  get seq() {
    return this.server.seq
  }
  serverWrite(table: SyncTableName, row: Row) {
    return this.server.write(table, row)
  }

  private guard() {
    if (this.offline) throw new SyncError('Failed to fetch', true)
  }

  async pull({ table, eventId, sinceSeq, limit }: Parameters<Remote['pull']>[0]) {
    this.guard()
    return this.server
      .rows(table)
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
    return this.server.rows(table).map((r) => ({ ...r }))
  }

  async push(op: PushOp): Promise<PushResult> {
    if (this.pushesLeft === 0) this.offline = true
    this.guard()
    this.pushesLeft--
    this.pushLog.push(op)
    const refusal = this.reject(op)
    if (refusal) throw new SyncError(refusal, false)
    return this.server.apply(op)
  }

  async upload(path: string, blob: Blob) {
    this.guard()
    if (this.uploadFails) throw new SyncError('Failed to fetch (upload)', true)
    this.server.uploads.set(path, blob)
  }

  async count(table: SyncTableName, eventId?: string) {
    this.guard()
    return this.server
      .rows(table)
      .filter((r) => !eventId || TABLES[table].scope !== 'event' || r.event_id === eventId).length
  }
}
